namespace SeraphC2.Implant.Models;

public class SystemInformation
{
    public string Hostname { get; set; } = string.Empty;
    public string OperatingSystem { get; set; } = string.Empty;
    public string Architecture { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public bool IsElevated { get; set; }
    public string ProcessorInfo { get; set; } = string.Empty;
    public long TotalMemoryMB { get; set; }
    public string[] NetworkInterfaces { get; set; } = Array.Empty<string>();
    public DateTime CollectedAt { get; set; } = DateTime.UtcNow;
}