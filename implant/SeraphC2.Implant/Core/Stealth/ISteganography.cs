namespace SeraphC2.Implant.Core.Stealth;

public interface ISteganography
{
    /// <summary>
    /// Hides configuration data within a legitimate file
    /// </summary>
    Task<bool> HideConfigurationAsync(string configData, string coverFilePath, string outputPath);
    
    /// <summary>
    /// Extracts hidden configuration data from a file
    /// </summary>
    Task<string?> ExtractConfigurationAsync(string filePath);
    
    /// <summary>
    /// Hides data in image files using LSB (Least Significant Bit) technique
    /// </summary>
    Task<bool> HideInImageAsync(byte[] data, string imagePath, string outputPath);
    
    /// <summary>
    /// Extracts data from image files
    /// </summary>
    Task<byte[]?> ExtractFromImageAsync(string imagePath);
    
    /// <summary>
    /// Hides data in text files using whitespace steganography
    /// </summary>
    Task<bool> HideInTextAsync(string data, string textFilePath, string outputPath);
    
    /// <summary>
    /// Extracts data from text files using whitespace analysis
    /// </summary>
    Task<string?> ExtractFromTextAsync(string textFilePath);
    
    /// <summary>
    /// Creates a legitimate-looking file with hidden data
    /// </summary>
    Task<bool> CreateCovertFileAsync(string data, string outputPath, CovertFileType fileType);
}

public enum CovertFileType
{
    TextDocument,
    ConfigFile,
    LogFile,
    RegistryExport,
    PowerShellScript
}