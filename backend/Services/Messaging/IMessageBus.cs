namespace PubSubVisualiser.Api.Services.Messaging;

/// <summary>
/// Transport-agnostic publish/subscribe seam. The <paramref name="topic"/> is the
/// event name (e.g. "randomNumber"). Today this is backed by the in-process
/// MessagePipe bus; later adapters (Kafka, RabbitMQ, ...) implement the same shape
/// so the visualiser renders a real broker without the rest of the app changing.
/// </summary>
public interface IMessageBus
{
    /// <summary>Publish a message to a topic.</summary>
    ValueTask PublishAsync(string topic, PubSubMessage message, CancellationToken ct = default);

    /// <summary>
    /// Subscribe to a topic. Returns a disposable that cancels the subscription.
    /// Handlers receive every message published to <paramref name="topic"/>.
    /// </summary>
    IDisposable Subscribe(string topic, Func<PubSubMessage, CancellationToken, ValueTask> handler);
}
