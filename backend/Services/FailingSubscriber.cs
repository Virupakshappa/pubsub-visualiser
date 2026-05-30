using System.Diagnostics;
using PubSubVisualiser.Api.Services.Messaging;
using PubSubVisualiser.Api.Services.Observability;

namespace PubSubVisualiser.Api.Services;

public sealed class FailingSubscriber : IHostedService, IDisposable
{
    private const double FailureRate = 0.30;
    private const int MaxAttempts = 3;

    private readonly IMessageBus _bus;
    private readonly Config _config;
    private readonly Telemetry _telemetry;
    private readonly DeadLetterStore _deadLetters;
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

    public FailingSubscriber(IMessageBus bus, Config config, Telemetry telemetry, DeadLetterStore deadLetters)
    {
        _bus = bus;
        _config = config;
        _telemetry = telemetry;
        _deadLetters = deadLetters;
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

        var tags = new KeyValuePair<string, object?>("actor", Name);
        var start = Stopwatch.GetTimestamp();
        await Task.Delay(_config.SubscriberDelayMs, ct);

        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            if (Random.Shared.NextDouble() < FailureRate)
            {
                _telemetry.MessageRetries.Add(1, tags);

                if (attempt == MaxAttempts)
                {
                    var failedCount = Interlocked.Increment(ref _count);
                    await _bus.PublishAsync(
                        ConsumedEventName,
                        new PubSubMessage(failedCount, incoming.Value, sourceEventName, attempt, Failed: true),
                        ct);

                    // Dead-letter the exhausted message: record it for replay and animate
                    // a particle from here to the DeadLetterQueue actor.
                    _deadLetters.Add(Name, sourceEventName, incoming.Value, attempt);
                    await _bus.PublishAsync(
                        Services.EventNames.DeadLetter,
                        new PubSubMessage(failedCount, incoming.Value, sourceEventName, attempt, Failed: true),
                        ct);

                    _telemetry.MessagesFailed.Add(1, tags);
                    activity?.SetStatus(ActivityStatusCode.Error, "exhausted retries");
                    return;
                }
                await Task.Delay(80, ct);
                continue;
            }

            var count = Interlocked.Increment(ref _count);
            await _bus.PublishAsync(
                ConsumedEventName,
                new PubSubMessage(count, incoming.Value, sourceEventName, attempt, Failed: false),
                ct);
            _telemetry.MessagesConsumed.Add(1, tags);
            _telemetry.ProcessingDuration.Record(Stopwatch.GetElapsedTime(start).TotalMilliseconds, tags);
            return;
        }
    }
}
