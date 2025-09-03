# SeraphC2 Operating System Compatibility Guide

## Overview

SeraphC2 requires **PostgreSQL 13 or higher** for its database operations. This requirement significantly impacts which operating systems can run SeraphC2, as older OS versions only provide older PostgreSQL versions in their default repositories.

## Compatibility Matrix

### ✅ Fully Supported Operating Systems

These operating systems have been tested and provide PostgreSQL 13+ either through system packages or official PostgreSQL repositories:

| Operating System | Version | PostgreSQL Version | Status | Notes |
|------------------|---------|-------------------|---------|-------|
| Ubuntu | 22.04 LTS (Jammy) | 14+ | ✅ Recommended | Long-term support until 2027 |
| Ubuntu | 24.04 LTS (Noble) | 16+ | ✅ Latest | Latest LTS release |
| Debian | 11 (Bullseye) | 13+ | ✅ Supported | Stable release |
| Debian | 12 (Bookworm) | 15+ | ✅ Recommended | Latest stable |
| RHEL | 8 | 13+ via modules | ✅ Supported | Enterprise support |
| RHEL | 9 | 13+ | ✅ Recommended | Latest enterprise |
| Rocky Linux | 8 | 13+ via modules | ✅ Supported | Free RHEL alternative |
| Rocky Linux | 9 | 13+ | ✅ Recommended | Latest free RHEL alternative |
| AlmaLinux | 8 | 13+ via modules | ✅ Supported | Free RHEL alternative |
| AlmaLinux | 9 | 13+ | ✅ Recommended | Latest free RHEL alternative |
| Fedora | 35 | 13+ | ✅ Minimum | Minimum supported version |
| Fedora | 36-40 | 14+ | ✅ Supported | Current releases |

### ❌ Unsupported Operating Systems

These operating systems cannot run SeraphC2 due to PostgreSQL version limitations:

| Operating System | Version | PostgreSQL Version | Status | Issue |
|------------------|---------|-------------------|---------|-------|
| Ubuntu | 20.04 LTS (Focal) | 12 | ❌ Unsupported | PostgreSQL too old |
| Ubuntu | 18.04 LTS (Bionic) | 10 | ❌ Unsupported | End of standard support |
| Ubuntu | 16.04 LTS (Xenial) | 9.5 | ❌ Unsupported | End of life |
| Debian | 10 (Buster) | 11 | ❌ Unsupported | PostgreSQL too old |
| Debian | 9 (Stretch) | 9.6 | ❌ Unsupported | End of life |
| CentOS | 7 | 9.2 | ❌ Unsupported | End of life |
| CentOS | 8 | 10 | ❌ Unsupported | End of life |
| RHEL | 7 | 9.2 | ❌ Unsupported | End of life approaching |
| Fedora | 34 and older | 12 or older | ❌ Unsupported | PostgreSQL too old |

## Why PostgreSQL 13+ is Required

SeraphC2 uses several PostgreSQL features that were introduced in version 13:

1. **JSON Path Expressions**: Enhanced JSON querying capabilities
2. **Improved Indexing**: Better performance for complex queries
3. **Security Enhancements**: Row-level security improvements
4. **Partitioning Features**: Better table partitioning for large datasets
5. **Monitoring Improvements**: Enhanced query performance monitoring

## Installation Behavior

### Automatic OS Detection

The SeraphC2 setup script (`setup-seraphc2.sh`) automatically detects your operating system and validates compatibility:

```bash
sudo ./setup-seraphc2.sh
```

### Compatibility Check Process

1. **OS Detection**: Identifies your distribution and version
2. **PostgreSQL Availability Check**: Verifies PostgreSQL 13+ can be installed
3. **Repository Validation**: Checks if official PostgreSQL repositories support your OS
4. **Fallback Assessment**: Determines if system packages meet requirements
5. **Final Decision**: Proceeds with installation or stops with detailed error message

### Error Messages

If your OS is incompatible, you'll see a detailed error message like this:

```
═══════════════════════════════════════════════════════════════
                INCOMPATIBLE OPERATING SYSTEM                 
═══════════════════════════════════════════════════════════════

Current OS: ubuntu 20.04
Reason: Ubuntu 20.04 only provides PostgreSQL 12, but SeraphC2 requires PostgreSQL 13+

RECOMMENDATION: Upgrade to Ubuntu 22.04 LTS or newer for PostgreSQL 13+ support

Supported Operating Systems:
  • Ubuntu 22.04 LTS (Jammy) or newer
  • Debian 11 (Bullseye) or newer
  • CentOS 8+ / Rocky Linux 8+ / AlmaLinux 8+
  • RHEL 8 or newer
  • Fedora 35 or newer

For the complete compatibility matrix, see:
https://github.com/yourusername/SeraphC2/blob/main/COMPATIBILITY.md

═══════════════════════════════════════════════════════════════
```

