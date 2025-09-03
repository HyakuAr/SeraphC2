# SeraphC2

![SeraphC2 Logo](docs/assets/seraphc2-logo.png)

SeraphC2 is an advanced Command and Control (C2) framework designed for Windows environments, featuring sophisticated evasion techniques, multi-protocol communication, and scalable operations management.

## Features

- **Multi-Protocol Communication**: HTTP/HTTPS, DNS tunneling, SMB named pipes, WebSocket
- **Advanced Evasion**: Process hollowing, API unhooking, traffic obfuscation
- **Web Management Interface**: React-based dashboard with real-time monitoring
- **Modular Architecture**: Dynamic task loading and plugin system
- **Multi-Operator Support**: Role-based access control and collaboration features
- **Scalable Infrastructure**: Distributed server architecture with load balancing
- **Comprehensive Logging**: Full audit trails and operational analytics

## Quick Start

### Prerequisites

- **Supported Operating System** (see [Compatibility](#compatibility) section)
- Node.js 20+ and npm
- PostgreSQL 13+ (automatically installed by setup script)
- Redis 6+ (automatically installed by setup script)
- Docker and Docker Compose (optional, for containerized deployment)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/seraphc2/seraphc2.git
cd seraphc2
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Build the project:
```bash
npm run build
```

5. Start the server:
```bash
npm start
```

## Compatibility

### Supported Operating Systems

SeraphC2 requires **PostgreSQL 13+** which limits compatibility to newer operating system versions. The following operating systems are officially supported:

#### Ubuntu
- ✅ **Ubuntu 22.04 LTS (Jammy)** - Recommended
- ✅ **Ubuntu 24.04 LTS (Noble)** - Latest LTS
- ❌ **Ubuntu 20.04 LTS (Focal)** - Only provides PostgreSQL 12
- ❌ **Ubuntu 18.04 LTS (Bionic)** - End of standard support

#### Debian
- ✅ **Debian 12 (Bookworm)** - Latest stable
- ✅ **Debian 11 (Bullseye)** - Previous stable
- ❌ **Debian 10 (Buster)** - Only provides PostgreSQL 11

#### Red Hat Enterprise Linux (RHEL)
- ✅ **RHEL 9** - Latest
- ✅ **RHEL 8** - Supported
- ❌ **RHEL 7** - End of life, limited PostgreSQL 13+ support

#### CentOS / Rocky Linux / AlmaLinux
- ✅ **Rocky Linux 9** - Recommended RHEL alternative
- ✅ **Rocky Linux 8** - Supported
- ✅ **AlmaLinux 9** - Recommended RHEL alternative
- ✅ **AlmaLinux 8** - Supported
- ❌ **CentOS 7** - End of life
- ❌ **CentOS 8** - End of life (use Rocky/Alma instead)

#### Fedora
- ✅ **Fedora 39** - Latest
- ✅ **Fedora 38** - Supported
- ✅ **Fedora 37** - Supported
- ✅ **Fedora 36** - Supported
- ✅ **Fedora 35** - Minimum supported
- ❌ **Fedora 34 and older** - PostgreSQL 13+ not available

### System Requirements

#### Minimum Requirements
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB free space
- **Network**: Internet connection for installation

#### Recommended Requirements
- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 50GB+ SSD
- **Network**: Stable internet connection

### Database Requirements

- **PostgreSQL**: Version 13 or higher (required)
- **Redis**: Version 6 or higher (required)

### Node.js Requirements

- **Node.js**: Version 20 or higher
- **npm**: Version 9 or higher (comes with Node.js 20+)

### Migration from Unsupported Systems

If you're currently running an unsupported operating system, here are the recommended upgrade paths:

#### From Ubuntu 20.04
```bash
# Upgrade to Ubuntu 22.04 LTS
sudo do-release-upgrade
```

#### From Ubuntu 18.04
```bash
# Upgrade to Ubuntu 20.04 first, then to 22.04
sudo do-release-upgrade
# Then upgrade again to 22.04
sudo do-release-upgrade
```

#### From CentOS 7/8
```bash
# Migrate to Rocky Linux 9 (recommended)
# Follow Rocky Linux migration guide:
# https://docs.rockylinux.org/guides/migrate2rocky/
```

#### From Debian 10
```bash
# Upgrade to Debian 11
sudo apt update && sudo apt upgrade
sudo sed -i 's/buster/bullseye/g' /etc/apt/sources.list
sudo apt update && sudo apt full-upgrade
```

### Compatibility Check

The SeraphC2 setup script automatically validates OS compatibility before installation:

```bash
# The script will check your OS and stop if incompatible
sudo ./setup-seraphc2.sh
```

If your OS is incompatible, you'll see a detailed error message with upgrade recommendations.

For detailed compatibility information, migration guides, and troubleshooting, see [COMPATIBILITY.md](COMPATIBILITY.md).

### Docker Alternative

For unsupported systems, you can use Docker to run SeraphC2:

```bash
# Use Docker on any system with Docker support
docker-compose up -d
```

This bypasses OS-level PostgreSQL requirements by running everything in containers.

### Development

Start development server with hot reload:

Start development server with hot reload:
```bash
npm run dev
```

Run tests:
```bash
npm test
```

Run linting and formatting:
```bash
npm run lint
npm run format
```

## Architecture

SeraphC2 follows a modular architecture with the following components:

- **C2 Server Core**: Central orchestration and management
- **Protocol Handlers**: Multi-protocol communication layer
- **Web Interface**: React-based management dashboard
- **Windows Implants**: Lightweight, stealthy agents
- **Task System**: Automated scheduling and execution
- **Module Framework**: Dynamic post-exploitation capabilities

## Documentation

- [Installation Guide](docs/installation.md)
- [Configuration Reference](docs/configuration.md)
- [API Documentation](docs/api.md)
- [Development Guide](docs/development.md)
- [Security Considerations](docs/security.md)

## Project Structure

```
seraphc2/
├── src/                    # Source code
│   ├── core/              # Core engine components
│   ├── protocols/         # Communication protocols
│   ├── web/               # Web interface
│   ├── implant/           # Implant generation
│   ├── utils/             # Utility functions
│   └── types/             # TypeScript definitions
├── tests/                 # Test suites
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── e2e/               # End-to-end tests
├── docs/                  # Documentation
├── docker/                # Docker configurations
└── dist/                  # Compiled output
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and development process.

## Security

SeraphC2 is designed for authorized security testing and research purposes only. Users are responsible for ensuring compliance with applicable laws and regulations.

For security vulnerabilities, please see [SECURITY.md](SECURITY.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This software is provided for educational and authorized testing purposes only. The authors and contributors are not responsible for any misuse or damage caused by this software. Users must ensure they have proper authorization before using this tool in any environment.

---

**SeraphC2** - Advanced Command and Control Framework