using System.Text.Json;
using Confluent.Kafka;

namespace PubSubVisualiser.Api.Services.Messaging;

/// <summary>
/// <see cref="IMessageBus"/> backed by a real Apache Kafka broker (Confluent.Kafka).
/// Each event name maps to a Kafka topic (prefixed); messages are JSON-serialised
/// <see cref="PubSubMessage"/> payloads.
///
/// Every <see cref="Subscribe"/> call gets its own unique consumer group, so each
/// logical subscriber receives <em>every</em> message on the topic — broadcast
/// fan-out that matches the in-process bus, rather than Kafka's default
/// load-balancing within a shared group.
/// </summary>
public sealed class KafkaMessageBus : IMessageBus, IDisposable
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly IProducer<Null, string> _producer;
    private readonly string _bootstrapServers;
    private readonly string _topicPrefix;
    private readonly ILogger<KafkaMessageBus> _logger;

    public KafkaMessageBus(IConfiguration config, ILogger<KafkaMessageBus> logger)
    {
        _logger = logger;
        _bootstrapServers = config["Kafka:BootstrapServers"] ?? "localhost:9092";
        _topicPrefix = config["Kafka:TopicPrefix"] ?? "pubsub.";

        _producer = new ProducerBuilder<Null, string>(new ProducerConfig
        {
            BootstrapServers = _bootstrapServers,
            AllowAutoCreateTopics = true,
        }).Build();

        _logger.LogInformation("KafkaMessageBus connected to {Bootstrap} (prefix '{Prefix}')",
            _bootstrapServers, _topicPrefix);
    }

    private string TopicFor(string eventName) => _topicPrefix + eventName;

    public async ValueTask PublishAsync(string topic, PubSubMessage message, CancellationToken ct = default)
    {
        var payload = JsonSerializer.Serialize(message, Json);
        await _producer.ProduceAsync(
            TopicFor(topic),
            new Message<Null, string> { Value = payload },
            ct);
    }

    public IDisposable Subscribe(string topic, Func<PubSubMessage, CancellationToken, ValueTask> handler)
    {
        var cts = new CancellationTokenSource();
        var fullTopic = TopicFor(topic);
        var groupId = $"pubsub-visualiser-{Guid.NewGuid():N}";
        var loop = Task.Run(() => ConsumeLoopAsync(fullTopic, groupId, handler, cts.Token));
        return new Subscription(cts, loop);
    }

    private async Task ConsumeLoopAsync(
        string topic,
        string groupId,
        Func<PubSubMessage, CancellationToken, ValueTask> handler,
        CancellationToken ct)
    {
        using var consumer = new ConsumerBuilder<Ignore, string>(new ConsumerConfig
        {
            BootstrapServers = _bootstrapServers,
            GroupId = groupId,
            // Only deliver messages produced after this subscriber starts — the
            // in-process bus has no history, so we mirror that.
            AutoOffsetReset = AutoOffsetReset.Latest,
            EnableAutoCommit = true,
            AllowAutoCreateTopics = true,
        }).Build();

        consumer.Subscribe(topic);

        try
        {
            while (!ct.IsCancellationRequested)
            {
                ConsumeResult<Ignore, string>? result;
                try
                {
                    result = consumer.Consume(TimeSpan.FromMilliseconds(200));
                }
                catch (ConsumeException ex)
                {
                    _logger.LogWarning(ex, "Kafka consume error on {Topic}", topic);
                    continue;
                }

                if (result?.Message?.Value is not { } value) continue;

                PubSubMessage? msg;
                try
                {
                    msg = JsonSerializer.Deserialize<PubSubMessage>(value, Json);
                }
                catch (JsonException ex)
                {
                    _logger.LogWarning(ex, "Bad payload on {Topic}: {Value}", topic, value);
                    continue;
                }

                if (msg is null) continue;

                try
                {
                    await handler(msg, ct);
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Handler error on {Topic}", topic);
                }
            }
        }
        catch (OperationCanceledException) { /* shutting down */ }
        finally
        {
            try { consumer.Close(); } catch { /* best effort */ }
        }
    }

    public void Dispose()
    {
        try { _producer.Flush(TimeSpan.FromSeconds(2)); } catch { /* best effort */ }
        _producer.Dispose();
    }

    private sealed class Subscription : IDisposable
    {
        private readonly CancellationTokenSource _cts;
        private readonly Task _loop;

        public Subscription(CancellationTokenSource cts, Task loop)
        {
            _cts = cts;
            _loop = loop;
        }

        public void Dispose()
        {
            _cts.Cancel();
            try { _loop.Wait(TimeSpan.FromSeconds(2)); } catch { /* best effort */ }
            _cts.Dispose();
        }
    }
}
