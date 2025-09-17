#!/bin/bash

# Set locale to ensure consistent command output regardless of system language
export LC_ALL=C
export LANG=C

#==============================================================================
# SeraphC2 Complete Cleanup Script
# Version: 1.0.0
# Description: Complete removal script for SeraphC2 Command and Control server
# Author: SeraphC2 Team
# License: MIT
#
# This script completely removes all components installed by setup-seraphc2.sh
# and restores the system to its pre-installation state.
#==============================================================================

set -eE  # Exit on error and enable error trapping

#==============================================================================
# GLOBAL CONSTANTS
#==============================================================================

readonly SCRIPT_VERSION="1.0.0"
readonly SCRIPT_NAME="SeraphC2 Complete Cleanup"
readonly MIN_BASH_VERSION=4

# Exit codes
readonly E_SUCCESS=0
readonly E_GENERAL=1
readonly E_SUDO_REQUIRED=2
readonly E_UNSUPPORTED_OS=3
readonly E_CLEANUP_ERROR=4

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m' # No Color

# Progress indicators
readonly CHECKMARK="✓"
readonly CROSS="✗"
readonly ARROW="→"

#==============================================================================
# SERAPHC2 CONFIGURATION (from setup script)
#==============================================================================

# Default paths and configuration (matching setup script)
readonly SERVICE_USER="seraphc2"
readonly APP_DIR="/opt/seraphc2"
readonly LOG_DIR="/var/log/seraphc2"
readonly SSL_DIR="/etc/seraphc2/ssl"
readonly CONFIG_DIR="/etc/seraphc2"
readonly BACKUP_DIR="/var/backups/seraphc2"
readonly INSTALL_STATE_FILE="/var/lib/seraphc2/install_state.conf"
readonly INSTALL_LOCK_FILE="/var/lib/seraphc2/install.lock"

# Database configuration
readonly DB_NAME="seraphc2"
readonly DB_USER="seraphc2"

# Service names
readonly SERVICE_NAME="seraphc2"

# Packages that might be installed by the setup script
readonly SERAPHC2_PACKAGES=(
    "nodejs"
    "npm"
    "postgresql"
    "postgresql-contrib"
    "postgresql-client"
    "redis-server"
    "redis"
    "nginx"
    "ufw"
    "fail2ban"
    "aide"
    "tripwire"
    "libpam-pwquality"
    "unattended-upgrades"
    "yum-cron"
    "dnf-automatic"
    "iptables-persistent"
    "docker.io"
    "docker-ce"
    "docker-compose"
    "docker-compose-plugin"
)

# Global variables
SCRIPT_START_TIME=""
SCRIPT_LOG_FILE=""
CLEANUP_ERRORS=0
DRY_RUN=false
FORCE_CLEANUP=false
KEEP_PACKAGES=false

#==============================================================================
# LOGGING AND OUTPUT FUNCTIONS
#==============================================================================

# Initialize logging
init_logging() {
    SCRIPT_START_TIME=$(date +%s)
    local timestamp=$(date +%Y%m%d_%H%M%S)
    SCRIPT_LOG_FILE=$(mktemp /tmp/seraphc2_cleanup_XXXXXX.log) || {
        echo "Warning: Could not create secure log file, using fallback" >&2
        SCRIPT_LOG_FILE="/tmp/seraphc2_cleanup_${timestamp}.log"
    }
    
    touch "$SCRIPT_LOG_FILE" || {
        echo "Warning: Could not create log file at $SCRIPT_LOG_FILE" >&2
        SCRIPT_LOG_FILE="/dev/null"
    }
    
    if [[ "$SCRIPT_LOG_FILE" != "/dev/null" ]]; then
        chmod 600 "$SCRIPT_LOG_FILE" 2>/dev/null || true
    fi
    
    log_info "SeraphC2 Cleanup Script v${SCRIPT_VERSION} started"
    log_info "Log file: $SCRIPT_LOG_FILE"
}

# Log message with timestamp to file
log_to_file() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    if [[ -n "$SCRIPT_LOG_FILE" && "$SCRIPT_LOG_FILE" != "/dev/null" ]]; then
        echo "[$timestamp] [$level] $message" >> "$SCRIPT_LOG_FILE"
    fi
}

# Display informational message
log_info() {
    local message="$1"
    echo -e "${BLUE}[INFO]${NC} $message"
    log_to_file "INFO" "$message"
}

# Display success message
log_success() {
    local message="$1"
    echo -e "${GREEN}[${CHECKMARK}]${NC} $message"
    log_to_file "SUCCESS" "$message"
}