## Migration Strategies

### From Ubuntu 20.04 to 22.04

```bash
# Update current system
sudo apt update && sudo apt upgrade -y

# Install update manager
sudo apt install update-manager-core -y

# Perform release upgrade
sudo do-release-upgrade

# Reboot after upgrade
sudo reboot
```

### From Ubuntu 18.04 to 22.04

```bash
# First upgrade to 20.04
sudo do-release-upgrade

# Then upgrade to 22.04
sudo do-release-upgrade
```

### From CentOS 7/8 to Rocky Linux 9

Follow the official Rocky Linux migration guide:
- [CentOS 7 to Rocky Linux 9](https://docs.rockylinux.org/guides/migrate2rocky/)
- [CentOS 8 to Rocky Linux 9](https://docs.rockylinux.org/guides/migrate2rocky/)

### From Debian 10 to 11

```bash
# Update current system
sudo apt update && sudo apt upgrade -y

# Update sources.list
sudo sed -i 's/buster/bullseye/g' /etc/apt/sources.list
sudo sed -i 's/buster/bullseye/g' /etc/apt/sources.list.d/*.list

# Perform upgrade
sudo apt update
sudo apt full-upgrade -y

# Reboot
sudo reboot
```

## Alternative Deployment Methods

### Docker Deployment

If you cannot upgrade your OS, use Docker to run SeraphC2:

```bash
# Clone repository
git clone https://github.com/seraphc2/seraphc2.git
cd seraphc2

# Run with Docker Compose
docker-compose up -d
```

**Requirements for Docker deployment:**
- Docker 20.10+
- Docker Compose 2.0+
- 4GB+ RAM
- 20GB+ storage

### Virtual Machine Deployment

Run SeraphC2 in a VM with a supported OS:

1. **VMware/VirtualBox**: Create VM with Ubuntu 22.04 LTS
2. **Cloud Providers**: Use AWS/Azure/GCP with supported OS images
3. **Container Platforms**: Deploy on Kubernetes with supported base images

## Testing Your System

### Manual PostgreSQL Version Check

Check what PostgreSQL version your system provides:

```bash
# Ubuntu/Debian
apt-cache policy postgresql

# RHEL/CentOS/Rocky/Alma
yum info postgresql-server
# or
dnf info postgresql-server

# Fedora
dnf info postgresql-server
```

### Repository Availability Check

Check if PostgreSQL 13+ is available:

```bash
# Ubuntu/Debian
apt-cache search postgresql-13

# RHEL/Rocky/Alma/Fedora
yum search postgresql13-server
# or
dnf search postgresql13-server
```

## Support Policy

### Supported Versions

We officially support and test SeraphC2 on:
- Current LTS releases of Ubuntu and Debian
- Current releases of RHEL, Rocky Linux, and AlmaLinux
- Last 6 releases of Fedora

### End of Support

Operating systems are dropped from support when:
- They reach end of life from their maintainer
- PostgreSQL 13+ is no longer available or supported
- Security updates are no longer provided

### Community Support

For unsupported operating systems:
- Community-provided Docker images may be available
- Manual installation guides may exist in the community wiki
- No official support is provided

## Frequently Asked Questions

### Q: Can I manually install PostgreSQL 13+ on Ubuntu 20.04?

A: While technically possible, it's not recommended or supported. The PostgreSQL project has dropped Ubuntu 20.04 from their official repositories, making manual installation complex and potentially unstable.

### Q: Will you add support for older operating systems?

A: No. SeraphC2's PostgreSQL 13+ requirement is architectural and cannot be changed without significant feature loss. We recommend upgrading to a supported OS.

### Q: Can I use an external PostgreSQL 13+ database?

A: Yes! If you have access to a PostgreSQL 13+ database server (local or remote), you can configure SeraphC2 to use it instead of installing PostgreSQL locally.

### Q: What about Windows or macOS?

A: SeraphC2 is designed to run on Linux servers. While the client components work on Windows, the server must run on a supported Linux distribution.

### Q: How often is this compatibility matrix updated?

A: This matrix is updated with each SeraphC2 release and whenever major operating system releases occur.

---

For questions about compatibility, please open an issue on our [GitHub repository](https://github.com/seraphc2/seraphc2/issues).