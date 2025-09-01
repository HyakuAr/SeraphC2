using FluentAssertions;
using Moq;
using SeraphC2.Implant.Commands;
using SeraphC2.Implant.Communication;
using SeraphC2.Implant.Core;
using SeraphC2.Implant.Models;
using SeraphC2.Implant.SystemInfo;
using Xunit;

namespace SeraphC2.Implant.Tests.Core;

public class ImplantCoreTests : IDisposable
{
    private readonly Mock<IHttpClientWrapper> _mockHttpClient;
    private readonly Mock<ISystemInfoCollector> _mockSystemInfoCollector;
    private readonly Mock<ICommandProcessor> _mockCommandProcessor;
    private readonly ImplantConfig _config;
    private readonly ImplantCore _implantCore;

    public ImplantCoreTests()
    {
        _mockHttpClient = new Mock<IHttpClientWrapper>();
        _mockSystemInfoCollector = new Mock<ISystemInfoCollector>();
        _mockCommandProcessor = new Mock<ICommandProcessor>();
        
        _config = new ImplantConfig
        {
            ImplantId = Guid.NewGuid().ToString(),
            ServerUrl = "http://test-server",
            CallbackInterval = TimeSpan.FromSeconds(1) // Short interval for testing
        };

        _implantCore = new ImplantCore(
            _config,
            _mockHttpClient.Object,
            _mockSystemInfoCollector.Object,
            _mockCommandProcessor.Object);
    }

    [Fact]
    public void Constructor_WithNullConfig_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var action = () => new ImplantCore(
            null!,
            _mockHttpClient.Object,
            _mockSystemInfoCollector.Object,
            _mockCommandProcessor.Object);

        action.Should().Throw<ArgumentNullException>().WithParameterName("config");
    }

    [Fact]
    public void Constructor_WithNullHttpClient_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var action = () => new ImplantCore(
            _config,
            null!,
            _mockSystemInfoCollector.Object,
            _mockCommandProcessor.Object);

        action.Should().Throw<ArgumentNullException>().WithParameterName("httpClient");
    }

    [Fact]
    public void Constructor_WithNullSystemInfoCollector_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var action = () => new ImplantCore(
            _config,
            _mockHttpClient.Object,
            null!,
            _mockCommandProcessor.Object);

        action.Should().Throw<ArgumentNullException>().WithParameterName("systemInfoCollector");
    }

    [Fact]
    public void Constructor_WithNullCommandProcessor_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var action = () => new ImplantCore(
            _config,
            _mockHttpClient.Object,
            _mockSystemInfoCollector.Object,
            null!);

        action.Should().Throw<ArgumentNullException>().WithParameterName("commandProcessor");
    }

    [Fact]
    public async Task StartAsync_ShouldCollectSystemInfo()
    {
        // Arrange
        var systemInfo = new SystemInformation
        {
            Hostname = "TestHost",
            Username = "TestUser"
        };

        _mockSystemInfoCollector
            .Setup(x => x.CollectSystemInfoAsync())
            .ReturnsAsync(systemInfo);

        _mockHttpClient
            .Setup(x => x.RegisterImplantAsync(It.IsAny<ImplantRegistration>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        using var cts = new CancellationTokenSource();
        cts.CancelAfter(TimeSpan.FromMilliseconds(100)); // Cancel quickly for test

        // Act
        try
        {
            await _implantCore.StartAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            // Expected due to cancellation
        }

        // Assert
        _mockSystemInfoCollector.Verify(x => x.CollectSystemInfoAsync(), Times.Once);
    }

    [Fact]
    public async Task StartAsync_ShouldAttemptRegistration()
    {
        // Arrange
        var systemInfo = new SystemInformation
        {
            Hostname = "TestHost",
            Username = "TestUser"
        };

        _mockSystemInfoCollector
            .Setup(x => x.CollectSystemInfoAsync())
            .ReturnsAsync(systemInfo);

        _mockHttpClient
            .Setup(x => x.RegisterImplantAsync(It.IsAny<ImplantRegistration>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        using var cts = new CancellationTokenSource();
        cts.CancelAfter(TimeSpan.FromMilliseconds(100)); // Cancel quickly for test

        // Act
        try
        {
            await _implantCore.StartAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            // Expected due to cancellation
        }

        // Assert
        _mockHttpClient.Verify(
            x => x.RegisterImplantAsync(
                It.Is<ImplantRegistration>(r => 
                    r.ImplantId == _config.ImplantId && 
                    r.SystemInfo == systemInfo),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task StopAsync_ShouldCompleteWithoutError()
    {
        // Act & Assert
        var action = async () => await _implantCore.StopAsync();
        await action.Should().NotThrowAsync();
    }

    public void Dispose()
    {
        try
        {
            _implantCore?.StopAsync().Wait(1000);
        }
        catch
        {
            // Ignore disposal errors in tests
        }
    }
}