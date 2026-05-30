namespace PubSubVisualiser.Api.Services;

public static class RandomGenerators
{
    private static readonly string[] Colors =
    {
        "red", "orange", "gold", "green", "blue", "indigo", "violet",
        "tomato", "teal", "deeppink", "limegreen", "slateblue", "salmon"
    };

    private static readonly string[] Emojis =
    {
        "🚀", "🎉", "🐱", "🦄", "🌈", "🍕", "⚡", "🎯", "🌟", "🔥", "💎", "🍩", "🌮", "🐙", "🪐"
    };

    public static string Number()   => Random.Shared.Next(1, 11).ToString();

    public static string Alphabet() => ((char)('A' + Random.Shared.Next(26))).ToString();

    public static string Color()    => Colors[Random.Shared.Next(Colors.Length)];

    public static string Emoji()    => Emojis[Random.Shared.Next(Emojis.Length)];
}
