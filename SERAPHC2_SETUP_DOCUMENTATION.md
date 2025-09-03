# SeraphC2 Automated Setup Script - Complete Documentation

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Configuration Guide](#configuration-guide)
4. [Security Best Practices](#security-best-practices)
5. [Troubleshooting Guide](#troubleshooting-guide)
6. [Maintenance and Operations](#maintenance-and-operations)
7. [Command Reference](#command-reference)
8. [System Requirements](#system-requirements)
9. [Support and Resources](#support-and-resources)

## Overview

The SeraphC2 Automated Setup Script is a comprehensive bash-based installation tool that streamlines the deployment of the SeraphC2 Command and Control server on Linux systems. The script provides a one-command installation experience that handles dependency installation, secure configuration generation, database setup, service management, and SSL certificate configuration.

### Key Features

- **One-Command Installation**: Complete C2 server setup with a single command
- **Cross-Platform Support**: Works on Ubuntu, Debian, CentOS, RHEL, and Fedora
- **Security-First Design**: Generates secure passwords, configures SSL, and applies security hardening
- **Multiple Deployment Options**: Native installation or Docker-based deployment
- **Interactive Configuration**: Customizable settings for production deployments
- **Comprehensive Rollback**: Automatic cleanup on installation failure
- **Built-in Testing**: Validates installation integrity and functionality

## Quick Start

### Basic Installation (Recommended)

```bash
# Download and run the setup script
sudo ./setup-seraphc2.sh
```

This will install SeraphC2 with secure defaults, requiring only your sudo password.

### Interactive Installation

```bash
# Interactive mode allows customization of settings
sudo ./setup-seraphc2.sh --interactive
```

### Docker Installation

```bash
# Deploy using Docker containers
sudo ./setup-seraphc2.sh --docker
```

### Production Installation with Security Hardening

```bash
# Production deployment with enhanced security
sudo ./setup-seraphc2.sh --interactive --enable-hardening --ssl-type=letsencrypt \
  --letsencrypt-email=admin@example.com --domain=c2.example.com
```

## Configuration Guide

### Installation Modes

#### Default Mode (Recommended)
- Uses secure defaults for all settings
- No user interaction required (except sudo password)
- Suitable for most deployments
- Command: `sudo ./setup-seraphc2.sh`

#### Interactive Mode
- Prompts for custom configuration options
- Allows customization of domain, ports, SSL settings
- Recommended for production deployments
- Command: `sudo ./setup-seraphc2.sh --interactive`

#### Docker Mode
- Deploys using Docker containers
- Easier to manage and update
- Good for development or containerized environments
- Command: `sudo ./setup-seraphc2.sh --docker`

### Network Configuration

| Setting | Default | Description | Recommendation |
|---------|---------|-------------|----------------|
| Domain | localhost | Server domain name | Use FQDN for production |
| HTTP Port | 3000 | Web interface port | Keep default unless conflicts |
| HTTPS Port | 8443 | Secure web interface | Use 443 for production if available |
| Implant Port | 8080 | Implant communication | Use non-standard port for security |

### SSL/TLS Configuration

#### Self-Signed Certificates (Default)
- **Pros**: Works immediately, no external dependencies
- **Cons**: Browser warnings, not suitable for production
- **Use case**: Development, testing, internal networks

#### Let's Encrypt Certificates
- **Pros**: Trusted by browsers, automatic renewal
- **Cons**: Requires public domain, internet access
- **Use case**: Production deployments with public domains
- **Command**: `--ssl-type=letsencrypt --letsencrypt-email=admin@example.com`

#### Custom Certificates
- **Pros**: Use existing certificates, full control
- **Cons**: Manual management, renewal responsibility
- **Use case**: Enterprise environments with existing PKI
- **Command**: `--ssl-type=custom --ssl-cert-path=/path/to/cert.pem --ssl-key-path=/path/to/key.pem`

### Security Configuration

#### Basic Security (Default)
- Secure passwords and secrets generation
- Firewall configuration with minimal ports
- Service user isolation
- Database and Redis authentication

#### Enhanced Security Hardening
- Additional system hardening measures
- Fail2ban installation and configuration
- Unnecessary service disabling
- Enhanced logging and monitoring
- **Command**: `--enable-hardening`

### Recommended Configurations

#### Development/Testing
```bash
sudo ./setup-seraphc2.sh --verbose
```

#### Production (Internal Network)
```bash
sudo ./setup-seraphc2.sh --interactive --enable-hardening --verbose
```

#### Production (Public Internet)
```bash
sudo ./setup-seraphc2.sh --interactive --ssl-type=letsencrypt \
  --letsencrypt-email=admin@example.com --domain=c2.example.com \
  --enable-hardening --verbose
```

#### Docker Development
```bash
sudo ./setup-seraphc2.sh --docker --verbose
```

#### Enterprise with Custom Certificates
```bash
sudo ./setup-seraphc2.sh --interactive --ssl-type=custom \
  --ssl-cert-path=/etc/ssl/certs/c2.crt --ssl-key-path=/etc/ssl/private/c2.key \
  --enable-hardening --verbose
```

## Security Best Practices

### System-Level Security

#### Operating System Updates
- Keep your OS updated with latest security patches
- Ubuntu/Debian: `sudo apt update && sudo apt upgrade`
- CentOS/RHEL: `sudo yum update`
- Enable automatic security updates where appropriate

#### User Account Security
- Use dedicated service account (seraphc2) - automatically configured
- Disable root login over SSH
- Use SSH key authentication instead of passwords
- Configure sudo with minimal required privileges

#### Firewall Configuration
- Script automatically configures firewall with minimal required ports
- Review and customize firewall rules for your environment
- Consider using fail2ban for intrusion prevention (enabled with `--enable-hardening`)
- Monitor firewall logs regularly

### Network Security

#### SSL/TLS Configuration
- Use Let's Encrypt or valid SSL certificates for production
- Avoid self-signed certificates in production environments
- Configure HTTPS redirects (automatically done by script)
- Use strong cipher suites (configured by default)

#### Network Segmentation
- Deploy C2 server in isolated network segment
- Use VPN or bastion hosts for administrative access
- Implement network monitoring and intrusion detection
- Consider using reverse proxy (Nginx) for additional security

### Application Security

#### Authentication and Authorization
- Change default admin credentials immediately after installation
- Implement strong password policies
- Use multi-factor authentication where possible
- Regularly review user accounts and permissions

#### Session Management
- Sessions are secured with JWT tokens (automatically configured)
- Session timeout is configured appropriately
- Secure session storage using Redis with authentication
- Regular session cleanup and monitoring

### Database Security

#### PostgreSQL Hardening
- Database user has minimal required privileges
- Strong random passwords generated automatically
- Local connections only (no remote access by default)
- Regular database backups with encryption
- Database logs monitored for suspicious activity

### Security Checklist

#### Pre-Installation
- [ ] System is fully updated
- [ ] Firewall is configured
- [ ] SSH is hardened
- [ ] Unnecessary services are disabled

#### Post-Installation
- [ ] Change default admin credentials
- [ ] Review firewall configuration
- [ ] Test SSL certificate configuration
- [ ] Verify backup functionality
- [ ] Review log configuration
- [ ] Test monitoring and alerting
- [ ] Document configuration changes

#### Ongoing Maintenance
- [ ] Regular security updates
- [ ] Log monitoring and analysis
- [ ] Backup verification
- [ ] Security audit reviews
- [ ] Incident response testing

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Sudo Privilege Issues
**Problem**: "This script requires sudo privileges"

**Solution**:
- Run the script with sudo: `sudo ./setup-seraphc2.sh`
- Ensure your user is in the sudo group: `sudo usermod -aG sudo $USER`
- If sudo password expires during installation, the script will attempt rollback

#### 2. Unsupported Operating System
**Problem**: "Unsupported operating system"

**Solution**:
- Verify you're running a supported OS version:
  - Ubuntu 20.04 LTS or later
  - Debian 11 or later
  - CentOS 8 or later
  - RHEL 8 or later
  - Fedora 34 or later
- Check OS version: `lsb_release -a` or `cat /etc/os-release`

#### 3. Package Installation Failures
**Problem**: Package installation fails

**Solution**:
- Update package repositories: `sudo apt update` (Ubuntu/Debian) or `sudo yum update` (CentOS/RHEL)
- Check internet connectivity: `ping -c 3 google.com`
- Verify DNS resolution: `nslookup google.com`
- Check available disk space: `df -h`
- Clear package cache: `sudo apt clean` (Ubuntu/Debian) or `sudo yum clean all` (CentOS/RHEL)

#### 4. Database Connection Issues
**Problem**: PostgreSQL connection fails

**Solution**:
- Check PostgreSQL service status: `sudo systemctl status postgresql`
- Verify PostgreSQL is listening: `sudo netstat -tlnp | grep 5432`
- Check PostgreSQL logs: `sudo journalctl -u postgresql -f`
- Verify database user exists: `sudo -u postgres psql -c "\du"`
- Test connection manually: `sudo -u postgres psql -d seraphc2`

#### 5. Redis Connection Issues
**Problem**: Redis connection fails

**Solution**:
- Check Redis service status: `sudo systemctl status redis-server`
- Verify Redis is listening: `sudo netstat -tlnp | grep 6379`
- Check Redis logs: `sudo journalctl -u redis-server -f`
- Test Redis connection: `redis-cli ping`
- Check Redis authentication: `redis-cli -a <password> ping`

#### 6. SSL Certificate Issues
**Problem**: SSL certificate generation or validation fails

**Solution**:
- For self-signed certificates: Ensure openssl is installed
- For Let's Encrypt: Verify domain points to your server's IP
- Check certificate permissions: `ls -la /etc/seraphc2/ssl/`
- Verify certificate validity: `openssl x509 -in /etc/seraphc2/ssl/server.crt -text -noout`

#### 7. Service Startup Issues
**Problem**: SeraphC2 service fails to start

**Solution**:
- Check service status: `sudo systemctl status seraphc2`
- View service logs: `sudo journalctl -u seraphc2 -f`
- Verify application files exist: `ls -la /opt/seraphc2/`
- Check file permissions: `ls -la /opt/seraphc2/dist/`
- Test manual startup: `sudo -u seraphc2 node /opt/seraphc2/dist/index.js`

#### 8. Firewall Connectivity Issues
**Problem**: Cannot access web interface

**Solution**:
- Check if service is running: `sudo systemctl status seraphc2`
- Verify ports are open: `sudo netstat -tlnp | grep -E "(3000|8443|8080)"`
- Check firewall status: `sudo ufw status` (Ubuntu) or `sudo firewall-cmd --list-all` (CentOS/RHEL)
- Test local connectivity: `curl -k https://localhost:8443`
- Check from remote: `telnet <server-ip> 8443`

### Diagnostic Commands

```bash
# System information
uname -a && lsb_release -a

# Memory and disk usage
free -h && df -h

# Service status
sudo systemctl status seraphc2 postgresql redis-server

# Network connectivity
ss -tlnp | grep -E "(3000|8443|8080|5432|6379)"

# Log files
sudo journalctl -u seraphc2 -n 50
```

## Maintenance and Operations

### Routine Maintenance Tasks

#### Service Health Checks
```bash
# Check service status
sudo systemctl status seraphc2

# Monitor service logs
sudo journalctl -u seraphc2 -f

# Check resource usage
htop

# Monitor disk space
df -h

# Check memory usage
free -h
```

#### Database Monitoring
```bash
# PostgreSQL status
sudo systemctl status postgresql

# Database connections
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"

# Database size
sudo -u postgres psql -d seraphc2 -c "\l+"

# Check for long-running queries
sudo -u postgres psql -d seraphc2 -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

#### Redis Monitoring
```bash
# Redis status
sudo systemctl status redis-server

# Redis info
redis-cli -a <password> info

# Memory usage
redis-cli -a <password> info memory

# Connected clients
redis-cli -a <password> info clients
```

### Log Management

#### Log Locations
- Application logs: `/var/log/seraphc2/`
- System logs: `/var/log/syslog`
- Service logs: `sudo journalctl -u seraphc2`
- Database logs: `/var/log/postgresql/`
- Redis logs: `/var/log/redis/`

#### Log Analysis
```bash
# Check for errors
grep -i error /var/log/seraphc2/*.log

# Monitor failed logins
grep -i "failed login" /var/log/seraphc2/*.log

# Check performance issues
grep -i "slow" /var/log/seraphc2/*.log
```

### Backup Operations

#### Automated Backups
- Backup script: `/usr/local/bin/seraphc2-backup`
- Backup location: `/var/backups/seraphc2/`
- Backup schedule: Daily at 2:00 AM (cron)
- Check backup status: `ls -la /var/backups/seraphc2/`

#### Manual Backup
```bash
# Run backup manually
sudo /usr/local/bin/seraphc2-backup

# Database backup
sudo -u postgres pg_dump seraphc2 > backup.sql

# Configuration backup
sudo tar -czf config-backup.tar.gz /etc/seraphc2/ /opt/seraphc2/.env
```

### Update Management

#### Checking for Updates
```bash
# Check script updates
sudo ./setup-seraphc2.sh --update-check

# Check system updates
sudo apt list --upgradable  # Ubuntu/Debian
```

#### Applying Updates
```bash
# Update all components
sudo ./setup-seraphc2.sh --update

# Update specific component
sudo ./setup-seraphc2.sh --update --component=seraphc2

# System updates
sudo apt update && sudo apt upgrade
```

### Maintenance Schedule

#### Daily
- [ ] Check service status
- [ ] Review error logs
- [ ] Monitor disk space
- [ ] Verify backup completion

#### Weekly
- [ ] Review security logs
- [ ] Check for updates
- [ ] Analyze performance metrics
- [ ] Test backup restoration

#### Monthly
- [ ] Full system backup verification
- [ ] Security audit review
- [ ] Performance optimization
- [ ] Update documentation
- [ ] Review and rotate logs

#### Quarterly
- [ ] Disaster recovery testing
- [ ] Security assessment
- [ ] Configuration review
- [ ] Capacity planning review

## Command Reference

### Basic Commands

```bash
# Basic installation
sudo ./setup-seraphc2.sh

# Interactive installation
sudo ./setup-seraphc2.sh --interactive

# Docker installation
sudo ./setup-seraphc2.sh --docker

# Verbose output
sudo ./setup-seraphc2.sh --verbose

# Debug mode
sudo ./setup-seraphc2.sh --debug
```

### SSL Configuration

```bash
# Let's Encrypt SSL
sudo ./setup-seraphc2.sh --ssl-type=letsencrypt --letsencrypt-email=admin@example.com

# Custom SSL certificates
sudo ./setup-seraphc2.sh --ssl-type=custom --ssl-cert-path=/path/to/cert.pem --ssl-key-path=/path/to/key.pem
```

### Security Options

```bash
# Enable security hardening
sudo ./setup-seraphc2.sh --enable-hardening

# Skip backup configuration
sudo ./setup-seraphc2.sh --skip-backup
```

### Update and Maintenance

```bash
# Check for updates
sudo ./setup-seraphc2.sh --update-check

# Update all components
sudo ./setup-seraphc2.sh --update

# Update specific component
sudo ./setup-seraphc2.sh --update --component=seraphc2

# Run maintenance tasks
sudo ./setup-seraphc2.sh --maintenance
```

### Help and Documentation

```bash
# Show main help
sudo ./setup-seraphc2.sh --help

# Show troubleshooting guide
sudo ./setup-seraphc2.sh --help-troubleshooting

# Show configuration guide
sudo ./setup-seraphc2.sh --help-config

# Show security guide
sudo ./setup-seraphc2.sh --help-security

# Show maintenance guide
sudo ./setup-seraphc2.sh --help-maintenance

# Validate script integrity
sudo ./setup-seraphc2.sh --validate-script

# Show version information
sudo ./setup-seraphc2.sh --version
```

## System Requirements

### Supported Operating Systems
- Ubuntu 20.04 LTS or later
- Debian 11 or later
- CentOS 8 or later
- RHEL 8 or later
- Fedora 34 or later

### Hardware Requirements
- **CPU**: 2+ cores recommended
- **Memory**: Minimum 2GB RAM, 4GB+ recommended
- **Storage**: Minimum 10GB free disk space, 20GB+ recommended
- **Network**: Internet connection for package downloads

### Software Requirements
- Root or sudo privileges
- Bash 4.0 or later
- Internet connectivity
- Standard Linux utilities (curl, wget, openssl, etc.)

### Network Requirements
- Outbound internet access for package downloads
- Inbound access on configured ports (default: 3000, 8443, 8080)
- DNS resolution capability

## Support and Resources

### Documentation
- **Main Documentation**: https://github.com/seraphc2/seraphc2/wiki
- **API Documentation**: https://github.com/seraphc2/seraphc2/wiki/api
- **Security Guide**: https://github.com/seraphc2/seraphc2/wiki/security

### Community Support
- **Discussions**: https://github.com/seraphc2/seraphc2/discussions
- **Issues**: https://github.com/seraphc2/seraphc2/issues

### Getting Help

1. **Check the installation log file** (path shown during installation)
2. **Run the script with --debug** for detailed output
3. **Review this documentation** for common issues and solutions
4. **Search existing issues** on GitHub
5. **Create a new issue** with detailed information if needed

### Reporting Security Issues
For security-related issues, please email: security@seraphc2.org

### Contributing
Contributions are welcome! Please see the CONTRIBUTING.md file for guidelines.

---

**SeraphC2 Automated Setup Script v1.0.0**  
*Complete documentation for installation, configuration, and maintenance*