# Display warning message
log_warning() {
    local message="$1"
    echo -e "${YELLOW}[WARNING]${NC} $message" >&2
    log_to_file "WARNING" "$message"
}

# Display error message
log_error() {
    local message="$1"
    echo -e "${RED}[${CROSS}]${NC} $message" >&2
    log_to_file "ERROR" "$message"
    ((CLEANUP_ERRORS++))
}

# Show progress step with arrow
show_step() {
    local step_number="$1"
    local total_steps="$2"
    local description="$3"
    
    echo -e "\n${WHITE}[${step_number}/${total_steps}]${NC} ${ARROW} $description"
    log_to_file "STEP" "[$step_number/$total_steps] $description"
}

# Display banner
show_banner() {
    echo -e "${RED}"
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   ███████╗███████╗██████╗  █████╗ ██████╗ ██╗  ██╗ ██████╗██████╗            ║
║   ██╔════╝██╔════╝██╔══██╗██╔══██╗██╔══██╗██║  ██║██╔════╝╚════██╗           ║
║   ███████╗█████╗  ██████╔╝███████║██████╔╝███████║██║      █████╔╝           ║
║   ╚════██║██╔══╝  ██╔══██╗██╔══██║██╔═══╝ ██╔══██║██║     ██╔═══╝            ║
║   ███████║███████╗██║  ██║██║  ██║██║     ██║  ██║╚██████╗███████╗           ║
║   ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝ ╚═════╝╚══════╝           ║
║                                                                               ║
║                    Complete Cleanup Script v1.0.0                            ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# Prompt user for confirmation
confirm_action() {
    local message="$1"
    local default="${2:-n}"
    local response
    
    if [[ "$FORCE_CLEANUP" == "true" ]]; then
        log_info "Force mode enabled, automatically confirming: $message"
        return 0
    fi
    
    while true; do
        if [[ "$default" == "y" ]]; then
            read -p "$message [Y/n]: " response
            response=${response:-y}
        else
            read -p "$message [y/N]: " response
            response=${response:-n}
        fi
        
        case "$response" in
            [Yy]|[Yy][Ee][Ss])
                return 0
                ;;
            [Nn]|[Nn][Oo])
                return 1
                ;;
            *)
                echo "Please answer yes or no."
                ;;
        esac
    done
}

#==============================================================================
# SYSTEM DETECTION
#==============================================================================

# Detect operating system
detect_os() {
    log_info "Detecting operating system..."
    
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        OS_TYPE=$(echo "$ID" | tr '[:upper:]' '[:lower:]')
        OS_VERSION="$VERSION_ID"
        OS_CODENAME="$VERSION_CODENAME"
    elif [[ -f /etc/redhat-release ]]; then
        if grep -q "CentOS" /etc/redhat-release; then
            OS_TYPE="centos"
        elif grep -q "Red Hat" /etc/redhat-release; then
            OS_TYPE="rhel"
        fi
        OS_VERSION=$(grep -oE '[0-9]+\.[0-9]+' /etc/redhat-release | head -1)
    else
        log_error "Unable to detect operating system"
        return 1
    fi
    
    # Detect package manager
    if command -v apt-get >/dev/null 2>&1; then
        PACKAGE_MANAGER="apt"
    elif command -v yum >/dev/null 2>&1; then
        PACKAGE_MANAGER="yum"
    elif command -v dnf >/dev/null 2>&1; then
        PACKAGE_MANAGER="dnf"
    else
        log_error "Unable to detect package manager"
        return 1
    fi
    
    log_success "Detected OS: $OS_TYPE $OS_VERSION, Package Manager: $PACKAGE_MANAGER"
    return 0
}

#==============================================================================
# CLEANUP FUNCTIONS
#==============================================================================

# Stop and remove SeraphC2 service
cleanup_seraphc2_service() {
    log_info "Cleaning up SeraphC2 service..."
    
    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
    local service_removed=false
    
    # Stop the service if it's running
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        log_info "Stopping SeraphC2 service..."
        if [[ "$DRY_RUN" == "false" ]]; then
            systemctl stop "$SERVICE_NAME" || log_warning "Failed to stop service"
        fi
        service_removed=true
    fi
    
    # Disable the service if it's enabled
    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        log_info "Disabling SeraphC2 service..."
        if [[ "$DRY_RUN" == "false" ]]; then
            systemctl disable "$SERVICE_NAME" || log_warning "Failed to disable service"
        fi
        service_removed=true
    fi
    
    # Remove the service file
    if [[ -f "$service_file" ]]; then
        log_info "Removing service file: $service_file"
        if [[ "$DRY_RUN" == "false" ]]; then
            rm -f "$service_file" || log_warning "Failed to remove service file"
        fi
        service_removed=true
    fi
    
    # Reload systemd daemon if we made changes
    if [[ "$service_removed" == "true" && "$DRY_RUN" == "false" ]]; then
        systemctl daemon-reload || log_warning "Failed to reload systemd daemon"
    fi
    
    if [[ "$service_removed" == "true" ]]; then
        log_success "SeraphC2 service cleanup completed"
    else
        log_info "No SeraphC2 service found to clean up"
    fi
}

