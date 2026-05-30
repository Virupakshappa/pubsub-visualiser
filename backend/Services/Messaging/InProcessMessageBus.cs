using MessagePipe;

namespace PubSubVisualiser.Api.Services.Messaging;

/// <summary>
/// <see cref="IMessageBus"/> backed by the in-process MessagePipe bus. This is the
/// default "on-prem" transport: publishers and subscribers share the same process,
/// so there is no network, durability, or partitioning — just keyed, in-memory fan-out.
/// </summary>
public sealed class InProcessMessageBus : IMessageBus
{
    private readonly IAsyncPublisher<string, PubSubMessage> _publisher;
    private readonly IAsyncSubscriber<string, PubSubMessage> _subscriber;

    public InProcessMessageBus(
        IAsyncPublisher<string, PubSubMessage> publisher,
        IAsyncSubscriber<string, PubSubMessage> subscriber)
    {
        _publisher = publisher;
        _subscriber = subscriber;
    }

    public ValueTask PublishAsync(string topic, PubSubMessage message, CancellationToken ct = default)
        => _publisher.PublishAsync(topic, message, ct);

    public IDisposable Subscribe(string topic, Func<PubSubMessage, CancellationToken, ValueTask> handler)
        => _subscriber.Subscribe(topic, (msg, ct) => handler(msg, ct));
}
