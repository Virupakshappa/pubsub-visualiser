namespace PubSubVisualiser.Api.Services;

public static class EventNames
{
    public const string RandomNumber   = "randomNumber";
    public const string RandomAlphabet = "randomAlphabet";
    public const string RandomColor    = "randomColor";
    public const string RandomEmoji    = "randomEmoji";

    public const string GotTheRandomNumber   = "gotTheRandomNumber";
    public const string GotTheRandomAlphabet = "gotTheRandomAlphabet";
    public const string GotTheRandomColor    = "gotTheRandomColor";
    public const string GotTheRandomEmoji    = "gotTheRandomEmoji";

    public const string AnyEventLogged       = "anyEventLogged";
    public const string AlphanumericConsumed = "alphanumericConsumed";
    public const string ChaoticConsumed      = "chaoticConsumed";
    public const string DeadLetter           = "deadLetter";
}