# Remove SeraphC2 user account
cleanup_seraphc2_user() {
    log_info "Cleaning up SeraphC2 user account..."
    
    if id "$SERVICE_USER" >/dev/null 2>&1; then
        log_info "Removing user: $SERVICE_USER"
        if [[ "$DRY_RUN" == "false" ]]; then
            # Kill any processes owned by the user
            pkill -u "$SERVICE_USER" 2>/dev/null || true
            sleep 2
            
            # Remove the user and their home directory
            userdel -r "$SERVICE_USER" 2>/dev/null || {
                log_warning "Failed to remove user with home directory, trying without -r flag"
                userdel "$SERVICE_USER" 2>/dev/null || log_warning "Failed to remove user"
            }
        fi
        log_success "User $SERVICE_USER removed"
    else
        log_info "User $SERVICE_USER does not exist"
    fi
}

# Remove SeraphC2 directories
cleanup_seraphc2_directories() {
    log_info "Cleaning up SeraphC2 directories..."
    
    local directories=(
        "$APP_DIR"
        "$LOG_DIR"
        "$SSL_DIR"
        "$CONFIG_DIR"
        "$BACKUP_DIR"
        "/var/lib/seraphc2"
        "/tmp/seraphc2"
        "/var/cache/seraphc2"
    )
    
    local removed_count=0
    
    for dir in "${directories[@]}"; do
        if [[ -d "$dir" ]]; then
            log_info "Removing directory: $dir"
            if [[ "$DRY_RUN" == "false" ]]; then
                rm -rf "$dir" || log_warning "Failed to remove directory: $dir"
            fi
            ((removed_count++))
        fi
    done
    
    if [[ $removed_count -gt 0 ]]; then
        log_success "Removed $removed_count SeraphC2 directories"
    else
        log_info "No SeraphC2 directories found to clean up"
    fi
}

# Clean up SeraphC2 database
cleanup_seraphc2_database() {
    log_info "Cleaning up SeraphC2 database..."
    
    local db_cleaned=false
    
    # Check if PostgreSQL is running
    if systemctl is-active --quiet postgresql 2>/dev/null || systemctl is-active --quiet postgresql.service 2>/dev/null; then
        # Check if database exists
        if sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
            log_info "Dropping database: $DB_NAME"
            if [[ "$DRY_RUN" == "false" ]]; then
                sudo -u postgres dropdb "$DB_NAME" 2>/dev/null || log_warning "Failed to drop database"
            fi
            db_cleaned=true
        fi
        
        # Check if database user exists
        if sudo -u postgres psql -t -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null | grep -q 1; then
            log_info "Dropping database user: $DB_USER"
            if [[ "$DRY_RUN" == "false" ]]; then
                sudo -u postgres dropuser "$DB_USER" 2>/dev/null || log_warning "Failed to drop database user"
            fi
            db_cleaned=true
        fi
        
        if [[ "$db_cleaned" == "true" ]]; then
            log_success "SeraphC2 database cleanup completed"
        else
            log_info "No SeraphC2 database components found to clean up"
        fi
    else
        log_info "PostgreSQL is not running, skipping database cleanup"
    fi
}

