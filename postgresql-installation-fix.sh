#!/bin/bash

# PostgreSQL Installation Fix Script
# This script addresses common PostgreSQL installation issues on Ubuntu systems

set -e

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

log_info "PostgreSQL Installation Fix Script"
log_info "=================================="

# Step 1: Clean up any problematic repository configurations
log_info "Step 1: Cleaning up existing PostgreSQL repository configurations..."

# Remove any existing PostgreSQL repository files
if [[ -f /etc/apt/sources.list.d/pgdg.list ]]; then
    log_info "Removing existing PostgreSQL repository file..."
    rm -f /etc/apt/sources.list.d/pgdg.list
fi

# Remove old GPG keys
if [[ -f /usr/share/keyrings/postgresql-archive-keyring.gpg ]]; then
    log_info "Removing existing PostgreSQL GPG keyring..."
    rm -f /usr/share/keyrings/postgresql-archive-keyring.gpg
fi

# Clean up any old apt-key entries (deprecated method)
apt-key list 2>/dev/null | grep -i postgresql && {
    log_info "Removing old PostgreSQL GPG keys from apt-key..."
    apt-key del ACCC4CF8 2>/dev/null || true
}

log_success "Repository cleanup completed"

# Step 2: Update package cache
log_info "Step 2: Updating package cache..."
apt-get update -qq
log_success "Package cache updated"

# Step 3: Install required dependencies
log_info "Step 3: Installing required dependencies..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wget gnupg lsb-release
log_success "Dependencies installed"

# Step 4: Detect system information
log_info "Step 4: Detecting system information..."
source /etc/os-release
OS_ID="$ID"
OS_VERSION="$VERSION_ID"
OS_CODENAME="$VERSION_CODENAME"

# Fallback codename detection if not set
if [[ -z "$OS_CODENAME" ]]; then
    case "$OS_VERSION" in
        "22.04") OS_CODENAME="jammy" ;;
        "20.04") OS_CODENAME="focal" ;;
        "18.04") OS_CODENAME="bionic" ;;
        *) 
            log_warning "Unknown Ubuntu version: $OS_VERSION, using focal as fallback"
            OS_CODENAME="focal"
            ;;
    esac
fi

log_info "Detected: $OS_ID $OS_VERSION ($OS_CODENAME)"

# Step 5: Add PostgreSQL official repository
log_info "Step 5: Adding PostgreSQL official repository..."

# Create keyrings directory
mkdir -p /usr/share/keyrings

# Download and add PostgreSQL GPG key
log_info "Downloading PostgreSQL GPG key..."
if wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-archive-keyring.gpg; then
    log_success "PostgreSQL GPG key added successfully"
else
    log_error "Failed to download PostgreSQL GPG key"
    log_info "Falling back to system packages only..."
    SKIP_OFFICIAL_REPO=true
fi

if [[ "$SKIP_OFFICIAL_REPO" != "true" ]]; then
    # Add repository
    log_info "Adding PostgreSQL repository for $OS_CODENAME..."
    echo "deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] http://apt.postgresql.org/pub/repos/apt/ $OS_CODENAME-pgdg main" > /etc/apt/sources.list.d/pgdg.list
    
    # Update package cache
    log_info "Updating package cache with new repository..."
    if apt-get update -qq; then
        log_success "PostgreSQL repository added successfully"
    else
        log_error "Failed to update package cache with PostgreSQL repository"
        log_info "Removing problematic repository and falling back to system packages..."
        rm -f /etc/apt/sources.list.d/pgdg.list
        rm -f /usr/share/keyrings/postgresql-archive-keyring.gpg
        apt-get update -qq
        SKIP_OFFICIAL_REPO=true
    fi
fi

# Step 6: Check available PostgreSQL packages
log_info "Step 6: Checking available PostgreSQL packages..."

if [[ "$SKIP_OFFICIAL_REPO" != "true" ]]; then
    # Check for PostgreSQL 15
    if apt-cache search postgresql-15 | grep -q "postgresql-15 "; then
        log_info "PostgreSQL 15 is available"
        PREFERRED_PACKAGES=("postgresql-15" "postgresql-client-15" "postgresql-contrib-15")
    elif apt-cache search postgresql-14 | grep -q "postgresql-14 "; then
        log_info "PostgreSQL 14 is available"
        PREFERRED_PACKAGES=("postgresql-14" "postgresql-client-14" "postgresql-contrib-14")
    else
        log_warning "Specific PostgreSQL versions not available, using system packages"
        PREFERRED_PACKAGES=("postgresql" "postgresql-client" "postgresql-contrib")
    fi
else
    log_info "Using system PostgreSQL packages"
    PREFERRED_PACKAGES=("postgresql" "postgresql-client" "postgresql-contrib")
fi

# Step 7: Handle existing PostgreSQL installation
log_info "Step 7: Checking existing PostgreSQL installation..."

# Check if PostgreSQL is running
if systemctl is-active --quiet postgresql 2>/dev/null; then
    log_info "PostgreSQL service is currently running"
    POSTGRES_WAS_RUNNING=true
    
    # Stop PostgreSQL service
    log_info "Stopping PostgreSQL service..."
    systemctl stop postgresql
    log_success "PostgreSQL service stopped"
