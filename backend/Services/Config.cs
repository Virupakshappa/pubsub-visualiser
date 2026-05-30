namespace PubSubVisualiser.Api.Services;

public sealed class Config
{
    private int _subscriberDelayMs = 250;

    public int SubscriberDelayMs
    {
        get => _subscriberDelayMs;
        set => _subscriberDelayMs = Math.Clamp(value, 0, 2000);
    }
}