# Clean up Redis configuration
cleanup_redis_configuration() {
    log_info "Cleaning up Redis configuration..."
    
    local redis_conf="/etc/redis/redis.conf"
    local redis_backup="/etc/redis/redis.conf.seraphc2.backup"
    local redis_cleaned=false
    
    # Stop Redis if it's running
    if systemctl is-active --quiet redis-server 2>/dev/null || systemctl is-active --quiet redis 2>/dev/null; then
        log_info "Stopping Redis service..."
        if [[ "$DRY_RUN" == "false" ]]; then
            systemctl stop redis-server 2>/dev/null || systemctl stop redis 2>/dev/null || true
        fi
    fi
    
    # Restore original Redis configuration if backup exists
    if [[ -f "$redis_backup" ]]; then
        log_info "Restoring original Redis configuration from backup"
        if [[ "$DRY_RUN" == "false" ]]; then
            mv "$redis_backup" "$redis_conf" || log_warning "Failed to restore Redis configuration"
        fi
        redis_cleaned=true
    fi
    
    # Remove SeraphC2-specific Redis configuration
    if [[ -f "$redis_conf" ]] && grep -q "seraphc2" "$redis_conf" 2>/dev/null; then
        log_info "Removing SeraphC2-specific Redis configuration"
        if [[ "$DRY_RUN" == "false" ]]; then
            sed -i '/# SeraphC2/d' "$redis_conf" 2>/dev/null || true
            sed -i '/seraphc2/d' "$redis_conf" 2>/dev/null || true
        fi
        redis_cleaned=true
    fi
    
    # Restart Redis with clean configuration
    if [[ "$redis_cleaned" == "true" && "$DRY_RUN" == "false" ]]; then
        if systemctl is-enabled --quiet redis-server 2>/dev/null; then
            systemctl start redis-server || log_warning "Failed to restart Redis service"
        elif systemctl is-enabled --quiet redis 2>/dev/null; then
            systemctl start redis || log_warning "Failed to restart Redis service"
        fi
    fi
    
    if [[ "$redis_cleaned" == "true" ]]; then
        log_success "Redis configuration cleanup completed"
    else
        log_info "No SeraphC2 Redis configuration found to clean up"
    fi
}

