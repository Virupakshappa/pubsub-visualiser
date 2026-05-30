using System.Text.Json;
using System.Threading.Channels;
using MessagePipe;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using PubSubVisualiser.Api.Services;
using PubSubVisualiser.Api.Services.Messaging;
using PubSubVisualiser.Api.Services.Observability;

var builder = WebApplication.CreateBuilder(args);

// Allowed browser origins are configurable so the Dockerized frontend (served on a
// different port) can talk to the API. Defaults cover local Vite dev + the compose frontend.
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173", "http://localhost:8080" };

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .WithOrigins(corsOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod());
});

builder.Services.AddMessagePipe();

// Message transport selection. "inprocess" (MessagePipe) is the default on-prem
// transport; future adapters (e.g. "kafka") plug in behind the same IMessageBus.
var busProvider = builder.Configuration["Bus:Provider"] ?? "inprocess";
switch (busProvider.ToLowerInvariant())
{
    case "inprocess":
        builder.Services.AddSingleton<IMessageBus, InProcessMessageBus>();
        break;
    case "kafka":
        // Real broker: the same visualiser, backed by Apache Kafka. Configure via
        // Kafka:BootstrapServers and Kafka:TopicPrefix.
        builder.Services.AddSingleton<IMessageBus, KafkaMessageBus>();
        break;
    default:
        throw new InvalidOperationException(
            $"Unknown Bus:Provider '{busProvider}'. Supported: inprocess, kafka.");
}

builder.Services.AddSingleton<Config>();
builder.Services.AddSingleton<Telemetry>();

// OpenTelemetry: custom metrics (scraped at /metrics) + ASP.NET Core / runtime metrics,
// and traces exported via OTLP when an endpoint is configured (e.g. Jaeger).
var otlpEndpoint = builder.Configuration["Otlp:Endpoint"];
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService(Telemetry.ServiceName))
    .WithMetrics(metrics => metrics
        .AddMeter(Telemetry.ServiceName)
        .AddAspNetCoreInstrumentation()
        .AddRuntimeInstrumentation()
        .AddPrometheusExporter())
    .WithTracing(tracing =>
    {
        tracing
            .AddSource(Telemetry.ServiceName)
            .AddAspNetCoreInstrumentation();
        if (!string.IsNullOrWhiteSpace(otlpEndpoint))
            tracing.AddOtlpExporter(o => o.Endpoint = new Uri(otlpEndpoint));
    });

var publisherDefs = new (string Name, string EventName, Func<string> Generate)[]
{
    ("NumberPublisher",   EventNames.RandomNumber,   RandomGenerators.Number),
    ("AlphabetPublisher", EventNames.RandomAlphabet, RandomGenerators.Alphabet),
    ("ColorPublisher",    EventNames.RandomColor,    RandomGenerators.Color),
    ("EmojiPublisher",    EventNames.RandomEmoji,    RandomGenerators.Emoji),
};

foreach (var (name, eventName, generate) in publisherDefs)
{
    builder.Services.AddSingleton(sp => new Publisher(
        sp.GetRequiredService<IMessageBus>(),
        sp.GetRequiredService<Telemetry>(),
        name, eventName, generate));
}

var subscriberDefs = new (string Name, string[] EventNames, string ConsumedEventName)[]
{
    ("NumberSubscriber",       new[] { EventNames.RandomNumber },                                                                EventNames.GotTheRandomNumber),
    ("AlphabetSubscriber",     new[] { EventNames.RandomAlphabet },                                                              EventNames.GotTheRandomAlphabet),
    ("ColorSubscriber",        new[] { EventNames.RandomColor },                                                                 EventNames.GotTheRandomColor),
    ("EmojiSubscriber",        new[] { EventNames.RandomEmoji },                                                                 EventNames.GotTheRandomEmoji),
    ("AnyEventLogger",         new[] { EventNames.RandomNumber, EventNames.RandomAlphabet, EventNames.RandomColor, EventNames.RandomEmoji }, EventNames.AnyEventLogged),
    ("AlphanumericSubscriber", new[] { EventNames.RandomNumber, EventNames.RandomAlphabet },                                     EventNames.AlphanumericConsumed),
};

foreach (var def in subscriberDefs)
{
    var captured = def;
    builder.Services.AddSingleton<IHostedService>(sp => new Subscriber(
        sp.GetRequiredService<IMessageBus>(),
        sp.GetRequiredService<Config>(),
        sp.GetRequiredService<Telemetry>(),
        captured.Name, captured.EventNames, captured.ConsumedEventName));
}

builder.Services.AddSingleton<FailingSubscriber>();
builder.Services.AddSingleton<IHostedService>(sp => sp.GetRequiredService<FailingSubscriber>());

builder.Services.AddSingleton<ChaosService>();
builder.Services.AddSingleton<IHostedService>(sp => sp.GetRequiredService<ChaosService>());

var app = builder.Build();
app.UseCors();

// Prometheus scrape target at /metrics.
app.MapPrometheusScrapingEndpoint();

var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

