using System.Diagnostics;

namespace SeraphC2.Implant.Core.Stealth;

public interface IProcessMasquerading
{
    /// <summary>
    /// Attempts to masquerade the current process as a legitimate system process
    /// </summary>
    Task<bool> MasqueradeProcessAsync(string targetProcessName);
    
    /// <summary>
    /// Spoofs the parent process to appear as if launched by a different process
    /// </summary>
    Task<bool> SpoofParentProcessAsync(int targetParentPid);
    
    /// <summary>
    /// Gets a list of suitable processes to masquerade as
    /// </summary>
    Task<IEnumerable<ProcessInfo>> GetMasqueradeTargetsAsync();
    
    /// <summary>
    /// Hides the current process from basic process enumeration
    /// </summary>
    Task<bool> HideProcessAsync();
    
    /// <summary>
    /// Modifies process memory to avoid detection
    /// </summary>
    Task<bool> ObfuscateProcessMemoryAsync();
}

public class ProcessInfo
{
    public int ProcessId { get; set; }
    public string ProcessName { get; set; } = string.Empty;
    public string ExecutablePath { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool IsSystemProcess { get; set; }
    public int ParentProcessId { get; set; }
}