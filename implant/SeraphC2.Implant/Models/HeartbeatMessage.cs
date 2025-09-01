namespace SeraphC2.Implant.Models;

public class HeartbeatMessage
{
    public string ImplantId { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "active";
}