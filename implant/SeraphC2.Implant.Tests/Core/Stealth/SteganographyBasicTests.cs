using Xunit;
using SeraphC2.Implant.Core.Stealth;

namespace SeraphC2.Implant.Tests.Core.Stealth;

public class SteganographyBasicTests
{
    [Fact]
    public void Steganography_CanBeInstantiated()
    {
        // Act
        var steganography = new Steganography();
        
        // Assert
        Assert.NotNull(steganography);
    }

    [Fact]
    public async Task CreateCovertFileAsync_TextDocument_ShouldCreateValidFile()
    {
        // Arrange
        var steganography = new Steganography();
        var testData = "This is secret configuration data";
        var outputPath = Path.Combine(Path.GetTempPath(), "test_document.txt");

        try
        {
            // Act
            var result = await steganography.CreateCovertFileAsync(testData, outputPath, CovertFileType.TextDocument);

            // Assert
            Assert.True(result);
            Assert.True(File.Exists(outputPath));
            
            var content = await File.ReadAllTextAsync(outputPath);
            Assert.Contains("System Configuration Report", content);
        }
        finally
        {
            // Cleanup
            if (File.Exists(outputPath))
            {
                File.Delete(outputPath);
            }
        }
    }

    [Fact]
    public async Task HideInTextAsync_AndExtractFromTextAsync_ShouldRoundTrip()
    {
        // Arrange
        var steganography = new Steganography();
        var originalData = "This is secret data to hide";
        var tempDir = Path.Combine(Path.GetTempPath(), "SteganographyTest");
        Directory.CreateDirectory(tempDir);
        
        var coverTextPath = Path.Combine(tempDir, "cover.txt");
        var outputPath = Path.Combine(tempDir, "output.txt");
        
        try
        {
            // Create a cover text file
            var coverText = @"This is a sample text file.
It contains multiple lines.
Each line can be used for hiding data.
The data is hidden in trailing whitespace.";
            await File.WriteAllTextAsync(coverTextPath, coverText);

            // Act
            var hideResult = await steganography.HideInTextAsync(originalData, coverTextPath, outputPath);
            var extractedData = await steganography.ExtractFromTextAsync(outputPath);

            // Assert
            Assert.True(hideResult);
            Assert.NotNull(extractedData);
            Assert.Equal(originalData, extractedData);
        }
        finally
        {
            // Cleanup
            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, true);
            }
        }
    }
}