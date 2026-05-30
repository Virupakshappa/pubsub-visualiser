using PubSubVisualiser.Api.Services.Messaging;

namespace PubSubVisualiser.Api.Services;

public sealed class Publisher
{
    private readonly IMessageBus _bus;
    private readonly Func<string> _generator;
    private int _count;

    public string Name { get; }
    public string EventName { get; }

    public Publisher(
        IMessageBus bus,
        string name,
        string eventName,
        Func<string> generator)
    {
        _bus = bus;
        Name = name;
        EventName = eventName;
        _generator = generator;
    }

    public async Task PublishAsync(CancellationToken ct = default)
    {
        var value = _generator();
        var count = Interlocked.Increment(ref _count);
        await _bus.PublishAsync(EventName, new PubSubMessage(count, value), ct);
    }
}
