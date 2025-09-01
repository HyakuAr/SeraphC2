using FluentAssertions;
using SeraphC2.Implant.SystemInfo;
using Xunit;

namespace SeraphC2.Implant.Tests.SystemInfo;

public class SystemInfoCollectorTests
{
    private readonly SystemInfoCollector _systemInfoCollector;

    public SystemInfoCollectorTests()
    {
        _systemInfoCollector = new SystemInfoCollector();
    }

    [Fact]
    public async Task CollectSystemInfoAsync_ShouldReturnValidSystemInformation()
    {
        // Act
        var result = await _systemInfoCollector.CollectSystemInfoAsync();

        // Assert
        result.Should().NotBeNull();
        result.Hostname.Should().NotBeNullOrEmpty();
        result.Username.Should().NotBeNullOrEmpty();
        result.OperatingSystem.Should().NotBeNullOrEmpty();
        result.Architecture.Should().BeOneOf("x86", "x64");
        result.CollectedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task CollectSystemInfoAsync_ShouldSetHostnameFromEnvironment()
    {
        // Act
        var result = await _systemInfoCollector.CollectSystemInfoAsync();

        // Assert
        result.Hostname.Should().Be(Environment.MachineName);
    }

    [Fact]
    public async Task CollectSystemInfoAsync_ShouldSetUsernameFromEnvironment()
    {
        // Act
        var result = await _systemInfoCollector.CollectSystemInfoAsync();

        // Assert
        result.Username.Should().Be(Environment.UserName);
        result.Domain.Should().Be(Environment.UserDomainName);
    }

    [Fact]
    public async Task CollectSystemInfoAsync_ShouldSetArchitectureCorrectly()
    {
        // Act
        var result = await _systemInfoCollector.CollectSystemInfoAsync();

        // Assert
        var expectedArchitecture = Environment.Is64BitOperatingSystem ? "x64" : "x86";
        result.Architecture.Should().Be(expectedArchitecture);
    }

    [Fact]
    public async Task CollectSystemInfoAsync_ShouldCollectNetworkInterfaces()
    {
        // Act
        var result = await _systemInfoCollector.CollectSystemInfoAsync();

        // Assert
        result.NetworkInterfaces.Should().NotBeNull();
        // Note: We can't guarantee network interfaces exist in all test environments
        // so we just verify the array is not null
    }
}