else
    POSTGRES_WAS_RUNNING=false
    log_info "PostgreSQL service is not running"
fi

# Check current PostgreSQL version
CURRENT_VERSION=""
if command -v psql >/dev/null 2>&1; then
    CURRENT_VERSION=$(psql --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
    log_info "Current PostgreSQL version: $CURRENT_VERSION"
    
    # Check if current version meets requirements (13+)
    if [[ -n "$CURRENT_VERSION" ]]; then
        MAJOR_VERSION=$(echo "$CURRENT_VERSION" | cut -d'.' -f1)
        if [[ "$MAJOR_VERSION" -ge 13 ]]; then
            log_success "Current PostgreSQL version ($CURRENT_VERSION) meets requirements"
            log_info "Skipping installation, starting service if it was running..."
            if [[ "$POSTGRES_WAS_RUNNING" == "true" ]]; then
                systemctl start postgresql
                log_success "PostgreSQL service restarted"
            fi
            exit 0
        else
            log_warning "Current PostgreSQL version ($CURRENT_VERSION) does not meet requirements (need 13+)"
            log_info "Proceeding with upgrade..."
        fi
    fi
fi

# Step 8: Install PostgreSQL packages
log_info "Step 8: Installing PostgreSQL packages..."

log_info "Installing packages: ${PREFERRED_PACKAGES[*]}"
if DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${PREFERRED_PACKAGES[@]}"; then
    log_success "PostgreSQL packages installed successfully"
else
    log_error "Failed to install PostgreSQL packages"
    
    # Try with individual packages
    log_info "Trying to install packages individually..."
    FAILED_PACKAGES=()
    for package in "${PREFERRED_PACKAGES[@]}"; do
        if DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$package"; then
            log_success "Installed: $package"
        else
            log_warning "Failed to install: $package"
            FAILED_PACKAGES+=("$package")
        fi
    done
    
    if [[ ${#FAILED_PACKAGES[@]} -gt 0 ]]; then
        log_error "Failed to install some packages: ${FAILED_PACKAGES[*]}"
        log_info "Continuing with partial installation..."
    fi
fi

# Step 9: Initialize PostgreSQL cluster if needed
log_info "Step 9: Checking PostgreSQL cluster initialization..."

# Find PostgreSQL version directory
PG_VERSION=""
for version in 15 14 13 12; do
    if [[ -d "/etc/postgresql/$version" ]]; then
        PG_VERSION="$version"
        break
    fi
done

if [[ -n "$PG_VERSION" ]]; then
    log_info "Found PostgreSQL version: $PG_VERSION"
    
    # Check if cluster is initialized
    if [[ ! -d "/var/lib/postgresql/$PG_VERSION/main" ]] || [[ ! -f "/var/lib/postgresql/$PG_VERSION/main/PG_VERSION" ]]; then
        log_info "Initializing PostgreSQL cluster..."
        if sudo -u postgres /usr/lib/postgresql/$PG_VERSION/bin/initdb -D /var/lib/postgresql/$PG_VERSION/main; then
            log_success "PostgreSQL cluster initialized"
        else
            log_warning "Failed to initialize PostgreSQL cluster manually, trying with pg_createcluster..."
            if pg_createcluster $PG_VERSION main; then
                log_success "PostgreSQL cluster created"
            else
                log_error "Failed to create PostgreSQL cluster"
            fi
        fi
    else
        log_success "PostgreSQL cluster already initialized"
    fi
else
    log_warning "Could not determine PostgreSQL version directory"
fi

# Step 10: Start and enable PostgreSQL service
log_info "Step 10: Starting PostgreSQL service..."

if systemctl start postgresql; then
    log_success "PostgreSQL service started"
else
    log_error "Failed to start PostgreSQL service"
    log_info "Checking service status..."
    systemctl status postgresql --no-pager || true
    exit 1
fi

if systemctl enable postgresql; then
    log_success "PostgreSQL service enabled"
else
    log_warning "Failed to enable PostgreSQL service"
fi

# Step 11: Verify installation
log_info "Step 11: Verifying PostgreSQL installation..."

# Wait a moment for service to fully start
sleep 2

if systemctl is-active --quiet postgresql; then
    log_success "PostgreSQL service is running"
else
    log_error "PostgreSQL service is not running"
    exit 1
fi

# Test database connection
if sudo -u postgres psql -c "SELECT version();" >/dev/null 2>&1; then
    NEW_VERSION=$(sudo -u postgres psql -t -c "SELECT version();" | grep -oE 'PostgreSQL [0-9]+\.[0-9]+' | grep -oE '[0-9]+\.[0-9]+')
    log_success "PostgreSQL is working correctly"
    log_success "Installed version: $NEW_VERSION"
else
    log_error "Failed to connect to PostgreSQL database"
    exit 1
fi

log_success "PostgreSQL installation fix completed successfully!"
log_info "PostgreSQL is now ready for use"