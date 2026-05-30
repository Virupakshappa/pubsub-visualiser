using System.Diagnostics;
using PubSubVisualiser.Api.Services.Messaging;
using PubSubVisualiser.Api.Services.Observability;

namespace PubSubVisualiser.Api.Services;

public sealed class Publisher
{
    private readonly IMessageBus _bus;
    private readonly Telemetry _telemetry;
    private readonly Func<string> _generator;
    private int _count;

    public string Name { get; }
    public string EventName { get; }

    public Publisher(
        IMessageBus bus,
        Telemetry telemetry,
        string name,
        string eventName,
        Func<string> generator)
    {
        _bus = bus;
        _telemetry = telemetry;
        Name = name;
        EventName = eventName;
        _generator = generator;
    }

    public async Task PublishAsync(CancellationToken ct = default)
    {
        using var activity = Telemetry.ActivitySource.StartActivity("publish", ActivityKind.Producer);
        activity?.SetTag("actor", Name);
        activity?.SetTag("topic", EventName);

        var value = _generator();
        var count = Interlocked.Increment(ref _count);
        await _bus.PublishAsync(EventName, new PubSubMessage(count, value), ct);

        _telemetry.MessagesPublished.Add(1,
            new KeyValuePair<string, object?>("actor", Name),
            new KeyValuePair<string, object?>("topic", EventName));
    }
}
