namespace SeraphC2.Implant.Core;

public class ImplantConfig
{
    public string ServerUrl { get; set; } = "http://localhost:3000";
    public TimeSpan CallbackInterval { get; set; } = TimeSpan.FromSeconds(30);
    public string ImplantId { get; set; } = Guid.NewGuid().ToString();
    public int MaxRetries { get; set; } = 3;
    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromSeconds(30);
    public string UserAgent { get; set; } = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
}