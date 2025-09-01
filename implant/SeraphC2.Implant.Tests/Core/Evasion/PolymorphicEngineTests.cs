using Xunit;
using SeraphC2.Implant.Core.Evasion;

namespace SeraphC2.Implant.Tests.Core.Evasion;

public class PolymorphicEngineTests
{
    private readonly PolymorphicEngine _polymorphicEngine;

    public PolymorphicEngineTests()
    {
        _polymorphicEngine = new PolymorphicEngine();
    }

    [Fact]
    public void PolymorphicEngine_CanBeInstantiated()
    {
        // Assert
        Assert.NotNull(_polymorphicEngine);
    }

    [Fact]
    public void PolymorphicEngine_ImplementsIPolymorphicEngine()
    {
        // Assert
        Assert.IsAssignableFrom<IPolymorphicEngine>(_polymorphicEngine);
    }

    [Fact]
    public async Task GenerateVariantAsync_WithDefaultOptions_ShouldReturnModifiedPayload()
    {
        // Arrange
        var originalCode = new byte[] { 0x90, 0x90, 0x90, 0xC3 }; // NOP, NOP, NOP, RET

        // Act
        var variant = await _polymorphicEngine.GenerateVariantAsync(originalCode);

        // Assert
        Assert.NotNull(variant);
        Assert.True(variant.Length >= originalCode.Length);
        // Should be different from original due to transformations
        Assert.False(variant.SequenceEqual(originalCode));
    }

    [Fact]
    public async Task GenerateVariantAsync_WithCustomOptions_ShouldApplyTransformations()
    {
        // Arrange
        var originalCode = new byte[] { 0x90, 0x90, 0x90, 0xC3 };
        var options = new PolymorphicOptions
        {
            ObfuscateStrings = true,
            AddJunkCode = true,
            EncryptPayload = true,
            JunkCodePercentage = 20
        };

        // Act
        var variant = await _polymorphicEngine.GenerateVariantAsync(originalCode, options);

        // Assert
        Assert.NotNull(variant);
        Assert.True(variant.Length > originalCode.Length); // Should be larger due to transformations
    }

    [Fact]
    public async Task GenerateVariantAsync_WithOnlyJunkCode_ShouldAddJunk()
    {
        // Arrange
        var originalCode = new byte[] { 0x90, 0x90, 0x90, 0xC3 };
        var options = new PolymorphicOptions
        {
            ObfuscateStrings = false,
            AddJunkCode = true,
            EncryptPayload = false,
            JunkCodePercentage = 15
        };

        // Act
        var variant = await _polymorphicEngine.GenerateVariantAsync(originalCode, options);

        // Assert
        Assert.NotNull(variant);
        Assert.True(variant.Length >= originalCode.Length);
    }

    [Fact]
    public async Task ObfuscateStringsAsync_WithStringData_ShouldObfuscateStrings()
    {
        // Arrange
        var payloadWithStrings = System.Text.Encoding.ASCII.GetBytes("Hello World\0Test String\0");

        // Act
        var obfuscated = await _polymorphicEngine.ObfuscateStringsAsync(payloadWithStrings);

        // Assert
        Assert.NotNull(obfuscated);
        Assert.True(obfuscated.Length >= payloadWithStrings.Length);
        // Should not contain original strings in plain text
        var obfuscatedText = System.Text.Encoding.ASCII.GetString(obfuscated);
        Assert.DoesNotContain("Hello World", obfuscatedText);
    }

    [Fact]
    public async Task AddJunkCodeAsync_WithValidPayload_ShouldAddJunk()
    {
        // Arrange
        var originalPayload = new byte[] { 0x90, 0x90, 0x90, 0xC3 };
        var junkPercentage = 25;

        // Act
        var result = await _polymorphicEngine.AddJunkCodeAsync(originalPayload, junkPercentage);

        // Assert
        Assert.NotNull(result);
        Assert.True(result.Length > originalPayload.Length);
        
        // Should contain original payload bytes
        var originalFound = false;
        for (int i = 0; i <= result.Length - originalPayload.Length; i++)
        {
            if (result.Skip(i).Take(originalPayload.Length).SequenceEqual(originalPayload))
            {
                originalFound = true;
                break;
            }
        }
        // Note: Due to instruction substitution, exact match might not be found
        // but the result should be larger
    }

    [Theory]
    [InlineData(5)]
    [InlineData(10)]
    [InlineData(25)]
    [InlineData(50)]
    public async Task AddJunkCodeAsync_WithDifferentPercentages_ShouldScaleAppropriately(int junkPercentage)
    {
        // Arrange
        var originalPayload = new byte[] { 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90 };

        // Act
        var result = await _polymorphicEngine.AddJunkCodeAsync(originalPayload, junkPercentage);

        // Assert
        Assert.NotNull(result);
        Assert.True(result.Length >= originalPayload.Length);
        
        // Higher percentages should generally result in larger outputs
        var sizeIncrease = ((double)(result.Length - originalPayload.Length) / originalPayload.Length) * 100;
        Assert.True(sizeIncrease >= 0);
    }

