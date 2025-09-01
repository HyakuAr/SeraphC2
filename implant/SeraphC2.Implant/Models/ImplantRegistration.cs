namespace SeraphC2.Implant.Models;

public class ImplantRegistration
{
    public string ImplantId { get; set; } = string.Empty;
    public SystemInformation SystemInfo { get; set; } = new();
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}