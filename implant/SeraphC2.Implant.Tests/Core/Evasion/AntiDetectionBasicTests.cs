using Xunit;
using SeraphC2.Implant.Core.Evasion;

namespace SeraphC2.Implant.Tests.Core.Evasion;

public class AntiDetectionBasicTests
{
    [Fact]
    public void AntiDetection_CanBeInstantiated()
    {
        // Act
        var antiDetection = new AntiDetection();
        
        // Assert
        Assert.NotNull(antiDetection);
    }

    [Fact]
    public void IsDebuggerAttached_ShouldReturnBoolean()
    {
        // Arrange
        var antiDetection = new AntiDetection();
        
        // Act
        var result = antiDetection.IsDebuggerAttached();

        // Assert
        Assert.IsType<bool>(result);
        // In normal test environment, should be false
        Assert.False(result);
    }

    [Fact]
    public async Task DetectSecurityToolsAsync_ShouldReturnCollection()
    {
        // Arrange
        var antiDetection = new AntiDetection();
        
        // Act
        var tools = await antiDetection.DetectSecurityToolsAsync();

        // Assert
        Assert.NotNull(tools);
    }

    [Fact]
    public async Task AnalyzeEnvironmentAsync_ShouldReturnValidAnalysisInfo()
    {
        // Arrange
        var antiDetection = new AntiDetection();
        
        // Act
        var analysisInfo = await antiDetection.AnalyzeEnvironmentAsync();

        // Assert
        Assert.NotNull(analysisInfo);
        Assert.InRange(analysisInfo.SuspicionScore, 0, 100);
        Assert.NotNull(analysisInfo.DetectedTools);
    }
}