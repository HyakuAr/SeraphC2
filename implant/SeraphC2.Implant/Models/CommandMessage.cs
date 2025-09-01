namespace SeraphC2.Implant.Models;

public class CommandMessage
{
    public string Id { get; set; } = string.Empty;
    public string ImplantId { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Payload { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public Dictionary<string, object> Parameters { get; set; } = new();
}