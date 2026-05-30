using System.Diagnostics;
using PubSubVisualiser.Api.Services.Messaging;
using PubSubVisualiser.Api.Services.Observability;

namespace PubSubVisualiser.Api.Services;

public sealed class Subscriber : IHostedService, IDisposable
{
    private readonly IMessageBus _bus;
    private readonly Config _config;
    private readonly Telemetry _telemetry;
    private readonly List<IDisposable> _subscriptions = new();
    private int _count;

    public string Name { get; }
    public string[] EventNames { get; }
    public string ConsumedEventName { get; }

    public Subscriber(
        IMessageBus bus,
        Config config,
        Telemetry telemetry,
        string name,
        string[] eventNames,
        string consumedEventName)
    {
        _bus = bus;
        _config = config;
        _telemetry = telemetry;
        Name = name;
        EventNames = eventNames;
        ConsumedEventName = consumedEventName;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        foreach (var eventName in EventNames)
        {
            var captured = eventName;
            _subscriptions.Add(
                _bus.Subscribe(captured, (msg, ct) => HandleAsync(captured, msg, ct)));
        }
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        Dispose();
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        foreach (var s in _subscriptions) s.Dispose();
        _subscriptions.Clear();
    }

    private async ValueTask HandleAsync(string sourceEventName, PubSubMessage incoming, CancellationToken ct)
    {
        using var activity = Telemetry.ActivitySource.StartActivity("consume", ActivityKind.Consumer);
        activity?.SetTag("actor", Name);
        activity?.SetTag("source", sourceEventName);

        var start = Stopwatch.GetTimestamp();
        await Task.Delay(_config.SubscriberDelayMs, ct);
        var count = Interlocked.Increment(ref _count);
        await _bus.PublishAsync(
            ConsumedEventName,
            new PubSubMessage(count, incoming.Value, sourceEventName),
            ct);

        var tags = new KeyValuePair<string, object?>("actor", Name);
        _telemetry.MessagesConsumed.Add(1, tags);
        _telemetry.ProcessingDuration.Record(Stopwatch.GetElapsedTime(start).TotalMilliseconds, tags);
    }
}
