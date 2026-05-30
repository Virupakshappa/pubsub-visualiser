using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace PubSubVisualiser.Api.Services.Observability;

/// <summary>
/// Central home for the app's OpenTelemetry instruments. Holds the custom
/// <see cref="ActivitySource"/> (traces) and a <see cref="Meter"/> worth of counters,
/// a processing-duration histogram, and an SSE-client gauge (metrics). Registered as
/// a singleton and injected into the publishers/subscribers/SSE endpoint.
/// </summary>
public sealed class Telemetry : IDisposable
{
    /// <summary>Service + meter + activity-source name. OTel registration must match this.</summary>
    public const string ServiceName = "PubSubVisualiser";

    public static readonly ActivitySource ActivitySource = new(ServiceName);

    private readonly Meter _meter;

    public Counter<long> MessagesPublished { get; }
    public Counter<long> MessagesConsumed { get; }
    public Counter<long> MessagesFailed { get; }
    public Counter<long> MessageRetries { get; }
    public Histogram<double> ProcessingDuration { get; }
    public UpDownCounter<long> SseClients { get; }

    public Telemetry(IMeterFactory meterFactory)
    {
        _meter = meterFactory.Create(ServiceName);

        MessagesPublished = _meter.CreateCounter<long>(
            "pubsub.messages.published", unit: "{message}",
            description: "Messages published onto the bus.");

        MessagesConsumed = _meter.CreateCounter<long>(
            "pubsub.messages.consumed", unit: "{message}",
            description: "Messages successfully handled by subscribers.");

        MessagesFailed = _meter.CreateCounter<long>(
            "pubsub.messages.failed", unit: "{message}",
            description: "Messages that exhausted retries and were dead-lettered.");

        MessageRetries = _meter.CreateCounter<long>(
            "pubsub.messages.retries", unit: "{attempt}",
            description: "Subscriber handling retries.");

        ProcessingDuration = _meter.CreateHistogram<double>(
            "pubsub.message.processing.duration", unit: "ms",
            description: "Subscriber handling latency.");

        SseClients = _meter.CreateUpDownCounter<long>(
            "pubsub.sse.clients", unit: "{client}",
            description: "Currently connected SSE clients.");
    }

    public void Dispose()
    {
        _meter.Dispose();
        ActivitySource.Dispose();
    }
}
