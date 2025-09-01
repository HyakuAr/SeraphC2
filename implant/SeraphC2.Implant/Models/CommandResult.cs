namespace SeraphC2.Implant.Models;

public class CommandResult
{
    public string CommandId { get; set; } = string.Empty;
    public string ImplantId { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string Output { get; set; } = string.Empty;
    public string Error { get; set; } = string.Empty;
    public int ExitCode { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}