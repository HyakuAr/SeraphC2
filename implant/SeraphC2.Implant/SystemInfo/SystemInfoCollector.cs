using System.Management;
using System.Net.NetworkInformation;
using System.Security.Principal;
using SeraphC2.Implant.Models;

namespace SeraphC2.Implant.SystemInfo;

public class SystemInfoCollector : ISystemInfoCollector
{
    public async Task<SystemInformation> CollectSystemInfoAsync()
    {
        var systemInfo = new SystemInformation();

        try
        {
            // Basic system information
            systemInfo.Hostname = Environment.MachineName;
            systemInfo.Username = Environment.UserName;
            systemInfo.Domain = Environment.UserDomainName;
            systemInfo.Architecture = Environment.Is64BitOperatingSystem ? "x64" : "x86";
            
            // Check if running as administrator
            systemInfo.IsElevated = IsRunningAsAdministrator();
            
            // Operating system information
            systemInfo.OperatingSystem = await GetOperatingSystemInfoAsync();
            
            // Processor information
            systemInfo.ProcessorInfo = await GetProcessorInfoAsync();
            
            // Memory information
            systemInfo.TotalMemoryMB = await GetTotalMemoryAsync();
            
            // Network interfaces
            systemInfo.NetworkInterfaces = await GetNetworkInterfacesAsync();
            
            systemInfo.CollectedAt = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error collecting system information: {ex.Message}");
        }

        return systemInfo;
    }

    private static bool IsRunningAsAdministrator()
    {
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch
        {
            return false;
        }
    }

    private static async Task<string> GetOperatingSystemInfoAsync()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_OperatingSystem");
            using var collection = searcher.Get();
            
            foreach (ManagementObject obj in collection)
            {
                var caption = obj["Caption"]?.ToString() ?? "Unknown";
                var version = obj["Version"]?.ToString() ?? "Unknown";
                var architecture = obj["OSArchitecture"]?.ToString() ?? "Unknown";
                
                return $"{caption} {version} ({architecture})";
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error getting OS info: {ex.Message}");
        }

        return $"{Environment.OSVersion}";
    }

    private static async Task<string> GetProcessorInfoAsync()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_Processor");
            using var collection = searcher.Get();
            
            foreach (ManagementObject obj in collection)
            {
                var name = obj["Name"]?.ToString() ?? "Unknown";
                var cores = obj["NumberOfCores"]?.ToString() ?? "Unknown";
                var threads = obj["NumberOfLogicalProcessors"]?.ToString() ?? "Unknown";
                
                return $"{name} ({cores} cores, {threads} threads)";
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error getting processor info: {ex.Message}");
        }

        return "Unknown Processor";
    }

    private static async Task<long> GetTotalMemoryAsync()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_ComputerSystem");
            using var collection = searcher.Get();
            
            foreach (ManagementObject obj in collection)
            {
                if (obj["TotalPhysicalMemory"] != null)
                {
                    var totalBytes = Convert.ToInt64(obj["TotalPhysicalMemory"]);
                    return totalBytes / (1024 * 1024); // Convert to MB
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error getting memory info: {ex.Message}");
        }

        return 0;
    }

    private static async Task<string[]> GetNetworkInterfacesAsync()
    {
        try
        {
            var interfaces = new List<string>();
            var networkInterfaces = NetworkInterface.GetAllNetworkInterfaces();
            
            foreach (var ni in networkInterfaces)
            {
                if (ni.OperationalStatus == OperationalStatus.Up && 
                    ni.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                {
                    var properties = ni.GetIPProperties();
                    var addresses = properties.UnicastAddresses
                        .Where(addr => addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                        .Select(addr => addr.Address.ToString());
                    
                    if (addresses.Any())
                    {
                        interfaces.Add($"{ni.Name}: {string.Join(", ", addresses)}");
                    }
                }
            }
            
            return interfaces.ToArray();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error getting network interfaces: {ex.Message}");
            return Array.Empty<string>();
        }
    }
}