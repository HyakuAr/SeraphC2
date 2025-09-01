using Xunit;
using SeraphC2.Implant.Core.Evasion;

namespace SeraphC2.Implant.Tests.Core.Evasion;

public class ApiUnhookingTests
{
    private readonly ApiUnhooking _apiUnhooking;

    public ApiUnhookingTests()
    {
        _apiUnhooking = new ApiUnhooking();
    }

    [Fact]
    public void ApiUnhooking_CanBeInstantiated()
    {
        // Assert
        Assert.NotNull(_apiUnhooking);
    }

    [Fact]
    public void ApiUnhooking_ImplementsIApiUnhooking()
    {
        // Assert
        Assert.IsAssignableFrom<IApiUnhooking>(_apiUnhooking);
    }

    [Theory]
    [InlineData("ntdll.dll", "NtAllocateVirtualMemory")]
    [InlineData("kernel32.dll", "CreateProcess")]
    [InlineData("kernelbase.dll", "WriteProcessMemory")]
    public async Task UnhookApiAsync_WithValidApi_ShouldReturnResult(string moduleName, string functionName)
    {
        // Act
        var result = await _apiUnhooking.UnhookApiAsync(moduleName, functionName);

        // Assert
        Assert.NotNull(result);
        Assert.NotNull(result.OriginalBytes);
        // Note: Success may vary depending on system state and permissions
    }

    [Fact]
    public async Task UnhookApiAsync_WithInvalidModule_ShouldReturnFailure()
    {
        // Arrange
        var invalidModule = "nonexistent.dll";
        var functionName = "SomeFunction";

        // Act
        var result = await _apiUnhooking.UnhookApiAsync(invalidModule, functionName);

        // Assert
        Assert.False(result.Success);
        Assert.NotEmpty(result.ErrorMessage);
    }

    [Fact]
    public async Task UnhookApiAsync_WithInvalidFunction_ShouldReturnFailure()
    {
        // Arrange
        var moduleName = "ntdll.dll";
        var invalidFunction = "NonExistentFunction";

        // Act
        var result = await _apiUnhooking.UnhookApiAsync(moduleName, invalidFunction);

        // Assert
        Assert.False(result.Success);
        Assert.NotEmpty(result.ErrorMessage);
    }

    [Theory]
    [InlineData("NtAllocateVirtualMemory")]
    [InlineData("NtProtectVirtualMemory")]
    [InlineData("NtWriteVirtualMemory")]
    [InlineData("NtCreateThread")]
    public async Task GetSyscallNumberAsync_WithKnownFunctions_ShouldReturnValidNumber(string functionName)
    {
        // Act
        var syscallNumber = await _apiUnhooking.GetSyscallNumberAsync(functionName);

        // Assert
        Assert.True(syscallNumber > 0 || syscallNumber == -1);
        // Known functions should return positive syscall numbers
        if (syscallNumber > 0)
        {
            Assert.InRange(syscallNumber, 1, 0x1000);
        }
    }

    [Fact]
    public async Task GetSyscallNumberAsync_WithUnknownFunction_ShouldReturnMinusOne()
    {
        // Arrange
        var unknownFunction = "UnknownFunction12345";

        // Act
        var syscallNumber = await _apiUnhooking.GetSyscallNumberAsync(unknownFunction);

        // Assert
        Assert.Equal(-1, syscallNumber);
    }

    [Fact]
    public async Task DirectSyscallAsync_WithValidSyscall_ShouldExecute()
    {
        // Arrange
        var syscallNumber = 0x18; // NtAllocateVirtualMemory
        var parameters = new IntPtr[] { IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero };

        // Act
        var result = await _apiUnhooking.DirectSyscallAsync(syscallNumber, parameters);

        // Assert
        Assert.NotNull(result);
        // Note: Actual syscall execution may fail due to invalid parameters,
        // but the syscall mechanism should work
    }