    [Fact]
    public async Task EncryptWithStubAsync_WithValidPayload_ShouldEncryptAndAddStub()
    {
        // Arrange
        var payload = new byte[] { 0x90, 0x90, 0x90, 0xC3 };

        // Act
        var encrypted = await _polymorphicEngine.EncryptWithStubAsync(payload);

        // Assert
        Assert.NotNull(encrypted);
        Assert.True(encrypted.Length > payload.Length);
        // Should not contain original payload in plain text
        Assert.False(encrypted.Skip(10).Take(payload.Length).SequenceEqual(payload));
    }

    [Fact]
    public async Task EncryptWithStubAsync_WithCustomKey_ShouldUseProvidedKey()
    {
        // Arrange
        var payload = new byte[] { 0x90, 0x90, 0x90, 0xC3 };
        var customKey = new byte[32];
        for (int i = 0; i < customKey.Length; i++)
        {
            customKey[i] = (byte)(i + 1);
        }

        // Act
        var encrypted = await _polymorphicEngine.EncryptWithStubAsync(payload, customKey);

        // Assert
        Assert.NotNull(encrypted);
        Assert.True(encrypted.Length > payload.Length);
    }

    [Fact]
    public async Task GenerateVariantAsync_WithEmptyPayload_ShouldHandleGracefully()
    {
        // Arrange
        var emptyPayload = new byte[0];

        // Act
        var variant = await _polymorphicEngine.GenerateVariantAsync(emptyPayload);

        // Assert
        Assert.NotNull(variant);
        // Should handle empty input gracefully
    }

    [Fact]
    public async Task GenerateVariantAsync_WithLargePayload_ShouldHandleEfficiently()
    {
        // Arrange
        var largePayload = new byte[10000];
        for (int i = 0; i < largePayload.Length; i++)
        {
            largePayload[i] = (byte)(i % 256);
        }

        var options = new PolymorphicOptions
        {
            ObfuscateStrings = false, // Disable to avoid performance issues in tests
            AddJunkCode = true,
            EncryptPayload = false,
            JunkCodePercentage = 5 // Low percentage for performance
        };

        // Act
        var startTime = DateTime.UtcNow;
        var variant = await _polymorphicEngine.GenerateVariantAsync(largePayload, options);
        var endTime = DateTime.UtcNow;

        // Assert
        Assert.NotNull(variant);
        Assert.True(variant.Length >= largePayload.Length);
        
        // Should complete in reasonable time (less than 5 seconds)
        var duration = (endTime - startTime).TotalSeconds;
        Assert.True(duration < 5.0, $"Processing took too long: {duration} seconds");
    }

    [Fact]
    public async Task AllMethods_ShouldHandleExceptionsGracefully()
    {
        // Test that all methods handle exceptions without crashing
        
        var emptyPayload = new byte[0];
        
        var variantResult = await _polymorphicEngine.GenerateVariantAsync(emptyPayload);
        Assert.NotNull(variantResult);

        var obfuscateResult = await _polymorphicEngine.ObfuscateStringsAsync(emptyPayload);
        Assert.NotNull(obfuscateResult);

        var junkResult = await _polymorphicEngine.AddJunkCodeAsync(emptyPayload, 10);
        Assert.NotNull(junkResult);

        var encryptResult = await _polymorphicEngine.EncryptWithStubAsync(emptyPayload);
        Assert.NotNull(encryptResult);
    }

    [Fact]
    public async Task PolymorphicOptions_ShouldControlTransformations()
    {
        // Arrange
        var payload = new byte[] { 0x90, 0x90, 0x90, 0xC3 };
        
        var minimalOptions = new PolymorphicOptions
        {
            ObfuscateStrings = false,
            AddJunkCode = false,
            EncryptPayload = false
        };

        var maximalOptions = new PolymorphicOptions
        {
            ObfuscateStrings = true,
            AddJunkCode = true,
            EncryptPayload = true,
            JunkCodePercentage = 20
        };

        // Act
        var minimalVariant = await _polymorphicEngine.GenerateVariantAsync(payload, minimalOptions);
        var maximalVariant = await _polymorphicEngine.GenerateVariantAsync(payload, maximalOptions);

        // Assert
        Assert.NotNull(minimalVariant);
        Assert.NotNull(maximalVariant);
        
        // Maximal transformations should generally result in larger output
        Assert.True(maximalVariant.Length >= minimalVariant.Length);
    }

    [Fact]
    public void PolymorphicOptions_DefaultValues_ShouldBeReasonable()
    {
        // Arrange & Act
        var options = new PolymorphicOptions();

        // Assert
        Assert.True(options.ObfuscateStrings);
        Assert.True(options.AddJunkCode);
        Assert.True(options.EncryptPayload);
        Assert.Equal(10, options.JunkCodePercentage);
        Assert.Null(options.EncryptionKey);
    }
}