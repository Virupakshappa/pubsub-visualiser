namespace PubSubVisualiser.Api.Services;

public sealed class ChaosService : IHostedService, IDisposable
{
    private readonly IServiceProvider _services;
    private readonly ILogger<ChaosService> _logger;
    private CancellationTokenSource? _loopCts;
    private Task? _loopTask;
    private volatile bool _running;
    private int _intervalMs = 300;

    public bool Running => _running;

    public int IntervalMs
    {
        get => _intervalMs;
        set => _intervalMs = Math.Clamp(value, 50, 5000);
    }

    public ChaosService(IServiceProvider services, ILogger<ChaosService> logger)
    {
        _services = services;
        _logger = logger;
    }

    public void Start(int intervalMs)
    {
        IntervalMs = intervalMs;
        _running = true;
    }

    public void Stop()
    {
        _running = false;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _loopCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _loopTask = Task.Run(() => RunAsync(_loopCts.Token), _loopCts.Token);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _running = false;
        _loopCts?.Cancel();
        if (_loopTask is not null)
        {
            try { await _loopTask; } catch (OperationCanceledException) { }
        }
    }

    public void Dispose()
    {
        _loopCts?.Dispose();
    }

    private async Task RunAsync(CancellationToken ct)
    {
        var publishers = _services.GetServices<Publisher>().ToArray();
        while (!ct.IsCancellationRequested)
        {
            if (_running && publishers.Length > 0)
            {
                try
                {
                    var pub = publishers[Random.Shared.Next(publishers.Length)];
                    await pub.PublishAsync(ct);
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Chaos publish failed");
                }
                await Task.Delay(_intervalMs, ct);
            }
            else
            {
                await Task.Delay(100, ct);
            }
        }
    }
}