# Clean up SSL certificates
cleanup_ssl_certificates() {
    log_info "Cleaning up SSL certificates..."
    
    local ssl_cleaned=false
    
    # Remove SeraphC2 SSL directory
    if [[ -d "$SSL_DIR" ]]; then
        log_info "Removing SSL directory: $SSL_DIR"
        if [[ "$DRY_RUN" == "false" ]]; then
            rm -rf "$SSL_DIR" || log_warning "Failed to remove SSL directory"
        fi
        ssl_cleaned=true
    fi
    
    # Remove Let's Encrypt certificates if they exist
    local letsencrypt_dir="/etc/letsencrypt/live"
    if [[ -d "$letsencrypt_dir" ]]; then
        for cert_dir in "$letsencrypt_dir"/*; do
            if [[ -d "$cert_dir" ]] && [[ "$(basename "$cert_dir")" =~ seraphc2 ]]; then
                log_info "Removing Let's Encrypt certificate: $(basename "$cert_dir")"
                if [[ "$DRY_RUN" == "false" ]]; then
                    rm -rf "$cert_dir" || log_warning "Failed to remove Let's Encrypt certificate"
                fi
                ssl_cleaned=true
            fi
        done
    fi
    
    if [[ "$ssl_cleaned" == "true" ]]; then
        log_success "SSL certificates cleanup completed"
    else
        log_info "No SeraphC2 SSL certificates found to clean up"
    fi
}

# Clean up firewall rules
cleanup_firewall_rules() {
    log_info "Cleaning up firewall rules..."
    
    local firewall_cleaned=false
    
    # UFW cleanup
    if command -v ufw >/dev/null 2>&1; then
        log_info "Cleaning up UFW rules..."
        if [[ "$DRY_RUN" == "false" ]]; then
            # Remove SeraphC2-specific rules
            ufw --force delete allow 3000 2>/dev/null || true
            ufw --force delete allow 8443 2>/dev/null || true
            ufw --force delete allow 8080 2>/dev/null || true
            ufw --force delete allow 'SeraphC2' 2>/dev/null || true
        fi
        firewall_cleaned=true
    fi
    
    # firewalld cleanup
    if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
        log_info "Cleaning up firewalld rules..."
        if [[ "$DRY_RUN" == "false" ]]; then
            # Remove SeraphC2-specific rules
            firewall-cmd --permanent --remove-port=3000/tcp 2>/dev/null || true
            firewall-cmd --permanent --remove-port=8443/tcp 2>/dev/null || true
            firewall-cmd --permanent --remove-port=8080/tcp 2>/dev/null || true
            firewall-cmd --reload 2>/dev/null || true
        fi
        firewall_cleaned=true
    fi
    
    # iptables cleanup (basic)
    if command -v iptables >/dev/null 2>&1; then
        log_info "Cleaning up iptables rules..."
        if [[ "$DRY_RUN" == "false" ]]; then
            # Remove SeraphC2-specific rules (this is basic - complex rules would need more specific handling)
            iptables -D INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null || true
            iptables -D INPUT -p tcp --dport 8443 -j ACCEPT 2>/dev/null || true
            iptables -D INPUT -p tcp --dport 8080 -j ACCEPT 2>/dev/null || true
            
            # Save iptables rules if iptables-persistent is installed
            if command -v iptables-save >/dev/null 2>&1; then
                iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
            fi
        fi
        firewall_cleaned=true
    fi
    
    if [[ "$firewall_cleaned" == "true" ]]; then
        log_success "Firewall rules cleanup completed"
    else
        log_info "No firewall rules found to clean up"
    fi
}

# Clean up Docker deployment
cleanup_docker_deployment() {
    log_info "Cleaning up Docker deployment..."
    
    local docker_cleaned=false
    
    # Stop and remove Docker containers
    if command -v docker >/dev/null 2>&1; then
        # Stop SeraphC2 containers
        local containers=$(docker ps -a --filter "name=seraphc2" --format "{{.Names}}" 2>/dev/null || true)
        if [[ -n "$containers" ]]; then
            log_info "Stopping and removing SeraphC2 Docker containers..."
            if [[ "$DRY_RUN" == "false" ]]; then
                echo "$containers" | xargs -r docker stop 2>/dev/null || true
                echo "$containers" | xargs -r docker rm 2>/dev/null || true
            fi
            docker_cleaned=true
        fi
        
        # Remove SeraphC2 images
        local images=$(docker images --filter "reference=*seraphc2*" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
        if [[ -n "$images" ]]; then
            log_info "Removing SeraphC2 Docker images..."
            if [[ "$DRY_RUN" == "false" ]]; then
                echo "$images" | xargs -r docker rmi 2>/dev/null || true
            fi
            docker_cleaned=true
        fi
        
        # Remove SeraphC2 volumes
        local volumes=$(docker volume ls --filter "name=seraphc2" --format "{{.Name}}" 2>/dev/null || true)
        if [[ -n "$volumes" ]]; then
            log_info "Removing SeraphC2 Docker volumes..."
            if [[ "$DRY_RUN" == "false" ]]; then
                echo "$volumes" | xargs -r docker volume rm 2>/dev/null || true
            fi
            docker_cleaned=true
        fi
        
        # Remove SeraphC2 networks
        local networks=$(docker network ls --filter "name=seraphc2" --format "{{.Name}}" 2>/dev/null || true)
        if [[ -n "$networks" ]]; then
            log_info "Removing SeraphC2 Docker networks..."
            if [[ "$DRY_RUN" == "false" ]]; then
                echo "$networks" | xargs -r docker network rm 2>/dev/null || true
            fi
            docker_cleaned=true
        fi
    fi
    
    # Remove docker-compose files
    local compose_files=("docker-compose.yml" "docker-compose.yaml" ".env")
    for file in "${compose_files[@]}"; do
        if [[ -f "$file" ]] && grep -q "seraphc2" "$file" 2>/dev/null; then
            log_info "Removing Docker Compose file: $file"
            if [[ "$DRY_RUN" == "false" ]]; then
                rm -f "$file" || log_warning "Failed to remove $file"
            fi
            docker_cleaned=true
        fi
    done
    
    if [[ "$docker_cleaned" == "true" ]]; then
        log_success "Docker deployment cleanup completed"
    else
        log_info "No SeraphC2 Docker deployment found to clean up"
    fi
}

# Clean up cron jobs and scheduled tasks
cleanup_scheduled_tasks() {
    log_info "Cleaning up scheduled tasks..."
    
    local tasks_cleaned=false
    
    # Remove cron jobs for seraphc2 user
    if id "$SERVICE_USER" >/dev/null 2>&1; then
        if crontab -u "$SERVICE_USER" -l >/dev/null 2>&1; then
            log_info "Removing cron jobs for user: $SERVICE_USER"
            if [[ "$DRY_RUN" == "false" ]]; then
                crontab -u "$SERVICE_USER" -r 2>/dev/null || log_warning "Failed to remove cron jobs"
            fi
            tasks_cleaned=true
        fi
    fi
    
    # Remove system cron jobs
    local cron_files=(
        "/etc/cron.d/seraphc2"
        "/etc/cron.daily/seraphc2"
        "/etc/cron.weekly/seraphc2"
        "/etc/cron.monthly/seraphc2"
    )
    
    for cron_file in "${cron_files[@]}"; do
        if [[ -f "$cron_file" ]]; then
            log_info "Removing cron file: $cron_file"
            if [[ "$DRY_RUN" == "false" ]]; then
                rm -f "$cron_file" || log_warning "Failed to remove $cron_file"
            fi
            tasks_cleaned=true
        fi
    done
    
    # Remove systemd timers
    local timer_files=(
        "/etc/systemd/system/seraphc2-backup.timer"
        "/etc/systemd/system/seraphc2-maintenance.timer"
        "/etc/systemd/system/seraphc2-backup.service"
        "/etc/systemd/system/seraphc2-maintenance.service"
    )
    
    for timer_file in "${timer_files[@]}"; do
        if [[ -f "$timer_file" ]]; then
            local timer_name=$(basename "$timer_file")
            
            # Stop and disable timer/service
            if systemctl is-active --quiet "$timer_name" 2>/dev/null; then
                log_info "Stopping timer/service: $timer_name"
                if [[ "$DRY_RUN" == "false" ]]; then
                    systemctl stop "$timer_name" 2>/dev/null || true
                fi
            fi
            
            if systemctl is-enabled --quiet "$timer_name" 2>/dev/null; then
                log_info "Disabling timer/service: $timer_name"
                if [[ "$DRY_RUN" == "false" ]]; then
                    systemctl disable "$timer_name" 2>/dev/null || true
                fi
            fi
            
            log_info "Removing timer/service file: $timer_file"
            if [[ "$DRY_RUN" == "false" ]]; then
                rm -f "$timer_file" || log_warning "Failed to remove $timer_file"
            fi
            tasks_cleaned=true
        fi
    done
    
    if [[ "$tasks_cleaned" == "true" ]]; then
        if [[ "$DRY_RUN" == "false" ]]; then
            systemctl daemon-reload 2>/dev/null || true
        fi
        log_success "Scheduled tasks cleanup completed"
    else
        log_info "No SeraphC2 scheduled tasks found to clean up"
    fi
}

# Remove packages installed by SeraphC2 setup
cleanup_packages() {
    if [[ "$KEEP_PACKAGES" == "true" ]]; then
        log_info "Skipping package removal (--keep-packages specified)"
        return 0
    fi
    
    log_info "Cleaning up packages installed by SeraphC2..."
    
    local packages_to_check=()
    local packages_to_remove=()
    
    # Check which packages are actually installed
    for package in "${SERAPHC2_PACKAGES[@]}"; do
        if is_package_installed "$package"; then
            packages_to_check+=("$package")
        fi
    done
    
    if [[ ${#packages_to_check[@]} -eq 0 ]]; then
        log_info "No SeraphC2-related packages found to remove"
        return 0
    fi
    
    echo ""
    log_warning "The following packages were potentially installed by SeraphC2:"
    for package in "${packages_to_check[@]}"; do
        echo "  - $package"
    done
    
    echo ""
    log_warning "WARNING: Removing these packages may affect other applications on your system!"
    log_warning "Only packages that are safe to remove will be suggested for removal."
    
    # Categorize packages by safety level
    local safe_packages=("fail2ban" "aide" "tripwire" "unattended-upgrades")
    local risky_packages=("nodejs" "npm" "postgresql" "postgresql-contrib" "redis-server" "nginx" "docker.io" "docker-ce")
    
    # Ask about safe packages
    if confirm_action "Remove security-related packages (fail2ban, aide, etc.)?" "n"; then
        for package in "${safe_packages[@]}"; do
            if [[ " ${packages_to_check[*]} " =~ " ${package} " ]]; then
                packages_to_remove+=("$package")
            fi
        done
    fi
    
    # Ask about risky packages individually
    for package in "${risky_packages[@]}"; do
        if [[ " ${packages_to_check[*]} " =~ " ${package} " ]]; then
            if confirm_action "Remove $package? (This may affect other applications)" "n"; then
                packages_to_remove+=("$package")
            fi
        fi
    done
    
    # Remove selected packages
    if [[ ${#packages_to_remove[@]} -gt 0 ]]; then
        log_info "Removing selected packages: ${packages_to_remove[*]}"
        if [[ "$DRY_RUN" == "false" ]]; then
            case "$PACKAGE_MANAGER" in
                "apt")
                    apt-get remove -y "${packages_to_remove[@]}" || log_warning "Some packages failed to remove"
                    apt-get autoremove -y || true
                    ;;
                "yum")
                    yum remove -y "${packages_to_remove[@]}" || log_warning "Some packages failed to remove"
                    ;;
                "dnf")
                    dnf remove -y "${packages_to_remove[@]}" || log_warning "Some packages failed to remove"
                    ;;
            esac
        fi
        log_success "Package removal completed"
    else
        log_info "No packages selected for removal"
    fi
}

# Check if a package is installed
is_package_installed() {
    local package="$1"
    
    case "$PACKAGE_MANAGER" in
        "apt")
            dpkg -l "$package" 2>/dev/null | grep -q "^ii"
            ;;
        "yum"|"dnf")
            rpm -q "$package" >/dev/null 2>&1
            ;;
        *)
            return 1
            ;;
    esac
}

# Clean up log files and temporary files
cleanup_logs_and_temp() {
    log_info "Cleaning up logs and temporary files..."
    
    local cleaned_count=0
    
    # System log files
    local log_files=(
        "/var/log/seraphc2*"
        "/var/log/syslog*seraphc2*"
        "/var/log/messages*seraphc2*"
        "/tmp/seraphc2*"
        "/tmp/*seraphc2*"
    )
    
    for log_pattern in "${log_files[@]}"; do
        for log_file in $log_pattern; do
            if [[ -f "$log_file" ]]; then
                log_info "Removing log file: $log_file"
                if [[ "$DRY_RUN" == "false" ]]; then
                    rm -f "$log_file" || log_warning "Failed to remove $log_file"
                fi
                ((cleaned_count++))
            fi
        done
    done
    
    # Journal logs
    if command -v journalctl >/dev/null 2>&1; then
        log_info "Cleaning up systemd journal logs for SeraphC2..."
        if [[ "$DRY_RUN" == "false" ]]; then
            journalctl --vacuum-time=1s --unit=seraphc2 2>/dev/null || true
        fi
        ((cleaned_count++))
    fi
    
    if [[ $cleaned_count -gt 0 ]]; then
        log_success "Cleaned up $cleaned_count log files and temporary files"
    else
        log_info "No log files or temporary files found to clean up"
    fi
}

#==============================================================================
# MAIN CLEANUP FUNCTION
#==============================================================================

# Perform complete cleanup
perform_complete_cleanup() {
    local total_steps=10
    
    log_info "Starting complete SeraphC2 cleanup..."
    
    # Step 1: Stop and remove SeraphC2 service
    show_step 1 $total_steps "Stopping and removing SeraphC2 service"
    cleanup_seraphc2_service
    
    # Step 2: Clean up Docker deployment (if exists)
    show_step 2 $total_steps "Cleaning up Docker deployment"
    cleanup_docker_deployment
    
    # Step 3: Clean up database
    show_step 3 $total_steps "Cleaning up SeraphC2 database"
    cleanup_seraphc2_database
    
    # Step 4: Clean up Redis configuration
    show_step 4 $total_steps "Cleaning up Redis configuration"
    cleanup_redis_configuration
    
    # Step 5: Remove directories
    show_step 5 $total_steps "Removing SeraphC2 directories"
    cleanup_seraphc2_directories
    
    # Step 6: Clean up SSL certificates
    show_step 6 $total_steps "Cleaning up SSL certificates"
    cleanup_ssl_certificates
    
    # Step 7: Clean up firewall rules
    show_step 7 $total_steps "Cleaning up firewall rules"
    cleanup_firewall_rules
    
    # Step 8: Clean up scheduled tasks
    show_step 8 $total_steps "Cleaning up scheduled tasks"
    cleanup_scheduled_tasks
    
    # Step 9: Remove SeraphC2 user
    show_step 9 $total_steps "Removing SeraphC2 user account"
    cleanup_seraphc2_user
    
    # Step 10: Clean up logs and temporary files
    show_step 10 $total_steps "Cleaning up logs and temporary files"
    cleanup_logs_and_temp
    
    # Optional: Remove packages
    if [[ "$KEEP_PACKAGES" == "false" ]]; then
        echo ""
        log_info "Package cleanup (optional)..."
        cleanup_packages
    fi
    
    echo ""
    if [[ $CLEANUP_ERRORS -eq 0 ]]; then
        log_success "Complete SeraphC2 cleanup finished successfully!"
        log_info "Your system has been restored to its pre-SeraphC2 state."
    else
        log_warning "Cleanup completed with $CLEANUP_ERRORS errors."
        log_info "Check the log file for details: $SCRIPT_LOG_FILE"
    fi
}

#==============================================================================
# HELP AND ARGUMENT PARSING
#==============================================================================

# Display help information
show_help() {
    cat << EOF
$SCRIPT_NAME v$SCRIPT_VERSION

DESCRIPTION:
    Complete removal script for SeraphC2 Command and Control server.
    This script removes all components installed by setup-seraphc2.sh
    and restores the system to its pre-installation state.

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --dry-run              Show what would be removed without actually removing it
                          Default: Perform actual cleanup

    --force               Skip all confirmation prompts and proceed with cleanup
                          Default: Prompt for confirmation on destructive actions

    --keep-packages       Don't remove packages that may be used by other applications
                          Default: Ask before removing packages

    -v, --verbose         Enable verbose output
                          Default: Standard output level

    -h, --help           Display this help message and exit

EXAMPLES:
    # Interactive cleanup (recommended)
    sudo $0

    # See what would be removed without actually removing it
    sudo $0 --dry-run

    # Force cleanup without prompts (dangerous)
    sudo $0 --force

    # Cleanup but keep packages that might be used by other apps
    sudo $0 --keep-packages

COMPONENTS REMOVED:
    - SeraphC2 systemd service
    - SeraphC2 user account
    - Application directories (/opt/seraphc2, /etc/seraphc2, etc.)
    - Database and database user
    - SSL certificates
    - Firewall rules
    - Docker containers, images, and volumes
    - Scheduled tasks (cron jobs, systemd timers)
    - Log files and temporary files
    - Configuration files and backups

PACKAGES (optional removal):
    - Node.js and npm
    - PostgreSQL
    - Redis
    - Nginx
    - Security tools (fail2ban, aide, etc.)
    - Docker and Docker Compose

WARNING:
    This script performs destructive operations and cannot be undone.
    Make sure you have backups of any important data before running.

EOF
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                log_info "Dry run mode enabled - no actual changes will be made"
                ;;
            --force)
                FORCE_CLEANUP=true
                log_info "Force mode enabled - skipping confirmation prompts"
                ;;
            --keep-packages)
                KEEP_PACKAGES=true
                log_info "Keep packages mode enabled - packages will not be removed"
                ;;
            -v|--verbose)
                set -x
                log_info "Verbose mode enabled"
                ;;
            -h|--help)
                show_help
                exit $E_SUCCESS
                ;;
            *)
                echo "Error: Unknown option: $1" >&2
                echo "Use --help to see available options" >&2
                exit $E_GENERAL
                ;;
        esac
        shift
    done
}

# Check prerequisites
check_prerequisites() {
    # Check if running as root or with sudo
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root or with sudo privileges"
        log_error "Please run: sudo $0"
        exit $E_SUDO_REQUIRED
    fi
    
    # Check bash version
    if [[ ${BASH_VERSION%%.*} -lt $MIN_BASH_VERSION ]]; then
        log_error "This script requires Bash $MIN_BASH_VERSION or higher"
        log_error "Current version: $BASH_VERSION"
        exit $E_GENERAL
    fi
    
    # Detect operating system
    if ! detect_os; then
        log_error "Failed to detect operating system"
        exit $E_UNSUPPORTED_OS
    fi
    
    log_success "Prerequisites check completed"
}

# Cleanup function called on script exit
cleanup_on_exit() {
    local exit_code=$?
    
    # Calculate script runtime
    if [[ -n "$SCRIPT_START_TIME" ]]; then
        local end_time=$(date +%s)
        local runtime=$((end_time - SCRIPT_START_TIME))
        log_info "Script runtime: ${runtime} seconds"
    fi
    
    # Final log entry
    if [[ $exit_code -eq 0 ]]; then
        log_info "Cleanup script completed successfully"
    else
        log_error "Cleanup script exited with error code: $exit_code"
    fi
    
    if [[ -n "$SCRIPT_LOG_FILE" && "$SCRIPT_LOG_FILE" != "/dev/null" ]]; then
        echo ""
        echo "Log file saved to: $SCRIPT_LOG_FILE"
    fi
    
    exit $exit_code
}

#==============================================================================
# MAIN EXECUTION
#==============================================================================

# Set up error handling
trap cleanup_on_exit EXIT
trap 'log_error "Script interrupted by user"; exit $E_GENERAL' INT TERM

# Main function
main() {
    # Initialize logging
    init_logging
    
    # Show banner
    show_banner
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Check prerequisites
    check_prerequisites
    
    # Show warning and get confirmation
    echo ""
    log_warning "WARNING: This script will completely remove SeraphC2 and all its components!"
    log_warning "This operation cannot be undone."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Running in DRY RUN mode - no actual changes will be made"
    else
        echo ""
        if ! confirm_action "Are you sure you want to proceed with the complete cleanup?" "n"; then
            log_info "Cleanup cancelled by user"
            exit $E_SUCCESS
        fi
    fi
    
    # Perform the cleanup
    perform_complete_cleanup
    
    # Final summary
    echo ""
    echo "========================================"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN completed. No actual changes were made."
        log_info "Run without --dry-run to perform the actual cleanup."
    else
        log_success "SeraphC2 cleanup completed!"
        if [[ $CLEANUP_ERRORS -eq 0 ]]; then
            log_info "Your system has been successfully restored to its pre-SeraphC2 state."
        else
            log_warning "Cleanup completed with $CLEANUP_ERRORS errors. Check the log for details."
        fi
    fi
    echo "========================================"
}

# Run main function with all arguments
main "$@"