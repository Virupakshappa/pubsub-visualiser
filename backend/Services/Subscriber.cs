using MessagePipe;

namespace PubSubVisualiser.Api.Services;

public sealed class Subscriber : IHostedService, IDisposable
{
    private readonly IAsyncSubscriber<string, PubSubMessage> _subscriber;
    private readonly IAsyncPublisher<string, PubSubMessage> _publisher;
    private readonly Config _config;
    private readonly List<IDisposable> _subscriptions = new();
    private int _count;

    public string Name { get; }
    public string[] EventNames { get; }
    public string ConsumedEventName { get; }

    public Subscriber(
        IAsyncSubscriber<string, PubSubMessage> subscriber,
        IAsyncPublisher<string, PubSubMessage> publisher,
        Config config,
        string name,
        string[] eventNames,
        string consumedEventName)
    {
        _subscriber = subscriber;
        _publisher = publisher;
        _config = config;
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
                _subscriber.Subscribe(captured, (msg, ct) => HandleAsync(captured, msg, ct)));
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
        await Task.Delay(_config.SubscriberDelayMs, ct);
        var count = Interlocked.Increment(ref _count);
        await _publisher.FireAsync(
            ConsumedEventName,
            new PubSubMessage(count, incoming.Value, sourceEventName),
            ct);
    }
}
