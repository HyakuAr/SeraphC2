# SeraphC2 Windows Implant

This is the Windows implant component of the SeraphC2 Command and Control framework. The implant is a lightweight C# console application designed to establish communication with the C2 server and execute commands on target Windows systems.

## Features

- **HTTP Communication**: Establishes HTTP-based communication with the C2 server
- **System Information Collection**: Automatically gathers comprehensive system information including:
  - Hostname, username, and domain information
  - Operating system details and architecture
  - Processor information and core count
  - Memory information
  - Network interface details
  - Administrator privilege status
- **Command Execution**: Supports multiple command types:
  - Shell commands (`cmd.exe`)
  - PowerShell commands
  - Built-in system information queries
  - Ping/connectivity tests
- **Heartbeat System**: Maintains regular communication with the C2 server
- **Error Handling**: Robust error handling with timeout protection

## Architecture

The implant follows a modular architecture with the following components:

- **ImplantCore**: Main orchestration class that manages the implant lifecycle
- **HttpClientWrapper**: Handles HTTP communication with the C2 server
- **SystemInfoCollector**: Collects comprehensive system information
- **CommandProcessor**: Processes and executes commands from the C2 server
- **Models**: Data transfer objects for communication

## Building

### Prerequisites

- .NET 6.0 SDK or later
- Windows operating system (for full functionality)

### Build Commands

```bash
# Build the solution
dotnet build

# Run tests
dotnet test

# Publish as single executable
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

## Configuration

The implant can be configured through the `ImplantConfig` class:

- **ServerUrl**: C2 server endpoint (default: http://localhost:3000)
- **CallbackInterval**: Heartbeat interval (default: 30 seconds)
- **ImplantId**: Unique identifier for the implant
- **RequestTimeout**: HTTP request timeout (default: 30 seconds)
- **UserAgent**: HTTP User-Agent string for requests

## Usage

### Basic Execution

```bash
# Run the implant
dotnet run

# Or run the published executable
SeraphC2.Implant.exe
```

### Command Types

The implant supports the following command types:

1. **shell/cmd**: Execute Windows command prompt commands
2. **powershell/ps**: Execute PowerShell commands
3. **sysinfo**: Retrieve system information
4. **ping**: Connectivity test

## API Endpoints

The implant communicates with the following C2 server endpoints:

- `POST /api/implants/register`: Initial registration with system information
- `POST /api/implants/heartbeat`: Regular heartbeat with command polling
- `POST /api/commands/result`: Send command execution results

## Security Considerations

This is a prototype implementation focused on core functionality. Production deployments should consider:

- Encryption of communication channels
- Authentication mechanisms
- Anti-detection techniques
- Process hiding and stealth features
- Persistence mechanisms

## Testing

The project includes comprehensive unit tests covering:

- System information collection
- Command processing and execution
- HTTP communication handling
- Core implant functionality

Run tests with:

```bash
dotnet test --verbosity normal
```

## Requirements Compliance

This implementation satisfies the following requirements:

- **Requirement 3.1**: Windows-compatible executable generation and deployment
- **Requirement 3.3**: Initial contact establishment within configured timeframe
- **Requirement 6.1**: Automatic system information gathering and reporting

## Development Notes

- The implant uses `System.Management` for WMI queries to gather detailed system information
- Command execution includes timeout protection (30 seconds default)
- HTTP communication includes retry logic and error handling
- All operations are logged to console for debugging purposes