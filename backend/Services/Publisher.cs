using MessagePipe;

namespace PubSubVisualiser.Api.Services;

public sealed class Publisher
{
    private readonly IAsyncPublisher<string, PubSubMessage> _publisher;
    private readonly Func<string> _generator;
    private int _count;

    public string Name { get; }
    public string EventName { get; }

    public Publisher(
        IAsyncPublisher<string, PubSubMessage> publisher,
        string name,
        string eventName,
        Func<string> generator)
    {
        _publisher = publisher;
        Name = name;
        EventName = eventName;
        _generator = generator;
    }

    public async Task PublishAsync(CancellationToken ct = default)
    {
        var value = _generator();
        var count = Interlocked.Increment(ref _count);
        await _publisher.FireAsync(EventName, new PubSubMessage(count, value), ct);
    }
}
