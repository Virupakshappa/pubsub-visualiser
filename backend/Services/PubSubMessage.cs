namespace PubSubVisualiser.Api.Services;

public sealed record PubSubMessage(
    int Count,
    string Value,
    string? SourceEventName = null,
    int Attempt = 1,
    bool Failed = false);
