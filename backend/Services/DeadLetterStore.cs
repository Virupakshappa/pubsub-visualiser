namespace PubSubVisualiser.Api.Services;

/// <summary>A message that exhausted its retries and was dead-lettered.</summary>
public sealed record DeadLetter(
    string Id,
    string Actor,
    string SourceEventName,
    string Value,
    int Attempts,
    DateTimeOffset DeadLetteredAt);

/// <summary>
/// In-memory dead-letter queue. Holds the most recent dead-lettered messages (newest
/// first, capped) and supports replay — re-publishing the original event back onto the bus.
/// </summary>
public sealed class DeadLetterStore
{
    private const int MaxItems = 200;
    private readonly object _gate = new();
    private readonly List<DeadLetter> _items = new();

    public DeadLetter Add(string actor, string sourceEventName, string value, int attempts)
    {
        var dl = new DeadLetter(
            Guid.NewGuid().ToString("N"), actor, sourceEventName, value, attempts, DateTimeOffset.UtcNow);
        lock (_gate)
        {
            _items.Insert(0, dl);
            if (_items.Count > MaxItems)
                _items.RemoveRange(MaxItems, _items.Count - MaxItems);
        }
        return dl;
    }

    public IReadOnlyList<DeadLetter> All()
    {
        lock (_gate) return _items.ToArray();
    }

    /// <summary>Remove and return a dead letter by id (used when replaying), or null if gone.</summary>
    public DeadLetter? Remove(string id)
    {
        lock (_gate)
        {
            var idx = _items.FindIndex(x => x.Id == id);
            if (idx < 0) return null;
            var dl = _items[idx];
            _items.RemoveAt(idx);
            return dl;
        }
    }

    public void Clear()
    {
        lock (_gate) _items.Clear();
    }

    public int Count
    {
        get { lock (_gate) return _items.Count; }
    }
}
