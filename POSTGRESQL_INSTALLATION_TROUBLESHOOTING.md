# PostgreSQL Installation Troubleshooting Guide

## Issue Description

The SeraphC2 setup script is failing during PostgreSQL installation with the following error pattern:

```
[WARNING] PostgreSQL 12.22 is installed but does not meet minimum requirements
[INFO] Proceeding with installation of newer version...
[INFO] Attempting to install PostgreSQL 15...
[WARNING] PostgreSQL 15 not available, trying PostgreSQL 14...
[WARNING] Specific PostgreSQL versions not available, trying default packages...
[✗] Failed to install any PostgreSQL packages
[✗] Error occurred on line 14700: Command 'return $E_DATABASE_ERROR' exited with status 6
[✗] Database setup failed. Check PostgreSQL installation and permissions.
```

## Root Causes

1. **Repository Configuration Issues**: The PostgreSQL official repository may not be properly configured for your Ubuntu version
2. **Package Conflicts**: Existing PostgreSQL 12 installation may conflict with newer versions
3. **GPG Key Issues**: Deprecated `apt-key` usage or corrupted GPG keys
4. **Network/Repository Access**: Issues accessing the PostgreSQL official repository
5. **Package Cache Problems**: Outdated or corrupted package cache

## Automatic Fix (Recommended)

**Good news!** The PostgreSQL installation fixes have been integrated directly into the main setup script. When you run the SeraphC2 setup and encounter PostgreSQL installation issues, the script will automatically:

1. Detect the installation failure
2. Clean up problematic repository configurations
3. Re-add repositories using modern methods
4. Retry the installation with fallback options
5. Continue with the setup process

Simply run the setup script normally:

```bash
sudo ./setup-seraphc2.sh
```

If PostgreSQL installation fails initially, you'll see messages like:
```
[WARNING] PostgreSQL installation failed, attempting automatic recovery...
[INFO] Starting PostgreSQL installation recovery process...
[INFO] Step 1: Cleaning up problematic repository configurations...
```

The script will handle the recovery automatically and continue.

## Manual Fix (If Needed)

If the automatic recovery doesn't work, you can still use the standalone fix script:

### Step 1: Run the Standalone Fix Script

```bash
# Run the PostgreSQL installation fix script
sudo ./postgresql-installation-fix.sh
```

### Step 2: Resume SeraphC2 Installation

```bash
sudo ./setup-seraphc2.sh
```

## Manual Fix Steps (Alternative)

If you prefer to fix the issue manually, follow these steps:

### 1. Clean Up Existing Repository Configuration

```bash
# Remove problematic repository files
sudo rm -f /etc/apt/sources.list.d/pgdg.list
sudo rm -f /usr/share/keyrings/postgresql-archive-keyring.gpg

# Clean up old GPG keys (deprecated method)
sudo apt-key del ACCC4CF8 2>/dev/null || true

# Update package cache
sudo apt-get update
```

### 2. Install Dependencies

```bash
sudo apt-get install -y wget gnupg lsb-release
```

### 3. Add PostgreSQL Repository (Modern Method)

```bash
# Create keyrings directory
sudo mkdir -p /usr/share/keyrings

# Download and add PostgreSQL GPG key
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
    sudo gpg --dearmor -o /usr/share/keyrings/postgresql-archive-keyring.gpg

# Detect your Ubuntu codename
CODENAME=$(lsb_release -cs)

# Add repository with proper signed-by option
echo "deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] http://apt.postgresql.org/pub/repos/apt/ $CODENAME-pgdg main" | \
    sudo tee /etc/apt/sources.list.d/pgdg.list

# Update package cache
sudo apt-get update
```

### 4. Install PostgreSQL

```bash
# Try PostgreSQL 15 first
if sudo apt-get install -y postgresql-15 postgresql-client-15 postgresql-contrib-15; then
    echo "PostgreSQL 15 installed successfully"
elif sudo apt-get install -y postgresql-14 postgresql-client-14 postgresql-contrib-14; then
    echo "PostgreSQL 14 installed successfully"
else
    # Fallback to system packages
    sudo apt-get install -y postgresql postgresql-client postgresql-contrib
    echo "System PostgreSQL packages installed"
fi
```

### 5. Start and Enable PostgreSQL

```bash
# Start PostgreSQL service
sudo systemctl start postgresql

# Enable PostgreSQL to start on boot
sudo systemctl enable postgresql

# Verify it's running
sudo systemctl status postgresql
```

### 6. Test PostgreSQL

```bash
# Test database connection
sudo -u postgres psql -c "SELECT version();"
```

## Common Issues and Solutions

### Issue: "Repository not found" or "404 errors"

**Solution**: Your Ubuntu version might not be supported by the PostgreSQL repository. Use system packages instead:

```bash
sudo apt-get install -y postgresql postgresql-client postgresql-contrib
```

### Issue: "GPG key verification failed"

**Solution**: Re-download the GPG key:

```bash
sudo rm -f /usr/share/keyrings/postgresql-archive-keyring.gpg
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
    sudo gpg --dearmor -o /usr/share/keyrings/postgresql-archive-keyring.gpg
```

### Issue: "Package conflicts" with existing PostgreSQL

**Solution**: Remove old PostgreSQL packages first:

```bash
# Stop PostgreSQL service
sudo systemctl stop postgresql

# Remove old packages (be careful with data!)
sudo apt-get remove --purge postgresql-12 postgresql-client-12

# Clean up
sudo apt-get autoremove
sudo apt-get autoclean

# Then install new version
sudo apt-get install -y postgresql postgresql-client postgresql-contrib
```

### Issue: "Service fails to start"

**Solution**: Check PostgreSQL logs and reinitialize if needed:

```bash
# Check logs
sudo journalctl -u postgresql -n 50

# Find PostgreSQL version
PG_VERSION=$(ls /etc/postgresql/ | head -1)

# Reinitialize cluster if needed
sudo pg_dropcluster $PG_VERSION main --stop
sudo pg_createcluster $PG_VERSION main --start
```

## Verification Checklist

After applying the fix, verify these items:

- [ ] PostgreSQL service is running: `sudo systemctl is-active postgresql`
- [ ] PostgreSQL service is enabled: `sudo systemctl is-enabled postgresql`
- [ ] Database connection works: `sudo -u postgres psql -c "SELECT 1;"`
- [ ] Version meets requirements (13+): `sudo -u postgres psql -c "SELECT version();"`

## Prevention

To prevent this issue in future installations:

1. **Keep system updated**: `sudo apt-get update && sudo apt-get upgrade`
2. **Clean package cache**: `sudo apt-get clean && sudo apt-get autoclean`
3. **Check internet connectivity** before running setup scripts
4. **Use the latest SeraphC2 setup script** which includes these fixes

## Support

If you continue to experience issues after trying these solutions:

1. Check the setup script log file (location shown in error output)
2. Run the test script: `bash test-postgresql-fix.sh`
3. Provide the full error output and system information when seeking help

## System Requirements

- Ubuntu 18.04+ (Bionic, Focal, Jammy)
- Internet connection for repository access
- Sudo privileges
- At least 1GB free disk space
- 2GB+ RAM recommended