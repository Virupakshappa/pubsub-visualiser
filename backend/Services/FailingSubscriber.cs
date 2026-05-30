using MessagePipe;

namespace PubSubVisualiser.Api.Services;

public sealed class FailingSubscriber : IHostedService, IDisposable
{
    private const double FailureRate = 0.30;
    private const int MaxAttempts = 3;

    private readonly IAsyncSubscriber<string, PubSubMessage> _subscriber;
    private readonly IAsyncPublisher<string, PubSubMessage> _publisher;
    private readonly Config _config;
    private readonly List<IDisposable> _subscriptions = new();
    private int _count;

    public string Name { get; } = "FailingSubscriber";
    public string[] EventNames { get; } =
    {
        Services.EventNames.RandomNumber,
        Services.EventNames.RandomAlphabet,
        Services.EventNames.RandomColor,
        Services.EventNames.RandomEmoji,
    };
    public string ConsumedEventName { get; } = Services.EventNames.ChaoticConsumed;

    public FailingSubscriber(
        IAsyncSubscriber<string, PubSubMessage> subscriber,
        IAsyncPublisher<string, PubSubMessage> publisher,
        Config config)
    {
        _subscriber = subscriber;
        _publisher = publisher;
        _config = config;
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

        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            if (Random.Shared.NextDouble() < FailureRate)
            {
                if (attempt == MaxAttempts)
                {
                    var failedCount = Interlocked.Increment(ref _count);
                    await _publisher.FireAsync(
                        ConsumedEventName,
                        new PubSubMessage(failedCount, incoming.Value, sourceEventName, attempt, Failed: true),
                        ct);
                    return;
                }
                await Task.Delay(80, ct);
                continue;
            }

            var count = Interlocked.Increment(ref _count);
            await _publisher.FireAsync(
                ConsumedEventName,
                new PubSubMessage(count, incoming.Value, sourceEventName, attempt, Failed: false),
                ct);
            return;
        }
    }
}
