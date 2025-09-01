using FluentAssertions;
using SeraphC2.Implant.Commands;
using SeraphC2.Implant.Models;
using Xunit;

namespace SeraphC2.Implant.Tests.Commands;

public class CommandProcessorTests
{
    private readonly CommandProcessor _commandProcessor;

    public CommandProcessorTests()
    {
        _commandProcessor = new CommandProcessor();
    }

    [Fact]
    public async Task ProcessCommandAsync_WithPingCommand_ShouldReturnPongResponse()
    {
        // Arrange
        var command = new CommandMessage
        {
            Id = Guid.NewGuid().ToString(),
            ImplantId = Guid.NewGuid().ToString(),
            Type = "ping",
            Payload = ""
        };

        // Act
        var result = await _commandProcessor.ProcessCommandAsync(command);

        // Assert
        result.Should().NotBeNull();
        result.CommandId.Should().Be(command.Id);
        result.ImplantId.Should().Be(command.ImplantId);
        result.Success.Should().BeTrue();
        result.ExitCode.Should().Be(0);
        result.Output.Should().Contain("Pong from");
        result.Output.Should().Contain(Environment.MachineName);
    }

    [Fact]
    public async Task ProcessCommandAsync_WithSysInfoCommand_ShouldReturnSystemInformation()
    {
        // Arrange
        var command = new CommandMessage
        {
            Id = Guid.NewGuid().ToString(),
            ImplantId = Guid.NewGuid().ToString(),
            Type = "sysinfo",
            Payload = ""
        };

        // Act
        var result = await _commandProcessor.ProcessCommandAsync(command);

        // Assert
        result.Should().NotBeNull();
        result.Success.Should().BeTrue();
        result.ExitCode.Should().Be(0);
        result.Output.Should().Contain("Hostname:");
        result.Output.Should().Contain("Username:");
        result.Output.Should().Contain("OS Version:");
        result.Output.Should().Contain("Architecture:");
    }

    [Fact]
    public async Task ProcessCommandAsync_WithSimpleShellCommand_ShouldExecuteSuccessfully()
    {
        // Arrange
        var command = new CommandMessage
        {
            Id = Guid.NewGuid().ToString(),
            ImplantId = Guid.NewGuid().ToString(),
            Type = "shell",
            Payload = "echo Hello World"
        };

        // Act
        var result = await _commandProcessor.ProcessCommandAsync(command);

        // Assert
        result.Should().NotBeNull();
        result.Success.Should().BeTrue();
        result.ExitCode.Should().Be(0);
        result.Output.Should().Contain("Hello World");
    }

    [Fact]
    public async Task ProcessCommandAsync_WithInvalidShellCommand_ShouldReturnError()
    {
        // Arrange
        var command = new CommandMessage
        {
            Id = Guid.NewGuid().ToString(),
            ImplantId = Guid.NewGuid().ToString(),
            Type = "shell",
            Payload = "invalidcommandthatdoesnotexist"
        };

        // Act
        var result = await _commandProcessor.ProcessCommandAsync(command);

        // Assert
        result.Should().NotBeNull();
        result.Success.Should().BeFalse();
        result.ExitCode.Should().NotBe(0);
        result.Error.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task ProcessCommandAsync_WithPowerShellCommand_ShouldExecuteSuccessfully()
    {
        // Arrange
        var command = new CommandMessage
        {
            Id = Guid.NewGuid().ToString(),
            ImplantId = Guid.NewGuid().ToString(),
            Type = "powershell",
            Payload = "Write-Output 'PowerShell Test'"
        };

        // Act
        var result = await _commandProcessor.ProcessCommandAsync(command);

        // Assert
        result.Should().NotBeNull();
        result.Success.Should().BeTrue();
        result.ExitCode.Should().Be(0);
        result.Output.Should().Contain("PowerShell Test");
    }

    [Fact]
    public async Task ProcessCommandAsync_WithUnknownCommandType_ShouldReturnError()
    {
        // Arrange
        var command = new CommandMessage
        {
            Id = Guid.NewGuid().ToString(),
            ImplantId = Guid.NewGuid().ToString(),
            Type = "unknowncommand",
            Payload = "test"
        };

        // Act
        var result = await _commandProcessor.ProcessCommandAsync(command);

        // Assert
        result.Should().NotBeNull();
        result.Success.Should().BeFalse();
        result.Error.Should().Contain("Unknown command type");
    }

    [Fact]
    public async Task ProcessCommandAsync_ShouldSetTimestamp()
    {
        // Arrange
        var command = new CommandMessage
        {
            Id = Guid.NewGuid().ToString(),
            ImplantId = Guid.NewGuid().ToString(),
            Type = "ping",
            Payload = ""
        };

        // Act
        var result = await _commandProcessor.ProcessCommandAsync(command);

        // Assert
        result.Timestamp.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }
}