// /actors lists every publisher + every subscriber (including FailingSubscriber)
app.MapGet("/actors", (IEnumerable<Publisher> publishers, FailingSubscriber failing) =>
{
    var pubs = publishers
        .Select(p => new ActorInfo(p.Name, new[] { p.EventName }, IsFailing: false))
        .ToArray();
    var subs = subscriberDefs
        .Select(s => new ActorInfo(s.Name, s.EventNames, IsFailing: false))
        .Append(new ActorInfo(failing.Name, failing.EventNames, IsFailing: true))
        .ToArray();
    return Results.Json(new { publishers = pubs, subscribers = subs }, jsonOptions);
});

app.MapPost("/publishers/{name}/publish", async (
    string name,
    IEnumerable<Publisher> publishers,
    CancellationToken ct) =>
{
    var publisher = publishers.FirstOrDefault(p => p.Name == name);
    if (publisher is null) return Results.NotFound();
    await publisher.PublishAsync(ct);
    return Results.NoContent();
});

app.MapPost("/publish-all", async (
    IEnumerable<Publisher> publishers,
    CancellationToken ct) =>
{
    foreach (var publisher in publishers)
    {
        await publisher.PublishAsync(ct);
    }
    return Results.NoContent();
});

app.MapGet("/config", (Config config) =>
    Results.Json(new { subscriberDelayMs = config.SubscriberDelayMs }, jsonOptions));

app.MapPut("/config", (ConfigUpdate body, Config config) =>
{
    config.SubscriberDelayMs = body.SubscriberDelayMs;
    return Results.Json(new { subscriberDelayMs = config.SubscriberDelayMs }, jsonOptions);
});

app.MapGet("/chaos", (ChaosService chaos) =>
    Results.Json(new { running = chaos.Running, intervalMs = chaos.IntervalMs }, jsonOptions));

app.MapPost("/chaos/start", (ChaosStart body, ChaosService chaos) =>
{
    chaos.Start(body.IntervalMs);
    return Results.Json(new { running = chaos.Running, intervalMs = chaos.IntervalMs }, jsonOptions);
});

app.MapPost("/chaos/stop", (ChaosService chaos) =>
{
    chaos.Stop();
    return Results.Json(new { running = chaos.Running, intervalMs = chaos.IntervalMs }, jsonOptions);
});

// SSE routing
var sseRoutes = new (string EventName, string Side, string Actor)[]
{
    (EventNames.RandomNumber,           "publisher",  "NumberPublisher"),
    (EventNames.RandomAlphabet,         "publisher",  "AlphabetPublisher"),
    (EventNames.RandomColor,            "publisher",  "ColorPublisher"),
    (EventNames.RandomEmoji,            "publisher",  "EmojiPublisher"),
    (EventNames.GotTheRandomNumber,     "subscriber", "NumberSubscriber"),
    (EventNames.GotTheRandomAlphabet,   "subscriber", "AlphabetSubscriber"),
    (EventNames.GotTheRandomColor,      "subscriber", "ColorSubscriber"),
    (EventNames.GotTheRandomEmoji,      "subscriber", "EmojiSubscriber"),
    (EventNames.AnyEventLogged,         "subscriber", "AnyEventLogger"),
    (EventNames.AlphanumericConsumed,   "subscriber", "AlphanumericSubscriber"),
    (EventNames.ChaoticConsumed,        "subscriber", "FailingSubscriber"),
};

app.MapGet("/events", async (
    HttpContext ctx,
    IMessageBus bus,
    Telemetry telemetry,
    CancellationToken ct) =>
{
    ctx.Response.Headers.Append("Content-Type", "text/event-stream");
    ctx.Response.Headers.Append("Cache-Control", "no-cache");
    ctx.Response.Headers.Append("X-Accel-Buffering", "no");

    telemetry.SseClients.Add(1);

    var queue = Channel.CreateBounded<SseEvent>(new BoundedChannelOptions(256)
    {
        FullMode = BoundedChannelFullMode.DropOldest,
        SingleReader = true,
        SingleWriter = false
    });

    var subscriptions = new List<IDisposable>();
    foreach (var route in sseRoutes)
    {
        var captured = route;
        var d = bus.Subscribe(captured.EventName, (msg, _) =>
        {
            var displayEvent = msg.SourceEventName ?? captured.EventName;
            queue.Writer.TryWrite(new SseEvent(
                captured.Side, captured.Actor, displayEvent,
                msg.Count, msg.Value, msg.Attempt, msg.Failed));
            return ValueTask.CompletedTask;
        });
        subscriptions.Add(d);
    }

    try
    {
        await ctx.Response.Body.FlushAsync(ct);
        await foreach (var ev in queue.Reader.ReadAllAsync(ct))
        {
            var json = JsonSerializer.Serialize(ev, jsonOptions);
            await ctx.Response.WriteAsync($"data: {json}\n\n", ct);
            await ctx.Response.Body.FlushAsync(ct);
        }
    }
    catch (OperationCanceledException) { }
    finally
    {
        foreach (var s in subscriptions) s.Dispose();
        queue.Writer.TryComplete();
        telemetry.SseClients.Add(-1);
    }
});

app.Run();

internal sealed record ActorInfo(string Name, string[] EventNames, bool IsFailing);
internal sealed record SseEvent(string Side, string Actor, string EventName, int Count, string Value, int Attempt, bool Failed);
internal sealed record ConfigUpdate(int SubscriberDelayMs);
internal sealed record ChaosStart(int IntervalMs);