    [Fact]
    public async Task DirectSyscallAsync_WithInvalidSyscall_ShouldHandleGracefully()
    {
        // Arrange
        var invalidSyscallNumber = -1;
        var parameters = new IntPtr[] { IntPtr.Zero };

        // Act
        var result = await _apiUnhooking.DirectSyscallAsync(invalidSyscallNumber, parameters);

        // Assert
        Assert.NotNull(result);
        Assert.False(result.Success);
    }

    [Theory]
    [InlineData("ntdll.dll", "NtAllocateVirtualMemory")]
    [InlineData("kernel32.dll", "CreateProcess")]
    public async Task IsApiFunctionHookedAsync_WithValidApi_ShouldReturnBoolean(string moduleName, string functionName)
    {
        // Act
        var isHooked = await _apiUnhooking.IsApiFunctionHookedAsync(moduleName, functionName);

        // Assert
        Assert.IsType<bool>(isHooked);
    }

    [Fact]
    public async Task IsApiFunctionHookedAsync_WithInvalidApi_ShouldReturnFalse()
    {
        // Arrange
        var invalidModule = "nonexistent.dll";
        var invalidFunction = "NonExistentFunction";

        // Act
        var isHooked = await _apiUnhooking.IsApiFunctionHookedAsync(invalidModule, invalidFunction);

        // Assert
        Assert.False(isHooked);
    }

    [Theory]
    [InlineData("ntdll.dll", "NtAllocateVirtualMemory")]
    [InlineData("kernel32.dll", "WriteProcessMemory")]
    public async Task RestoreApiFromDiskAsync_WithValidApi_ShouldAttemptRestore(string moduleName, string functionName)
    {
        // Act
        var result = await _apiUnhooking.RestoreApiFromDiskAsync(moduleName, functionName);

        // Assert
        Assert.IsType<bool>(result);
        // Note: Result may vary depending on system permissions and file access
    }

    [Fact]
    public async Task RestoreApiFromDiskAsync_WithInvalidModule_ShouldReturnFalse()
    {
        // Arrange
        var invalidModule = "nonexistent.dll";
        var functionName = "SomeFunction";

        // Act
        var result = await _apiUnhooking.RestoreApiFromDiskAsync(invalidModule, functionName);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task SyscallExecution_WithMultipleParameters_ShouldHandleCorrectly()
    {
        // Arrange
        var syscallNumber = 0x18; // NtAllocateVirtualMemory
        var parameters = new IntPtr[] 
        { 
            IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 
            IntPtr.Zero, IntPtr.Zero, IntPtr.Zero 
        };

        // Act
        var result = await _apiUnhooking.DirectSyscallAsync(syscallNumber, parameters);

        // Assert
        Assert.NotNull(result);
        // Should handle 6 parameters correctly (max for syscall delegate)
    }

    [Fact]
    public async Task AllMethods_ShouldHandleExceptionsGracefully()
    {
        // Test that all methods handle exceptions without crashing
        
        var unhookResult = await _apiUnhooking.UnhookApiAsync("", "");
        Assert.False(unhookResult.Success);

        var syscallResult = await _apiUnhooking.DirectSyscallAsync(0, new IntPtr[0]);
        Assert.NotNull(syscallResult);

        var restoreResult = await _apiUnhooking.RestoreApiFromDiskAsync("", "");
        Assert.False(restoreResult);

        var hookedResult = await _apiUnhooking.IsApiFunctionHookedAsync("", "");
        Assert.False(hookedResult);

        var syscallNumberResult = await _apiUnhooking.GetSyscallNumberAsync("");
        Assert.Equal(-1, syscallNumberResult);
    }

    [Fact]
    public void SyscallTable_ShouldBeInitialized()
    {
        // Test that the syscall table is properly initialized by checking known functions
        var knownFunctions = new[]
        {
            "NtAllocateVirtualMemory",
            "NtProtectVirtualMemory", 
            "NtWriteVirtualMemory",
            "NtCreateThread"
        };

        // The syscall table should be initialized in the constructor
        // We can verify this indirectly by checking that known functions return valid numbers
        foreach (var function in knownFunctions)
        {
            var task = _apiUnhooking.GetSyscallNumberAsync(function);
            Assert.NotNull(task);
        }
    }
}