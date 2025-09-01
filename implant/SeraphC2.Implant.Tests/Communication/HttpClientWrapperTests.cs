using FluentAssertions;
using SeraphC2.Implant.Communication;
using SeraphC2.Implant.Models;
using Xunit;

namespace SeraphC2.Implant.Tests.Communication;

public class HttpClientWrapperTests : IDisposable
{
    private readonly HttpClientWrapper _httpClientWrapper;

    public HttpClientWrapperTests()
    {
        _httpClientWrapper = new HttpClientWrapper();
    }

    [Fact]
    public async Task RegisterImplantAsync_WithValidRegistration_ShouldHandleRequest()
    {
        // Arrange
        var registration = new ImplantRegistration
        {
            ImplantId = Guid.NewGuid().ToString(),
            SystemInfo = new SystemInformation
            {
                Hostname = "TestHost",
                Username = "TestUser",
                OperatingSystem = "Windows 10",
                Architecture = "x64"
            }
        };

        // Act & Assert
        // Note: This will fail in tests since there's no actual server running
        // but we can verify the method doesn't throw exceptions with valid input
        var result = await _httpClientWrapper.RegisterImplantAsync(registration);
        
        // The result will be false since no server is running, but the method should not throw
        result.Should().BeFalse();
    }

    [Fact]
    public async Task SendHeartbeatAsync_WithValidHeartbeat_ShouldHandleRequest()
    {
        // Arrange
        var heartbeat = new HeartbeatMessage
        {
            ImplantId = Guid.NewGuid().ToString(),
            Status = "active"
        };

        // Act & Assert
        // Note: This will return null in tests since there's no actual server running
        // but we can verify the method doesn't throw exceptions with valid input
        var result = await _httpClientWrapper.SendHeartbeatAsync(heartbeat);
        
        // The result will be null since no server is running, but the method should not throw
        result.Should().BeNull();
    }

    [Fact]
    public async Task SendCommandResultAsync_WithValidResult_ShouldHandleRequest()
    {
        // Arrange
        var commandResult = new CommandResult
        {
            CommandId = Guid.NewGuid().ToString(),
            ImplantId = Guid.NewGuid().ToString(),
            Success = true,
            Output = "Test output"
        };

        // Act & Assert
        // Note: This will fail in tests since there's no actual server running
        // but we can verify the method doesn't throw exceptions with valid input
        var result = await _httpClientWrapper.SendCommandResultAsync(commandResult);
        
        // The result will be false since no server is running, but the method should not throw
        result.Should().BeFalse();
    }

    [Fact]
    public void Dispose_ShouldNotThrow()
    {
        // Act & Assert
        var action = () => _httpClientWrapper.Dispose();
        action.Should().NotThrow();
    }

    public void Dispose()
    {
        _httpClientWrapper?.Dispose();
    }
}