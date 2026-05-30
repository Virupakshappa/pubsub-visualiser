using MessagePipe;

namespace PubSubVisualiser.Api.Services;

public static class PublisherExtensions
{
    public static ValueTask FireAsync<TKey, TMessage>(
        this IAsyncPublisher<TKey, TMessage> publisher,
        TKey eventName,
        TMessage data,
        CancellationToken ct = default)
        where TKey : notnull
        => publisher.PublishAsync(eventName, data, ct);
}
