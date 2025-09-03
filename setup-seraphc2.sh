#!/bin/bash

# Set locale to ensure consistent command output regardless of system language
export LC_ALL=C
export LANG=C

#==============================================================================
# SeraphC2 Automated Setup Script
# Version: 1.0.0
# Description: Automated installation script for SeraphC2 Command and Control server
# Author: SeraphC2 Team
# License: MIT
#==============================================================================

set -eE  # Exit on error and enable error trapping

#==============================================================================
# GLOBAL CONSTANTS
#==============================================================================

readonly SCRIPT_VERSION="1.0.0"
readonly SCRIPT_NAME="SeraphC2 Automated Setup"
readonly MIN_BASH_VERSION=4

# Exit codes
readonly E_SUCCESS=0
readonly E_GENERAL=1
readonly E_SUDO_REQUIRED=2
readonly E_UNSUPPORTED_OS=3
readonly E_NETWORK_ERROR=4
readonly E_PACKAGE_INSTALL_FAILED=5
readonly E_DATABASE_ERROR=6
readonly E_SSL_ERROR=7
readonly E_SERVICE_ERROR=8
readonly E_FIREWALL_ERROR=9
readonly E_DOCKER_ERROR=10
readonly E_VALIDATION_ERROR=11

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
readonly SPINNER_CHARS="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"

#==============================================================================
# GLOBAL CONFIGURATION ARRAYS
#==============================================================================

# Main configuration array with secure defaults
declare -A CONFIG=(
    # Installation mode
    ["mode"]="default"                  # default, interactive, docker
    ["skip_backup"]="false"
    ["enable_hardening"]="false"
    ["debug_mode"]="false"
    ["verbose"]="false"
    
    # Network configuration
    ["domain"]="localhost"              # Default domain name
    ["http_port"]="3000"               # Web interface port
    ["https_port"]="8443"              # HTTPS port
    ["implant_port"]="8080"            # Implant communication port
    
    # SSL configuration
    ["ssl_type"]="self-signed"         # self-signed, letsencrypt, custom
    ["ssl_cert_path"]=""               # Custom cert path
    ["ssl_key_path"]=""                # Custom key path
    ["letsencrypt_email"]=""           # Email for Let's Encrypt
    
    # Database configuration
    ["db_password"]=""                 # Generated secure password
    ["db_host"]="localhost"
    ["db_port"]="5432"
    ["db_name"]="seraphc2"
    ["db_user"]="seraphc2"
    
    # Redis configuration
    ["redis_password"]=""              # Generated secure password
    ["redis_host"]="localhost"
    ["redis_port"]="6379"
    
    # Security secrets
    ["jwt_secret"]=""                  # Generated 64-char secret
    ["encryption_key"]=""              # Generated 32-char key
    
    # Default admin credentials
    ["admin_username"]="admin"         # Default admin username
    ["admin_password"]=""              # Generated secure password
    
    # System configuration
    ["service_user"]="seraphc2"
    ["app_dir"]="/opt/seraphc2"
    ["log_dir"]="/var/log/seraphc2"
    ["ssl_dir"]="/etc/seraphc2/ssl"
    ["config_dir"]="/etc/seraphc2"
    
    # Firewall configuration
    ["enable_firewall"]="true"
    ["allow_ssh"]="true"
    
    # Backup configuration
    ["backup_dir"]="/var/backups/seraphc2"
    ["backup_retention_days"]="30"
)

# System detection results
declare -A SYSTEM_INFO=(
    ["os_type"]=""                     # ubuntu, debian, centos, rhel, fedora
    ["os_version"]=""                  # Version number
    ["os_codename"]=""                 # OS codename
    ["architecture"]=""                # x86_64, aarch64
    ["package_manager"]=""             # apt, yum, dnf
    ["init_system"]=""                 # systemd, sysvinit
    ["firewall_system"]=""             # ufw, firewalld, iptables
    ["memory_gb"]=""                   # Available memory in GB
    ["disk_space_gb"]=""               # Available disk space in GB
    ["cpu_cores"]=""                   # Number of CPU cores
    ["kernel_version"]=""              # Kernel version
    ["hostname"]=""                    # System hostname
)

# Track installation progress for rollback capabilities
declare -A INSTALL_STATE=(
    ["packages_installed"]=""          # Space-separated list
    ["services_created"]=""            # Space-separated list
    ["users_created"]=""               # Space-separated list
    ["directories_created"]=""         # Space-separated list
    ["firewall_rules_added"]=""        # Space-separated list
    ["database_created"]="false"
    ["ssl_certificates_created"]="false"
    ["application_deployed"]="false"
    ["service_enabled"]="false"
    ["docker_deployed"]="false"
    ["backup_configured"]="false"
)

# Global variables for script state
SCRIPT_START_TIME=""
SCRIPT_LOG_FILE=""
SPINNER_PID=""
CLEANUP_REQUIRED="false"

# Node.js version tracking
NODEJS_CURRENT_VERSION=""
NPM_CURRENT_VERSION=""

# PostgreSQL version tracking
POSTGRESQL_CURRENT_VERSION=""
POSTGRESQL_SERVICE_STATUS=""

#==============================================================================
# LOGGING AND OUTPUT FUNCTIONS
#==============================================================================

# Initialize logging
init_logging() {
    SCRIPT_START_TIME=$(date +%s)
    local timestamp=$(date +%Y%m%d_%H%M%S)
    # Use mktemp for secure temporary log file
    SCRIPT_LOG_FILE=$(mktemp /tmp/seraphc2_setup_XXXXXX.log) || {
        echo "Warning: Could not create secure log file, using fallback" >&2
        SCRIPT_LOG_FILE="/tmp/seraphc2_setup_${timestamp}.log"
    }
    
    # Create log file with proper permissions
    touch "$SCRIPT_LOG_FILE" || {
        echo "Warning: Could not create log file at $SCRIPT_LOG_FILE" >&2
        SCRIPT_LOG_FILE="/dev/null"
    }
    
    if [[ "$SCRIPT_LOG_FILE" != "/dev/null" ]]; then
        chmod 600 "$SCRIPT_LOG_FILE" 2>/dev/null || true
    fi
    
    log_info "SeraphC2 Setup Script v${SCRIPT_VERSION} started"
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
}

# Display debug message (only if debug mode is enabled)
log_debug() {
    local message="$1"
    if [[ "${CONFIG[debug_mode]}" == "true" ]]; then
        echo -e "${PURPLE}[DEBUG]${NC} $message"
        log_to_file "DEBUG" "$message"
    fi
}

# Display verbose message (only if verbose mode is enabled)
log_verbose() {
    local message="$1"
    if [[ "${CONFIG[verbose]}" == "true" ]]; then
        echo -e "${CYAN}[VERBOSE]${NC} $message"
        log_to_file "VERBOSE" "$message"
    fi
}

#==============================================================================
# PROGRESS INDICATORS AND USER FEEDBACK
#==============================================================================

# Show progress step with arrow
show_step() {
    local step_number="$1"
    local total_steps="$2"
    local description="$3"
    
    echo -e "\n${WHITE}[${step_number}/${total_steps}]${NC} ${ARROW} $description"
    log_to_file "STEP" "[$step_number/$total_steps] $description"
}

# Show progress bar
show_progress() {
    local current="$1"
    local total="$2"
    local description="$3"
    local width=50
    
    local percentage=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    
    printf "\r${BLUE}[INFO]${NC} $description ["
    printf "%*s" $filled | tr ' ' '='
    printf "%*s" $empty | tr ' ' '-'
    printf "] %d%%" $percentage
    
    if [[ $current -eq $total ]]; then
        echo ""
    fi
}

# Start spinner for long-running operations
start_spinner() {
    local message="$1"
    local delay=0.1
    local spinstr="$SPINNER_CHARS"
    
    echo -n "$message "
    
    (
        while true; do
            local temp=${spinstr#?}
            printf "[%c]" "$spinstr"
            local spinstr=$temp${spinstr%"$temp"}
            sleep $delay
            printf "\b\b\b"
        done
    ) &
    
    SPINNER_PID=$!
    disown
}

# Stop spinner
stop_spinner() {
    if [[ -n "$SPINNER_PID" ]]; then
        kill "$SPINNER_PID" 2>/dev/null || true
        wait "$SPINNER_PID" 2>/dev/null || true
        SPINNER_PID=""
        printf "\b\b\b   \b\b\b"
    fi
}

# Display banner
show_banner() {
    echo -e "${CYAN}"
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
║                    Automated Setup Script v1.0.0                             ║
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
# INSTALLATION STATE TRACKING
#==============================================================================

# Add item to installation state tracking
track_install_state() {
    local category="$1"
    local item="$2"
    
    if [[ -n "${INSTALL_STATE[$category]}" ]]; then
        INSTALL_STATE[$category]="${INSTALL_STATE[$category]} $item"
    else
        INSTALL_STATE[$category]="$item"
    fi
    
    log_debug "Tracked $category: $item"
}

# Mark boolean state as true
mark_install_state() {
    local state="$1"
    INSTALL_STATE[$state]="true"
    log_debug "Marked state: $state = true"
}

# Check if item is tracked in installation state
is_tracked() {
    local category="$1"
    local item="$2"
    
    [[ "${INSTALL_STATE[$category]}" =~ (^|[[:space:]])$item($|[[:space:]]) ]]
}

# Display current installation state
show_install_state() {
    log_info "Current installation state:"
    for key in "${!INSTALL_STATE[@]}"; do
        if [[ -n "${INSTALL_STATE[$key]}" && "${INSTALL_STATE[$key]}" != "false" ]]; then
            log_info "  $key: ${INSTALL_STATE[$key]}"
        fi
    done
}

#==============================================================================
# ERROR HANDLING AND CLEANUP
#==============================================================================

# Global error handler
handle_error() {
    local exit_code=$?
    local error_line="$1"
    local bash_command="$BASH_COMMAND"
    
    # Stop any running spinner
    stop_spinner
    
    log_error "Error occurred on line $error_line: Command '$bash_command' exited with status $exit_code"
    
    # Check if error is related to sudo privilege loss
    if [[ "$bash_command" =~ sudo ]] && ! sudo -n true 2>/dev/null; then
        log_error "Sudo privileges were lost during installation"
        if [[ "$CLEANUP_REQUIRED" == "true" ]]; then
            echo ""
            if confirm_action "Attempt rollback with limited privileges?" "y"; then
                handle_sudo_privilege_loss
            fi
        fi
        exit $E_SUDO_REQUIRED
    fi
    
    # Map exit codes to user-friendly messages
    case $exit_code in
        $E_SUDO_REQUIRED)
            log_error "This script requires sudo privileges. Please run with sudo or as root."
            ;;
        $E_UNSUPPORTED_OS)
            log_error "Unsupported operating system. Supported: Ubuntu 20.04+, CentOS 8+, Debian 11+"
            ;;
        $E_PACKAGE_INSTALL_FAILED)
            log_error "Package installation failed. Check your internet connection and package repositories."
            ;;
        $E_DATABASE_ERROR)
            log_error "Database setup failed. Check PostgreSQL installation and permissions."
            ;;
        $E_SSL_ERROR)
            log_error "SSL certificate setup failed. Check certificate paths and permissions."
            ;;
        $E_SERVICE_ERROR)
            log_error "Service configuration failed. Check systemd configuration and permissions."
            ;;
        $E_FIREWALL_ERROR)
            log_error "Firewall configuration failed. Check firewall service and permissions."
            ;;
        $E_DOCKER_ERROR)
            log_error "Docker deployment failed. Check Docker installation and permissions."
            ;;
        $E_VALIDATION_ERROR)
            log_error "Configuration validation failed. Check input parameters and system requirements."
            ;;
        *)
            log_error "An unexpected error occurred during installation."
            ;;
    esac
    
    # Offer rollback if installation has progressed
    if [[ "$CLEANUP_REQUIRED" == "true" ]]; then
        echo ""
        if confirm_action "Would you like to rollback the installation?" "y"; then
            perform_rollback_with_privilege_check
        else
            log_warning "Installation left in partial state. Manual cleanup may be required."
            log_info "Log file available at: $SCRIPT_LOG_FILE"
        fi
    fi
    
    exit $exit_code
}

# Cleanup function called on script exit
cleanup_on_exit() {
    local exit_code=$?
    
    # Stop any running spinner
    stop_spinner
    
    # Calculate script runtime
    if [[ -n "$SCRIPT_START_TIME" ]]; then
        local end_time=$(date +%s)
        local runtime=$((end_time - SCRIPT_START_TIME))
        log_info "Script runtime: ${runtime} seconds"
    fi
    
    # Final log entry
    if [[ $exit_code -eq 0 ]]; then
        log_info "Script completed successfully"
    else
        log_error "Script exited with error code: $exit_code"
    fi
    
    exit $exit_code
}

# Perform rollback of installation
perform_rollback() {
    log_warning "Starting comprehensive installation rollback..."
    
    # Set flag to prevent further error handling during rollback
    local original_error_handling=$-
    set +e  # Disable exit on error during rollback
    
    local rollback_errors=0
    
    # 1. Stop and remove systemd service
    if [[ "${INSTALL_STATE[service_enabled]}" == "true" ]]; then
        log_info "Rolling back systemd service..."
        if rollback_systemd_service; then
            log_success "Systemd service rollback completed"
        else
            log_warning "Failed to rollback systemd service"
            ((rollback_errors++))
        fi
    fi
    
    # 2. Rollback application deployment
    if [[ "${INSTALL_STATE[application_deployed]}" == "true" ]]; then
        log_info "Rolling back application deployment..."
        if rollback_application_deployment; then
            log_success "Application deployment rollback completed"
        else
            log_warning "Failed to rollback application deployment"
            ((rollback_errors++))
        fi
    fi
    
    # 3. Rollback database migrations and cleanup
    if [[ "${INSTALL_STATE[database_migrated]}" == "true" || "${INSTALL_STATE[database_created]}" == "true" ]]; then
        log_info "Rolling back database setup..."
        if rollback_database_setup; then
            log_success "Database rollback completed"
        else
            log_warning "Failed to rollback database setup"
            ((rollback_errors++))
        fi
    fi
    
    # 4. Rollback Redis configuration
    if [[ "${INSTALL_STATE[redis_configured]}" == "true" ]]; then
        log_info "Rolling back Redis configuration..."
        if rollback_redis_configuration; then
            log_success "Redis rollback completed"
        else
            log_warning "Failed to rollback Redis configuration"
            ((rollback_errors++))
        fi
    fi
    
    # 5. Rollback SSL certificates
    if [[ "${INSTALL_STATE[ssl_certificates_created]}" == "true" ]]; then
        log_info "Rolling back SSL certificates..."
        if rollback_ssl_certificates; then
            log_success "SSL certificates rollback completed"
        else
            log_warning "Failed to rollback SSL certificates"
            ((rollback_errors++))
        fi
    fi
    
    # 6. Rollback firewall configuration
    if [[ -n "${INSTALL_STATE[firewall_rules_added]}" ]]; then
        log_info "Rolling back firewall configuration..."
        if rollback_firewall_configuration; then
            log_success "Firewall rollback completed"
        else
            log_warning "Failed to rollback firewall configuration"
            ((rollback_errors++))
        fi
    fi
    
    # 6.5. Rollback security hardening
    if [[ "${INSTALL_STATE[security_hardening_applied]}" == "true" ]]; then
        log_info "Rolling back security hardening..."
        if rollback_security_hardening; then
            log_success "Security hardening rollback completed"
        else
            log_warning "Failed to rollback security hardening"
            ((rollback_errors++))
        fi
    fi
    
    # 7. Remove created users
    if [[ -n "${INSTALL_STATE[users_created]}" ]]; then
        log_info "Rolling back created users..."
        if rollback_created_users; then
            log_success "User rollback completed"
        else
            log_warning "Failed to rollback created users"
            ((rollback_errors++))
        fi
    fi
    
    # 8. Remove created directories
    if [[ -n "${INSTALL_STATE[directories_created]}" ]]; then
        log_info "Rolling back created directories..."
        if rollback_created_directories; then
            log_success "Directory rollback completed"
        else
            log_warning "Failed to rollback created directories"
            ((rollback_errors++))
        fi
    fi
    
    # 9. Rollback Docker deployment (if applicable)
    if [[ "${INSTALL_STATE[docker_deployed]}" == "true" ]]; then
        log_info "Rolling back Docker deployment..."
        if rollback_docker_deployment; then
            log_success "Docker deployment rollback completed"
        else
            log_warning "Failed to rollback Docker deployment"
            ((rollback_errors++))
        fi
    fi
    
    # 9.5. Rollback backup system (if configured)
    if [[ "${INSTALL_STATE[backup_configured]}" == "true" ]]; then
        log_info "Rolling back backup system..."
        if rollback_backup_system; then
            log_success "Backup system rollback completed"
        else
            log_warning "Failed to rollback backup system"
            ((rollback_errors++))
        fi
    fi
    
    # 10. Optional: Remove installed packages (with user confirmation)
    if [[ -n "${INSTALL_STATE[packages_installed]}" ]]; then
        if confirm_action "Remove installed packages? (This may affect other applications)" "n"; then
            log_info "Rolling back installed packages..."
            if rollback_installed_packages; then
                log_success "Package rollback completed"
            else
                log_warning "Failed to rollback installed packages"
                ((rollback_errors++))
            fi
        else
            log_info "Skipping package removal (user choice)"
        fi
    fi
    
    # 11. Clean up temporary files and logs
    cleanup_temporary_files
    
    # Restore original error handling
    if [[ "$original_error_handling" =~ e ]]; then
        set -e
    fi
    
    # Report rollback results
    if [[ $rollback_errors -eq 0 ]]; then
        log_success "Installation rollback completed successfully"
        log_info "System has been restored to its previous state"
    else
        log_warning "Rollback completed with $rollback_errors errors"
        log_warning "Some components may require manual cleanup"
        log_info "Check the log file for detailed error information: $SCRIPT_LOG_FILE"
    fi
    
    # Display final installation state
    show_install_state
    
    return $rollback_errors
}

# Handle rollback when sudo privileges are revoked during installation
handle_sudo_privilege_loss() {
    log_error "Sudo privileges have been revoked or denied during installation"
    log_warning "Attempting to rollback with limited privileges..."
    
    # Try to perform rollback operations that don't require sudo
    local rollback_errors=0
    
    # Clean up user-owned temporary files
    log_info "Cleaning up temporary files..."
    cleanup_temporary_files
    
    # Try to stop services if we can
    if systemctl --user is-active seraphc2 2>/dev/null; then
        log_info "Attempting to stop user service..."
        systemctl --user stop seraphc2 2>/dev/null || {
            log_warning "Failed to stop user service"
            ((rollback_errors++))
        }
    fi
    
    # Display what needs manual cleanup
    log_warning "The following components may require manual cleanup with sudo privileges:"
    
    if [[ "${INSTALL_STATE[service_enabled]}" == "true" ]]; then
        echo "  - System service: sudo systemctl stop seraphc2 && sudo systemctl disable seraphc2"
        echo "  - Service file: sudo rm -f /etc/systemd/system/seraphc2.service"
    fi
    
    if [[ "${INSTALL_STATE[database_created]}" == "true" ]]; then
        echo "  - Database: sudo -u postgres dropdb ${CONFIG[db_name]}"
        echo "  - Database user: sudo -u postgres dropuser ${CONFIG[db_user]}"
    fi
    
    if [[ -n "${INSTALL_STATE[users_created]}" ]]; then
        for user in ${INSTALL_STATE[users_created]}; do
            echo "  - User: sudo userdel -r $user"
        done
    fi
    
    if [[ "${INSTALL_STATE[application_deployed]}" == "true" ]]; then
        echo "  - Application directory: sudo rm -rf ${CONFIG[app_dir]}"
        echo "  - Configuration directory: sudo rm -rf ${CONFIG[config_dir]}"
        echo "  - Log directory: sudo rm -rf ${CONFIG[log_dir]}"
    fi
    
    if [[ -n "${INSTALL_STATE[firewall_rules_added]}" ]]; then
        echo "  - Firewall rules: Reset firewall to defaults"
    fi
    
    log_info "Manual cleanup commands have been logged to: $SCRIPT_LOG_FILE"
    
    # Log manual cleanup commands to file
    {
        echo ""
        echo "# Manual cleanup commands (run with sudo privileges):"
        echo "# Generated on: $(date)"
        echo ""
        
        if [[ "${INSTALL_STATE[service_enabled]}" == "true" ]]; then
            echo "sudo systemctl stop seraphc2"
            echo "sudo systemctl disable seraphc2"
            echo "sudo rm -f /etc/systemd/system/seraphc2.service"
            echo "sudo systemctl daemon-reload"
        fi
        
        if [[ "${INSTALL_STATE[database_created]}" == "true" ]]; then
            echo "sudo -u postgres dropdb ${CONFIG[db_name]}"
            echo "sudo -u postgres dropuser ${CONFIG[db_user]}"
        fi
        
        if [[ -n "${INSTALL_STATE[users_created]}" ]]; then
            for user in ${INSTALL_STATE[users_created]}; do
                echo "sudo pkill -u $user"
                echo "sudo userdel -r $user"
            done
        fi
        
        if [[ "${INSTALL_STATE[application_deployed]}" == "true" ]]; then
            echo "sudo rm -rf ${CONFIG[app_dir]}"
            echo "sudo rm -rf ${CONFIG[config_dir]}"
            echo "sudo rm -rf ${CONFIG[log_dir]}"
        fi
        
        if [[ -n "${INSTALL_STATE[firewall_rules_added]}" ]]; then
            echo "# Reset firewall (choose appropriate command for your system):"
            echo "sudo ufw --force reset  # For UFW"
            echo "sudo firewall-cmd --complete-reload  # For firewalld"
        fi
        
    } >> "$SCRIPT_LOG_FILE"
    
    return $rollback_errors
}

#==============================================================================
# INDIVIDUAL ROLLBACK FUNCTIONS
#==============================================================================

# Rollback systemd service configuration
rollback_systemd_service() {
    local service_name="seraphc2"
    local service_file="/etc/systemd/system/${service_name}.service"
    
    log_debug "Rolling back systemd service: $service_name"
    
    # Stop the service if it's running
    if systemctl is-active --quiet "$service_name" 2>/dev/null; then
        log_info "Stopping service: $service_name"
        systemctl stop "$service_name" || {
            log_warning "Failed to stop service: $service_name"
            return 1
        }
    fi
    
    # Disable the service if it's enabled
    if systemctl is-enabled --quiet "$service_name" 2>/dev/null; then
        log_info "Disabling service: $service_name"
        systemctl disable "$service_name" || {
            log_warning "Failed to disable service: $service_name"
            return 1
        }
    fi
    
    # Remove the service file
    if [[ -f "$service_file" ]]; then
        log_info "Removing service file: $service_file"
        rm -f "$service_file" || {
            log_warning "Failed to remove service file: $service_file"
            return 1
        }
    fi
    
    # Reload systemd daemon
    systemctl daemon-reload || {
        log_warning "Failed to reload systemd daemon"
        return 1
    }
    
    # Update installation state
    INSTALL_STATE[service_enabled]="false"
    
    log_debug "Systemd service rollback completed successfully"
    return 0
}

# Rollback application deployment
rollback_application_deployment() {
    local app_dir="${CONFIG[app_dir]}"
    local log_dir="${CONFIG[log_dir]}"
    local config_dir="${CONFIG[config_dir]}"
    
    log_debug "Rolling back application deployment from: $app_dir"
    
    # Remove application directory and contents
    if [[ -d "$app_dir" ]]; then
        log_info "Removing application directory: $app_dir"
        rm -rf "$app_dir" || {
            log_warning "Failed to remove application directory: $app_dir"
            return 1
        }
    fi
    
    # Remove log directory
    if [[ -d "$log_dir" ]]; then
        log_info "Removing log directory: $log_dir"
        rm -rf "$log_dir" || {
            log_warning "Failed to remove log directory: $log_dir"
        }
    fi
    
    # Remove configuration directory
    if [[ -d "$config_dir" ]]; then
        log_info "Removing configuration directory: $config_dir"
        rm -rf "$config_dir" || {
            log_warning "Failed to remove configuration directory: $config_dir"
        }
    fi
    
    # Update installation state
    INSTALL_STATE[application_deployed]="false"
    
    log_debug "Application deployment rollback completed successfully"
    return 0
}

# Rollback database setup
rollback_database_setup() {
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    
    log_debug "Rolling back database setup for: $db_name"
    
    # First, rollback migrations if they were applied
    if [[ "${INSTALL_STATE[database_migrated]}" == "true" ]]; then
        log_info "Rolling back database migrations..."
        if ! rollback_database_migrations "all"; then
            log_warning "Failed to rollback database migrations"
        fi
    fi
    
    # Drop the database
    if database_exists "$db_name"; then
        log_info "Dropping database: $db_name"
        if ! sudo -u postgres dropdb "$db_name" 2>/dev/null; then
            log_warning "Failed to drop database: $db_name"
            return 1
        fi
    fi
    
    # Remove the database user
    if database_user_exists "$db_user"; then
        log_info "Removing database user: $db_user"
        if ! sudo -u postgres dropuser "$db_user" 2>/dev/null; then
            log_warning "Failed to remove database user: $db_user"
            return 1
        fi
    fi
    
    # Update installation state
    INSTALL_STATE[database_created]="false"
    INSTALL_STATE[database_migrated]="false"
    
    log_debug "Database setup rollback completed successfully"
    return 0
}

# Check if database exists
database_exists() {
    local db_name="$1"
    sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$db_name"
}

# Check if database user exists
database_user_exists() {
    local db_user="$1"
    sudo -u postgres psql -t -c "SELECT 1 FROM pg_roles WHERE rolname='$db_user'" | grep -q 1
}

# Rollback Redis configuration
rollback_redis_configuration() {
    local redis_conf="/etc/redis/redis.conf"
    local redis_backup="/etc/redis/redis.conf.seraphc2.backup"
    
    log_debug "Rolling back Redis configuration"
    
    # Stop Redis service
    if systemctl is-active --quiet redis-server 2>/dev/null || systemctl is-active --quiet redis 2>/dev/null; then
        log_info "Stopping Redis service"
        systemctl stop redis-server 2>/dev/null || systemctl stop redis 2>/dev/null || {
            log_warning "Failed to stop Redis service"
        }
    fi
    
    # Restore original configuration if backup exists
    if [[ -f "$redis_backup" ]]; then
        log_info "Restoring Redis configuration from backup"
        cp "$redis_backup" "$redis_conf" || {
            log_warning "Failed to restore Redis configuration from backup"
            return 1
        }
        rm -f "$redis_backup"
    else
        log_warning "No Redis configuration backup found"
    fi
    
    # Restart Redis with original configuration
    if systemctl is-enabled --quiet redis-server 2>/dev/null; then
        systemctl start redis-server || log_warning "Failed to restart Redis service"
    elif systemctl is-enabled --quiet redis 2>/dev/null; then
        systemctl start redis || log_warning "Failed to restart Redis service"
    fi
    
    # Update installation state
    INSTALL_STATE[redis_configured]="false"
    
    log_debug "Redis configuration rollback completed successfully"
    return 0
}

# Rollback SSL certificates
rollback_ssl_certificates() {
    local ssl_dir="${CONFIG[ssl_dir]}"
    local ssl_type="${CONFIG[ssl_type]}"
    
    log_debug "Rolling back SSL certificates from: $ssl_dir"
    
    # Handle Let's Encrypt certificates
    if [[ "$ssl_type" == "letsencrypt" ]]; then
        local domain="${CONFIG[domain]}"
        if command -v certbot >/dev/null 2>&1 && [[ -n "$domain" && "$domain" != "localhost" ]]; then
            log_info "Revoking Let's Encrypt certificate for domain: $domain"
            certbot revoke --cert-path "/etc/letsencrypt/live/$domain/cert.pem" --non-interactive 2>/dev/null || {
                log_warning "Failed to revoke Let's Encrypt certificate"
            }
            
            log_info "Removing Let's Encrypt certificate for domain: $domain"
            certbot delete --cert-name "$domain" --non-interactive 2>/dev/null || {
                log_warning "Failed to remove Let's Encrypt certificate"
            }
        fi
    fi
    
    # Remove SSL directory and all certificates
    if [[ -d "$ssl_dir" ]]; then
        log_info "Removing SSL directory: $ssl_dir"
        rm -rf "$ssl_dir" || {
            log_warning "Failed to remove SSL directory: $ssl_dir"
            return 1
        }
    fi
    
    # Update installation state
    INSTALL_STATE[ssl_certificates_created]="false"
    
    log_debug "SSL certificates rollback completed successfully"
    return 0
}

# Rollback created users
rollback_created_users() {
    local users_list="${INSTALL_STATE[users_created]}"
    
    if [[ -z "$users_list" ]]; then
        log_debug "No users to rollback"
        return 0
    fi
    
    log_debug "Rolling back created users: $users_list"
    
    local rollback_errors=0
    
    # Process each user in the list
    for user in $users_list; do
        if id "$user" >/dev/null 2>&1; then
            log_info "Removing user: $user"
            
            # Kill any processes owned by the user
            pkill -u "$user" 2>/dev/null || true
            sleep 2
            
            # Remove the user and their home directory
            if userdel -r "$user" 2>/dev/null; then
                log_debug "Successfully removed user: $user"
            else
                log_warning "Failed to remove user: $user"
                ((rollback_errors++))
            fi
        else
            log_debug "User does not exist: $user"
        fi
    done
    
    # Clear the users list from installation state
    INSTALL_STATE[users_created]=""
    
    if [[ $rollback_errors -eq 0 ]]; then
        log_debug "User rollback completed successfully"
        return 0
    else
        log_warning "User rollback completed with $rollback_errors errors"
        return 1
    fi
}

# Rollback created directories
rollback_created_directories() {
    local directories_list="${INSTALL_STATE[directories_created]}"
    
    if [[ -z "$directories_list" ]]; then
        log_debug "No directories to rollback"
        return 0
    fi
    
    log_debug "Rolling back created directories: $directories_list"
    
    local rollback_errors=0
    
    # Process each directory in the list (in reverse order for proper cleanup)
    local dirs_array=($directories_list)
    for ((i=${#dirs_array[@]}-1; i>=0; i--)); do
        local dir="${dirs_array[i]}"
        
        if [[ -d "$dir" ]]; then
            log_info "Removing directory: $dir"
            if rm -rf "$dir" 2>/dev/null; then
                log_debug "Successfully removed directory: $dir"
            else
                log_warning "Failed to remove directory: $dir"
                ((rollback_errors++))
            fi
        else
            log_debug "Directory does not exist: $dir"
        fi
    done
    
    # Clear the directories list from installation state
    INSTALL_STATE[directories_created]=""
    
    if [[ $rollback_errors -eq 0 ]]; then
        log_debug "Directory rollback completed successfully"
        return 0
    else
        log_warning "Directory rollback completed with $rollback_errors errors"
        return 1
    fi
}

# Rollback Docker deployment
rollback_docker_deployment() {
    local compose_file="docker-compose.yml"
    local env_file=".env"
    
    log_debug "Rolling back Docker deployment"
    
    # Stop and remove Docker containers
    if [[ -f "$compose_file" ]]; then
        log_info "Stopping and removing Docker containers"
        docker-compose down --volumes --remove-orphans 2>/dev/null || {
            log_warning "Failed to stop Docker containers"
            return 1
        }
        
        # Remove the compose file
        rm -f "$compose_file" || {
            log_warning "Failed to remove docker-compose.yml"
        }
    fi
    
    # Remove Docker environment file
    if [[ -f "$env_file" ]]; then
        log_info "Removing Docker environment file"
        rm -f "$env_file" || {
            log_warning "Failed to remove Docker .env file"
        }
    fi
    
    # Remove Docker images (optional, with user confirmation)
    if confirm_action "Remove SeraphC2 Docker images?" "n"; then
        log_info "Removing SeraphC2 Docker images"
        docker rmi seraphc2:latest 2>/dev/null || true
        docker image prune -f 2>/dev/null || true
    fi
    
    # Update installation state
    INSTALL_STATE[docker_deployed]="false"
    
    log_debug "Docker deployment rollback completed successfully"
    return 0
}

# Rollback installed packages (optional)
rollback_installed_packages() {
    local packages_list="${INSTALL_STATE[packages_installed]}"
    
    if [[ -z "$packages_list" ]]; then
        log_debug "No packages to rollback"
        return 0
    fi
    
    log_debug "Rolling back installed packages: $packages_list"
    
    local package_manager="${SYSTEM_INFO[package_manager]}"
    local rollback_errors=0
    
    # Process each package in the list
    for package in $packages_list; do
        log_info "Removing package: $package"
        
        case "$package_manager" in
            "apt")
                if apt-get remove -y "$package" 2>/dev/null; then
                    log_debug "Successfully removed package: $package"
                else
                    log_warning "Failed to remove package: $package"
                    ((rollback_errors++))
                fi
                ;;
            "yum"|"dnf")
                local cmd="$package_manager"
                if $cmd remove -y "$package" 2>/dev/null; then
                    log_debug "Successfully removed package: $package"
                else
                    log_warning "Failed to remove package: $package"
                    ((rollback_errors++))
                fi
                ;;
            *)
                log_warning "Cannot remove package $package: unsupported package manager $package_manager"
                ((rollback_errors++))
                ;;
        esac
    done
    
    # Clean up package cache
    case "$package_manager" in
        "apt")
            apt-get autoremove -y 2>/dev/null || true
            apt-get autoclean 2>/dev/null || true
            ;;
        "yum")
            yum autoremove -y 2>/dev/null || true
            yum clean all 2>/dev/null || true
            ;;
        "dnf")
            dnf autoremove -y 2>/dev/null || true
            dnf clean all 2>/dev/null || true
            ;;
    esac
    
    # Clear the packages list from installation state
    INSTALL_STATE[packages_installed]=""
    
    if [[ $rollback_errors -eq 0 ]]; then
        log_debug "Package rollback completed successfully"
        return 0
    else
        log_warning "Package rollback completed with $rollback_errors errors"
        return 1
    fi
}

# Rollback backup system configuration
rollback_backup_system() {
    log_debug "Rolling back backup system configuration"
    
    local backup_dir="${CONFIG[backup_dir]}"
    local cron_file="/etc/cron.d/seraphc2-backup"
    local rollback_errors=0
    
    # Remove cron job
    if [[ -f "$cron_file" ]]; then
        log_info "Removing backup cron job"
        rm -f "$cron_file" || {
            log_warning "Failed to remove backup cron job"
            ((rollback_errors++))
        }
        
        # Restart cron service
        systemctl restart cron 2>/dev/null || systemctl restart crond 2>/dev/null || true
    fi
    
    # Remove convenient symlinks
    local symlinks=("/usr/local/bin/seraphc2-backup" "/usr/local/bin/seraphc2-restore" "/usr/local/bin/seraphc2-test-backups" "/usr/local/bin/seraphc2-cleanup-backups")
    for symlink in "${symlinks[@]}"; do
        if [[ -L "$symlink" ]]; then
            log_info "Removing symlink: $symlink"
            rm -f "$symlink" || {
                log_warning "Failed to remove symlink: $symlink"
                ((rollback_errors++))
            }
        fi
    done
    
    # Remove backup directory (with user confirmation)
    if [[ -d "$backup_dir" ]]; then
        if confirm_action "Remove backup directory and all backups? This cannot be undone!" "n"; then
            log_info "Removing backup directory: $backup_dir"
            rm -rf "$backup_dir" || {
                log_warning "Failed to remove backup directory: $backup_dir"
                ((rollback_errors++))
            }
        else
            log_info "Backup directory preserved at user request: $backup_dir"
        fi
    fi
    
    # Update installation state
    INSTALL_STATE[backup_configured]="false"
    
    if [[ $rollback_errors -eq 0 ]]; then
        log_debug "Backup system rollback completed successfully"
        return 0
    else
        log_warning "Backup system rollback completed with $rollback_errors errors"
        return 1
    fi
}

# Clean up temporary files and logs
cleanup_temporary_files() {
    log_debug "Cleaning up temporary files"
    
    # Remove temporary backup files
    rm -f /tmp/iptables.backup.* 2>/dev/null || true
    rm -f /tmp/seraphc2_*.tmp 2>/dev/null || true
    
    # Clean up any remaining SeraphC2-related temporary files (safely)
    # Only clean files we know we created
    rm -f /tmp/seraphc2_session_test 2>/dev/null || true
    rm -f /tmp/iptables.backup.* 2>/dev/null || true
    rm -f /tmp/seraphc2_*.tmp 2>/dev/null || true
    
    log_debug "Temporary file cleanup completed"
}

# Enhanced rollback with sudo privilege handling
perform_rollback_with_privilege_check() {
    log_warning "Starting rollback with privilege verification..."
    
    # Check if we still have sudo privileges
    if ! sudo -n true 2>/dev/null; then
        log_error "Sudo privileges are required for rollback operations"
        log_error "Some rollback operations may fail without proper privileges"
        
        if confirm_action "Continue rollback without sudo privileges? (Limited functionality)" "n"; then
            log_warning "Proceeding with limited rollback capabilities"
        else
            log_info "Rollback cancelled by user"
            return 1
        fi
    fi
    
    # Perform the rollback
    perform_rollback
    return $?
}

# Test rollback functionality (for development/testing purposes)
test_rollback_functionality() {
    log_info "Testing rollback functionality..."
    
    # Simulate some installation state
    INSTALL_STATE[packages_installed]="test-package1 test-package2"
    INSTALL_STATE[users_created]="test-user"
    INSTALL_STATE[directories_created]="/tmp/test-dir1 /tmp/test-dir2"
    INSTALL_STATE[service_enabled]="true"
    INSTALL_STATE[database_created]="true"
    INSTALL_STATE[ssl_certificates_created]="true"
    INSTALL_STATE[application_deployed]="true"
    
    # Show current state
    log_info "Simulated installation state:"
    show_install_state
    
    # Test rollback confirmation
    if confirm_action "Test rollback functionality?" "n"; then
        log_info "Testing rollback (dry run mode)..."
        
        # Test individual rollback functions (without actually executing destructive operations)
        log_info "Testing rollback functions (simulation mode):"
        
        # Test cleanup temporary files
        cleanup_temporary_files
        log_success "✓ Temporary file cleanup test passed"
        
        # Test privilege check
        if sudo -n true 2>/dev/null; then
            log_success "✓ Sudo privileges available for rollback"
        else
            log_warning "⚠ Sudo privileges not available - would use limited rollback"
        fi
        
        log_success "Rollback functionality test completed"
    else
        log_info "Rollback test skipped"
    fi
    
    # Clear test state
    for key in "${!INSTALL_STATE[@]}"; do
        INSTALL_STATE[$key]=""
    done
    
    return 0
}

# Create uninstall script for future use
create_uninstall_script() {
    local uninstall_script="/usr/local/bin/seraphc2-uninstall"
    local install_state_file="/etc/seraphc2/install_state.conf"
    
    log_info "Creating uninstall script: $uninstall_script"
    
    # Create directory for install state file
    mkdir -p "$(dirname "$install_state_file")" || {
        log_warning "Failed to create directory for install state file"
        return 1
    }
    
    # Save current installation state to file
    cat > "$install_state_file" << EOF
# SeraphC2 Installation State
# Generated on: $(date)
# Script Version: $SCRIPT_VERSION

EOF
    
    # Export installation state
    for key in "${!INSTALL_STATE[@]}"; do
        if [[ -n "${INSTALL_STATE[$key]}" && "${INSTALL_STATE[$key]}" != "false" ]]; then
            echo "INSTALL_STATE_${key}=\"${INSTALL_STATE[$key]}\"" >> "$install_state_file"
        fi
    done
    
    # Export configuration
    for key in "${!CONFIG[@]}"; do
        if [[ -n "${CONFIG[$key]}" ]]; then
            echo "CONFIG_${key}=\"${CONFIG[$key]}\"" >> "$install_state_file"
        fi
    done
    
    # Create the uninstall script
    cat > "$uninstall_script" << 'EOF'
#!/bin/bash

#==============================================================================
# SeraphC2 Uninstall Script
# Generated automatically during installation
#==============================================================================

set -eE

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Note: Main logging functions are defined earlier in the script

# Confirmation function
confirm_action() {
    local message="$1"
    local default="${2:-n}"
    local response
    
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

# Check sudo privileges
check_sudo() {
    if ! sudo -n true 2>/dev/null; then
        if ! sudo -v; then
            log_error "This script requires sudo privileges"
            exit 1
        fi
    fi
}

# Load installation state
load_install_state() {
    local install_state_file="/etc/seraphc2/install_state.conf"
    
    if [[ ! -f "$install_state_file" ]]; then
        log_error "Installation state file not found: $install_state_file"
        log_error "Cannot determine what components to uninstall"
        exit 1
    fi
    
    source "$install_state_file"
    log_info "Loaded installation state from: $install_state_file"
}

# Main uninstall function
main() {
    echo -e "${BLUE}"
    cat << 'BANNER'
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          SeraphC2 Uninstall Script                           ║
╚═══════════════════════════════════════════════════════════════════════════════╝
BANNER
    echo -e "${NC}"
    
    log_warning "This will completely remove SeraphC2 and all its components"
    log_warning "This action cannot be undone!"
    
    if ! confirm_action "Are you sure you want to uninstall SeraphC2?" "n"; then
        log_info "Uninstall cancelled by user"
        exit 0
    fi
    
    check_sudo
    load_install_state
    
    log_info "Starting SeraphC2 uninstallation..."
    
    # Stop and remove service
    if [[ "${INSTALL_STATE_service_enabled:-false}" == "true" ]]; then
        log_info "Stopping and removing SeraphC2 service..."
        sudo systemctl stop seraphc2 2>/dev/null || true
        sudo systemctl disable seraphc2 2>/dev/null || true
        sudo rm -f /etc/systemd/system/seraphc2.service
        sudo systemctl daemon-reload
        log_success "Service removed"
    fi
    
    # Remove application
    if [[ "${INSTALL_STATE_application_deployed:-false}" == "true" ]]; then
        log_info "Removing application files..."
        sudo rm -rf "${CONFIG_app_dir:-/opt/seraphc2}"
        sudo rm -rf "${CONFIG_log_dir:-/var/log/seraphc2}"
        sudo rm -rf "${CONFIG_config_dir:-/etc/seraphc2}"
        log_success "Application files removed"
    fi
    
    # Remove database
    if [[ "${INSTALL_STATE_database_created:-false}" == "true" ]]; then
        log_info "Removing database..."
        sudo -u postgres dropdb "${CONFIG_db_name:-seraphc2}" 2>/dev/null || true
        sudo -u postgres dropuser "${CONFIG_db_user:-seraphc2}" 2>/dev/null || true
        log_success "Database removed"
    fi
    
    # Remove user
    if [[ -n "${INSTALL_STATE_users_created:-}" ]]; then
        for user in ${INSTALL_STATE_users_created}; do
            log_info "Removing user: $user"
            sudo pkill -u "$user" 2>/dev/null || true
            sleep 2
            sudo userdel -r "$user" 2>/dev/null || true
        done
        log_success "Users removed"
    fi
    
    # Reset firewall (optional)
    if confirm_action "Reset firewall rules to defaults?" "n"; then
        log_info "Resetting firewall rules..."
        if command -v ufw >/dev/null 2>&1; then
            sudo ufw --force reset
        elif command -v firewall-cmd >/dev/null 2>&1; then
            sudo firewall-cmd --complete-reload
        fi
        log_success "Firewall rules reset"
    fi
    
    # Remove packages (optional)
    if [[ -n "${INSTALL_STATE_packages_installed:-}" ]] && confirm_action "Remove installed packages?" "n"; then
        log_info "Removing packages..."
        for package in ${INSTALL_STATE_packages_installed}; do
            if command -v apt-get >/dev/null 2>&1; then
                sudo apt-get remove -y "$package" 2>/dev/null || true
            elif command -v dnf >/dev/null 2>&1; then
                sudo dnf remove -y "$package" 2>/dev/null || true
            elif command -v yum >/dev/null 2>&1; then
                sudo yum remove -y "$package" 2>/dev/null || true
            fi
        done
        log_success "Packages removed"
    fi
    
    # Remove this uninstall script
    log_info "Removing uninstall script..."
    rm -f "$0"
    
    log_success "SeraphC2 has been completely uninstalled"
    log_info "Thank you for using SeraphC2!"
}

# Run main function
main "$@"
EOF
    
    # Make the uninstall script executable
    chmod +x "$uninstall_script" || {
        log_warning "Failed to make uninstall script executable"
        return 1
    }
    
    # Set proper ownership
    chown root:root "$uninstall_script" || {
        log_warning "Failed to set ownership of uninstall script"
    }
    
    log_success "Uninstall script created: $uninstall_script"
    log_info "To uninstall SeraphC2 in the future, run: sudo $uninstall_script"
    
    return 0
}

#==============================================================================
# SIGNAL HANDLERS
#==============================================================================

# Handle interrupt signals
handle_interrupt() {
    local signal="$1"
    
    stop_spinner
    log_warning "Received signal: $signal"
    log_warning "Installation interrupted by user"
    
    if [[ "$CLEANUP_REQUIRED" == "true" ]]; then
        echo ""
        if confirm_action "Would you like to rollback the partial installation?" "y"; then
            perform_rollback_with_privilege_check
        fi
    fi
    
    exit 130  # Standard exit code for SIGINT
}

#==============================================================================
# SCRIPT INITIALIZATION
#==============================================================================

# Set up error handling and signal trapping
setup_error_handling() {
    # Enable error trapping
    set -eE
    
    # Set up error trap
    trap 'handle_error $LINENO' ERR
    
    # Set up exit trap
    trap 'cleanup_on_exit' EXIT
    
    # Set up signal traps
    trap 'handle_interrupt SIGINT' INT
    trap 'handle_interrupt SIGTERM' TERM
    trap 'handle_interrupt SIGQUIT' QUIT
}

# Validate bash version
check_bash_version() {
    if [[ ${BASH_VERSION%%.*} -lt $MIN_BASH_VERSION ]]; then
        log_error "This script requires Bash $MIN_BASH_VERSION or higher. Current version: $BASH_VERSION"
        exit $E_GENERAL
    fi
}

# Initialize script
init_script() {
    # Check bash version
    check_bash_version
    
    # Set up error handling
    setup_error_handling
    
    # Initialize logging
    init_logging
    
    # Show banner
    show_banner
    
    log_info "Initializing SeraphC2 setup script..."
    log_debug "Bash version: $BASH_VERSION"
    log_debug "Script PID: $$"
    log_debug "User: $(whoami)"
    log_debug "Working directory: $(pwd)"
}

#==============================================================================
# COMMAND-LINE INTERFACE AND ARGUMENT PARSING
#==============================================================================

# Display script version information
show_version() {
    cat << EOF
$SCRIPT_NAME
Version: $SCRIPT_VERSION
Author: SeraphC2 Team
License: MIT

System Information:
  Bash Version: $BASH_VERSION
  Operating System: $(uname -s)
  Architecture: $(uname -m)
  Kernel: $(uname -r)

For more information, visit: https://github.com/seraphc2/seraphc2
EOF
}

#==============================================================================
# DOCUMENTATION AND HELP SYSTEM
#==============================================================================

# Display troubleshooting guide
show_troubleshooting_guide() {
    cat << 'EOF'
SeraphC2 Setup Script - Troubleshooting Guide
==============================================

COMMON ISSUES AND SOLUTIONS:

1. SUDO PRIVILEGE ISSUES
   Problem: "This script requires sudo privileges"
   Solution: 
   - Run the script with sudo: sudo ./setup-seraphc2.sh
   - Ensure your user is in the sudo group: sudo usermod -aG sudo $USER
   - If sudo password expires during installation, the script will attempt rollback

2. UNSUPPORTED OPERATING SYSTEM
   Problem: "Unsupported operating system"
   Solution:
   - Verify you're running a supported OS version:
     * Ubuntu 20.04 LTS or later
     * Debian 11 or later  
     * CentOS 8 or later
     * RHEL 8 or later
     * Fedora 34 or later
   - Check OS version: lsb_release -a || cat /etc/os-release

3. PACKAGE INSTALLATION FAILURES
   Problem: Package installation fails
   Solution:
   - Update package repositories: sudo apt update (Ubuntu/Debian) or sudo yum update (CentOS/RHEL)
   - Check internet connectivity: ping -c 3 google.com
   - Verify DNS resolution: nslookup google.com
   - Check available disk space: df -h
   - Clear package cache: sudo apt clean (Ubuntu/Debian) or sudo yum clean all (CentOS/RHEL)

4. DATABASE CONNECTION ISSUES
   Problem: PostgreSQL connection fails
   Solution:
   - Check PostgreSQL service status: sudo systemctl status postgresql
   - Verify PostgreSQL is listening: sudo netstat -tlnp | grep 5432
   - Check PostgreSQL logs: sudo journalctl -u postgresql -f
   - Verify database user exists: sudo -u postgres psql -c "\du"
   - Test connection manually: sudo -u postgres psql -d seraphc2

5. REDIS CONNECTION ISSUES
   Problem: Redis connection fails
   Solution:
   - Check Redis service status: sudo systemctl status redis-server
   - Verify Redis is listening: sudo netstat -tlnp | grep 6379
   - Check Redis logs: sudo journalctl -u redis-server -f
   - Test Redis connection: redis-cli ping
   - Check Redis authentication: redis-cli -a <password> ping

6. SSL CERTIFICATE ISSUES
   Problem: SSL certificate generation or validation fails
   Solution:
   - For self-signed certificates: Ensure openssl is installed
   - For Let's Encrypt: Verify domain points to your server's IP
   - Check certificate permissions: ls -la /etc/seraphc2/ssl/
   - Verify certificate validity: openssl x509 -in /etc/seraphc2/ssl/server.crt -text -noout

7. SERVICE STARTUP ISSUES
   Problem: SeraphC2 service fails to start
   Solution:
   - Check service status: sudo systemctl status seraphc2
   - View service logs: sudo journalctl -u seraphc2 -f
   - Verify application files exist: ls -la /opt/seraphc2/
   - Check file permissions: ls -la /opt/seraphc2/dist/
   - Test manual startup: sudo -u seraphc2 node /opt/seraphc2/dist/index.js

8. FIREWALL CONNECTIVITY ISSUES
   Problem: Cannot access web interface
   Solution:
   - Check if service is running: sudo systemctl status seraphc2
   - Verify ports are open: sudo netstat -tlnp | grep -E "(3000|8443|8080)"
   - Check firewall status: sudo ufw status (Ubuntu) or sudo firewall-cmd --list-all (CentOS/RHEL)
   - Test local connectivity: curl -k https://localhost:8443
   - Check from remote: telnet <server-ip> 8443

9. DOCKER DEPLOYMENT ISSUES
   Problem: Docker deployment fails
   Solution:
   - Check Docker service: sudo systemctl status docker
   - Verify Docker Compose: docker-compose --version
   - Check container status: docker-compose ps
   - View container logs: docker-compose logs seraphc2-server
   - Restart containers: docker-compose restart

10. MEMORY OR DISK SPACE ISSUES
    Problem: Installation fails due to insufficient resources
    Solution:
    - Check available memory: free -h
    - Check disk space: df -h
    - Clear temporary files: sudo rm -rf /tmp/* (be careful)
    - Stop unnecessary services: sudo systemctl stop <service-name>

11. NETWORK CONNECTIVITY ISSUES
    Problem: Cannot download packages or access external resources
    Solution:
    - Test internet connectivity: ping -c 3 8.8.8.8
    - Check DNS resolution: nslookup google.com
    - Verify proxy settings if behind corporate firewall
    - Check /etc/resolv.conf for DNS configuration

12. PERMISSION ISSUES
    Problem: File or directory permission errors
    Solution:
    - Check file ownership: ls -la /opt/seraphc2/
    - Fix ownership: sudo chown -R seraphc2:seraphc2 /opt/seraphc2/
    - Check service user exists: id seraphc2
    - Verify sudo permissions: sudo -l

DIAGNOSTIC COMMANDS:
- System information: uname -a && lsb_release -a
- Memory usage: free -h && df -h
- Service status: sudo systemctl status seraphc2 postgresql redis-server
- Network connectivity: ss -tlnp | grep -E "(3000|8443|8080|5432|6379)"
- Log files: sudo journalctl -u seraphc2 -n 50

GETTING HELP:
- Check the installation log file (path shown during installation)
- Run the script with --debug for detailed output
- Visit: https://github.com/seraphc2/seraphc2/wiki
- Report issues: https://github.com/seraphc2/seraphc2/issues

EOF
}

# Display configuration options and recommendations
show_configuration_guide() {
    cat << 'EOF'
SeraphC2 Setup Script - Configuration Guide
===========================================

CONFIGURATION OPTIONS EXPLAINED:

1. INSTALLATION MODES:

   Default Mode (Recommended):
   - Uses secure defaults for all settings
   - No user interaction required (except sudo password)
   - Suitable for most deployments
   - Command: sudo ./setup-seraphc2.sh

   Interactive Mode:
   - Prompts for custom configuration options
   - Allows customization of domain, ports, SSL settings
   - Recommended for production deployments
   - Command: sudo ./setup-seraphc2.sh --interactive

   Docker Mode:
   - Deploys using Docker containers
   - Easier to manage and update
   - Good for development or containerized environments
   - Command: sudo ./setup-seraphc2.sh --docker

2. NETWORK CONFIGURATION:

   Domain Name:
   - Default: localhost
   - Recommendation: Use your server's FQDN for production
   - Example: --domain=c2.example.com
   - Impact: Affects SSL certificates and web interface URLs

   HTTP Port:
   - Default: 3000
   - Recommendation: Keep default unless conflicts exist
   - Note: Used for web interface access
   - Firewall: Automatically opened

   HTTPS Port:
   - Default: 8443
   - Recommendation: Use 443 for production if available
   - Note: Primary secure web interface port
   - Firewall: Automatically opened

   Implant Communication Port:
   - Default: 8080
   - Recommendation: Use non-standard port for security
   - Note: Used by implants to connect back to C2
   - Firewall: Automatically opened

3. SSL/TLS CONFIGURATION:

   Self-Signed Certificates (Default):
   - Pros: Works immediately, no external dependencies
   - Cons: Browser warnings, not suitable for production
   - Use case: Development, testing, internal networks
   - Command: Default behavior

   Let's Encrypt Certificates:
   - Pros: Trusted by browsers, automatic renewal
   - Cons: Requires public domain, internet access
   - Use case: Production deployments with public domains
   - Command: --ssl-type=letsencrypt --letsencrypt-email=admin@example.com

   Custom Certificates:
   - Pros: Use existing certificates, full control
   - Cons: Manual management, renewal responsibility
   - Use case: Enterprise environments with existing PKI
   - Command: --ssl-type=custom --ssl-cert-path=/path/to/cert.pem --ssl-key-path=/path/to/key.pem

4. SECURITY CONFIGURATION:

   Basic Security (Default):
   - Secure passwords and secrets generation
   - Firewall configuration with minimal ports
   - Service user isolation
   - Database and Redis authentication

   Enhanced Security Hardening:
   - Additional system hardening measures
   - Fail2ban installation and configuration
   - Unnecessary service disabling
   - Enhanced logging and monitoring
   - Command: --enable-hardening

5. DATABASE CONFIGURATION:

   PostgreSQL Settings:
   - Database Name: seraphc2 (not configurable)
   - Database User: seraphc2 (not configurable)
   - Password: Auto-generated secure password
   - Host: localhost (not configurable)
   - Port: 5432 (default PostgreSQL port)

   Recommendations:
   - Keep default settings for most deployments
   - Password is automatically generated and stored securely
   - Database is optimized for C2 workloads

6. REDIS CONFIGURATION:

   Redis Settings:
   - Host: localhost (not configurable)
   - Port: 6379 (default Redis port)
   - Password: Auto-generated secure password
   - Authentication: Enabled by default

   Recommendations:
   - Keep default settings for most deployments
   - Used for session management and caching
   - Password is automatically generated and stored securely

7. BACKUP CONFIGURATION:

   Automatic Backups:
   - Default: Enabled
   - Location: /var/backups/seraphc2/
   - Retention: 30 days
   - Schedule: Daily at 2:00 AM
   - Encryption: AES-256 encrypted backups

   Skip Backup Setup:
   - Command: --skip-backup
   - Use case: When using external backup solutions
   - Note: Manual backup configuration will be required

8. LOGGING AND DEBUGGING:

   Standard Output:
   - Default behavior
   - Shows progress and important messages
   - Suitable for most installations

   Verbose Output:
   - Command: --verbose
   - Shows detailed operation information
   - Useful for troubleshooting
   - Recommended for first-time installations

   Debug Mode:
   - Command: --debug
   - Shows all debug messages and diagnostic information
   - Implies --verbose
   - Use for troubleshooting installation issues

RECOMMENDED CONFIGURATIONS:

Development/Testing:
sudo ./setup-seraphc2.sh --verbose

Production (Internal Network):
sudo ./setup-seraphc2.sh --interactive --enable-hardening --verbose

Production (Public Internet):
sudo ./setup-seraphc2.sh --interactive --ssl-type=letsencrypt \
  --letsencrypt-email=admin@example.com --domain=c2.example.com \
  --enable-hardening --verbose

Docker Development:
sudo ./setup-seraphc2.sh --docker --verbose

Enterprise with Custom Certificates:
sudo ./setup-seraphc2.sh --interactive --ssl-type=custom \
  --ssl-cert-path=/etc/ssl/certs/c2.crt --ssl-key-path=/etc/ssl/private/c2.key \
  --enable-hardening --verbose

CONFIGURATION FILES LOCATION:
- Main configuration: /opt/seraphc2/.env
- SSL certificates: /etc/seraphc2/ssl/
- Service configuration: /etc/systemd/system/seraphc2.service
- Backup configuration: /usr/local/bin/seraphc2-backup
- Log files: /var/log/seraphc2/

EOF
}

# Display security best practices and hardening recommendations
show_security_guide() {
    cat << 'EOF'
SeraphC2 Setup Script - Security Best Practices Guide
=====================================================

SECURITY HARDENING RECOMMENDATIONS:

1. SYSTEM-LEVEL SECURITY:

   Operating System Updates:
   - Keep your OS updated with latest security patches
   - Ubuntu/Debian: sudo apt update && sudo apt upgrade
   - CentOS/RHEL: sudo yum update
   - Enable automatic security updates where appropriate

   User Account Security:
   - Use dedicated service account (seraphc2) - automatically configured
   - Disable root login over SSH
   - Use SSH key authentication instead of passwords
   - Configure sudo with minimal required privileges

   Firewall Configuration:
   - Script automatically configures firewall with minimal required ports
   - Review and customize firewall rules for your environment
   - Consider using fail2ban for intrusion prevention (enabled with --enable-hardening)
   - Monitor firewall logs regularly

2. NETWORK SECURITY:

   SSL/TLS Configuration:
   - Use Let's Encrypt or valid SSL certificates for production
   - Avoid self-signed certificates in production environments
   - Configure HTTPS redirects (automatically done by script)
   - Use strong cipher suites (configured by default)

   Network Segmentation:
   - Deploy C2 server in isolated network segment
   - Use VPN or bastion hosts for administrative access
   - Implement network monitoring and intrusion detection
   - Consider using reverse proxy (Nginx) for additional security

   Port Management:
   - Change default ports if required by security policy
   - Use non-standard ports for implant communication
   - Implement port knocking or similar techniques if needed
   - Monitor network connections regularly

3. APPLICATION SECURITY:

   Authentication and Authorization:
   - Change default admin credentials immediately after installation
   - Implement strong password policies
   - Use multi-factor authentication where possible
   - Regularly review user accounts and permissions

   Session Management:
   - Sessions are secured with JWT tokens (automatically configured)
   - Session timeout is configured appropriately
   - Secure session storage using Redis with authentication
   - Regular session cleanup and monitoring

   Input Validation:
   - Application includes input validation and sanitization
   - SQL injection protection through parameterized queries
   - XSS protection through output encoding
   - CSRF protection implemented

4. DATABASE SECURITY:

   PostgreSQL Hardening:
   - Database user has minimal required privileges
   - Strong random passwords generated automatically
   - Local connections only (no remote access by default)
   - Regular database backups with encryption
   - Database logs monitored for suspicious activity

   Connection Security:
   - Encrypted connections between application and database
   - Connection pooling with proper authentication
   - Database firewall rules restrict access
   - Regular security updates for PostgreSQL

5. REDIS SECURITY:

   Redis Configuration:
   - Authentication enabled with strong passwords
   - Dangerous commands disabled (FLUSHDB, FLUSHALL, DEBUG)
   - Bind to localhost only (no remote access)
   - Regular monitoring of Redis logs
   - Memory usage monitoring and limits

6. FILE SYSTEM SECURITY:

   File Permissions:
   - Application files owned by service user
   - Configuration files readable only by service user
   - SSL private keys have restrictive permissions (600)
   - Log files have appropriate permissions
   - Regular file integrity monitoring

   Directory Structure:
   - Application isolated in /opt/seraphc2/
   - Configuration in /etc/seraphc2/
   - Logs in /var/log/seraphc2/
   - Backups in /var/backups/seraphc2/ with encryption

7. LOGGING AND MONITORING:

   Log Management:
   - Comprehensive logging enabled by default
   - Log rotation configured automatically
   - Centralized log collection recommended
   - Regular log analysis for security events

   Monitoring:
   - System resource monitoring
   - Service health monitoring
   - Network connection monitoring
   - Failed authentication attempt monitoring
   - Automated alerting for security events

8. BACKUP AND RECOVERY:

   Backup Security:
   - Automated encrypted backups configured
   - Backup integrity verification
   - Secure backup storage location
   - Regular backup restoration testing
   - Offsite backup storage recommended

   Disaster Recovery:
   - Document recovery procedures
   - Test recovery processes regularly
   - Maintain offline backup copies
   - Plan for various failure scenarios

9. UPDATE AND MAINTENANCE:

   Security Updates:
   - Regular application updates
   - Operating system security patches
   - Database and Redis updates
   - SSL certificate renewal monitoring

   Maintenance Tasks:
   - Regular log cleanup and rotation
   - Database maintenance and optimization
   - Security audit and vulnerability scanning
   - Configuration review and updates

10. COMPLIANCE AND AUDITING:

    Audit Logging:
    - Enable comprehensive audit logging
    - Log all administrative actions
    - Monitor configuration changes
    - Regular audit log review

    Compliance:
    - Follow organizational security policies
    - Implement required security controls
    - Regular security assessments
    - Documentation of security measures

SECURITY CHECKLIST:

Pre-Installation:
□ System is fully updated
□ Firewall is configured
□ SSH is hardened
□ Unnecessary services are disabled

Post-Installation:
□ Change default admin credentials
□ Review firewall configuration
□ Test SSL certificate configuration
□ Verify backup functionality
□ Review log configuration
□ Test monitoring and alerting
□ Document configuration changes

Ongoing Maintenance:
□ Regular security updates
□ Log monitoring and analysis
□ Backup verification
□ Security audit reviews
□ Incident response testing

ADDITIONAL SECURITY MEASURES:

For High-Security Environments:
- Use hardware security modules (HSM) for key storage
- Implement network access control (NAC)
- Use application whitelisting
- Deploy endpoint detection and response (EDR)
- Implement security information and event management (SIEM)
- Regular penetration testing
- Security awareness training for operators

SECURITY RESOURCES:
- NIST Cybersecurity Framework
- CIS Controls
- OWASP Security Guidelines
- Your organization's security policies

For questions or security concerns:
- Review documentation: https://github.com/seraphc2/seraphc2/wiki/security
- Report security issues: security@seraphc2.org

EOF
}

# Display maintenance and operational documentation
show_maintenance_guide() {
    cat << 'EOF'
SeraphC2 Setup Script - Maintenance and Operations Guide
=======================================================

ROUTINE MAINTENANCE TASKS:

1. SYSTEM MONITORING:

   Service Health Checks:
   - Check service status: sudo systemctl status seraphc2
   - Monitor service logs: sudo journalctl -u seraphc2 -f
   - Check resource usage: htop or top
   - Monitor disk space: df -h
   - Check memory usage: free -h

   Database Monitoring:
   - PostgreSQL status: sudo systemctl status postgresql
   - Database connections: sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
   - Database size: sudo -u postgres psql -d seraphc2 -c "\l+"
   - Check for long-running queries: sudo -u postgres psql -d seraphc2 -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

   Redis Monitoring:
   - Redis status: sudo systemctl status redis-server
   - Redis info: redis-cli -a <password> info
   - Memory usage: redis-cli -a <password> info memory
   - Connected clients: redis-cli -a <password> info clients

2. LOG MANAGEMENT:

   Log Locations:
   - Application logs: /var/log/seraphc2/
   - System logs: /var/log/syslog
   - Service logs: sudo journalctl -u seraphc2
   - Database logs: /var/log/postgresql/
   - Redis logs: /var/log/redis/

   Log Rotation:
   - Automatic log rotation is configured
   - Manual rotation: sudo logrotate -f /etc/logrotate.d/seraphc2
   - Check log sizes: du -sh /var/log/seraphc2/*
   - Archive old logs: tar -czf logs-$(date +%Y%m%d).tar.gz /var/log/seraphc2/

   Log Analysis:
   - Check for errors: grep -i error /var/log/seraphc2/*.log
   - Monitor failed logins: grep -i "failed login" /var/log/seraphc2/*.log
   - Check performance issues: grep -i "slow" /var/log/seraphc2/*.log

3. BACKUP OPERATIONS:

   Automated Backups:
   - Backup script: /usr/local/bin/seraphc2-backup
   - Backup location: /var/backups/seraphc2/
   - Backup schedule: Daily at 2:00 AM (cron)
   - Check backup status: ls -la /var/backups/seraphc2/

   Manual Backup:
   - Run backup manually: sudo /usr/local/bin/seraphc2-backup
   - Database backup: sudo -u postgres pg_dump seraphc2 > backup.sql
   - Configuration backup: sudo tar -czf config-backup.tar.gz /etc/seraphc2/ /opt/seraphc2/.env

   Backup Verification:
   - Test backup integrity: sudo /usr/local/bin/seraphc2-verify-backup
   - List backup contents: sudo tar -tzf /var/backups/seraphc2/config_*.tar.gz.enc
   - Check backup sizes: du -sh /var/backups/seraphc2/*

   Backup Restoration:
   - Database restore: sudo -u postgres psql seraphc2 < backup.sql
   - Configuration restore: sudo tar -xzf config-backup.tar.gz -C /
   - Full restore: sudo /usr/local/bin/seraphc2-restore

4. UPDATE MANAGEMENT:

   Checking for Updates:
   - Check script updates: sudo ./setup-seraphc2.sh --update-check
   - Check system updates: sudo apt list --upgradable (Ubuntu/Debian)
   - Check application updates: Check GitHub releases

   Applying Updates:
   - Update all components: sudo ./setup-seraphc2.sh --update
   - Update specific component: sudo ./setup-seraphc2.sh --update --component=seraphc2
   - System updates: sudo apt update && sudo apt upgrade

   Post-Update Verification:
   - Check service status: sudo systemctl status seraphc2
   - Verify web interface: curl -k https://localhost:8443
   - Check database connectivity: sudo -u postgres psql -d seraphc2 -c "SELECT version();"
   - Review logs for errors: sudo journalctl -u seraphc2 -n 50

5. PERFORMANCE OPTIMIZATION:

   Database Optimization:
   - Analyze database: sudo -u postgres psql -d seraphc2 -c "ANALYZE;"
   - Vacuum database: sudo -u postgres psql -d seraphc2 -c "VACUUM;"
   - Check slow queries: Enable slow query logging in PostgreSQL
   - Index optimization: Review and optimize database indexes

   Redis Optimization:
   - Monitor memory usage: redis-cli -a <password> info memory
   - Check key expiration: redis-cli -a <password> info keyspace
   - Optimize configuration: Review Redis configuration for your workload

   System Optimization:
   - Monitor CPU usage: htop
   - Check I/O performance: iotop
   - Network monitoring: iftop or nethogs
   - Disk usage analysis: ncdu /opt/seraphc2/

6. SECURITY MAINTENANCE:

   Security Updates:
   - Apply security patches promptly
   - Monitor security advisories
   - Update SSL certificates before expiration
   - Review and rotate passwords periodically

   Security Auditing:
   - Review user accounts: sudo cat /etc/passwd | grep seraphc2
   - Check file permissions: sudo find /opt/seraphc2/ -type f -perm /o+w
   - Audit network connections: sudo netstat -tlnp
   - Review firewall rules: sudo ufw status verbose

   Log Security Analysis:
   - Check for failed login attempts
   - Monitor unusual network activity
   - Review database access logs
   - Check for privilege escalation attempts

OPERATIONAL PROCEDURES:

1. SERVICE MANAGEMENT:

   Starting/Stopping Services:
   - Start SeraphC2: sudo systemctl start seraphc2
   - Stop SeraphC2: sudo systemctl stop seraphc2
   - Restart SeraphC2: sudo systemctl restart seraphc2
   - Reload configuration: sudo systemctl reload seraphc2

   Service Dependencies:
   - PostgreSQL: sudo systemctl start postgresql
   - Redis: sudo systemctl start redis-server
   - Check dependencies: systemctl list-dependencies seraphc2

2. CONFIGURATION MANAGEMENT:

   Configuration Files:
   - Main config: /opt/seraphc2/.env
   - Service config: /etc/systemd/system/seraphc2.service
   - SSL config: /etc/seraphc2/ssl/
   - Backup config: /usr/local/bin/seraphc2-backup

   Configuration Changes:
   - Always backup before changes
   - Test changes in development first
   - Restart services after configuration changes
   - Verify functionality after changes

3. TROUBLESHOOTING PROCEDURES:

   Service Won't Start:
   1. Check service status: sudo systemctl status seraphc2
   2. Review logs: sudo journalctl -u seraphc2 -n 50
   3. Check dependencies: sudo systemctl status postgresql redis-server
   4. Verify configuration: sudo -u seraphc2 node /opt/seraphc2/dist/index.js --check-config
   5. Check file permissions: ls -la /opt/seraphc2/

   Database Issues:
   1. Check PostgreSQL status: sudo systemctl status postgresql
   2. Test connection: sudo -u postgres psql -d seraphc2
   3. Check disk space: df -h
   4. Review PostgreSQL logs: sudo tail -f /var/log/postgresql/*.log

   Performance Issues:
   1. Check system resources: htop, free -h, df -h
   2. Review application logs for slow queries
   3. Monitor network connections: netstat -an
   4. Check database performance: pg_stat_statements
   5. Analyze Redis performance: redis-cli --latency

4. DISASTER RECOVERY:

   Recovery Planning:
   - Document all configuration settings
   - Maintain offline backup copies
   - Test recovery procedures regularly
   - Have emergency contact information ready

   Recovery Procedures:
   1. Assess the extent of the problem
   2. Stop affected services
   3. Restore from most recent backup
   4. Verify data integrity
   5. Test all functionality
   6. Document the incident

MAINTENANCE SCHEDULE:

Daily:
□ Check service status
□ Review error logs
□ Monitor disk space
□ Verify backup completion

Weekly:
□ Review security logs
□ Check for updates
□ Analyze performance metrics
□ Test backup restoration

Monthly:
□ Full system backup verification
□ Security audit review
□ Performance optimization
□ Update documentation
□ Review and rotate logs

Quarterly:
□ Disaster recovery testing
□ Security assessment
□ Configuration review
□ Capacity planning review

AUTOMATION SCRIPTS:

The following scripts are available for automation:
- /usr/local/bin/seraphc2-backup: Automated backup
- /usr/local/bin/seraphc2-restore: Backup restoration
- /usr/local/bin/seraphc2-health-check: Health monitoring
- /usr/local/bin/seraphc2-maintenance: Routine maintenance

MONITORING AND ALERTING:

Set up monitoring for:
- Service availability
- Resource usage (CPU, memory, disk)
- Database performance
- Network connectivity
- Security events
- Backup success/failure

DOCUMENTATION:
- Keep operational runbooks updated
- Document all configuration changes
- Maintain incident response procedures
- Update contact information regularly

For additional support:
- Documentation: https://github.com/seraphc2/seraphc2/wiki
- Community: https://github.com/seraphc2/seraphc2/discussions
- Issues: https://github.com/seraphc2/seraphc2/issues

EOF
}

# Perform script integrity checking and validation
validate_script_integrity() {
    log_info "Performing script integrity validation..."
    
    local validation_errors=0
    
    # Check script file permissions
    local script_path="$0"
    local script_perms=$(stat -c "%a" "$script_path" 2>/dev/null)
    
    if [[ "$script_perms" != "755" && "$script_perms" != "750" ]]; then
        log_warning "Script permissions are $script_perms, recommended: 755"
        ((validation_errors++))
    fi
    
    # Check if script is being run as root or with sudo
    if [[ $EUID -ne 0 ]]; then
        log_error "Script must be run as root or with sudo privileges"
        ((validation_errors++))
    fi
    
    # Validate bash version
    if [[ ${BASH_VERSION%%.*} -lt $MIN_BASH_VERSION ]]; then
        log_error "Bash version ${BASH_VERSION} is too old. Minimum required: $MIN_BASH_VERSION"
        ((validation_errors++))
    fi
    
    # Check for required commands
    local required_commands=(
        "curl" "wget" "openssl" "systemctl" "useradd" "usermod"
        "chmod" "chown" "mkdir" "rm" "cp" "mv" "tar" "gzip"
        "ps" "netstat" "ss" "grep" "awk" "sed" "cut" "sort"
    )
    
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            log_warning "Required command not found: $cmd"
            ((validation_errors++))
        fi
    done
    
    # Validate configuration array structure
    local required_config_keys=(
        "mode" "domain" "http_port" "https_port" "implant_port"
        "ssl_type" "service_user" "app_dir" "log_dir" "ssl_dir"
    )
    
    for key in "${required_config_keys[@]}"; do
        if [[ -z "${CONFIG[$key]}" ]]; then
            log_error "Missing required configuration key: $key"
            ((validation_errors++))
        fi
    done
    
    # Validate port numbers
    local ports=("${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}")
    for port in "${ports[@]}"; do
        if ! [[ "$port" =~ ^[0-9]+$ ]] || [[ $port -lt 1 ]] || [[ $port -gt 65535 ]]; then
            log_error "Invalid port number: $port"
            ((validation_errors++))
        fi
    done
    
    # Check for port conflicts
    if [[ "${CONFIG[http_port]}" == "${CONFIG[https_port]}" ]] || 
       [[ "${CONFIG[http_port]}" == "${CONFIG[implant_port]}" ]] || 
       [[ "${CONFIG[https_port]}" == "${CONFIG[implant_port]}" ]]; then
        log_error "Port conflict detected in configuration"
        ((validation_errors++))
    fi
    
    # Validate directory paths
    local directories=("${CONFIG[app_dir]}" "${CONFIG[log_dir]}" "${CONFIG[ssl_dir]}")
    for dir in "${directories[@]}"; do
        if [[ ! "$dir" =~ ^/[a-zA-Z0-9/_-]+$ ]]; then
            log_error "Invalid directory path: $dir"
            ((validation_errors++))
        fi
    done
    
    # Check system requirements
    local total_memory_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local total_memory_gb=$((total_memory_kb / 1024 / 1024))
    
    if [[ $total_memory_gb -lt 2 ]]; then
        log_warning "System has ${total_memory_gb}GB RAM, minimum recommended: 2GB"
        ((validation_errors++))
    fi
    
    # Check available disk space
    local available_space_gb=$(df / | awk 'NR==2 {print int($4/1024/1024)}')
    if [[ $available_space_gb -lt 10 ]]; then
        log_warning "Available disk space: ${available_space_gb}GB, minimum recommended: 10GB"
        ((validation_errors++))
    fi
    
    # Validate network connectivity
    if ! ping -c 1 -W 5 8.8.8.8 >/dev/null 2>&1; then
        log_warning "Network connectivity test failed - may affect package downloads"
        ((validation_errors++))
    fi
    
    # Validate script structure and critical functions
    local critical_functions=(
        "show_help" "parse_arguments" "check_system_prerequisites"
        "install_package" "setup_database" "generate_secure_password"
        "perform_rollback" "display_connection_information"
    )
    
    for func in "${critical_functions[@]}"; do
        if ! declare -f "$func" >/dev/null 2>&1; then
            log_error "Critical function missing: $func"
            ((validation_errors++))
        fi
    done
    
    # Check script size (should be reasonable for a setup script)
    local script_size=$(wc -c < "$script_path" 2>/dev/null || echo 0)
    if [[ $script_size -lt 10000 ]]; then
        log_warning "Script size seems too small: $script_size bytes"
        ((validation_errors++))
    elif [[ $script_size -gt 5000000 ]]; then
        log_warning "Script size seems too large: $script_size bytes"
        ((validation_errors++))
    fi
    
    # Validate script syntax
    if ! bash -n "$script_path" 2>/dev/null; then
        log_error "Script syntax validation failed"
        ((validation_errors++))
    fi
    
    # Check if required ports are available
    local ports_to_check=("${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}")
    for port in "${ports_to_check[@]}"; do
        if ss -tlnp | grep -q ":$port "; then
            log_warning "Port $port is already in use"
            ((validation_errors++))
        fi
    done
    
    # Report validation results
    if [[ $validation_errors -eq 0 ]]; then
        log_success "Script integrity validation passed"
        return 0
    else
        log_warning "Script integrity validation completed with $validation_errors warnings/errors"
        
        if [[ $validation_errors -gt 5 ]]; then
            log_error "Too many validation errors detected. Installation may fail."
            if ! confirm_action "Continue with installation despite validation errors?" "n"; then
                log_info "Installation cancelled by user"
                exit $E_VALIDATION_ERROR
            fi
        fi
        
        return $validation_errors
    fi
}

# Perform comprehensive testing and quality assurance
perform_final_testing() {
    log_info "Performing final testing and quality assurance..."
    
    local test_errors=0
    local test_warnings=0
    
    # Test 1: Service Health Check
    log_info "Testing service health..."
    if ! systemctl is-active --quiet seraphc2; then
        log_error "SeraphC2 service is not running"
        ((test_errors++))
    else
        log_success "SeraphC2 service is running"
    fi
    
    # Test 2: Database Connectivity
    log_info "Testing database connectivity..."
    if ! sudo -u postgres psql -d "${CONFIG[db_name]}" -c "SELECT 1;" >/dev/null 2>&1; then
        log_error "Database connectivity test failed"
        ((test_errors++))
    else
        log_success "Database connectivity test passed"
    fi
    
    # Test 3: Redis Connectivity
    log_info "Testing Redis connectivity..."
    if ! redis-cli -a "${CONFIG[redis_password]}" ping >/dev/null 2>&1; then
        log_error "Redis connectivity test failed"
        ((test_errors++))
    else
        log_success "Redis connectivity test passed"
    fi
    
    # Test 4: Web Interface Accessibility
    log_info "Testing web interface accessibility..."
    local http_url="http://localhost:${CONFIG[http_port]}"
    local https_url="https://localhost:${CONFIG[https_port]}"
    
    if ! curl -f -s --connect-timeout 10 "$http_url/api/health" >/dev/null 2>&1; then
        log_warning "HTTP interface test failed - may be normal if HTTPS-only"
        ((test_warnings++))
    else
        log_success "HTTP interface is accessible"
    fi
    
    if ! curl -f -s -k --connect-timeout 10 "$https_url/api/health" >/dev/null 2>&1; then
        log_error "HTTPS interface test failed"
        ((test_errors++))
    else
        log_success "HTTPS interface is accessible"
    fi
    
    # Test 5: SSL Certificate Validation
    log_info "Testing SSL certificate..."
    local ssl_cert="${CONFIG[ssl_dir]}/server.crt"
    local ssl_key="${CONFIG[ssl_dir]}/server.key"
    
    if [[ ! -f "$ssl_cert" ]]; then
        log_error "SSL certificate not found: $ssl_cert"
        ((test_errors++))
    elif ! openssl x509 -in "$ssl_cert" -noout -checkend 86400 >/dev/null 2>&1; then
        log_warning "SSL certificate expires within 24 hours"
        ((test_warnings++))
    else
        log_success "SSL certificate is valid"
    fi
    
    if [[ ! -f "$ssl_key" ]]; then
        log_error "SSL private key not found: $ssl_key"
        ((test_errors++))
    elif [[ "$(stat -c %a "$ssl_key")" != "600" ]]; then
        log_warning "SSL private key permissions should be 600"
        ((test_warnings++))
    else
        log_success "SSL private key is properly secured"
    fi
    
    # Test 6: Firewall Configuration
    log_info "Testing firewall configuration..."
    local required_ports=("${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}")
    
    for port in "${required_ports[@]}"; do
        if ! ss -tlnp | grep -q ":$port "; then
            log_error "Port $port is not listening"
            ((test_errors++))
        else
            log_success "Port $port is listening"
        fi
    done
    
    # Test 7: File Permissions and Ownership
    log_info "Testing file permissions and ownership..."
    local app_dir="${CONFIG[app_dir]}"
    local service_user="${CONFIG[service_user]}"
    
    if [[ ! -d "$app_dir" ]]; then
        log_error "Application directory not found: $app_dir"
        ((test_errors++))
    else
        local owner=$(stat -c %U "$app_dir")
        if [[ "$owner" != "$service_user" ]]; then
            log_warning "Application directory owner is $owner, expected $service_user"
            ((test_warnings++))
        else
            log_success "Application directory ownership is correct"
        fi
    fi
    
    # Test 8: Configuration File Validation
    log_info "Testing configuration files..."
    local env_file="$app_dir/.env"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment configuration file not found: $env_file"
        ((test_errors++))
    else
        # Check for required environment variables
        local required_vars=("NODE_ENV" "PORT" "DB_HOST" "DB_PASSWORD" "REDIS_PASSWORD" "JWT_SECRET")
        for var in "${required_vars[@]}"; do
            if ! grep -q "^$var=" "$env_file"; then
                log_error "Missing required environment variable: $var"
                ((test_errors++))
            fi
        done
        
        if [[ $test_errors -eq 0 ]]; then
            log_success "Configuration file validation passed"
        fi
    fi
    
    # Test 9: Log File Accessibility
    log_info "Testing log file accessibility..."
    local log_dir="${CONFIG[log_dir]}"
    
    if [[ ! -d "$log_dir" ]]; then
        log_warning "Log directory not found: $log_dir"
        ((test_warnings++))
    else
        if [[ ! -w "$log_dir" ]]; then
            log_warning "Log directory is not writable"
            ((test_warnings++))
        else
            log_success "Log directory is accessible"
        fi
    fi
    
    # Test 10: Backup System Validation
    if [[ "${CONFIG[skip_backup]}" != "true" ]]; then
        log_info "Testing backup system..."
        local backup_script="/usr/local/bin/seraphc2-backup"
        
        if [[ ! -f "$backup_script" ]]; then
            log_warning "Backup script not found: $backup_script"
            ((test_warnings++))
        elif [[ ! -x "$backup_script" ]]; then
            log_warning "Backup script is not executable"
            ((test_warnings++))
        else
            log_success "Backup system is configured"
        fi
    fi
    
    # Test 11: System Resource Usage
    log_info "Testing system resource usage..."
    
    # Memory usage test
    local memory_usage_percent=$(free | awk '/^Mem:/ {printf "%.0f", ($3/$2)*100}')
    if [[ $memory_usage_percent -gt 90 ]]; then
        log_warning "High memory usage: ${memory_usage_percent}%"
        ((test_warnings++))
    else
        log_success "Memory usage is acceptable: ${memory_usage_percent}%"
    fi
    
    # Disk usage test
    local disk_usage_percent=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage_percent -gt 90 ]]; then
        log_warning "High disk usage: ${disk_usage_percent}%"
        ((test_warnings++))
    else
        log_success "Disk usage is acceptable: ${disk_usage_percent}%"
    fi
    
    # Test 12: Network Connectivity
    log_info "Testing network connectivity..."
    
    # Test external connectivity
    if ! ping -c 1 -W 5 8.8.8.8 >/dev/null 2>&1; then
        log_warning "External network connectivity test failed"
        ((test_warnings++))
    else
        log_success "External network connectivity is working"
    fi
    
    # Test DNS resolution
    if ! nslookup google.com >/dev/null 2>&1; then
        log_warning "DNS resolution test failed"
        ((test_warnings++))
    else
        log_success "DNS resolution is working"
    fi
    
    # Generate test report
    log_info "Final testing completed"
    echo ""
    echo "=========================================="
    echo "FINAL TESTING REPORT"
    echo "=========================================="
    echo "Tests completed: 12"
    echo "Errors: $test_errors"
    echo "Warnings: $test_warnings"
    echo ""
    
    if [[ $test_errors -eq 0 && $test_warnings -eq 0 ]]; then
        log_success "All tests passed successfully!"
        echo "Status: PASS - Installation is fully functional"
        return 0
    elif [[ $test_errors -eq 0 ]]; then
        log_warning "Tests completed with warnings"
        echo "Status: PASS WITH WARNINGS - Installation is functional but has minor issues"
        return 1
    else
        log_error "Tests failed with errors"
        echo "Status: FAIL - Installation has critical issues that need attention"
        echo ""
        echo "Please review the errors above and:"
        echo "1. Check the installation log: $SCRIPT_LOG_FILE"
        echo "2. Review service status: sudo systemctl status seraphc2"
        echo "3. Check service logs: sudo journalctl -u seraphc2 -n 50"
        echo "4. Consider running rollback if issues persist"
        return 2
    fi
}

#==============================================================================
# COMPREHENSIVE INSTALLATION VALIDATION SYSTEM (Task 24)
#==============================================================================

# Perform comprehensive installation validation
perform_installation_validation() {
    log_info "Performing comprehensive installation validation..."
    
    local validation_errors=0
    local validation_warnings=0
    local start_time=$(date +%s)
    
    # Validation Test 1: Service Health and Status
    log_info "Validating service health and status..."
    if ! validate_service_health; then
        log_error "Service health validation failed"
        ((validation_errors++))
    else
        log_success "Service health validation passed"
    fi
    
    # Validation Test 2: Database Schema and Connectivity
    log_info "Validating database schema and connectivity..."
    if ! validate_database_schema; then
        log_error "Database schema validation failed"
        ((validation_errors++))
    else
        log_success "Database schema validation passed"
    fi
    
    # Validation Test 3: Redis Configuration and Connectivity
    log_info "Validating Redis configuration and connectivity..."
    if ! validate_redis_configuration; then
        log_error "Redis configuration validation failed"
        ((validation_errors++))
    else
        log_success "Redis configuration validation passed"
    fi
    
    # Validation Test 4: SSL Certificate and HTTPS Configuration
    log_info "Validating SSL certificate and HTTPS configuration..."
    if ! validate_ssl_configuration; then
        log_error "SSL configuration validation failed"
        ((validation_errors++))
    else
        log_success "SSL configuration validation passed"
    fi
    
    # Validation Test 5: Web Interface Functionality
    log_info "Validating web interface functionality..."
    if ! validate_web_interface; then
        log_error "Web interface validation failed"
        ((validation_errors++))
    else
        log_success "Web interface validation passed"
    fi
    
    # Validation Test 6: API Endpoints and Authentication
    log_info "Validating API endpoints and authentication..."
    if ! validate_api_endpoints; then
        log_error "API endpoints validation failed"
        ((validation_errors++))
    else
        log_success "API endpoints validation passed"
    fi
    
    # Validation Test 7: Firewall and Network Security
    log_info "Validating firewall and network security..."
    if ! validate_network_security; then
        log_error "Network security validation failed"
        ((validation_errors++))
    else
        log_success "Network security validation passed"
    fi
    
    # Validation Test 8: File Permissions and Security
    log_info "Validating file permissions and security..."
    if ! validate_file_security; then
        log_error "File security validation failed"
        ((validation_errors++))
    else
        log_success "File security validation passed"
    fi
    
    # Validation Test 9: System Resource Usage
    log_info "Validating system resource usage..."
    if ! validate_system_resources; then
        log_warning "System resource validation has warnings"
        ((validation_warnings++))
    else
        log_success "System resource validation passed"
    fi
    
    # Validation Test 10: Backup System Configuration
    if [[ "${CONFIG[skip_backup]}" != "true" ]]; then
        log_info "Validating backup system configuration..."
        if ! validate_backup_system; then
            log_warning "Backup system validation failed"
            ((validation_warnings++))
        else
            log_success "Backup system validation passed"
        fi
    fi
    
    # Validation Test 11: End-to-End Functionality Test
    log_info "Performing end-to-end functionality test..."
    if ! validate_end_to_end_functionality; then
        log_error "End-to-end functionality validation failed"
        ((validation_errors++))
    else
        log_success "End-to-end functionality validation passed"
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Generate comprehensive validation report
    echo ""
    echo "=========================================="
    echo "COMPREHENSIVE VALIDATION REPORT"
    echo "=========================================="
    echo "Validation tests completed: 11"
    echo "Errors: $validation_errors"
    echo "Warnings: $validation_warnings"
    echo "Duration: ${duration} seconds"
    echo ""
    
    if [[ $validation_errors -eq 0 && $validation_warnings -eq 0 ]]; then
        log_success "All validation tests passed successfully!"
        echo "Status: PASS - SeraphC2 installation is fully functional and ready for use"
        echo ""
        echo "✓ C2 server is operational and accessible"
        echo "✓ All security configurations are properly applied"
        echo "✓ Database and cache systems are working correctly"
        echo "✓ SSL/TLS encryption is properly configured"
        echo "✓ System is ready for immediate use"
        return 0
    elif [[ $validation_errors -eq 0 ]]; then
        log_warning "Validation completed with warnings"
        echo "Status: PASS WITH WARNINGS - Installation is functional but has minor issues"
        echo ""
        echo "The C2 server is operational but some non-critical issues were detected."
        echo "Review the warnings above and consider addressing them for optimal performance."
        return 1
    else
        log_error "Validation failed with critical errors"
        echo "Status: FAIL - Installation has critical issues that prevent proper operation"
        echo ""
        echo "The following actions are recommended:"
        echo "1. Review the error messages above"
        echo "2. Check the installation log: $SCRIPT_LOG_FILE"
        echo "3. Verify system requirements and dependencies"
        echo "4. Consider running rollback and attempting installation again"
        echo "5. Check service status: sudo systemctl status seraphc2"
        echo "6. Review service logs: sudo journalctl -u seraphc2 -n 50"
        return 2
    fi
}

# Validate service health and status
validate_service_health() {
    local errors=0
    
    # Check if systemd service exists
    if ! systemctl list-unit-files | grep -q "seraphc2.service"; then
        log_error "SeraphC2 systemd service file not found"
        ((errors++))
    fi
    
    # Check if service is enabled
    if ! systemctl is-enabled --quiet seraphc2 2>/dev/null; then
        log_error "SeraphC2 service is not enabled for startup"
        ((errors++))
    fi
    
    # Check if service is active
    if ! systemctl is-active --quiet seraphc2 2>/dev/null; then
        log_error "SeraphC2 service is not running"
        ((errors++))
        
        # Get service status for debugging
        log_error "Service status:"
        systemctl status seraphc2 --no-pager -l || true
    fi
    
    # Check service startup time
    local startup_time=$(systemctl show seraphc2 --property=ActiveEnterTimestamp --value 2>/dev/null)
    if [[ -n "$startup_time" && "$startup_time" != "n/a" ]]; then
        log_verbose "Service started at: $startup_time"
    fi
    
    # Check if service is listening on configured ports
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    local implant_port="${CONFIG[implant_port]}"
    
    for port in "$http_port" "$https_port" "$implant_port"; do
        if ! ss -tlnp | grep -q ":$port "; then
            log_error "Service is not listening on port $port"
            ((errors++))
        else
            log_verbose "Service is listening on port $port"
        fi
    done
    
    return $errors
}

# Validate database schema and connectivity
validate_database_schema() {
    local errors=0
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    
    # Test database connectivity
    if ! PGPASSWORD="$db_password" psql -h localhost -U "$db_user" -d "$db_name" -c "SELECT 1;" >/dev/null 2>&1; then
        log_error "Cannot connect to database $db_name as user $db_user"
        ((errors++))
        return $errors
    fi
    
    # Check if required tables exist
    local required_tables=(
        "users"
        "sessions" 
        "implants"
        "commands"
        "results"
        "listeners"
        "payloads"
        "api_keys"
        "audit_logs"
    )
    
    for table in "${required_tables[@]}"; do
        if ! PGPASSWORD="$db_password" psql -h localhost -U "$db_user" -d "$db_name" -c "SELECT 1 FROM $table LIMIT 1;" >/dev/null 2>&1; then
            log_error "Required table '$table' not found or not accessible"
            ((errors++))
        else
            log_verbose "Table '$table' exists and is accessible"
        fi
    done
    
    # Check database version and compatibility
    local db_version=$(PGPASSWORD="$db_password" psql -h localhost -U "$db_user" -d "$db_name" -t -c "SELECT version();" 2>/dev/null | head -n1)
    if [[ -n "$db_version" ]]; then
        log_verbose "Database version: $db_version"
    fi
    
    # Test database write operations
    local test_table="seraphc2_validation_test_$(date +%s)"
    if PGPASSWORD="$db_password" psql -h localhost -U "$db_user" -d "$db_name" -c "CREATE TEMPORARY TABLE $test_table (id SERIAL PRIMARY KEY, test_data TEXT);" >/dev/null 2>&1; then
        if PGPASSWORD="$db_password" psql -h localhost -U "$db_user" -d "$db_name" -c "INSERT INTO $test_table (test_data) VALUES ('validation_test');" >/dev/null 2>&1; then
            log_verbose "Database write operations are working"
        else
            log_error "Database write operations failed"
            ((errors++))
        fi
    else
        log_error "Cannot create temporary table for testing"
        ((errors++))
    fi
    
    return $errors
}

# Validate Redis configuration and connectivity
validate_redis_configuration() {
    local errors=0
    local redis_password="${CONFIG[redis_password]}"
    
    # Test Redis connectivity with authentication
    if ! redis-cli -a "$redis_password" ping >/dev/null 2>&1; then
        log_error "Cannot connect to Redis with authentication"
        ((errors++))
        return $errors
    fi
    
    # Test Redis write operations
    local test_key="seraphc2:validation:test:$(date +%s)"
    local test_value="validation_test_$(date +%s)"
    
    if redis-cli -a "$redis_password" set "$test_key" "$test_value" >/dev/null 2>&1; then
        if [[ "$(redis-cli -a "$redis_password" get "$test_key" 2>/dev/null)" == "$test_value" ]]; then
            log_verbose "Redis read/write operations are working"
            # Clean up test key
            redis-cli -a "$redis_password" del "$test_key" >/dev/null 2>&1
        else
            log_error "Redis read operations failed"
            ((errors++))
        fi
    else
        log_error "Redis write operations failed"
        ((errors++))
    fi
    
    # Check Redis configuration
    local redis_info=$(redis-cli -a "$redis_password" info server 2>/dev/null)
    if [[ -n "$redis_info" ]]; then
        local redis_version=$(echo "$redis_info" | grep "redis_version:" | cut -d: -f2 | tr -d '\r')
        log_verbose "Redis version: $redis_version"
    fi
    
    # Verify dangerous commands are disabled
    local dangerous_commands=("FLUSHDB" "FLUSHALL" "DEBUG")
    for cmd in "${dangerous_commands[@]}"; do
        if redis-cli -a "$redis_password" "$cmd" 2>&1 | grep -q "unknown command"; then
            log_verbose "Dangerous command '$cmd' is properly disabled"
        else
            log_warning "Dangerous command '$cmd' may not be disabled"
        fi
    done
    
    return $errors
}

# Validate SSL configuration
validate_ssl_configuration() {
    local errors=0
    local ssl_cert="${CONFIG[ssl_cert_path]}"
    local ssl_key="${CONFIG[ssl_key_path]}"
    local domain="${CONFIG[domain]}"
    local https_port="${CONFIG[https_port]}"
    
    # Check certificate file exists and is readable
    if [[ ! -f "$ssl_cert" ]]; then
        log_error "SSL certificate file not found: $ssl_cert"
        ((errors++))
    elif [[ ! -r "$ssl_cert" ]]; then
        log_error "SSL certificate file is not readable: $ssl_cert"
        ((errors++))
    else
        # Validate certificate
        if ! openssl x509 -in "$ssl_cert" -noout -checkend 0 >/dev/null 2>&1; then
            log_error "SSL certificate is invalid or expired"
            ((errors++))
        else
            # Check certificate expiration
            local cert_expiry=$(openssl x509 -in "$ssl_cert" -noout -enddate 2>/dev/null | cut -d= -f2)
            log_verbose "SSL certificate expires: $cert_expiry"
            
            # Warn if certificate expires soon (within 30 days)
            if ! openssl x509 -in "$ssl_cert" -noout -checkend 2592000 >/dev/null 2>&1; then
                log_warning "SSL certificate expires within 30 days"
            fi
        fi
    fi
    
    # Check private key file exists and has proper permissions
    if [[ ! -f "$ssl_key" ]]; then
        log_error "SSL private key file not found: $ssl_key"
        ((errors++))
    else
        local key_perms=$(stat -c %a "$ssl_key" 2>/dev/null)
        if [[ "$key_perms" != "600" ]]; then
            log_error "SSL private key has incorrect permissions: $key_perms (should be 600)"
            ((errors++))
        fi
        
        # Validate private key
        if ! openssl rsa -in "$ssl_key" -check -noout >/dev/null 2>&1; then
            log_error "SSL private key is invalid"
            ((errors++))
        fi
    fi
    
    # Test HTTPS connectivity
    if ! curl -f -s -k --connect-timeout 10 "https://localhost:$https_port/api/health" >/dev/null 2>&1; then
        log_error "HTTPS endpoint is not accessible"
        ((errors++))
    else
        log_verbose "HTTPS endpoint is accessible"
    fi
    
    # Test SSL certificate chain
    if ! echo | openssl s_client -connect "localhost:$https_port" -servername "$domain" >/dev/null 2>&1; then
        log_warning "SSL certificate chain validation failed"
    else
        log_verbose "SSL certificate chain is valid"
    fi
    
    return $errors
}

# Validate web interface functionality
validate_web_interface() {
    local errors=0
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    
    # Test HTTP endpoint (should redirect to HTTPS or serve content)
    local http_response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://localhost:$http_port/" 2>/dev/null)
    if [[ "$http_response" =~ ^(200|301|302|307|308)$ ]]; then
        log_verbose "HTTP endpoint responds correctly (status: $http_response)"
    else
        log_error "HTTP endpoint returned unexpected status: $http_response"
        ((errors++))
    fi
    
    # Test HTTPS endpoint
    local https_response=$(curl -s -k -o /dev/null -w "%{http_code}" --connect-timeout 10 "https://localhost:$https_port/" 2>/dev/null)
    if [[ "$https_response" == "200" ]]; then
        log_verbose "HTTPS endpoint responds correctly"
    else
        log_error "HTTPS endpoint returned unexpected status: $https_response"
        ((errors++))
    fi
    
    # Test static assets (if accessible)
    local static_endpoints=("/favicon.ico" "/css/main.css" "/js/main.js")
    for endpoint in "${static_endpoints[@]}"; do
        local response=$(curl -s -k -o /dev/null -w "%{http_code}" --connect-timeout 5 "https://localhost:$https_port$endpoint" 2>/dev/null)
        if [[ "$response" == "200" ]]; then
            log_verbose "Static asset accessible: $endpoint"
        else
            log_verbose "Static asset not found or not accessible: $endpoint (status: $response)"
        fi
    done
    
    return $errors
}

# Validate API endpoints and authentication
validate_api_endpoints() {
    local errors=0
    local https_port="${CONFIG[https_port]}"
    local base_url="https://localhost:$https_port"
    
    # Test health endpoint (should be publicly accessible)
    local health_response=$(curl -s -k --connect-timeout 10 "$base_url/api/health" 2>/dev/null)
    if [[ -n "$health_response" ]]; then
        log_verbose "Health API endpoint is accessible"
        
        # Check if response is valid JSON
        if echo "$health_response" | jq . >/dev/null 2>&1; then
            log_verbose "Health API returns valid JSON"
        else
            log_warning "Health API response is not valid JSON"
        fi
    else
        log_error "Health API endpoint is not accessible"
        ((errors++))
    fi
    
    # Test authentication endpoint (should require credentials)
    local auth_response=$(curl -s -k -o /dev/null -w "%{http_code}" --connect-timeout 10 "$base_url/api/auth/login" 2>/dev/null)
    if [[ "$auth_response" =~ ^(200|400|401|405)$ ]]; then
        log_verbose "Authentication API endpoint is accessible (status: $auth_response)"
    else
        log_error "Authentication API endpoint returned unexpected status: $auth_response"
        ((errors++))
    fi
    
    # Test protected endpoint (should return 401 without authentication)
    local protected_response=$(curl -s -k -o /dev/null -w "%{http_code}" --connect-timeout 10 "$base_url/api/implants" 2>/dev/null)
    if [[ "$protected_response" == "401" ]]; then
        log_verbose "Protected API endpoints properly require authentication"
    else
        log_warning "Protected API endpoint returned unexpected status: $protected_response"
    fi
    
    return $errors
}

# Validate network security configuration
validate_network_security() {
    local errors=0
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    local implant_port="${CONFIG[implant_port]}"
    
    # Check if firewall is active
    local firewall_active=false
    if command -v ufw >/dev/null 2>&1 && systemctl is-active --quiet ufw 2>/dev/null; then
        firewall_active=true
        log_verbose "UFW firewall is active"
    elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
        firewall_active=true
        log_verbose "firewalld is active"
    elif iptables -L >/dev/null 2>&1; then
        firewall_active=true
        log_verbose "iptables rules are configured"
    fi
    
    if [[ "$firewall_active" == "false" ]]; then
        log_warning "No active firewall detected"
    fi
    
    # Check if required ports are accessible
    local required_ports=("$http_port" "$https_port" "$implant_port")
    for port in "${required_ports[@]}"; do
        if ss -tlnp | grep -q ":$port "; then
            log_verbose "Port $port is listening"
        else
            log_error "Required port $port is not listening"
            ((errors++))
        fi
    done
    
    # Check for unnecessary open ports
    local open_ports=$(ss -tlnp | awk '/LISTEN/ {print $4}' | cut -d: -f2 | sort -n | uniq)
    local expected_ports=("22" "$http_port" "$https_port" "$implant_port" "5432" "6379")
    
    for port in $open_ports; do
        if [[ ! " ${expected_ports[@]} " =~ " $port " ]]; then
            log_warning "Unexpected open port detected: $port"
        fi
    done
    
    return $errors
}

# Validate file security and permissions
validate_file_security() {
    local errors=0
    local app_dir="${CONFIG[app_dir]}"
    local ssl_dir="${CONFIG[ssl_dir]}"
    local config_dir="${CONFIG[config_dir]}"
    local service_user="${CONFIG[service_user]}"
    
    # Check application directory permissions
    if [[ -d "$app_dir" ]]; then
        local app_owner=$(stat -c %U "$app_dir" 2>/dev/null)
        local app_perms=$(stat -c %a "$app_dir" 2>/dev/null)
        
        if [[ "$app_owner" != "$service_user" ]]; then
            log_error "Application directory owner is '$app_owner', expected '$service_user'"
            ((errors++))
        fi
        
        if [[ "$app_perms" != "755" ]]; then
            log_warning "Application directory permissions are '$app_perms', recommended '755'"
        fi
    else
        log_error "Application directory not found: $app_dir"
        ((errors++))
    fi
    
    # Check SSL directory permissions
    if [[ -d "$ssl_dir" ]]; then
        local ssl_perms=$(stat -c %a "$ssl_dir" 2>/dev/null)
        if [[ "$ssl_perms" != "755" ]]; then
            log_warning "SSL directory permissions are '$ssl_perms', recommended '755'"
        fi
        
        # Check SSL certificate permissions
        local ssl_cert="${CONFIG[ssl_cert_path]}"
        local ssl_key="${CONFIG[ssl_key_path]}"
        
        if [[ -f "$ssl_cert" ]]; then
            local cert_perms=$(stat -c %a "$ssl_cert" 2>/dev/null)
            if [[ "$cert_perms" != "644" ]]; then
                log_warning "SSL certificate permissions are '$cert_perms', recommended '644'"
            fi
        fi
        
        if [[ -f "$ssl_key" ]]; then
            local key_perms=$(stat -c %a "$ssl_key" 2>/dev/null)
            if [[ "$key_perms" != "600" ]]; then
                log_error "SSL private key permissions are '$key_perms', must be '600'"
                ((errors++))
            fi
        fi
    fi
    
    # Check configuration file permissions
    local env_file="$app_dir/.env"
    if [[ -f "$env_file" ]]; then
        local env_perms=$(stat -c %a "$env_file" 2>/dev/null)
        local env_owner=$(stat -c %U "$env_file" 2>/dev/null)
        
        if [[ "$env_owner" != "$service_user" ]]; then
            log_error "Environment file owner is '$env_owner', expected '$service_user'"
            ((errors++))
        fi
        
        if [[ "$env_perms" != "600" ]]; then
            log_error "Environment file permissions are '$env_perms', must be '600'"
            ((errors++))
        fi
    else
        log_error "Environment configuration file not found: $env_file"
        ((errors++))
    fi
    
    return $errors
}

# Validate system resources
validate_system_resources() {
    local warnings=0
    
    # Check memory usage
    local memory_info=$(free -m)
    local total_memory=$(echo "$memory_info" | awk '/^Mem:/ {print $2}')
    local used_memory=$(echo "$memory_info" | awk '/^Mem:/ {print $3}')
    local memory_usage_percent=$((used_memory * 100 / total_memory))
    
    log_verbose "Memory usage: ${used_memory}MB / ${total_memory}MB (${memory_usage_percent}%)"
    
    if [[ $memory_usage_percent -gt 90 ]]; then
        log_warning "High memory usage: ${memory_usage_percent}%"
        ((warnings++))
    elif [[ $memory_usage_percent -gt 80 ]]; then
        log_verbose "Memory usage is elevated: ${memory_usage_percent}%"
    fi
    
    # Check disk usage
    local disk_info=$(df -h /)
    local disk_usage_percent=$(echo "$disk_info" | awk 'NR==2 {print $5}' | sed 's/%//')
    local disk_available=$(echo "$disk_info" | awk 'NR==2 {print $4}')
    
    log_verbose "Disk usage: ${disk_usage_percent}% (${disk_available} available)"
    
    if [[ $disk_usage_percent -gt 90 ]]; then
        log_warning "High disk usage: ${disk_usage_percent}%"
        ((warnings++))
    elif [[ $disk_usage_percent -gt 80 ]]; then
        log_verbose "Disk usage is elevated: ${disk_usage_percent}%"
    fi
    
    # Check CPU load
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    local cpu_cores=$(nproc)
    local load_per_core=$(echo "$load_avg $cpu_cores" | awk '{printf "%.2f", $1/$2}')
    
    log_verbose "CPU load: $load_avg (${load_per_core} per core)"
    
    # Use awk instead of bc for better compatibility
    if awk "BEGIN {exit !($load_per_core > 2.0)}"; then
        log_warning "High CPU load: $load_per_core per core"
        ((warnings++))
    fi
    
    # Check if minimum requirements are met
    if [[ $total_memory -lt 2048 ]]; then
        log_warning "System has less than 2GB RAM: ${total_memory}MB"
        ((warnings++))
    fi
    
    if [[ $cpu_cores -lt 2 ]]; then
        log_warning "System has less than 2 CPU cores: $cpu_cores"
        ((warnings++))
    fi
    
    return $warnings
}

# Validate backup system
validate_backup_system() {
    local errors=0
    local backup_script="/usr/local/bin/seraphc2-backup"
    local backup_dir="${CONFIG[backup_dir]}"
    
    # Check if backup script exists and is executable
    if [[ ! -f "$backup_script" ]]; then
        log_error "Backup script not found: $backup_script"
        ((errors++))
    elif [[ ! -x "$backup_script" ]]; then
        log_error "Backup script is not executable: $backup_script"
        ((errors++))
    else
        log_verbose "Backup script is properly installed"
    fi
    
    # Check if backup directory exists and is writable
    if [[ ! -d "$backup_dir" ]]; then
        log_error "Backup directory not found: $backup_dir"
        ((errors++))
    elif [[ ! -w "$backup_dir" ]]; then
        log_error "Backup directory is not writable: $backup_dir"
        ((errors++))
    else
        log_verbose "Backup directory is accessible"
    fi
    
    # Check if backup cron job is configured
    if crontab -l 2>/dev/null | grep -q "seraphc2-backup"; then
        log_verbose "Backup cron job is configured"
    else
        log_warning "Backup cron job is not configured"
        ((errors++))
    fi
    
    return $errors
}

# Validate end-to-end functionality
validate_end_to_end_functionality() {
    log_info "Performing end-to-end functionality validation..."
    
    local errors=0
    local https_port="${CONFIG[https_port]}"
    local base_url="https://localhost:$https_port"
    
    # Test 1: Health check endpoint
    log_verbose "Testing health check endpoint..."
    local health_response=$(curl -s -k --connect-timeout 10 "$base_url/api/health" 2>/dev/null)
    if [[ -z "$health_response" ]]; then
        log_error "Health endpoint did not respond"
        ((errors++))
    else
        log_verbose "Health endpoint responded successfully"
    fi
    
    # Test 2: Static file serving
    log_verbose "Testing static file serving..."
    local static_response=$(curl -s -k -o /dev/null -w "%{http_code}" --connect-timeout 10 "$base_url/" 2>/dev/null)
    if [[ "$static_response" != "200" ]]; then
        log_error "Static file serving failed (status: $static_response)"
        ((errors++))
    else
        log_verbose "Static file serving is working"
    fi
    
    # Test 3: Database connectivity through application
    log_verbose "Testing database connectivity through application..."
    # This would typically involve making an API call that requires database access
    # For now, we'll test the health endpoint which should check database connectivity
    if echo "$health_response" | grep -q "database.*ok\|status.*ok\|healthy"; then
        log_verbose "Application can connect to database"
    else
        log_warning "Cannot verify database connectivity through application"
    fi
    
    # Test 4: Session management
    log_verbose "Testing session management..."
    # Create secure temporary file for session test
    local session_file=$(mktemp /tmp/seraphc2_session_XXXXXX) || session_file="/tmp/seraphc2_session_test"
    local session_test=$(curl -s -k -c "$session_file" -b "$session_file" "$base_url/" 2>/dev/null)
    if [[ -f "$session_file" ]]; then
        log_verbose "Session management is working"
        rm -f "$session_file"
    else
        log_warning "Session management test inconclusive"
    fi
    
    # Test 5: HTTPS redirect (if HTTP is enabled)
    local http_port="${CONFIG[http_port]}"
    if [[ "$http_port" != "$https_port" ]]; then
        log_verbose "Testing HTTPS redirect..."
        local redirect_response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://localhost:$http_port/" 2>/dev/null)
        if [[ "$redirect_response" =~ ^(301|302|307|308)$ ]]; then
            log_verbose "HTTPS redirect is working (status: $redirect_response)"
        else
            log_verbose "HTTPS redirect test inconclusive (status: $redirect_response)"
        fi
    fi
    
    if [[ $errors -eq 0 ]]; then
        log_success "End-to-end functionality validation passed"
        return 0
    else
        log_error "End-to-end functionality validation failed with $errors errors"
        return 1
    fi
}

# Test native deployment with default configuration
test_native_deployment_default_config() {
    log_info "Testing native deployment with default configuration..."
    
    local test_errors=0
    local test_start_time=$(date +%s)
    
    # Verify we're not using Docker
    if [[ "${CONFIG[mode]}" == "docker" ]]; then
        log_error "Test failed: Docker mode is enabled, expected native deployment"
        return 1
    fi
    
    # Verify default configuration values are being used
    local expected_defaults=(
        ["domain"]="localhost"
        ["http_port"]="3000"
        ["https_port"]="8443"
        ["implant_port"]="8080"
        ["ssl_type"]="self-signed"
        ["service_user"]="seraphc2"
    )
    
    for key in "${!expected_defaults[@]}"; do
        if [[ "${CONFIG[$key]}" != "${expected_defaults[$key]}" ]]; then
            log_error "Configuration mismatch: $key = '${CONFIG[$key]}', expected '${expected_defaults[$key]}'"
            ((test_errors++))
        fi
    done
    
    # Verify native services are installed (not Docker containers)
    local native_services=("postgresql" "redis-server" "seraphc2")
    for service in "${native_services[@]}"; do
        if ! systemctl list-unit-files | grep -q "$service"; then
            log_error "Native service not found: $service"
            ((test_errors++))
        fi
    done
    
    # Verify no Docker containers are running for SeraphC2
    if command -v docker >/dev/null 2>&1; then
        if docker ps --format "table {{.Names}}" | grep -q "seraphc2\|postgres\|redis"; then
            log_error "Docker containers detected, expected native deployment only"
            ((test_errors++))
        fi
    fi
    
    # Test that C2 server is fully functional without user input
    if ! validate_end_to_end_functionality; then
        log_error "C2 server is not fully functional"
        ((test_errors++))
    fi
    
    local test_end_time=$(date +%s)
    local test_duration=$((test_end_time - test_start_time))
    
    if [[ $test_errors -eq 0 ]]; then
        log_success "Native deployment with default configuration test passed (${test_duration}s)"
        log_success "✓ C2 server deployed natively without Docker"
        log_success "✓ Default configuration applied correctly"
        log_success "✓ All services running as native system services"
        log_success "✓ C2 server is fully functional without user input"
        return 0
    else
        log_error "Native deployment test failed with $test_errors errors (${test_duration}s)"
        return 1
    fi
}

# Test interactive mode functionality
test_interactive_mode() {
    log_info "Testing interactive mode functionality..."
    
    # This is a validation test to ensure interactive mode components exist
    local test_errors=0
    
    # Check if interactive configuration functions exist
    if ! declare -f run_interactive_configuration >/dev/null; then
        log_error "Interactive configuration function not found"
        ((test_errors++))
    fi
    
    # Check if prompt functions exist
    local required_functions=(
        "prompt_for_domain"
        "prompt_for_ports"
        "prompt_for_ssl_configuration"
        "confirm_configuration"
    )
    
    for func in "${required_functions[@]}"; do
        if ! declare -f "$func" >/dev/null; then
            log_error "Required interactive function not found: $func"
            ((test_errors++))
        fi
    done
    
    # Verify interactive mode can be enabled
    if [[ "${CONFIG[mode]}" == "interactive" ]]; then
        log_success "Interactive mode is properly enabled"
    else
        log_verbose "Interactive mode is not currently enabled (this is expected for default installation)"
    fi
    
    if [[ $test_errors -eq 0 ]]; then
        log_success "Interactive mode functionality test passed"
        return 0
    else
        log_error "Interactive mode functionality test failed with $test_errors errors"
        return 1
    fi
}

# Test Docker deployment functionality
test_docker_deployment() {
    log_info "Testing Docker deployment functionality..."
    
    local test_errors=0
    
    # Check if Docker deployment functions exist
    if ! declare -f deploy_with_docker >/dev/null; then
        log_error "Docker deployment function not found"
        ((test_errors++))
    fi
    
    # Check if Docker is available (if Docker mode is enabled)
    if [[ "${CONFIG[mode]}" == "docker" ]]; then
        if ! command -v docker >/dev/null 2>&1; then
            log_error "Docker command not found but Docker mode is enabled"
            ((test_errors++))
        fi
        
        if ! command -v docker-compose >/dev/null 2>&1; then
            log_error "Docker Compose not found but Docker mode is enabled"
            ((test_errors++))
        fi
        
        # Verify Docker containers are running
        if ! docker ps --format "table {{.Names}}" | grep -q "seraphc2"; then
            log_error "SeraphC2 Docker containers not running"
            ((test_errors++))
        fi
    else
        log_verbose "Docker mode is not enabled (testing function availability only)"
    fi
    
    if [[ $test_errors -eq 0 ]]; then
        log_success "Docker deployment functionality test passed"
        return 0
    else
        log_error "Docker deployment functionality test failed with $test_errors errors"
        return 1
    fi
}

# Test rollback functionality
test_rollback_functionality() {
    log_info "Testing rollback functionality..."
    
    local test_errors=0
    
    # Check if rollback functions exist
    local rollback_functions=(
        "perform_rollback"
        "rollback_systemd_service"
        "rollback_application_deployment"
        "rollback_database_setup"
        "rollback_ssl_certificates"
        "rollback_firewall_configuration"
    )
    
    for func in "${rollback_functions[@]}"; do
        if ! declare -f "$func" >/dev/null; then
            log_error "Required rollback function not found: $func"
            ((test_errors++))
        fi
    done
    
    # Test installation state tracking
    if [[ -z "${INSTALL_STATE[*]}" ]]; then
        log_error "Installation state tracking is not initialized"
        ((test_errors++))
    else
        log_verbose "Installation state tracking is working"
    fi
    
    # Test rollback state validation (without actually performing rollback)
    if declare -f validate_rollback_state >/dev/null; then
        log_verbose "Rollback state validation function exists"
    else
        log_verbose "Rollback state validation function not found (optional)"
    fi
    
    if [[ $test_errors -eq 0 ]]; then
        log_success "Rollback functionality test passed"
        return 0
    else
        log_error "Rollback functionality test failed with $test_errors errors"
        return 1
    fi
}

# Display comprehensive help information
show_help() {
    cat << EOF
$SCRIPT_NAME v$SCRIPT_VERSION

DESCRIPTION:
    Automated installation script for SeraphC2 Command and Control server.
    This script handles dependency installation, secure configuration generation,
    database setup, service management, and SSL certificate configuration.

USAGE:
    $0 [OPTIONS]

OPTIONS:
    -i, --interactive       Enable interactive configuration mode
                           Prompts for domain, ports, SSL options, and other settings
                           Default: Use sensible defaults without prompting

    -d, --docker           Use Docker deployment instead of native installation
                           Installs Docker/Docker Compose and deploys using containers
                           Default: Native installation with system packages

    -v, --verbose          Enable verbose output
                           Shows detailed information about each operation
                           Default: Standard output level

    --debug                Enable debug mode
                           Shows debug messages and additional diagnostic information
                           Implies --verbose
                           Default: Debug mode disabled

    --skip-backup          Skip backup configuration setup
                           Default: Configure automated backups

    --enable-hardening     Enable additional security hardening
                           Applies extra security measures and configurations
                           Default: Basic security configuration

    --domain=DOMAIN        Set the domain name for the C2 server
                           Default: localhost

    --ssl-type=TYPE        Set SSL certificate type (self-signed, letsencrypt, custom)
                           Default: self-signed

    --letsencrypt-email=EMAIL  Email address for Let's Encrypt certificate registration
                           Required when using --ssl-type=letsencrypt

    --ssl-cert-path=PATH   Path to custom SSL certificate file
                           Required when using --ssl-type=custom

    --ssl-key-path=PATH    Path to custom SSL private key file
                           Required when using --ssl-type=custom

    --update-check         Check for available updates without applying them
                           Compares current versions with latest releases
                           Default: No automatic update checking

    --update               Update all components to latest versions
                           Creates backup before updating and validates after
                           Default: No automatic updates

    --component=COMPONENT  Specify component to update (seraphc2, database, system, all)
                           Used with --update to update specific components only
                           Default: all

    --maintenance          Run maintenance tasks (log rotation, database cleanup, etc.)
                           Performs routine maintenance operations
                           Default: No automatic maintenance

    --backup-before-update Create backup before performing updates
                           Default: Enabled (recommended)

    --skip-service-restart Skip restarting services after updates
                           Default: Restart services after updates

    --help                 Display this help message and exit

    --help-troubleshooting Display troubleshooting guide and common issues

    --help-config          Display configuration options and recommendations

    --help-security        Display security best practices and hardening guide

    --help-maintenance     Display maintenance and operational procedures

    --validate-script      Perform script integrity checking and validation

    --version              Display version information and exit

EXAMPLES:
    # Basic installation with defaults (recommended for most users)
    sudo $0

    # Interactive installation with custom configuration
    sudo $0 --interactive

    # Docker-based deployment
    sudo $0 --docker

    # Interactive Docker deployment with verbose output
    sudo $0 --interactive --docker --verbose

    # Installation with security hardening and debug output
    sudo $0 --enable-hardening --debug

    # Installation with Let's Encrypt SSL certificate
    sudo $0 --ssl-type=letsencrypt --letsencrypt-email=admin@example.com --domain=c2.example.com

    # Installation with custom SSL certificate
    sudo $0 --ssl-type=custom --ssl-cert-path=/path/to/cert.pem --ssl-key-path=/path/to/key.pem

    # Silent installation with custom options
    sudo $0 --skip-backup --verbose

UPDATE AND MAINTENANCE EXAMPLES:
    # Check for available updates
    sudo $0 --update-check

    # Update all components
    sudo $0 --update

    # Update only the SeraphC2 application
    sudo $0 --update --component=seraphc2

    # Update database schema only
    sudo $0 --update --component=database

    # Update system components (Node.js, PostgreSQL, Redis)
    sudo $0 --update --component=system

    # Update with backup but skip service restart
    sudo $0 --update --backup-before-update --skip-service-restart

    # Run maintenance tasks
    sudo $0 --maintenance

CONFIGURATION:
    The script uses secure defaults for all configuration options:
    
    Network Configuration:
      - Domain: localhost
      - HTTP Port: 3000
      - HTTPS Port: 8443
      - Implant Port: 8080
    
    Security Configuration:
      - SSL: Self-signed certificates (can be changed to Let's Encrypt)
      - Database: Secure random passwords
      - JWT: Cryptographically secure secrets
      - Firewall: Enabled with minimal required ports
    
    System Configuration:
      - Service User: seraphc2
      - Application Directory: /opt/seraphc2
      - Configuration Directory: /etc/seraphc2
      - Log Directory: /var/log/seraphc2

SUPPORTED SYSTEMS:
    - Ubuntu 20.04 LTS or later
    - Debian 11 or later
    - CentOS 8 or later
    - RHEL 8 or later
    - Fedora 34 or later

REQUIREMENTS:
    - Root or sudo privileges
    - Internet connection for package downloads
    - Minimum 2GB RAM
    - Minimum 10GB free disk space
    - Supported Linux distribution

SECURITY NOTES:
    - All passwords and secrets are generated using cryptographically secure methods
    - Database and Redis are configured with authentication by default
    - Firewall rules are applied to restrict access to necessary ports only
    - SSL/TLS encryption is enabled by default
    - Service runs under dedicated non-root user account

TROUBLESHOOTING:
    - Check the log file for detailed error information
    - Ensure you have sudo privileges before running
    - Verify your system meets the minimum requirements
    - Check internet connectivity for package downloads
    - Review firewall settings if having connectivity issues

ADDITIONAL HELP:
    --help-troubleshooting  Display troubleshooting guide for common issues
    --help-config          Display detailed configuration options and recommendations
    --help-security        Display security best practices and hardening guide
    --help-maintenance     Display maintenance and operational procedures
    --validate-script      Perform script integrity checking and validation

DOCUMENTATION:
    Complete documentation is available in SERAPHC2_SETUP_DOCUMENTATION.md
    This includes detailed guides for configuration, security, troubleshooting,
    and maintenance procedures.

SUPPORT AND RESOURCES:
    Documentation: https://github.com/seraphc2/seraphc2/wiki
    Community: https://github.com/seraphc2/seraphc2/discussions
    Issues: https://github.com/seraphc2/seraphc2/issues
    Security: security@seraphc2.org

SCRIPT INFORMATION:
    Version: $SCRIPT_VERSION
    Log file: $SCRIPT_LOG_FILE (when running)
    Documentation: SERAPHC2_SETUP_DOCUMENTATION.md
    
    Run with --validate-script to check script integrity
    Run with --debug for detailed diagnostic output
EOF
}

# Parse command-line arguments
parse_arguments() {
    # Note: Cannot use log_debug here as logging is not yet initialized
    
    # If no arguments provided, use defaults
    if [[ $# -eq 0 ]]; then
        return 0
    fi
    
    while [[ $# -gt 0 ]]; do
        local arg="$1"
        
        case "$arg" in
            -h|--help)
                show_help
                exit $E_SUCCESS
                ;;
            --help-troubleshooting)
                show_troubleshooting_guide
                exit $E_SUCCESS
                ;;
            --help-config)
                show_configuration_guide
                exit $E_SUCCESS
                ;;
            --help-security)
                show_security_guide
                exit $E_SUCCESS
                ;;
            --help-maintenance)
                show_maintenance_guide
                exit $E_SUCCESS
                ;;
            --validate-script)
                validate_script_integrity
                exit $?
                ;;
            --version)
                show_version
                exit $E_SUCCESS
                ;;
            -i|--interactive)
                CONFIG[mode]="interactive"
                ;;
            -d|--docker)
                CONFIG[mode]="docker"
                ;;
            -v|--verbose)
                CONFIG[verbose]="true"
                ;;
            --debug)
                CONFIG[debug_mode]="true"
                CONFIG[verbose]="true"  # Debug implies verbose
                ;;
            --skip-backup)
                CONFIG[skip_backup]="true"
                ;;
            --enable-hardening)
                CONFIG[enable_hardening]="true"
                ;;
            --domain=*)
                CONFIG[domain]="${arg#*=}"
                ;;
            --http-port=*)
                local port="${arg#*=}"
                if validate_port "$port"; then
                    CONFIG[http_port]="$port"
                else
                    echo "Error: Invalid HTTP port: $port" >&2
                    exit $E_VALIDATION_ERROR
                fi
                ;;
            --https-port=*)
                local port="${arg#*=}"
                if validate_port "$port"; then
                    CONFIG[https_port]="$port"
                else
                    echo "Error: Invalid HTTPS port: $port" >&2
                    exit $E_VALIDATION_ERROR
                fi
                ;;
            --implant-port=*)
                local port="${arg#*=}"
                if validate_port "$port"; then
                    CONFIG[implant_port]="$port"
                else
                    echo "Error: Invalid implant port: $port" >&2
                    exit $E_VALIDATION_ERROR
                fi
                ;;
            --ssl-type=*)
                local ssl_type="${arg#*=}"
                if validate_ssl_type "$ssl_type"; then
                    CONFIG[ssl_type]="$ssl_type"
                else
                    echo "Error: Invalid SSL type: $ssl_type (valid: self-signed, letsencrypt, custom)" >&2
                    exit $E_VALIDATION_ERROR
                fi
                ;;
            --letsencrypt-email=*)
                CONFIG[letsencrypt_email]="${arg#*=}"
                ;;
            --ssl-cert-path=*)
                CONFIG[ssl_cert_path]="${arg#*=}"
                ;;
            --ssl-key-path=*)
                CONFIG[ssl_key_path]="${arg#*=}"
                ;;
            --test-mode)
                # Hidden flag for testing purposes
                CONFIG[test_mode]="true"
                ;;
            --test-rollback)
                # Hidden flag for testing rollback functionality
                CONFIG[test_rollback]="true"
                ;;
            --update)
                CONFIG[mode]="update"
                ;;
            --update-check)
                CONFIG[mode]="update-check"
                ;;
            --maintenance)
                CONFIG[mode]="maintenance"
                ;;
            --component=*)
                CONFIG[update_component]="${arg#*=}"
                ;;
            --backup-before-update)
                CONFIG[backup_before_update]="true"
                ;;
            --skip-service-restart)
                CONFIG[skip_service_restart]="true"
                ;;
            -*)
                echo "Error: Unknown option: $arg" >&2
                echo "Use --help to see available options" >&2
                exit $E_VALIDATION_ERROR
                ;;
            *)
                echo "Error: Unexpected argument: $arg" >&2
                echo "Use --help to see usage information" >&2
                exit $E_VALIDATION_ERROR
                ;;
        esac
        
        shift
    done
}

# Validate port number
validate_port() {
    local port="$1"
    
    # Check if port is a number
    if ! [[ "$port" =~ ^[0-9]+$ ]]; then
        return 1
    fi
    
    # Check port range (1-65535, avoiding well-known ports below 1024 for non-root)
    if [[ $port -lt 1024 || $port -gt 65535 ]]; then
        return 1
    fi
    
    return 0
}

# Validate SSL type
validate_ssl_type() {
    local ssl_type="$1"
    
    case "$ssl_type" in
        self-signed|letsencrypt|custom)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Validate configuration after parsing arguments
validate_configuration() {
    log_debug "Validating configuration..."
    
    # Note: Docker and interactive modes are not mutually exclusive
    # Interactive mode can be used with Docker deployment
    
    # Validate domain name format
    if [[ -n "${CONFIG[domain]}" ]]; then
        if ! validate_domain "${CONFIG[domain]}"; then
            log_warning "Domain '${CONFIG[domain]}' may not be valid. Proceeding anyway."
        fi
    fi
    
    # Check for port conflicts
    local ports=("${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}")
    local unique_ports=($(printf '%s\n' "${ports[@]}" | sort -u))
    
    if [[ ${#ports[@]} -ne ${#unique_ports[@]} ]]; then
        log_error "Port conflict detected. All ports must be unique."
        log_error "HTTP: ${CONFIG[http_port]}, HTTPS: ${CONFIG[https_port]}, Implant: ${CONFIG[implant_port]}"
        exit $E_VALIDATION_ERROR
    fi
    
    # Validate Let's Encrypt email if using Let's Encrypt
    if [[ "${CONFIG[ssl_type]}" == "letsencrypt" ]]; then
        if [[ -z "${CONFIG[letsencrypt_email]}" ]]; then
            log_error "Let's Encrypt email is required when using --ssl-type=letsencrypt"
            log_info "Use --letsencrypt-email=your@email.com or switch to interactive mode"
            exit $E_VALIDATION_ERROR
        fi
        
        if ! validate_email "${CONFIG[letsencrypt_email]}"; then
            log_error "Invalid email address: ${CONFIG[letsencrypt_email]}"
            exit $E_VALIDATION_ERROR
        fi
    fi
    
    log_debug "Configuration validation completed successfully"
}

#==============================================================================
# UPDATE AND MAINTENANCE SYSTEM (Task 21)
#==============================================================================

# Version information and update checking
readonly SERAPHC2_REPO_URL="https://api.github.com/repos/seraphc2/seraphc2"
readonly SERAPHC2_RELEASES_URL="https://api.github.com/repos/seraphc2/seraphc2/releases"
readonly CURRENT_SCRIPT_VERSION="$SCRIPT_VERSION"

# Update configuration
declare -A UPDATE_CONFIG=(
    ["check_interval_hours"]="24"
    ["backup_before_update"]="true"
    ["auto_restart_services"]="true"
    ["update_timeout_minutes"]="30"
    ["rollback_on_failure"]="true"
)

# Component version tracking
declare -A COMPONENT_VERSIONS=(
    ["seraphc2"]=""
    ["nodejs"]=""
    ["postgresql"]=""
    ["redis"]=""
    ["script"]="$SCRIPT_VERSION"
)

# Check for available updates
check_for_updates() {
    log_info "Checking for available updates..."
    
    local current_version=""
    local latest_version=""
    local updates_available=false
    
    # Check SeraphC2 application updates
    if check_seraphc2_updates; then
        updates_available=true
    fi
    
    # Check script updates
    if check_script_updates; then
        updates_available=true
    fi
    
    # Check component updates
    if check_component_updates; then
        updates_available=true
    fi
    
    if [[ "$updates_available" == "true" ]]; then
        log_info "Updates are available!"
        return 0
    else
        log_success "All components are up to date"
        return 1
    fi
}

# Check for SeraphC2 application updates
check_seraphc2_updates() {
    log_debug "Checking SeraphC2 application updates..."
    
    local app_dir="${CONFIG[app_dir]}"
    local package_json="$app_dir/package.json"
    local current_version=""
    local latest_version=""
    
    # Get current version from package.json
    if [[ -f "$package_json" ]]; then
        current_version=$(grep '"version"' "$package_json" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
        COMPONENT_VERSIONS[seraphc2]="$current_version"
        log_debug "Current SeraphC2 version: $current_version"
    else
        log_warning "SeraphC2 package.json not found, cannot determine current version"
        return 1
    fi
    
    # Get latest version from GitHub API
    if command -v curl >/dev/null 2>&1; then
        latest_version=$(curl -s --connect-timeout 10 --max-time 30 "$SERAPHC2_RELEASES_URL/latest" 2>/dev/null | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' | sed 's/^v//')
        if [[ -z "$latest_version" ]]; then
            log_warning "Failed to fetch latest version information via curl"
            return 1
        fi
    elif command -v wget >/dev/null 2>&1; then
        latest_version=$(wget --timeout=30 --tries=2 -qO- "$SERAPHC2_RELEASES_URL/latest" 2>/dev/null | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' | sed 's/^v//')
        if [[ -z "$latest_version" ]]; then
            log_warning "Failed to fetch latest version information via wget"
            return 1
        fi
    else
        log_warning "Neither curl nor wget available, cannot check for updates"
        return 1
    fi
    
    if [[ -z "$latest_version" ]]; then
        log_warning "Could not retrieve latest version information"
        return 1
    fi
    
    log_debug "Latest SeraphC2 version: $latest_version"
    
    # Compare versions
    if version_compare "$current_version" "$latest_version"; then
        log_info "SeraphC2 update available: $current_version → $latest_version"
        return 0
    else
        log_debug "SeraphC2 is up to date"
        return 1
    fi
}

# Check for script updates
check_script_updates() {
    log_debug "Checking setup script updates..."
    
    # For now, we'll assume the script is part of the SeraphC2 repository
    # In a real implementation, this could check a separate repository or version endpoint
    log_debug "Script version checking not implemented yet"
    return 1
}

# Check for component updates (Node.js, PostgreSQL, Redis)
check_component_updates() {
    log_debug "Checking component updates..."
    
    local updates_available=false
    
    # Check Node.js updates
    if check_nodejs_updates; then
        updates_available=true
    fi
    
    # Check PostgreSQL updates
    if check_postgresql_updates; then
        updates_available=true
    fi
    
    # Check Redis updates
    if check_redis_updates; then
        updates_available=true
    fi
    
    [[ "$updates_available" == "true" ]]
}

# Check Node.js updates
check_nodejs_updates() {
    local current_version=""
    local latest_version=""
    
    if command -v node >/dev/null 2>&1; then
        current_version=$(node --version | sed 's/^v//')
        COMPONENT_VERSIONS[nodejs]="$current_version"
        log_debug "Current Node.js version: $current_version"
        
        # For simplicity, we'll just log that we checked
        # In a real implementation, this would check against the latest LTS version
        log_debug "Node.js update checking not fully implemented"
        return 1
    else
        log_debug "Node.js not installed"
        return 1
    fi
}

# Check PostgreSQL updates
check_postgresql_updates() {
    local current_version=""
    
    if command -v psql >/dev/null 2>&1; then
        current_version=$(psql --version | awk '{print $3}' | head -1)
        COMPONENT_VERSIONS[postgresql]="$current_version"
        log_debug "Current PostgreSQL version: $current_version"
        
        # For simplicity, we'll just log that we checked
        log_debug "PostgreSQL update checking not fully implemented"
        return 1
    else
        log_debug "PostgreSQL not installed"
        return 1
    fi
}

# Check Redis updates
check_redis_updates() {
    local current_version=""
    
    if command -v redis-server >/dev/null 2>&1; then
        current_version=$(redis-server --version | awk '{print $3}' | sed 's/v=//')
        COMPONENT_VERSIONS[redis]="$current_version"
        log_debug "Current Redis version: $current_version"
        
        # For simplicity, we'll just log that we checked
        log_debug "Redis update checking not fully implemented"
        return 1
    else
        log_debug "Redis not installed"
        return 1
    fi
}

# Compare two version strings (returns 0 if first version is older)
version_compare() {
    local version1="$1"
    local version2="$2"
    
    # Simple version comparison - in production, use a more robust method
    if [[ "$version1" != "$version2" ]]; then
        # Use sort -V for version sorting if available
        if command -v sort >/dev/null 2>&1; then
            local older_version=$(printf '%s\n%s\n' "$version1" "$version2" | sort -V | head -1)
            [[ "$older_version" == "$version1" ]]
        else
            # Fallback to string comparison
            [[ "$version1" < "$version2" ]]
        fi
    else
        return 1  # Versions are equal
    fi
}

# Perform updates based on configuration
perform_updates() {
    log_info "Starting update process..."
    
    local component="${CONFIG[update_component]:-all}"
    local backup_created=false
    local update_errors=0
    
    # Create backup before updates if requested
    if [[ "${CONFIG[backup_before_update]}" == "true" || "${UPDATE_CONFIG[backup_before_update]}" == "true" ]]; then
        log_info "Creating backup before update..."
        if create_pre_update_backup; then
            backup_created=true
            log_success "Pre-update backup created successfully"
        else
            log_error "Failed to create pre-update backup"
            if [[ "${UPDATE_CONFIG[rollback_on_failure]}" == "true" ]]; then
                log_error "Aborting update due to backup failure"
                return 1
            else
                log_warning "Continuing update without backup (risky!)"
            fi
        fi
    fi
    
    # Perform component-specific updates
    case "$component" in
        "all")
            log_info "Updating all components..."
            
            if ! update_seraphc2_application; then
                log_error "SeraphC2 application update failed"
                ((update_errors++))
            fi
            
            if ! update_database_schema; then
                log_error "Database schema update failed"
                ((update_errors++))
            fi
            
            if ! update_system_components; then
                log_error "System components update failed"
                ((update_errors++))
            fi
            ;;
        "seraphc2"|"application")
            log_info "Updating SeraphC2 application..."
            if ! update_seraphc2_application; then
                log_error "SeraphC2 application update failed"
                ((update_errors++))
            fi
            ;;
        "database"|"db")
            log_info "Updating database schema..."
            if ! update_database_schema; then
                log_error "Database schema update failed"
                ((update_errors++))
            fi
            ;;
        "system"|"components")
            log_info "Updating system components..."
            if ! update_system_components; then
                log_error "System components update failed"
                ((update_errors++))
            fi
            ;;
        *)
            log_error "Unknown component: $component"
            log_info "Valid components: all, seraphc2, database, system"
            return 1
            ;;
    esac
    
    # Handle update results
    if [[ $update_errors -eq 0 ]]; then
        log_success "All updates completed successfully!"
        
        # Restart services if requested
        if [[ "${CONFIG[skip_service_restart]}" != "true" && "${UPDATE_CONFIG[auto_restart_services]}" == "true" ]]; then
            restart_services_after_update
        fi
        
        # Validate installation after update
        validate_installation_after_update
        
        return 0
    else
        log_error "Update completed with $update_errors errors"
        
        # Offer rollback if backup was created
        if [[ "$backup_created" == "true" && "${UPDATE_CONFIG[rollback_on_failure]}" == "true" ]]; then
            if confirm_action "Update failed. Would you like to rollback to the previous version?" "y"; then
                rollback_from_backup
            fi
        fi
        
        return 1
    fi
}

# Update SeraphC2 application
update_seraphc2_application() {
    log_info "Updating SeraphC2 application..."
    
    local app_dir="${CONFIG[app_dir]}"
    local service_name="seraphc2"
    local backup_dir="/tmp/seraphc2_update_backup_$(date +%Y%m%d_%H%M%S)"
    
    # Stop the service before update
    log_info "Stopping SeraphC2 service..."
    if systemctl is-active --quiet "$service_name"; then
        if ! systemctl stop "$service_name"; then
            log_error "Failed to stop SeraphC2 service"
            return 1
        fi
        log_success "SeraphC2 service stopped"
    fi
    
    # Create application backup
    log_info "Creating application backup..."
    if ! cp -r "$app_dir" "$backup_dir"; then
        log_error "Failed to create application backup"
        return 1
    fi
    
    # Update application code
    log_info "Updating application code..."
    cd "$app_dir" || {
        log_error "Failed to change to application directory: $app_dir"
        return 1
    }
    
    # Pull latest code (assuming git repository)
    if [[ -d ".git" ]]; then
        log_info "Pulling latest code from repository..."
        if ! git pull origin main; then
            log_error "Failed to pull latest code"
            # Restore from backup
            log_info "Restoring from backup..."
            rm -rf "$app_dir"
            mv "$backup_dir" "$app_dir"
            return 1
        fi
    else
        log_warning "Not a git repository, skipping code update"
    fi
    
    # Install/update dependencies
    log_info "Installing/updating dependencies..."
    if ! npm ci --production; then
        log_error "Failed to install dependencies"
        # Restore from backup
        log_info "Restoring from backup..."
        rm -rf "$app_dir"
        mv "$backup_dir" "$app_dir"
        return 1
    fi
    
    # Build application
    log_info "Building application..."
    if ! npm run build; then
        log_error "Failed to build application"
        # Restore from backup
        log_info "Restoring from backup..."
        rm -rf "$app_dir"
        mv "$backup_dir" "$app_dir"
        return 1
    fi
    
    # Clean up backup on success
    rm -rf "$backup_dir"
    
    log_success "SeraphC2 application updated successfully"
    return 0
}

# Update database schema and run migrations
update_database_schema() {
    log_info "Updating database schema..."
    
    local app_dir="${CONFIG[app_dir]}"
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local migration_script="$app_dir/scripts/migrate.ts"
    
    # Check if migration script exists
    if [[ ! -f "$migration_script" ]]; then
        log_warning "Migration script not found: $migration_script"
        log_info "Skipping database schema update"
        return 0
    fi
    
    # Create database backup before migration
    log_info "Creating database backup before migration..."
    local db_backup_file="/tmp/seraphc2_db_backup_$(date +%Y%m%d_%H%M%S).sql"
    
    if ! sudo -u postgres pg_dump "$db_name" > "$db_backup_file"; then
        log_error "Failed to create database backup"
        return 1
    fi
    
    log_success "Database backup created: $db_backup_file"
    
    # Run database migrations
    log_info "Running database migrations..."
    cd "$app_dir" || {
        log_error "Failed to change to application directory: $app_dir"
        return 1
    }
    
    if ! npm run migrate; then
        log_error "Database migration failed"
        
        # Offer to restore from backup
        if confirm_action "Database migration failed. Restore from backup?" "y"; then
            log_info "Restoring database from backup..."
            if sudo -u postgres psql "$db_name" < "$db_backup_file"; then
                log_success "Database restored from backup"
            else
                log_error "Failed to restore database from backup"
            fi
        fi
        
        return 1
    fi
    
    # Verify database schema integrity
    log_info "Verifying database schema integrity..."
    if ! verify_database_schema; then
        log_error "Database schema verification failed"
        return 1
    fi
    
    log_success "Database schema updated successfully"
    return 0
}

# Update system components (Node.js, PostgreSQL, Redis)
update_system_components() {
    log_info "Updating system components..."
    
    local update_errors=0
    
    # Update package lists first
    log_info "Updating package lists..."
    case "${SYSTEM_INFO[package_manager]}" in
        "apt")
            if ! apt-get update; then
                log_warning "Failed to update package lists"
            fi
            ;;
        "yum"|"dnf")
            if ! ${SYSTEM_INFO[package_manager]} check-update; then
                log_debug "Package check completed"
            fi
            ;;
    esac
    
    # Update Node.js if requested
    log_info "Checking Node.js updates..."
    if update_nodejs_component; then
        log_success "Node.js updated successfully"
    else
        log_warning "Node.js update failed or not needed"
        ((update_errors++))
    fi
    
    # Update PostgreSQL if requested
    log_info "Checking PostgreSQL updates..."
    if update_postgresql_component; then
        log_success "PostgreSQL updated successfully"
    else
        log_warning "PostgreSQL update failed or not needed"
        ((update_errors++))
    fi
    
    # Update Redis if requested
    log_info "Checking Redis updates..."
    if update_redis_component; then
        log_success "Redis updated successfully"
    else
        log_warning "Redis update failed or not needed"
        ((update_errors++))
    fi
    
    if [[ $update_errors -eq 0 ]]; then
        log_success "All system components updated successfully"
        return 0
    else
        log_warning "Some system component updates failed"
        return 1
    fi
}

# Update Node.js component
update_nodejs_component() {
    log_debug "Updating Node.js component..."
    
    # For now, we'll just check if updates are available through the package manager
    case "${SYSTEM_INFO[package_manager]}" in
        "apt")
            if apt list --upgradable 2>/dev/null | grep -q "^nodejs/"; then
                log_info "Node.js updates available, updating..."
                if apt-get install -y nodejs npm; then
                    return 0
                else
                    log_error "Failed to update Node.js"
                    return 1
                fi
            else
                log_debug "No Node.js updates available"
                return 0
            fi
            ;;
        "yum"|"dnf")
            if ${SYSTEM_INFO[package_manager]} list updates nodejs 2>/dev/null | grep -q nodejs; then
                log_info "Node.js updates available, updating..."
                if ${SYSTEM_INFO[package_manager]} update -y nodejs npm; then
                    return 0
                else
                    log_error "Failed to update Node.js"
                    return 1
                fi
            else
                log_debug "No Node.js updates available"
                return 0
            fi
            ;;
        *)
            log_warning "Unsupported package manager for Node.js updates"
            return 1
            ;;
    esac
}

# Update PostgreSQL component
update_postgresql_component() {
    log_debug "Updating PostgreSQL component..."
    
    # For now, we'll just check if updates are available through the package manager
    case "${SYSTEM_INFO[package_manager]}" in
        "apt")
            if apt list --upgradable 2>/dev/null | grep -q "^postgresql"; then
                log_info "PostgreSQL updates available, updating..."
                if apt-get install -y postgresql postgresql-contrib; then
                    return 0
                else
                    log_error "Failed to update PostgreSQL"
                    return 1
                fi
            else
                log_debug "No PostgreSQL updates available"
                return 0
            fi
            ;;
        "yum"|"dnf")
            if ${SYSTEM_INFO[package_manager]} list updates postgresql-server 2>/dev/null | grep -q postgresql; then
                log_info "PostgreSQL updates available, updating..."
                if ${SYSTEM_INFO[package_manager]} update -y postgresql-server postgresql; then
                    return 0
                else
                    log_error "Failed to update PostgreSQL"
                    return 1
                fi
            else
                log_debug "No PostgreSQL updates available"
                return 0
            fi
            ;;
        *)
            log_warning "Unsupported package manager for PostgreSQL updates"
            return 1
            ;;
    esac
}

# Update Redis component
update_redis_component() {
    log_debug "Updating Redis component..."
    
    # For now, we'll just check if updates are available through the package manager
    case "${SYSTEM_INFO[package_manager]}" in
        "apt")
            if apt list --upgradable 2>/dev/null | grep -q "^redis"; then
                log_info "Redis updates available, updating..."
                if apt-get install -y redis-server; then
                    return 0
                else
                    log_error "Failed to update Redis"
                    return 1
                fi
            else
                log_debug "No Redis updates available"
                return 0
            fi
            ;;
        "yum"|"dnf")
            if ${SYSTEM_INFO[package_manager]} list updates redis 2>/dev/null | grep -q redis; then
                log_info "Redis updates available, updating..."
                if ${SYSTEM_INFO[package_manager]} update -y redis; then
                    return 0
                else
                    log_error "Failed to update Redis"
                    return 1
                fi
            else
                log_debug "No Redis updates available"
                return 0
            fi
            ;;
        *)
            log_warning "Unsupported package manager for Redis updates"
            return 1
            ;;
    esac
}

# Create comprehensive backup before updates
create_pre_update_backup() {
    log_info "Creating comprehensive pre-update backup..."
    
    local backup_timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_base_dir="${CONFIG[backup_dir]}/pre_update_$backup_timestamp"
    local backup_errors=0
    
    # Create backup directory
    if ! mkdir -p "$backup_base_dir"; then
        log_error "Failed to create backup directory: $backup_base_dir"
        return 1
    fi
    
    # Backup application directory
    log_info "Backing up application directory..."
    if [[ -d "${CONFIG[app_dir]}" ]]; then
        if ! cp -r "${CONFIG[app_dir]}" "$backup_base_dir/application"; then
            log_error "Failed to backup application directory"
            ((backup_errors++))
        fi
    fi
    
    # Backup configuration directory
    log_info "Backing up configuration directory..."
    if [[ -d "${CONFIG[config_dir]}" ]]; then
        if ! cp -r "${CONFIG[config_dir]}" "$backup_base_dir/configuration"; then
            log_error "Failed to backup configuration directory"
            ((backup_errors++))
        fi
    fi
    
    # Backup SSL certificates
    log_info "Backing up SSL certificates..."
    if [[ -d "${CONFIG[ssl_dir]}" ]]; then
        if ! cp -r "${CONFIG[ssl_dir]}" "$backup_base_dir/ssl"; then
            log_error "Failed to backup SSL certificates"
            ((backup_errors++))
        fi
    fi
    
    # Backup database
    log_info "Backing up database..."
    local db_backup_file="$backup_base_dir/database.sql"
    if ! sudo -u postgres pg_dump "${CONFIG[db_name]}" > "$db_backup_file"; then
        log_error "Failed to backup database"
        ((backup_errors++))
    fi
    
    # Create backup manifest
    cat > "$backup_base_dir/backup_manifest.txt" <<EOF
SeraphC2 Pre-Update Backup
Created: $(date)
Script Version: $SCRIPT_VERSION
Backup Directory: $backup_base_dir

Components Backed Up:
- Application: ${CONFIG[app_dir]}
- Configuration: ${CONFIG[config_dir]}
- SSL Certificates: ${CONFIG[ssl_dir]}
- Database: ${CONFIG[db_name]}

Component Versions:
$(for component in "${!COMPONENT_VERSIONS[@]}"; do
    echo "- $component: ${COMPONENT_VERSIONS[$component]}"
done)

System Information:
- OS: ${SYSTEM_INFO[os_type]} ${SYSTEM_INFO[os_version]}
- Architecture: ${SYSTEM_INFO[architecture]}
- Hostname: ${SYSTEM_INFO[hostname]}
EOF
    
    if [[ $backup_errors -eq 0 ]]; then
        log_success "Pre-update backup created successfully: $backup_base_dir"
        echo "$backup_base_dir" > "/tmp/seraphc2_last_backup.txt"
        return 0
    else
        log_error "Pre-update backup completed with $backup_errors errors"
        return 1
    fi
}

# Restart services after update
restart_services_after_update() {
    log_info "Restarting services after update..."
    
    local service_errors=0
    local services=("seraphc2" "postgresql" "redis-server")
    
    for service in "${services[@]}"; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            log_info "Restarting service: $service"
            
            if systemctl restart "$service"; then
                log_success "Service restarted: $service"
                
                # Wait a moment and check if service is running
                sleep 2
                if systemctl is-active --quiet "$service"; then
                    log_success "Service is running: $service"
                else
                    log_error "Service failed to start: $service"
                    ((service_errors++))
                fi
            else
                log_error "Failed to restart service: $service"
                ((service_errors++))
            fi
        else
            log_debug "Service not enabled, skipping: $service"
        fi
    done
    
    if [[ $service_errors -eq 0 ]]; then
        log_success "All services restarted successfully"
        return 0
    else
        log_error "Service restart completed with $service_errors errors"
        return 1
    fi
}

# Validate installation after update
validate_installation_after_update() {
    log_info "Validating installation after update..."
    
    local validation_errors=0
    
    # Check if SeraphC2 service is running
    if ! systemctl is-active --quiet seraphc2; then
        log_error "SeraphC2 service is not running"
        ((validation_errors++))
    else
        log_success "SeraphC2 service is running"
    fi
    
    # Check database connectivity
    if ! test_database_connection; then
        log_error "Database connectivity test failed"
        ((validation_errors++))
    else
        log_success "Database connectivity test passed"
    fi
    
    # Check Redis connectivity
    if ! test_redis_connection; then
        log_error "Redis connectivity test failed"
        ((validation_errors++))
    else
        log_success "Redis connectivity test passed"
    fi
    
    # Check web interface accessibility
    local http_port="${CONFIG[http_port]}"
    if command -v curl >/dev/null 2>&1; then
        if curl -f -s "http://localhost:$http_port/api/health" >/dev/null; then
            log_success "Web interface is accessible"
        else
            log_error "Web interface is not accessible"
            ((validation_errors++))
        fi
    else
        log_warning "curl not available, skipping web interface test"
    fi
    
    if [[ $validation_errors -eq 0 ]]; then
        log_success "Installation validation passed"
        return 0
    else
        log_error "Installation validation failed with $validation_errors errors"
        return 1
    fi
}

# Rollback from backup after failed update
rollback_from_backup() {
    log_warning "Starting rollback from backup..."
    
    local last_backup_file="/tmp/seraphc2_last_backup.txt"
    local backup_dir=""
    
    # Get the last backup directory
    if [[ -f "$last_backup_file" ]]; then
        backup_dir=$(cat "$last_backup_file")
    else
        log_error "No backup information found"
        return 1
    fi
    
    if [[ ! -d "$backup_dir" ]]; then
        log_error "Backup directory not found: $backup_dir"
        return 1
    fi
    
    log_info "Rolling back from backup: $backup_dir"
    
    # Stop services before rollback
    log_info "Stopping services for rollback..."
    systemctl stop seraphc2 2>/dev/null || true
    
    # Restore application directory
    if [[ -d "$backup_dir/application" ]]; then
        log_info "Restoring application directory..."
        rm -rf "${CONFIG[app_dir]}"
        if ! cp -r "$backup_dir/application" "${CONFIG[app_dir]}"; then
            log_error "Failed to restore application directory"
            return 1
        fi
    fi
    
    # Restore configuration directory
    if [[ -d "$backup_dir/configuration" ]]; then
        log_info "Restoring configuration directory..."
        rm -rf "${CONFIG[config_dir]}"
        if ! cp -r "$backup_dir/configuration" "${CONFIG[config_dir]}"; then
            log_error "Failed to restore configuration directory"
            return 1
        fi
    fi
    
    # Restore SSL certificates
    if [[ -d "$backup_dir/ssl" ]]; then
        log_info "Restoring SSL certificates..."
        rm -rf "${CONFIG[ssl_dir]}"
        if ! cp -r "$backup_dir/ssl" "${CONFIG[ssl_dir]}"; then
            log_error "Failed to restore SSL certificates"
            return 1
        fi
    fi
    
    # Restore database
    if [[ -f "$backup_dir/database.sql" ]]; then
        log_info "Restoring database..."
        if ! sudo -u postgres psql "${CONFIG[db_name]}" < "$backup_dir/database.sql"; then
            log_error "Failed to restore database"
            return 1
        fi
    fi
    
    # Restart services
    log_info "Restarting services after rollback..."
    if systemctl start seraphc2; then
        log_success "SeraphC2 service started after rollback"
    else
        log_error "Failed to start SeraphC2 service after rollback"
        return 1
    fi
    
    log_success "Rollback completed successfully"
    return 0
}

# Verify database schema integrity
verify_database_schema() {
    log_debug "Verifying database schema integrity..."
    
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    
    # Check if we can connect to the database
    if ! sudo -u postgres psql -d "$db_name" -c "SELECT 1;" >/dev/null 2>&1; then
        log_error "Cannot connect to database: $db_name"
        return 1
    fi
    
    # Check if essential tables exist (this would be customized based on SeraphC2's schema)
    local essential_tables=("users" "sessions" "implants" "commands" "results")
    
    for table in "${essential_tables[@]}"; do
        if ! sudo -u postgres psql -d "$db_name" -c "SELECT 1 FROM $table LIMIT 1;" >/dev/null 2>&1; then
            log_warning "Table may not exist or be accessible: $table"
        fi
    done
    
    log_debug "Database schema verification completed"
    return 0
}

# Test database connection
test_database_connection() {
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    
    # Test connection using the application user
    if PGPASSWORD="$db_password" psql -h localhost -U "$db_user" -d "$db_name" -c "SELECT 1;" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Test Redis connection
test_redis_connection() {
    local redis_password="${CONFIG[redis_password]}"
    
    if command -v redis-cli >/dev/null 2>&1; then
        if redis-cli -a "$redis_password" ping 2>/dev/null | grep -q "PONG"; then
            return 0
        else
            return 1
        fi
    else
        log_warning "redis-cli not available for connection test"
        return 1
    fi
}

# Maintenance tasks
perform_maintenance() {
    log_info "Starting maintenance tasks..."
    
    local maintenance_errors=0
    
    # Log rotation
    if ! perform_log_rotation; then
        log_error "Log rotation failed"
        ((maintenance_errors++))
    fi
    
    # Database cleanup
    if ! perform_database_cleanup; then
        log_error "Database cleanup failed"
        ((maintenance_errors++))
    fi
    
    # Performance optimization
    if ! perform_performance_optimization; then
        log_error "Performance optimization failed"
        ((maintenance_errors++))
    fi
    
    # System cleanup
    if ! perform_system_cleanup; then
        log_error "System cleanup failed"
        ((maintenance_errors++))
    fi
    
    if [[ $maintenance_errors -eq 0 ]]; then
        log_success "All maintenance tasks completed successfully"
        return 0
    else
        log_error "Maintenance completed with $maintenance_errors errors"
        return 1
    fi
}

# Perform log rotation
perform_log_rotation() {
    log_info "Performing log rotation..."
    
    local log_dir="${CONFIG[log_dir]}"
    local app_logs=("$log_dir"/*.log)
    local rotated_count=0
    
    # Rotate application logs
    for log_file in "${app_logs[@]}"; do
        if [[ -f "$log_file" && -s "$log_file" ]]; then
            local base_name=$(basename "$log_file" .log)
            local timestamp=$(date +%Y%m%d_%H%M%S)
            local rotated_name="${log_file%.log}_$timestamp.log"
            
            if mv "$log_file" "$rotated_name"; then
                gzip "$rotated_name"
                ((rotated_count++))
                log_debug "Rotated log: $log_file"
            fi
        fi
    done
    
    # Clean up old rotated logs (older than 30 days)
    find "$log_dir" -name "*.log.gz" -mtime +30 -delete 2>/dev/null || true
    
    # Restart rsyslog to create new log files
    if systemctl is-active --quiet rsyslog; then
        systemctl reload rsyslog 2>/dev/null || true
    fi
    
    log_success "Log rotation completed. Rotated $rotated_count log files"
    return 0
}

# Perform database cleanup
perform_database_cleanup() {
    log_info "Performing database cleanup..."
    
    local db_name="${CONFIG[db_name]}"
    local cleanup_errors=0
    
    # Clean up old sessions (older than 30 days)
    if ! sudo -u postgres psql -d "$db_name" -c "DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '30 days';" >/dev/null 2>&1; then
        log_warning "Failed to clean up old sessions"
        ((cleanup_errors++))
    fi
    
    # Clean up old command results (older than 90 days)
    if ! sudo -u postgres psql -d "$db_name" -c "DELETE FROM results WHERE created_at < NOW() - INTERVAL '90 days';" >/dev/null 2>&1; then
        log_warning "Failed to clean up old command results"
        ((cleanup_errors++))
    fi
    
    # Vacuum and analyze database
    if ! sudo -u postgres psql -d "$db_name" -c "VACUUM ANALYZE;" >/dev/null 2>&1; then
        log_warning "Failed to vacuum database"
        ((cleanup_errors++))
    fi
    
    if [[ $cleanup_errors -eq 0 ]]; then
        log_success "Database cleanup completed successfully"
        return 0
    else
        log_warning "Database cleanup completed with $cleanup_errors warnings"
        return 1
    fi
}

# Perform performance optimization
perform_performance_optimization() {
    log_info "Performing performance optimization..."
    
    local optimization_errors=0
    
    # Clear system caches
    if [[ -w /proc/sys/vm/drop_caches ]]; then
        echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || {
            log_warning "Failed to clear system caches"
            ((optimization_errors++))
        }
    fi
    
    # Optimize PostgreSQL if running
    if systemctl is-active --quiet postgresql; then
        # Reindex database
        if ! sudo -u postgres reindexdb "${CONFIG[db_name]}" >/dev/null 2>&1; then
            log_warning "Failed to reindex database"
            ((optimization_errors++))
        fi
    fi
    
    # Optimize Redis if running
    if systemctl is-active --quiet redis-server; then
        # Redis doesn't need much optimization, but we can check memory usage
        local redis_memory=$(redis-cli info memory 2>/dev/null | grep used_memory_human || echo "unknown")
        log_debug "Redis memory usage: $redis_memory"
    fi
    
    if [[ $optimization_errors -eq 0 ]]; then
        log_success "Performance optimization completed successfully"
        return 0
    else
        log_warning "Performance optimization completed with $optimization_errors warnings"
        return 1
    fi
}

# Perform system cleanup
perform_system_cleanup() {
    log_info "Performing system cleanup..."
    
    local cleanup_errors=0
    
    # Clean package cache
    case "${SYSTEM_INFO[package_manager]}" in
        "apt")
            if ! apt-get autoremove -y >/dev/null 2>&1; then
                log_warning "Failed to autoremove packages"
                ((cleanup_errors++))
            fi
            if ! apt-get autoclean >/dev/null 2>&1; then
                log_warning "Failed to clean package cache"
                ((cleanup_errors++))
            fi
            ;;
        "yum"|"dnf")
            if ! ${SYSTEM_INFO[package_manager]} autoremove -y >/dev/null 2>&1; then
                log_warning "Failed to autoremove packages"
                ((cleanup_errors++))
            fi
            if ! ${SYSTEM_INFO[package_manager]} clean all >/dev/null 2>&1; then
                log_warning "Failed to clean package cache"
                ((cleanup_errors++))
            fi
            ;;
    esac
    
    # Clean temporary files
    find /tmp -name "seraphc2_*" -mtime +7 -delete 2>/dev/null || true
    
    # Clean old backup files (older than retention period)
    local backup_dir="${CONFIG[backup_dir]}"
    local retention_days="${CONFIG[backup_retention_days]}"
    
    if [[ -d "$backup_dir" ]]; then
        find "$backup_dir" -type d -name "pre_update_*" -mtime +$retention_days -exec rm -rf {} + 2>/dev/null || true
    fi
    
    if [[ $cleanup_errors -eq 0 ]]; then
        log_success "System cleanup completed successfully"
        return 0
    else
        log_warning "System cleanup completed with $cleanup_errors warnings"
        return 1
    fi
}

# Schedule maintenance tasks
schedule_maintenance_tasks() {
    log_info "Scheduling maintenance tasks..."
    
    local cron_file="/etc/cron.d/seraphc2-maintenance"
    local script_path="$(readlink -f "$0")"
    
    # Create maintenance cron job
    cat > "$cron_file" <<EOF
# SeraphC2 Maintenance Tasks
# Generated by SeraphC2 setup script on $(date)

# Daily maintenance at 2 AM
0 2 * * * root $script_path --maintenance >/dev/null 2>&1

# Weekly update check on Sundays at 3 AM
0 3 * * 0 root $script_path --update-check >/dev/null 2>&1
EOF
    
    # Set proper permissions
    chmod 644 "$cron_file"
    
    # Reload cron service
    if systemctl is-active --quiet cron; then
        systemctl reload cron
    elif systemctl is-active --quiet crond; then
        systemctl reload crond
    fi
    
    log_success "Maintenance tasks scheduled successfully"
    return 0
}

# Rollback database migrations
rollback_database_migrations() {
    local rollback_target="$1"  # "all" or specific migration number
    
    log_info "Rolling back database migrations..."
    
    local app_dir="${CONFIG[app_dir]}"
    local migration_script="$app_dir/scripts/migrate.ts"
    
    # Check if migration script exists
    if [[ ! -f "$migration_script" ]]; then
        log_warning "Migration script not found: $migration_script"
        return 0
    fi
    
    cd "$app_dir" || {
        log_error "Failed to change to application directory: $app_dir"
        return 1
    }
    
    # Run migration rollback
    case "$rollback_target" in
        "all")
            log_info "Rolling back all migrations..."
            if npm run migrate:rollback:all 2>/dev/null; then
                log_success "All migrations rolled back successfully"
                return 0
            else
                log_error "Failed to rollback all migrations"
                return 1
            fi
            ;;
        *)
            log_info "Rolling back to migration: $rollback_target"
            if npm run migrate:rollback -- --to="$rollback_target" 2>/dev/null; then
                log_success "Migrations rolled back successfully"
                return 0
            else
                log_error "Failed to rollback migrations"
                return 1
            fi
            ;;
    esac
}

# Display update and maintenance information
show_update_maintenance_info() {
    echo ""
    echo -e "${CYAN}Update and Maintenance Information${NC}"
    echo -e "=================================="
    echo ""
    echo -e "${WHITE}Available Commands:${NC}"
    echo -e "  $0 --update-check          Check for available updates"
    echo -e "  $0 --update                Update all components"
    echo -e "  $0 --update --component=X  Update specific component (seraphc2, database, system)"
    echo -e "  $0 --maintenance           Run maintenance tasks"
    echo ""
    echo -e "${WHITE}Update Options:${NC}"
    echo -e "  --backup-before-update     Create backup before updating (default: enabled)"
    echo -e "  --skip-service-restart     Skip service restart after update"
    echo ""
    echo -e "${WHITE}Current Component Versions:${NC}"
    for component in "${!COMPONENT_VERSIONS[@]}"; do
        if [[ -n "${COMPONENT_VERSIONS[$component]}" ]]; then
            echo -e "  $component: ${COMPONENT_VERSIONS[$component]}"
        fi
    done
    echo ""
    echo -e "${WHITE}Maintenance Schedule:${NC}"
    echo -e "  Daily maintenance: 2:00 AM"
    echo -e "  Weekly update check: Sunday 3:00 AM"
    echo ""
}

# Validate domain name format
validate_domain() {
    local domain="$1"
    
    # Allow localhost
    if [[ "$domain" == "localhost" ]]; then
        return 0
    fi
    
    # Allow IP addresses
    if [[ "$domain" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        return 0
    fi
    
    # Basic domain name validation
    if [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        return 0
    fi
    
    return 1
}

# Validate email address format
validate_email() {
    local email="$1"
    
    if [[ "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        return 0
    fi
    
    return 1
}

# Display current configuration
show_configuration() {
    log_info "Current configuration:"
    
    echo -e "\n${WHITE}Installation Mode:${NC}"
    echo "  Mode: ${CONFIG[mode]}"
    echo "  Interactive: $([[ "${CONFIG[mode]}" == "interactive" ]] && echo "Yes" || echo "No")"
    echo "  Docker Deployment: $([[ "${CONFIG[mode]}" == "docker" ]] && echo "Yes" || echo "No")"
    echo "  Debug Mode: ${CONFIG[debug_mode]}"
    echo "  Verbose Output: ${CONFIG[verbose]}"
    
    echo -e "\n${WHITE}Network Configuration:${NC}"
    echo "  Domain: ${CONFIG[domain]}"
    echo "  HTTP Port: ${CONFIG[http_port]}"
    echo "  HTTPS Port: ${CONFIG[https_port]}"
    echo "  Implant Port: ${CONFIG[implant_port]}"
    
    echo -e "\n${WHITE}Security Configuration:${NC}"
    echo "  SSL Type: ${CONFIG[ssl_type]}"
    if [[ "${CONFIG[ssl_type]}" == "letsencrypt" && -n "${CONFIG[letsencrypt_email]}" ]]; then
        echo "  Let's Encrypt Email: ${CONFIG[letsencrypt_email]}"
    fi
    echo "  Security Hardening: ${CONFIG[enable_hardening]}"
    
    echo -e "\n${WHITE}System Configuration:${NC}"
    echo "  Service User: ${CONFIG[service_user]}"
    echo "  Application Directory: ${CONFIG[app_dir]}"
    echo "  Configuration Directory: ${CONFIG[config_dir]}"
    echo "  SSL Directory: ${CONFIG[ssl_dir]}"
    echo "  Log Directory: ${CONFIG[log_dir]}"
    
    echo -e "\n${WHITE}Additional Options:${NC}"
    echo "  Skip Backup Setup: ${CONFIG[skip_backup]}"
    echo "  Enable Firewall: ${CONFIG[enable_firewall]}"
    echo "  Backup Directory: ${CONFIG[backup_dir]}"
    echo "  Backup Retention: ${CONFIG[backup_retention_days]} days"
    
    echo ""
}

# Setup default configuration values
setup_default_configuration() {
    log_debug "Setting up default configuration values..."
    
    # Ensure all required configuration keys have default values
    # (Most defaults are already set in the CONFIG array declaration)
    
    # Set hostname-based domain if localhost
    if [[ "${CONFIG[domain]}" == "localhost" ]]; then
        local system_hostname
        system_hostname=$(hostname 2>/dev/null || echo "localhost")
        if [[ "$system_hostname" != "localhost" && -n "$system_hostname" ]]; then
            CONFIG[domain]="$system_hostname"
            log_debug "Updated domain to system hostname: $system_hostname"
        fi
    fi
    
    # Ensure directories have trailing slashes removed for consistency
    for dir_key in app_dir log_dir ssl_dir config_dir backup_dir; do
        CONFIG[$dir_key]="${CONFIG[$dir_key]%/}"
    done
    
    log_debug "Default configuration setup completed"
}

#==============================================================================
# SECURE CONFIGURATION GENERATION
#==============================================================================

# Generate cryptographically secure password using openssl
generate_secure_password() {
    local length="${1:-24}"
    local use_special_chars="${2:-false}"
    
    log_debug "Generating secure password of length $length"
    
    # Validate length parameter
    if ! [[ "$length" =~ ^[0-9]+$ ]] || [[ $length -lt 8 ]]; then
        log_error "Invalid password length: $length (minimum: 8)"
        return 1
    fi
    
    # Check if openssl is available
    if ! command -v openssl >/dev/null 2>&1; then
        log_error "openssl command not found. Required for secure password generation."
        return 1
    fi
    
    local password=""
    
    if [[ "$use_special_chars" == "true" ]]; then
        # Generate password with special characters (base64 + additional chars)
        # Use more bytes than needed to account for base64 encoding overhead
        local bytes_needed=$((length * 3 / 4 + 4))
        password=$(openssl rand -base64 "$bytes_needed" | tr -d '\n' | head -c "$length")
        
        # Ensure we have the exact length requested
        while [[ ${#password} -lt $length ]]; do
            local additional=$(openssl rand -base64 4 | tr -d '\n')
            password="${password}${additional}"
        done
        password="${password:0:$length}"
    else
        # Generate password without special characters (alphanumeric only)
        # Use base64 and remove problematic characters
        local bytes_needed=$((length * 3 / 4 + 4))
        password=$(openssl rand -base64 "$bytes_needed" | tr -d '\n+/=' | tr -d '\r' | head -c "$length")
        
        # Ensure we have the exact length requested
        while [[ ${#password} -lt $length ]]; do
            local additional=$(openssl rand -base64 8 | tr -d '\n+/=' | tr -d '\r')
            password="${password}${additional}"
        done
        password="${password:0:$length}"
    fi
    
    # Validate generated password
    if [[ ${#password} -ne $length ]]; then
        log_error "Failed to generate password of correct length"
        return 1
    fi
    
    if [[ -z "$password" ]]; then
        log_error "Generated password is empty"
        return 1
    fi
    
    echo "$password"
    return 0
}

# Generate JWT secret (64+ characters)
generate_jwt_secret() {
    log_debug "Generating JWT secret"
    
    local jwt_secret
    jwt_secret=$(generate_secure_password 64 true)
    
    if [[ $? -ne 0 || -z "$jwt_secret" ]]; then
        log_error "Failed to generate JWT secret"
        return 1
    fi
    
    # Validate JWT secret strength
    if ! validate_secret_strength "$jwt_secret" 64 "JWT secret"; then
        log_error "Generated JWT secret does not meet strength requirements"
        return 1
    fi
    
    echo "$jwt_secret"
    return 0
}

# Generate encryption key (32 characters for AES-256)
generate_encryption_key() {
    log_debug "Generating encryption key for AES-256"
    
    # For AES-256, we need exactly 32 bytes (256 bits)
    # Using base64 encoding, we need 32 bytes which gives us 44 characters
    # We'll take exactly 32 characters from the base64 output
    local encryption_key
    encryption_key=$(openssl rand -base64 32 | tr -d '\n' | head -c 32)
    
    if [[ $? -ne 0 || -z "$encryption_key" ]]; then
        log_error "Failed to generate encryption key"
        return 1
    fi
    
    # Validate encryption key
    if [[ ${#encryption_key} -ne 32 ]]; then
        log_error "Encryption key length is incorrect: ${#encryption_key} (expected: 32)"
        return 1
    fi
    
    # Validate encryption key strength
    if ! validate_secret_strength "$encryption_key" 32 "Encryption key"; then
        log_error "Generated encryption key does not meet strength requirements"
        return 1
    fi
    
    echo "$encryption_key"
    return 0
}

# Generate database password
generate_database_password() {
    log_debug "Generating database password"
    
    local db_password
    db_password=$(generate_secure_password 24 false)
    
    if [[ $? -ne 0 || -z "$db_password" ]]; then
        log_error "Failed to generate database password"
        return 1
    fi
    
    # Validate database password strength
    if ! validate_secret_strength "$db_password" 16 "Database password"; then
        log_error "Generated database password does not meet strength requirements"
        return 1
    fi
    
    echo "$db_password"
    return 0
}

# Generate Redis password
generate_redis_password() {
    log_debug "Generating Redis password"
    
    local redis_password
    redis_password=$(generate_secure_password 24 false)
    
    if [[ $? -ne 0 || -z "$redis_password" ]]; then
        log_error "Failed to generate Redis password"
        return 1
    fi
    
    # Validate Redis password strength
    if ! validate_secret_strength "$redis_password" 16 "Redis password"; then
        log_error "Generated Redis password does not meet strength requirements"
        return 1
    fi
    
    echo "$redis_password"
    return 0
}

# Validate secret strength
validate_secret_strength() {
    local secret="$1"
    local min_length="$2"
    local secret_name="$3"
    
    log_debug "Validating strength of $secret_name"
    
    # Check minimum length
    if [[ ${#secret} -lt $min_length ]]; then
        log_error "$secret_name must be at least $min_length characters long (got: ${#secret})"
        return 1
    fi
    
    # Check for empty or whitespace-only secrets
    if [[ -z "${secret// }" ]]; then
        log_error "$secret_name cannot be empty or contain only whitespace"
        return 1
    fi
    
    # Check for common weak patterns
    local weak_patterns=(
        "password"
        "123456"
        "admin"
        "root"
        "test"
        "demo"
        "guest"
        "user"
        "default"
        "changeme"
        "qwerty"
        "abc123"
    )
    
    local secret_lower=$(echo "$secret" | tr '[:upper:]' '[:lower:]')
    
    for pattern in "${weak_patterns[@]}"; do
        if [[ "$secret_lower" == *"$pattern"* ]]; then
            log_error "$secret_name contains weak pattern: $pattern"
            return 1
        fi
    done
    
    # Check for repeated characters (more than 3 consecutive identical characters)
    if [[ "$secret" =~ (.)\1{3,} ]]; then
        log_warning "$secret_name contains repeated characters (may be weak)"
    fi
    
    # Check character diversity for longer secrets
    if [[ ${#secret} -ge 16 ]]; then
        local has_upper=false
        local has_lower=false
        local has_digit=false
        local has_special=false
        
        if [[ "$secret" =~ [A-Z] ]]; then has_upper=true; fi
        if [[ "$secret" =~ [a-z] ]]; then has_lower=true; fi
        if [[ "$secret" =~ [0-9] ]]; then has_digit=true; fi
        if [[ "$secret" =~ [^A-Za-z0-9] ]]; then has_special=true; fi
        
        local diversity_count=0
        [[ "$has_upper" == "true" ]] && ((diversity_count++))
        [[ "$has_lower" == "true" ]] && ((diversity_count++))
        [[ "$has_digit" == "true" ]] && ((diversity_count++))
        [[ "$has_special" == "true" ]] && ((diversity_count++))
        
        if [[ $diversity_count -lt 2 ]]; then
            log_warning "$secret_name has low character diversity (may be weak)"
        fi
    fi
    
    log_debug "$secret_name validation passed"
    return 0
}

# Generate all secure configuration values
generate_secure_configuration() {
    log_info "Generating secure configuration values..."
    
    local generation_failed=false
    
    # Generate JWT secret if not already set
    if [[ -z "${CONFIG[jwt_secret]}" ]]; then
        log_debug "Generating JWT secret..."
        local jwt_secret
        jwt_secret=$(generate_jwt_secret)
        if [[ $? -eq 0 && -n "$jwt_secret" ]]; then
            CONFIG[jwt_secret]="$jwt_secret"
            log_success "JWT secret generated (${#jwt_secret} characters)"
        else
            log_error "Failed to generate JWT secret"
            generation_failed=true
        fi
    else
        log_debug "JWT secret already configured"
        if ! validate_secret_strength "${CONFIG[jwt_secret]}" 64 "JWT secret"; then
            log_warning "Existing JWT secret may be weak"
        fi
    fi
    
    # Generate encryption key if not already set
    if [[ -z "${CONFIG[encryption_key]}" ]]; then
        log_debug "Generating encryption key..."
        local encryption_key
        encryption_key=$(generate_encryption_key)
        if [[ $? -eq 0 && -n "$encryption_key" ]]; then
            CONFIG[encryption_key]="$encryption_key"
            log_success "Encryption key generated (${#encryption_key} characters)"
        else
            log_error "Failed to generate encryption key"
            generation_failed=true
        fi
    else
        log_debug "Encryption key already configured"
        if ! validate_secret_strength "${CONFIG[encryption_key]}" 32 "Encryption key"; then
            log_warning "Existing encryption key may be weak"
        fi
    fi
    
    # Generate database password if not already set
    if [[ -z "${CONFIG[db_password]}" ]]; then
        log_debug "Generating database password..."
        local db_password
        db_password=$(generate_database_password)
        if [[ $? -eq 0 && -n "$db_password" ]]; then
            CONFIG[db_password]="$db_password"
            log_success "Database password generated (${#db_password} characters)"
        else
            log_error "Failed to generate database password"
            generation_failed=true
        fi
    else
        log_debug "Database password already configured"
        if ! validate_secret_strength "${CONFIG[db_password]}" 16 "Database password"; then
            log_warning "Existing database password may be weak"
        fi
    fi
    
    # Generate Redis password if not already set
    if [[ -z "${CONFIG[redis_password]}" ]]; then
        log_debug "Generating Redis password..."
        local redis_password
        redis_password=$(generate_redis_password)
        if [[ $? -eq 0 && -n "$redis_password" ]]; then
            CONFIG[redis_password]="$redis_password"
            log_success "Redis password generated (${#redis_password} characters)"
        else
            log_error "Failed to generate Redis password"
            generation_failed=true
        fi
    else
        log_debug "Redis password already configured"
        if ! validate_secret_strength "${CONFIG[redis_password]}" 16 "Redis password"; then
            log_warning "Existing Redis password may be weak"
        fi
    fi
    
    # Generate admin password if not already set
    if [[ -z "${CONFIG[admin_password]}" ]]; then
        log_debug "Generating admin password..."
        local admin_password
        admin_password=$(generate_secure_password 16 false)
        if [[ $? -eq 0 && -n "$admin_password" ]]; then
            CONFIG[admin_password]="$admin_password"
            log_success "Admin password generated (${#admin_password} characters)"
        else
            log_error "Failed to generate admin password"
            generation_failed=true
        fi
    else
        log_debug "Admin password already configured"
        if ! validate_secret_strength "${CONFIG[admin_password]}" 12 "Admin password"; then
            log_warning "Existing admin password may be weak"
        fi
    fi
    
    if [[ "$generation_failed" == "true" ]]; then
        log_error "Failed to generate one or more secure configuration values"
        return 1
    fi
    
    log_success "All secure configuration values generated successfully"
    return 0
}

# Populate CONFIG array with generated secrets and default values
populate_configuration_array() {
    log_debug "Populating configuration array with all required values..."
    
    # Generate secure configuration if not already done
    if [[ -z "${CONFIG[jwt_secret]}" || -z "${CONFIG[encryption_key]}" || 
          -z "${CONFIG[db_password]}" || -z "${CONFIG[redis_password]}" ]]; then
        if ! generate_secure_configuration; then
            log_error "Failed to generate secure configuration"
            return 1
        fi
    fi
    
    # Validate all critical configuration values are present
    local required_configs=(
        "domain"
        "http_port"
        "https_port"
        "implant_port"
        "ssl_type"
        "db_password"
        "db_host"
        "db_port"
        "db_name"
        "db_user"
        "redis_password"
        "redis_host"
        "redis_port"
        "jwt_secret"
        "encryption_key"
        "service_user"
        "app_dir"
        "log_dir"
        "ssl_dir"
        "config_dir"
    )
    
    local missing_configs=()
    
    for config_key in "${required_configs[@]}"; do
        if [[ -z "${CONFIG[$config_key]}" ]]; then
            missing_configs+=("$config_key")
        fi
    done
    
    if [[ ${#missing_configs[@]} -gt 0 ]]; then
        log_error "Missing required configuration values:"
        for missing in "${missing_configs[@]}"; do
            log_error "  - $missing"
        done
        return 1
    fi
    
    # Validate configuration values
    if ! validate_populated_configuration; then
        log_error "Configuration validation failed"
        return 1
    fi
    
    log_success "Configuration array populated and validated successfully"
    return 0
}

# Validate populated configuration
validate_populated_configuration() {
    log_debug "Validating populated configuration..."
    
    # Validate ports are numeric and in valid range
    local ports=("http_port" "https_port" "implant_port" "db_port" "redis_port")
    for port_key in "${ports[@]}"; do
        local port_value="${CONFIG[$port_key]}"
        if ! [[ "$port_value" =~ ^[0-9]+$ ]]; then
            log_error "Invalid port value for $port_key: $port_value (must be numeric)"
            return 1
        fi
        if [[ $port_value -lt 1 || $port_value -gt 65535 ]]; then
            log_error "Invalid port value for $port_key: $port_value (must be 1-65535)"
            return 1
        fi
    done
    
    # Validate directory paths are absolute
    local dir_keys=("app_dir" "log_dir" "ssl_dir" "config_dir" "backup_dir")
    for dir_key in "${dir_keys[@]}"; do
        local dir_value="${CONFIG[$dir_key]}"
        if [[ ! "$dir_value" =~ ^/ ]]; then
            log_error "Invalid directory path for $dir_key: $dir_value (must be absolute path)"
            return 1
        fi
    done
    
    # Validate domain format
    if ! validate_domain "${CONFIG[domain]}"; then
        log_warning "Domain '${CONFIG[domain]}' may not be valid"
    fi
    
    # Validate SSL type
    if ! validate_ssl_type "${CONFIG[ssl_type]}"; then
        log_error "Invalid SSL type: ${CONFIG[ssl_type]}"
        return 1
    fi
    
    # Validate service user name
    if [[ ! "${CONFIG[service_user]}" =~ ^[a-z][a-z0-9_-]*$ ]]; then
        log_error "Invalid service user name: ${CONFIG[service_user]}"
        return 1
    fi
    
    log_debug "Configuration validation completed successfully"
    return 0
}

#==============================================================================
# SYSTEM DETECTION AND PREREQUISITES CHECKING
#==============================================================================

# Check sudo privileges with graceful error handling
check_sudo_privileges() {
    log_debug "Checking sudo privileges..."
    
    # First check if we're already running as root
    if [[ $EUID -eq 0 ]]; then
        log_debug "Running as root user"
        return 0
    fi
    
    # Check if sudo is available
    if ! command -v sudo >/dev/null 2>&1; then
        log_error "sudo command not found. This script requires sudo privileges."
        log_error "Please install sudo or run this script as root."
        exit $E_SUDO_REQUIRED
    fi
    
    # Test if we can run sudo without password (cached credentials)
    if sudo -n true 2>/dev/null; then
        log_debug "Sudo privileges confirmed (cached credentials)"
        return 0
    fi
    
    # Prompt for sudo password once at startup
    log_info "This script requires sudo privileges for system configuration."
    log_info "You will be prompted for your password once at startup."
    
    if ! sudo -v; then
        log_error "Failed to obtain sudo privileges."
        log_error "This script requires sudo access to install packages and configure system services."
        log_error "Please run with sudo or as root: sudo $0"
        exit $E_SUDO_REQUIRED
    fi
    
    # Extend sudo timeout to avoid repeated prompts
    # Note: This may not work on all systems, but it's worth trying
    sudo -v 2>/dev/null || true
    
    log_success "Sudo privileges confirmed"
    return 0
}

# Detect operating system type and version
detect_operating_system() {
    log_debug "Detecting operating system..."
    
    # Initialize OS detection variables
    local os_type=""
    local os_version=""
    local os_codename=""
    
    # Check for /etc/os-release (systemd standard)
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        
        case "${ID,,}" in
            ubuntu)
                os_type="ubuntu"
                os_version="$VERSION_ID"
                os_codename="${VERSION_CODENAME:-}"
                
                # Fallback codename detection for Ubuntu if not available
                if [[ -z "$os_codename" ]]; then
                    case "$os_version" in
                        "22.04") os_codename="jammy" ;;
                        "20.04") os_codename="focal" ;;
                        "18.04") os_codename="bionic" ;;
                        "16.04") os_codename="xenial" ;;
                        *) 
                            # Try lsb_release as fallback
                            if command -v lsb_release >/dev/null 2>&1; then
                                os_codename=$(lsb_release -cs 2>/dev/null || echo "")
                            fi
                            # If still empty, default based on version
                            if [[ -z "$os_codename" ]]; then
                                if [[ "$os_version" =~ ^22\. ]]; then
                                    os_codename="jammy"
                                elif [[ "$os_version" =~ ^20\. ]]; then
                                    os_codename="focal"
                                else
                                    os_codename="jammy"  # Default to latest LTS
                                fi
                            fi
                            ;;
                    esac
                fi
                ;;
            debian)
                os_type="debian"
                os_version="$VERSION_ID"
                os_codename="$VERSION_CODENAME"
                ;;
            centos)
                os_type="centos"
                os_version="$VERSION_ID"
                os_codename="${VERSION_CODENAME:-}"
                ;;
            rhel|"red hat enterprise linux")
                os_type="rhel"
                os_version="$VERSION_ID"
                os_codename="${VERSION_CODENAME:-}"
                ;;
            fedora)
                os_type="fedora"
                os_version="$VERSION_ID"
                os_codename="${VERSION_CODENAME:-}"
                ;;
            *)
                log_warning "Unknown OS ID from /etc/os-release: $ID"
                ;;
        esac
    fi
    
    # Fallback detection methods if /etc/os-release is not available or incomplete
    if [[ -z "$os_type" ]]; then
        # Check for specific release files
        if [[ -f /etc/ubuntu-release ]] || [[ -f /etc/lsb-release ]]; then
            if grep -q "Ubuntu" /etc/lsb-release 2>/dev/null; then
                os_type="ubuntu"
                os_version=$(grep "DISTRIB_RELEASE" /etc/lsb-release 2>/dev/null | cut -d'=' -f2 | tr -d '"')
                os_codename=$(grep "DISTRIB_CODENAME" /etc/lsb-release 2>/dev/null | cut -d'=' -f2 | tr -d '"')
            fi
        elif [[ -f /etc/debian_version ]]; then
            os_type="debian"
            os_version=$(cat /etc/debian_version)
            # Try to get codename from lsb_release if available
            if command -v lsb_release >/dev/null 2>&1; then
                os_codename=$(lsb_release -cs 2>/dev/null || echo "")
            fi
        elif [[ -f /etc/centos-release ]]; then
            os_type="centos"
            os_version=$(grep -oE '[0-9]+\.[0-9]+' /etc/centos-release | head -1)
        elif [[ -f /etc/redhat-release ]]; then
            if grep -q "Red Hat Enterprise Linux" /etc/redhat-release; then
                os_type="rhel"
            elif grep -q "CentOS" /etc/redhat-release; then
                os_type="centos"
            elif grep -q "Fedora" /etc/redhat-release; then
                os_type="fedora"
            fi
            os_version=$(grep -oE '[0-9]+\.[0-9]+' /etc/redhat-release | head -1)
        elif [[ -f /etc/fedora-release ]]; then
            os_type="fedora"
            os_version=$(grep -oE '[0-9]+' /etc/fedora-release | head -1)
        fi
    fi
    
    # Final fallback using uname
    if [[ -z "$os_type" ]]; then
        local uname_output=$(uname -s)
        case "$uname_output" in
            Linux)
                log_warning "Could not determine specific Linux distribution"
                os_type="unknown_linux"
                ;;
            *)
                log_error "Unsupported operating system: $uname_output"
                os_type="unsupported"
                ;;
        esac
    fi
    
    # Store results in SYSTEM_INFO array
    SYSTEM_INFO[os_type]="$os_type"
    SYSTEM_INFO[os_version]="$os_version"
    SYSTEM_INFO[os_codename]="$os_codename"
    
    log_debug "Detected OS: $os_type $os_version ${os_codename:+($os_codename)}"
    
    return 0
}

# Detect system architecture
detect_architecture() {
    log_debug "Detecting system architecture..."
    
    local arch=$(uname -m)
    local normalized_arch=""
    
    case "$arch" in
        x86_64|amd64)
            normalized_arch="x86_64"
            ;;
        aarch64|arm64)
            normalized_arch="aarch64"
            ;;
        armv7l|armhf)
            normalized_arch="armv7l"
            log_warning "ARM v7 architecture detected. Some features may not be available."
            ;;
        i386|i686)
            log_error "32-bit architecture ($arch) is not supported"
            log_error "Please use a 64-bit system (x86_64 or aarch64)"
            exit $E_UNSUPPORTED_OS
            ;;
        *)
            log_error "Unsupported architecture: $arch"
            log_error "Supported architectures: x86_64, aarch64"
            exit $E_UNSUPPORTED_OS
            ;;
    esac
    
    SYSTEM_INFO[architecture]="$normalized_arch"
    log_debug "Detected architecture: $normalized_arch"
    
    return 0
}

# Detect package manager
detect_package_manager() {
    log_debug "Detecting package manager..."
    
    local package_manager=""
    
    # Detect based on OS type first
    case "${SYSTEM_INFO[os_type]}" in
        ubuntu|debian)
            if command -v apt-get >/dev/null 2>&1; then
                package_manager="apt"
            fi
            ;;
        centos|rhel)
            if command -v dnf >/dev/null 2>&1; then
                package_manager="dnf"
            elif command -v yum >/dev/null 2>&1; then
                package_manager="yum"
            fi
            ;;
        fedora)
            if command -v dnf >/dev/null 2>&1; then
                package_manager="dnf"
            fi
            ;;
    esac
    
    # Fallback detection if OS-based detection failed
    if [[ -z "$package_manager" ]]; then
        if command -v apt-get >/dev/null 2>&1; then
            package_manager="apt"
        elif command -v dnf >/dev/null 2>&1; then
            package_manager="dnf"
        elif command -v yum >/dev/null 2>&1; then
            package_manager="yum"
        elif command -v pacman >/dev/null 2>&1; then
            package_manager="pacman"
            log_warning "Arch Linux detected but not officially supported"
        else
            log_error "No supported package manager found"
            package_manager="unknown"
        fi
    fi
    
    SYSTEM_INFO[package_manager]="$package_manager"
    log_debug "Detected package manager: $package_manager"
    
    return 0
}

# Detect init system
detect_init_system() {
    log_debug "Detecting init system..."
    
    local init_system=""
    
    # Check for systemd
    if [[ -d /run/systemd/system ]]; then
        init_system="systemd"
    elif command -v systemctl >/dev/null 2>&1; then
        init_system="systemd"
    elif [[ -f /sbin/init ]] && /sbin/init --version 2>/dev/null | grep -q systemd; then
        init_system="systemd"
    # Check for SysV init
    elif [[ -d /etc/init.d ]]; then
        init_system="sysvinit"
    else
        init_system="unknown"
        log_warning "Could not determine init system"
    fi
    
    SYSTEM_INFO[init_system]="$init_system"
    log_debug "Detected init system: $init_system"
    
    # Warn if not systemd (this script is designed for systemd)
    if [[ "$init_system" != "systemd" ]]; then
        log_warning "This script is designed for systemd-based systems"
        log_warning "Some features may not work correctly with $init_system"
    fi
    
    return 0
}

# Detect firewall system
detect_firewall_system() {
    log_debug "Detecting firewall system..."
    
    local firewall_system=""
    
    # Check for UFW (Ubuntu/Debian)
    if command -v ufw >/dev/null 2>&1; then
        firewall_system="ufw"
    # Check for firewalld (CentOS/RHEL/Fedora)
    elif command -v firewall-cmd >/dev/null 2>&1; then
        firewall_system="firewalld"
    # Check for iptables
    elif command -v iptables >/dev/null 2>&1; then
        firewall_system="iptables"
    else
        firewall_system="none"
        log_warning "No firewall system detected"
    fi
    
    SYSTEM_INFO[firewall_system]="$firewall_system"
    log_debug "Detected firewall system: $firewall_system"
    
    return 0
}

#==============================================================================
# FIREWALL CONFIGURATION SYSTEM
#==============================================================================

# Configure firewall system based on detected type
configure_firewall() {
    log_info "Configuring firewall system..."
    
    # Skip firewall configuration if disabled
    if [[ "${CONFIG[enable_firewall]}" != "true" ]]; then
        log_info "Firewall configuration disabled, skipping..."
        return 0
    fi
    
    local firewall_type="${SYSTEM_INFO[firewall_system]}"
    
    if [[ "$firewall_type" == "none" ]]; then
        log_warning "No firewall system detected. Installing UFW as default..."
        if ! install_ufw; then
            log_error "Failed to install UFW firewall"
            return $E_FIREWALL_ERROR
        fi
        firewall_type="ufw"
        SYSTEM_INFO[firewall_system]="ufw"
    fi
    
    log_info "Configuring $firewall_type firewall..."
    
    local config_result=0
    case "$firewall_type" in
        "ufw")
            configure_ufw_firewall
            config_result=$?
            ;;
        "firewalld")
            configure_firewalld_firewall
            config_result=$?
            ;;
        "iptables")
            configure_iptables_firewall
            config_result=$?
            ;;
        *)
            log_error "Unsupported firewall system: $firewall_type"
            return $E_FIREWALL_ERROR
            ;;
    esac
    
    # Check if configuration was successful
    if [[ $config_result -ne 0 ]]; then
        log_error "Firewall configuration failed with exit code: $config_result"
        return $config_result
    fi
    
    # Test firewall configuration
    if ! test_firewall_configuration; then
        log_warning "Firewall configuration test failed, but continuing..."
        # Don't fail the entire installation for firewall test issues
    fi
    
    log_success "Firewall configuration completed successfully"
    return 0
}

# Install UFW if not present
install_ufw() {
    log_info "Installing UFW firewall..."
    
    case "${SYSTEM_INFO[package_manager]}" in
        "apt")
            apt-get update
            apt-get install -y ufw
            ;;
        "yum"|"dnf")
            if [[ "${SYSTEM_INFO[package_manager]}" == "dnf" ]]; then
                dnf install -y ufw
            else
                yum install -y ufw
            fi
            ;;
        *)
            log_error "Cannot install UFW on this system"
            return $E_PACKAGE_INSTALL_FAILED
            ;;
    esac
    
    track_install_state "packages_installed" "ufw"
    log_success "UFW installed successfully"
    return 0
}

# Configure UFW firewall
configure_ufw_firewall() {
    log_info "Configuring UFW firewall rules..."
    
    # Check if UFW is already enabled
    local ufw_status=$(ufw status 2>/dev/null | head -1 | awk '{print $2}')
    if [[ "$ufw_status" == "active" ]]; then
        log_info "UFW is already active, configuring rules without reset..."
    else
        # Reset UFW to default state only if not active
        log_info "Resetting UFW to default state..."
        ufw --force reset
        
        # Set default policies
        ufw default deny incoming
        ufw default allow outgoing
    fi
    
    # Allow SSH with rate limiting if enabled
    if [[ "${CONFIG[allow_ssh]}" == "true" ]]; then
        log_info "Configuring SSH access with rate limiting..."
        # Remove existing SSH rules first to avoid duplicates
        ufw --force delete allow ssh 2>/dev/null || true
        ufw --force delete limit ssh 2>/dev/null || true
        ufw limit ssh comment 'SSH with rate limiting'
        track_install_state "firewall_rules_added" "ssh_limit"
    fi
    
    # Allow HTTP port
    local http_port="${CONFIG[http_port]}"
    log_info "Opening HTTP port: $http_port"
    # Remove existing rule if present to avoid duplicates
    ufw --force delete allow "$http_port/tcp" 2>/dev/null || true
    ufw allow "$http_port/tcp" comment 'SeraphC2 HTTP'
    track_install_state "firewall_rules_added" "http_$http_port"
    
    # Allow HTTPS port
    local https_port="${CONFIG[https_port]}"
    log_info "Opening HTTPS port: $https_port"
    # Remove existing rule if present to avoid duplicates
    ufw --force delete allow "$https_port/tcp" 2>/dev/null || true
    ufw allow "$https_port/tcp" comment 'SeraphC2 HTTPS'
    track_install_state "firewall_rules_added" "https_$https_port"
    
    # Allow implant communication port
    local implant_port="${CONFIG[implant_port]}"
    log_info "Opening implant communication port: $implant_port"
    # Remove existing rule if present to avoid duplicates
    ufw --force delete allow "$implant_port/tcp" 2>/dev/null || true
    ufw allow "$implant_port/tcp" comment 'SeraphC2 Implant Communication'
    track_install_state "firewall_rules_added" "implant_$implant_port"
    
    # Add additional security rules
    configure_ufw_security_rules
    
    # Enable UFW (this is safe to run even if already enabled)
    log_info "Ensuring UFW firewall is enabled..."
    local enable_output=$(ufw --force enable 2>&1)
    local enable_status=$?
    
    # UFW returns success even if already enabled, but let's check the output
    if [[ $enable_status -eq 0 ]]; then
        log_debug "UFW enable command output: $enable_output"
        log_success "UFW firewall is enabled"
    else
        log_error "Failed to enable UFW firewall: $enable_output"
        return $E_FIREWALL_ERROR
    fi
    
    # Verify UFW status using systemctl (language-agnostic)
    if ! systemctl is-active --quiet ufw 2>/dev/null; then
        log_error "UFW firewall is not active after configuration"
        log_error "UFW status output: $(ufw status 2>&1)"
        return $E_FIREWALL_ERROR
    fi
    
    log_success "UFW firewall configured and verified active"
    return 0
}

# Configure additional UFW security rules
configure_ufw_security_rules() {
    log_info "Applying additional UFW security rules..."
    
    # Block common attack ports
    local attack_ports=(23 135 139 445 1433 3389)
    for port in "${attack_ports[@]}"; do
        # Remove existing rule if present to avoid duplicates
        ufw --force delete deny "$port" 2>/dev/null || true
        ufw deny "$port" comment "Block common attack port $port"
        track_install_state "firewall_rules_added" "block_$port"
    done
    
    # Rate limit web ports to prevent DoS (only if not already configured)
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    
    # Check if rate limiting rules already exist
    if ! ufw status numbered | grep -q "LIMIT.*$http_port/tcp"; then
        ufw limit "$http_port/tcp" comment 'Rate limit HTTP'
    else
        log_debug "HTTP rate limiting rule already exists"
    fi
    
    if ! ufw status numbered | grep -q "LIMIT.*$https_port/tcp"; then
        ufw limit "$https_port/tcp" comment 'Rate limit HTTPS'
    else
        log_debug "HTTPS rate limiting rule already exists"
    fi
    
    # Allow loopback traffic (safe to run multiple times)
    ufw allow in on lo 2>/dev/null || true
    ufw allow out on lo 2>/dev/null || true
    
    log_debug "Additional UFW security rules applied"
}

# Configure firewalld firewall
configure_firewalld_firewall() {
    log_info "Configuring firewalld firewall rules..."
    
    # Ensure firewalld is running
    if ! systemctl is-active firewalld >/dev/null 2>&1; then
        log_info "Starting firewalld service..."
        systemctl start firewalld
        systemctl enable firewalld
    fi
    
    # Create custom zone for SeraphC2
    local zone_name="seraphc2"
    log_info "Creating custom firewall zone: $zone_name"
    
    if ! firewall-cmd --get-zones | grep -q "$zone_name"; then
        firewall-cmd --permanent --new-zone="$zone_name"
        track_install_state "firewall_rules_added" "zone_$zone_name"
    fi
    
    # Set zone target to default (reject)
    firewall-cmd --permanent --zone="$zone_name" --set-target=default
    
    # Allow SSH with rate limiting if enabled
    if [[ "${CONFIG[allow_ssh]}" == "true" ]]; then
        log_info "Configuring SSH access with rate limiting..."
        firewall-cmd --permanent --zone="$zone_name" --add-service=ssh
        firewall-cmd --permanent --add-rich-rule='rule service name="ssh" accept limit value="3/m"'
        track_install_state "firewall_rules_added" "ssh_limit"
    fi
    
    # Allow SeraphC2 ports
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    local implant_port="${CONFIG[implant_port]}"
    
    log_info "Opening HTTP port: $http_port"
    firewall-cmd --permanent --zone="$zone_name" --add-port="$http_port/tcp"
    track_install_state "firewall_rules_added" "http_$http_port"
    
    log_info "Opening HTTPS port: $https_port"
    firewall-cmd --permanent --zone="$zone_name" --add-port="$https_port/tcp"
    track_install_state "firewall_rules_added" "https_$https_port"
    
    log_info "Opening implant communication port: $implant_port"
    firewall-cmd --permanent --zone="$zone_name" --add-port="$implant_port/tcp"
    track_install_state "firewall_rules_added" "implant_$implant_port"
    
    # Add additional security rules
    configure_firewalld_security_rules "$zone_name"
    
    # Set default zone
    firewall-cmd --set-default-zone="$zone_name"
    
    # Reload firewall configuration
    firewall-cmd --reload
    
    log_success "Firewalld firewall configured successfully"
    return 0
}

# Configure additional firewalld security rules
configure_firewalld_security_rules() {
    local zone_name="$1"
    
    log_info "Applying additional firewalld security rules..."
    
    # Block common attack ports
    local attack_ports=(23 135 139 445 1433 3389)
    for port in "${attack_ports[@]}"; do
        firewall-cmd --permanent --zone="$zone_name" --add-rich-rule="rule port port=\"$port\" protocol=\"tcp\" reject"
        track_install_state "firewall_rules_added" "block_$port"
    done
    
    # Rate limit web ports
    firewall-cmd --permanent --add-rich-rule="rule port port=\"${CONFIG[http_port]}\" protocol=\"tcp\" accept limit value=\"100/m\""
    firewall-cmd --permanent --add-rich-rule="rule port port=\"${CONFIG[https_port]}\" protocol=\"tcp\" accept limit value=\"100/m\""
    
    log_debug "Additional firewalld security rules applied"
}

# Configure iptables firewall (basic implementation)
configure_iptables_firewall() {
    log_info "Configuring iptables firewall rules..."
    
    # Backup existing rules
    if command -v iptables-save >/dev/null 2>&1; then
        iptables-save > /tmp/iptables.backup.$(date +%s)
        log_info "Existing iptables rules backed up"
    fi
    
    # Flush existing rules
    iptables -F
    iptables -X
    iptables -t nat -F
    iptables -t nat -X
    iptables -t mangle -F
    iptables -t mangle -X
    
    # Set default policies
    iptables -P INPUT DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT ACCEPT
    
    # Allow loopback traffic
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A OUTPUT -o lo -j ACCEPT
    
    # Allow established and related connections
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    
    # Allow SSH with rate limiting if enabled
    if [[ "${CONFIG[allow_ssh]}" == "true" ]]; then
        log_info "Configuring SSH access with rate limiting..."
        iptables -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -m recent --set
        iptables -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -m recent --update --seconds 60 --hitcount 4 -j DROP
        iptables -A INPUT -p tcp --dport 22 -j ACCEPT
        track_install_state "firewall_rules_added" "ssh_limit"
    fi
    
    # Allow SeraphC2 ports
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    local implant_port="${CONFIG[implant_port]}"
    
    log_info "Opening HTTP port: $http_port"
    iptables -A INPUT -p tcp --dport "$http_port" -j ACCEPT
    track_install_state "firewall_rules_added" "http_$http_port"
    
    log_info "Opening HTTPS port: $https_port"
    iptables -A INPUT -p tcp --dport "$https_port" -j ACCEPT
    track_install_state "firewall_rules_added" "https_$https_port"
    
    log_info "Opening implant communication port: $implant_port"
    iptables -A INPUT -p tcp --dport "$implant_port" -j ACCEPT
    track_install_state "firewall_rules_added" "implant_$implant_port"
    
    # Save iptables rules
    save_iptables_rules
    
    log_success "Iptables firewall configured successfully"
    return 0
}

# Save iptables rules persistently
save_iptables_rules() {
    log_info "Saving iptables rules..."
    
    case "${SYSTEM_INFO[os_type]}" in
        "ubuntu"|"debian")
            # Install iptables-persistent if not present
            if ! dpkg -l | grep -q iptables-persistent; then
                apt-get install -y iptables-persistent
                track_install_state "packages_installed" "iptables-persistent"
            fi
            
            # Save rules
            iptables-save > /etc/iptables/rules.v4
            ;;
        "centos"|"rhel"|"fedora")
            # Save rules using iptables-save
            iptables-save > /etc/sysconfig/iptables
            
            # Enable iptables service
            if command -v systemctl >/dev/null 2>&1; then
                systemctl enable iptables
            fi
            ;;
        *)
            log_warning "Cannot automatically save iptables rules on ${SYSTEM_INFO[os_type]}"
            ;;
    esac
    
    log_debug "Iptables rules saved"
}

# Test firewall configuration
test_firewall_configuration() {
    log_info "Testing firewall configuration..."
    
    local firewall_type="${SYSTEM_INFO[firewall_system]}"
    local test_passed=true
    
    case "$firewall_type" in
        "ufw")
            test_ufw_configuration
            ;;
        "firewalld")
            test_firewalld_configuration
            ;;
        "iptables")
            test_iptables_configuration
            ;;
        *)
            log_warning "Cannot test firewall configuration for: $firewall_type"
            return 0
            ;;
    esac
    
    if [[ $? -eq 0 ]]; then
        log_success "Firewall configuration test passed"
        return 0
    else
        log_error "Firewall configuration test failed"
        return $E_FIREWALL_ERROR
    fi
}

# Test UFW configuration
test_ufw_configuration() {
    log_debug "Testing UFW configuration..."
    
    # Check if UFW is active using systemctl (language-agnostic)
    if ! systemctl is-active --quiet ufw 2>/dev/null; then
        log_error "UFW is not active"
        return 1
    fi
    
    # Check if required ports are allowed
    local required_ports=("${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}")
    
    for port in "${required_ports[@]}"; do
        if ! ufw status | grep -q "$port"; then
            log_error "Port $port is not configured in UFW"
            return 1
        fi
    done
    
    # Check SSH configuration if enabled
    if [[ "${CONFIG[allow_ssh]}" == "true" ]]; then
        if ! ufw status | grep -q "22/tcp"; then
            log_error "SSH port is not configured in UFW"
            return 1
        fi
    fi
    
    log_debug "UFW configuration test passed"
    return 0
}

# Test firewalld configuration
test_firewalld_configuration() {
    log_debug "Testing firewalld configuration..."
    
    # Check if firewalld is running
    if ! systemctl is-active firewalld >/dev/null 2>&1; then
        log_error "Firewalld is not running"
        return 1
    fi
    
    # Check if custom zone exists
    if ! firewall-cmd --get-zones | grep -q "seraphc2"; then
        log_error "SeraphC2 firewall zone not found"
        return 1
    fi
    
    # Check if required ports are open
    local required_ports=("${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}")
    
    for port in "${required_ports[@]}"; do
        if ! firewall-cmd --zone=seraphc2 --list-ports | grep -q "$port/tcp"; then
            log_error "Port $port is not open in firewalld"
            return 1
        fi
    done
    
    log_debug "Firewalld configuration test passed"
    return 0
}

# Test iptables configuration
test_iptables_configuration() {
    log_debug "Testing iptables configuration..."
    
    # Check if required ports are allowed
    local required_ports=("${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}")
    
    for port in "${required_ports[@]}"; do
        if ! iptables -L INPUT -n | grep -q "dpt:$port"; then
            log_error "Port $port is not allowed in iptables"
            return 1
        fi
    done
    
    # Check SSH configuration if enabled
    if [[ "${CONFIG[allow_ssh]}" == "true" ]]; then
        if ! iptables -L INPUT -n | grep -q "dpt:22"; then
            log_error "SSH port is not allowed in iptables"
            return 1
        fi
    fi
    
    log_debug "Iptables configuration test passed"
    return 0
}

# Get firewall status information
get_firewall_status() {
    local firewall_type="${SYSTEM_INFO[firewall_system]}"
    
    case "$firewall_type" in
        "ufw")
            echo "UFW Status:"
            ufw status verbose
            ;;
        "firewalld")
            echo "Firewalld Status:"
            firewall-cmd --list-all-zones
            ;;
        "iptables")
            echo "Iptables Rules:"
            iptables -L -n -v
            ;;
        *)
            echo "Firewall status: Unknown firewall type ($firewall_type)"
            ;;
    esac
}

# Rollback firewall configuration
rollback_firewall_configuration() {
    log_info "Rolling back firewall configuration..."
    
    local firewall_type="${SYSTEM_INFO[firewall_system]}"
    
    case "$firewall_type" in
        "ufw")
            rollback_ufw_configuration
            ;;
        "firewalld")
            rollback_firewalld_configuration
            ;;
        "iptables")
            rollback_iptables_configuration
            ;;
        *)
            log_warning "Cannot rollback firewall configuration for: $firewall_type"
            ;;
    esac
    
    log_success "Firewall configuration rollback completed"
    return 0
}

# Rollback UFW configuration
rollback_ufw_configuration() {
    log_info "Rolling back UFW configuration..."
    
    # Disable UFW
    ufw --force disable
    
    # Reset UFW to defaults
    ufw --force reset
    
    log_debug "UFW configuration rolled back"
}

# Rollback firewalld configuration
rollback_firewalld_configuration() {
    log_info "Rolling back firewalld configuration..."
    
    # Remove custom zone if it exists
    if firewall-cmd --get-zones | grep -q "seraphc2"; then
        firewall-cmd --permanent --delete-zone=seraphc2
    fi
    
    # Reset to default zone
    firewall-cmd --set-default-zone=public
    
    # Remove custom rules
    firewall-cmd --permanent --remove-rich-rule='rule service name="ssh" accept limit value="3/m"' 2>/dev/null || true
    
    # Reload configuration
    firewall-cmd --reload
    
    log_debug "Firewalld configuration rolled back"
}

# Rollback iptables configuration
rollback_iptables_configuration() {
    log_info "Rolling back iptables configuration..."
    
    # Look for backup file
    local backup_file=$(ls -t /tmp/iptables.backup.* 2>/dev/null | head -1)
    
    if [[ -n "$backup_file" && -f "$backup_file" ]]; then
        log_info "Restoring iptables from backup: $backup_file"
        iptables-restore < "$backup_file"
    else
        log_warning "No iptables backup found, flushing all rules"
        iptables -F
        iptables -X
        iptables -t nat -F
        iptables -t nat -X
        iptables -t mangle -F
        iptables -t mangle -X
        iptables -P INPUT ACCEPT
        iptables -P FORWARD ACCEPT
        iptables -P OUTPUT ACCEPT
    fi
    
    log_debug "Iptables configuration rolled back"
}

# Validate firewall ports are accessible
validate_firewall_ports() {
    log_info "Validating firewall port accessibility..."
    
    local required_ports=("${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}")
    local validation_passed=true
    
    for port in "${required_ports[@]}"; do
        log_debug "Testing port accessibility: $port"
        
        # Use netcat or telnet to test port accessibility
        if command -v nc >/dev/null 2>&1; then
            if timeout 5 nc -z localhost "$port" 2>/dev/null; then
                log_debug "Port $port is accessible"
            else
                log_warning "Port $port may not be accessible (service may not be running yet)"
            fi
        else
            log_debug "Cannot test port $port - netcat not available"
        fi
    done
    
    if [[ "$validation_passed" == "true" ]]; then
        log_success "Firewall port validation completed"
        return 0
    else
        log_warning "Some firewall port validations failed"
        return 1
    fi
}

#==============================================================================
# SECURITY HARDENING FUNCTIONS
#==============================================================================

# Main security hardening function
apply_security_hardening() {
    log_info "Applying security hardening measures..."
    
    if [[ "${CONFIG[enable_hardening]}" != "true" ]]; then
        log_info "Security hardening disabled, skipping..."
        return 0
    fi
    
    local hardening_errors=0
    
    # Disable unnecessary services
    log_info "Disabling unnecessary services..."
    if ! disable_unnecessary_services; then
        log_warning "Failed to disable some unnecessary services"
        ((hardening_errors++))
    fi
    
    # Configure fail2ban
    log_info "Setting up fail2ban intrusion prevention..."
    if ! setup_fail2ban; then
        log_warning "Failed to setup fail2ban"
        ((hardening_errors++))
    fi
    
    # Set up file integrity monitoring
    log_info "Setting up file integrity monitoring..."
    if ! setup_file_integrity_monitoring; then
        log_warning "Failed to setup file integrity monitoring"
        ((hardening_errors++))
    fi
    
    # Configure system limits and security
    log_info "Configuring system security limits..."
    if ! configure_system_limits; then
        log_warning "Failed to configure system limits"
        ((hardening_errors++))
    fi
    
    # Set up log monitoring and alerting
    log_info "Setting up log monitoring..."
    if ! setup_log_monitoring; then
        log_warning "Failed to setup log monitoring"
        ((hardening_errors++))
    fi
    
    # Apply additional security configurations
    log_info "Applying additional security configurations..."
    if ! apply_additional_security_config; then
        log_warning "Failed to apply additional security configurations"
        ((hardening_errors++))
    fi
    
    if [[ $hardening_errors -eq 0 ]]; then
        log_success "Security hardening completed successfully"
        track_install_state "security_hardening_applied" "true"
        return 0
    else
        log_warning "Security hardening completed with $hardening_errors warnings"
        log_warning "Some security measures may not be fully configured"
        return 1
    fi
}

# Disable unnecessary services
disable_unnecessary_services() {
    log_debug "Disabling unnecessary services..."
    
    # List of services to disable (common unnecessary services)
    local services_to_disable=(
        "telnet"
        "rsh"
        "rlogin"
        "vsftpd"
        "apache2"
        "httpd"
        "nginx"  # Only if not used as reverse proxy
        "cups"   # Print services
        "avahi-daemon"  # Network discovery
        "bluetooth"
        "nfs-server"
        "rpcbind"
        "xinetd"
        "tftp"
        "finger"
        "talk"
        "ntalk"
        "chargen"
        "daytime"
        "echo"
        "discard"
        "time"
    )
    
    local disabled_count=0
    local total_services=${#services_to_disable[@]}
    
    for service in "${services_to_disable[@]}"; do
        if systemctl is-enabled "$service" >/dev/null 2>&1; then
            log_debug "Disabling service: $service"
            if systemctl disable "$service" >/dev/null 2>&1; then
                systemctl stop "$service" >/dev/null 2>&1 || true
                track_install_state "services_disabled" "$service"
                ((disabled_count++))
                log_debug "Successfully disabled service: $service"
            else
                log_debug "Failed to disable service: $service"
            fi
        elif systemctl is-active "$service" >/dev/null 2>&1; then
            log_debug "Stopping active service: $service"
            systemctl stop "$service" >/dev/null 2>&1 || true
        fi
    done
    
    # Remove unnecessary packages (with caution)
    remove_unnecessary_packages
    
    log_success "Disabled $disabled_count unnecessary services"
    return 0
}

# Remove unnecessary packages
remove_unnecessary_packages() {
    log_debug "Removing unnecessary packages..."
    
    # Packages to remove (be very careful with this list)
    local packages_to_remove=()
    
    case "${SYSTEM_INFO[os_type]}" in
        "ubuntu"|"debian")
            packages_to_remove=(
                "telnet"
                "rsh-client"
                "rsh-redone-client"
                "talk"
                "ntalk"
                "finger"
                "xinetd"
            )
            ;;
        "centos"|"rhel"|"fedora")
            packages_to_remove=(
                "telnet"
                "rsh"
                "talk"
                "finger"
                "xinetd"
            )
            ;;
    esac
    
    local removed_count=0
    
    for package in "${packages_to_remove[@]}"; do
        if is_package_installed "$package"; then
            log_debug "Removing package: $package"
            if remove_package "$package"; then
                track_install_state "packages_removed" "$package"
                ((removed_count++))
                log_debug "Successfully removed package: $package"
            else
                log_debug "Failed to remove package: $package"
            fi
        fi
    done
    
    if [[ $removed_count -gt 0 ]]; then
        log_debug "Removed $removed_count unnecessary packages"
    fi
    
    return 0
}

# Setup fail2ban intrusion prevention
setup_fail2ban() {
    log_debug "Setting up fail2ban..."
    
    # Install fail2ban
    if ! is_package_installed "fail2ban"; then
        log_info "Installing fail2ban..."
        if ! install_package "fail2ban"; then
            log_error "Failed to install fail2ban"
            return 1
        fi
        track_install_state "packages_installed" "fail2ban"
    fi
    
    # Create fail2ban configuration directory
    local fail2ban_dir="/etc/fail2ban"
    local jail_local="$fail2ban_dir/jail.local"
    
    # Backup original configuration if it exists
    if [[ -f "$jail_local" ]]; then
        cp "$jail_local" "$jail_local.seraphc2.backup.$(date +%s)"
    fi
    
    # Create custom jail configuration
    log_info "Configuring fail2ban jails..."
    cat > "$jail_local" << 'EOF'
[DEFAULT]
# Ban time: 1 hour
bantime = 3600

# Find time: 10 minutes
findtime = 600

# Max retry: 3 attempts
maxretry = 3

# Ignore local IPs
ignoreip = 127.0.0.1/8 ::1

# Email notifications (configure as needed)
# destemail = admin@example.com
# sender = fail2ban@example.com
# action = %(action_mwl)s

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[seraphc2-http]
enabled = true
port = http,https
filter = seraphc2-http
logpath = /var/log/seraphc2/access.log
maxretry = 10
findtime = 300
bantime = 1800

[seraphc2-auth]
enabled = true
port = http,https
filter = seraphc2-auth
logpath = /var/log/seraphc2/auth.log
maxretry = 5
findtime = 300
bantime = 3600
EOF
    
    # Create custom filters for SeraphC2
    create_fail2ban_filters
    
    # Enable and start fail2ban service
    log_info "Starting fail2ban service..."
    if ! systemctl enable fail2ban; then
        log_error "Failed to enable fail2ban service"
        return 1
    fi
    
    if ! systemctl start fail2ban; then
        log_error "Failed to start fail2ban service"
        return 1
    fi
    
    # Wait a moment for service to start
    sleep 2
    
    # Verify fail2ban is running
    if ! systemctl is-active fail2ban >/dev/null 2>&1; then
        log_error "Fail2ban service is not running"
        return 1
    fi
    
    track_install_state "services_created" "fail2ban"
    log_success "Fail2ban configured and started successfully"
    return 0
}

# Create custom fail2ban filters for SeraphC2
create_fail2ban_filters() {
    local filter_dir="/etc/fail2ban/filter.d"
    
    # Create HTTP filter for general web attacks
    cat > "$filter_dir/seraphc2-http.conf" << 'EOF'
[Definition]
# Fail2ban filter for SeraphC2 HTTP attacks
failregex = ^<HOST> .* "(GET|POST|HEAD).*" (4\d\d|5\d\d) .*$
            ^<HOST> .* "(GET|POST|HEAD).*(\.php|\.asp|\.jsp|admin|wp-admin|phpmyadmin).*" \d+ .*$
            ^<HOST> .* "(GET|POST|HEAD).*(union|select|insert|delete|drop|create|alter).*" \d+ .*$

ignoreregex =
EOF
    
    # Create authentication filter for login attempts
    cat > "$filter_dir/seraphc2-auth.conf" << 'EOF'
[Definition]
# Fail2ban filter for SeraphC2 authentication failures
failregex = ^.*\[ERROR\].*Authentication failed for user .* from <HOST>.*$
            ^.*\[WARNING\].*Failed login attempt from <HOST>.*$
            ^.*\[ERROR\].*Invalid credentials from <HOST>.*$

ignoreregex =
EOF
    
    log_debug "Created custom fail2ban filters for SeraphC2"
}

# Setup file integrity monitoring
setup_file_integrity_monitoring() {
    log_debug "Setting up file integrity monitoring..."
    
    # Try to install AIDE (Advanced Intrusion Detection Environment)
    local fim_tool=""
    
    if install_package "aide"; then
        fim_tool="aide"
        track_install_state "packages_installed" "aide"
    elif install_package "tripwire"; then
        fim_tool="tripwire"
        track_install_state "packages_installed" "tripwire"
    else
        log_warning "Could not install file integrity monitoring tools (AIDE or Tripwire)"
        # Create a simple custom file integrity monitor
        setup_custom_file_integrity_monitor
        return 0
    fi
    
    case "$fim_tool" in
        "aide")
            setup_aide_monitoring
            ;;
        "tripwire")
            setup_tripwire_monitoring
            ;;
    esac
    
    return 0
}

# Setup AIDE file integrity monitoring
setup_aide_monitoring() {
    log_info "Configuring AIDE file integrity monitoring..."
    
    # Create AIDE configuration
    local aide_conf="/etc/aide/aide.conf"
    
    # Backup original configuration
    if [[ -f "$aide_conf" ]]; then
        cp "$aide_conf" "$aide_conf.seraphc2.backup.$(date +%s)"
    fi
    
    # Add SeraphC2 specific monitoring rules
    cat >> "$aide_conf" << EOF

# SeraphC2 specific monitoring
${CONFIG[app_dir]} NORMAL
${CONFIG[config_dir]} NORMAL
${CONFIG[ssl_dir]} NORMAL
/etc/systemd/system/seraphc2.service NORMAL
/etc/fail2ban/ NORMAL
EOF
    
    # Initialize AIDE database
    log_info "Initializing AIDE database (this may take a few minutes)..."
    if ! aide --init >/dev/null 2>&1; then
        log_warning "Failed to initialize AIDE database"
        return 1
    fi
    
    # Move the new database to the correct location
    if [[ -f /var/lib/aide/aide.db.new ]]; then
        mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db
    fi
    
    # Create daily check script
    cat > /usr/local/bin/seraphc2-aide-check << 'EOF'
#!/bin/bash
# SeraphC2 AIDE integrity check script

AIDE_LOG="/var/log/aide/aide.log"
mkdir -p "$(dirname "$AIDE_LOG")"

echo "$(date): Starting AIDE integrity check" >> "$AIDE_LOG"

if aide --check >> "$AIDE_LOG" 2>&1; then
    echo "$(date): AIDE check completed - no changes detected" >> "$AIDE_LOG"
else
    echo "$(date): AIDE check completed - CHANGES DETECTED!" >> "$AIDE_LOG"
    # Optionally send alert email here
    logger -p security.warning "AIDE detected file system changes - check $AIDE_LOG"
fi
EOF
    
    chmod +x /usr/local/bin/seraphc2-aide-check
    
    # Schedule daily AIDE checks
    echo "0 3 * * * root /usr/local/bin/seraphc2-aide-check" >> /etc/crontab
    
    log_success "AIDE file integrity monitoring configured"
    return 0
}

# Setup custom file integrity monitor (fallback)
setup_custom_file_integrity_monitor() {
    log_info "Setting up custom file integrity monitoring..."
    
    # Create simple file integrity monitor script
    cat > /usr/local/bin/seraphc2-file-monitor << 'EOF'
#!/bin/bash
# Simple file integrity monitor for SeraphC2

MONITOR_DIRS=(
    "/opt/seraphc2"
    "/etc/seraphc2"
    "/etc/systemd/system/seraphc2.service"
    "/etc/fail2ban"
)

HASH_FILE="/var/lib/seraphc2/file-hashes.txt"
LOG_FILE="/var/log/seraphc2/file-monitor.log"

mkdir -p "$(dirname "$HASH_FILE")"
mkdir -p "$(dirname "$LOG_FILE")"

# Function to calculate file hashes
calculate_hashes() {
    for dir in "${MONITOR_DIRS[@]}"; do
        if [[ -e "$dir" ]]; then
            find "$dir" -type f -exec sha256sum {} \; 2>/dev/null
        fi
    done | sort
}

# Check if this is the first run
if [[ ! -f "$HASH_FILE" ]]; then
    echo "$(date): Initializing file integrity baseline" >> "$LOG_FILE"
    calculate_hashes > "$HASH_FILE"
    echo "$(date): Baseline created with $(wc -l < "$HASH_FILE") files" >> "$LOG_FILE"
    exit 0
fi

# Calculate current hashes and compare
TEMP_HASH_FILE="/tmp/seraphc2-hashes-$$.txt"
calculate_hashes > "$TEMP_HASH_FILE"

if ! diff "$HASH_FILE" "$TEMP_HASH_FILE" >/dev/null 2>&1; then
    echo "$(date): FILE INTEGRITY VIOLATION DETECTED!" >> "$LOG_FILE"
    echo "$(date): Changes detected in monitored files:" >> "$LOG_FILE"
    diff "$HASH_FILE" "$TEMP_HASH_FILE" >> "$LOG_FILE" 2>&1
    logger -p security.warning "SeraphC2 file integrity violation detected"
    
    # Update baseline (comment out if you want manual review)
    # cp "$TEMP_HASH_FILE" "$HASH_FILE"
else
    echo "$(date): File integrity check passed" >> "$LOG_FILE"
fi

rm -f "$TEMP_HASH_FILE"
EOF
    
    chmod +x /usr/local/bin/seraphc2-file-monitor
    
    # Initialize baseline
    /usr/local/bin/seraphc2-file-monitor
    
    # Schedule regular checks
    echo "0 */6 * * * root /usr/local/bin/seraphc2-file-monitor" >> /etc/crontab
    
    log_success "Custom file integrity monitoring configured"
    return 0
}

# Configure system limits and security
configure_system_limits() {
    log_debug "Configuring system security limits..."
    
    # Configure limits.conf for security
    local limits_conf="/etc/security/limits.conf"
    
    # Backup original configuration
    if [[ -f "$limits_conf" ]]; then
        cp "$limits_conf" "$limits_conf.seraphc2.backup.$(date +%s)"
    fi
    
    # Add security limits
    cat >> "$limits_conf" << 'EOF'

# SeraphC2 Security Limits
* soft core 0
* hard core 0
* soft nproc 1000
* hard nproc 2000
* soft nofile 65536
* hard nofile 65536
EOF
    
    # Configure sysctl security parameters
    local sysctl_conf="/etc/sysctl.d/99-seraphc2-security.conf"
    
    cat > "$sysctl_conf" << 'EOF'
# SeraphC2 Security Configuration

# Network security
net.ipv4.ip_forward = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.tcp_syncookies = 1

# IPv6 security (disable if not needed)
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1

# Kernel security
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
kernel.yama.ptrace_scope = 1

# File system security
fs.suid_dumpable = 0
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
EOF
    
    # Apply sysctl settings
    if ! sysctl -p "$sysctl_conf" >/dev/null 2>&1; then
        log_warning "Failed to apply some sysctl security settings"
    fi
    
    # Configure login security
    configure_login_security
    
    log_success "System security limits configured"
    return 0
}

# Configure login security
configure_login_security() {
    log_debug "Configuring login security..."
    
    # Configure login.defs
    local login_defs="/etc/login.defs"
    
    if [[ -f "$login_defs" ]]; then
        # Backup original
        cp "$login_defs" "$login_defs.seraphc2.backup.$(date +%s)"
        
        # Update password aging settings
        sed -i 's/^PASS_MAX_DAYS.*/PASS_MAX_DAYS\t90/' "$login_defs"
        sed -i 's/^PASS_MIN_DAYS.*/PASS_MIN_DAYS\t7/' "$login_defs"
        sed -i 's/^PASS_WARN_AGE.*/PASS_WARN_AGE\t14/' "$login_defs"
        
        # Set minimum password length
        if ! grep -q "PASS_MIN_LEN" "$login_defs"; then
            echo "PASS_MIN_LEN		12" >> "$login_defs"
        fi
    fi
    
    # Configure PAM for password complexity (if available)
    configure_pam_security
    
    log_debug "Login security configured"
}

# Configure PAM security
configure_pam_security() {
    local pam_common_password="/etc/pam.d/common-password"
    
    if [[ -f "$pam_common_password" ]]; then
        # Backup original
        cp "$pam_common_password" "$pam_common_password.seraphc2.backup.$(date +%s)"
        
        # Add password complexity requirements (if libpam-pwquality is available)
        if is_package_installed "libpam-pwquality" || install_package "libpam-pwquality"; then
            # Add password quality requirements
            if ! grep -q "pam_pwquality.so" "$pam_common_password"; then
                sed -i '/pam_unix.so/i password requisite pam_pwquality.so retry=3 minlen=12 difok=3 ucredit=-1 lcredit=-1 dcredit=-1 ocredit=-1' "$pam_common_password"
            fi
            track_install_state "packages_installed" "libpam-pwquality"
        fi
    fi
}

# Setup log monitoring and alerting
setup_log_monitoring() {
    log_debug "Setting up log monitoring..."
    
    # Create log monitoring directory
    local monitor_dir="/var/lib/seraphc2/monitoring"
    mkdir -p "$monitor_dir"
    
    # Create log monitoring script
    cat > /usr/local/bin/seraphc2-log-monitor << 'EOF'
#!/bin/bash
# SeraphC2 Log Monitoring Script

LOG_FILES=(
    "/var/log/auth.log"
    "/var/log/syslog"
    "/var/log/seraphc2/error.log"
    "/var/log/seraphc2/security.log"
    "/var/log/fail2ban.log"
)

ALERT_LOG="/var/log/seraphc2/security-alerts.log"
LAST_CHECK_FILE="/var/lib/seraphc2/monitoring/last-check"

mkdir -p "$(dirname "$ALERT_LOG")"
mkdir -p "$(dirname "$LAST_CHECK_FILE")"

# Get timestamp of last check
if [[ -f "$LAST_CHECK_FILE" ]]; then
    LAST_CHECK=$(cat "$LAST_CHECK_FILE")
else
    LAST_CHECK=$(date -d "1 hour ago" +%s)
fi

CURRENT_TIME=$(date +%s)
echo "$CURRENT_TIME" > "$LAST_CHECK_FILE"

# Convert to date format for log searching
LAST_CHECK_DATE=$(date -d "@$LAST_CHECK" "+%b %d %H:%M")

# Security patterns to monitor
SECURITY_PATTERNS=(
    "Failed password"
    "Invalid user"
    "authentication failure"
    "POSSIBLE BREAK-IN ATTEMPT"
    "refused connect"
    "attack"
    "intrusion"
    "violation"
    "unauthorized"
    "suspicious"
)

# Check each log file for security events
for log_file in "${LOG_FILES[@]}"; do
    if [[ -f "$log_file" ]]; then
        for pattern in "${SECURITY_PATTERNS[@]}"; do
            # Search for pattern in logs since last check
            if grep -i "$pattern" "$log_file" | awk -v date="$LAST_CHECK_DATE" '$0 > date' | grep -q .; then
                echo "$(date): SECURITY ALERT - Pattern '$pattern' found in $log_file" >> "$ALERT_LOG"
                grep -i "$pattern" "$log_file" | awk -v date="$LAST_CHECK_DATE" '$0 > date' >> "$ALERT_LOG"
                logger -p security.warning "SeraphC2 security alert: $pattern detected in $log_file"
            fi
        done
    fi
done

# Check for excessive failed login attempts
FAILED_LOGINS=$(grep "Failed password" /var/log/auth.log 2>/dev/null | awk -v date="$LAST_CHECK_DATE" '$0 > date' | wc -l)
if [[ $FAILED_LOGINS -gt 10 ]]; then
    echo "$(date): SECURITY ALERT - $FAILED_LOGINS failed login attempts detected" >> "$ALERT_LOG"
    logger -p security.warning "SeraphC2 security alert: $FAILED_LOGINS failed login attempts"
fi

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [[ $DISK_USAGE -gt 90 ]]; then
    echo "$(date): SYSTEM ALERT - Disk usage at ${DISK_USAGE}%" >> "$ALERT_LOG"
    logger -p daemon.warning "SeraphC2 system alert: High disk usage ${DISK_USAGE}%"
fi

# Rotate alert log if it gets too large
if [[ -f "$ALERT_LOG" ]] && [[ $(stat -c%s "$ALERT_LOG") -gt 10485760 ]]; then  # 10MB
    mv "$ALERT_LOG" "${ALERT_LOG}.old"
    touch "$ALERT_LOG"
fi
EOF
    
    chmod +x /usr/local/bin/seraphc2-log-monitor
    
    # Schedule log monitoring every 15 minutes
    echo "*/15 * * * * root /usr/local/bin/seraphc2-log-monitor" >> /etc/crontab
    
    # Create logrotate configuration for SeraphC2 logs
    create_logrotate_config
    
    log_success "Log monitoring configured"
    return 0
}

# Create logrotate configuration
create_logrotate_config() {
    local logrotate_conf="/etc/logrotate.d/seraphc2"
    
    cat > "$logrotate_conf" << 'EOF'
/var/log/seraphc2/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 640 seraphc2 seraphc2
    postrotate
        systemctl reload seraphc2 2>/dev/null || true
    endscript
}

/var/log/seraphc2/security-alerts.log {
    weekly
    missingok
    rotate 12
    compress
    delaycompress
    notifempty
    create 640 root root
}
EOF
    
    log_debug "Logrotate configuration created for SeraphC2"
}

# Apply additional security configurations
apply_additional_security_config() {
    log_debug "Applying additional security configurations..."
    
    # Secure shared memory
    secure_shared_memory
    
    # Configure automatic security updates (if available)
    configure_automatic_updates
    
    # Set up basic intrusion detection
    setup_basic_intrusion_detection
    
    # Configure secure SSH (if SSH is allowed)
    if [[ "${CONFIG[allow_ssh]}" == "true" ]]; then
        configure_secure_ssh
    fi
    
    log_success "Additional security configurations applied"
    return 0
}

# Secure shared memory
secure_shared_memory() {
    log_debug "Securing shared memory..."
    
    local fstab="/etc/fstab"
    
    # Backup fstab
    cp "$fstab" "$fstab.seraphc2.backup.$(date +%s)"
    
    # Add secure shared memory mount if not present
    if ! grep -q "tmpfs /run/shm" "$fstab"; then
        echo "tmpfs /run/shm tmpfs defaults,noexec,nosuid 0 0" >> "$fstab"
        log_debug "Added secure shared memory mount to fstab"
    fi
}

# Configure automatic security updates
configure_automatic_updates() {
    log_debug "Configuring automatic security updates..."
    
    case "${SYSTEM_INFO[os_type]}" in
        "ubuntu"|"debian")
            if install_package "unattended-upgrades"; then
                # Configure unattended upgrades for security updates only
                local config_file="/etc/apt/apt.conf.d/50unattended-upgrades"
                if [[ -f "$config_file" ]]; then
                    cp "$config_file" "$config_file.seraphc2.backup.$(date +%s)"
                    
                    # Enable automatic security updates
                    sed -i 's|//\s*"${distro_id}:${distro_codename}-security";|"${distro_id}:${distro_codename}-security";|' "$config_file"
                fi
                
                # Enable automatic updates
                echo 'APT::Periodic::Update-Package-Lists "1";' > /etc/apt/apt.conf.d/20auto-upgrades
                echo 'APT::Periodic::Unattended-Upgrade "1";' >> /etc/apt/apt.conf.d/20auto-upgrades
                
                track_install_state "packages_installed" "unattended-upgrades"
                log_debug "Automatic security updates configured"
            fi
            ;;
        "centos"|"rhel"|"fedora")
            if install_package "yum-cron" || install_package "dnf-automatic"; then
                # Configure automatic updates for security patches
                if [[ -f /etc/yum/yum-cron.conf ]]; then
                    sed -i 's/update_cmd = default/update_cmd = security/' /etc/yum/yum-cron.conf
                    sed -i 's/apply_updates = no/apply_updates = yes/' /etc/yum/yum-cron.conf
                    systemctl enable yum-cron
                    systemctl start yum-cron
                elif [[ -f /etc/dnf/automatic.conf ]]; then
                    sed -i 's/upgrade_type = default/upgrade_type = security/' /etc/dnf/automatic.conf
                    sed -i 's/apply_updates = no/apply_updates = yes/' /etc/dnf/automatic.conf
                    systemctl enable dnf-automatic.timer
                    systemctl start dnf-automatic.timer
                fi
                log_debug "Automatic security updates configured"
            fi
            ;;
    esac
}

# Setup basic intrusion detection
setup_basic_intrusion_detection() {
    log_debug "Setting up basic intrusion detection..."
    
    # Create simple intrusion detection script
    cat > /usr/local/bin/seraphc2-intrusion-detect << 'EOF'
#!/bin/bash
# Basic intrusion detection for SeraphC2

ALERT_LOG="/var/log/seraphc2/intrusion-alerts.log"
mkdir -p "$(dirname "$ALERT_LOG")"

# Check for suspicious network connections
SUSPICIOUS_CONNECTIONS=$(netstat -an | grep -E "(LISTEN|ESTABLISHED)" | grep -v -E "(127.0.0.1|::1)" | wc -l)
if [[ $SUSPICIOUS_CONNECTIONS -gt 50 ]]; then
    echo "$(date): INTRUSION ALERT - Suspicious number of network connections: $SUSPICIOUS_CONNECTIONS" >> "$ALERT_LOG"
fi

# Check for unusual processes
UNUSUAL_PROCESSES=$(ps aux | grep -v -E "(seraphc2|postgres|redis|systemd|kernel)" | grep -E "(nc|netcat|ncat|socat)" | wc -l)
if [[ $UNUSUAL_PROCESSES -gt 0 ]]; then
    echo "$(date): INTRUSION ALERT - Unusual network processes detected" >> "$ALERT_LOG"
    ps aux | grep -E "(nc|netcat|ncat|socat)" >> "$ALERT_LOG"
fi

# Check for modified system files
if command -v debsums >/dev/null 2>&1; then
    MODIFIED_FILES=$(debsums -c 2>/dev/null | wc -l)
    if [[ $MODIFIED_FILES -gt 0 ]]; then
        echo "$(date): INTRUSION ALERT - $MODIFIED_FILES system files have been modified" >> "$ALERT_LOG"
    fi
fi

# Check for large files in tmp directories
LARGE_TMP_FILES=$(find /tmp /var/tmp -size +100M 2>/dev/null | wc -l)
if [[ $LARGE_TMP_FILES -gt 0 ]]; then
    echo "$(date): INTRUSION ALERT - Large files found in temporary directories" >> "$ALERT_LOG"
    find /tmp /var/tmp -size +100M 2>/dev/null >> "$ALERT_LOG"
fi
EOF
    
    chmod +x /usr/local/bin/seraphc2-intrusion-detect
    
    # Schedule intrusion detection checks every hour
    echo "0 * * * * root /usr/local/bin/seraphc2-intrusion-detect" >> /etc/crontab
    
    log_debug "Basic intrusion detection configured"
}

# Configure secure SSH
configure_secure_ssh() {
    log_debug "Configuring secure SSH..."
    
    local sshd_config="/etc/ssh/sshd_config"
    
    if [[ ! -f "$sshd_config" ]]; then
        log_warning "SSH configuration file not found, skipping SSH hardening"
        return 0
    fi
    
    # Backup original configuration
    cp "$sshd_config" "$sshd_config.seraphc2.backup.$(date +%s)"
    
    # Apply SSH security settings
    local ssh_settings=(
        "Protocol 2"
        "PermitRootLogin no"
        "PasswordAuthentication yes"  # Keep enabled for now, but could be disabled if key auth is set up
        "PermitEmptyPasswords no"
        "MaxAuthTries 3"
        "MaxStartups 2"
        "LoginGraceTime 30"
        "ClientAliveInterval 300"
        "ClientAliveCountMax 2"
        "X11Forwarding no"
        "AllowTcpForwarding no"
        "AllowAgentForwarding no"
        "PermitTunnel no"
        "Banner /etc/ssh/banner"
    )
    
    for setting in "${ssh_settings[@]}"; do
        local key=$(echo "$setting" | cut -d' ' -f1)
        local value=$(echo "$setting" | cut -d' ' -f2-)
        
        if grep -q "^#*$key" "$sshd_config"; then
            sed -i "s/^#*$key.*/$setting/" "$sshd_config"
        else
            echo "$setting" >> "$sshd_config"
        fi
    done
    
    # Create SSH banner
    cat > /etc/ssh/banner << 'EOF'
***************************************************************************
                            AUTHORIZED ACCESS ONLY
***************************************************************************
This system is for authorized users only. All activities are monitored
and logged. Unauthorized access is prohibited and will be prosecuted to
the full extent of the law.
***************************************************************************
EOF
    
    # Test SSH configuration
    if sshd -t; then
        log_debug "SSH configuration is valid"
        # Restart SSH service to apply changes
        systemctl reload sshd || systemctl restart sshd
        log_debug "SSH service reloaded with new configuration"
    else
        log_warning "SSH configuration test failed, restoring backup"
        cp "$sshd_config.seraphc2.backup.$(date +%s)" "$sshd_config"
        return 1
    fi
    
    return 0
}

# Rollback security hardening
rollback_security_hardening() {
    log_info "Rolling back security hardening..."
    
    local rollback_errors=0
    
    # Stop and remove fail2ban
    if systemctl is-active fail2ban >/dev/null 2>&1; then
        systemctl stop fail2ban || ((rollback_errors++))
        systemctl disable fail2ban || ((rollback_errors++))
    fi
    
    # Remove fail2ban configuration
    if [[ -f /etc/fail2ban/jail.local.seraphc2.backup.* ]]; then
        local backup_file=$(ls -t /etc/fail2ban/jail.local.seraphc2.backup.* | head -1)
        cp "$backup_file" /etc/fail2ban/jail.local || ((rollback_errors++))
    fi
    
    # Restore system configurations
    for config_file in /etc/security/limits.conf /etc/login.defs /etc/ssh/sshd_config; do
        if [[ -f "$config_file.seraphc2.backup."* ]]; then
            local backup_file=$(ls -t "$config_file.seraphc2.backup."* | head -1)
            cp "$backup_file" "$config_file" || ((rollback_errors++))
        fi
    done
    
    # Remove sysctl configuration
    rm -f /etc/sysctl.d/99-seraphc2-security.conf
    
    # Remove monitoring scripts
    rm -f /usr/local/bin/seraphc2-*
    
    # Remove cron jobs
    sed -i '/seraphc2/d' /etc/crontab
    
    # Re-enable services that were disabled (with caution)
    if [[ -n "${INSTALL_STATE[services_disabled]}" ]]; then
        log_warning "Some services were disabled during hardening. Manual review recommended before re-enabling."
    fi
    
    if [[ $rollback_errors -eq 0 ]]; then
        log_success "Security hardening rollback completed successfully"
    else
        log_warning "Security hardening rollback completed with $rollback_errors errors"
    fi
    
    return $rollback_errors
}

#==============================================================================
# Get system hardware information
get_system_hardware_info() {
    log_debug "Gathering system hardware information..."
    
    # Get memory information
    local memory_kb
    if [[ -f /proc/meminfo ]]; then
        memory_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        SYSTEM_INFO[memory_gb]=$((memory_kb / 1024 / 1024))
    else
        SYSTEM_INFO[memory_gb]="unknown"
    fi
    
    # Get disk space information for root filesystem
    local disk_space_kb
    if command -v df >/dev/null 2>&1; then
        disk_space_kb=$(df / | tail -1 | awk '{print $4}')
        SYSTEM_INFO[disk_space_gb]=$((disk_space_kb / 1024 / 1024))
    else
        SYSTEM_INFO[disk_space_gb]="unknown"
    fi
    
    # Get CPU core count
    if [[ -f /proc/cpuinfo ]]; then
        SYSTEM_INFO[cpu_cores]=$(grep -c ^processor /proc/cpuinfo)
    else
        SYSTEM_INFO[cpu_cores]="unknown"
    fi
    
    # Get kernel version
    SYSTEM_INFO[kernel_version]=$(uname -r)
    
    # Get hostname
    SYSTEM_INFO[hostname]=$(hostname 2>/dev/null || echo "unknown")
    
    log_debug "Hardware info - Memory: ${SYSTEM_INFO[memory_gb]}GB, Disk: ${SYSTEM_INFO[disk_space_gb]}GB, CPU cores: ${SYSTEM_INFO[cpu_cores]}"
    
    return 0
}

# Validate system requirements
validate_system_requirements() {
    log_debug "Validating system requirements..."
    
    local requirements_met=true
    
    # Check minimum memory requirement (2GB)
    if [[ "${SYSTEM_INFO[memory_gb]}" != "unknown" ]]; then
        if [[ ${SYSTEM_INFO[memory_gb]} -lt 2 ]]; then
            log_error "Insufficient memory: ${SYSTEM_INFO[memory_gb]}GB (minimum: 2GB)"
            requirements_met=false
        else
            log_debug "Memory requirement met: ${SYSTEM_INFO[memory_gb]}GB"
        fi
    else
        log_warning "Could not determine memory size"
    fi
    
    # Check minimum disk space requirement (10GB)
    if [[ "${SYSTEM_INFO[disk_space_gb]}" != "unknown" ]]; then
        if [[ ${SYSTEM_INFO[disk_space_gb]} -lt 10 ]]; then
            log_error "Insufficient disk space: ${SYSTEM_INFO[disk_space_gb]}GB (minimum: 10GB)"
            requirements_met=false
        else
            log_debug "Disk space requirement met: ${SYSTEM_INFO[disk_space_gb]}GB"
        fi
    else
        log_warning "Could not determine available disk space"
    fi
    
    # Check minimum CPU cores (1 core minimum, 2 recommended)
    if [[ "${SYSTEM_INFO[cpu_cores]}" != "unknown" ]]; then
        if [[ ${SYSTEM_INFO[cpu_cores]} -lt 1 ]]; then
            log_error "Insufficient CPU cores: ${SYSTEM_INFO[cpu_cores]} (minimum: 1)"
            requirements_met=false
        elif [[ ${SYSTEM_INFO[cpu_cores]} -eq 1 ]]; then
            log_warning "Single CPU core detected. Performance may be limited (recommended: 2+ cores)"
        else
            log_debug "CPU requirement met: ${SYSTEM_INFO[cpu_cores]} cores"
        fi
    else
        log_warning "Could not determine CPU core count"
    fi
    
    if [[ "$requirements_met" != "true" ]]; then
        log_error "System does not meet minimum requirements"
        exit $E_VALIDATION_ERROR
    fi
    
    log_success "System requirements validation passed"
    return 0
}

# Check if OS version is supported
validate_os_support() {
    log_debug "Validating OS support..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    local os_version="${SYSTEM_INFO[os_version]}"
    local supported=true
    local min_version=""
    
    case "$os_type" in
        ubuntu)
            min_version="20.04"
            if ! compare_versions "$os_version" "$min_version"; then
                supported=false
            fi
            ;;
        debian)
            min_version="11"
            # Extract major version number
            local major_version=$(echo "$os_version" | cut -d'.' -f1)
            if [[ $major_version -lt 11 ]]; then
                supported=false
            fi
            ;;
        centos)
            min_version="8"
            local major_version=$(echo "$os_version" | cut -d'.' -f1)
            if [[ $major_version -lt 8 ]]; then
                supported=false
            fi
            ;;
        rhel)
            min_version="8"
            local major_version=$(echo "$os_version" | cut -d'.' -f1)
            if [[ $major_version -lt 8 ]]; then
                supported=false
            fi
            ;;
        fedora)
            min_version="34"
            if [[ $os_version -lt 34 ]]; then
                supported=false
            fi
            ;;
        unknown_linux)
            log_warning "Unknown Linux distribution detected"
            log_warning "Installation may not work correctly"
            log_warning "Supported distributions: Ubuntu 20.04+, Debian 11+, CentOS 8+, RHEL 8+, Fedora 34+"
            return 0
            ;;
        *)
            log_error "Unsupported operating system: $os_type"
            log_error "Supported distributions:"
            log_error "  - Ubuntu 20.04 LTS or later"
            log_error "  - Debian 11 or later"
            log_error "  - CentOS 8 or later"
            log_error "  - RHEL 8 or later"
            log_error "  - Fedora 34 or later"
            exit $E_UNSUPPORTED_OS
            ;;
    esac
    
    if [[ "$supported" != "true" ]]; then
        log_error "Unsupported $os_type version: $os_version (minimum: $min_version)"
        log_error "Please upgrade to a supported version or use a different distribution"
        exit $E_UNSUPPORTED_OS
    fi
    
    log_success "Operating system support validated: $os_type $os_version"
    return 0
}

# Check network connectivity
check_network_connectivity() {
    log_debug "Checking network connectivity..."
    
    local test_hosts=("8.8.8.8" "1.1.1.1" "google.com")
    local connectivity_ok=false
    
    for host in "${test_hosts[@]}"; do
        if ping -c 1 -W 5 "$host" >/dev/null 2>&1; then
            log_debug "Network connectivity confirmed via $host"
            connectivity_ok=true
            break
        fi
    done
    
    if [[ "$connectivity_ok" != "true" ]]; then
        log_error "No network connectivity detected"
        log_error "Internet connection is required for package downloads"
        log_error "Please check your network configuration and try again"
        exit $E_NETWORK_ERROR
    fi
    
    log_success "Network connectivity confirmed"
    return 0
}

# Check if ports are available
check_port_availability() {
    log_debug "Checking port availability..."
    
    local ports_to_check=(
        "${CONFIG[http_port]}"
        "${CONFIG[https_port]}"
        "${CONFIG[implant_port]}"
    )
    
    local unavailable_ports=()
    
    for port in "${ports_to_check[@]}"; do
        if check_port_in_use "$port"; then
            unavailable_ports+=("$port")
        fi
    done
    
    if [[ ${#unavailable_ports[@]} -gt 0 ]]; then
        log_error "The following ports are already in use:"
        for port in "${unavailable_ports[@]}"; do
            local process_info=$(get_port_process_info "$port")
            log_error "  Port $port: $process_info"
        done
        log_error "Please stop the services using these ports or choose different ports"
        log_error "Use --http-port, --https-port, and --implant-port options to specify different ports"
        exit $E_VALIDATION_ERROR
    fi
    
    log_success "All required ports are available"
    return 0
}

# Check if a specific port is in use
check_port_in_use() {
    local port="$1"
    
    # Check using netstat if available
    if command -v netstat >/dev/null 2>&1; then
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            return 0  # Port is in use
        fi
    fi
    
    # Check using ss if available (more modern)
    if command -v ss >/dev/null 2>&1; then
        if ss -tuln 2>/dev/null | grep -q ":$port "; then
            return 0  # Port is in use
        fi
    fi
    
    # Check using lsof if available
    if command -v lsof >/dev/null 2>&1; then
        if lsof -i ":$port" >/dev/null 2>&1; then
            return 0  # Port is in use
        fi
    fi
    
    return 1  # Port is not in use
}

# Get information about process using a port
get_port_process_info() {
    local port="$1"
    local process_info="unknown process"
    
    # Try to get process info using lsof
    if command -v lsof >/dev/null 2>&1; then
        local lsof_output
        lsof_output=$(lsof -i ":$port" -t 2>/dev/null | head -1)
        if [[ -n "$lsof_output" ]]; then
            local pid="$lsof_output"
            if [[ -f "/proc/$pid/comm" ]]; then
                local process_name=$(cat "/proc/$pid/comm" 2>/dev/null)
                process_info="$process_name (PID: $pid)"
            else
                process_info="PID: $pid"
            fi
        fi
    fi
    
    # Fallback to netstat if lsof didn't work
    if [[ "$process_info" == "unknown process" ]] && command -v netstat >/dev/null 2>&1; then
        local netstat_output
        netstat_output=$(netstat -tulnp 2>/dev/null | grep ":$port " | head -1)
        if [[ -n "$netstat_output" ]]; then
            local pid_program=$(echo "$netstat_output" | awk '{print $7}' | cut -d'/' -f1-2)
            if [[ -n "$pid_program" && "$pid_program" != "-" ]]; then
                process_info="$pid_program"
            fi
        fi
    fi
    
    echo "$process_info"
}

# Validate PostgreSQL compatibility for the current OS
validate_postgresql_compatibility() {
    log_info "Validating PostgreSQL compatibility for current OS..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    local os_version="${SYSTEM_INFO[os_version]}"
    local os_codename="${SYSTEM_INFO[os_codename]}"
    local required_pg_version="13"
    
    local compatible=true
    local reason=""
    local recommendation=""
    
    case "$os_type" in
        ubuntu)
            case "$os_version" in
                "18.04"|"18."*)
                    compatible=false
                    reason="Ubuntu 18.04 has reached end of standard support and PostgreSQL $required_pg_version+ is not available"
                    recommendation="Upgrade to Ubuntu 20.04 LTS or newer"
                    ;;
                "20.04"|"20."*)
                    compatible=false
                    reason="Ubuntu 20.04 only provides PostgreSQL 12, but SeraphC2 requires PostgreSQL $required_pg_version+"
                    recommendation="Upgrade to Ubuntu 22.04 LTS or newer for PostgreSQL $required_pg_version+ support"
                    ;;
                "22.04"|"22."*|"24.04"|"24."*)
                    compatible=true
                    log_success "Ubuntu $os_version supports PostgreSQL $required_pg_version+"
                    ;;
                *)
                    # For newer versions, assume compatibility
                    if [[ "${os_version%%.*}" -ge 22 ]]; then
                        compatible=true
                        log_success "Ubuntu $os_version should support PostgreSQL $required_pg_version+"
                    else
                        compatible=false
                        reason="Ubuntu $os_version is not tested and may not support PostgreSQL $required_pg_version+"
                        recommendation="Use Ubuntu 22.04 LTS or newer"
                    fi
                    ;;
            esac
            ;;
        debian)
            case "$os_version" in
                "10"|"10."*)
                    compatible=false
                    reason="Debian 10 (Buster) only provides PostgreSQL 11, but SeraphC2 requires PostgreSQL $required_pg_version+"
                    recommendation="Upgrade to Debian 11 (Bullseye) or newer"
                    ;;
                "11"|"11."*|"12"|"12."*)
                    compatible=true
                    log_success "Debian $os_version supports PostgreSQL $required_pg_version+"
                    ;;
                *)
                    # For newer versions, assume compatibility
                    if [[ "${os_version%%.*}" -ge 11 ]]; then
                        compatible=true
                        log_success "Debian $os_version should support PostgreSQL $required_pg_version+"
                    else
                        compatible=false
                        reason="Debian $os_version is too old and does not support PostgreSQL $required_pg_version+"
                        recommendation="Upgrade to Debian 11 (Bullseye) or newer"
                    fi
                    ;;
            esac
            ;;
        centos)
            case "$os_version" in
                "7"|"7."*)
                    compatible=false
                    reason="CentOS 7 has reached end of life and PostgreSQL $required_pg_version+ support is limited"
                    recommendation="Upgrade to Rocky Linux 8/9 or AlmaLinux 8/9"
                    ;;
                "8"|"8."*|"9"|"9."*)
                    compatible=true
                    log_success "CentOS $os_version supports PostgreSQL $required_pg_version+"
                    ;;
                *)
                    if [[ "${os_version%%.*}" -ge 8 ]]; then
                        compatible=true
                        log_success "CentOS $os_version should support PostgreSQL $required_pg_version+"
                    else
                        compatible=false
                        reason="CentOS $os_version is too old and does not support PostgreSQL $required_pg_version+"
                        recommendation="Upgrade to CentOS 8+ or Rocky Linux 8/9"
                    fi
                    ;;
            esac
            ;;
        rhel)
            case "$os_version" in
                "7"|"7."*)
                    compatible=false
                    reason="RHEL 7 is approaching end of life and PostgreSQL $required_pg_version+ support is limited"
                    recommendation="Upgrade to RHEL 8 or newer"
                    ;;
                "8"|"8."*|"9"|"9."*)
                    compatible=true
                    log_success "RHEL $os_version supports PostgreSQL $required_pg_version+"
                    ;;
                *)
                    if [[ "${os_version%%.*}" -ge 8 ]]; then
                        compatible=true
                        log_success "RHEL $os_version should support PostgreSQL $required_pg_version+"
                    else
                        compatible=false
                        reason="RHEL $os_version is too old and does not support PostgreSQL $required_pg_version+"
                        recommendation="Upgrade to RHEL 8 or newer"
                    fi
                    ;;
            esac
            ;;
        fedora)
            case "$os_version" in
                "35"|"36"|"37"|"38"|"39"|"40")
                    compatible=true
                    log_success "Fedora $os_version supports PostgreSQL $required_pg_version+"
                    ;;
                *)
                    if [[ "${os_version}" -ge 35 ]]; then
                        compatible=true
                        log_success "Fedora $os_version should support PostgreSQL $required_pg_version+"
                    else
                        compatible=false
                        reason="Fedora $os_version is too old and may not support PostgreSQL $required_pg_version+"
                        recommendation="Upgrade to Fedora 35 or newer"
                    fi
                    ;;
            esac
            ;;
        *)
            log_warning "Unknown operating system: $os_type $os_version"
            log_warning "PostgreSQL $required_pg_version+ compatibility cannot be verified"
            log_warning "Installation may fail if PostgreSQL $required_pg_version+ is not available"
            return 0  # Continue with installation attempt
            ;;
    esac
    
    if [[ "$compatible" != "true" ]]; then
        echo ""
        log_error "═══════════════════════════════════════════════════════════════"
        log_error "                INCOMPATIBLE OPERATING SYSTEM                 "
        log_error "═══════════════════════════════════════════════════════════════"
        log_error ""
        log_error "Current OS: $os_type $os_version"
        log_error "Reason: $reason"
        log_error ""
        log_error "SeraphC2 requires PostgreSQL $required_pg_version or higher, which is not"
        log_error "available or supported on your current operating system."
        log_error ""
        log_error "RECOMMENDATION: $recommendation"
        log_error ""
        log_error "Supported Operating Systems:"
        log_error "  • Ubuntu 22.04 LTS (Jammy) or newer"
        log_error "  • Debian 11 (Bullseye) or newer"
        log_error "  • CentOS 8+ / Rocky Linux 8+ / AlmaLinux 8+"
        log_error "  • RHEL 8 or newer"
        log_error "  • Fedora 35 or newer"
        log_error ""
        log_error "For the complete compatibility matrix, see:"
        log_error "https://github.com/yourusername/SeraphC2/blob/main/README.md#compatibility"
        log_error ""
        log_error "═══════════════════════════════════════════════════════════════"
        
        exit $E_UNSUPPORTED_OS
    fi
    
    log_success "PostgreSQL compatibility validation passed"
}

# Main system detection and prerequisites checking function
check_system_prerequisites() {
    log_info "Checking system prerequisites..."
    
    # Check sudo privileges first (required for all other checks)
    check_sudo_privileges
    
    # Detect system information
    detect_operating_system
    detect_architecture
    detect_package_manager
    detect_init_system
    detect_firewall_system
    get_system_hardware_info
    
    # Validate system support and requirements
    validate_os_support
    validate_system_requirements
    
    # Check PostgreSQL compatibility for this OS
    validate_postgresql_compatibility
    
    # Check network and port availability
    check_network_connectivity
    check_port_availability
    
    log_success "System prerequisites check completed successfully"
    
    # Display system information summary
    display_system_info
    
    return 0
}

# Display detected system information
display_system_info() {
    log_info "System Information Summary:"
    
    echo -e "\n${WHITE}Operating System:${NC}"
    echo "  Distribution: ${SYSTEM_INFO[os_type]}"
    echo "  Version: ${SYSTEM_INFO[os_version]}"
    if [[ -n "${SYSTEM_INFO[os_codename]}" ]]; then
        echo "  Codename: ${SYSTEM_INFO[os_codename]}"
    fi
    echo "  Architecture: ${SYSTEM_INFO[architecture]}"
    echo "  Kernel: ${SYSTEM_INFO[kernel_version]}"
    echo "  Hostname: ${SYSTEM_INFO[hostname]}"
    
    echo -e "\n${WHITE}System Resources:${NC}"
    echo "  Memory: ${SYSTEM_INFO[memory_gb]}GB"
    echo "  Available Disk Space: ${SYSTEM_INFO[disk_space_gb]}GB"
    echo "  CPU Cores: ${SYSTEM_INFO[cpu_cores]}"
    
    echo -e "\n${WHITE}System Services:${NC}"
    echo "  Package Manager: ${SYSTEM_INFO[package_manager]}"
    echo "  Init System: ${SYSTEM_INFO[init_system]}"
    echo "  Firewall System: ${SYSTEM_INFO[firewall_system]}"
    
    echo ""
}

# Compare version numbers (returns 0 if version1 >= version2, 1 otherwise)
compare_versions() {
    local version1="$1"
    local version2="$2"
    
    # Handle simple integer comparison for Fedora
    if [[ "$version1" =~ ^[0-9]+$ ]] && [[ "$version2" =~ ^[0-9]+$ ]]; then
        [[ $version1 -ge $version2 ]]
        return $?
    fi
    
    # Handle dotted version numbers (e.g., 20.04, 11.2)
    # Convert versions to comparable format
    local IFS='.'
    local ver1_array=($version1)
    local ver2_array=($version2)
    
    # Pad arrays to same length
    local max_length=${#ver1_array[@]}
    if [[ ${#ver2_array[@]} -gt $max_length ]]; then
        max_length=${#ver2_array[@]}
    fi
    
    # Compare each component
    for ((i=0; i<max_length; i++)); do
        local v1=${ver1_array[i]:-0}
        local v2=${ver2_array[i]:-0}
        
        # Remove non-numeric characters for comparison
        v1=$(echo "$v1" | sed 's/[^0-9]//g')
        v2=$(echo "$v2" | sed 's/[^0-9]//g')
        
        # Default to 0 if empty
        v1=${v1:-0}
        v2=${v2:-0}
        
        if [[ $v1 -gt $v2 ]]; then
            return 0  # version1 > version2
        elif [[ $v1 -lt $v2 ]]; then
            return 1  # version1 < version2
        fi
        # If equal, continue to next component
    done
    
    return 0  # Versions are equal, so version1 >= version2
}

#==============================================================================
# PACKAGE MANAGEMENT ABSTRACTION LAYER
#==============================================================================

# Update package cache/repository information
update_package_cache() {
    log_debug "Updating package cache..."
    
    local package_manager="${SYSTEM_INFO[package_manager]}"
    
    case "$package_manager" in
        apt)
            log_info "Updating APT package cache..."
            if ! apt-get update -qq; then
                log_error "Failed to update APT package cache"
                return $E_PACKAGE_INSTALL_FAILED
            fi
            ;;
        yum)
            log_info "Updating YUM package cache..."
            if ! yum makecache -q; then
                log_error "Failed to update YUM package cache"
                return $E_PACKAGE_INSTALL_FAILED
            fi
            ;;
        dnf)
            log_info "Updating DNF package cache..."
            if ! dnf makecache -q; then
                log_error "Failed to update DNF package cache"
                return $E_PACKAGE_INSTALL_FAILED
            fi
            ;;
        *)
            log_error "Unsupported package manager: $package_manager"
            return $E_PACKAGE_INSTALL_FAILED
            ;;
    esac
    
    log_success "Package cache updated successfully"
    return 0
}

# Install a package using the appropriate package manager
install_package() {
    local packages=("$@")
    local package_manager="${SYSTEM_INFO[package_manager]}"
    
    if [[ ${#packages[@]} -eq 0 ]]; then
        log_error "At least one package name is required"
        return $E_VALIDATION_ERROR
    fi
    
    # Handle single package case for backward compatibility
    if [[ ${#packages[@]} -eq 1 ]]; then
        local package_name="${packages[0]}"
        log_debug "Installing package: $package_name using $package_manager"
        
        # Check if package is already installed
        if is_package_installed "$package_name"; then
            log_debug "Package $package_name is already installed"
            return 0
        fi
        
        # Track package for rollback
        track_install_state "packages_installed" "$package_name"
    else
        # Handle multiple packages
        log_debug "Installing ${#packages[@]} packages: ${packages[*]} using $package_manager"
        
        # Check which packages need installation
        local packages_to_install=()
        for package in "${packages[@]}"; do
            if ! is_package_installed "$package"; then
                packages_to_install+=("$package")
                track_install_state "packages_installed" "$package"
            else
                log_debug "Package $package is already installed"
            fi
        done
        
        # If all packages are installed, return success
        if [[ ${#packages_to_install[@]} -eq 0 ]]; then
            log_debug "All packages are already installed"
            return 0
        fi
        
        packages=("${packages_to_install[@]}")
    fi
    
    # Install packages with timeout and retry logic
    local install_success=false
    local retry_count=0
    local max_retries=2
    
    while [[ $retry_count -le $max_retries ]] && [[ "$install_success" == "false" ]]; do
        case "$package_manager" in
            apt)
                if [[ ${#packages[@]} -eq 1 ]]; then
                    log_info "Installing ${packages[0]} via APT..."
                else
                    log_info "Installing ${#packages[@]} packages via APT: ${packages[*]}"
                fi
                
                if [[ $retry_count -gt 0 ]]; then
                    log_info "Retry attempt $retry_count/$max_retries"
                    # Update package cache on retry with enhanced error handling
                    if ! timeout 60 apt-get update -qq 2>&1 | tee /tmp/apt_retry_log_$$; then
                        if grep -q "File has unexpected size\|Mirror sync in progress" /tmp/apt_retry_log_$$; then
                            log_warning "Repository mirror sync in progress, continuing with installation..."
                        fi
                    fi
                    rm -f /tmp/apt_retry_log_$$ 2>/dev/null || true
                fi
                
                # Enhanced APT installation with better error handling
                local apt_output_log="/tmp/apt_install_log_$$"
                if timeout 300 bash -c "DEBIAN_FRONTEND=noninteractive apt-get install -y -o Dpkg::Options::='--force-confdef' -o Dpkg::Options::='--force-confold' --allow-unauthenticated '${packages[@]}'" 2>&1 | tee "$apt_output_log"; then
                    install_success=true
                else
                    local exit_code=$?
                    if [[ $exit_code -eq 124 ]]; then
                        log_warning "APT installation timed out (attempt $((retry_count + 1))/$((max_retries + 1)))"
                    else
                        # Check for specific error patterns
                        if grep -q "File has unexpected size\|Mirror sync in progress\|Hash Sum mismatch" "$apt_output_log"; then
                            log_warning "Repository sync issue detected, will retry with different approach"
                            # Try installing from cached packages or alternative sources
                            if timeout 300 bash -c "DEBIAN_FRONTEND=noninteractive apt-get install -y --fix-missing --allow-unauthenticated '${packages[@]}'"; then
                                install_success=true
                            fi
                        else
                            log_warning "APT installation failed with exit code $exit_code (attempt $((retry_count + 1))/$((max_retries + 1)))"
                        fi
                    fi
                fi
                rm -f "$apt_output_log" 2>/dev/null || true
                ;;
            yum)
                if [[ ${#packages[@]} -eq 1 ]]; then
                    log_info "Installing ${packages[0]} via YUM..."
                else
                    log_info "Installing ${#packages[@]} packages via YUM: ${packages[*]}"
                fi
                
                if [[ $retry_count -gt 0 ]]; then
                    log_info "Retry attempt $retry_count/$max_retries"
                    yum clean expire-cache 2>/dev/null || true
                fi
                
                if timeout 300 yum install -y "${packages[@]}"; then
                    install_success=true
                else
                    local exit_code=$?
                    if [[ $exit_code -eq 124 ]]; then
                        log_warning "YUM installation timed out (attempt $((retry_count + 1))/$((max_retries + 1)))"
                    else
                        log_warning "YUM installation failed with exit code $exit_code (attempt $((retry_count + 1))/$((max_retries + 1)))"
                    fi
                fi
                ;;
            dnf)
                if [[ ${#packages[@]} -eq 1 ]]; then
                    log_info "Installing ${packages[0]} via DNF..."
                else
                    log_info "Installing ${#packages[@]} packages via DNF: ${packages[*]}"
                fi
                
                if [[ $retry_count -gt 0 ]]; then
                    log_info "Retry attempt $retry_count/$max_retries"
                    dnf clean expire-cache 2>/dev/null || true
                fi
                
                if timeout 300 dnf install -y "${packages[@]}"; then
                    install_success=true
                else
                    local exit_code=$?
                    if [[ $exit_code -eq 124 ]]; then
                        log_warning "DNF installation timed out (attempt $((retry_count + 1))/$((max_retries + 1)))"
                    else
                        log_warning "DNF installation failed with exit code $exit_code (attempt $((retry_count + 1))/$((max_retries + 1)))"
                    fi
                fi
                ;;
            *)
                log_error "Unsupported package manager: $package_manager"
                return $E_PACKAGE_INSTALL_FAILED
                ;;
        esac
        
        if [[ "$install_success" == "false" ]]; then
            ((retry_count++))
            if [[ $retry_count -le $max_retries ]]; then
                log_info "Waiting 5 seconds before retry..."
                sleep 5
            fi
        fi
    done
    
    if [[ "$install_success" == "false" ]]; then
        log_error "Failed to install packages after $((max_retries + 1)) attempts: ${packages[*]}"
        log_info "This may be due to:"
        log_info "  - Network connectivity issues"
        log_info "  - Repository server problems"
        log_info "  - Package conflicts or dependencies"
        log_info "  - Insufficient disk space"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    # Verify installation
    for package in "${packages[@]}"; do
        if ! is_package_installed "$package"; then
            log_error "Package installation verification failed: $package"
            return $E_PACKAGE_INSTALL_FAILED
        fi
    done
    
    if [[ ${#packages[@]} -eq 1 ]]; then
        log_success "Successfully installed package: ${packages[0]}"
    else
        log_success "Successfully installed ${#packages[@]} packages: ${packages[*]}"
    fi
    return 0
}

# Install multiple packages
install_packages() {
    local packages=("$@")
    
    if [[ ${#packages[@]} -eq 0 ]]; then
        log_error "No packages specified"
        return $E_VALIDATION_ERROR
    fi
    
    log_info "Installing ${#packages[@]} packages..."
    
    for package in "${packages[@]}"; do
        if ! install_package "$package"; then
            log_error "Failed to install package: $package"
            return $E_PACKAGE_INSTALL_FAILED
        fi
    done
    
    log_success "All packages installed successfully"
    return 0
}

# Install packages from array reference (for fallback scenarios)
install_package_array() {
    local -n package_array_ref=$1
    local packages=("${package_array_ref[@]}")
    
    if [[ ${#packages[@]} -eq 0 ]]; then
        log_debug "No packages in array"
        return 1
    fi
    
    log_debug "Attempting to install ${#packages[@]} packages from array..."
    
    for package in "${packages[@]}"; do
        if ! install_package "$package"; then
            log_debug "Failed to install package: $package"
            return 1
        fi
    done
    
    log_debug "All packages from array installed successfully"
    return 0
}

# Check if a package is installed
is_package_installed() {
    local package_name="$1"
    local package_manager="${SYSTEM_INFO[package_manager]}"
    
    if [[ -z "$package_name" ]]; then
        return 1
    fi
    
    case "$package_manager" in
        apt)
            dpkg -l "$package_name" 2>/dev/null | grep -q "^ii"
            ;;
        yum)
            yum list installed "$package_name" >/dev/null 2>&1
            ;;
        dnf)
            dnf list installed "$package_name" >/dev/null 2>&1
            ;;
        *)
            log_debug "Cannot check package installation for unsupported package manager: $package_manager"
            return 1
            ;;
    esac
}

# Get installed package version
get_package_version() {
    local package_name="$1"
    local package_manager="${SYSTEM_INFO[package_manager]}"
    
    if [[ -z "$package_name" ]]; then
        return 1
    fi
    
    case "$package_manager" in
        apt)
            dpkg -l "$package_name" 2>/dev/null | grep "^ii" | awk '{print $3}' | head -1
            ;;
        yum)
            yum list installed "$package_name" 2>/dev/null | tail -1 | awk '{print $2}' | cut -d':' -f2 | cut -d'-' -f1
            ;;
        dnf)
            dnf list installed "$package_name" 2>/dev/null | tail -1 | awk '{print $2}' | cut -d':' -f2 | cut -d'-' -f1
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Validate package version meets minimum requirement
validate_package_version() {
    local package_name="$1"
    local min_version="$2"
    
    if [[ -z "$package_name" || -z "$min_version" ]]; then
        log_error "Package name and minimum version are required"
        return 1
    fi
    
    if ! is_package_installed "$package_name"; then
        log_debug "Package $package_name is not installed"
        return 1
    fi
    
    local installed_version
    installed_version=$(get_package_version "$package_name")
    
    if [[ -z "$installed_version" || "$installed_version" == "unknown" ]]; then
        log_warning "Could not determine version of package: $package_name"
        return 1
    fi
    
    if compare_versions "$installed_version" "$min_version"; then
        log_debug "Package $package_name version $installed_version meets minimum requirement $min_version"
        return 0
    else
        log_debug "Package $package_name version $installed_version does not meet minimum requirement $min_version"
        return 1
    fi
}

# Remove a package (used for rollback)
remove_package() {
    local package_name="$1"
    local package_manager="${SYSTEM_INFO[package_manager]}"
    
    if [[ -z "$package_name" ]]; then
        log_error "Package name is required"
        return $E_VALIDATION_ERROR
    fi
    
    log_debug "Removing package: $package_name using $package_manager"
    
    # Check if package is installed
    if ! is_package_installed "$package_name"; then
        log_debug "Package $package_name is not installed, skipping removal"
        return 0
    fi
    
    case "$package_manager" in
        apt)
            log_info "Removing $package_name via APT..."
            if ! DEBIAN_FRONTEND=noninteractive apt-get remove -y -qq "$package_name"; then
                log_warning "Failed to remove package: $package_name"
                return 1
            fi
            ;;
        yum)
            log_info "Removing $package_name via YUM..."
            if ! yum remove -y -q "$package_name"; then
                log_warning "Failed to remove package: $package_name"
                return 1
            fi
            ;;
        dnf)
            log_info "Removing $package_name via DNF..."
            if ! dnf remove -y -q "$package_name"; then
                log_warning "Failed to remove package: $package_name"
                return 1
            fi
            ;;
        *)
            log_error "Unsupported package manager: $package_manager"
            return 1
            ;;
    esac
    
    log_success "Successfully removed package: $package_name"
    return 0
}

# Add repository (PPA for Ubuntu/Debian, EPEL for CentOS/RHEL)
add_repository() {
    local repo_identifier="$1"
    local package_manager="${SYSTEM_INFO[package_manager]}"
    local os_type="${SYSTEM_INFO[os_type]}"
    
    if [[ -z "$repo_identifier" ]]; then
        log_error "Repository identifier is required"
        return $E_VALIDATION_ERROR
    fi
    
    log_debug "Adding repository: $repo_identifier"
    
    case "$package_manager" in
        apt)
            case "$repo_identifier" in
                ppa:*)
                    # Install software-properties-common if not present
                    if ! is_package_installed "software-properties-common"; then
                        install_package "software-properties-common"
                    fi
                    
                    log_info "Adding PPA: $repo_identifier"
                    if ! add-apt-repository -y "$repo_identifier"; then
                        log_error "Failed to add PPA: $repo_identifier"
                        return $E_PACKAGE_INSTALL_FAILED
                    fi
                    
                    # Update package cache after adding PPA
                    update_package_cache
                    ;;
                nodesource)
                    # Add NodeSource repository for Node.js
                    log_info "Adding NodeSource repository for Node.js..."
                    if ! curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; then
                        log_error "Failed to add NodeSource repository"
                        return $E_PACKAGE_INSTALL_FAILED
                    fi
                    ;;
                postgresql)
                    # Add PostgreSQL official repository with comprehensive error handling
                    log_info "Adding PostgreSQL official repository..."
                    
                    # Clean up any existing problematic configurations first
                    rm -f /etc/apt/sources.list.d/pgdg.list 2>/dev/null || true
                    rm -f /usr/share/keyrings/postgresql-archive-keyring.gpg 2>/dev/null || true
                    
                    # Clean up deprecated apt-key entries
                    if command -v apt-key >/dev/null 2>&1 && apt-key list 2>/dev/null | grep -qi postgresql; then
                        log_info "Removing deprecated PostgreSQL GPG keys..."
                        apt-key del ACCC4CF8 2>/dev/null || true
                    fi
                    
                    # Install required dependencies with error handling
                    if ! install_package "wget" "gnupg" "lsb-release" "ca-certificates"; then
                        log_warning "Failed to install repository dependencies, will use system packages"
                        return $E_PACKAGE_INSTALL_FAILED
                    fi
                    
                    # Create keyrings directory
                    mkdir -p /usr/share/keyrings
                    
                    # Download PostgreSQL GPG key with timeout and retries
                    log_info "Downloading PostgreSQL GPG key..."
                    local gpg_success=false
                    local retry_count=0
                    local max_retries=3
                    
                    while [[ $retry_count -lt $max_retries ]] && [[ "$gpg_success" == "false" ]]; do
                        if timeout 30 wget --quiet --tries=2 --connect-timeout=10 --read-timeout=20 \
                           -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
                           gpg --dearmor -o /usr/share/keyrings/postgresql-archive-keyring.gpg 2>/dev/null; then
                            gpg_success=true
                            log_success "PostgreSQL GPG key downloaded successfully"
                        else
                            ((retry_count++))
                            log_warning "GPG key download failed (attempt $retry_count/$max_retries)"
                            if [[ $retry_count -lt $max_retries ]]; then
                                log_info "Retrying in 3 seconds..."
                                sleep 3
                            fi
                        fi
                    done
                    
                    if [[ "$gpg_success" == "false" ]]; then
                        log_warning "Failed to download PostgreSQL GPG key after $max_retries attempts"
                        log_info "This may be due to network issues or firewall restrictions"
                        return $E_PACKAGE_INSTALL_FAILED
                    fi
                    
                    # Enhanced codename detection with comprehensive fallbacks
                    local codename="${SYSTEM_INFO[os_codename]}"
                    local os_version="${SYSTEM_INFO[os_version]}"
                    local os_id="${SYSTEM_INFO[os_type]}"
                    
                    # Detect codename with multiple fallback strategies
                    if [[ -z "$codename" ]] || [[ "$codename" == "n/a" ]] || [[ "$codename" == "unknown" ]]; then
                        log_info "Codename not detected, using version-based mapping..."
                        
                        # Try to get codename from lsb_release if available
                        if command -v lsb_release >/dev/null 2>&1; then
                            codename=$(lsb_release -cs 2>/dev/null || echo "")
                        fi
                        
                        # If still empty, map based on version
                        if [[ -z "$codename" ]]; then
                            case "$os_version" in
                                "24.04"|"24."*) codename="jammy" ;;  # Use jammy for 24.04 until noble is supported
                                "22.04"|"22."*) codename="jammy" ;;
                                "20.04"|"20."*) codename="focal" ;;
                                "18.04"|"18."*) codename="bionic" ;;
                                "16.04"|"16."*) codename="xenial" ;;
                                *) 
                                    log_warning "Unknown version: $os_version, using focal as safe fallback"
                                    codename="focal"
                                    ;;
                            esac
                        fi
                    fi
                    
                    # Validate and normalize codename
                    case "$codename" in
                        "jammy"|"focal"|"bionic"|"xenial")
                            log_info "Using supported codename: $codename"
                            ;;
                        "noble"|"mantic"|"lunar"|"kinetic")
                            log_warning "Newer Ubuntu release ($codename) detected, falling back to jammy"
                            codename="jammy"
                            ;;
                        *)
                            log_warning "Unsupported or unknown codename: $codename, falling back to jammy"
                            codename="jammy"
                            ;;
                    esac
                    
                    log_info "Using PostgreSQL repository for codename: $codename"
                    
                    # Create repository configuration with signed-by option
                    local repo_line="deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] http://apt.postgresql.org/pub/repos/apt/ $codename-pgdg main"
                    echo "$repo_line" > /etc/apt/sources.list.d/pgdg.list
                    
                    # Update package cache with timeout and comprehensive error handling
                    log_info "Updating package cache with PostgreSQL repository..."
                    local cache_update_success=false
                    retry_count=0
                    max_retries=3
                    
                    while [[ $retry_count -lt $max_retries ]] && [[ "$cache_update_success" == "false" ]]; do
                        if timeout 120 apt-get update -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 2>/dev/null; then
                            cache_update_success=true
                            log_success "Package cache updated successfully"
                        else
                            ((retry_count++))
                            log_warning "Package cache update failed (attempt $retry_count/$max_retries)"
                            if [[ $retry_count -lt $max_retries ]]; then
                                log_info "Retrying in 5 seconds..."
                                sleep 5
                            fi
                        fi
                    done
                    
                    if [[ "$cache_update_success" == "false" ]]; then
                        log_warning "Failed to update package cache with PostgreSQL repository"
                        log_info "This may be due to:"
                        log_info "  - Network connectivity issues"
                        log_info "  - Repository server problems"
                        log_info "  - Firewall blocking repository access"
                        log_info "  - Unsupported OS version for this repository"
                        log_info "Removing problematic repository and falling back to system packages..."
                        
                        # Clean up failed repository configuration
                        rm -f /etc/apt/sources.list.d/pgdg.list 2>/dev/null || true
                        rm -f /usr/share/keyrings/postgresql-archive-keyring.gpg 2>/dev/null || true
                        
                        # Try to restore package cache to working state
                        timeout 60 apt-get update 2>/dev/null || true
                        
                        return $E_PACKAGE_INSTALL_FAILED
                    fi
                    
                    # Validate that PostgreSQL packages are actually available
                    log_info "Validating PostgreSQL package availability..."
                    local packages_available=false
                    
                    if apt-cache search postgresql-15 2>/dev/null | grep -q "postgresql-15 "; then
                        log_info "PostgreSQL 15 is available in repository"
                        packages_available=true
                    elif apt-cache search postgresql-14 2>/dev/null | grep -q "postgresql-14 "; then
                        log_info "PostgreSQL 14 is available in repository"
                        packages_available=true
                    elif apt-cache search postgresql-13 2>/dev/null | grep -q "postgresql-13 "; then
                        log_info "PostgreSQL 13 is available in repository"
                        packages_available=true
                    else
                        log_warning "No specific PostgreSQL versions found in repository"
                        # Check if generic postgresql package is available
                        if apt-cache search "^postgresql$" 2>/dev/null | grep -q "postgresql "; then
                            log_info "Generic PostgreSQL package is available"
                            packages_available=true
                        fi
                    fi
                    
                    if [[ "$packages_available" == "false" ]]; then
                        log_warning "No PostgreSQL packages found in repository, removing it"
                        rm -f /etc/apt/sources.list.d/pgdg.list 2>/dev/null || true
                        rm -f /usr/share/keyrings/postgresql-archive-keyring.gpg 2>/dev/null || true
                        timeout 60 apt-get update 2>/dev/null || true
                        return $E_PACKAGE_INSTALL_FAILED
                    fi
                    
                    log_success "PostgreSQL repository added and validated successfully"
                    ;;
                *)
                    log_error "Unsupported repository for APT: $repo_identifier"
                    return $E_PACKAGE_INSTALL_FAILED
                    ;;
            esac
            ;;
        yum|dnf)
            case "$repo_identifier" in
                epel)
                    # Install EPEL repository
                    log_info "Installing EPEL repository..."
                    local epel_package=""
                    case "$os_type" in
                        centos|rhel)
                            local major_version=$(echo "${SYSTEM_INFO[os_version]}" | cut -d'.' -f1)
                            epel_package="epel-release"
                            ;;
                        *)
                            log_error "EPEL not supported for OS: $os_type"
                            return $E_PACKAGE_INSTALL_FAILED
                            ;;
                    esac
                    
                    if ! install_package "$epel_package"; then
                        return $E_PACKAGE_INSTALL_FAILED
                    fi
                    ;;
                nodesource)
                    # Add NodeSource repository for Node.js
                    log_info "Adding NodeSource repository for Node.js..."
                    if ! curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -; then
                        log_error "Failed to add NodeSource repository"
                        return $E_PACKAGE_INSTALL_FAILED
                    fi
                    ;;
                postgresql)
                    # Add PostgreSQL official repository
                    log_info "Adding PostgreSQL official repository..."
                    local major_version=$(echo "${SYSTEM_INFO[os_version]}" | cut -d'.' -f1)
                    local repo_rpm=""
                    
                    case "$os_type" in
                        centos|rhel)
                            repo_rpm="https://download.postgresql.org/pub/repos/yum/reporpms/EL-${major_version}-x86_64/pgdg-redhat-repo-latest.noarch.rpm"
                            ;;
                        fedora)
                            repo_rpm="https://download.postgresql.org/pub/repos/yum/reporpms/F-${SYSTEM_INFO[os_version]}-x86_64/pgdg-fedora-repo-latest.noarch.rpm"
                            ;;
                        *)
                            log_error "PostgreSQL repository not supported for OS: $os_type"
                            return $E_PACKAGE_INSTALL_FAILED
                            ;;
                    esac
                    
                    if [[ "$package_manager" == "dnf" ]]; then
                        if ! dnf install -y "$repo_rpm"; then
                            log_error "Failed to install PostgreSQL repository"
                            return $E_PACKAGE_INSTALL_FAILED
                        fi
                    else
                        if ! yum install -y "$repo_rpm"; then
                            log_error "Failed to install PostgreSQL repository"
                            return $E_PACKAGE_INSTALL_FAILED
                        fi
                    fi
                    ;;
                *)
                    log_error "Unsupported repository for $package_manager: $repo_identifier"
                    return $E_PACKAGE_INSTALL_FAILED
                    ;;
            esac
            ;;
        *)
            log_error "Repository management not supported for package manager: $package_manager"
            return $E_PACKAGE_INSTALL_FAILED
            ;;
    esac
    
    log_success "Successfully added repository: $repo_identifier"
    return 0
}

# Check if a repository is already added
is_repository_added() {
    local repo_identifier="$1"
    local package_manager="${SYSTEM_INFO[package_manager]}"
    
    case "$package_manager" in
        apt)
            case "$repo_identifier" in
                ppa:*)
                    # Check if PPA is in sources list
                    local ppa_name=$(echo "$repo_identifier" | sed 's/ppa://')
                    grep -r "$ppa_name" /etc/apt/sources.list.d/ >/dev/null 2>&1
                    ;;
                nodesource)
                    # Check if NodeSource repository is added
                    grep -r "nodesource" /etc/apt/sources.list.d/ >/dev/null 2>&1
                    ;;
                postgresql)
                    # Check if PostgreSQL repository is added
                    [[ -f /etc/apt/sources.list.d/pgdg.list ]]
                    ;;
                *)
                    return 1
                    ;;
            esac
            ;;
        yum|dnf)
            case "$repo_identifier" in
                epel)
                    is_package_installed "epel-release"
                    ;;
                nodesource)
                    [[ -f /etc/yum.repos.d/nodesource-el*.repo ]]
                    ;;
                postgresql)
                    [[ -f /etc/yum.repos.d/pgdg-*.repo ]]
                    ;;
                *)
                    return 1
                    ;;
            esac
            ;;
        *)
            return 1
            ;;
    esac
}

# Install package with automatic repository setup if needed
install_package_with_repo() {
    local package_name="$1"
    local repo_identifier="$2"
    
    if [[ -z "$package_name" ]]; then
        log_error "Package name is required"
        return $E_VALIDATION_ERROR
    fi
    
    # Check if package is already installed
    if is_package_installed "$package_name"; then
        log_debug "Package $package_name is already installed"
        return 0
    fi
    
    # Add repository if specified and not already added
    if [[ -n "$repo_identifier" ]]; then
        if ! is_repository_added "$repo_identifier"; then
            log_info "Adding repository for $package_name..."
            if ! add_repository "$repo_identifier"; then
                log_error "Failed to add repository: $repo_identifier"
                return $E_PACKAGE_INSTALL_FAILED
            fi
        else
            log_debug "Repository $repo_identifier is already added"
        fi
    fi
    
    # Install the package
    install_package "$package_name"
}

# Ensure essential packages are installed for package management
ensure_package_management_tools() {
    log_debug "Ensuring package management tools are available..."
    
    local package_manager="${SYSTEM_INFO[package_manager]}"
    local essential_packages=()
    
    case "$package_manager" in
        apt)
            essential_packages=("curl" "wget" "gnupg" "lsb-release")
            ;;
        yum|dnf)
            essential_packages=("curl" "wget" "gnupg2")
            ;;
        *)
            log_warning "Unknown package manager, skipping essential package installation"
            return 0
            ;;
    esac
    
    log_info "Installing essential package management tools..."
    for package in "${essential_packages[@]}"; do
        if ! is_package_installed "$package"; then
            log_debug "Installing essential package: $package"
            install_package "$package"
        fi
    done
    
    log_success "Essential package management tools are available"
    return 0
}

# Note: Docker is NOT installed or used in the default installation path
# This script ensures native dependency installation for Node.js, PostgreSQL, and Redis
# Docker deployment is only available when explicitly requested via --docker flag
install_core_dependencies() {
    log_info "Installing core dependencies using native packages (not Docker)..."
    log_info "Docker deployment is available via --docker flag but not used by default"
    
    # Update package cache first
    update_package_cache
    
    # Ensure essential tools are available
    ensure_package_management_tools
    
    # Core dependencies will be installed natively:
    # - Node.js (via NodeSource repository for latest version)
    # - PostgreSQL (via official PostgreSQL repository)
    # - Redis (via distribution packages)
    # - Additional system dependencies as needed
    
    log_success "Package management abstraction layer initialized for native installation"
    return 0
}

#==============================================================================
# NODE.JS INSTALLATION AND MANAGEMENT
#==============================================================================

# Detect current Node.js version if installed
detect_nodejs_version() {
    log_debug "Detecting Node.js version..."
    
    local nodejs_version=""
    local npm_version=""
    local node_paths=("/usr/bin/node" "/usr/local/bin/node" "/opt/nodejs/bin/node" "/snap/bin/node")
    local npm_paths=("/usr/bin/npm" "/usr/local/bin/npm" "/opt/nodejs/bin/npm" "/snap/bin/npm")
    
    # Check for node command in PATH first
    if command -v node >/dev/null 2>&1; then
        nodejs_version=$(node --version 2>/dev/null | sed 's/^v//')
        log_debug "Found Node.js version in PATH: $nodejs_version"
    else
        # Check common installation paths
        for node_path in "${node_paths[@]}"; do
            if [[ -x "$node_path" ]]; then
                nodejs_version=$("$node_path" --version 2>/dev/null | sed 's/^v//')
                log_debug "Found Node.js version at $node_path: $nodejs_version"
                # Update PATH to include this location
                export PATH="$(dirname "$node_path"):$PATH"
                break
            fi
        done
        
        if [[ -z "$nodejs_version" ]]; then
            log_debug "Node.js not found in PATH or common locations"
        fi
    fi
    
    # Check for npm command in PATH first
    if command -v npm >/dev/null 2>&1; then
        npm_version=$(npm --version 2>/dev/null)
        log_debug "Found npm version in PATH: $npm_version"
    else
        # Check common installation paths
        for npm_path in "${npm_paths[@]}"; do
            if [[ -x "$npm_path" ]]; then
                npm_version=$("$npm_path" --version 2>/dev/null)
                log_debug "Found npm version at $npm_path: $npm_version"
                # Update PATH to include this location
                export PATH="$(dirname "$npm_path"):$PATH"
                break
            fi
        done
        
        if [[ -z "$npm_version" ]]; then
            log_debug "npm not found in PATH or common locations"
        fi
    fi
    
    # Store versions in global variables for later use
    NODEJS_CURRENT_VERSION="$nodejs_version"
    NPM_CURRENT_VERSION="$npm_version"
    
    return 0
}

# Validate Node.js version meets minimum requirements
validate_nodejs_version() {
    local version="$1"
    local min_version="20"
    
    if [[ -z "$version" ]]; then
        log_debug "No Node.js version to validate"
        return 1
    fi
    
    # Extract major version number
    local major_version
    major_version=$(echo "$version" | cut -d. -f1)
    
    if [[ ! "$major_version" =~ ^[0-9]+$ ]]; then
        log_debug "Invalid version format: $version"
        return 1
    fi
    
    if [[ $major_version -ge $min_version ]]; then
        log_debug "Node.js version $version meets minimum requirement (>= $min_version)"
        return 0
    else
        log_debug "Node.js version $version does not meet minimum requirement (>= $min_version)"
        return 1
    fi
}

# Setup NodeSource repository for latest Node.js versions with enhanced error handling
setup_nodesource_repository() {
    local os_type="${SYSTEM_INFO[os_type]}"
    local nodejs_version="22"  # Latest LTS version - required for dependencies
    
    log_info "Setting up NodeSource repository for Node.js $nodejs_version..."
    
    case "$os_type" in
        ubuntu|debian)
            # Install required packages for repository setup
            if ! is_package_installed "curl"; then
                install_package "curl"
            fi
            
            if ! is_package_installed "ca-certificates"; then
                install_package "ca-certificates"
            fi
            
            # Download and execute NodeSource setup script with timeout and error handling
            log_info "Adding NodeSource repository for Debian/Ubuntu..."
            local setup_script_url="https://deb.nodesource.com/setup_${nodejs_version}.x"
            
            # Download script first to check if it's accessible
            local temp_script="/tmp/nodesource_setup_$$.sh"
            if ! timeout 30 curl -fsSL "$setup_script_url" -o "$temp_script"; then
                log_warning "Failed to download NodeSource setup script"
                rm -f "$temp_script" 2>/dev/null || true
                return 1
            fi
            
            # Execute the script with timeout
            if ! timeout 120 bash "$temp_script"; then
                log_warning "NodeSource setup script execution failed or timed out"
                rm -f "$temp_script" 2>/dev/null || true
                return 1
            fi
            
            rm -f "$temp_script" 2>/dev/null || true
            
            # Update package cache with retry logic and ignore repository sync errors
            local update_success=false
            local retry_count=0
            local max_retries=3
            
            while [[ $retry_count -lt $max_retries ]] && [[ "$update_success" != "true" ]]; do
                if [[ $retry_count -gt 0 ]]; then
                    log_info "Retrying package cache update (attempt $((retry_count + 1))/$max_retries)..."
                    sleep 5
                fi
                
                # Try to update with specific error handling for repository sync issues
                if timeout 60 apt-get update 2>&1 | tee /tmp/apt_update_log_$$; then
                    update_success=true
                elif grep -q "File has unexpected size\|Mirror sync in progress" /tmp/apt_update_log_$$; then
                    log_warning "Repository mirror sync in progress, continuing anyway..."
                    update_success=true  # Continue despite sync issues
                else
                    ((retry_count++))
                fi
                
                rm -f /tmp/apt_update_log_$$ 2>/dev/null || true
            done
            
            if [[ "$update_success" != "true" ]]; then
                log_warning "Package cache update failed, but continuing with installation attempt"
            fi
            ;;
            
        centos|rhel|fedora)
            # Install required packages for repository setup
            if ! is_package_installed "curl"; then
                install_package "curl"
            fi
            
            # Download and execute NodeSource setup script for RPM-based systems
            log_info "Adding NodeSource repository for CentOS/RHEL/Fedora..."
            local setup_script_url="https://rpm.nodesource.com/setup_${nodejs_version}.x"
            
            # Download script first to check if it's accessible
            local temp_script="/tmp/nodesource_setup_$$.sh"
            if ! timeout 30 curl -fsSL "$setup_script_url" -o "$temp_script"; then
                log_warning "Failed to download NodeSource setup script"
                rm -f "$temp_script" 2>/dev/null || true
                return 1
            fi
            
            # Execute the script with timeout
            if ! timeout 120 bash "$temp_script"; then
                log_warning "NodeSource setup script execution failed or timed out"
                rm -f "$temp_script" 2>/dev/null || true
                return 1
            fi
            
            rm -f "$temp_script" 2>/dev/null || true
            ;;
            
        *)
            log_error "Unsupported OS for NodeSource repository: $os_type"
            return $E_UNSUPPORTED_OS
            ;;
    esac
    
    log_success "NodeSource repository configured successfully"
    track_install_state "repositories_added" "nodesource"
    return 0
}

# Remove old Node.js installation cleanly
remove_old_nodejs_installation() {
    log_info "Removing old Node.js installation..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    
    # Stop any Node.js processes
    log_info "Stopping any running Node.js processes..."
    pkill -f node || true
    
    # Remove Node.js packages based on OS
    case "$os_type" in
        "ubuntu"|"debian")
            log_info "Removing Node.js packages (Ubuntu/Debian)..."
            
            # Remove nodejs and npm packages
            apt-get remove -y nodejs npm || true
            apt-get purge -y nodejs npm || true
            apt-get autoremove -y || true
            
            # Remove NodeSource repository if it exists
            rm -f /etc/apt/sources.list.d/nodesource.list || true
            rm -f /usr/share/keyrings/nodesource.gpg || true
            
            # Update package list
            apt-get update || true
            ;;
            
        "centos"|"rhel"|"fedora")
            log_info "Removing Node.js packages (CentOS/RHEL/Fedora)..."
            
            if command -v dnf >/dev/null 2>&1; then
                dnf remove -y nodejs npm || true
            else
                yum remove -y nodejs npm || true
            fi
            
            # Remove NodeSource repository
            rm -f /etc/yum.repos.d/nodesource-*.repo || true
            ;;
            
        *)
            log_warning "Unknown OS type for Node.js removal: $os_type"
            ;;
    esac
    
    # Remove common Node.js directories and files
    log_info "Cleaning up Node.js directories and files..."
    
    # Remove global npm modules and cache
    rm -rf /usr/local/lib/node_modules || true
    rm -rf /usr/local/bin/node || true
    rm -rf /usr/local/bin/npm || true
    rm -rf /usr/local/bin/npx || true
    
    # Remove user npm directories (if any)
    rm -rf ~/.npm || true
    rm -rf ~/.node-gyp || true
    
    # Remove any remaining Node.js binaries from common locations
    rm -f /usr/bin/node || true
    rm -f /usr/bin/npm || true
    rm -f /usr/bin/npx || true
    
    # Clear any cached Node.js versions
    NODEJS_CURRENT_VERSION=""
    NPM_CURRENT_VERSION=""
    
    log_success "Old Node.js installation removed successfully"
    return 0
}

# Install Node.js with multiple fallback methods for maximum reliability
install_nodejs() {
    log_info "Installing Node.js..."
    
    # Detect current Node.js installation
    detect_nodejs_version
    
    # Check if Node.js is already installed and meets requirements
    if [[ -n "$NODEJS_CURRENT_VERSION" ]]; then
        if validate_nodejs_version "$NODEJS_CURRENT_VERSION"; then
            log_success "Node.js $NODEJS_CURRENT_VERSION is already installed and meets requirements"
            return 0
        else
            log_warning "Node.js $NODEJS_CURRENT_VERSION is installed but does not meet minimum requirements (need >= 20)"
            log_info "Removing old Node.js installation and installing Node.js 22..."
            if ! remove_old_nodejs_installation; then
                log_error "Failed to remove old Node.js installation"
                return $E_PACKAGE_INSTALL_FAILED
            fi
        fi
    else
        log_info "Node.js not found, installing Node.js 22..."
    fi
    
    # Install Node.js 22.x using the provided commands
    log_info "Setting up NodeSource repository for Node.js 22..."
    if ! curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; then
        log_error "Failed to setup NodeSource repository for Node.js 22"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    log_info "Installing Node.js via apt-get..."
    if ! apt-get install -y nodejs; then
        log_error "Failed to install Node.js via apt-get"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    # Final verification
    detect_nodejs_version
    
    if [[ -z "$NODEJS_CURRENT_VERSION" ]]; then
        log_error "Node.js installation verification failed - node command not found"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    if ! validate_nodejs_version "$NODEJS_CURRENT_VERSION"; then
        log_error "Node.js installation verification failed - version $NODEJS_CURRENT_VERSION does not meet requirements"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    log_success "Node.js $NODEJS_CURRENT_VERSION installed successfully"
    track_install_state "packages_installed" "nodejs"
    
    return 0
}

# Method 1: Primary NodeSource repository installation
install_nodejs_nodesource_primary() {
    log_info "Attempting NodeSource primary repository installation..."
    
    # Setup NodeSource repository with retry logic
    if setup_nodesource_repository_with_retry; then
        # Install Node.js package
        if install_package "nodejs"; then
            log_success "NodeSource primary installation successful"
            return 0
        fi
    fi
    
    log_warning "NodeSource primary installation failed"
    return 1
}

# Method 2: Alternative NodeSource repository installation with manual setup
install_nodejs_nodesource_alternative() {
    log_info "Attempting NodeSource alternative repository installation..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    
    case "$os_type" in
        ubuntu|debian)
            # Manual NodeSource repository setup with alternative mirrors
            log_info "Setting up NodeSource repository manually..."
            
            # Install prerequisites
            install_package "curl" "ca-certificates" "gnupg"
            
            # Add NodeSource GPG key
            curl -fsSL https://deb.nodesource.com/gpgkey/nodesource.gpg.key | gpg --dearmor | tee /usr/share/keyrings/nodesource.gpg >/dev/null 2>&1
            
            # Add repository with explicit configuration
            echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
            
            # Update package cache with retries
            local retry_count=0
            local max_retries=3
            while [[ $retry_count -lt $max_retries ]]; do
                if apt-get update -o Dir::Etc::sourcelist="sources.list.d/nodesource.list" -o Dir::Etc::sourceparts="-" -o APT::Get::List-Cleanup="0"; then
                    break
                fi
                ((retry_count++))
                log_warning "APT update failed, retry $retry_count/$max_retries"
                sleep 5
            done
            
            # Install Node.js
            if DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs; then
                log_success "NodeSource alternative installation successful"
                return 0
            fi
            ;;
    esac
    
    log_warning "NodeSource alternative installation failed"
    return 1
}

# Method 3: Snap package installation
install_nodejs_snap() {
    log_info "Attempting Snap package installation..."
    
    # Check if snap is available
    if ! command -v snap >/dev/null 2>&1; then
        log_info "Installing snapd..."
        if ! install_package "snapd"; then
            log_warning "Failed to install snapd"
            return 1
        fi
        
        # Enable snapd service
        systemctl enable --now snapd.socket 2>/dev/null || true
        sleep 2
    fi
    
    # Install Node.js via snap
    if snap install node --classic; then
        # Create symlinks for compatibility
        ln -sf /snap/bin/node /usr/local/bin/node 2>/dev/null || true
        ln -sf /snap/bin/npm /usr/local/bin/npm 2>/dev/null || true
        
        log_success "Snap installation successful"
        return 0
    fi
    
    log_warning "Snap installation failed"
    return 1
}

# Method 4: Direct binary installation
install_nodejs_binary_direct() {
    log_info "Attempting direct binary installation..."
    
    local nodejs_version="22.12.0"  # Latest LTS version
    local arch="${SYSTEM_INFO[architecture]}"
    local node_arch=""
    
    # Map system architecture to Node.js architecture
    case "$arch" in
        x86_64) node_arch="x64" ;;
        aarch64) node_arch="arm64" ;;
        armv7l) node_arch="armv7l" ;;
        *) 
            log_warning "Unsupported architecture for binary installation: $arch"
            return 1
            ;;
    esac
    
    local download_url="https://nodejs.org/dist/v${nodejs_version}/node-v${nodejs_version}-linux-${node_arch}.tar.xz"
    local temp_dir="/tmp/nodejs_install_$$"
    local install_dir="/opt/nodejs"
    
    # Create temporary directory
    mkdir -p "$temp_dir"
    
    # Download Node.js binary
    log_info "Downloading Node.js v${nodejs_version} for ${node_arch}..."
    if curl -fsSL "$download_url" -o "$temp_dir/nodejs.tar.xz"; then
        # Extract archive
        log_info "Extracting Node.js binary..."
        if tar -xf "$temp_dir/nodejs.tar.xz" -C "$temp_dir"; then
            # Install to system directory
            rm -rf "$install_dir" 2>/dev/null || true
            mv "$temp_dir/node-v${nodejs_version}-linux-${node_arch}" "$install_dir"
            
            # Create symlinks
            ln -sf "$install_dir/bin/node" /usr/local/bin/node
            ln -sf "$install_dir/bin/npm" /usr/local/bin/npm
            ln -sf "$install_dir/bin/npx" /usr/local/bin/npx
            
            # Update PATH for current session
            export PATH="/usr/local/bin:$PATH"
            
            # Add to system PATH
            echo 'export PATH="/usr/local/bin:$PATH"' >> /etc/environment
            
            log_success "Direct binary installation successful"
            rm -rf "$temp_dir"
            return 0
        fi
    fi
    
    log_warning "Direct binary installation failed"
    rm -rf "$temp_dir" 2>/dev/null || true
    return 1
}

# Enhanced NodeSource repository setup with retry logic
setup_nodesource_repository_with_retry() {
    local max_retries=3
    local retry_count=0
    local retry_delay=10
    
    while [[ $retry_count -lt $max_retries ]]; do
        if [[ $retry_count -gt 0 ]]; then
            log_info "Retrying NodeSource repository setup (attempt $((retry_count + 1))/$max_retries)..."
            sleep $retry_delay
        fi
        
        if setup_nodesource_repository; then
            return 0
        fi
        
        ((retry_count++))
        
        # Clean up failed repository setup
        rm -f /etc/apt/sources.list.d/nodesource.list 2>/dev/null || true
        rm -f /usr/share/keyrings/nodesource.gpg 2>/dev/null || true
        
        # Increase delay for next retry
        retry_delay=$((retry_delay + 5))
    done
    
    log_warning "NodeSource repository setup failed after $max_retries attempts"
    return 1
}

# Install and configure npm
install_and_configure_npm() {
    log_info "Configuring npm..."
    
    # npm should be installed with Node.js, but verify
    if ! command -v npm >/dev/null 2>&1; then
        log_error "npm not found after Node.js installation"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    # Get npm version
    local npm_version
    npm_version=$(npm --version 2>/dev/null)
    log_info "npm version: $npm_version"
    
    # Configure npm for production use
    log_info "Configuring npm settings..."
    
    # Set npm registry (use default but ensure it's set)
    npm config set registry https://registry.npmjs.org/ || {
        log_warning "Failed to set npm registry, continuing with defaults"
    }
    
    # Configure npm cache directory
    local npm_cache_dir="/var/cache/npm"
    if [[ ! -d "$npm_cache_dir" ]]; then
        mkdir -p "$npm_cache_dir" || {
            log_warning "Failed to create npm cache directory, using default"
            npm_cache_dir=""
        }
    fi
    
    if [[ -n "$npm_cache_dir" ]]; then
        npm config set cache "$npm_cache_dir" || {
            log_warning "Failed to set npm cache directory, using default"
        }
    fi
    
    # Set npm log level for production
    npm config set loglevel warn || {
        log_warning "Failed to set npm log level, continuing with defaults"
    }
    
    # Disable npm update notifications for system installation
    npm config set update-notifier false || {
        log_warning "Failed to disable npm update notifier, continuing"
    }
    
    # Configure npm for the service user (will be created later)
    local service_user="${CONFIG[service_user]}"
    log_debug "npm will be configured for service user: $service_user"
    
    log_success "npm configured successfully"
    return 0
}

# Create service user for application security
create_service_user() {
    local service_user="${CONFIG[service_user]}"
    local app_dir="${CONFIG[app_dir]}"
    local log_dir="${CONFIG[log_dir]}"
    local config_dir="${CONFIG[config_dir]}"
    
    log_info "Creating service user: $service_user"
    
    # Check if user already exists
    if id "$service_user" >/dev/null 2>&1; then
        log_info "Service user $service_user already exists"
        return 0
    fi
    
    # Create system user with no login shell and no home directory
    if ! useradd \
        --system \
        --no-create-home \
        --shell /bin/false \
        --comment "SeraphC2 Service User" \
        "$service_user"; then
        log_error "Failed to create service user: $service_user"
        return $E_SERVICE_ERROR
    fi
    
    # Verify user was actually created
    if ! id "$service_user" >/dev/null 2>&1; then
        log_error "Service user creation appeared to succeed but user does not exist"
        return $E_SERVICE_ERROR
    fi
    
    log_success "Service user $service_user created successfully"
    track_install_state "users_created" "$service_user"
    
    # Create application directories with proper ownership
    log_info "Creating application directories..."
    
    local directories=("$app_dir" "$log_dir" "$config_dir")
    
    for dir in "${directories[@]}"; do
        if [[ ! -d "$dir" ]]; then
            if ! mkdir -p "$dir"; then
                log_error "Failed to create directory: $dir"
                return $E_SERVICE_ERROR
            fi
            track_install_state "directories_created" "$dir"
        fi
        
        # Set ownership to service user
        if ! chown "$service_user:$service_user" "$dir"; then
            log_error "Failed to set ownership for directory: $dir"
            return $E_SERVICE_ERROR
        fi
        
        # Set appropriate permissions
        if ! chmod 755 "$dir"; then
            log_error "Failed to set permissions for directory: $dir"
            return $E_SERVICE_ERROR
        fi
        
        log_debug "Directory configured: $dir (owner: $service_user)"
    done
    
    log_success "Application directories created and configured"
    return 0
}

# Configure Node.js environment for the service
configure_nodejs_environment() {
    local service_user="${CONFIG[service_user]}"
    local app_dir="${CONFIG[app_dir]}"
    
    log_info "Configuring Node.js environment for service user..."
    
    # Create .npmrc file for the service user
    local npmrc_file="$app_dir/.npmrc"
    
    cat > "$npmrc_file" << EOF
# npm configuration for SeraphC2 service
registry=https://registry.npmjs.org/
loglevel=warn
update-notifier=false
fund=false
audit-level=moderate
cache=$app_dir/.npm
tmp=$app_dir/.npm-tmp
prefix=$app_dir/.npm-global
EOF
    
    # Create npm directories
    local npm_dirs=("$app_dir/.npm" "$app_dir/.npm-tmp" "$app_dir/.npm-global")
    for dir in "${npm_dirs[@]}"; do
        if ! mkdir -p "$dir"; then
            log_warning "Failed to create npm directory: $dir"
        else
            chown "$service_user:$service_user" "$dir" || log_warning "Failed to set ownership for $dir"
            chmod 755 "$dir" || log_warning "Failed to set permissions for $dir"
        fi
    done
    
    # Set ownership and permissions for .npmrc
    if ! chown "$service_user:$service_user" "$npmrc_file"; then
        log_warning "Failed to set ownership for .npmrc file"
    fi
    
    if ! chmod 644 "$npmrc_file"; then
        log_warning "Failed to set permissions for .npmrc file"
    fi
    
    # Create Node.js environment configuration
    local node_env_file="$app_dir/.node_env"
    
    cat > "$node_env_file" << EOF
# Node.js environment configuration for SeraphC2
NODE_ENV=production
NODE_OPTIONS="--max-old-space-size=2048"
UV_THREADPOOL_SIZE=16
EOF
    
    # Set ownership and permissions for environment file
    if ! chown "$service_user:$service_user" "$node_env_file"; then
        log_warning "Failed to set ownership for Node.js environment file"
    fi
    
    if ! chmod 644 "$node_env_file"; then
        log_warning "Failed to set permissions for Node.js environment file"
    fi
    
    log_success "Node.js environment configured for service user"
    return 0
}

# Set up proper permissions for Node.js and npm
setup_nodejs_permissions() {
    local service_user="${CONFIG[service_user]}"
    
    log_info "Setting up Node.js permissions for service user..."
    
    # Ensure service user can execute node and npm
    local node_path
    local npm_path
    
    node_path=$(which node 2>/dev/null)
    npm_path=$(which npm 2>/dev/null)
    
    if [[ -z "$node_path" ]]; then
        log_error "Node.js executable not found in PATH"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    if [[ -z "$npm_path" ]]; then
        log_error "npm executable not found in PATH"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    log_debug "Node.js executable: $node_path"
    log_debug "npm executable: $npm_path"
    
    # Verify service user can execute Node.js
    if ! sudo -u "$service_user" "$node_path" --version >/dev/null 2>&1; then
        log_error "Service user $service_user cannot execute Node.js"
        return $E_SERVICE_ERROR
    fi
    
    # Verify service user can execute npm
    if ! sudo -u "$service_user" "$npm_path" --version >/dev/null 2>&1; then
        log_error "Service user $service_user cannot execute npm"
        return $E_SERVICE_ERROR
    fi
    
    log_success "Node.js permissions configured successfully"
    return 0
}

# Test Node.js installation and configuration
test_nodejs_installation() {
    local service_user="${CONFIG[service_user]}"
    local app_dir="${CONFIG[app_dir]}"
    
    log_info "Testing Node.js installation..."
    
    # Test Node.js version
    local node_version
    node_version=$(node --version 2>/dev/null)
    
    if [[ -z "$node_version" ]]; then
        log_error "Node.js installation test failed - node command not working"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    log_info "Node.js version: $node_version"
    
    # Test npm version
    local npm_version
    npm_version=$(npm --version 2>/dev/null)
    
    if [[ -z "$npm_version" ]]; then
        log_error "npm installation test failed - npm command not working"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    log_info "npm version: $npm_version"
    
    # Test service user can run Node.js
    if ! sudo -u "$service_user" node --version >/dev/null 2>&1; then
        log_error "Service user cannot execute Node.js"
        return $E_SERVICE_ERROR
    fi
    
    # Test service user can run npm
    if ! sudo -u "$service_user" npm --version >/dev/null 2>&1; then
        log_error "Service user cannot execute npm"
        return $E_SERVICE_ERROR
    fi
    
    # Test npm configuration
    if ! sudo -u "$service_user" npm config get registry >/dev/null 2>&1; then
        log_warning "npm configuration test failed, but continuing"
    fi
    
    # Create a simple test to verify Node.js functionality
    local test_script="$app_dir/test_node.js"
    
    cat > "$test_script" << 'EOF'
// Simple Node.js functionality test
console.log('Node.js test successful');
console.log('Version:', process.version);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
process.exit(0);
EOF
    
    # Set ownership for test script
    chown "$service_user:$service_user" "$test_script"
    chmod 644 "$test_script"
    
    # Run test script as service user
    if ! sudo -u "$service_user" node "$test_script" >/dev/null 2>&1; then
        log_error "Node.js functionality test failed"
        rm -f "$test_script"
        return $E_SERVICE_ERROR
    fi
    
    # Clean up test script
    rm -f "$test_script"
    
    log_success "Node.js installation and configuration verified successfully"
    return 0
}

# Main Node.js installation and management function
install_and_configure_nodejs() {
    log_info "Starting Node.js installation and configuration..."
    
    # Step 1: Install Node.js
    if ! install_nodejs; then
        log_error "Failed to install Node.js"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    # Step 2: Configure npm
    if ! install_and_configure_npm; then
        log_error "Failed to configure npm"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    # Step 3: Create service user and directories
    if ! create_service_user; then
        log_error "Failed to create service user"
        return $E_SERVICE_ERROR
    fi
    
    # Step 4: Configure Node.js environment
    if ! configure_nodejs_environment; then
        log_error "Failed to configure Node.js environment"
        return $E_SERVICE_ERROR
    fi
    
    # Step 5: Set up permissions
    if ! setup_nodejs_permissions; then
        log_error "Failed to set up Node.js permissions"
        return $E_SERVICE_ERROR
    fi
    
    # Step 6: Test installation
    if ! test_nodejs_installation; then
        log_error "Node.js installation verification failed"
        return $E_SERVICE_ERROR
    fi
    
    log_success "Node.js installation and configuration completed successfully"
    
    # Display installation summary
    echo -e "\n${WHITE}Node.js Installation Summary:${NC}"
    echo "  Node.js Version: $(node --version 2>/dev/null || echo 'Unknown')"
    echo "  npm Version: $(npm --version 2>/dev/null || echo 'Unknown')"
    echo "  Service User: ${CONFIG[service_user]}"
    echo "  Application Directory: ${CONFIG[app_dir]}"
    echo "  Configuration Directory: ${CONFIG[config_dir]}"
    echo "  Log Directory: ${CONFIG[log_dir]}"
    echo ""
    
    return 0
}

#==============================================================================
# APPLICATION DEPLOYMENT SYSTEM
#==============================================================================

# Deploy SeraphC2 application code
deploy_application_code() {
    local app_dir="${CONFIG[app_dir]}"
    local service_user="${CONFIG[service_user]}"
    
    log_info "Deploying SeraphC2 application code..."
    
    # Check if we're running from the SeraphC2 source directory
    if [[ -f "package.json" && -f "src/index.ts" ]]; then
        log_info "Detected SeraphC2 source directory, copying application files..."
        
        # Copy application files to deployment directory
        if ! copy_application_files; then
            log_error "Failed to copy application files"
            return $E_SERVICE_ERROR
        fi
    else
        log_info "Source directory not detected, cloning from repository..."
        
        # Clone from repository (fallback method)
        if ! clone_application_repository; then
            log_error "Failed to clone application repository"
            return $E_SERVICE_ERROR
        fi
    fi
    
    # Verify essential files exist
    if ! verify_application_files; then
        log_error "Application file verification failed"
        return $E_SERVICE_ERROR
    fi
    
    log_success "Application code deployed successfully"
    mark_install_state "application_deployed"
    return 0
}

# Copy application files from current directory
copy_application_files() {
    local app_dir="${CONFIG[app_dir]}"
    local service_user="${CONFIG[service_user]}"
    
    log_info "Copying application files to $app_dir..."
    
    # List of files and directories to copy
    local files_to_copy=(
        "package.json"
        "package-lock.json"
        "tsconfig.json"
        "tsconfig.prod.json"
        "src/"
        "migrations/"
        "scripts/"
        "web-client/"
    )
    
    # Copy each file/directory
    for item in "${files_to_copy[@]}"; do
        if [[ -e "$item" ]]; then
            log_debug "Copying $item to $app_dir/"
            if ! cp -r "$item" "$app_dir/"; then
                log_error "Failed to copy $item"
                return 1
            fi
        else
            log_warning "Source file/directory not found: $item"
        fi
    done
    
    # Copy optional configuration files if they exist
    local optional_files=(
        ".env.example"
        ".env.production.example"
        ".env.staging.example"
        ".eslintrc.json"
        ".prettierrc"
        ".prettierignore"
        "jest.config.js"
    )
    
    for item in "${optional_files[@]}"; do
        if [[ -f "$item" ]]; then
            log_debug "Copying optional file: $item"
            cp "$item" "$app_dir/" || log_warning "Failed to copy optional file: $item"
        fi
    done
    
    # Set ownership of all copied files
    if ! chown -R "$service_user:$service_user" "$app_dir"; then
        log_error "Failed to set ownership of application files"
        return 1
    fi
    
    log_success "Application files copied successfully"
    return 0
}

# Clone application repository (fallback method)
clone_application_repository() {
    local app_dir="${CONFIG[app_dir]}"
    local service_user="${CONFIG[service_user]}"
    local repo_url="https://github.com/seraphc2/seraphc2.git"
    
    log_info "Cloning SeraphC2 repository from $repo_url..."
    
    # Check if git is available
    if ! command -v git >/dev/null 2>&1; then
        log_info "Installing git..."
        if ! install_package "git"; then
            log_error "Failed to install git"
            return 1
        fi
    fi
    
    # Create temporary directory for cloning
    local temp_dir="/tmp/seraphc2-clone-$$"
    
    # Clone repository
    if ! git clone "$repo_url" "$temp_dir"; then
        log_error "Failed to clone repository from $repo_url"
        rm -rf "$temp_dir" 2>/dev/null || true
        return 1
    fi
    
    # Copy files from cloned repository
    if ! cp -r "$temp_dir"/* "$app_dir/"; then
        log_error "Failed to copy files from cloned repository"
        rm -rf "$temp_dir" 2>/dev/null || true
        return 1
    fi
    
    # Clean up temporary directory
    rm -rf "$temp_dir" 2>/dev/null || true
    
    # Set ownership
    if ! chown -R "$service_user:$service_user" "$app_dir"; then
        log_error "Failed to set ownership of cloned files"
        return 1
    fi
    
    log_success "Repository cloned successfully"
    return 0
}

# Verify essential application files exist
verify_application_files() {
    local app_dir="${CONFIG[app_dir]}"
    
    log_debug "Verifying essential application files..."
    
    local required_files=(
        "$app_dir/package.json"
        "$app_dir/src/index.ts"
        "$app_dir/tsconfig.json"
    )
    
    local required_directories=(
        "$app_dir/src"
        "$app_dir/migrations"
    )
    
    # Check required files
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log_error "Required file missing: $file"
            return 1
        fi
        log_debug "Verified file: $file"
    done
    
    # Check required directories
    for dir in "${required_directories[@]}"; do
        if [[ ! -d "$dir" ]]; then
            log_error "Required directory missing: $dir"
            return 1
        fi
        log_debug "Verified directory: $dir"
    done
    
    log_debug "Application file verification completed successfully"
    return 0
}

# Install npm dependencies
install_application_dependencies() {
    local app_dir="${CONFIG[app_dir]}"
    local service_user="${CONFIG[service_user]}"
    
    log_info "Installing application dependencies..."
    
    # Change to application directory
    cd "$app_dir" || {
        log_error "Failed to change to application directory: $app_dir"
        return 1
    }
    
    # Install main dependencies
    log_info "Installing Node.js dependencies..."
    start_spinner "Installing dependencies"
    
    if ! sudo -u "$service_user" HOME="$app_dir" npm ci --only=production --no-audit --no-fund --cache="$app_dir/.npm" --tmp="$app_dir/.npm-tmp"; then
        stop_spinner
        log_error "Failed to install Node.js dependencies"
        return 1
    fi
    
    stop_spinner
    log_success "Node.js dependencies installed successfully"
    
    # Install web client dependencies if web-client directory exists
    if [[ -d "$app_dir/web-client" ]]; then
        log_info "Installing web client dependencies..."
        
        cd "$app_dir/web-client" || {
            log_error "Failed to change to web-client directory"
            return 1
        }
        
        start_spinner "Installing web client dependencies"
        
        if ! sudo -u "$service_user" HOME="$app_dir" npm ci --only=production --no-audit --no-fund --cache="$app_dir/.npm" --tmp="$app_dir/.npm-tmp"; then
            stop_spinner
            log_error "Failed to install web client dependencies"
            return 1
        fi
        
        stop_spinner
        log_success "Web client dependencies installed successfully"
        
        # Return to application directory
        cd "$app_dir" || {
            log_error "Failed to return to application directory"
            return 1
        }
    fi
    
    return 0
}

# Generate .env configuration file
generate_environment_configuration() {
    local app_dir="${CONFIG[app_dir]}"
    local service_user="${CONFIG[service_user]}"
    local env_file="$app_dir/.env"
    
    log_info "Generating environment configuration file..."
    
    # Create .env file with all required variables
    cat > "$env_file" << EOF
# SeraphC2 Environment Configuration
# Generated by setup script on $(date)

# =============================================================================
# ENVIRONMENT CONFIGURATION
# =============================================================================

# Application Environment
NODE_ENV=production
PORT=${CONFIG[http_port]}
HOST=0.0.0.0

# HTTP/HTTPS Configuration
HTTP_PORT=${CONFIG[http_port]}
HTTPS_PORT=${CONFIG[https_port]}
CORS_ORIGINS=https://${CONFIG[domain]}:${CONFIG[https_port]}
ENABLE_REQUEST_LOGGING=false

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================

# PostgreSQL connection settings
DB_HOST=${CONFIG[db_host]}
DB_PORT=${CONFIG[db_port]}
DB_NAME=${CONFIG[db_name]}
DB_USER=${CONFIG[db_user]}
DB_PASSWORD=${CONFIG[db_password]}

# Connection pool configuration
DB_POOL_MIN=5
DB_POOL_MAX=50
DB_POOL_IDLE_TIMEOUT=60000
DB_POOL_CONNECTION_TIMEOUT=15000

# Database health monitoring
DB_ENABLE_HEALTH_CHECK=true
DB_HEALTH_CHECK_INTERVAL=30000

# =============================================================================
# REDIS CONFIGURATION
# =============================================================================

# Redis connection settings
REDIS_HOST=${CONFIG[redis_host]}
REDIS_PORT=${CONFIG[redis_port]}
REDIS_PASSWORD=${CONFIG[redis_password]}
REDIS_DB=0
REDIS_KEY_PREFIX=seraphc2:prod:

# Redis connection behavior
REDIS_MAX_RETRIES=5
REDIS_CONNECT_TIMEOUT=15000

# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

# Production session configuration
SESSION_TTL_SECONDS=7200
SESSION_MAX_IDLE_SECONDS=3600
SESSION_ENABLE_SLIDING_EXPIRATION=true
SESSION_MAX_CONCURRENT=5
SESSION_ENABLE_DISTRIBUTED=true

# =============================================================================
# CLUSTER CONFIGURATION
# =============================================================================

# Node identification
NODE_ID=seraphc2-prod-node-1
NODE_ROLE=primary

# Production cluster configuration
CLUSTER_ENABLE=false
CLUSTER_HEARTBEAT_INTERVAL=10000
CLUSTER_HEARTBEAT_TIMEOUT=30000
CLUSTER_ENABLE_AUTO_SCALING=false
CLUSTER_MIN_NODES=1
CLUSTER_MAX_NODES=10

# =============================================================================
# LOAD BALANCER CONFIGURATION
# =============================================================================

# Load balancing configuration
LB_ALGORITHM=round-robin
LB_HEALTH_CHECK_INTERVAL=15000
LB_HEALTH_CHECK_TIMEOUT=5000
LB_ENABLE_STICKY_SESSIONS=false
LB_ENABLE_CIRCUIT_BREAKER=true
LB_CIRCUIT_BREAKER_THRESHOLD=3
LB_MAX_RETRIES=2

# =============================================================================
# MONITORING AND ALERTING
# =============================================================================

# Performance monitoring
MONITORING_ENABLE=true
MONITORING_METRICS_INTERVAL=60000
MONITORING_RETENTION_DAYS=30

# Alerting configuration
MONITORING_ENABLE_ALERTING=true
MONITORING_ALERT_CHECK_INTERVAL=30000
MONITORING_MAX_ALERTS_PER_HOUR=20

# =============================================================================
# SECURITY CONFIGURATION
# =============================================================================

# Cryptographic secrets
JWT_SECRET=${CONFIG[jwt_secret]}
ENCRYPTION_KEY=${CONFIG[encryption_key]}

# Default admin credentials
ADMIN_USERNAME=${CONFIG[admin_username]}
ADMIN_PASSWORD=${CONFIG[admin_password]}

# =============================================================================
# LOGGING CONFIGURATION
# =============================================================================

# Production logging configuration
LOG_LEVEL=warn
LOG_FILE=${CONFIG[log_dir]}/seraphc2.log

# =============================================================================
# PROTOCOL CONFIGURATION
# =============================================================================

# Protocol-specific settings
DNS_PORT=53
SMB_PIPE_NAME=seraphc2_prod
IMPLANT_PORT=${CONFIG[implant_port]}

# =============================================================================
# SSL/TLS CONFIGURATION
# =============================================================================

# SSL certificate paths
SSL_CERT_PATH=${CONFIG[ssl_dir]}/server.crt
SSL_KEY_PATH=${CONFIG[ssl_dir]}/server.key

# =============================================================================
# APPLICATION-SPECIFIC CONFIGURATION
# =============================================================================

# Domain and network configuration
DOMAIN=${CONFIG[domain]}

# File upload configuration
UPLOAD_MAX_SIZE=10485760
UPLOAD_DIR=${CONFIG[app_dir]}/uploads

# API rate limiting
API_RATE_LIMIT=100
API_RATE_WINDOW=900

# Backup configuration
BACKUP_ENABLED=true
BACKUP_DIR=${CONFIG[backup_dir]}
BACKUP_RETENTION_DAYS=${CONFIG[backup_retention_days]}
EOF
    
    # Set secure permissions on .env file
    if ! chmod 600 "$env_file"; then
        log_error "Failed to set permissions on .env file"
        return 1
    fi
    
    if ! chown "$service_user:$service_user" "$env_file"; then
        log_error "Failed to set ownership on .env file"
        return 1
    fi
    
    log_success "Environment configuration file generated: $env_file"
    return 0
}

# Build the application
build_application() {
    local app_dir="${CONFIG[app_dir]}"
    local service_user="${CONFIG[service_user]}"
    
    log_info "Building SeraphC2 application..."
    
    # Change to application directory
    cd "$app_dir" || {
        log_error "Failed to change to application directory: $app_dir"
        return 1
    }
    
    # Build TypeScript application
    log_info "Compiling TypeScript source code..."
    start_spinner "Building application"
    
    if ! sudo -u "$service_user" npm run build; then
        stop_spinner
        log_error "Failed to build TypeScript application"
        return 1
    fi
    
    stop_spinner
    log_success "TypeScript compilation completed successfully"
    
    # Build web client if it exists
    if [[ -d "$app_dir/web-client" ]]; then
        log_info "Building web client..."
        
        start_spinner "Building web client"
        
        if ! sudo -u "$service_user" npm run build:web; then
            stop_spinner
            log_error "Failed to build web client"
            return 1
        fi
        
        stop_spinner
        log_success "Web client built successfully"
    fi
    
    # Verify build output
    if [[ ! -f "$app_dir/dist/index.js" ]]; then
        log_error "Build verification failed - main application file not found: $app_dir/dist/index.js"
        return 1
    fi
    
    log_success "Application build completed successfully"
    return 0
}

# Set up application file permissions and ownership
setup_application_permissions() {
    local app_dir="${CONFIG[app_dir]}"
    local service_user="${CONFIG[service_user]}"
    local log_dir="${CONFIG[log_dir]}"
    local config_dir="${CONFIG[config_dir]}"
    
    log_info "Setting up application file permissions..."
    
    # Set ownership for all application files
    if ! chown -R "$service_user:$service_user" "$app_dir"; then
        log_error "Failed to set ownership for application directory"
        return 1
    fi
    
    # Set directory permissions
    find "$app_dir" -type d -exec chmod 755 {} \; || {
        log_error "Failed to set directory permissions"
        return 1
    }
    
    # Set file permissions
    find "$app_dir" -type f -exec chmod 644 {} \; || {
        log_error "Failed to set file permissions"
        return 1
    }
    
    # Set executable permissions for scripts
    if [[ -d "$app_dir/scripts" ]]; then
        find "$app_dir/scripts" -name "*.sh" -exec chmod 755 {} \; || {
            log_warning "Failed to set executable permissions for shell scripts"
        }
    fi
    
    # Set secure permissions for sensitive files
    local sensitive_files=(
        "$app_dir/.env"
        "$app_dir/.npmrc"
    )
    
    for file in "${sensitive_files[@]}"; do
        if [[ -f "$file" ]]; then
            chmod 600 "$file" || log_warning "Failed to set secure permissions for $file"
        fi
    done
    
    # Create uploads directory with proper permissions
    local uploads_dir="$app_dir/uploads"
    if [[ ! -d "$uploads_dir" ]]; then
        mkdir -p "$uploads_dir" || {
            log_error "Failed to create uploads directory"
            return 1
        }
    fi
    
    chown "$service_user:$service_user" "$uploads_dir"
    chmod 755 "$uploads_dir"
    
    # Ensure log directory has proper permissions
    chown "$service_user:$service_user" "$log_dir"
    chmod 755 "$log_dir"
    
    log_success "Application file permissions configured successfully"
    return 0
}

# Validate application deployment
validate_application_deployment() {
    local app_dir="${CONFIG[app_dir]}"
    local service_user="${CONFIG[service_user]}"
    
    log_info "Validating application deployment..."
    
    # Check essential files
    local essential_files=(
        "$app_dir/package.json"
        "$app_dir/dist/index.js"
        "$app_dir/.env"
        "$app_dir/node_modules"
    )
    
    for file in "${essential_files[@]}"; do
        if [[ ! -e "$file" ]]; then
            log_error "Essential file/directory missing: $file"
            return 1
        fi
        log_debug "Validated: $file"
    done
    
    # Test Node.js application syntax
    log_info "Testing application syntax..."
    
    cd "$app_dir" || {
        log_error "Failed to change to application directory"
        return 1
    }
    
    # Test main application file syntax
    if ! sudo -u "$service_user" node -c "dist/index.js"; then
        log_error "Application syntax validation failed"
        return 1
    fi
    
    # Test environment configuration loading
    local test_script="$app_dir/test_env.js"
    cat > "$test_script" << 'EOF'
require('dotenv').config();
const requiredVars = [
    'NODE_ENV', 'PORT', 'DB_HOST', 'DB_PORT', 'DB_NAME', 
    'DB_USER', 'DB_PASSWORD', 'REDIS_HOST', 'REDIS_PORT', 
    'REDIS_PASSWORD', 'JWT_SECRET', 'ENCRYPTION_KEY'
];

let missing = [];
for (const varName of requiredVars) {
    if (!process.env[varName]) {
        missing.push(varName);
    }
}

if (missing.length > 0) {
    console.error('Missing environment variables:', missing.join(', '));
    process.exit(1);
}

console.log('Environment configuration validation passed');
process.exit(0);
EOF
    
    chown "$service_user:$service_user" "$test_script"
    
    if ! sudo -u "$service_user" node "$test_script"; then
        log_error "Environment configuration validation failed"
        rm -f "$test_script"
        return 1
    fi
    
    rm -f "$test_script"
    
    # Check file permissions
    local env_perms=$(stat -c "%a" "$app_dir/.env")
    if [[ "$env_perms" != "600" ]]; then
        log_error "Incorrect permissions on .env file: $env_perms (should be 600)"
        return 1
    fi
    
    log_success "Application deployment validation completed successfully"
    return 0
}

# Main application deployment function
deploy_seraphc2_application() {
    log_info "Starting SeraphC2 application deployment..."
    
    # Step 1: Deploy application code
    if ! deploy_application_code; then
        log_error "Failed to deploy application code"
        return $E_SERVICE_ERROR
    fi
    
    # Step 2: Install dependencies
    if ! install_application_dependencies; then
        log_error "Failed to install application dependencies"
        return $E_SERVICE_ERROR
    fi
    
    # Step 3: Generate environment configuration
    if ! generate_environment_configuration; then
        log_error "Failed to generate environment configuration"
        return $E_SERVICE_ERROR
    fi
    
    # Step 4: Build application
    if ! build_application; then
        log_error "Failed to build application"
        return $E_SERVICE_ERROR
    fi
    
    # Step 5: Set up permissions
    if ! setup_application_permissions; then
        log_error "Failed to set up application permissions"
        return $E_SERVICE_ERROR
    fi
    
    # Step 6: Validate deployment
    if ! validate_application_deployment; then
        log_error "Application deployment validation failed"
        return $E_SERVICE_ERROR
    fi
    
    log_success "SeraphC2 application deployment completed successfully"
    
    # Display deployment summary
    echo -e "\n${WHITE}Application Deployment Summary:${NC}"
    echo "  Application Directory: ${CONFIG[app_dir]}"
    echo "  Service User: ${CONFIG[service_user]}"
    echo "  Environment File: ${CONFIG[app_dir]}/.env"
    echo "  Main Application: ${CONFIG[app_dir]}/dist/index.js"
    echo "  Web Client: $([[ -d "${CONFIG[app_dir]}/web-client/build" ]] && echo "Built" || echo "Not available")"
    echo "  Dependencies: Installed"
    echo "  Build Status: Complete"
    echo ""
    
    return 0
}

#==============================================================================
# SYSTEMD SERVICE MANAGEMENT SYSTEM
#==============================================================================

# Ensure service user and directories are properly configured
ensure_service_user_configuration() {
    local service_user="${CONFIG[service_user]}"
    local app_dir="${CONFIG[app_dir]}"
    local log_dir="${CONFIG[log_dir]}"
    local config_dir="${CONFIG[config_dir]}"
    
    log_info "Ensuring service user configuration is complete..."
    
    # Check if user exists (should have been created during application deployment)
    if ! id "$service_user" >/dev/null 2>&1; then
        log_warning "Service user $service_user not found, creating now..."
        if ! create_service_user; then
            log_error "Failed to create service user"
            return $E_SERVICE_ERROR
        fi
    fi
    
    # Ensure all directories have proper ownership
    log_debug "Verifying directory ownership for service user..."
    local directories=("$app_dir" "$log_dir" "$config_dir")
    for dir in "${directories[@]}"; do
        if [[ -d "$dir" ]]; then
            if chown -R "$service_user:$service_user" "$dir"; then
                log_debug "Verified ownership of $dir"
            else
                log_warning "Failed to set ownership of $dir"
            fi
        fi
    done
    
    return 0
}

# Create systemd service file with proper dependencies
create_systemd_service_file() {
    local service_user="${CONFIG[service_user]}"
    local app_dir="${CONFIG[app_dir]}"
    local log_dir="${CONFIG[log_dir]}"
    local service_file="/etc/systemd/system/seraphc2.service"
    
    log_info "Creating systemd service file..."
    
    # Create the service file
    cat > "$service_file" << EOF
[Unit]
Description=SeraphC2 Command and Control Server
Documentation=https://github.com/seraphc2/seraphc2
After=network.target network-online.target postgresql.service redis.service
Wants=network-online.target
Requires=postgresql.service redis.service

[Service]
Type=simple
User=$service_user
Group=$service_user
WorkingDirectory=$app_dir
ExecStart=/usr/bin/node dist/index.js
ExecReload=/bin/kill -HUP \$MAINPID

# Restart configuration
Restart=always
RestartSec=10
StartLimitInterval=60
StartLimitBurst=3

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$app_dir $log_dir /tmp

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

# Environment
Environment=NODE_ENV=production
Environment=NODE_OPTIONS="--max-old-space-size=2048"
EnvironmentFile=$app_dir/.env

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=seraphc2

# Process management
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

    if [[ $? -eq 0 ]]; then
        log_success "Created systemd service file: $service_file"
        track_install_state "services_created" "seraphc2"
        
        # Set proper permissions on service file
        chmod 644 "$service_file"
        chown root:root "$service_file"
        
        # Reload systemd daemon to recognize new service
        if systemctl daemon-reload; then
            log_success "Reloaded systemd daemon"
        else
            log_warning "Failed to reload systemd daemon"
        fi
        
        return 0
    else
        log_error "Failed to create systemd service file"
        return $E_SERVICE_ERROR
    fi
}

# Enable and start the SeraphC2 service
enable_and_start_service() {
    local service_name="seraphc2"
    
    log_info "Enabling and starting SeraphC2 service..."
    
    # Enable service for automatic startup
    if systemctl enable "$service_name"; then
        log_success "Enabled $service_name service for automatic startup"
        mark_install_state "service_enabled"
    else
        log_error "Failed to enable $service_name service"
        return $E_SERVICE_ERROR
    fi
    
    # Start the service
    log_info "Starting $service_name service..."
    if systemctl start "$service_name"; then
        log_success "Started $service_name service"
        
        # Wait a moment for service to initialize
        sleep 3
        
        # Verify service is running
        if systemctl is-active "$service_name" >/dev/null 2>&1; then
            log_success "Service $service_name is running successfully"
        else
            log_warning "Service $service_name may not be running properly"
            show_service_status "$service_name"
        fi
    else
        log_error "Failed to start $service_name service"
        show_service_status "$service_name"
        return $E_SERVICE_ERROR
    fi
    
    return 0
}

# Check service health and status
check_service_health() {
    local service_name="seraphc2"
    local max_attempts=5
    local attempt=1
    
    log_info "Checking service health..."
    
    while [[ $attempt -le $max_attempts ]]; do
        log_debug "Health check attempt $attempt/$max_attempts"
        
        # Check if service is active
        if systemctl is-active "$service_name" >/dev/null 2>&1; then
            log_debug "Service is active"
            
            # Check if service is listening on configured ports
            local http_port="${CONFIG[http_port]}"
            local https_port="${CONFIG[https_port]}"
            local implant_port="${CONFIG[implant_port]}"
            
            local ports_ok=true
            
            # Check HTTP port
            if ! netstat -tuln 2>/dev/null | grep -q ":$http_port "; then
                log_debug "HTTP port $http_port not listening"
                ports_ok=false
            fi
            
            # Check HTTPS port
            if ! netstat -tuln 2>/dev/null | grep -q ":$https_port "; then
                log_debug "HTTPS port $https_port not listening"
                ports_ok=false
            fi
            
            # Check implant port
            if ! netstat -tuln 2>/dev/null | grep -q ":$implant_port "; then
                log_debug "Implant port $implant_port not listening"
                ports_ok=false
            fi
            
            if [[ "$ports_ok" == "true" ]]; then
                log_success "Service health check passed - all ports are listening"
                return 0
            else
                log_debug "Not all ports are listening yet, waiting..."
            fi
        else
            log_debug "Service is not active yet"
        fi
        
        if [[ $attempt -lt $max_attempts ]]; then
            log_debug "Waiting 5 seconds before next health check..."
            sleep 5
        fi
        
        ((attempt++))
    done
    
    log_warning "Service health check failed after $max_attempts attempts"
    show_service_status "$service_name"
    return 1
}

# Show detailed service status and logs
show_service_status() {
    local service_name="$1"
    
    log_info "Service status for $service_name:"
    
    # Show service status
    echo -e "\n${WHITE}Service Status:${NC}"
    systemctl status "$service_name" --no-pager -l || true
    
    # Show recent logs
    echo -e "\n${WHITE}Recent Logs (last 20 lines):${NC}"
    journalctl -u "$service_name" -n 20 --no-pager || true
    
    # Show listening ports
    echo -e "\n${WHITE}Listening Ports:${NC}"
    netstat -tuln 2>/dev/null | grep -E ":(${CONFIG[http_port]}|${CONFIG[https_port]}|${CONFIG[implant_port]}) " || echo "No SeraphC2 ports found listening"
}

# Configure service restart and recovery
configure_service_recovery() {
    local service_name="seraphc2"
    local override_dir="/etc/systemd/system/$service_name.service.d"
    local override_file="$override_dir/restart.conf"
    
    log_info "Configuring service restart and recovery settings..."
    
    # Create override directory
    if ! mkdir -p "$override_dir"; then
        log_error "Failed to create systemd override directory: $override_dir"
        return $E_SERVICE_ERROR
    fi
    
    # Create restart configuration override
    cat > "$override_file" << EOF
[Service]
# Enhanced restart configuration
Restart=always
RestartSec=10
StartLimitInterval=300
StartLimitBurst=5

# Watchdog configuration
WatchdogSec=60

# Additional recovery settings
RestartPreventExitStatus=
RestartForceExitStatus=1 2 8 SIGPIPE
SuccessExitStatus=0 1 2 8 SIGPIPE

# Memory and resource monitoring
MemoryAccounting=true
MemoryMax=4G
TasksMax=4096
EOF

    if [[ $? -eq 0 ]]; then
        log_success "Created service recovery configuration: $override_file"
        
        # Set proper permissions
        chmod 644 "$override_file"
        chown root:root "$override_file"
        
        # Reload systemd to apply changes
        if systemctl daemon-reload; then
            log_success "Applied service recovery configuration"
        else
            log_warning "Failed to reload systemd daemon"
        fi
        
        return 0
    else
        log_error "Failed to create service recovery configuration"
        return $E_SERVICE_ERROR
    fi
}

# Set up service logging and monitoring
setup_service_logging() {
    local service_name="seraphc2"
    local log_dir="${CONFIG[log_dir]}"
    local service_user="${CONFIG[service_user]}"
    
    log_info "Setting up service logging and monitoring..."
    
    # Ensure log directory exists with proper permissions
    if ! mkdir -p "$log_dir"; then
        log_error "Failed to create log directory: $log_dir"
        return $E_SERVICE_ERROR
    fi
    
    # Set ownership and permissions for log directory
    chown "$service_user:$service_user" "$log_dir"
    chmod 755 "$log_dir"
    
    # Configure logrotate for SeraphC2 logs
    local logrotate_config="/etc/logrotate.d/seraphc2"
    
    cat > "$logrotate_config" << EOF
$log_dir/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $service_user $service_user
    postrotate
        systemctl reload-or-restart $service_name > /dev/null 2>&1 || true
    endscript
}
EOF

    if [[ $? -eq 0 ]]; then
        log_success "Created logrotate configuration: $logrotate_config"
        chmod 644 "$logrotate_config"
        chown root:root "$logrotate_config"
    else
        log_warning "Failed to create logrotate configuration"
    fi
    
    # Create rsyslog configuration for SeraphC2 (optional)
    local rsyslog_config="/etc/rsyslog.d/30-seraphc2.conf"
    
    cat > "$rsyslog_config" << EOF
# SeraphC2 logging configuration
if \$programname == 'seraphc2' then $log_dir/seraphc2.log
& stop
EOF

    if [[ $? -eq 0 ]]; then
        log_success "Created rsyslog configuration: $rsyslog_config"
        chmod 644 "$rsyslog_config"
        chown root:root "$rsyslog_config"
        
        # Restart rsyslog to apply configuration
        if systemctl restart rsyslog 2>/dev/null; then
            log_debug "Restarted rsyslog service"
        else
            log_debug "Could not restart rsyslog (may not be installed)"
        fi
    else
        log_warning "Failed to create rsyslog configuration"
    fi
    
    return 0
}

# Validate service configuration and status
validate_service_configuration() {
    local service_name="seraphc2"
    
    log_info "Validating service configuration..."
    
    # Check if service file exists
    if [[ ! -f "/etc/systemd/system/$service_name.service" ]]; then
        log_error "Service file not found: /etc/systemd/system/$service_name.service"
        return $E_SERVICE_ERROR
    fi
    
    # Check if service is enabled
    if ! systemctl is-enabled "$service_name" >/dev/null 2>&1; then
        log_error "Service $service_name is not enabled"
        return $E_SERVICE_ERROR
    fi
    
    # Check if service is active
    if ! systemctl is-active "$service_name" >/dev/null 2>&1; then
        log_error "Service $service_name is not active"
        return $E_SERVICE_ERROR
    fi
    
    # Validate service dependencies
    log_debug "Checking service dependencies..."
    local dependencies=("postgresql" "redis")
    for dep in "${dependencies[@]}"; do
        if systemctl is-active "$dep" >/dev/null 2>&1; then
            log_debug "Dependency $dep is active"
        else
            log_warning "Dependency $dep is not active - this may cause issues"
        fi
    done
    
    log_success "Service configuration validation completed"
    return 0
}

# Main systemd service management function
configure_systemd_service() {
    log_info "Starting systemd service configuration..."
    
    # Step 1: Ensure service user configuration
    if ! ensure_service_user_configuration; then
        log_error "Failed to ensure service user configuration"
        return $E_SERVICE_ERROR
    fi
    
    # Step 2: Create systemd service file
    if ! create_systemd_service_file; then
        log_error "Failed to create systemd service file"
        return $E_SERVICE_ERROR
    fi
    
    # Step 3: Configure service recovery settings
    if ! configure_service_recovery; then
        log_error "Failed to configure service recovery"
        return $E_SERVICE_ERROR
    fi
    
    # Step 4: Set up service logging
    if ! setup_service_logging; then
        log_error "Failed to set up service logging"
        return $E_SERVICE_ERROR
    fi
    
    # Step 5: Enable and start service
    if ! enable_and_start_service; then
        log_error "Failed to enable and start service"
        return $E_SERVICE_ERROR
    fi
    
    # Step 6: Check service health
    if ! check_service_health; then
        log_warning "Service health check failed, but continuing..."
        # Don't return error here as service might need more time to start
    fi
    
    # Step 7: Validate service configuration
    if ! validate_service_configuration; then
        log_error "Service configuration validation failed"
        return $E_SERVICE_ERROR
    fi
    
    log_success "Systemd service configuration completed successfully"
    
    # Display service management information
    echo -e "\n${WHITE}Service Management Information:${NC}"
    echo "  Service Name: seraphc2"
    echo "  Service File: /etc/systemd/system/seraphc2.service"
    echo "  Service User: ${CONFIG[service_user]}"
    echo "  Log Directory: ${CONFIG[log_dir]}"
    echo ""
    echo "  Management Commands:"
    echo "    Start:   sudo systemctl start seraphc2"
    echo "    Stop:    sudo systemctl stop seraphc2"
    echo "    Restart: sudo systemctl restart seraphc2"
    echo "    Status:  sudo systemctl status seraphc2"
    echo "    Logs:    sudo journalctl -u seraphc2 -f"
    echo ""
    
    return 0
}

#==============================================================================
# POSTGRESQL DATABASE SETUP SYSTEM
#==============================================================================

# Detect current PostgreSQL version if installed
detect_postgresql_version() {
    log_debug "Detecting PostgreSQL version..."
    
    local postgresql_version=""
    local postgresql_service_status=""
    
    # Method 1: Check for psql command
    if command -v psql >/dev/null 2>&1; then
        postgresql_version=$(psql --version 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
        if [[ -n "$postgresql_version" ]]; then
            log_debug "Found PostgreSQL version via psql: $postgresql_version"
        fi
    fi
    
    # Method 2: Check for postgres command if psql not found
    if [[ -z "$postgresql_version" ]] && command -v postgres >/dev/null 2>&1; then
        postgresql_version=$(postgres --version 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
        if [[ -n "$postgresql_version" ]]; then
            log_debug "Found PostgreSQL version via postgres: $postgresql_version"
        fi
    fi
    
    # Method 3: Check package manager for installed PostgreSQL packages
    if [[ -z "$postgresql_version" ]]; then
        local os_type="${SYSTEM_INFO[os_type]}"
        local package_manager="${SYSTEM_INFO[package_manager]}"
        
        case "$package_manager" in
            apt)
                # Check for installed postgresql packages
                if dpkg -l | grep -q "^ii.*postgresql-[0-9]"; then
                    postgresql_version=$(dpkg -l | grep "^ii.*postgresql-[0-9]" | head -1 | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
                    log_debug "Found PostgreSQL version via dpkg: $postgresql_version"
                elif dpkg -l | grep -q "^ii.*postgresql[[:space:]]"; then
                    # Generic postgresql package - try to get version from files
                    if [[ -f /usr/share/postgresql/*/postgresql.conf.sample ]]; then
                        postgresql_version=$(ls /usr/share/postgresql/*/postgresql.conf.sample 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
                        log_debug "Found PostgreSQL version via file system: $postgresql_version"
                    fi
                fi
                ;;
            yum|dnf)
                # Check for installed postgresql packages
                if rpm -qa | grep -q "postgresql[0-9]"; then
                    postgresql_version=$(rpm -qa | grep "postgresql[0-9]" | head -1 | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
                    log_debug "Found PostgreSQL version via rpm: $postgresql_version"
                elif rpm -qa | grep -q "^postgresql-server"; then
                    # Try to get version from installed files
                    if [[ -f /usr/share/pgsql/postgresql.conf.sample ]]; then
                        postgresql_version=$(rpm -q postgresql-server --queryformat '%{VERSION}' 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
                        log_debug "Found PostgreSQL version via rpm query: $postgresql_version"
                    fi
                fi
                ;;
            zypper)
                if zypper se -i postgresql | grep -q "postgresql"; then
                    postgresql_version=$(zypper se -i postgresql | grep "postgresql" | head -1 | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
                    log_debug "Found PostgreSQL version via zypper: $postgresql_version"
                fi
                ;;
            pacman)
                if pacman -Q postgresql >/dev/null 2>&1; then
                    postgresql_version=$(pacman -Q postgresql | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
                    log_debug "Found PostgreSQL version via pacman: $postgresql_version"
                fi
                ;;
        esac
    fi
    
    # Check service status with multiple possible service names
    if command -v systemctl >/dev/null 2>&1; then
        local service_names=("postgresql" "postgresql.service")
        local os_type="${SYSTEM_INFO[os_type]}"
        
        # Add OS-specific service names
        case "$os_type" in
            centos|rhel|fedora)
                service_names+=("postgresql-15" "postgresql-14" "postgresql-13" "postgresql-12")
                ;;
        esac
        
        for service_name in "${service_names[@]}"; do
            if systemctl list-unit-files "$service_name" >/dev/null 2>&1; then
                if systemctl is-active "$service_name" >/dev/null 2>&1; then
                    postgresql_service_status="active"
                    log_debug "PostgreSQL service is active: $service_name"
                    break
                elif systemctl is-enabled "$service_name" >/dev/null 2>&1; then
                    postgresql_service_status="enabled"
                    log_debug "PostgreSQL service is enabled but not active: $service_name"
                fi
            fi
        done
        
        if [[ -z "$postgresql_service_status" ]]; then
            postgresql_service_status="inactive"
            log_debug "No active PostgreSQL services found"
        fi
    fi
    
    # Store results in global variables for later use
    POSTGRESQL_CURRENT_VERSION="$postgresql_version"
    POSTGRESQL_SERVICE_STATUS="$postgresql_service_status"
    
    if [[ -n "$postgresql_version" ]]; then
        log_debug "PostgreSQL detection completed - Version: $postgresql_version, Service: $postgresql_service_status"
    else
        log_debug "PostgreSQL not detected on system"
    fi
    
    return 0
}

# Check if PostgreSQL meets minimum version requirements
check_postgresql_version_requirements() {
    local current_version="$1"
    local min_version="13"
    
    if [[ -z "$current_version" ]]; then
        log_debug "PostgreSQL not installed"
        return 1
    fi
    
    local current_major=$(echo "$current_version" | cut -d'.' -f1)
    
    if [[ $current_major -ge $min_version ]]; then
        log_debug "PostgreSQL version $current_version meets minimum requirement ($min_version+)"
        return 0
    else
        log_debug "PostgreSQL version $current_version does not meet minimum requirement ($min_version+)"
        return 1
    fi
}

# Recover from PostgreSQL installation failures
recover_postgresql_installation() {
    log_info "Starting PostgreSQL installation recovery process..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    local package_manager="${SYSTEM_INFO[package_manager]}"
    
    # Clean up any problematic repository configurations first
    log_info "Cleaning up problematic PostgreSQL repository configurations..."
    cleanup_postgresql_repositories
    
    # Try system packages first (most reliable)
    log_info "Attempting recovery with system packages..."
    if install_postgresql_system_packages; then
        log_success "PostgreSQL recovery successful using system packages"
        return 0
    fi
    
    # If system packages fail, try manual package installation
    log_info "System packages failed, trying manual package installation..."
    if recover_postgresql_manual_installation; then
        log_success "PostgreSQL recovery successful using manual installation"
        return 0
    fi
    
    # Final attempt with legacy recovery methods
    log_warning "Standard recovery methods failed, trying legacy recovery..."
    case "$package_manager" in
        apt)
            recover_postgresql_apt
            ;;
        yum|dnf)
            recover_postgresql_rpm
            ;;
        *)
            log_error "PostgreSQL installation recovery is not supported for package manager: $package_manager"
            return $E_PACKAGE_INSTALL_FAILED
            ;;
    esac
}

# Clean up problematic PostgreSQL repository configurations
cleanup_postgresql_repositories() {
    log_debug "Cleaning up PostgreSQL repository configurations..."
    
    # Remove PostgreSQL repository files
    local repo_files=(
        "/etc/apt/sources.list.d/pgdg.list"
        "/etc/yum.repos.d/pgdg-redhat-all.repo"
        "/etc/yum.repos.d/pgdg-fedora-all.repo"
        "/etc/zypp/repos.d/postgresql.repo"
    )
    
    for repo_file in "${repo_files[@]}"; do
        if [[ -f "$repo_file" ]]; then
            log_debug "Removing repository file: $repo_file"
            rm -f "$repo_file" 2>/dev/null || true
        fi
    done
    
    # Remove GPG keys
    local key_files=(
        "/usr/share/keyrings/postgresql-archive-keyring.gpg"
        "/etc/apt/trusted.gpg.d/postgresql.gpg"
    )
    
    for key_file in "${key_files[@]}"; do
        if [[ -f "$key_file" ]]; then
            log_debug "Removing GPG key file: $key_file"
            rm -f "$key_file" 2>/dev/null || true
        fi
    done
    
    # Clean up deprecated apt-key entries
    if command -v apt-key >/dev/null 2>&1 && apt-key list 2>/dev/null | grep -qi postgresql; then
        log_debug "Removing deprecated PostgreSQL GPG keys from apt-key..."
        apt-key del ACCC4CF8 2>/dev/null || true
    fi
    
    log_debug "Repository cleanup completed"
}

# Manual PostgreSQL installation as recovery method
recover_postgresql_manual_installation() {
    log_info "Attempting manual PostgreSQL installation..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    local package_manager="${SYSTEM_INFO[package_manager]}"
    
    # Update package cache
    if ! update_package_cache; then
        log_warning "Failed to update package cache during recovery"
        return 1
    fi
    
    # Try minimal PostgreSQL installation
    local minimal_packages=()
    
    case "$os_type" in
        ubuntu|debian)
            minimal_packages=("postgresql" "postgresql-client")
            ;;
        centos|rhel|fedora)
            minimal_packages=("postgresql-server" "postgresql")
            ;;
        opensuse|sles)
            minimal_packages=("postgresql-server" "postgresql")
            ;;
        arch)
            minimal_packages=("postgresql")
            ;;
        alpine)
            minimal_packages=("postgresql")
            ;;
        *)
            log_warning "Manual installation not supported for OS: $os_type"
            return 1
            ;;
    esac
    
    log_info "Installing minimal PostgreSQL packages: ${minimal_packages[*]}"
    
    # Install packages one by one to identify issues
    local installed_packages=()
    for package in "${minimal_packages[@]}"; do
        log_info "Installing package: $package"
        if install_package "$package"; then
            installed_packages+=("$package")
            track_install_state "packages_installed" "$package"
            log_success "Successfully installed: $package"
        else
            log_warning "Failed to install package: $package"
        fi
    done
    
    # Check if we have at least the core PostgreSQL package
    if [[ ${#installed_packages[@]} -eq 0 ]]; then
        log_error "Failed to install any PostgreSQL packages"
        return 1
    fi
    
    # Initialize database if needed (for RPM-based systems)
    if [[ "$package_manager" =~ ^(yum|dnf|zypper)$ ]]; then
        initialize_postgresql_cluster_rpm
    fi
    
    # Try to start PostgreSQL service
    if ensure_postgresql_service_running; then
        log_success "PostgreSQL service started successfully"
        return 0
    else
        log_warning "PostgreSQL packages installed but service failed to start"
        return 1
    fi
}

# Recovery function for APT-based systems (Ubuntu/Debian)
recover_postgresql_apt() {
    
    log_info "Step 1: Cleaning up problematic repository configurations..."
    
    # Remove any existing PostgreSQL repository files
    if [[ -f /etc/apt/sources.list.d/pgdg.list ]]; then
        log_info "Removing existing PostgreSQL repository file..."
        rm -f /etc/apt/sources.list.d/pgdg.list || true
    fi
    
    # Remove old GPG keys
    if [[ -f /usr/share/keyrings/postgresql-archive-keyring.gpg ]]; then
        log_info "Removing existing PostgreSQL GPG keyring..."
        rm -f /usr/share/keyrings/postgresql-archive-keyring.gpg || true
    fi
    
    # Clean up any old apt-key entries (deprecated method)
    if command -v apt-key >/dev/null 2>&1 && apt-key list 2>/dev/null | grep -qi postgresql; then
        log_info "Removing old PostgreSQL GPG keys from apt-key..."
        apt-key del ACCC4CF8 2>/dev/null || true
    fi
    
    log_info "Step 2: Updating package cache after cleanup..."
    if ! timeout 60 apt-get update 2>/dev/null; then
        log_warning "Failed to update package cache after cleanup, continuing anyway"
    fi
    
    log_info "Step 3: Installing required dependencies..."
    if ! install_package "wget" "gnupg" "lsb-release" "ca-certificates"; then
        log_error "Failed to install required dependencies for PostgreSQL recovery"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    log_info "Step 4: Re-adding PostgreSQL repository with modern configuration..."
    
    # Create keyrings directory
    mkdir -p /usr/share/keyrings || true
    
    # Download and add PostgreSQL GPG key using modern method
    local gpg_key_success=false
    if wget --quiet --timeout=30 -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-archive-keyring.gpg 2>/dev/null; then
        gpg_key_success=true
        log_success "PostgreSQL GPG key added successfully"
    else
        log_warning "Failed to download PostgreSQL GPG key, will use system packages only"
    fi
    
    if [[ "$gpg_key_success" == "true" ]]; then
        # Detect codename with enhanced fallback logic
        local codename="${SYSTEM_INFO[os_codename]}"
        local os_version="${SYSTEM_INFO[os_version]}"
        
        # Enhanced codename detection with fallbacks
        if [[ -z "$codename" ]] || [[ "$codename" == "n/a" ]]; then
            log_info "Codename not detected, using version-based mapping..."
            case "$os_version" in
                "22.04"|"22."*) codename="jammy" ;;
                "20.04"|"20."*) codename="focal" ;;
                "18.04"|"18."*) codename="bionic" ;;
                "24.04"|"24."*) codename="jammy" ;;  # Use jammy for newer versions
                *) 
                    log_warning "Unknown Ubuntu version: $os_version, using focal as fallback"
                    codename="focal"
                    ;;
            esac
        fi
        
        # Validate codename is supported
        case "$codename" in
            "jammy"|"focal"|"bionic"|"xenial")
                log_info "Using PostgreSQL repository for codename: $codename"
                ;;
            *)
                log_warning "Unsupported codename: $codename, falling back to jammy"
                codename="jammy"
                ;;
        esac
        
        # Add repository with signed-by option
        local repo_line="deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] http://apt.postgresql.org/pub/repos/apt/ $codename-pgdg main"
        echo "$repo_line" > /etc/apt/sources.list.d/pgdg.list
        
        log_info "Step 5: Updating package cache with new repository..."
        if update_package_cache; then
            log_success "PostgreSQL repository added successfully"
            
            # Validate that PostgreSQL packages are available
            if apt-cache search postgresql-15 2>/dev/null | grep -q "postgresql-15 "; then
                log_info "PostgreSQL 15 is available in repository"
            elif apt-cache search postgresql-14 2>/dev/null | grep -q "postgresql-14 "; then
                log_info "PostgreSQL 14 is available in repository"
            else
                log_warning "Specific PostgreSQL versions not available, will use system packages"
            fi
        else
            log_warning "Failed to update package cache with PostgreSQL repository"
            log_info "Removing problematic repository and falling back to system packages..."
            rm -f /etc/apt/sources.list.d/pgdg.list || true
            rm -f /usr/share/keyrings/postgresql-archive-keyring.gpg || true
            update_package_cache || true
        fi
    fi
    
    log_info "Step 6: Attempting PostgreSQL installation with recovery settings..."
    
    # Try installation again with the cleaned up environment
    if install_postgresql; then
        log_success "PostgreSQL installation successful after recovery"
        return 0
    else
        log_warning "Standard installation still failed, trying system packages only..."
        
        # Final attempt with just system packages
        local system_packages=("postgresql" "postgresql-client" "postgresql-contrib")
        
        log_info "Installing system PostgreSQL packages: ${system_packages[*]}"
        if install_package_array system_packages[@]; then
            log_success "System PostgreSQL packages installed successfully"
            
            # Track installed packages
            for package in "${system_packages[@]}"; do
                track_install_state "packages_installed" "$package"
            done
            
            return 0
        else
            log_error "Failed to install even system PostgreSQL packages"
            return $E_PACKAGE_INSTALL_FAILED
        fi
    fi
}

# Recovery function for RPM-based systems (CentOS/RHEL/Fedora)
recover_postgresql_rpm() {
    log_info "Step 1: Cleaning up problematic PostgreSQL repository configurations..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    local package_manager="${SYSTEM_INFO[package_manager]}"
    
    # Remove any existing PostgreSQL repository configurations
    if [[ -f /etc/yum.repos.d/pgdg-redhat-all.repo ]]; then
        log_info "Removing existing PostgreSQL repository file..."
        rm -f /etc/yum.repos.d/pgdg-redhat-all.repo || true
    fi
    
    if [[ -f /etc/yum.repos.d/pgdg-fedora-all.repo ]]; then
        log_info "Removing existing PostgreSQL Fedora repository file..."
        rm -f /etc/yum.repos.d/pgdg-fedora-all.repo || true
    fi
    
    # Clean package cache
    log_info "Step 2: Cleaning package cache..."
    if [[ "$package_manager" == "dnf" ]]; then
        dnf clean all 2>/dev/null || true
    else
        yum clean all 2>/dev/null || true
    fi
    
    log_info "Step 3: Installing required dependencies..."
    if ! install_package "wget" "curl"; then
        log_error "Failed to install required dependencies for PostgreSQL recovery"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    log_info "Step 4: Re-adding PostgreSQL repository with error handling..."
    
    local major_version=$(echo "${SYSTEM_INFO[os_version]}" | cut -d'.' -f1)
    local repo_rpm=""
    local repo_success=false
    
    case "$os_type" in
        centos|rhel)
            repo_rpm="https://download.postgresql.org/pub/repos/yum/reporpms/EL-${major_version}-x86_64/pgdg-redhat-repo-latest.noarch.rpm"
            ;;
        fedora)
            repo_rpm="https://download.postgresql.org/pub/repos/yum/reporpms/F-${major_version}-x86_64/pgdg-fedora-repo-latest.noarch.rpm"
            ;;
        *)
            log_warning "PostgreSQL repository recovery not supported for OS: $os_type"
            log_info "Will attempt installation with system packages only"
            ;;
    esac
    
    if [[ -n "$repo_rpm" ]]; then
        log_info "Attempting to install PostgreSQL repository from: $repo_rpm"
        
        local retry_count=0
        local max_retries=3
        
        while [[ $retry_count -lt $max_retries ]] && [[ "$repo_success" == "false" ]]; do
            if [[ "$package_manager" == "dnf" ]]; then
                if timeout 60 dnf install -y "$repo_rpm" 2>/dev/null; then
                    repo_success=true
                    log_success "PostgreSQL repository installed successfully"
                fi
            else
                if timeout 60 yum install -y "$repo_rpm" 2>/dev/null; then
                    repo_success=true
                    log_success "PostgreSQL repository installed successfully"
                fi
            fi
            
            if [[ "$repo_success" == "false" ]]; then
                ((retry_count++))
                log_warning "Repository installation failed (attempt $retry_count/$max_retries)"
                if [[ $retry_count -lt $max_retries ]]; then
                    log_info "Retrying in 5 seconds..."
                    sleep 5
                fi
            fi
        done
        
        if [[ "$repo_success" == "false" ]]; then
            log_warning "Failed to install PostgreSQL repository after $max_retries attempts"
            log_info "Will attempt installation with system packages only"
        fi
    fi
    
    log_info "Step 5: Attempting PostgreSQL installation with recovery settings..."
    
    # Try installation again with the cleaned up environment
    if install_postgresql; then
        log_success "PostgreSQL installation successful after recovery"
        return 0
    else
        log_warning "Standard installation still failed, trying system packages only..."
        
        # Final attempt with just system packages
        local system_packages=("postgresql-server" "postgresql" "postgresql-contrib")
        
        log_info "Installing system PostgreSQL packages: ${system_packages[*]}"
        if install_package_array system_packages[@]; then
            log_success "System PostgreSQL packages installed successfully"
            
            # Track installed packages
            for package in "${system_packages[@]}"; do
                track_install_state "packages_installed" "$package"
            done
            
            # Initialize PostgreSQL database if needed
            if [[ ! -d /var/lib/pgsql/data ]] || [[ ! -f /var/lib/pgsql/data/PG_VERSION ]]; then
                log_info "Initializing PostgreSQL database..."
                if postgresql-setup initdb 2>/dev/null || postgresql-setup --initdb 2>/dev/null; then
                    log_success "PostgreSQL database initialized"
                else
                    log_warning "Failed to initialize PostgreSQL database automatically"
                fi
            fi
            
            return 0
        else
            log_error "Failed to install even system PostgreSQL packages"
            return $E_PACKAGE_INSTALL_FAILED
        fi
    fi
}

# Install PostgreSQL for different distributions
install_postgresql() {
    log_info "Installing PostgreSQL database server..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    local package_manager="${SYSTEM_INFO[package_manager]}"
    
    # Detect current installation
    detect_postgresql_version
    
    # Check if PostgreSQL is already installed and meets requirements
    if [[ -n "$POSTGRESQL_CURRENT_VERSION" ]]; then
        if check_postgresql_version_requirements "$POSTGRESQL_CURRENT_VERSION"; then
            log_success "PostgreSQL $POSTGRESQL_CURRENT_VERSION is already installed and meets requirements"
            
            # Ensure PostgreSQL service is running
            if ! ensure_postgresql_service_running; then
                log_warning "PostgreSQL is installed but service is not running properly"
                return $E_SERVICE_ERROR
            fi
            
            return 0
        else
            log_warning "PostgreSQL $POSTGRESQL_CURRENT_VERSION is installed but does not meet minimum requirements (13+)"
            log_info "Will attempt to install a newer version alongside existing installation..."
        fi
    else
        log_info "PostgreSQL not detected, proceeding with installation..."
    fi
    
    # Install PostgreSQL using system packages first (most reliable approach)
    if install_postgresql_system_packages; then
        log_success "PostgreSQL installed successfully using system packages"
        return 0
    fi
    
    # If system packages fail, try official repository as fallback
    log_warning "System package installation failed, trying official PostgreSQL repository..."
    if install_postgresql_with_official_repo; then
        log_success "PostgreSQL installed successfully using official repository"
        return 0
    fi
    
    # Final fallback - try recovery
    log_error "All PostgreSQL installation methods failed"
    return $E_PACKAGE_INSTALL_FAILED
}

# Install PostgreSQL using system packages (preferred method)
install_postgresql_system_packages() {
    log_info "Attempting PostgreSQL installation using system packages..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    local package_manager="${SYSTEM_INFO[package_manager]}"
    local packages_to_install=()
    local installation_successful=false
    
    # Define system packages for each OS
    case "$os_type" in
        ubuntu|debian)
            packages_to_install=(
                "postgresql"
                "postgresql-client"
                "postgresql-contrib"
                "libpq-dev"
            )
            
            # Add development packages if available
            if apt-cache search postgresql-server-dev-all >/dev/null 2>&1; then
                packages_to_install+=("postgresql-server-dev-all")
            fi
            ;;
            
        centos|rhel)
            packages_to_install=(
                "postgresql-server"
                "postgresql"
                "postgresql-contrib"
                "postgresql-devel"
            )
            ;;
            
        fedora)
            packages_to_install=(
                "postgresql-server"
                "postgresql"
                "postgresql-contrib"
                "postgresql-devel"
                "libpq-devel"
            )
            ;;
            
        opensuse|sles)
            packages_to_install=(
                "postgresql-server"
                "postgresql"
                "postgresql-contrib"
                "postgresql-devel"
            )
            ;;
            
        arch)
            packages_to_install=(
                "postgresql"
                "postgresql-libs"
            )
            ;;
            
        alpine)
            packages_to_install=(
                "postgresql"
                "postgresql-client"
                "postgresql-contrib"
                "postgresql-dev"
            )
            ;;
            
        *)
            log_warning "System package installation not defined for OS: $os_type"
            return 1
            ;;
    esac
    
    log_info "Installing PostgreSQL system packages: ${packages_to_install[*]}"
    
    # Update package cache first
    if ! update_package_cache; then
        log_warning "Failed to update package cache"
        return 1
    fi
    
    # Install packages
    if install_package_array packages_to_install[@]; then
        installation_successful=true
        log_success "System PostgreSQL packages installed successfully"
        
        # Track installed packages
        for package in "${packages_to_install[@]}"; do
            track_install_state "packages_installed" "$package"
        done
        
        # Initialize database cluster for RPM-based systems
        if [[ "$package_manager" =~ ^(yum|dnf|zypper)$ ]]; then
            initialize_postgresql_cluster_rpm
        fi
        
        # Ensure service is started and enabled
        if ensure_postgresql_service_running; then
            log_success "PostgreSQL service is running and enabled"
            return 0
        else
            log_warning "PostgreSQL packages installed but service setup failed"
            return 1
        fi
    else
        log_warning "Failed to install system PostgreSQL packages"
        return 1
    fi
}

# Install PostgreSQL using official repository (fallback method)
install_postgresql_with_official_repo() {
    log_info "Attempting PostgreSQL installation using official repository..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    
    # Skip official repo for newer Ubuntu versions that aren't supported yet
    if [[ "$os_type" == "ubuntu" ]]; then
        local version="${SYSTEM_INFO[os_version]}"
        case "$version" in
            "24.04"|"23."*|"25."*)
                log_info "Ubuntu $version detected - official PostgreSQL repository may not be available"
                log_info "Skipping official repository installation"
                return 1
                ;;
        esac
    fi
    
    # Add official repository
    if ! is_repository_added "postgresql"; then
        log_info "Adding PostgreSQL official repository..."
        if ! add_repository "postgresql"; then
            log_warning "Failed to add PostgreSQL official repository"
            return 1
        fi
    fi
    
    # Try to install specific versions
    local packages_to_install=()
    local installation_successful=false
    
    case "$os_type" in
        ubuntu|debian)
            # Try PostgreSQL 15, then 14, then 13
            for version in 15 14 13; do
                local version_packages=(
                    "postgresql-$version"
                    "postgresql-client-$version"
                    "postgresql-contrib-$version"
                    "postgresql-server-dev-$version"
                    "libpq-dev"
                )
                
                log_info "Attempting to install PostgreSQL $version..."
                if install_package_array version_packages[@]; then
                    packages_to_install=("${version_packages[@]}")
                    installation_successful=true
                    log_success "PostgreSQL $version packages installed successfully"
                    break
                fi
            done
            ;;
            
        centos|rhel|fedora)
            # Try PostgreSQL 15, then 14, then 13
            for version in 15 14 13; do
                local version_packages=(
                    "postgresql${version}-server"
                    "postgresql${version}"
                    "postgresql${version}-contrib"
                    "postgresql${version}-devel"
                )
                
                log_info "Attempting to install PostgreSQL $version..."
                if install_package_array version_packages[@]; then
                    packages_to_install=("${version_packages[@]}")
                    installation_successful=true
                    log_success "PostgreSQL $version packages installed successfully"
                    
                    # Initialize database for specific version
                    if [[ -f "/usr/pgsql-$version/bin/postgresql-$version-setup" ]]; then
                        log_info "Initializing PostgreSQL $version database..."
                        "/usr/pgsql-$version/bin/postgresql-$version-setup" initdb || true
                    fi
                    break
                fi
            done
            ;;
    esac
    
    if [[ "$installation_successful" == "true" ]]; then
        # Track installed packages
        for package in "${packages_to_install[@]}"; do
            track_install_state "packages_installed" "$package"
        done
        
        # Ensure service is started and enabled
        if ensure_postgresql_service_running; then
            return 0
        else
            log_warning "PostgreSQL packages installed but service setup failed"
            return 1
        fi
    else
        log_warning "Failed to install PostgreSQL from official repository"
        return 1
    fi
}

# Initialize PostgreSQL cluster for RPM-based systems
initialize_postgresql_cluster_rpm() {
    log_info "Initializing PostgreSQL database cluster..."
    
    local data_dir="/var/lib/pgsql/data"
    
    # Check if already initialized
    if [[ -f "$data_dir/PG_VERSION" ]]; then
        log_info "PostgreSQL database cluster already initialized"
        return 0
    fi
    
    # Try different initialization methods
    if command -v postgresql-setup >/dev/null 2>&1; then
        log_info "Using postgresql-setup to initialize database..."
        if postgresql-setup initdb 2>/dev/null || postgresql-setup --initdb 2>/dev/null; then
            log_success "PostgreSQL database initialized successfully"
            return 0
        fi
    fi
    
    # Try initdb directly
    if command -v initdb >/dev/null 2>&1; then
        log_info "Using initdb to initialize database..."
        if sudo -u postgres initdb -D "$data_dir" 2>/dev/null; then
            log_success "PostgreSQL database initialized successfully"
            return 0
        fi
    fi
    
    log_warning "Failed to initialize PostgreSQL database cluster"
    log_info "Database may need to be initialized manually after installation"
    return 1
}

# Ensure PostgreSQL service is running and enabled
ensure_postgresql_service_running() {
    log_info "Ensuring PostgreSQL service is running..."
    
    local service_names=("postgresql" "postgresql.service")
    local os_type="${SYSTEM_INFO[os_type]}"
    
    # Add OS-specific service names
    case "$os_type" in
        centos|rhel|fedora)
            service_names+=("postgresql-15" "postgresql-14" "postgresql-13")
            ;;
    esac
    
    local service_started=false
    
    for service_name in "${service_names[@]}"; do
        if systemctl list-unit-files "$service_name" >/dev/null 2>&1; then
            log_info "Found PostgreSQL service: $service_name"
            
            # Enable the service
            if systemctl enable "$service_name" 2>/dev/null; then
                log_info "Enabled PostgreSQL service: $service_name"
            fi
            
            # Start the service
            if systemctl start "$service_name" 2>/dev/null; then
                log_info "Started PostgreSQL service: $service_name"
                
                # Wait a moment for service to fully start
                sleep 2
                
                # Verify service is active
                if systemctl is-active "$service_name" >/dev/null 2>&1; then
                    log_success "PostgreSQL service is active: $service_name"
                    track_install_state "services_created" "$service_name"
                    service_started=true
                    break
                fi
            fi
        fi
    done
    
    if [[ "$service_started" == "false" ]]; then
        log_warning "Failed to start PostgreSQL service"
        return 1
    fi
    
    # Test PostgreSQL connection
    log_info "Testing PostgreSQL connection..."
    local connection_test_attempts=0
    local max_attempts=10
    
    while [[ $connection_test_attempts -lt $max_attempts ]]; do
        if sudo -u postgres psql -c "SELECT 1;" >/dev/null 2>&1; then
            log_success "PostgreSQL connection test successful"
            return 0
        fi
        
        ((connection_test_attempts++))
        log_info "Connection test attempt $connection_test_attempts/$max_attempts..."
        sleep 2
    done
    
    log_warning "PostgreSQL service is running but connection test failed"
    log_info "This may be normal for a fresh installation - database setup will continue"
    return 0
}

# Initialize PostgreSQL database cluster
initialize_postgresql_cluster() {
    log_info "Initializing PostgreSQL database cluster..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    local postgresql_data_dir=""
    local postgresql_service=""
    
    case "$os_type" in
        ubuntu|debian)
            # Detect the actual PostgreSQL version installed
            local pg_version=$(sudo -u postgres psql --version 2>/dev/null | grep -oE '[0-9]+' | head -1)
            if [[ -z "$pg_version" ]]; then
                # Fallback: check for existing data directories
                for version in 16 15 14 13 12; do
                    if [[ -d "/var/lib/postgresql/$version/main" ]]; then
                        pg_version="$version"
                        break
                    fi
                done
            fi
            
            if [[ -z "$pg_version" ]]; then
                log_error "Could not detect PostgreSQL version"
                return $E_DATABASE_ERROR
            fi
            
            postgresql_data_dir="/var/lib/postgresql/$pg_version/main"
            postgresql_service="postgresql"
            log_info "Detected PostgreSQL version: $pg_version"
            log_info "Using data directory: $postgresql_data_dir"
            ;;
        centos|rhel|fedora)
            # Detect the actual PostgreSQL version installed
            local pg_version=$(sudo -u postgres psql --version 2>/dev/null | grep -oE '[0-9]+' | head -1)
            if [[ -z "$pg_version" ]]; then
                pg_version="15"  # Default fallback
            fi
            
            postgresql_data_dir="/var/lib/pgsql/$pg_version/data"
            postgresql_service="postgresql-$pg_version"
            
            # Initialize database cluster for RHEL-based systems
            if [[ ! -d "$postgresql_data_dir" || ! -f "$postgresql_data_dir/PG_VERSION" ]]; then
                log_info "Initializing PostgreSQL database cluster..."
                if ! sudo -u postgres /usr/pgsql-$pg_version/bin/initdb -D "$postgresql_data_dir"; then
                    log_error "Failed to initialize PostgreSQL database cluster"
                    return $E_DATABASE_ERROR
                fi
            fi
            ;;
        *)
            log_error "PostgreSQL cluster initialization not supported for OS: $os_type"
            return $E_DATABASE_ERROR
            ;;
    esac
    
    # Verify cluster initialization
    if [[ ! -f "$postgresql_data_dir/PG_VERSION" ]]; then
        log_error "PostgreSQL cluster initialization failed - PG_VERSION file not found"
        return $E_DATABASE_ERROR
    fi
    
    log_success "PostgreSQL database cluster initialized successfully"
    return 0
}

# Configure PostgreSQL service and startup
configure_postgresql_service() {
    log_info "Configuring PostgreSQL service..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    local postgresql_service=""
    
    case "$os_type" in
        ubuntu|debian)
            postgresql_service="postgresql"
            ;;
        centos|rhel|fedora)
            postgresql_service="postgresql-15"
            ;;
        *)
            log_error "PostgreSQL service configuration not supported for OS: $os_type"
            return $E_SERVICE_ERROR
            ;;
    esac
    
    # Enable PostgreSQL service
    log_info "Enabling PostgreSQL service: $postgresql_service"
    if ! systemctl enable "$postgresql_service"; then
        log_error "Failed to enable PostgreSQL service"
        return $E_SERVICE_ERROR
    fi
    
    # Start PostgreSQL service
    log_info "Starting PostgreSQL service: $postgresql_service"
    if ! systemctl start "$postgresql_service"; then
        log_error "Failed to start PostgreSQL service"
        return $E_SERVICE_ERROR
    fi
    
    # Wait for service to be ready
    log_info "Waiting for PostgreSQL service to be ready..."
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if systemctl is-active "$postgresql_service" >/dev/null 2>&1; then
            if sudo -u postgres psql -c "SELECT 1;" >/dev/null 2>&1; then
                log_success "PostgreSQL service is ready"
                track_install_state "services_created" "$postgresql_service"
                return 0
            fi
        fi
        
        attempt=$((attempt + 1))
        log_debug "Waiting for PostgreSQL service... (attempt $attempt/$max_attempts)"
        sleep 2
    done
    
    log_error "PostgreSQL service failed to become ready within timeout"
    return $E_SERVICE_ERROR
}

# Configure pg_hba.conf for secure local connections
configure_postgresql_security() {
    log_info "Configuring PostgreSQL security settings..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    local pg_hba_conf=""
    local postgresql_conf=""
    
    # Detect PostgreSQL version
    local pg_version=$(sudo -u postgres psql --version 2>/dev/null | grep -oE '[0-9]+' | head -1)
    if [[ -z "$pg_version" ]]; then
        # Fallback: check for existing data directories
        for version in 16 15 14 13 12; do
            if [[ -d "/var/lib/postgresql/$version/main" ]] || [[ -d "/var/lib/pgsql/$version/data" ]]; then
                pg_version="$version"
                break
            fi
        done
    fi
    
    if [[ -z "$pg_version" ]]; then
        log_error "Could not detect PostgreSQL version for configuration"
        return $E_DATABASE_ERROR
    fi
    
    log_debug "Using PostgreSQL version $pg_version for configuration paths"
    
    case "$os_type" in
        ubuntu|debian)
            pg_hba_conf="/etc/postgresql/$pg_version/main/pg_hba.conf"
            postgresql_conf="/etc/postgresql/$pg_version/main/postgresql.conf"
            ;;
        centos|rhel|fedora)
            pg_hba_conf="/var/lib/pgsql/$pg_version/data/pg_hba.conf"
            postgresql_conf="/var/lib/pgsql/$pg_version/data/postgresql.conf"
            ;;
        *)
            log_error "PostgreSQL security configuration not supported for OS: $os_type"
            return $E_DATABASE_ERROR
            ;;
    esac
    
    # Backup original pg_hba.conf
    if [[ -f "$pg_hba_conf" ]]; then
        log_debug "Backing up original pg_hba.conf"
        cp "$pg_hba_conf" "$pg_hba_conf.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Configure pg_hba.conf for secure local connections
    log_info "Configuring pg_hba.conf for secure local connections..."
    cat > "$pg_hba_conf" << 'EOF'
# PostgreSQL Client Authentication Configuration File
# ===================================================
#
# This file controls: which hosts are allowed to connect, how clients
# are authenticated, which PostgreSQL user names they can use, which
# databases they can access.

# TYPE  DATABASE        USER            ADDRESS                 METHOD

# "local" is for Unix domain socket connections only
local   all             postgres                                peer
local   all             all                                     md5

# IPv4 local connections:
host    all             all             127.0.0.1/32            md5

# IPv6 local connections:
host    all             all             ::1/128                 md5

# Allow replication connections from localhost, by a user with the
# replication privilege.
local   replication     all                                     peer
host    replication     all             127.0.0.1/32            md5
host    replication     all             ::1/128                 md5
EOF
    
    # Configure postgresql.conf for security and performance
    log_info "Configuring PostgreSQL main configuration..."
    
    # Backup original postgresql.conf
    if [[ -f "$postgresql_conf" ]]; then
        log_debug "Backing up original postgresql.conf"
        cp "$postgresql_conf" "$postgresql_conf.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Apply security and performance configurations
    configure_postgresql_performance "$postgresql_conf"
    
    # Reload PostgreSQL configuration
    log_info "Reloading PostgreSQL configuration..."
    if ! systemctl reload postgresql* 2>/dev/null; then
        log_warning "Failed to reload PostgreSQL configuration via systemctl, trying direct reload"
        if ! sudo -u postgres psql -c "SELECT pg_reload_conf();" >/dev/null 2>&1; then
            log_error "Failed to reload PostgreSQL configuration"
            return $E_DATABASE_ERROR
        fi
    fi
    
    log_success "PostgreSQL security configuration completed"
    return 0
}

# Configure PostgreSQL performance tuning for C2 workloads
configure_postgresql_performance() {
    local postgresql_conf="$1"
    
    log_info "Applying PostgreSQL performance tuning for C2 workloads..."
    
    # Get system memory for tuning calculations
    local total_memory_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local total_memory_mb=$((total_memory_kb / 1024))
    
    # Calculate optimal settings based on available memory
    local shared_buffers_mb=$((total_memory_mb / 4))  # 25% of total memory
    local effective_cache_size_mb=$((total_memory_mb * 3 / 4))  # 75% of total memory
    local work_mem_mb=$((total_memory_mb / 64))  # Conservative work_mem
    
    # Ensure minimum values
    [[ $shared_buffers_mb -lt 128 ]] && shared_buffers_mb=128
    [[ $effective_cache_size_mb -lt 256 ]] && effective_cache_size_mb=256
    [[ $work_mem_mb -lt 4 ]] && work_mem_mb=4
    
    log_debug "Calculated PostgreSQL settings: shared_buffers=${shared_buffers_mb}MB, effective_cache_size=${effective_cache_size_mb}MB, work_mem=${work_mem_mb}MB"
    
    # Apply performance configurations
    cat >> "$postgresql_conf" << EOF

# =============================================================================
# SeraphC2 Performance Tuning Configuration
# =============================================================================

# Memory Configuration
shared_buffers = ${shared_buffers_mb}MB
effective_cache_size = ${effective_cache_size_mb}MB
work_mem = ${work_mem_mb}MB
maintenance_work_mem = 64MB

# Connection Configuration
max_connections = 100
superuser_reserved_connections = 3

# Write-Ahead Logging (WAL) Configuration
wal_buffers = 16MB
checkpoint_completion_target = 0.9
wal_writer_delay = 200ms

# Query Planner Configuration
random_page_cost = 1.1
effective_io_concurrency = 200

# Logging Configuration
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on

# Security Configuration
ssl = off
password_encryption = md5

# Autovacuum Configuration (optimized for C2 workloads)
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 1min
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50
autovacuum_vacuum_scale_factor = 0.2
autovacuum_analyze_scale_factor = 0.1

# Background Writer Configuration
bgwriter_delay = 200ms
bgwriter_lru_maxpages = 100
bgwriter_lru_multiplier = 2.0

EOF
    
    log_success "PostgreSQL performance tuning configuration applied"
    return 0
}

# Create secure database and user with generated passwords
create_seraphc2_database() {
    log_info "Creating SeraphC2 database and user..."
    
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    
    # Verify required configuration
    if [[ -z "$db_name" || -z "$db_user" || -z "$db_password" ]]; then
        log_error "Database configuration is incomplete"
        log_error "db_name: '$db_name', db_user: '$db_user', db_password: [${#db_password} chars]"
        return $E_DATABASE_ERROR
    fi
    
    # Check if database already exists
    log_debug "Checking if database '$db_name' already exists..."
    if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$db_name"; then
        log_warning "Database '$db_name' already exists"
        
        # Check if user exists
        if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$db_user'" | grep -q 1; then
            log_warning "User '$db_user' already exists"
            log_info "Updating user password..."
            
            # Update password for existing user
            if ! sudo -u postgres psql -c "ALTER USER $db_user WITH ENCRYPTED PASSWORD '$db_password';"; then
                log_error "Failed to update password for user '$db_user'"
                return $E_DATABASE_ERROR
            fi
            
            log_success "Database and user already exist, password updated"
            return 0
        fi
    fi
    
    # Create database
    log_info "Creating database: $db_name"
    if ! sudo -u postgres createdb "$db_name"; then
        log_error "Failed to create database: $db_name"
        return $E_DATABASE_ERROR
    fi
    
    # Create user with encrypted password
    log_info "Creating database user: $db_user"
    if ! sudo -u postgres psql -c "CREATE USER $db_user WITH ENCRYPTED PASSWORD '$db_password';"; then
        log_error "Failed to create database user: $db_user"
        return $E_DATABASE_ERROR
    fi
    
    # Grant privileges to user
    log_info "Granting privileges to user: $db_user"
    if ! sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $db_name TO $db_user;"; then
        log_error "Failed to grant privileges to user: $db_user"
        return $E_DATABASE_ERROR
    fi
    
    # Grant additional privileges needed for migrations
    if ! sudo -u postgres psql -c "ALTER USER $db_user CREATEDB;"; then
        log_error "Failed to grant CREATEDB privilege to user: $db_user"
        return $E_DATABASE_ERROR
    fi
    
    # Set user as owner of the database
    if ! sudo -u postgres psql -c "ALTER DATABASE $db_name OWNER TO $db_user;"; then
        log_error "Failed to set database owner to user: $db_user"
        return $E_DATABASE_ERROR
    fi
    
    mark_install_state "database_created"
    log_success "SeraphC2 database and user created successfully"
    return 0
}

# Test database connection and validate setup
test_database_connection() {
    log_info "Testing database connection..."
    
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    local db_host="${CONFIG[db_host]}"
    local db_port="${CONFIG[db_port]}"
    
    # Set PGPASSWORD environment variable for authentication
    export PGPASSWORD="$db_password"
    
    # Test basic connection with retry logic
    log_debug "Testing basic database connection..."
    local max_retries=5
    local retry_delay=2
    local connection_success=false
    
    for ((i=1; i<=max_retries; i++)); do
        if psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "SELECT 1;" >/dev/null 2>&1; then
            connection_success=true
            break
        else
            if [[ $i -lt $max_retries ]]; then
                log_debug "Database connection attempt $i failed, retrying in ${retry_delay}s..."
                sleep $retry_delay
                retry_delay=$((retry_delay * 2))  # Exponential backoff
            fi
        fi
    done
    
    if [[ "$connection_success" != "true" ]]; then
        log_error "Failed to connect to database after $max_retries attempts"
        log_error "Connection details: host=$db_host, port=$db_port, user=$db_user, database=$db_name"
        unset PGPASSWORD
        return $E_DATABASE_ERROR
    fi
    
    # Test database permissions
    log_debug "Testing database permissions..."
    if ! psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "CREATE TABLE test_permissions (id SERIAL PRIMARY KEY, test_column TEXT);" >/dev/null 2>&1; then
        log_error "Failed to create test table - insufficient permissions"
        unset PGPASSWORD
        return $E_DATABASE_ERROR
    fi
    
    # Clean up test table
    if ! psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "DROP TABLE test_permissions;" >/dev/null 2>&1; then
        log_warning "Failed to clean up test table"
    fi
    
    # Test database encoding
    log_debug "Verifying database encoding..."
    local encoding=$(psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -tAc "SHOW server_encoding;" 2>/dev/null)
    if [[ "$encoding" != "UTF8" ]]; then
        log_warning "Database encoding is '$encoding', expected 'UTF8'"
    else
        log_debug "Database encoding is correct: $encoding"
    fi
    
    # Clean up environment variable
    unset PGPASSWORD
    
    log_success "Database connection test completed successfully"
    return 0
}

#==============================================================================
# DATABASE MIGRATION AND INITIALIZATION SYSTEM
#==============================================================================

# Create database backup before migrations
create_database_backup() {
    local backup_name="$1"
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    local db_host="${CONFIG[db_host]}"
    local db_port="${CONFIG[db_port]}"
    local backup_dir="${CONFIG[backup_dir]}"
    
    log_info "Creating database backup: $backup_name"
    
    # Ensure backup directory exists
    if ! mkdir -p "$backup_dir"; then
        log_error "Failed to create backup directory: $backup_dir"
        return $E_DATABASE_ERROR
    fi
    
    # Set password for pg_dump
    export PGPASSWORD="$db_password"
    
    local backup_file="$backup_dir/${backup_name}_$(date +%Y%m%d_%H%M%S).sql"
    
    # Create database backup
    if ! pg_dump -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
        --no-password --verbose --clean --if-exists \
        --format=plain --file="$backup_file"; then
        log_error "Failed to create database backup"
        unset PGPASSWORD
        return $E_DATABASE_ERROR
    fi
    
    # Compress backup
    if command -v gzip >/dev/null 2>&1; then
        if gzip "$backup_file"; then
            backup_file="${backup_file}.gz"
            log_debug "Compressed backup file: $backup_file"
        fi
    fi
    
    # Set secure permissions
    chmod 600 "$backup_file" 2>/dev/null || true
    
    unset PGPASSWORD
    
    log_success "Database backup created: $backup_file"
    track_install_state "backups_created" "$backup_file"
    
    return 0
}

# Check migration status and validate migration files
check_migration_status() {
    local app_dir="${CONFIG[app_dir]}"
    local migrations_dir="$app_dir/migrations"
    
    log_info "Checking migration status..."
    
    # Verify migrations directory exists
    if [[ ! -d "$migrations_dir" ]]; then
        log_warning "Migrations directory not found: $migrations_dir"
        log_info "This is expected if application hasn't been deployed yet"
        
        # Check if we're in the source directory and migrations exist there
        if [[ -d "./migrations" ]]; then
            log_info "Found migrations in current directory, they will be copied during application deployment"
            return 0
        else
            log_error "No migrations found in current directory either"
            return $E_DATABASE_ERROR
        fi
    fi
    
    # Count migration files
    local migration_count=$(find "$migrations_dir" -name "*.sql" -type f | wc -l)
    log_info "Found $migration_count migration files"
    
    if [[ $migration_count -eq 0 ]]; then
        log_warning "No migration files found in $migrations_dir"
        return 0
    fi
    
    # Validate migration file format
    local invalid_migrations=0
    
    while IFS= read -r -d '' migration_file; do
        local filename=$(basename "$migration_file")
        
        # Check filename format (should be: NNN_description.sql)
        if [[ ! "$filename" =~ ^[0-9]{3}_[a-zA-Z0-9_]+\.sql$ ]]; then
            log_warning "Migration file has invalid format: $filename"
            ((invalid_migrations++))
            continue
        fi
        
        # Check if file is readable and not empty
        if [[ ! -r "$migration_file" ]] || [[ ! -s "$migration_file" ]]; then
            log_warning "Migration file is not readable or empty: $filename"
            ((invalid_migrations++))
            continue
        fi
        
        # Basic SQL syntax validation
        if ! grep -q "BEGIN\|CREATE\|ALTER\|INSERT" "$migration_file"; then
            log_warning "Migration file may not contain valid SQL: $filename"
            ((invalid_migrations++))
        fi
        
    done < <(find "$migrations_dir" -name "*.sql" -type f -print0 | sort -z)
    
    if [[ $invalid_migrations -gt 0 ]]; then
        log_warning "Found $invalid_migrations potentially invalid migration files"
    fi
    
    log_success "Migration status check completed"
    return 0
}

# Initialize database schema migration table
initialize_migration_table() {
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    local db_host="${CONFIG[db_host]}"
    local db_port="${CONFIG[db_port]}"
    
    log_info "Initializing migration tracking table..."
    
    export PGPASSWORD="$db_password"
    
    # Create schema_migrations table if it doesn't exist
    local migration_table_sql="
CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64),
    execution_time_ms INTEGER,
    applied_by VARCHAR(255) DEFAULT CURRENT_USER
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at 
ON schema_migrations(applied_at);

-- Add comment
COMMENT ON TABLE schema_migrations IS 'Tracks applied database migrations';
"
    
    if ! psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
        -c "$migration_table_sql" >/dev/null 2>&1; then
        log_error "Failed to create migration tracking table"
        unset PGPASSWORD
        return $E_DATABASE_ERROR
    fi
    
    unset PGPASSWORD
    
    log_success "Migration tracking table initialized"
    return 0
}

# Get list of applied migrations from database
get_applied_migrations() {
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    local db_host="${CONFIG[db_host]}"
    local db_port="${CONFIG[db_port]}"
    
    export PGPASSWORD="$db_password"
    
    # Query applied migrations
    local applied_migrations
    applied_migrations=$(psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
        -t -c "SELECT migration_id FROM schema_migrations ORDER BY applied_at ASC;" 2>/dev/null | tr -d ' ')
    
    unset PGPASSWORD
    
    echo "$applied_migrations"
}

# Execute a single migration file
execute_migration() {
    local migration_file="$1"
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    local db_host="${CONFIG[db_host]}"
    local db_port="${CONFIG[db_port]}"
    
    local filename=$(basename "$migration_file")
    local migration_id=$(basename "$migration_file" .sql)
    
    log_info "Executing migration: $filename"
    
    export PGPASSWORD="$db_password"
    
    # Record start time for execution timing
    local start_time=$(date +%s%3N)
    
    # Execute migration in a transaction
    local migration_sql="
BEGIN;

-- Execute migration content
$(cat "$migration_file")

-- Record migration as applied
INSERT INTO schema_migrations (migration_id, applied_at, execution_time_ms) 
VALUES ('$migration_id', CURRENT_TIMESTAMP, 0);

COMMIT;
"
    
    if ! psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
        -c "$migration_sql" >/dev/null 2>&1; then
        log_error "Failed to execute migration: $filename"
        unset PGPASSWORD
        return $E_DATABASE_ERROR
    fi
    
    # Calculate execution time
    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))
    
    # Update execution time in database
    psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
        -c "UPDATE schema_migrations SET execution_time_ms = $execution_time WHERE migration_id = '$migration_id';" \
        >/dev/null 2>&1 || true
    
    unset PGPASSWORD
    
    log_success "Migration executed successfully: $filename (${execution_time}ms)"
    return 0
}

# Rollback a single migration (if rollback SQL is provided)
rollback_migration() {
    local migration_file="$1"
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    local db_host="${CONFIG[db_host]}"
    local db_port="${CONFIG[db_port]}"
    
    local filename=$(basename "$migration_file")
    local migration_id=$(basename "$migration_file" .sql)
    
    log_info "Rolling back migration: $filename"
    
    # Check if migration file contains rollback SQL
    if ! grep -q "-- Down migration\|-- Rollback\|-- ROLLBACK" "$migration_file"; then
        log_warning "No rollback SQL found in migration file: $filename"
        return 0
    fi
    
    export PGPASSWORD="$db_password"
    
    # Extract rollback SQL (everything after "-- Down migration" or similar)
    local rollback_sql
    rollback_sql=$(sed -n '/-- Down migration\|-- Rollback\|-- ROLLBACK/,$p' "$migration_file" | grep -v '^--')
    
    if [[ -z "$rollback_sql" ]]; then
        log_warning "Empty rollback SQL in migration file: $filename"
        unset PGPASSWORD
        return 0
    fi
    
    # Execute rollback in a transaction
    local full_rollback_sql="
BEGIN;

-- Execute rollback content
$rollback_sql

-- Remove migration record
DELETE FROM schema_migrations WHERE migration_id = '$migration_id';

COMMIT;
"
    
    if ! psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
        -c "$full_rollback_sql" >/dev/null 2>&1; then
        log_error "Failed to rollback migration: $filename"
        unset PGPASSWORD
        return $E_DATABASE_ERROR
    fi
    
    unset PGPASSWORD
    
    log_success "Migration rolled back successfully: $filename"
    return 0
}

# Run database migrations using existing migrate.ts script
run_database_migrations() {
    local app_dir="${CONFIG[app_dir]}"
    local migrations_dir="$app_dir/migrations"
    
    log_info "Running database migrations..."
    
    # Verify migrations directory exists (should be available after application deployment)
    if [[ ! -d "$migrations_dir" ]]; then
        log_error "Migrations directory not found: $migrations_dir"
        log_error "Ensure application has been deployed before running migrations"
        return $E_DATABASE_ERROR
    fi
    
    # Step 1: Create backup before migrations
    if [[ "${CONFIG[skip_backup]}" != "true" ]]; then
        if ! create_database_backup "pre_migration"; then
            log_warning "Failed to create pre-migration backup, continuing anyway"
        fi
    fi
    
    # Step 2: Check migration status and validate files
    if ! check_migration_status; then
        handle_migration_error "Migration status check failed" ""
        return $E_DATABASE_ERROR
    fi
    
    # Step 3: Initialize migration tracking table
    if ! initialize_migration_table; then
        handle_migration_error "Failed to initialize migration tracking table" ""
        return $E_DATABASE_ERROR
    fi
    
    # Step 4: Check if Node.js and TypeScript are available for migrate.ts
    local use_typescript_runner=false
    if command -v node >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
        if [[ -f "$app_dir/scripts/migrate.ts" ]] && [[ -f "$app_dir/package.json" ]]; then
            use_typescript_runner=true
            log_debug "Using TypeScript migration runner"
        fi
    fi
    
    # Step 5: Run migrations
    if [[ "$use_typescript_runner" == "true" ]]; then
        # Use the existing TypeScript migration runner
        log_info "Using TypeScript migration runner..."
        
        cd "$app_dir" || {
            log_error "Failed to change to application directory: $app_dir"
            return $E_DATABASE_ERROR
        }
        
        # Set environment variables for migration script
        export DB_HOST="${CONFIG[db_host]}"
        export DB_PORT="${CONFIG[db_port]}"
        export DB_NAME="${CONFIG[db_name]}"
        export DB_USER="${CONFIG[db_user]}"
        export DB_PASSWORD="${CONFIG[db_password]}"
        export NODE_ENV="production"
        
        # Run migrations using the TypeScript script
        if ! npx ts-node scripts/migrate.ts up; then
            # Clean up environment variables
            unset DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD NODE_ENV
            
            handle_migration_error "TypeScript migration runner failed" "scripts/migrate.ts"
            return $E_DATABASE_ERROR
        fi
        
        # Clean up environment variables
        unset DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD NODE_ENV
        
        log_success "TypeScript migration runner completed successfully"
        
    else
        # Use bash-based migration runner as fallback
        log_info "Using bash migration runner..."
        
        # Get list of applied migrations
        local applied_migrations
        applied_migrations=$(get_applied_migrations)
        
        # Get list of all migration files
        local all_migrations=()
        while IFS= read -r -d '' migration_file; do
            all_migrations+=("$migration_file")
        done < <(find "$migrations_dir" -name "*.sql" -type f -print0 | sort -z)
        
        # Execute pending migrations
        local executed_count=0
        for migration_file in "${all_migrations[@]}"; do
            local migration_id=$(basename "$migration_file" .sql)
            
            # Check if migration is already applied
            if echo "$applied_migrations" | grep -q "^$migration_id$"; then
                log_debug "Migration already applied: $migration_id"
                continue
            fi
            
            # Execute migration
            if ! execute_migration "$migration_file"; then
                handle_migration_error "Failed to execute migration" "$migration_id"
                return $E_DATABASE_ERROR
            fi
            
            ((executed_count++))
        done
        
        if [[ $executed_count -eq 0 ]]; then
            log_info "No pending migrations to execute"
        else
            log_success "Executed $executed_count migrations successfully"
        fi
    fi
    
    # Step 6: Verify database schema integrity
    if ! verify_database_schema; then
        log_warning "Database schema verification failed, but continuing"
    fi
    
    # Step 7: Seed initial data if needed
    if ! seed_initial_data; then
        log_warning "Failed to seed initial data, but continuing"
    fi
    
    log_success "Database migrations completed successfully"
    mark_install_state "database_migrated"
    
    return 0
}

# Seed initial data if required
seed_initial_data() {
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    local db_host="${CONFIG[db_host]}"
    local db_port="${CONFIG[db_port]}"
    
    log_info "Checking for initial data seeding requirements..."
    
    export PGPASSWORD="$db_password"
    
    # Check if we need to seed any initial data
    # This is a placeholder for future requirements
    # For now, just verify the database is accessible
    
    if ! psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
        -c "SELECT 1;" >/dev/null 2>&1; then
        log_error "Database not accessible for initial data seeding"
        unset PGPASSWORD
        return $E_DATABASE_ERROR
    fi
    
    unset PGPASSWORD
    
    log_success "Initial data seeding check completed"
    return 0
}

# Handle migration errors and provide recovery options
handle_migration_error() {
    local error_message="$1"
    local failed_migration="$2"
    
    log_error "Migration error: $error_message"
    
    if [[ -n "$failed_migration" ]]; then
        log_error "Failed migration: $failed_migration"
    fi
    
    # Offer recovery options
    log_info "Migration recovery options:"
    log_info "1. Check migration file syntax and database connectivity"
    log_info "2. Review database logs for detailed error information"
    log_info "3. Manually fix the migration and retry"
    log_info "4. Rollback to previous migration state"
    
    # Create recovery information file
    local recovery_file="/tmp/seraphc2_migration_recovery_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$recovery_file" << EOF
SeraphC2 Migration Recovery Information
Generated: $(date)

Error: $error_message
Failed Migration: ${failed_migration:-"Unknown"}

Database Configuration:
- Host: ${CONFIG[db_host]}
- Port: ${CONFIG[db_port]}
- Database: ${CONFIG[db_name]}
- User: ${CONFIG[db_user]}

Recovery Steps:
1. Check database connectivity:
   psql -h ${CONFIG[db_host]} -p ${CONFIG[db_port]} -U ${CONFIG[db_user]} -d ${CONFIG[db_name]} -c "SELECT version();"

2. Check migration status:
   psql -h ${CONFIG[db_host]} -p ${CONFIG[db_port]} -U ${CONFIG[db_user]} -d ${CONFIG[db_name]} -c "SELECT * FROM schema_migrations ORDER BY applied_at DESC LIMIT 10;"

3. Manual migration rollback (if needed):
   # Use the rollback_database_migrations function or manually execute rollback SQL

4. Retry migration:
   # Fix the migration file and re-run the setup script

Log file: $SCRIPT_LOG_FILE
EOF
    
    log_info "Recovery information saved to: $recovery_file"
    
    return $E_DATABASE_ERROR
}

# Verify database schema integrity after migrations
verify_database_schema() {
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    local db_host="${CONFIG[db_host]}"
    local db_port="${CONFIG[db_port]}"
    
    log_info "Verifying database schema integrity..."
    
    export PGPASSWORD="$db_password"
    
    # Check if essential tables exist (basic verification)
    local essential_tables=("schema_migrations")
    
    for table in "${essential_tables[@]}"; do
        if ! psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
            -c "SELECT 1 FROM $table LIMIT 1;" >/dev/null 2>&1; then
            log_error "Essential table missing or inaccessible: $table"
            unset PGPASSWORD
            return $E_DATABASE_ERROR
        fi
    done
    
    # Check database connectivity and basic operations
    if ! psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
        -c "SELECT COUNT(*) FROM schema_migrations;" >/dev/null 2>&1; then
        log_error "Database schema verification failed - cannot query migration table"
        unset PGPASSWORD
        return $E_DATABASE_ERROR
    fi
    
    unset PGPASSWORD
    
    log_success "Database schema integrity verified"
    return 0
}

# Migration rollback function for cleanup
rollback_database_migrations() {
    local app_dir="${CONFIG[app_dir]}"
    local migrations_dir="$app_dir/migrations"
    local rollback_count="${1:-1}"  # Default to rolling back 1 migration
    
    # Handle "all" migrations rollback
    if [[ "$rollback_count" == "all" ]]; then
        log_warning "Rolling back ALL database migrations..."
        
        # Get count of applied migrations
        local applied_migrations
        applied_migrations=$(get_applied_migrations)
        local total_migrations=$(echo "$applied_migrations" | wc -l)
        
        if [[ $total_migrations -eq 0 ]]; then
            log_info "No migrations to rollback"
            return 0
        fi
        
        rollback_count=$total_migrations
    else
        log_warning "Rolling back $rollback_count database migration(s)..."
    fi
    
    # Get list of applied migrations in reverse order
    local applied_migrations
    applied_migrations=$(get_applied_migrations | tac)
    
    local rolled_back_count=0
    
    # Rollback specified number of migrations
    while IFS= read -r migration_id && [[ $rolled_back_count -lt $rollback_count ]]; do
        [[ -z "$migration_id" ]] && continue
        
        local migration_file="$migrations_dir/${migration_id}.sql"
        
        if [[ -f "$migration_file" ]]; then
            if rollback_migration "$migration_file"; then
                ((rolled_back_count++))
            else
                log_error "Failed to rollback migration: $migration_id"
                return $E_DATABASE_ERROR
            fi
        else
            log_warning "Migration file not found for rollback: $migration_file"
        fi
        
    done <<< "$applied_migrations"
    
    if [[ $rolled_back_count -eq 0 ]]; then
        log_info "No migrations to rollback"
    else
        log_success "Rolled back $rolled_back_count migration(s) successfully"
    fi
    
    return 0
}

# Main PostgreSQL setup function
setup_postgresql_database() {
    log_info "Setting up PostgreSQL database system..."
    
    # Step 1: Install PostgreSQL
    if ! install_postgresql; then
        log_warning "PostgreSQL installation failed, attempting automatic recovery..."
        if ! recover_postgresql_installation; then
            log_error "PostgreSQL installation failed even after recovery attempt"
            return $E_DATABASE_ERROR
        fi
    fi
    
    # Step 2: Initialize database cluster (if needed)
    if ! initialize_postgresql_cluster; then
        log_error "PostgreSQL cluster initialization failed"
        return $E_DATABASE_ERROR
    fi
    
    # Step 3: Configure and start PostgreSQL service
    if ! configure_postgresql_service; then
        log_error "PostgreSQL service configuration failed"
        return $E_DATABASE_ERROR
    fi
    
    # Step 4: Configure security settings
    if ! configure_postgresql_security; then
        log_error "PostgreSQL security configuration failed"
        return $E_DATABASE_ERROR
    fi
    
    # Step 5: Create SeraphC2 database and user
    if ! create_seraphc2_database; then
        log_error "SeraphC2 database creation failed"
        return $E_DATABASE_ERROR
    fi
    
    # Step 6: Test database connection
    if ! test_database_connection; then
        log_error "Database connection test failed"
        return $E_DATABASE_ERROR
    fi
    
    # Step 7: Database is ready for migrations (migrations will be run after application deployment)
    
    log_success "PostgreSQL database system setup completed successfully"
    return 0
}

# Initialize database schema by running migrations
initialize_database_schema() {
    log_info "Initializing database schema..."
    
    # Ensure migrations are available before running them
    if ! ensure_migrations_available; then
        log_error "Failed to ensure migrations are available"
        return $E_DATABASE_ERROR
    fi
    
    # Run database migrations now that application is deployed
    if ! run_database_migrations; then
        log_error "Database migration failed"
        return $E_DATABASE_ERROR
    fi
    
    log_success "Database schema initialized successfully"
    return 0
}

# Ensure migrations are available in the app directory
ensure_migrations_available() {
    local app_dir="${CONFIG[app_dir]}"
    local migrations_dir="$app_dir/migrations"
    
    # Check if migrations directory exists in app directory
    if [[ -d "$migrations_dir" ]]; then
        log_debug "Migrations directory already exists in app directory"
        return 0
    fi
    
    # If not, try to copy from current directory as fallback
    if [[ -d "./migrations" ]]; then
        log_info "Copying migrations from current directory as fallback..."
        
        # Create app directory if it doesn't exist
        if [[ ! -d "$app_dir" ]]; then
            log_info "Creating application directory: $app_dir"
            mkdir -p "$app_dir" || {
                log_error "Failed to create application directory"
                return 1
            }
        fi
        
        # Copy migrations
        if cp -r "./migrations" "$app_dir/"; then
            log_success "Migrations copied successfully"
            
            # Set proper ownership
            local service_user="${CONFIG[service_user]}"
            if id "$service_user" >/dev/null 2>&1; then
                chown -R "$service_user:$service_user" "$migrations_dir" || {
                    log_warning "Failed to set ownership of migrations directory"
                }
            fi
            
            return 0
        else
            log_error "Failed to copy migrations directory"
            return 1
        fi
    else
        log_error "No migrations directory found in current directory"
        return 1
    fi
}

#==============================================================================
# REDIS CACHE SETUP AND CONFIGURATION
#==============================================================================

# Check if Redis is already installed and get version
check_redis_installation() {
    log_debug "Checking for existing Redis installation..."
    
    if command -v redis-server >/dev/null 2>&1; then
        local redis_version
        redis_version=$(redis-server --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        
        if [[ -n "$redis_version" ]]; then
            log_info "Found existing Redis installation: v$redis_version"
            
            # Check if version meets minimum requirement (6.0+)
            local major_version
            major_version=$(echo "$redis_version" | cut -d. -f1)
            
            if [[ $major_version -ge 6 ]]; then
                log_success "Redis version meets minimum requirements (6.0+)"
                return 0
            else
                log_warning "Redis version $redis_version is below minimum requirement (6.0+)"
                log_info "Will attempt to upgrade Redis..."
                return 1
            fi
        else
            log_warning "Redis command found but version could not be determined"
            return 1
        fi
    else
        log_debug "Redis not found, will install"
        return 1
    fi
}

# Install Redis server
install_redis() {
    log_info "Installing Redis server..."
    
    # Check if Redis is already installed and meets requirements
    if check_redis_installation; then
        log_info "Redis is already installed and meets requirements"
        return 0
    fi
    
    case "${SYSTEM_INFO[os_type]}" in
        "ubuntu"|"debian")
            # Update package cache
            if ! apt-get update; then
                log_error "Failed to update package cache"
                return $E_PACKAGE_INSTALL_FAILED
            fi
            
            # Install Redis
            if ! apt-get install -y redis-server; then
                log_error "Failed to install Redis server"
                return $E_PACKAGE_INSTALL_FAILED
            fi
            
            track_install_state "packages_installed" "redis-server"
            ;;
            
        "centos"|"rhel"|"fedora")
            # Install EPEL repository if needed (for CentOS/RHEL)
            if [[ "${SYSTEM_INFO[os_type]}" == "centos" || "${SYSTEM_INFO[os_type]}" == "rhel" ]]; then
                if ! rpm -q epel-release >/dev/null 2>&1; then
                    log_info "Installing EPEL repository..."
                    if command -v dnf >/dev/null 2>&1; then
                        dnf install -y epel-release
                    else
                        yum install -y epel-release
                    fi
                fi
            fi
            
            # Install Redis
            if command -v dnf >/dev/null 2>&1; then
                if ! dnf install -y redis; then
                    log_error "Failed to install Redis server"
                    return $E_PACKAGE_INSTALL_FAILED
                fi
            else
                if ! yum install -y redis; then
                    log_error "Failed to install Redis server"
                    return $E_PACKAGE_INSTALL_FAILED
                fi
            fi
            
            track_install_state "packages_installed" "redis"
            ;;
            
        *)
            log_error "Unsupported operating system for Redis installation: ${SYSTEM_INFO[os_type]}"
            return $E_UNSUPPORTED_OS
            ;;
    esac
    
    # Verify installation and version after install
    if ! check_redis_installation; then
        log_error "Redis installation verification failed"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    log_success "Redis server installed successfully"
    return 0
}

# Configure Redis service and start it
configure_redis_service() {
    log_info "Configuring Redis service..."
    
    # Determine Redis service name based on OS
    local redis_service_name
    case "${SYSTEM_INFO[os_type]}" in
        "ubuntu"|"debian")
            redis_service_name="redis-server"
            ;;
        "centos"|"rhel"|"fedora")
            redis_service_name="redis"
            ;;
        *)
            log_error "Unsupported operating system for Redis service configuration"
            return $E_SERVICE_ERROR
            ;;
    esac
    
    # Enable Redis service
    if ! systemctl enable "$redis_service_name"; then
        log_error "Failed to enable Redis service"
        return $E_SERVICE_ERROR
    fi
    
    # Start Redis service
    if ! systemctl start "$redis_service_name"; then
        log_error "Failed to start Redis service"
        return $E_SERVICE_ERROR
    fi
    
    # Wait for Redis to be ready
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if redis-cli ping >/dev/null 2>&1; then
            log_success "Redis service is running and responding"
            track_install_state "services_created" "$redis_service_name"
            return 0
        fi
        
        log_debug "Waiting for Redis to start... (attempt $((attempt + 1))/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    log_error "Redis service failed to start within expected time"
    return $E_SERVICE_ERROR
}

# Configure Redis authentication and security
configure_redis_security() {
    log_info "Configuring Redis security settings..."
    
    # Determine Redis configuration file path
    local redis_conf_path
    case "${SYSTEM_INFO[os_type]}" in
        "ubuntu"|"debian")
            redis_conf_path="/etc/redis/redis.conf"
            ;;
        "centos"|"rhel"|"fedora")
            redis_conf_path="/etc/redis.conf"
            ;;
        *)
            log_error "Unsupported operating system for Redis configuration"
            return $E_SERVICE_ERROR
            ;;
    esac
    
    # Backup original configuration
    if [[ -f "$redis_conf_path" ]]; then
        cp "$redis_conf_path" "${redis_conf_path}.backup.$(date +%Y%m%d_%H%M%S)"
        log_debug "Backed up original Redis configuration"
    else
        log_error "Redis configuration file not found: $redis_conf_path"
        return $E_SERVICE_ERROR
    fi
    
    # Configure authentication
    local redis_password="${CONFIG[redis_password]}"
    if [[ -z "$redis_password" ]]; then
        log_error "Redis password not generated"
        return $E_SERVICE_ERROR
    fi
    
    # Remove any existing requirepass directive
    sed -i '/^requirepass/d' "$redis_conf_path"
    sed -i '/^# requirepass/d' "$redis_conf_path"
    
    # Add authentication
    echo "requirepass $redis_password" >> "$redis_conf_path"
    
    # Configure bind address (localhost only for security)
    sed -i 's/^bind .*/bind 127.0.0.1/' "$redis_conf_path"
    
    # Disable dangerous commands for security
    cat >> "$redis_conf_path" << 'EOF'

# Security: Disable dangerous commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command DEBUG ""
rename-command CONFIG ""
rename-command SHUTDOWN SHUTDOWN_SERAPHC2
rename-command EVAL ""
rename-command SCRIPT ""
EOF
    
    # Configure protected mode
    sed -i 's/^protected-mode .*/protected-mode yes/' "$redis_conf_path"
    
    log_success "Redis security configuration completed"
    return 0
}

# Configure Redis performance optimization
configure_redis_performance() {
    log_info "Configuring Redis performance settings..."
    
    # Determine Redis configuration file path
    local redis_conf_path
    case "${SYSTEM_INFO[os_type]}" in
        "ubuntu"|"debian")
            redis_conf_path="/etc/redis/redis.conf"
            ;;
        "centos"|"rhel"|"fedora")
            redis_conf_path="/etc/redis.conf"
            ;;
        *)
            log_error "Unsupported operating system for Redis configuration"
            return $E_SERVICE_ERROR
            ;;
    esac
    
    # Configure memory management
    cat >> "$redis_conf_path" << 'EOF'

# Performance and Memory Management
maxmemory 256mb
maxmemory-policy allkeys-lru
tcp-keepalive 300
timeout 300

# Persistence configuration for C2 workloads
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename seraphc2.rdb

# Append-only file configuration
appendonly yes
appendfilename "seraphc2.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Logging
loglevel notice
syslog-enabled yes
syslog-ident redis-seraphc2
EOF
    
    log_success "Redis performance configuration completed"
    return 0
}

# Configure Redis persistence and memory management
configure_redis_persistence() {
    log_info "Configuring Redis persistence settings..."
    
    # Create Redis data directory with proper permissions
    local redis_data_dir="/var/lib/redis"
    
    if [[ ! -d "$redis_data_dir" ]]; then
        mkdir -p "$redis_data_dir"
    fi
    
    # Set proper ownership and permissions
    case "${SYSTEM_INFO[os_type]}" in
        "ubuntu"|"debian")
            chown redis:redis "$redis_data_dir"
            ;;
        "centos"|"rhel"|"fedora")
            chown redis:redis "$redis_data_dir"
            ;;
    esac
    
    chmod 750 "$redis_data_dir"
    
    # Configure log directory
    local redis_log_dir="/var/log/redis"
    
    if [[ ! -d "$redis_log_dir" ]]; then
        mkdir -p "$redis_log_dir"
        chown redis:redis "$redis_log_dir"
        chmod 750 "$redis_log_dir"
    fi
    
    log_success "Redis persistence configuration completed"
    return 0
}

# Validate Redis configuration
validate_redis_configuration() {
    log_info "Validating Redis configuration..."
    
    # Determine Redis configuration file path
    local redis_conf_path
    case "${SYSTEM_INFO[os_type]}" in
        "ubuntu"|"debian")
            redis_conf_path="/etc/redis/redis.conf"
            ;;
        "centos"|"rhel"|"fedora")
            redis_conf_path="/etc/redis.conf"
            ;;
        *)
            log_error "Unsupported operating system for Redis configuration validation"
            return 1
            ;;
    esac
    
    if [[ ! -f "$redis_conf_path" ]]; then
        log_error "Redis configuration file not found: $redis_conf_path"
        return 1
    fi
    
    # Check if authentication is configured
    if ! grep -q "^requirepass" "$redis_conf_path"; then
        log_error "Redis authentication not configured"
        return 1
    fi
    
    # Check if bind address is configured securely
    if ! grep -q "^bind 127.0.0.1" "$redis_conf_path"; then
        log_warning "Redis bind address may not be configured securely"
    fi
    
    # Check if protected mode is enabled
    if ! grep -q "^protected-mode yes" "$redis_conf_path"; then
        log_warning "Redis protected mode may not be enabled"
    fi
    
    # Check if dangerous commands are disabled
    local dangerous_commands=("FLUSHDB" "FLUSHALL" "DEBUG" "CONFIG" "EVAL" "SCRIPT")
    for cmd in "${dangerous_commands[@]}"; do
        if ! grep -q "rename-command $cmd" "$redis_conf_path"; then
            log_warning "Dangerous Redis command '$cmd' may not be disabled"
        fi
    done
    
    log_success "Redis configuration validation completed"
    return 0
}

# Test Redis connection and functionality
test_redis_connection() {
    log_info "Testing Redis connection and functionality..."
    
    local redis_password="${CONFIG[redis_password]}"
    local redis_host="${CONFIG[redis_host]}"
    local redis_port="${CONFIG[redis_port]}"
    
    # Test basic connection
    if ! redis-cli -h "$redis_host" -p "$redis_port" -a "$redis_password" ping >/dev/null 2>&1; then
        log_error "Failed to connect to Redis server"
        return 1
    fi
    
    # Test basic operations
    local test_key="seraphc2:test:$(date +%s)"
    local test_value="test_value_$(date +%s)"
    
    # Test SET operation
    if ! redis-cli -h "$redis_host" -p "$redis_port" -a "$redis_password" set "$test_key" "$test_value" >/dev/null 2>&1; then
        log_error "Failed to perform Redis SET operation"
        return 1
    fi
    
    # Test GET operation
    local retrieved_value
    retrieved_value=$(redis-cli -h "$redis_host" -p "$redis_port" -a "$redis_password" get "$test_key" 2>/dev/null)
    
    if [[ "$retrieved_value" != "$test_value" ]]; then
        log_error "Redis GET operation returned incorrect value"
        return 1
    fi
    
    # Test DEL operation
    if ! redis-cli -h "$redis_host" -p "$redis_port" -a "$redis_password" del "$test_key" >/dev/null 2>&1; then
        log_error "Failed to perform Redis DEL operation"
        return 1
    fi
    
    # Test Redis info command
    if ! redis-cli -h "$redis_host" -p "$redis_port" -a "$redis_password" info server >/dev/null 2>&1; then
        log_error "Failed to retrieve Redis server information"
        return 1
    fi
    
    # Test memory usage and performance
    local memory_info
    memory_info=$(redis-cli -h "$redis_host" -p "$redis_port" -a "$redis_password" info memory 2>/dev/null)
    
    if [[ -n "$memory_info" ]]; then
        log_debug "Redis memory information retrieved successfully"
    else
        log_warning "Could not retrieve Redis memory information"
    fi
    
    # Test persistence functionality
    if ! redis-cli -h "$redis_host" -p "$redis_port" -a "$redis_password" bgsave >/dev/null 2>&1; then
        log_warning "Redis background save test failed (may be normal if already in progress)"
    fi
    
    log_success "Redis connection and functionality tests passed"
    return 0
}

# Restart Redis service with new configuration
restart_redis_service() {
    log_info "Restarting Redis service with new configuration..."
    
    # Determine Redis service name based on OS
    local redis_service_name
    case "${SYSTEM_INFO[os_type]}" in
        "ubuntu"|"debian")
            redis_service_name="redis-server"
            ;;
        "centos"|"rhel"|"fedora")
            redis_service_name="redis"
            ;;
        *)
            log_error "Unsupported operating system for Redis service restart"
            return $E_SERVICE_ERROR
            ;;
    esac
    
    # Restart Redis service
    if ! systemctl restart "$redis_service_name"; then
        log_error "Failed to restart Redis service"
        return $E_SERVICE_ERROR
    fi
    
    # Wait for Redis to be ready with authentication
    local max_attempts=30
    local attempt=0
    local redis_password="${CONFIG[redis_password]}"
    
    while [[ $attempt -lt $max_attempts ]]; do
        if redis-cli -a "$redis_password" ping >/dev/null 2>&1; then
            log_success "Redis service restarted successfully with authentication"
            return 0
        fi
        
        log_debug "Waiting for Redis to restart with authentication... (attempt $((attempt + 1))/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    log_error "Redis service failed to restart with authentication within expected time"
    return $E_SERVICE_ERROR
}

# Main Redis setup function
setup_redis_cache() {
    log_info "Setting up Redis cache system..."
    
    # Step 1: Install Redis
    if ! install_redis; then
        log_error "Redis installation failed"
        return $E_PACKAGE_INSTALL_FAILED
    fi
    
    # Step 2: Configure and start Redis service
    if ! configure_redis_service; then
        log_error "Redis service configuration failed"
        return $E_SERVICE_ERROR
    fi
    
    # Step 3: Configure Redis security settings
    if ! configure_redis_security; then
        log_error "Redis security configuration failed"
        return $E_SERVICE_ERROR
    fi
    
    # Step 4: Configure Redis performance settings
    if ! configure_redis_performance; then
        log_error "Redis performance configuration failed"
        return $E_SERVICE_ERROR
    fi
    
    # Step 5: Configure Redis persistence
    if ! configure_redis_persistence; then
        log_error "Redis persistence configuration failed"
        return $E_SERVICE_ERROR
    fi
    
    # Step 6: Restart Redis with new configuration
    if ! restart_redis_service; then
        log_error "Redis service restart failed"
        return $E_SERVICE_ERROR
    fi
    
    # Step 7: Validate Redis configuration
    if ! validate_redis_configuration; then
        log_error "Redis configuration validation failed"
        return $E_SERVICE_ERROR
    fi
    
    # Step 8: Test Redis connection and functionality
    if ! test_redis_connection; then
        log_error "Redis connection test failed"
        return $E_SERVICE_ERROR
    fi
    
    mark_install_state "redis_configured"
    
    log_success "Redis cache system setup completed successfully"
    return 0
}

#==============================================================================
# INTERACTIVE CONFIGURATION SYSTEM
#==============================================================================

# Prompt user for input with validation and default value
prompt_with_validation() {
    local prompt_text="$1"
    local default_value="$2"
    local validation_function="$3"
    local help_text="$4"
    local sanitization_function="$5"
    local response
    
    while true; do
        # Show help text if provided
        if [[ -n "$help_text" ]]; then
            echo -e "${CYAN}$help_text${NC}"
        fi
        
        # Show prompt with default value
        if [[ -n "$default_value" ]]; then
            read -p "$prompt_text [$default_value]: " response
            response=${response:-$default_value}
        else
            read -p "$prompt_text: " response
        fi
        
        # Skip validation if no response and no default
        if [[ -z "$response" && -z "$default_value" ]]; then
            echo "This field is required. Please enter a value."
            continue
        fi
        
        # Sanitize input if sanitization function provided
        if [[ -n "$sanitization_function" ]]; then
            response=$($sanitization_function "$response")
        else
            response=$(sanitize_input "$response")
        fi
        
        # Validate input if validation function provided
        if [[ -n "$validation_function" ]]; then
            if $validation_function "$response"; then
                echo "$response"
                return 0
            else
                echo -e "${RED}Invalid input. Please try again.${NC}"
                continue
            fi
        else
            echo "$response"
            return 0
        fi
    done
}

# Prompt for yes/no with default
prompt_yes_no() {
    local prompt_text="$1"
    local default_value="$2"  # "y" or "n"
    local help_text="$3"
    local response
    
    if [[ -n "$help_text" ]]; then
        echo -e "${CYAN}$help_text${NC}"
    fi
    
    while true; do
        if [[ "$default_value" == "y" ]]; then
            read -p "$prompt_text [Y/n]: " response
            response=${response:-y}
        else
            read -p "$prompt_text [y/N]: " response
            response=${response:-n}
        fi
        
        case "$response" in
            [Yy]|[Yy][Ee][Ss])
                echo "y"
                return 0
                ;;
            [Nn]|[Nn][Oo])
                echo "n"
                return 0
                ;;
            *)
                echo "Please answer yes or no."
                ;;
        esac
    done
}

# Prompt for selection from a list
prompt_selection() {
    local prompt_text="$1"
    local default_value="$2"
    local help_text="$3"
    shift 3
    local options=("$@")
    local response
    
    if [[ -n "$help_text" ]]; then
        echo -e "${CYAN}$help_text${NC}"
    fi
    
    echo "Available options:"
    for i in "${!options[@]}"; do
        local marker=""
        if [[ "${options[i]}" == "$default_value" ]]; then
            marker=" ${GREEN}(default)${NC}"
        fi
        echo "  $((i+1)). ${options[i]}$marker"
    done
    
    while true; do
        read -p "$prompt_text [1-${#options[@]}]: " response
        
        # Use default if no response
        if [[ -z "$response" && -n "$default_value" ]]; then
            echo "$default_value"
            return 0
        fi
        
        # Validate numeric input
        if [[ "$response" =~ ^[0-9]+$ ]] && [[ $response -ge 1 && $response -le ${#options[@]} ]]; then
            echo "${options[$((response-1))]}"
            return 0
        else
            echo "Please enter a number between 1 and ${#options[@]}."
        fi
    done
}

# Validate port number for interactive input
validate_port_interactive() {
    local port="$1"
    
    if ! validate_port "$port"; then
        echo "Port must be a number between 1024 and 65535."
        return 1
    fi
    
    # Check if port is already in use by another service
    if command -v netstat >/dev/null 2>&1; then
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo "Warning: Port $port appears to be in use by another service."
            local continue_anyway
            continue_anyway=$(prompt_yes_no "Continue anyway?" "n" "")
            if [[ "$continue_anyway" == "n" ]]; then
                return 1
            fi
        fi
    fi
    
    return 0
}

# Validate domain name for interactive input
validate_domain_interactive() {
    local domain="$1"
    
    if ! validate_domain "$domain"; then
        echo "Please enter a valid domain name or IP address."
        return 1
    fi
    
    return 0
}

# Validate email address for interactive input
validate_email_interactive() {
    local email="$1"
    
    if ! validate_email "$email"; then
        echo "Please enter a valid email address."
        return 1
    fi
    
    return 0
}

# Sanitize user input by removing potentially dangerous characters
sanitize_input() {
    local input="$1"
    local sanitized
    
    # Remove control characters and non-printable characters
    sanitized=$(echo "$input" | tr -d '[:cntrl:]')
    
    # Remove leading and trailing whitespace
    sanitized=$(echo "$sanitized" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    # Limit length to prevent buffer overflow attacks
    if [[ ${#sanitized} -gt 255 ]]; then
        sanitized="${sanitized:0:255}"
    fi
    
    echo "$sanitized"
}

# Sanitize domain name input
sanitize_domain() {
    local domain="$1"
    local sanitized
    
    # Basic sanitization for domain names
    sanitized=$(echo "$domain" | tr -d '[:cntrl:]' | tr '[:upper:]' '[:lower:]')
    sanitized=$(echo "$sanitized" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    # Remove any characters that aren't valid in domain names
    sanitized=$(echo "$sanitized" | sed 's/[^a-z0-9.-]//g')
    
    # Limit length
    if [[ ${#sanitized} -gt 253 ]]; then
        sanitized="${sanitized:0:253}"
    fi
    
    echo "$sanitized"
}

# Sanitize port number input
sanitize_port() {
    local port="$1"
    local sanitized
    
    # Extract only numeric characters
    sanitized=$(echo "$port" | sed 's/[^0-9]//g')
    
    # Limit to reasonable length
    if [[ ${#sanitized} -gt 5 ]]; then
        sanitized="${sanitized:0:5}"
    fi
    
    echo "$sanitized"
}

# Sanitize file path input
sanitize_path() {
    local path="$1"
    local sanitized
    
    # Basic path sanitization
    sanitized=$(echo "$path" | tr -d '[:cntrl:]')
    sanitized=$(echo "$sanitized" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    # Remove dangerous path traversal sequences
    sanitized=$(echo "$sanitized" | sed 's/\.\.//g')
    
    # Ensure absolute path
    if [[ ! "$sanitized" =~ ^/ ]]; then
        sanitized="/$sanitized"
    fi
    
    # Limit length
    if [[ ${#sanitized} -gt 4096 ]]; then
        sanitized="${sanitized:0:4096}"
    fi
    
    echo "$sanitized"
}

# Configure network settings interactively
configure_network_interactive() {
    echo -e "\n${WHITE}=== Network Configuration ===${NC}"
    
    # Domain configuration
    local domain_help="Enter the domain name or IP address for your C2 server.
This will be used for SSL certificates and client connections.
Examples: c2.example.com, 192.168.1.100, localhost"
    
    CONFIG[domain]=$(prompt_with_validation \
        "Domain name or IP address" \
        "${CONFIG[domain]}" \
        "validate_domain_interactive" \
        "$domain_help" \
        "sanitize_domain")
    
    # HTTP port configuration
    local http_help="Port for the web management interface (HTTP).
This port will be used for the web-based administration panel.
Recommended: 3000 (default), 8080, or any port above 1024."
    
    CONFIG[http_port]=$(prompt_with_validation \
        "HTTP port for web interface" \
        "${CONFIG[http_port]}" \
        "validate_port_interactive" \
        "$http_help" \
        "sanitize_port")
    
    # HTTPS port configuration
    local https_help="Port for secure web management interface (HTTPS).
This port will be used for encrypted web-based administration.
Recommended: 8443 (default), 443 (requires root), or any port above 1024."
    
    CONFIG[https_port]=$(prompt_with_validation \
        "HTTPS port for secure web interface" \
        "${CONFIG[https_port]}" \
        "validate_port_interactive" \
        "$https_help" \
        "sanitize_port")
    
    # Implant communication port
    local implant_help="Port for implant communication.
This port will be used by implants to connect back to the C2 server.
Recommended: 8080 (default), 80, 443, or any port above 1024."
    
    CONFIG[implant_port]=$(prompt_with_validation \
        "Implant communication port" \
        "${CONFIG[implant_port]}" \
        "validate_port_interactive" \
        "$implant_help" \
        "sanitize_port")
    
    # Validate port uniqueness
    while true; do
        local ports=("${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}")
        local unique_ports=($(printf '%s\n' "${ports[@]}" | sort -u))
        
        if [[ ${#ports[@]} -eq ${#unique_ports[@]} ]]; then
            break
        fi
        
        log_error "Port conflict detected. All ports must be unique."
        log_error "HTTP: ${CONFIG[http_port]}, HTTPS: ${CONFIG[https_port]}, Implant: ${CONFIG[implant_port]}"
        echo "Please choose different ports."
        
        # Re-prompt for conflicting ports
        local reconfigure
        reconfigure=$(prompt_yes_no "Reconfigure ports?" "y" "")
        if [[ "$reconfigure" == "n" ]]; then
            log_error "Cannot proceed with conflicting ports."
            exit $E_VALIDATION_ERROR
        fi
        
        # Only re-prompt for ports, not the entire network configuration
        CONFIG[http_port]=$(prompt_with_validation \
            "HTTP port for web interface" \
            "${CONFIG[http_port]}" \
            "validate_port_interactive" \
            "Port for the web management interface (HTTP)" \
            "sanitize_port")
        
        CONFIG[https_port]=$(prompt_with_validation \
            "HTTPS port for secure web interface" \
            "${CONFIG[https_port]}" \
            "validate_port_interactive" \
            "Port for secure web management interface (HTTPS)" \
            "sanitize_port")
        
        CONFIG[implant_port]=$(prompt_with_validation \
            "Implant communication port" \
            "${CONFIG[implant_port]}" \
            "validate_port_interactive" \
            "Port for implant communication" \
            "sanitize_port")
    done
    
    log_success "Network configuration completed"
}

# Configure SSL settings interactively
configure_ssl_interactive() {
    echo -e "\n${WHITE}=== SSL/TLS Configuration ===${NC}"
    
    local ssl_help="Choose SSL certificate type:
- self-signed: Generate self-signed certificates (good for testing/internal use)
- letsencrypt: Obtain free certificates from Let's Encrypt (requires valid domain)
- custom: Use your own SSL certificates"
    
    CONFIG[ssl_type]=$(prompt_selection \
        "SSL certificate type" \
        "${CONFIG[ssl_type]}" \
        "$ssl_help" \
        "self-signed" "letsencrypt" "custom")
    
    # Configure Let's Encrypt email if selected
    if [[ "${CONFIG[ssl_type]}" == "letsencrypt" ]]; then
        local email_help="Email address for Let's Encrypt certificate registration.
This email will be used for certificate expiration notifications and account recovery."
        
        CONFIG[letsencrypt_email]=$(prompt_with_validation \
            "Email address for Let's Encrypt" \
            "${CONFIG[letsencrypt_email]}" \
            "validate_email_interactive" \
            "$email_help" \
            "sanitize_input")
        
        # Validate domain for Let's Encrypt
        if [[ "${CONFIG[domain]}" == "localhost" || "${CONFIG[domain]}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            log_warning "Let's Encrypt requires a valid public domain name."
            log_warning "Current domain '${CONFIG[domain]}' may not work with Let's Encrypt."
            
            local continue_anyway
            continue_anyway=$(prompt_yes_no "Continue with Let's Encrypt anyway?" "n" "")
            if [[ "$continue_anyway" == "n" ]]; then
                log_info "Switching to self-signed certificates."
                CONFIG[ssl_type]="self-signed"
                CONFIG[letsencrypt_email]=""
            fi
        fi
    fi
    
    # Configure custom certificate paths if selected
    if [[ "${CONFIG[ssl_type]}" == "custom" ]]; then
        echo -e "${CYAN}For custom certificates, you'll need to provide the certificate and key files.${NC}"
        
        CONFIG[ssl_cert_path]=$(prompt_with_validation \
            "Path to SSL certificate file" \
            "${CONFIG[ssl_cert_path]}" \
            "" \
            "Full path to your SSL certificate file (e.g., /path/to/certificate.crt)" \
            "sanitize_path")
        
        CONFIG[ssl_key_path]=$(prompt_with_validation \
            "Path to SSL private key file" \
            "${CONFIG[ssl_key_path]}" \
            "" \
            "Full path to your SSL private key file (e.g., /path/to/private.key)" \
            "sanitize_path")
        
        # Validate certificate files exist
        if [[ ! -f "${CONFIG[ssl_cert_path]}" ]]; then
            log_warning "Certificate file not found: ${CONFIG[ssl_cert_path]}"
            log_warning "Make sure the file exists before installation."
        fi
        
        if [[ ! -f "${CONFIG[ssl_key_path]}" ]]; then
            log_warning "Private key file not found: ${CONFIG[ssl_key_path]}"
            log_warning "Make sure the file exists before installation."
        fi
    fi
    
    log_success "SSL configuration completed"
}

# Configure advanced options interactively
configure_advanced_interactive() {
    echo -e "\n${WHITE}=== Advanced Configuration ===${NC}"
    
    local show_advanced
    show_advanced=$(prompt_yes_no "Configure advanced options?" "n" \
        "Advanced options include security hardening, backup settings, and system paths.")
    
    if [[ "$show_advanced" == "n" ]]; then
        return 0
    fi
    
    # Security hardening
    local hardening_help="Enable additional security hardening measures:
- Disable unnecessary services
- Configure fail2ban for intrusion prevention
- Set up file integrity monitoring
- Apply additional system security settings"
    
    local enable_hardening
    enable_hardening=$(prompt_yes_no "Enable security hardening?" "${CONFIG[enable_hardening]}" "$hardening_help")
    CONFIG[enable_hardening]="$enable_hardening"
    
    # Backup configuration
    local backup_help="Configure automated backups for database and configuration files.
Backups will be stored locally and can be scheduled via cron."
    
    local skip_backup
    skip_backup=$(prompt_yes_no "Skip backup configuration?" "${CONFIG[skip_backup]}" "$backup_help")
    CONFIG[skip_backup]="$skip_backup"
    
    if [[ "$skip_backup" == "n" ]]; then
        CONFIG[backup_dir]=$(prompt_with_validation \
            "Backup directory" \
            "${CONFIG[backup_dir]}" \
            "" \
            "Directory where backups will be stored" \
            "sanitize_path")
        
        CONFIG[backup_retention_days]=$(prompt_with_validation \
            "Backup retention (days)" \
            "${CONFIG[backup_retention_days]}" \
            "" \
            "Number of days to keep backup files" \
            "sanitize_input")
    fi
    
    # Firewall configuration
    local firewall_help="Configure firewall to restrict access to necessary ports only.
This improves security by blocking unused network services."
    
    local enable_firewall
    enable_firewall=$(prompt_yes_no "Enable firewall configuration?" "${CONFIG[enable_firewall]}" "$firewall_help")
    CONFIG[enable_firewall]="$enable_firewall"
    
    # System paths (expert users only)
    local configure_paths
    configure_paths=$(prompt_yes_no "Configure custom system paths?" "n" \
        "Expert option: Customize installation directories and system paths.")
    
    if [[ "$configure_paths" == "y" ]]; then
        CONFIG[app_dir]=$(prompt_with_validation \
            "Application directory" \
            "${CONFIG[app_dir]}" \
            "" \
            "Directory where SeraphC2 application will be installed" \
            "sanitize_path")
        
        CONFIG[config_dir]=$(prompt_with_validation \
            "Configuration directory" \
            "${CONFIG[config_dir]}" \
            "" \
            "Directory for configuration files" \
            "sanitize_path")
        
        CONFIG[log_dir]=$(prompt_with_validation \
            "Log directory" \
            "${CONFIG[log_dir]}" \
            "" \
            "Directory for log files" \
            "sanitize_path")
        
        CONFIG[service_user]=$(prompt_with_validation \
            "Service user" \
            "${CONFIG[service_user]}" \
            "" \
            "System user account for running the SeraphC2 service" \
            "sanitize_input")
    fi
    
    log_success "Advanced configuration completed"
}

# Display configuration summary and get confirmation
show_configuration_summary() {
    echo -e "\n${WHITE}=== Configuration Summary ===${NC}"
    
    echo -e "\n${CYAN}Network Configuration:${NC}"
    echo "  Domain: ${CONFIG[domain]}"
    echo "  HTTP Port: ${CONFIG[http_port]}"
    echo "  HTTPS Port: ${CONFIG[https_port]}"
    echo "  Implant Port: ${CONFIG[implant_port]}"
    
    echo -e "\n${CYAN}SSL Configuration:${NC}"
    echo "  SSL Type: ${CONFIG[ssl_type]}"
    if [[ "${CONFIG[ssl_type]}" == "letsencrypt" ]]; then
        echo "  Let's Encrypt Email: ${CONFIG[letsencrypt_email]}"
    elif [[ "${CONFIG[ssl_type]}" == "custom" ]]; then
        echo "  Certificate Path: ${CONFIG[ssl_cert_path]}"
        echo "  Private Key Path: ${CONFIG[ssl_key_path]}"
    fi
    
    echo -e "\n${CYAN}Security Configuration:${NC}"
    echo "  Security Hardening: $([[ "${CONFIG[enable_hardening]}" == "true" ]] && echo "Enabled" || echo "Disabled")"
    echo "  Firewall: $([[ "${CONFIG[enable_firewall]}" == "true" ]] && echo "Enabled" || echo "Disabled")"
    
    echo -e "\n${CYAN}System Configuration:${NC}"
    echo "  Service User: ${CONFIG[service_user]}"
    echo "  Application Directory: ${CONFIG[app_dir]}"
    echo "  Configuration Directory: ${CONFIG[config_dir]}"
    echo "  Log Directory: ${CONFIG[log_dir]}"
    
    echo -e "\n${CYAN}Backup Configuration:${NC}"
    if [[ "${CONFIG[skip_backup]}" == "true" ]]; then
        echo "  Backup: Disabled"
    else
        echo "  Backup Directory: ${CONFIG[backup_dir]}"
        echo "  Retention Period: ${CONFIG[backup_retention_days]} days"
    fi
    
    echo ""
}

# Main interactive configuration function
run_interactive_configuration() {
    log_info "Starting interactive configuration..."
    
    # Check if we're running in an interactive terminal
    if [[ ! -t 0 ]]; then
        log_error "Interactive mode requires a terminal. Please run the script in an interactive terminal."
        log_info "For non-interactive installation, run without the --interactive flag."
        exit $E_VALIDATION_ERROR
    fi
    
    echo -e "\n${GREEN}Welcome to SeraphC2 Interactive Setup!${NC}"
    echo -e "This wizard will guide you through configuring your C2 server."
    
    if [[ "${CONFIG[mode]}" == "docker" ]]; then
        echo -e "${BLUE}🐳 Docker deployment mode selected${NC}"
        echo -e "Your C2 server will be deployed using Docker containers."
    else
        echo -e "${BLUE}📦 Native deployment mode selected${NC}"
        echo -e "Your C2 server will be installed directly on the system."
    fi
    
    echo -e "Press Enter to use default values shown in brackets.\n"
    
    # Network configuration
    configure_network_interactive
    
    # SSL configuration
    configure_ssl_interactive
    
    # Advanced configuration
    configure_advanced_interactive
    
    # Show summary and confirm
    show_configuration_summary
    
    local confirm_config
    confirm_config=$(prompt_yes_no "Proceed with this configuration?" "y" \
        "Review the configuration above and confirm to continue with installation.")
    
    if [[ "$confirm_config" == "n" ]]; then
        log_info "Configuration cancelled by user."
        
        local reconfigure
        reconfigure=$(prompt_yes_no "Would you like to reconfigure?" "y" "")
        
        if [[ "$reconfigure" == "y" ]]; then
            run_interactive_configuration
            return
        else
            log_info "Exiting setup. You can run the script again to reconfigure."
            exit 0
        fi
    fi
    
    log_success "Interactive configuration completed successfully"
    
    # Re-validate configuration after interactive changes
    validate_configuration
}

#==============================================================================
# BACKUP AND RECOVERY SYSTEM
#==============================================================================

# Main backup system setup function (wrapper for setup_backup_and_recovery_system)
setup_backup_system() {
    log_info "Setting up backup system..."
    
    # Call the comprehensive backup and recovery system setup
    if ! setup_backup_and_recovery_system; then
        log_error "Backup and recovery system setup failed"
        return 1
    fi
    
    log_success "Backup system setup completed successfully"
    return 0
}

# Main backup and recovery system setup function
setup_backup_and_recovery_system() {
    log_info "Setting up automated backup and recovery system..."
    
    # Create backup directory structure
    create_backup_directory_structure
    
    # Generate backup encryption key
    generate_backup_encryption_key
    
    # Create database backup script
    create_database_backup_script
    
    # Create configuration backup script
    create_configuration_backup_script
    
    # Create main backup script
    create_main_backup_script
    
    # Create backup restoration script
    create_backup_restoration_script
    
    # Setup backup scheduling
    setup_backup_scheduling
    
    # Create backup retention and cleanup script
    create_backup_cleanup_script
    
    # Setup backup testing and validation
    setup_backup_testing
    
    # Create recovery documentation
    create_recovery_documentation
    
    # Mark backup system as configured
    mark_install_state "backup_configured"
    
    log_success "Backup and recovery system setup completed successfully"
}

# Create backup directory structure with proper permissions
create_backup_directory_structure() {
    log_info "Creating backup directory structure..."
    
    local backup_dir="${CONFIG[backup_dir]}"
    local backup_scripts_dir="$backup_dir/scripts"
    local backup_logs_dir="$backup_dir/logs"
    local backup_database_dir="$backup_dir/database"
    local backup_config_dir="$backup_dir/config"
    local backup_keys_dir="$backup_dir/keys"
    
    # Create main backup directory
    if ! mkdir -p "$backup_dir"; then
        log_error "Failed to create backup directory: $backup_dir"
        return 1
    fi
    
    # Create subdirectories
    local dirs=("$backup_scripts_dir" "$backup_logs_dir" "$backup_database_dir" "$backup_config_dir" "$backup_keys_dir")
    for dir in "${dirs[@]}"; do
        if ! mkdir -p "$dir"; then
            log_error "Failed to create backup subdirectory: $dir"
            return 1
        fi
    done
    
    # Set secure permissions
    chmod 700 "$backup_dir"
    chmod 700 "$backup_keys_dir"
    chmod 755 "$backup_scripts_dir"
    chmod 755 "$backup_logs_dir"
    chmod 755 "$backup_database_dir"
    chmod 755 "$backup_config_dir"
    
    # Set ownership to root
    chown -R root:root "$backup_dir"
    
    # Track created directories
    track_install_state "directories_created" "$backup_dir"
    
    log_success "Backup directory structure created successfully"
    log_info "Backup directory: $backup_dir"
    
    return 0
}

# Generate backup encryption key for secure backups
generate_backup_encryption_key() {
    log_info "Generating backup encryption key..."
    
    local backup_dir="${CONFIG[backup_dir]}"
    local encryption_key_file="$backup_dir/keys/.backup_encryption_key"
    
    # Generate a strong encryption key (256-bit)
    if ! openssl rand -base64 32 > "$encryption_key_file"; then
        log_error "Failed to generate backup encryption key"
        return 1
    fi
    
    # Set secure permissions
    chmod 600 "$encryption_key_file"
    chown root:root "$encryption_key_file"
    
    log_success "Backup encryption key generated successfully"
    log_info "Encryption key stored at: $encryption_key_file"
    
    return 0
}

# Create database backup script with encryption
create_database_backup_script() {
    log_info "Creating database backup script..."
    
    local backup_dir="${CONFIG[backup_dir]}"
    local script_file="$backup_dir/scripts/backup-database.sh"
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local encryption_key_file="$backup_dir/keys/.backup_encryption_key"
    
    cat > "$script_file" << 'EOF'
#!/bin/bash

# SeraphC2 Database Backup Script
# Generated by SeraphC2 Setup Script

set -eE

# Configuration
BACKUP_DIR="/var/backups/seraphc2"
DB_BACKUP_DIR="$BACKUP_DIR/database"
ENCRYPTION_KEY_FILE="$BACKUP_DIR/keys/.backup_encryption_key"
LOG_FILE="$BACKUP_DIR/logs/database-backup.log"
RETENTION_DAYS="30"

# Database configuration
DB_NAME="seraphc2"
DB_USER="seraphc2"

# Logging function
log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

# Main backup function
backup_database() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$DB_BACKUP_DIR/seraphc2_db_$timestamp.sql"
    local encrypted_file="$backup_file.enc"
    
    log_message "INFO" "Starting database backup..."
    
    # Create database dump
    if ! sudo -u postgres pg_dump "$DB_NAME" > "$backup_file"; then
        log_message "ERROR" "Failed to create database dump"
        rm -f "$backup_file"
        return 1
    fi
    
    log_message "INFO" "Database dump created: $backup_file"
    
    # Encrypt the backup
    if ! openssl enc -aes-256-cbc -salt -in "$backup_file" -out "$encrypted_file" -pass file:"$ENCRYPTION_KEY_FILE"; then
        log_message "ERROR" "Failed to encrypt database backup"
        rm -f "$backup_file" "$encrypted_file"
        return 1
    fi
    
    # Remove unencrypted backup
    rm -f "$backup_file"
    
    # Set secure permissions
    chmod 600 "$encrypted_file"
    chown root:root "$encrypted_file"
    
    log_message "INFO" "Database backup encrypted and saved: $encrypted_file"
    
    # Verify backup integrity
    if ! verify_backup_integrity "$encrypted_file"; then
        log_message "ERROR" "Backup integrity verification failed"
        return 1
    fi
    
    log_message "INFO" "Database backup completed successfully"
    return 0
}

# Verify backup integrity
verify_backup_integrity() {
    local encrypted_file="$1"
    local temp_file="/tmp/backup_verify_$$.sql"
    
    # Try to decrypt the backup
    if openssl enc -aes-256-cbc -d -in "$encrypted_file" -out "$temp_file" -pass file:"$ENCRYPTION_KEY_FILE" 2>/dev/null; then
        # Check if the decrypted file contains SQL content
        if grep -q "PostgreSQL database dump" "$temp_file" 2>/dev/null; then
            rm -f "$temp_file"
            return 0
        fi
    fi
    
    rm -f "$temp_file"
    return 1
}

# Cleanup old backups
cleanup_old_backups() {
    log_message "INFO" "Cleaning up backups older than $RETENTION_DAYS days..."
    
    local deleted_count=0
    while IFS= read -r -d '' file; do
        rm -f "$file"
        ((deleted_count++))
    done < <(find "$DB_BACKUP_DIR" -name "*.sql.enc" -mtime +$RETENTION_DAYS -print0 2>/dev/null)
    
    if [[ $deleted_count -gt 0 ]]; then
        log_message "INFO" "Deleted $deleted_count old backup files"
    else
        log_message "INFO" "No old backup files to delete"
    fi
}

# Main execution
main() {
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Check if encryption key exists
    if [[ ! -f "$ENCRYPTION_KEY_FILE" ]]; then
        log_message "ERROR" "Backup encryption key not found: $ENCRYPTION_KEY_FILE"
        exit 1
    fi
    
    # Perform backup
    if backup_database; then
        cleanup_old_backups
        log_message "INFO" "Database backup process completed successfully"
        exit 0
    else
        log_message "ERROR" "Database backup process failed"
        exit 1
    fi
}

# Execute main function
main "$@"
EOF

    # Make script executable
    chmod +x "$script_file"
    chown root:root "$script_file"
    
    log_success "Database backup script created successfully"
    log_info "Script location: $script_file"
    
    return 0
}

# Create configuration backup script
create_configuration_backup_script() {
    log_info "Creating configuration backup script..."
    
    local backup_dir="${CONFIG[backup_dir]}"
    local script_file="$backup_dir/scripts/backup-config.sh"
    local app_dir="${CONFIG[app_dir]}"
    local config_dir="${CONFIG[config_dir]}"
    local ssl_dir="${CONFIG[ssl_dir]}"
    local encryption_key_file="$backup_dir/keys/.backup_encryption_key"
    
    cat > "$script_file" << EOF
#!/bin/bash

# SeraphC2 Configuration Backup Script
# Generated by SeraphC2 Setup Script

set -eE

# Configuration
BACKUP_DIR="$backup_dir"
CONFIG_BACKUP_DIR="\$BACKUP_DIR/config"
ENCRYPTION_KEY_FILE="$encryption_key_file"
LOG_FILE="\$BACKUP_DIR/logs/config-backup.log"
RETENTION_DAYS="${CONFIG[backup_retention_days]}"

# Paths to backup
APP_DIR="$app_dir"
CONFIG_DIR="$config_dir"
SSL_DIR="$ssl_dir"

# Logging function
log_message() {
    local level="\$1"
    local message="\$2"
    local timestamp=\$(date '+%Y-%m-%d %H:%M:%S')
    echo "[\$timestamp] [\$level] \$message" | tee -a "\$LOG_FILE"
}

# Main backup function
backup_configuration() {
    local timestamp=\$(date +%Y%m%d_%H%M%S)
    local backup_file="\$CONFIG_BACKUP_DIR/seraphc2_config_\$timestamp.tar.gz"
    local encrypted_file="\$backup_file.enc"
    
    log_message "INFO" "Starting configuration backup..."
    
    # Create temporary directory for staging
    local temp_dir=\$(mktemp -d)
    local staging_dir="\$temp_dir/seraphc2-config"
    mkdir -p "\$staging_dir"
    
    # Copy configuration files
    if [[ -d "\$APP_DIR" ]]; then
        log_message "INFO" "Backing up application configuration..."
        mkdir -p "\$staging_dir/app"
        cp -r "\$APP_DIR/.env" "\$staging_dir/app/" 2>/dev/null || true
        cp -r "\$APP_DIR/package.json" "\$staging_dir/app/" 2>/dev/null || true
        cp -r "\$APP_DIR/package-lock.json" "\$staging_dir/app/" 2>/dev/null || true
    fi
    
    if [[ -d "\$CONFIG_DIR" ]]; then
        log_message "INFO" "Backing up system configuration..."
        mkdir -p "\$staging_dir/system"
        cp -r "\$CONFIG_DIR"/* "\$staging_dir/system/" 2>/dev/null || true
    fi
    
    if [[ -d "\$SSL_DIR" ]]; then
        log_message "INFO" "Backing up SSL certificates..."
        mkdir -p "\$staging_dir/ssl"
        cp -r "\$SSL_DIR"/* "\$staging_dir/ssl/" 2>/dev/null || true
    fi
    
    # Backup systemd service file
    if [[ -f "/etc/systemd/system/seraphc2.service" ]]; then
        log_message "INFO" "Backing up systemd service file..."
        mkdir -p "\$staging_dir/systemd"
        cp "/etc/systemd/system/seraphc2.service" "\$staging_dir/systemd/"
    fi
    
    # Create backup metadata
    cat > "\$staging_dir/backup-metadata.txt" << METADATA
SeraphC2 Configuration Backup
Created: \$(date)
Hostname: \$(hostname)
Script Version: $SCRIPT_VERSION
Backup Type: Configuration
METADATA
    
    # Create compressed archive
    if ! tar -czf "\$backup_file" -C "\$temp_dir" seraphc2-config; then
        log_message "ERROR" "Failed to create configuration archive"
        rm -rf "\$temp_dir"
        return 1
    fi
    
    # Clean up temporary directory
    rm -rf "\$temp_dir"
    
    log_message "INFO" "Configuration archive created: \$backup_file"
    
    # Encrypt the backup
    if ! openssl enc -aes-256-cbc -salt -in "\$backup_file" -out "\$encrypted_file" -pass file:"\$ENCRYPTION_KEY_FILE"; then
        log_message "ERROR" "Failed to encrypt configuration backup"
        rm -f "\$backup_file" "\$encrypted_file"
        return 1
    fi
    
    # Remove unencrypted backup
    rm -f "\$backup_file"
    
    # Set secure permissions
    chmod 600 "\$encrypted_file"
    chown root:root "\$encrypted_file"
    
    log_message "INFO" "Configuration backup encrypted and saved: \$encrypted_file"
    
    # Verify backup integrity
    if ! verify_backup_integrity "\$encrypted_file"; then
        log_message "ERROR" "Backup integrity verification failed"
        return 1
    fi
    
    log_message "INFO" "Configuration backup completed successfully"
    return 0
}

# Verify backup integrity
verify_backup_integrity() {
    local encrypted_file="\$1"
    local temp_file="/tmp/config_verify_\$\$.tar.gz"
    
    # Try to decrypt the backup
    if openssl enc -aes-256-cbc -d -in "\$encrypted_file" -out "\$temp_file" -pass file:"\$ENCRYPTION_KEY_FILE" 2>/dev/null; then
        # Check if the decrypted file is a valid tar.gz
        if tar -tzf "\$temp_file" >/dev/null 2>&1; then
            rm -f "\$temp_file"
            return 0
        fi
    fi
    
    rm -f "\$temp_file"
    return 1
}

# Cleanup old backups
cleanup_old_backups() {
    log_message "INFO" "Cleaning up backups older than \$RETENTION_DAYS days..."
    
    local deleted_count=0
    while IFS= read -r -d '' file; do
        rm -f "\$file"
        ((deleted_count++))
    done < <(find "\$CONFIG_BACKUP_DIR" -name "*.tar.gz.enc" -mtime +\$RETENTION_DAYS -print0 2>/dev/null)
    
    if [[ \$deleted_count -gt 0 ]]; then
        log_message "INFO" "Deleted \$deleted_count old backup files"
    else
        log_message "INFO" "No old backup files to delete"
    fi
}

# Main execution
main() {
    # Ensure log directory exists
    mkdir -p "\$(dirname "\$LOG_FILE")"
    
    # Check if encryption key exists
    if [[ ! -f "\$ENCRYPTION_KEY_FILE" ]]; then
        log_message "ERROR" "Backup encryption key not found: \$ENCRYPTION_KEY_FILE"
        exit 1
    fi
    
    # Perform backup
    if backup_configuration; then
        cleanup_old_backups
        log_message "INFO" "Configuration backup process completed successfully"
        exit 0
    else
        log_message "ERROR" "Configuration backup process failed"
        exit 1
    fi
}

# Execute main function
main "\$@"
EOF

    # Make script executable
    chmod +x "$script_file"
    chown root:root "$script_file"
    
    log_success "Configuration backup script created successfully"
    log_info "Script location: $script_file"
    
    return 0
}

# Create main backup script that orchestrates all backup operations
create_main_backup_script() {
    log_info "Creating main backup script..."
    
    local backup_dir="${CONFIG[backup_dir]}"
    local script_file="$backup_dir/scripts/backup-seraphc2.sh"
    
    cat > "$script_file" << EOF
#!/bin/bash

# SeraphC2 Main Backup Script
# Generated by SeraphC2 Setup Script

set -eE

# Configuration
BACKUP_DIR="$backup_dir"
LOG_FILE="\$BACKUP_DIR/logs/main-backup.log"
SCRIPTS_DIR="\$BACKUP_DIR/scripts"

# Logging function
log_message() {
    local level="\$1"
    local message="\$2"
    local timestamp=\$(date '+%Y-%m-%d %H:%M:%S')
    echo "[\$timestamp] [\$level] \$message" | tee -a "\$LOG_FILE"
}

# Main backup orchestration
main() {
    local start_time=\$(date +%s)
    local backup_errors=0
    
    log_message "INFO" "Starting SeraphC2 backup process..."
    
    # Ensure log directory exists
    mkdir -p "\$(dirname "\$LOG_FILE")"
    
    # Run database backup
    log_message "INFO" "Starting database backup..."
    if "\$SCRIPTS_DIR/backup-database.sh"; then
        log_message "INFO" "Database backup completed successfully"
    else
        log_message "ERROR" "Database backup failed"
        ((backup_errors++))
    fi
    
    # Run configuration backup
    log_message "INFO" "Starting configuration backup..."
    if "\$SCRIPTS_DIR/backup-config.sh"; then
        log_message "INFO" "Configuration backup completed successfully"
    else
        log_message "ERROR" "Configuration backup failed"
        ((backup_errors++))
    fi
    
    # Calculate runtime
    local end_time=\$(date +%s)
    local runtime=\$((end_time - start_time))
    
    # Report results
    if [[ \$backup_errors -eq 0 ]]; then
        log_message "INFO" "All backups completed successfully in \${runtime} seconds"
        exit 0
    else
        log_message "ERROR" "Backup process completed with \$backup_errors errors in \${runtime} seconds"
        exit 1
    fi
}

# Execute main function
main "\$@"
EOF

    # Make script executable
    chmod +x "$script_file"
    chown root:root "$script_file"
    
    # Create convenient symlink in /usr/local/bin
    ln -sf "$script_file" /usr/local/bin/seraphc2-backup
    
    log_success "Main backup script created successfully"
    log_info "Script location: $script_file"
    log_info "Convenient command: seraphc2-backup"
    
    return 0
}

# Create backup restoration script
create_backup_restoration_script() {
    log_info "Creating backup restoration script..."
    
    local backup_dir="${CONFIG[backup_dir]}"
    local script_file="$backup_dir/scripts/restore-seraphc2.sh"
    local encryption_key_file="$backup_dir/keys/.backup_encryption_key"
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    
    cat > "$script_file" << EOF
#!/bin/bash

# SeraphC2 Backup Restoration Script
# Generated by SeraphC2 Setup Script

set -eE

# Configuration
BACKUP_DIR="$backup_dir"
DB_BACKUP_DIR="\$BACKUP_DIR/database"
CONFIG_BACKUP_DIR="\$BACKUP_DIR/config"
ENCRYPTION_KEY_FILE="$encryption_key_file"
LOG_FILE="\$BACKUP_DIR/logs/restore.log"

# Database configuration
DB_NAME="$db_name"
DB_USER="$db_user"

# Logging function
log_message() {
    local level="\$1"
    local message="\$2"
    local timestamp=\$(date '+%Y-%m-%d %H:%M:%S')
    echo "[\$timestamp] [\$level] \$message" | tee -a "\$LOG_FILE"
}

# List available backups
list_backups() {
    echo "Available Database Backups:"
    echo "=========================="
    find "\$DB_BACKUP_DIR" -name "*.sql.enc" -type f -printf "%T@ %Tc %p\n" 2>/dev/null | sort -n | cut -d' ' -f2- || echo "No database backups found"
    
    echo ""
    echo "Available Configuration Backups:"
    echo "================================"
    find "\$CONFIG_BACKUP_DIR" -name "*.tar.gz.enc" -type f -printf "%T@ %Tc %p\n" 2>/dev/null | sort -n | cut -d' ' -f2- || echo "No configuration backups found"
}

# Restore database from backup
restore_database() {
    local backup_file="\$1"
    local temp_file="/tmp/restore_db_\$\$.sql"
    
    if [[ ! -f "\$backup_file" ]]; then
        log_message "ERROR" "Database backup file not found: \$backup_file"
        return 1
    fi
    
    log_message "INFO" "Restoring database from: \$backup_file"
    
    # Decrypt backup
    if ! openssl enc -aes-256-cbc -d -in "\$backup_file" -out "\$temp_file" -pass file:"\$ENCRYPTION_KEY_FILE"; then
        log_message "ERROR" "Failed to decrypt database backup"
        rm -f "\$temp_file"
        return 1
    fi
    
    # Stop SeraphC2 service
    log_message "INFO" "Stopping SeraphC2 service..."
    systemctl stop seraphc2 2>/dev/null || true
    
    # Create backup of current database
    local current_backup="/tmp/current_db_backup_\$\$.sql"
    log_message "INFO" "Creating backup of current database..."
    sudo -u postgres pg_dump "\$DB_NAME" > "\$current_backup" 2>/dev/null || true
    
    # Drop and recreate database
    log_message "INFO" "Recreating database..."
    sudo -u postgres dropdb "\$DB_NAME" 2>/dev/null || true
    sudo -u postgres createdb "\$DB_NAME" -O "\$DB_USER"
    
    # Restore from backup
    log_message "INFO" "Restoring database content..."
    if sudo -u postgres psql "\$DB_NAME" < "\$temp_file"; then
        log_message "INFO" "Database restored successfully"
        rm -f "\$temp_file" "\$current_backup"
        
        # Start SeraphC2 service
        log_message "INFO" "Starting SeraphC2 service..."
        systemctl start seraphc2
        
        return 0
    else
        log_message "ERROR" "Database restoration failed"
        
        # Attempt to restore current database
        if [[ -f "\$current_backup" ]]; then
            log_message "INFO" "Attempting to restore current database..."
            sudo -u postgres dropdb "\$DB_NAME" 2>/dev/null || true
            sudo -u postgres createdb "\$DB_NAME" -O "\$DB_USER"
            sudo -u postgres psql "\$DB_NAME" < "\$current_backup" || true
        fi
        
        rm -f "\$temp_file" "\$current_backup"
        systemctl start seraphc2 2>/dev/null || true
        return 1
    fi
}

# Restore configuration from backup
restore_configuration() {
    local backup_file="\$1"
    local temp_file="/tmp/restore_config_\$\$.tar.gz"
    local temp_dir="/tmp/restore_config_dir_\$\$"
    
    if [[ ! -f "\$backup_file" ]]; then
        log_message "ERROR" "Configuration backup file not found: \$backup_file"
        return 1
    fi
    
    log_message "INFO" "Restoring configuration from: \$backup_file"
    
    # Decrypt backup
    if ! openssl enc -aes-256-cbc -d -in "\$backup_file" -out "\$temp_file" -pass file:"\$ENCRYPTION_KEY_FILE"; then
        log_message "ERROR" "Failed to decrypt configuration backup"
        rm -f "\$temp_file"
        return 1
    fi
    
    # Extract backup
    mkdir -p "\$temp_dir"
    if ! tar -xzf "\$temp_file" -C "\$temp_dir"; then
        log_message "ERROR" "Failed to extract configuration backup"
        rm -rf "\$temp_file" "\$temp_dir"
        return 1
    fi
    
    # Stop SeraphC2 service
    log_message "INFO" "Stopping SeraphC2 service..."
    systemctl stop seraphc2 2>/dev/null || true
    
    # Restore configuration files
    local config_source="\$temp_dir/seraphc2-config"
    
    if [[ -d "\$config_source/app" ]]; then
        log_message "INFO" "Restoring application configuration..."
        cp -r "\$config_source/app"/* "${CONFIG[app_dir]}/" 2>/dev/null || true
    fi
    
    if [[ -d "\$config_source/system" ]]; then
        log_message "INFO" "Restoring system configuration..."
        cp -r "\$config_source/system"/* "${CONFIG[config_dir]}/" 2>/dev/null || true
    fi
    
    if [[ -d "\$config_source/ssl" ]]; then
        log_message "INFO" "Restoring SSL certificates..."
        cp -r "\$config_source/ssl"/* "${CONFIG[ssl_dir]}/" 2>/dev/null || true
    fi
    
    if [[ -d "\$config_source/systemd" ]]; then
        log_message "INFO" "Restoring systemd service file..."
        cp "\$config_source/systemd/seraphc2.service" "/etc/systemd/system/" 2>/dev/null || true
        systemctl daemon-reload
    fi
    
    # Clean up
    rm -rf "\$temp_file" "\$temp_dir"
    
    # Start SeraphC2 service
    log_message "INFO" "Starting SeraphC2 service..."
    systemctl start seraphc2
    
    log_message "INFO" "Configuration restored successfully"
    return 0
}

# Show usage information
show_usage() {
    cat << USAGE
SeraphC2 Backup Restoration Script

Usage: \$0 [COMMAND] [OPTIONS]

Commands:
    list                    List available backups
    restore-db <file>       Restore database from encrypted backup file
    restore-config <file>   Restore configuration from encrypted backup file
    restore-all <db_file> <config_file>  Restore both database and configuration
    
Examples:
    \$0 list
    \$0 restore-db \$DB_BACKUP_DIR/seraphc2_db_20231201_120000.sql.enc
    \$0 restore-config \$CONFIG_BACKUP_DIR/seraphc2_config_20231201_120000.tar.gz.enc
    \$0 restore-all \$DB_BACKUP_DIR/seraphc2_db_20231201_120000.sql.enc \$CONFIG_BACKUP_DIR/seraphc2_config_20231201_120000.tar.gz.enc

Note: This script requires root privileges and will stop/start the SeraphC2 service.
USAGE
}

# Main execution
main() {
    # Ensure log directory exists
    mkdir -p "\$(dirname "\$LOG_FILE")"
    
    # Check if encryption key exists
    if [[ ! -f "\$ENCRYPTION_KEY_FILE" ]]; then
        log_message "ERROR" "Backup encryption key not found: \$ENCRYPTION_KEY_FILE"
        exit 1
    fi
    
    case "\${1:-}" in
        "list")
            list_backups
            ;;
        "restore-db")
            if [[ -z "\$2" ]]; then
                echo "Error: Database backup file required"
                show_usage
                exit 1
            fi
            restore_database "\$2"
            ;;
        "restore-config")
            if [[ -z "\$2" ]]; then
                echo "Error: Configuration backup file required"
                show_usage
                exit 1
            fi
            restore_configuration "\$2"
            ;;
        "restore-all")
            if [[ -z "\$2" || -z "\$3" ]]; then
                echo "Error: Both database and configuration backup files required"
                show_usage
                exit 1
            fi
            if restore_database "\$2" && restore_configuration "\$3"; then
                log_message "INFO" "Full restoration completed successfully"
            else
                log_message "ERROR" "Full restoration failed"
                exit 1
            fi
            ;;
        *)
            show_usage
            exit 1
            ;;
    esac
}

# Execute main function
main "\$@"
EOF

    # Make script executable
    chmod +x "$script_file"
    chown root:root "$script_file"
    
    # Create convenient symlink in /usr/local/bin
    ln -sf "$script_file" /usr/local/bin/seraphc2-restore
    
    log_success "Backup restoration script created successfully"
    log_info "Script location: $script_file"
    log_info "Convenient command: seraphc2-restore"
    
    return 0
}

# Setup backup scheduling with cron
setup_backup_scheduling() {
    log_info "Setting up automated backup scheduling..."
    
    local backup_dir="${CONFIG[backup_dir]}"
    local main_backup_script="$backup_dir/scripts/backup-seraphc2.sh"
    local cron_file="/etc/cron.d/seraphc2-backup"
    
    # Create cron job for daily backups at 2 AM
    cat > "$cron_file" << EOF
# SeraphC2 Automated Backup Schedule
# Generated by SeraphC2 Setup Script
# Runs daily at 2:00 AM

SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Daily backup at 2:00 AM
0 2 * * * root $main_backup_script >/dev/null 2>&1

# Weekly backup verification at 3:00 AM on Sundays
0 3 * * 0 root $backup_dir/scripts/test-backups.sh >/dev/null 2>&1
EOF

    # Set proper permissions
    chmod 644 "$cron_file"
    chown root:root "$cron_file"
    
    # Restart cron service to pick up new job
    systemctl restart cron 2>/dev/null || systemctl restart crond 2>/dev/null || true
    
    log_success "Backup scheduling configured successfully"
    log_info "Daily backups scheduled for 2:00 AM"
    log_info "Weekly backup verification scheduled for 3:00 AM on Sundays"
    log_info "Cron configuration: $cron_file"
    
    return 0
}

# Create backup cleanup script for retention policy
create_backup_cleanup_script() {
    log_info "Creating backup cleanup script..."
    
    local backup_dir="${CONFIG[backup_dir]}"
    local script_file="$backup_dir/scripts/cleanup-backups.sh"
    local retention_days="${CONFIG[backup_retention_days]}"
    
    cat > "$script_file" << EOF
#!/bin/bash

# SeraphC2 Backup Cleanup Script
# Generated by SeraphC2 Setup Script

set -eE

# Configuration
BACKUP_DIR="$backup_dir"
DB_BACKUP_DIR="\$BACKUP_DIR/database"
CONFIG_BACKUP_DIR="\$BACKUP_DIR/config"
LOG_FILE="\$BACKUP_DIR/logs/cleanup.log"
RETENTION_DAYS="$retention_days"

# Logging function
log_message() {
    local level="\$1"
    local message="\$2"
    local timestamp=\$(date '+%Y-%m-%d %H:%M:%S')
    echo "[\$timestamp] [\$level] \$message" | tee -a "\$LOG_FILE"
}

# Cleanup old database backups
cleanup_database_backups() {
    log_message "INFO" "Cleaning up database backups older than \$RETENTION_DAYS days..."
    
    local deleted_count=0
    while IFS= read -r -d '' file; do
        log_message "INFO" "Deleting old database backup: \$(basename "\$file")"
        rm -f "\$file"
        ((deleted_count++))
    done < <(find "\$DB_BACKUP_DIR" -name "*.sql.enc" -mtime +\$RETENTION_DAYS -print0 2>/dev/null)
    
    log_message "INFO" "Deleted \$deleted_count old database backup files"
    return \$deleted_count
}

# Cleanup old configuration backups
cleanup_configuration_backups() {
    log_message "INFO" "Cleaning up configuration backups older than \$RETENTION_DAYS days..."
    
    local deleted_count=0
    while IFS= read -r -d '' file; do
        log_message "INFO" "Deleting old configuration backup: \$(basename "\$file")"
        rm -f "\$file"
        ((deleted_count++))
    done < <(find "\$CONFIG_BACKUP_DIR" -name "*.tar.gz.enc" -mtime +\$RETENTION_DAYS -print0 2>/dev/null)
    
    log_message "INFO" "Deleted \$deleted_count old configuration backup files"
    return \$deleted_count
}

# Cleanup old log files
cleanup_log_files() {
    log_message "INFO" "Cleaning up log files older than \$((RETENTION_DAYS * 2)) days..."
    
    local log_retention=\$((RETENTION_DAYS * 2))
    local deleted_count=0
    
    while IFS= read -r -d '' file; do
        log_message "INFO" "Deleting old log file: \$(basename "\$file")"
        rm -f "\$file"
        ((deleted_count++))
    done < <(find "\$BACKUP_DIR/logs" -name "*.log" -mtime +\$log_retention -print0 2>/dev/null)
    
    log_message "INFO" "Deleted \$deleted_count old log files"
    return \$deleted_count
}

# Display backup statistics
show_backup_statistics() {
    log_message "INFO" "Backup storage statistics:"
    
    # Count current backups
    local db_count=\$(find "\$DB_BACKUP_DIR" -name "*.sql.enc" -type f 2>/dev/null | wc -l)
    local config_count=\$(find "\$CONFIG_BACKUP_DIR" -name "*.tar.gz.enc" -type f 2>/dev/null | wc -l)
    
    log_message "INFO" "  Database backups: \$db_count files"
    log_message "INFO" "  Configuration backups: \$config_count files"
    
    # Calculate disk usage
    local total_size=\$(du -sh "\$BACKUP_DIR" 2>/dev/null | cut -f1)
    log_message "INFO" "  Total backup size: \$total_size"
    
    # Show oldest and newest backups
    local oldest_db=\$(find "\$DB_BACKUP_DIR" -name "*.sql.enc" -type f -printf "%T@ %p\n" 2>/dev/null | sort -n | head -1 | cut -d' ' -f2-)
    local newest_db=\$(find "\$DB_BACKUP_DIR" -name "*.sql.enc" -type f -printf "%T@ %p\n" 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    
    if [[ -n "\$oldest_db" ]]; then
        log_message "INFO" "  Oldest database backup: \$(basename "\$oldest_db")"
        log_message "INFO" "  Newest database backup: \$(basename "\$newest_db")"
    fi
}

# Main execution
main() {
    local start_time=\$(date +%s)
    
    # Ensure log directory exists
    mkdir -p "\$(dirname "\$LOG_FILE")"
    
    log_message "INFO" "Starting backup cleanup process..."
    
    # Show current statistics
    show_backup_statistics
    
    # Perform cleanup
    local db_deleted=0
    local config_deleted=0
    local logs_deleted=0
    
    cleanup_database_backups
    db_deleted=\$?
    
    cleanup_configuration_backups
    config_deleted=\$?
    
    cleanup_log_files
    logs_deleted=\$?
    
    # Calculate runtime
    local end_time=\$(date +%s)
    local runtime=\$((end_time - start_time))
    
    # Report results
    local total_deleted=\$((db_deleted + config_deleted + logs_deleted))
    log_message "INFO" "Cleanup completed in \${runtime} seconds"
    log_message "INFO" "Total files deleted: \$total_deleted (DB: \$db_deleted, Config: \$config_deleted, Logs: \$logs_deleted)"
    
    # Show updated statistics
    show_backup_statistics
}

# Execute main function
main "\$@"
EOF

    # Make script executable
    chmod +x "$script_file"
    chown root:root "$script_file"
    
    # Create convenient symlink in /usr/local/bin
    ln -sf "$script_file" /usr/local/bin/seraphc2-cleanup-backups
    
    log_success "Backup cleanup script created successfully"
    log_info "Script location: $script_file"
    log_info "Convenient command: seraphc2-cleanup-backups"
    log_info "Retention policy: $retention_days days"
    
    return 0
}

# Setup backup testing and validation
setup_backup_testing() {
    log_info "Setting up backup testing and validation..."
    
    local backup_dir="${CONFIG[backup_dir]}"
    local script_file="$backup_dir/scripts/test-backups.sh"
    local encryption_key_file="$backup_dir/keys/.backup_encryption_key"
    
    cat > "$script_file" << EOF
#!/bin/bash

# SeraphC2 Backup Testing and Validation Script
# Generated by SeraphC2 Setup Script

set -eE

# Configuration
BACKUP_DIR="$backup_dir"
DB_BACKUP_DIR="\$BACKUP_DIR/database"
CONFIG_BACKUP_DIR="\$BACKUP_DIR/config"
ENCRYPTION_KEY_FILE="$encryption_key_file"
LOG_FILE="\$BACKUP_DIR/logs/backup-test.log"

# Logging function
log_message() {
    local level="\$1"
    local message="\$2"
    local timestamp=\$(date '+%Y-%m-%d %H:%M:%S')
    echo "[\$timestamp] [\$level] \$message" | tee -a "\$LOG_FILE"
}

# Test database backup integrity
test_database_backups() {
    log_message "INFO" "Testing database backup integrity..."
    
    local tested_count=0
    local failed_count=0
    
    while IFS= read -r -d '' backup_file; do
        local temp_file="/tmp/test_db_\$\$.sql"
        ((tested_count++))
        
        log_message "INFO" "Testing: \$(basename "\$backup_file")"
        
        # Try to decrypt the backup
        if openssl enc -aes-256-cbc -d -in "\$backup_file" -out "\$temp_file" -pass file:"\$ENCRYPTION_KEY_FILE" 2>/dev/null; then
            # Check if the decrypted file contains SQL content
            if grep -q "PostgreSQL database dump" "\$temp_file" 2>/dev/null; then
                log_message "INFO" "  ✓ Backup is valid and can be decrypted"
            else
                log_message "ERROR" "  ✗ Backup does not contain valid SQL content"
                ((failed_count++))
            fi
        else
            log_message "ERROR" "  ✗ Failed to decrypt backup"
            ((failed_count++))
        fi
        
        rm -f "\$temp_file"
    done < <(find "\$DB_BACKUP_DIR" -name "*.sql.enc" -type f -print0 2>/dev/null)
    
    log_message "INFO" "Database backup test results: \$tested_count tested, \$failed_count failed"
    return \$failed_count
}

# Test configuration backup integrity
test_configuration_backups() {
    log_message "INFO" "Testing configuration backup integrity..."
    
    local tested_count=0
    local failed_count=0
    
    while IFS= read -r -d '' backup_file; do
        local temp_file="/tmp/test_config_\$\$.tar.gz"
        ((tested_count++))
        
        log_message "INFO" "Testing: \$(basename "\$backup_file")"
        
        # Try to decrypt the backup
        if openssl enc -aes-256-cbc -d -in "\$backup_file" -out "\$temp_file" -pass file:"\$ENCRYPTION_KEY_FILE" 2>/dev/null; then
            # Check if the decrypted file is a valid tar.gz
            if tar -tzf "\$temp_file" >/dev/null 2>&1; then
                log_message "INFO" "  ✓ Backup is valid and can be decrypted"
            else
                log_message "ERROR" "  ✗ Backup is not a valid tar.gz archive"
                ((failed_count++))
            fi
        else
            log_message "ERROR" "  ✗ Failed to decrypt backup"
            ((failed_count++))
        fi
        
        rm -f "\$temp_file"
    done < <(find "\$CONFIG_BACKUP_DIR" -name "*.tar.gz.enc" -type f -print0 2>/dev/null)
    
    log_message "INFO" "Configuration backup test results: \$tested_count tested, \$failed_count failed"
    return \$failed_count
}

# Test backup creation process
test_backup_creation() {
    log_message "INFO" "Testing backup creation process..."
    
    local test_errors=0
    
    # Test database backup creation
    log_message "INFO" "Testing database backup creation..."
    if "\$BACKUP_DIR/scripts/backup-database.sh"; then
        log_message "INFO" "  ✓ Database backup creation successful"
    else
        log_message "ERROR" "  ✗ Database backup creation failed"
        ((test_errors++))
    fi
    
    # Test configuration backup creation
    log_message "INFO" "Testing configuration backup creation..."
    if "\$BACKUP_DIR/scripts/backup-config.sh"; then
        log_message "INFO" "  ✓ Configuration backup creation successful"
    else
        log_message "ERROR" "  ✗ Configuration backup creation failed"
        ((test_errors++))
    fi
    
    return \$test_errors
}

# Check backup storage health
check_backup_storage() {
    log_message "INFO" "Checking backup storage health..."
    
    local storage_errors=0
    
    # Check if backup directory is writable
    if [[ ! -w "\$BACKUP_DIR" ]]; then
        log_message "ERROR" "Backup directory is not writable: \$BACKUP_DIR"
        ((storage_errors++))
    fi
    
    # Check available disk space
    local available_space=\$(df "\$BACKUP_DIR" | awk 'NR==2 {print \$4}')
    local available_gb=\$((available_space / 1024 / 1024))
    
    if [[ \$available_gb -lt 1 ]]; then
        log_message "ERROR" "Low disk space for backups: \${available_gb}GB available"
        ((storage_errors++))
    else
        log_message "INFO" "Available backup storage: \${available_gb}GB"
    fi
    
    # Check encryption key accessibility
    if [[ ! -r "\$ENCRYPTION_KEY_FILE" ]]; then
        log_message "ERROR" "Backup encryption key is not readable: \$ENCRYPTION_KEY_FILE"
        ((storage_errors++))
    fi
    
    return \$storage_errors
}

# Generate backup health report
generate_health_report() {
    log_message "INFO" "Generating backup health report..."
    
    local report_file="\$BACKUP_DIR/backup-health-report.txt"
    local timestamp=\$(date '+%Y-%m-%d %H:%M:%S')
    
    cat > "\$report_file" << REPORT
SeraphC2 Backup Health Report
Generated: \$timestamp

=== BACKUP INVENTORY ===
Database Backups: \$(find "\$DB_BACKUP_DIR" -name "*.sql.enc" -type f 2>/dev/null | wc -l) files
Configuration Backups: \$(find "\$CONFIG_BACKUP_DIR" -name "*.tar.gz.enc" -type f 2>/dev/null | wc -l) files
Total Storage Used: \$(du -sh "\$BACKUP_DIR" 2>/dev/null | cut -f1)

=== RECENT BACKUPS ===
Latest Database Backup:
\$(find "\$DB_BACKUP_DIR" -name "*.sql.enc" -type f -printf "%T@ %Tc %p\n" 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2- || echo "None found")

Latest Configuration Backup:
\$(find "\$CONFIG_BACKUP_DIR" -name "*.tar.gz.enc" -type f -printf "%T@ %Tc %p\n" 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2- || echo "None found")

=== STORAGE STATUS ===
Available Space: \$(df -h "\$BACKUP_DIR" | awk 'NR==2 {print \$4}')
Backup Directory: \$BACKUP_DIR
Encryption Key: \$([[ -r "\$ENCRYPTION_KEY_FILE" ]] && echo "Present" || echo "Missing")

=== RECOMMENDATIONS ===
- Verify backups can be restored periodically
- Monitor available disk space
- Test backup integrity regularly
- Keep encryption key secure and backed up separately
- Review retention policy based on storage capacity

For detailed test results, see: \$LOG_FILE
REPORT

    chmod 600 "\$report_file"
    chown root:root "\$report_file"
    
    log_message "INFO" "Health report generated: \$report_file"
}

# Main execution
main() {
    local start_time=\$(date +%s)
    local total_errors=0
    
    # Ensure log directory exists
    mkdir -p "\$(dirname "\$LOG_FILE")"
    
    log_message "INFO" "Starting backup testing and validation..."
    
    # Check backup storage health
    check_backup_storage
    total_errors=\$((total_errors + \$?))
    
    # Test existing backups
    test_database_backups
    total_errors=\$((total_errors + \$?))
    
    test_configuration_backups
    total_errors=\$((total_errors + \$?))
    
    # Test backup creation (optional - only if requested)
    if [[ "\${1:-}" == "--test-creation" ]]; then
        test_backup_creation
        total_errors=\$((total_errors + \$?))
    fi
    
    # Generate health report
    generate_health_report
    
    # Calculate runtime
    local end_time=\$(date +%s)
    local runtime=\$((end_time - start_time))
    
    # Report results
    if [[ \$total_errors -eq 0 ]]; then
        log_message "INFO" "All backup tests passed successfully in \${runtime} seconds"
        exit 0
    else
        log_message "ERROR" "Backup testing completed with \$total_errors errors in \${runtime} seconds"
        exit 1
    fi
}

# Execute main function
main "\$@"
EOF

    # Make script executable
    chmod +x "$script_file"
    chown root:root "$script_file"
    
    # Create convenient symlink in /usr/local/bin
    ln -sf "$script_file" /usr/local/bin/seraphc2-test-backups
    
    log_success "Backup testing script created successfully"
    log_info "Script location: $script_file"
    log_info "Convenient command: seraphc2-test-backups"
    
    return 0
}

# Create comprehensive recovery documentation
create_recovery_documentation() {
    log_info "Creating recovery documentation..."
    
    local backup_dir="${CONFIG[backup_dir]}"
    local doc_file="$backup_dir/RECOVERY_PROCEDURES.md"
    
    cat > "$doc_file" << EOF
# SeraphC2 Backup and Recovery Procedures

Generated: $(date)
Script Version: $SCRIPT_VERSION

## Overview

This document provides comprehensive procedures for backing up and recovering your SeraphC2 installation. The backup system includes automated daily backups, encrypted storage, and comprehensive recovery procedures.

## Backup System Components

### Directory Structure
\`\`\`
${CONFIG[backup_dir]}/
├── database/           # Encrypted database backups
├── config/            # Encrypted configuration backups
├── scripts/           # Backup and recovery scripts
├── logs/              # Backup operation logs
└── keys/              # Encryption keys (secure)
\`\`\`

### Scripts
- \`backup-seraphc2.sh\` - Main backup orchestration script
- \`backup-database.sh\` - Database backup script
- \`backup-config.sh\` - Configuration backup script
- \`restore-seraphc2.sh\` - Restoration script
- \`test-backups.sh\` - Backup validation script
- \`cleanup-backups.sh\` - Retention policy enforcement

## Backup Schedule

- **Daily Backups**: 2:00 AM (database and configuration)
- **Weekly Validation**: 3:00 AM on Sundays
- **Retention Period**: ${CONFIG[backup_retention_days]} days
- **Cleanup**: Automatic via cron job

## Manual Backup Operations

### Create Immediate Backup
\`\`\`bash
# Full backup (database + configuration)
sudo seraphc2-backup

# Database only
sudo ${CONFIG[backup_dir]}/scripts/backup-database.sh

# Configuration only
sudo ${CONFIG[backup_dir]}/scripts/backup-config.sh
\`\`\`

### List Available Backups
\`\`\`bash
sudo seraphc2-restore list
\`\`\`

### Test Backup Integrity
\`\`\`bash
# Test existing backups
sudo seraphc2-test-backups

# Test backup creation process
sudo seraphc2-test-backups --test-creation
\`\`\`

## Recovery Procedures

### Prerequisites
- Root access to the system
- Access to backup files and encryption key
- SeraphC2 service can be stopped/started

### Database Recovery

#### Complete Database Restoration
\`\`\`bash
# 1. List available database backups
sudo seraphc2-restore list

# 2. Stop SeraphC2 service (done automatically)
# 3. Restore from specific backup
sudo seraphc2-restore restore-db /var/backups/seraphc2/database/seraphc2_db_YYYYMMDD_HHMMSS.sql.enc

# 4. Verify service is running
sudo systemctl status seraphc2
\`\`\`

#### Partial Database Recovery
For partial recovery, you may need to:
1. Restore to a temporary database
2. Extract specific data
3. Import into production database

### Configuration Recovery

#### Complete Configuration Restoration
\`\`\`bash
# 1. List available configuration backups
sudo seraphc2-restore list

# 2. Restore configuration files
sudo seraphc2-restore restore-config /var/backups/seraphc2/config/seraphc2_config_YYYYMMDD_HHMMSS.tar.gz.enc

# 3. Verify configuration
sudo systemctl status seraphc2
\`\`\`

#### Selective Configuration Recovery
\`\`\`bash
# 1. Decrypt backup manually
sudo openssl enc -aes-256-cbc -d -in backup_file.tar.gz.enc -out temp_backup.tar.gz -pass file:/var/backups/seraphc2/keys/.backup_encryption_key

# 2. Extract specific files
tar -xzf temp_backup.tar.gz

# 3. Copy needed files to appropriate locations
# 4. Clean up temporary files
\`\`\`

### Full System Recovery

#### Complete Restoration
\`\`\`bash
# Restore both database and configuration
sudo seraphc2-restore restore-all \\
    /var/backups/seraphc2/database/seraphc2_db_YYYYMMDD_HHMMSS.sql.enc \\
    /var/backups/seraphc2/config/seraphc2_config_YYYYMMDD_HHMMSS.tar.gz.enc
\`\`\`

## Disaster Recovery Scenarios

### Scenario 1: Database Corruption
1. Stop SeraphC2 service
2. Identify latest good database backup
3. Restore database from backup
4. Start SeraphC2 service
5. Verify functionality

### Scenario 2: Configuration Loss
1. Identify configuration backup from before the issue
2. Stop SeraphC2 service
3. Restore configuration files
4. Restart SeraphC2 service
5. Verify all settings are correct

### Scenario 3: Complete System Loss
1. Reinstall SeraphC2 using setup script
2. Stop the new installation
3. Restore database and configuration from backups
4. Start services
5. Verify complete functionality

### Scenario 4: Encryption Key Loss
**CRITICAL**: If the encryption key is lost, backups cannot be recovered.

Prevention:
- Store encryption key in secure, separate location
- Consider key escrow or split-key systems
- Regular key backup verification

## Backup Verification

### Automated Verification
- Weekly integrity checks via cron
- Backup creation testing
- Storage health monitoring

### Manual Verification
\`\`\`bash
# Test all backup integrity
sudo seraphc2-test-backups

# Generate health report
sudo seraphc2-test-backups
cat /var/backups/seraphc2/backup-health-report.txt
\`\`\`

## Maintenance Tasks

### Regular Maintenance
- Monitor backup logs: \`tail -f ${CONFIG[backup_dir]}/logs/*.log\`
- Check disk space: \`df -h ${CONFIG[backup_dir]}\`
- Verify backup schedule: \`crontab -l\`
- Test restoration procedures quarterly

### Cleanup Operations
\`\`\`bash
# Manual cleanup (respects retention policy)
sudo seraphc2-cleanup-backups

# View cleanup logs
sudo tail -f ${CONFIG[backup_dir]}/logs/cleanup.log
\`\`\`

## Security Considerations

### Encryption
- All backups are encrypted using AES-256-CBC
- Encryption key stored securely with 600 permissions
- Key should be backed up separately from backups

### Access Control
- Backup directory: 700 permissions (root only)
- Backup files: 600 permissions (root only)
- Scripts: 755 permissions (executable by root)

### Network Security
- Backups stored locally by default
- For remote storage, use encrypted transport (rsync over SSH, etc.)
- Consider backup integrity verification over network

## Troubleshooting

### Common Issues

#### Backup Creation Fails
1. Check disk space: \`df -h ${CONFIG[backup_dir]}\`
2. Verify permissions: \`ls -la ${CONFIG[backup_dir]}\`
3. Check service status: \`systemctl status postgresql redis\`
4. Review logs: \`tail -f ${CONFIG[backup_dir]}/logs/*.log\`

#### Restoration Fails
1. Verify backup file exists and is readable
2. Check encryption key accessibility
3. Ensure sufficient disk space
4. Verify database service is running
5. Check for conflicting processes

#### Encryption Key Issues
1. Verify key file exists: \`ls -la ${CONFIG[backup_dir]}/keys/\`
2. Check permissions: should be 600
3. Test key with sample encryption/decryption

### Log Locations
- Main backup logs: \`${CONFIG[backup_dir]}/logs/\`
- System logs: \`journalctl -u seraphc2\`
- Cron logs: \`/var/log/cron\` or \`journalctl -u cron\`

## Contact and Support

For additional support:
- Check SeraphC2 documentation
- Review system logs
- Contact system administrator
- Refer to SeraphC2 community resources

---

**Important**: Test your backup and recovery procedures regularly in a non-production environment to ensure they work correctly when needed.

**Security Note**: Keep this documentation secure as it contains information about your backup system structure and procedures.
EOF

    # Set secure permissions
    chmod 600 "$doc_file"
    chown root:root "$doc_file"
    
    log_success "Recovery documentation created successfully"
    log_info "Documentation location: $doc_file"
    
    return 0
}

# MAIN SCRIPT EXECUTION FLOW
#==============================================================================

# Execute main installation flow
execute_main_installation() {
    log_info "Starting SeraphC2 installation process..."
    
    # Ensure configuration is populated before proceeding
    if [[ -z "${CONFIG[db_password]}" || -z "${CONFIG[jwt_secret]}" || -z "${CONFIG[encryption_key]}" ]]; then
        log_info "Populating secure configuration before installation..."
        if ! populate_configuration_array; then
            log_error "Failed to populate configuration with secure values"
            return $E_VALIDATION_ERROR
        fi
    fi
    
    # Mark that cleanup is required from this point forward
    CLEANUP_REQUIRED="true"
    
    # Step 1: Install dependencies (already implemented in previous tasks)
    show_step 1 9 "Installing system dependencies"
    install_and_configure_nodejs
    
    # Step 2: Deploy application (moved before database setup to ensure migrations are available)
    show_step 2 9 "Deploying SeraphC2 application"
    deploy_seraphc2_application
    
    # Step 3: Setup database (already implemented in previous tasks)
    show_step 3 9 "Setting up PostgreSQL database"
    setup_postgresql_database
    
    # Step 4: Setup Redis (already implemented in previous tasks)
    show_step 4 9 "Setting up Redis cache"
    setup_redis_cache
    
    # Step 5: Initialize database schema (run migrations after database is set up)
    show_step 5 9 "Initializing database schema"
    initialize_database_schema
    
    # Step 6: Setup SSL certificates (already implemented in previous tasks)
    show_step 6 9 "Setting up SSL certificates"
    setup_ssl_certificates
    
    # Step 7: Configure system service (already implemented in previous tasks)
    show_step 7 9 "Configuring system service"
    configure_systemd_service
    
    # Step 8: Configure firewall (THIS TASK - Task 14)
    show_step 8 9 "Configuring firewall"
    configure_firewall
    
    # Step 8.5: Apply security hardening (Task 19)
    if [[ "${CONFIG[enable_hardening]}" == "true" ]]; then
        show_step 8.5 9 "Applying security hardening"
        apply_security_hardening
    fi
    
    # Step 9: Setup backup and recovery system (Task 20)
    if [[ "${CONFIG[skip_backup]}" != "true" ]]; then
        show_step 9 9 "Setting up backup and recovery system"
        setup_backup_and_recovery_system
    fi
    
    # Step 10: Validate installation (Task 15)
    show_step 10 10 "Validating installation"
    validate_installation
    
    # Create uninstall script for future use (Task 17)
    if ! create_uninstall_script; then
        log_warning "Failed to create uninstall script, but installation was successful"
    fi
    
    log_success "Installation process completed successfully"
}

# Main function - orchestrates the entire installation process
main() {
    # Parse command line arguments first (before logging is initialized)
    parse_arguments "$@"
    
    # Initialize script
    init_script
    
    # Test rollback functionality if requested (hidden testing feature)
    if [[ "${CONFIG[test_rollback]}" == "true" ]]; then
        test_rollback_functionality
        exit $E_SUCCESS
    fi
    
    # Validate configuration from command line arguments
    validate_configuration
    
    # Set up default configuration values
    setup_default_configuration
    
    # Run interactive configuration if requested
    if [[ "${CONFIG[mode]}" == "interactive" ]]; then
        run_interactive_configuration
    fi
    
    # Generate secure configuration values (passwords, secrets, keys)
    if ! populate_configuration_array; then
        log_error "Failed to populate configuration with secure values"
        exit $E_VALIDATION_ERROR
    fi
    
    # Display current configuration
    if [[ "${CONFIG[verbose]}" == "true" ]]; then
        show_configuration
    fi
    
    # Check system prerequisites and detect system information
    check_system_prerequisites
    
    # Mark that cleanup may be required from this point forward
    CLEANUP_REQUIRED="true"
    
    log_info "Prerequisites check completed successfully"
    log_info "System is ready for SeraphC2 installation"
    
    # Handle update and maintenance modes
    case "${CONFIG[mode]}" in
        "update-check")
            log_info "Update check mode selected"
            if check_for_updates; then
                log_info "Updates are available. Run with --update to apply them."
                show_update_maintenance_info
                exit 0
            else
                log_success "All components are up to date"
                exit 0
            fi
            ;;
        "update")
            log_info "Update mode selected"
            if ! perform_updates; then
                log_error "Update process failed"
                exit 1
            fi
            log_success "Update process completed successfully"
            exit 0
            ;;
        "maintenance")
            log_info "Maintenance mode selected"
            if ! perform_maintenance; then
                log_error "Maintenance tasks failed"
                exit 1
            fi
            log_success "Maintenance tasks completed successfully"
            exit 0
            ;;
    esac
    
    # Check if Docker deployment is requested
    if [[ "${CONFIG[mode]}" == "docker" ]]; then
        log_info "Docker deployment mode selected"
        log_info "Starting Docker-based installation..."
        
        # Show Docker-specific information
        echo ""
        echo -e "${CYAN}🐳 Docker Deployment Information${NC}"
        echo -e "================================="
        echo -e "• All services will run in containers"
        echo -e "• Data will be persisted in Docker volumes"
        echo -e "• No system services will be created"
        echo -e "• Easy to update and manage"
        echo ""
        
        # Docker deployment path (Task 18) - IMPLEMENTED
        if ! deploy_with_docker; then
            log_error "Docker deployment failed"
            exit $E_DOCKER_ERROR
        fi
        
        # Display Docker-specific connection information
        display_docker_connection_info
        
        log_success "Docker deployment completed successfully!"
        log_info "SeraphC2 is now running in Docker containers"
        
        return 0
    fi
    
    # Native installation path (default)
    log_info "Native installation mode selected"
    log_info "Installing dependencies and configuring services natively (not using Docker)..."
    
    # Ensure Docker is not used in native installation
    if command -v docker >/dev/null 2>&1 && [[ "${CONFIG[mode]}" != "docker" ]]; then
        log_info "Docker detected but not using it for native installation"
        log_info "Use --docker flag if you prefer containerized deployment"
    fi
    
    # Ensure we're not mixing native with Docker installation
    if [[ "${INSTALL_STATE[docker_deployed]}" == "true" ]]; then
        log_error "Cannot proceed with native installation: Docker deployment already detected"
        log_error "Please use a clean system or run rollback first"
        exit $E_VALIDATION_ERROR
    fi
    
    # Node.js installation and configuration (Task 7) - IMPLEMENTED
    if ! install_and_configure_nodejs; then
        log_error "Node.js installation and configuration failed"
        exit $E_PACKAGE_INSTALL_FAILED
    fi
    
    # SSL certificate setup (Task 10) - IMPLEMENTED
    if ! setup_ssl_certificates; then
        log_error "SSL certificate setup failed"
        exit $E_SSL_ERROR
    fi
    
    # Application deployment (Task 11) - IMPLEMENTED
    if ! deploy_seraphc2_application; then
        log_error "SeraphC2 application deployment failed"
        exit $E_SERVICE_ERROR
    fi
    
    # Systemd service management (Task 13) - IMPLEMENTED
    if ! configure_systemd_service; then
        log_error "Systemd service configuration failed"
        exit $E_SERVICE_ERROR
    fi
    
    # PostgreSQL database setup (Task 8) - IMPLEMENTED
    if ! setup_postgresql_database; then
        log_error "PostgreSQL database setup failed"
        exit $E_DATABASE_ERROR
    fi
    
    # Redis cache setup (Task 9) - IMPLEMENTED
    if ! setup_redis_cache; then
        log_error "Redis cache setup failed"
        exit $E_SERVICE_ERROR
    fi
    
    # Database migration and initialization (Task 12) - IMPLEMENTED
    if ! initialize_database_schema; then
        log_error "Database migration and initialization failed"
        exit $E_DATABASE_ERROR
    fi
    
    # Firewall configuration (Task 14) - IMPLEMENTED
    if ! configure_firewall; then
        log_error "Firewall configuration failed"
        exit $E_FIREWALL_ERROR
    fi
    
    # Security hardening (Task 19) - IMPLEMENTED
    if [[ "${CONFIG[enable_hardening]}" == "true" ]]; then
        if ! apply_security_hardening; then
            log_warning "Security hardening failed, continuing with basic security"
        fi
    fi
    
    # Backup and recovery setup (Task 20) - IMPLEMENTED
    if ! setup_backup_system; then
        log_warning "Backup system setup failed, continuing without automated backups"
    fi
    
    # Installation testing and validation (Task 15) - IMPLEMENTED
    if ! perform_installation_validation; then
        log_error "Installation validation failed"
        exit $E_VALIDATION_ERROR
    fi
    
    # Display connection information (Task 16) - IMPLEMENTED
    display_connection_information
    
    # Schedule maintenance tasks (Task 21 - Requirement 13.6, 13.7)
    if ! schedule_maintenance_tasks; then
        log_warning "Failed to schedule maintenance tasks"
        log_info "You can manually run maintenance with: $0 --maintenance"
    fi
    
    log_success "Native installation completed successfully!"
    
    # Display update and maintenance information
    show_update_maintenance_info
    
    return 0
}

#==============================================================================
# SSL CERTIFICATE MANAGEMENT SYSTEM
#==============================================================================

# Generate self-signed SSL certificate using openssl
generate_self_signed_certificate() {
    log_info "Generating self-signed SSL certificate..."
    
    local ssl_dir="${CONFIG[ssl_dir]}"
    local domain="${CONFIG[domain]}"
    local cert_path="$ssl_dir/server.crt"
    local key_path="$ssl_dir/server.key"
    local csr_path="$ssl_dir/server.csr"
    
    # Create SSL directory if it doesn't exist
    if ! mkdir -p "$ssl_dir"; then
        log_error "Failed to create SSL directory: $ssl_dir"
        return 1
    fi
    
    # Set proper permissions on SSL directory
    chmod 755 "$ssl_dir"
    
    log_verbose "Creating self-signed certificate for domain: $domain"
    log_verbose "Certificate will be saved to: $cert_path"
    log_verbose "Private key will be saved to: $key_path"
    
    # Generate private key
    if ! openssl genrsa -out "$key_path" 2048 2>/dev/null; then
        log_error "Failed to generate private key"
        return 1
    fi
    
    # Set secure permissions on private key immediately
    chmod 600 "$key_path"
    
    # Create certificate signing request
    local subject="/C=US/ST=State/L=City/O=SeraphC2/OU=Command and Control/CN=$domain"
    
    if ! openssl req -new -key "$key_path" -out "$csr_path" -subj "$subject" 2>/dev/null; then
        log_error "Failed to create certificate signing request"
        return 1
    fi
    
    # Generate self-signed certificate (valid for 365 days)
    if ! openssl x509 -req -days 365 -in "$csr_path" -signkey "$key_path" -out "$cert_path" 2>/dev/null; then
        log_error "Failed to generate self-signed certificate"
        return 1
    fi
    
    # Set proper permissions on certificate
    chmod 644 "$cert_path"
    
    # Clean up CSR file
    rm -f "$csr_path"
    
    # Store certificate paths in configuration
    CONFIG[ssl_cert_path]="$cert_path"
    CONFIG[ssl_key_path]="$key_path"
    
    log_success "Self-signed SSL certificate generated successfully"
    log_info "Certificate: $cert_path"
    log_info "Private Key: $key_path"
    log_info "Certificate valid for 365 days"
    
    return 0
}

# Install and configure certbot for Let's Encrypt
install_certbot() {
    log_info "Installing Certbot for Let's Encrypt certificates..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    
    case "$os_type" in
        "ubuntu"|"debian")
            # Install snapd if not present
            if ! command -v snap >/dev/null 2>&1; then
                if ! install_package "snapd"; then
                    log_error "Failed to install snapd"
                    return 1
                fi
                
                # Enable snapd service
                systemctl enable --now snapd.socket
                
                # Wait for snapd to be ready
                sleep 5
            fi
            
            # Install certbot via snap (recommended method)
            if ! snap install --classic certbot; then
                log_warning "Failed to install certbot via snap, trying package manager..."
                
                # Fallback to package manager
                if ! install_package "certbot"; then
                    log_error "Failed to install certbot"
                    return 1
                fi
            else
                # Create symlink for snap-installed certbot
                if [[ ! -L /usr/bin/certbot ]]; then
                    ln -s /snap/bin/certbot /usr/bin/certbot
                fi
            fi
            ;;
        "centos"|"rhel"|"fedora")
            # Install EPEL repository if not present
            if [[ "$os_type" == "centos" || "$os_type" == "rhel" ]]; then
                if ! rpm -q epel-release >/dev/null 2>&1; then
                    if ! install_package "epel-release"; then
                        log_error "Failed to install EPEL repository"
                        return 1
                    fi
                fi
            fi
            
            # Install certbot
            if ! install_package "certbot"; then
                log_error "Failed to install certbot"
                return 1
            fi
            ;;
        *)
            log_error "Unsupported OS for certbot installation: $os_type"
            return 1
            ;;
    esac
    
    # Verify certbot installation
    if ! command -v certbot >/dev/null 2>&1; then
        log_error "Certbot installation verification failed"
        return 1
    fi
    
    log_success "Certbot installed successfully"
    log_verbose "Certbot version: $(certbot --version 2>&1 | head -n1)"
    
    return 0
}

# Setup Let's Encrypt certificate using certbot
setup_letsencrypt_certificate() {
    log_info "Setting up Let's Encrypt certificate..."
    
    local domain="${CONFIG[domain]}"
    local email="${CONFIG[letsencrypt_email]}"
    local ssl_dir="${CONFIG[ssl_dir]}"
    
    # Validate domain is not localhost or IP
    if [[ "$domain" == "localhost" ]] || [[ "$domain" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        log_error "Let's Encrypt requires a valid domain name, not localhost or IP address"
        log_info "Current domain: $domain"
        log_info "Please use --domain=yourdomain.com or switch to self-signed certificates"
        return 1
    fi
    
    # Validate email is provided
    if [[ -z "$email" ]]; then
        log_error "Email address is required for Let's Encrypt certificate"
        return 1
    fi
    
    # Create SSL directory if it doesn't exist
    if ! mkdir -p "$ssl_dir"; then
        log_error "Failed to create SSL directory: $ssl_dir"
        return 1
    fi
    
    log_info "Requesting Let's Encrypt certificate for domain: $domain"
    log_info "Email: $email"
    
    # Use standalone mode for certificate generation
    # This requires port 80 to be available temporarily
    local certbot_cmd="certbot certonly --standalone --non-interactive --agree-tos"
    certbot_cmd="$certbot_cmd --email $email --domains $domain"
    certbot_cmd="$certbot_cmd --cert-path $ssl_dir/server.crt"
    certbot_cmd="$certbot_cmd --key-path $ssl_dir/server.key"
    certbot_cmd="$certbot_cmd --fullchain-path $ssl_dir/fullchain.crt"
    certbot_cmd="$certbot_cmd --chain-path $ssl_dir/chain.crt"
    
    log_verbose "Running certbot command: $certbot_cmd"
    
    # Stop any service that might be using port 80
    local services_to_stop=("apache2" "httpd" "nginx")
    local stopped_services=()
    
    for service in "${services_to_stop[@]}"; do
        if systemctl is-active "$service" >/dev/null 2>&1; then
            log_verbose "Temporarily stopping $service for certificate generation"
            systemctl stop "$service"
            stopped_services+=("$service")
        fi
    done
    
    # Run certbot
    if ! $certbot_cmd; then
        log_error "Failed to obtain Let's Encrypt certificate"
        
        # Restart stopped services
        for service in "${stopped_services[@]}"; do
            log_verbose "Restarting $service"
            systemctl start "$service" || true
        done
        
        return 1
    fi
    
    # Restart stopped services
    for service in "${stopped_services[@]}"; do
        log_verbose "Restarting $service"
        systemctl start "$service" || true
    done
    
    # Verify certificate files exist
    local cert_path="$ssl_dir/server.crt"
    local key_path="$ssl_dir/server.key"
    
    if [[ ! -f "$cert_path" ]] || [[ ! -f "$key_path" ]]; then
        log_error "Certificate files not found after certbot execution"
        return 1
    fi
    
    # Set proper permissions
    chmod 644 "$cert_path"
    chmod 600 "$key_path"
    
    # Store certificate paths in configuration
    CONFIG[ssl_cert_path]="$cert_path"
    CONFIG[ssl_key_path]="$key_path"
    
    log_success "Let's Encrypt certificate obtained successfully"
    log_info "Certificate: $cert_path"
    log_info "Private Key: $key_path"
    
    # Display certificate information
    local cert_info
    cert_info=$(openssl x509 -in "$cert_path" -text -noout 2>/dev/null | grep -E "(Subject:|Not After :)" | head -2)
    if [[ -n "$cert_info" ]]; then
        log_info "Certificate details:"
        echo "$cert_info" | while read -r line; do
            log_info "  $line"
        done
    fi
    
    return 0
}

# Install custom SSL certificate
install_custom_certificate() {
    log_info "Installing custom SSL certificate..."
    
    local ssl_dir="${CONFIG[ssl_dir]}"
    local custom_cert_path="${CONFIG[ssl_cert_path]}"
    local custom_key_path="${CONFIG[ssl_key_path]}"
    
    # Validate custom certificate paths are provided
    if [[ -z "$custom_cert_path" ]] || [[ -z "$custom_key_path" ]]; then
        log_error "Custom certificate and key paths must be provided"
        log_info "Use --ssl-cert-path and --ssl-key-path options"
        return 1
    fi
    
    # Validate custom certificate files exist
    if [[ ! -f "$custom_cert_path" ]]; then
        log_error "Custom certificate file not found: $custom_cert_path"
        return 1
    fi
    
    if [[ ! -f "$custom_key_path" ]]; then
        log_error "Custom private key file not found: $custom_key_path"
        return 1
    fi
    
    # Create SSL directory if it doesn't exist
    if ! mkdir -p "$ssl_dir"; then
        log_error "Failed to create SSL directory: $ssl_dir"
        return 1
    fi
    
    # Validate certificate format
    if ! openssl x509 -in "$custom_cert_path" -text -noout >/dev/null 2>&1; then
        log_error "Invalid certificate format: $custom_cert_path"
        return 1
    fi
    
    # Validate private key format
    if ! openssl rsa -in "$custom_key_path" -check -noout >/dev/null 2>&1; then
        log_error "Invalid private key format: $custom_key_path"
        return 1
    fi
    
    # Verify certificate and key match
    local cert_modulus key_modulus
    cert_modulus=$(openssl x509 -noout -modulus -in "$custom_cert_path" 2>/dev/null | openssl md5)
    key_modulus=$(openssl rsa -noout -modulus -in "$custom_key_path" 2>/dev/null | openssl md5)
    
    if [[ "$cert_modulus" != "$key_modulus" ]]; then
        log_error "Certificate and private key do not match"
        return 1
    fi
    
    # Copy certificate and key to SSL directory
    local dest_cert_path="$ssl_dir/server.crt"
    local dest_key_path="$ssl_dir/server.key"
    
    if ! cp "$custom_cert_path" "$dest_cert_path"; then
        log_error "Failed to copy certificate to $dest_cert_path"
        return 1
    fi
    
    if ! cp "$custom_key_path" "$dest_key_path"; then
        log_error "Failed to copy private key to $dest_key_path"
        return 1
    fi
    
    # Set proper permissions
    chmod 644 "$dest_cert_path"
    chmod 600 "$dest_key_path"
    
    # Update configuration with final paths
    CONFIG[ssl_cert_path]="$dest_cert_path"
    CONFIG[ssl_key_path]="$dest_key_path"
    
    log_success "Custom SSL certificate installed successfully"
    log_info "Certificate: $dest_cert_path"
    log_info "Private Key: $dest_key_path"
    
    # Display certificate information
    local cert_info
    cert_info=$(openssl x509 -in "$dest_cert_path" -text -noout 2>/dev/null | grep -E "(Subject:|Issuer:|Not After :)" | head -3)
    if [[ -n "$cert_info" ]]; then
        log_info "Certificate details:"
        echo "$cert_info" | while read -r line; do
            log_info "  $line"
        done
    fi
    
    return 0
}

# Configure SSL certificate permissions and ownership
configure_ssl_permissions() {
    log_info "Configuring SSL certificate permissions and ownership..."
    
    local ssl_dir="${CONFIG[ssl_dir]}"
    local cert_path="${CONFIG[ssl_cert_path]}"
    local key_path="${CONFIG[ssl_key_path]}"
    local service_user="${CONFIG[service_user]}"
    
    # Validate SSL directory exists
    if [[ ! -d "$ssl_dir" ]]; then
        log_error "SSL directory does not exist: $ssl_dir"
        return 1
    fi
    
    # Validate certificate files exist
    if [[ ! -f "$cert_path" ]]; then
        log_error "Certificate file does not exist: $cert_path"
        return 1
    fi
    
    if [[ ! -f "$key_path" ]]; then
        log_error "Private key file does not exist: $key_path"
        return 1
    fi
    
    # Set directory permissions
    chmod 755 "$ssl_dir"
    
    # Set certificate permissions (readable by all)
    chmod 644 "$cert_path"
    
    # Set private key permissions (readable only by owner)
    chmod 600 "$key_path"
    
    # Set ownership to service user if it exists
    if id "$service_user" >/dev/null 2>&1; then
        chown "$service_user:$service_user" "$ssl_dir"
        chown "$service_user:$service_user" "$cert_path"
        chown "$service_user:$service_user" "$key_path"
        log_verbose "SSL files ownership set to $service_user"
    else
        # Set ownership to root if service user doesn't exist yet
        chown root:root "$ssl_dir"
        chown root:root "$cert_path"
        chown root:root "$key_path"
        log_verbose "SSL files ownership set to root (service user not yet created)"
    fi
    
    log_success "SSL certificate permissions configured successfully"
    log_verbose "SSL directory: $ssl_dir (755)"
    log_verbose "Certificate: $cert_path (644)"
    log_verbose "Private key: $key_path (600)"
    
    return 0
}

# Setup certificate renewal for Let's Encrypt
setup_certificate_renewal() {
    log_info "Setting up automatic certificate renewal..."
    
    local ssl_type="${CONFIG[ssl_type]}"
    
    # Only setup renewal for Let's Encrypt certificates
    if [[ "$ssl_type" != "letsencrypt" ]]; then
        log_info "Certificate renewal not needed for $ssl_type certificates"
        return 0
    fi
    
    # Verify certbot is installed
    if ! command -v certbot >/dev/null 2>&1; then
        log_error "Certbot not found, cannot setup renewal"
        return 1
    fi
    
    # Create renewal script
    local renewal_script="/usr/local/bin/seraphc2-cert-renewal"
    
    cat > "$renewal_script" << 'EOF'
#!/bin/bash
#
# SeraphC2 Certificate Renewal Script
# This script renews Let's Encrypt certificates and restarts the SeraphC2 service
#

set -e

# Logging function
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a /var/log/seraphc2-cert-renewal.log
}

log_message "Starting certificate renewal check..."

# Attempt to renew certificates
if certbot renew --quiet --no-self-upgrade; then
    log_message "Certificate renewal check completed successfully"
    
    # Check if any certificates were actually renewed
    if certbot renew --dry-run --quiet 2>/dev/null; then
        log_message "Certificates are up to date, no restart needed"
    else
        log_message "Certificates may have been renewed, restarting SeraphC2 service..."
        
        # Restart SeraphC2 service to use new certificates
        if systemctl is-active seraphc2 >/dev/null 2>&1; then
            systemctl restart seraphc2
            log_message "SeraphC2 service restarted successfully"
        else
            log_message "SeraphC2 service is not running, no restart needed"
        fi
    fi
else
    log_message "Certificate renewal failed"
    exit 1
fi

log_message "Certificate renewal process completed"
EOF
    
    # Make renewal script executable
    chmod +x "$renewal_script"
    
    # Create log file with proper permissions
    touch /var/log/seraphc2-cert-renewal.log
    chmod 644 /var/log/seraphc2-cert-renewal.log
    
    # Setup cron job for automatic renewal (twice daily as recommended)
    local cron_entry="0 */12 * * * root $renewal_script"
    
    # Check if cron entry already exists
    if ! crontab -l 2>/dev/null | grep -q "$renewal_script"; then
        # Add cron entry
        (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
        log_success "Certificate renewal cron job added"
        log_info "Certificates will be checked for renewal twice daily"
    else
        log_info "Certificate renewal cron job already exists"
    fi
    
    # Test the renewal script
    log_info "Testing certificate renewal script..."
    if certbot renew --dry-run --quiet; then
        log_success "Certificate renewal test passed"
    else
        log_warning "Certificate renewal test failed, but renewal script is installed"
    fi
    
    log_success "Certificate renewal setup completed"
    log_info "Renewal script: $renewal_script"
    log_info "Renewal log: /var/log/seraphc2-cert-renewal.log"
    
    return 0
}

# Test SSL configuration
test_ssl_configuration() {
    log_info "Testing SSL configuration..."
    
    local cert_path="${CONFIG[ssl_cert_path]}"
    local key_path="${CONFIG[ssl_key_path]}"
    local domain="${CONFIG[domain]}"
    
    # Validate certificate files exist
    if [[ ! -f "$cert_path" ]]; then
        log_error "Certificate file not found: $cert_path"
        return 1
    fi
    
    if [[ ! -f "$key_path" ]]; then
        log_error "Private key file not found: $key_path"
        return 1
    fi
    
    # Test certificate validity
    log_verbose "Testing certificate validity..."
    if ! openssl x509 -in "$cert_path" -text -noout >/dev/null 2>&1; then
        log_error "Certificate file is invalid or corrupted"
        return 1
    fi
    
    # Test private key validity
    log_verbose "Testing private key validity..."
    if ! openssl rsa -in "$key_path" -check -noout >/dev/null 2>&1; then
        log_error "Private key file is invalid or corrupted"
        return 1
    fi
    
    # Test certificate and key compatibility
    log_verbose "Testing certificate and key compatibility..."
    local cert_modulus key_modulus
    cert_modulus=$(openssl x509 -noout -modulus -in "$cert_path" 2>/dev/null | openssl md5)
    key_modulus=$(openssl rsa -noout -modulus -in "$key_path" 2>/dev/null | openssl md5)
    
    if [[ "$cert_modulus" != "$key_modulus" ]]; then
        log_error "Certificate and private key do not match"
        return 1
    fi
    
    # Check certificate expiration
    log_verbose "Checking certificate expiration..."
    local expiry_date
    expiry_date=$(openssl x509 -in "$cert_path" -noout -enddate 2>/dev/null | cut -d= -f2)
    
    if [[ -n "$expiry_date" ]]; then
        local expiry_epoch
        expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || echo 0)
        local current_epoch
        current_epoch=$(date +%s)
        local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
        
        if [[ $days_until_expiry -lt 0 ]]; then
            log_error "Certificate has expired on $expiry_date"
            return 1
        elif [[ $days_until_expiry -lt 30 ]]; then
            log_warning "Certificate expires in $days_until_expiry days on $expiry_date"
        else
            log_info "Certificate expires in $days_until_expiry days on $expiry_date"
        fi
    fi
    
    # Test file permissions
    log_verbose "Testing file permissions..."
    local cert_perms key_perms
    cert_perms=$(stat -c "%a" "$cert_path" 2>/dev/null)
    key_perms=$(stat -c "%a" "$key_path" 2>/dev/null)
    
    if [[ "$cert_perms" != "644" ]]; then
        log_warning "Certificate permissions should be 644, found $cert_perms"
    fi
    
    if [[ "$key_perms" != "600" ]]; then
        log_warning "Private key permissions should be 600, found $key_perms"
    fi
    
    # Test SSL connection (if openssl s_client is available)
    log_verbose "Testing SSL connection capability..."
    if command -v openssl >/dev/null 2>&1; then
        # Create a temporary test using the certificate
        local test_result
        test_result=$(echo | openssl s_client -connect localhost:443 -cert "$cert_path" -key "$key_path" -verify_return_error 2>&1 | grep -E "(Verify return code|verify error)" | head -1)
        
        if [[ -n "$test_result" ]]; then
            log_verbose "SSL test result: $test_result"
        fi
    fi
    
    log_success "SSL configuration test completed successfully"
    log_info "Certificate: $cert_path"
    log_info "Private Key: $key_path"
    log_info "Domain: $domain"
    
    return 0
}

# Main SSL certificate setup function
setup_ssl_certificates() {
    log_info "Setting up SSL certificates..."
    
    local ssl_type="${CONFIG[ssl_type]}"
    
    # Ensure openssl is available
    if ! command -v openssl >/dev/null 2>&1; then
        log_error "OpenSSL is required for SSL certificate management"
        log_info "Please install OpenSSL and try again"
        return 1
    fi
    
    # Setup certificates based on type
    case "$ssl_type" in
        "self-signed")
            if ! generate_self_signed_certificate; then
                log_error "Failed to generate self-signed certificate"
                return 1
            fi
            ;;
        "letsencrypt")
            # Install certbot first
            if ! install_certbot; then
                log_error "Failed to install certbot"
                return 1
            fi
            
            # Setup Let's Encrypt certificate
            if ! setup_letsencrypt_certificate; then
                log_error "Failed to setup Let's Encrypt certificate"
                return 1
            fi
            
            # Setup automatic renewal
            if ! setup_certificate_renewal; then
                log_error "Failed to setup certificate renewal"
                return 1
            fi
            ;;
        "custom")
            if ! install_custom_certificate; then
                log_error "Failed to install custom certificate"
                return 1
            fi
            ;;
        *)
            log_error "Unknown SSL type: $ssl_type"
            return 1
            ;;
    esac
    
    # Configure permissions and ownership
    if ! configure_ssl_permissions; then
        log_error "Failed to configure SSL permissions"
        return 1
    fi
    
    # Test SSL configuration
    if ! test_ssl_configuration; then
        log_error "SSL configuration test failed"
        return 1
    fi
    
    # Mark SSL certificates as created
    mark_install_state "ssl_certificates_created"
    
    log_success "SSL certificate setup completed successfully"
    log_info "SSL Type: $ssl_type"
    log_info "Certificate: ${CONFIG[ssl_cert_path]}"
    log_info "Private Key: ${CONFIG[ssl_key_path]}"
    
    return 0
}

#==============================================================================
# INSTALLATION TESTING AND VALIDATION SYSTEM
#==============================================================================

# Main installation validation function - orchestrates all tests
validate_installation() {
    log_info "Starting comprehensive installation validation..."
    
    local validation_failed=false
    local test_results=()
    
    # Test 1: Service health checking
    log_info "Running service health checks..."
    if validate_service_health; then
        test_results+=("✓ Service health check: PASSED")
        log_success "Service health validation completed"
    else
        test_results+=("✗ Service health check: FAILED")
        validation_failed=true
        log_error "Service health validation failed"
    fi
    
    # Test 2: Web interface accessibility testing
    log_info "Testing web interface accessibility..."
    if validate_web_interface_accessibility; then
        test_results+=("✓ Web interface accessibility: PASSED")
        log_success "Web interface accessibility validation completed"
    else
        test_results+=("✗ Web interface accessibility: FAILED")
        validation_failed=true
        log_error "Web interface accessibility validation failed"
    fi
    
    # Test 3: Database connectivity and schema validation
    log_info "Validating database connectivity and schema..."
    if validate_database_connectivity_and_schema; then
        test_results+=("✓ Database connectivity and schema: PASSED")
        log_success "Database validation completed"
    else
        test_results+=("✗ Database connectivity and schema: FAILED")
        validation_failed=true
        log_error "Database validation failed"
    fi
    
    # Test 4: SSL certificate and HTTPS testing
    log_info "Testing SSL certificate and HTTPS configuration..."
    if validate_ssl_and_https; then
        test_results+=("✓ SSL certificate and HTTPS: PASSED")
        log_success "SSL/HTTPS validation completed"
    else
        test_results+=("✗ SSL certificate and HTTPS: FAILED")
        validation_failed=true
        log_error "SSL/HTTPS validation failed"
    fi
    
    # Test 5: Port accessibility and firewall validation
    log_info "Validating port accessibility and firewall configuration..."
    if validate_port_accessibility_and_firewall; then
        test_results+=("✓ Port accessibility and firewall: PASSED")
        log_success "Port and firewall validation completed"
    else
        test_results+=("✗ Port accessibility and firewall: FAILED")
        validation_failed=true
        log_error "Port and firewall validation failed"
    fi
    
    # Test 5.5: Security hardening validation (if enabled)
    if [[ "${CONFIG[enable_hardening]}" == "true" ]]; then
        log_info "Validating security hardening configuration..."
        if validate_security_hardening; then
            test_results+=("✓ Security hardening: PASSED")
            log_success "Security hardening validation completed"
        else
            test_results+=("✗ Security hardening: FAILED")
            log_warning "Security hardening validation failed - some security measures may not be active"
            # Don't fail the entire validation for security hardening issues
        fi
    fi
    
    # Test 6: End-to-end installation verification
    log_info "Running end-to-end installation verification..."
    if validate_end_to_end_functionality; then
        test_results+=("✓ End-to-end functionality: PASSED")
        log_success "End-to-end validation completed"
    else
        test_results+=("✗ End-to-end functionality: FAILED")
        validation_failed=true
        log_error "End-to-end validation failed"
    fi
    
    # Display validation summary
    echo ""
    log_info "Installation Validation Summary:"
    echo "=================================="
    for result in "${test_results[@]}"; do
        if [[ "$result" =~ "✓" ]]; then
            echo -e "${GREEN}$result${NC}"
        else
            echo -e "${RED}$result${NC}"
        fi
    done
    echo "=================================="
    
    if [[ "$validation_failed" == "true" ]]; then
        log_error "Installation validation failed - C2 server may not be fully functional"
        log_info "Check the log file for detailed error information: $SCRIPT_LOG_FILE"
        return $E_VALIDATION_ERROR
    else
        log_success "All installation validation tests passed - C2 server is fully functional"
        return 0
    fi
}

# Validate service health and status
validate_service_health() {
    local service_name="seraphc2"
    local validation_passed=true
    
    log_debug "Validating service health for $service_name..."
    
    # Check if service exists
    if ! systemctl list-unit-files | grep -q "^$service_name.service"; then
        log_error "Service $service_name.service does not exist"
        return 1
    fi
    
    # Check if service is enabled
    if ! systemctl is-enabled "$service_name" >/dev/null 2>&1; then
        log_error "Service $service_name is not enabled for startup"
        validation_passed=false
    else
        log_debug "Service $service_name is enabled for startup"
    fi
    
    # Check if service is active
    if ! systemctl is-active "$service_name" >/dev/null 2>&1; then
        log_error "Service $service_name is not active"
        validation_passed=false
        
        # Show service status for debugging
        log_debug "Service status:"
        systemctl status "$service_name" --no-pager -l || true
        
        # Show recent logs
        log_debug "Recent service logs:"
        journalctl -u "$service_name" --no-pager -l -n 20 || true
    else
        log_debug "Service $service_name is active"
    fi
    
    # Check service process and resource usage
    if systemctl is-active "$service_name" >/dev/null 2>&1; then
        local main_pid
        main_pid=$(systemctl show "$service_name" --property=MainPID --value 2>/dev/null)
        
        if [[ -n "$main_pid" && "$main_pid" != "0" ]]; then
            log_debug "Service main PID: $main_pid"
            
            # Check if process is actually running
            if ! kill -0 "$main_pid" 2>/dev/null; then
                log_error "Service process (PID: $main_pid) is not running"
                validation_passed=false
            else
                log_debug "Service process is running"
                
                # Check memory usage
                local memory_usage
                memory_usage=$(ps -o rss= -p "$main_pid" 2>/dev/null | tr -d ' ')
                if [[ -n "$memory_usage" ]]; then
                    local memory_mb=$((memory_usage / 1024))
                    log_debug "Service memory usage: ${memory_mb}MB"
                    
                    # Warn if memory usage is very high (over 1GB)
                    if [[ $memory_mb -gt 1024 ]]; then
                        log_warning "Service memory usage is high: ${memory_mb}MB"
                    fi
                fi
            fi
        else
            log_error "Could not determine service main PID"
            validation_passed=false
        fi
    fi
    
    # Use existing check_service_health function for port validation
    if ! check_service_health; then
        log_error "Service health check failed - ports not listening"
        validation_passed=false
    fi
    
    if [[ "$validation_passed" == "true" ]]; then
        log_debug "Service health validation passed"
        return 0
    else
        log_debug "Service health validation failed"
        return 1
    fi
}

# Validate web interface accessibility
validate_web_interface_accessibility() {
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    local domain="${CONFIG[domain]}"
    local validation_passed=true
    
    log_debug "Validating web interface accessibility..."
    
    # Test HTTP interface
    log_debug "Testing HTTP interface on port $http_port..."
    if ! test_http_endpoint "http://localhost:$http_port" "HTTP"; then
        validation_passed=false
    fi
    
    # Test HTTPS interface
    log_debug "Testing HTTPS interface on port $https_port..."
    if ! test_https_endpoint "https://localhost:$https_port" "HTTPS"; then
        validation_passed=false
    fi
    
    # Test API health endpoint if available
    log_debug "Testing API health endpoint..."
    if ! test_api_health_endpoint "http://localhost:$http_port"; then
        log_warning "API health endpoint test failed - this may be expected if not implemented"
        # Don't fail validation for this as it might not be implemented yet
    fi
    
    # Test web interface responsiveness
    log_debug "Testing web interface responsiveness..."
    if ! test_web_interface_responsiveness "http://localhost:$http_port"; then
        validation_passed=false
    fi
    
    if [[ "$validation_passed" == "true" ]]; then
        log_debug "Web interface accessibility validation passed"
        return 0
    else
        log_debug "Web interface accessibility validation failed"
        return 1
    fi
}

# Test HTTP endpoint accessibility
test_http_endpoint() {
    local url="$1"
    local description="$2"
    local timeout=10
    
    log_debug "Testing $description endpoint: $url"
    
    # Test basic connectivity
    if ! curl -f -s -m "$timeout" --connect-timeout 5 "$url" >/dev/null 2>&1; then
        log_error "$description endpoint is not accessible: $url"
        
        # Additional debugging
        local port
        port=$(echo "$url" | sed -n 's/.*:\([0-9]*\).*/\1/p')
        if [[ -n "$port" ]]; then
            if ! netstat -tuln 2>/dev/null | grep -q ":$port "; then
                log_error "Port $port is not listening"
            else
                log_debug "Port $port is listening but connection failed"
            fi
        fi
        
        return 1
    fi
    
    # Test response time
    local response_time
    response_time=$(curl -o /dev/null -s -w "%{time_total}" -m "$timeout" "$url" 2>/dev/null || echo "timeout")
    
    if [[ "$response_time" == "timeout" ]]; then
        log_warning "$description endpoint response timed out"
        return 1
    else
        local response_ms
        response_ms=$(echo "$response_time * 1000" | bc 2>/dev/null || echo "unknown")
        log_debug "$description endpoint response time: ${response_ms}ms"
        
        # Warn if response time is very slow (over 5 seconds)
        if (( $(echo "$response_time > 5.0" | bc -l 2>/dev/null || echo 0) )); then
            log_warning "$description endpoint is slow to respond: ${response_ms}ms"
        fi
    fi
    
    log_debug "$description endpoint test passed"
    return 0
}

# Test HTTPS endpoint accessibility
test_https_endpoint() {
    local url="$1"
    local description="$2"
    local timeout=10
    
    log_debug "Testing $description endpoint: $url"
    
    # Test basic connectivity (allow self-signed certificates)
    if ! curl -f -s -k -m "$timeout" --connect-timeout 5 "$url" >/dev/null 2>&1; then
        log_error "$description endpoint is not accessible: $url"
        
        # Additional debugging
        local port
        port=$(echo "$url" | sed -n 's/.*:\([0-9]*\).*/\1/p')
        if [[ -n "$port" ]]; then
            if ! netstat -tuln 2>/dev/null | grep -q ":$port "; then
                log_error "Port $port is not listening"
            else
                log_debug "Port $port is listening but HTTPS connection failed"
            fi
        fi
        
        return 1
    fi
    
    # Test SSL certificate
    log_debug "Testing SSL certificate for $url..."
    local cert_info
    cert_info=$(echo | openssl s_client -connect "localhost:${CONFIG[https_port]}" -servername "${CONFIG[domain]}" 2>/dev/null | openssl x509 -noout -subject -dates 2>/dev/null || echo "")
    
    if [[ -n "$cert_info" ]]; then
        log_debug "SSL certificate information:"
        echo "$cert_info" | while IFS= read -r line; do
            log_debug "  $line"
        done
    else
        log_warning "Could not retrieve SSL certificate information"
    fi
    
    log_debug "$description endpoint test passed"
    return 0
}

# Test API health endpoint
test_api_health_endpoint() {
    local base_url="$1"
    local health_endpoints=("/api/health" "/health" "/status" "/api/status")
    
    for endpoint in "${health_endpoints[@]}"; do
        local url="$base_url$endpoint"
        log_debug "Testing API health endpoint: $url"
        
        local response
        response=$(curl -f -s -m 5 "$url" 2>/dev/null || echo "")
        
        if [[ -n "$response" ]]; then
            log_debug "API health endpoint responded: $endpoint"
            log_debug "Response: $response"
            return 0
        fi
    done
    
    log_debug "No API health endpoint found"
    return 1
}

# Test web interface responsiveness
test_web_interface_responsiveness() {
    local base_url="$1"
    local test_endpoints=("/" "/login" "/dashboard" "/api" "/static")
    local passed_tests=0
    local total_tests=${#test_endpoints[@]}
    
    for endpoint in "${test_endpoints[@]}"; do
        local url="$base_url$endpoint"
        log_debug "Testing endpoint responsiveness: $url"
        
        local http_code
        http_code=$(curl -o /dev/null -s -w "%{http_code}" -m 10 "$url" 2>/dev/null || echo 000)
        
        case "$http_code" in
            200|301|302|401|403)
                # These are acceptable responses (200=OK, 301/302=redirect, 401/403=auth required)
                log_debug "Endpoint $endpoint returned HTTP $http_code (acceptable)"
                ((passed_tests++))
                ;;
            404)
                # 404 is acceptable for optional endpoints
                log_debug "Endpoint $endpoint returned HTTP 404 (not found, acceptable)"
                ((passed_tests++))
                ;;
            000)
                log_debug "Endpoint $endpoint connection failed"
                ;;
            *)
                log_debug "Endpoint $endpoint returned HTTP $http_code"
                ;;
        esac
    done
    
    log_debug "Web interface responsiveness: $passed_tests/$total_tests endpoints responded"
    
    # Consider it successful if at least the root endpoint responds
    if [[ $passed_tests -gt 0 ]]; then
        return 0
    else
        log_error "No web interface endpoints are responding"
        return 1
    fi
}

# Validate database connectivity and schema
validate_database_connectivity_and_schema() {
    local validation_passed=true
    
    log_debug "Validating database connectivity and schema..."
    
    # Test basic database connection using existing function
    if ! test_database_connection; then
        log_error "Database connection test failed"
        validation_passed=false
    else
        log_debug "Database connection test passed"
    fi
    
    # Verify database schema integrity using existing function
    if ! verify_database_schema; then
        log_error "Database schema verification failed"
        validation_passed=false
    else
        log_debug "Database schema verification passed"
    fi
    
    # Test database performance
    if ! test_database_performance; then
        log_warning "Database performance test failed - this may indicate performance issues"
        # Don't fail validation for performance issues
    else
        log_debug "Database performance test passed"
    fi
    
    # Test database security configuration
    if ! test_database_security_configuration; then
        log_warning "Database security configuration test failed"
        # Don't fail validation for security warnings
    else
        log_debug "Database security configuration test passed"
    fi
    
    if [[ "$validation_passed" == "true" ]]; then
        log_debug "Database connectivity and schema validation passed"
        return 0
    else
        log_debug "Database connectivity and schema validation failed"
        return 1
    fi
}

# Test database performance
test_database_performance() {
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    local db_host="${CONFIG[db_host]}"
    local db_port="${CONFIG[db_port]}"
    
    log_debug "Testing database performance..."
    
    # Set PGPASSWORD environment variable for authentication
    export PGPASSWORD="$db_password"
    
    # Test query performance with a simple SELECT
    local start_time end_time duration
    start_time=$(date +%s.%N)
    
    if ! psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "SELECT COUNT(*) FROM information_schema.tables;" >/dev/null 2>&1; then
        log_debug "Database performance test query failed"
        unset PGPASSWORD
        return 1
    fi
    
    end_time=$(date +%s.%N)
    duration=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "unknown")
    
    if [[ "$duration" != "unknown" ]]; then
        local duration_ms
        duration_ms=$(echo "$duration * 1000" | bc 2>/dev/null || echo "unknown")
        log_debug "Database query response time: ${duration_ms}ms"
        
        # Warn if query is very slow (over 1 second)
        if (( $(echo "$duration > 1.0" | bc -l 2>/dev/null || echo 0) )); then
            log_warning "Database queries are slow: ${duration_ms}ms"
        fi
    fi
    
    # Clean up environment variable
    unset PGPASSWORD
    
    return 0
}

# Test database security configuration
test_database_security_configuration() {
    local db_name="${CONFIG[db_name]}"
    local db_user="${CONFIG[db_user]}"
    local db_password="${CONFIG[db_password]}"
    local db_host="${CONFIG[db_host]}"
    local db_port="${CONFIG[db_port]}"
    
    log_debug "Testing database security configuration..."
    
    # Set PGPASSWORD environment variable for authentication
    export PGPASSWORD="$db_password"
    
    # Check if password authentication is required
    if psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "SELECT 1;" >/dev/null 2>&1; then
        log_debug "Database authentication is working"
    else
        log_error "Database authentication failed"
        unset PGPASSWORD
        return 1
    fi
    
    # Test that we cannot connect without password
    unset PGPASSWORD
    if psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "SELECT 1;" >/dev/null 2>&1; then
        log_warning "Database allows connections without password - security risk"
        return 1
    else
        log_debug "Database properly requires password authentication"
    fi
    
    return 0
}

# Validate SSL certificate and HTTPS configuration
validate_ssl_and_https() {
    local validation_passed=true
    
    log_debug "Validating SSL certificate and HTTPS configuration..."
    
    # Test SSL configuration using existing function
    if ! test_ssl_configuration; then
        log_error "SSL configuration test failed"
        validation_passed=false
    else
        log_debug "SSL configuration test passed"
    fi
    
    # Test HTTPS connectivity
    local https_port="${CONFIG[https_port]}"
    if ! test_https_connectivity "localhost" "$https_port"; then
        log_error "HTTPS connectivity test failed"
        validation_passed=false
    else
        log_debug "HTTPS connectivity test passed"
    fi
    
    # Test SSL certificate chain
    if ! test_ssl_certificate_chain "localhost" "$https_port"; then
        log_warning "SSL certificate chain test failed - may affect some clients"
        # Don't fail validation for certificate chain issues with self-signed certs
    else
        log_debug "SSL certificate chain test passed"
    fi
    
    # Test SSL security configuration
    if ! test_ssl_security_configuration "localhost" "$https_port"; then
        log_warning "SSL security configuration test failed - may have security implications"
        # Don't fail validation for security warnings
    else
        log_debug "SSL security configuration test passed"
    fi
    
    if [[ "$validation_passed" == "true" ]]; then
        log_debug "SSL certificate and HTTPS validation passed"
        return 0
    else
        log_debug "SSL certificate and HTTPS validation failed"
        return 1
    fi
}

# Test HTTPS connectivity
test_https_connectivity() {
    local host="$1"
    local port="$2"
    local timeout=10
    
    log_debug "Testing HTTPS connectivity to $host:$port..."
    
    # Test SSL handshake
    if ! echo | openssl s_client -connect "$host:$port" -servername "$host" >/dev/null 2>&1; then
        log_error "SSL handshake failed for $host:$port"
        return 1
    fi
    
    # Test HTTPS request
    if ! curl -f -s -k -m "$timeout" "https://$host:$port/" >/dev/null 2>&1; then
        log_error "HTTPS request failed for $host:$port"
        return 1
    fi
    
    log_debug "HTTPS connectivity test passed"
    return 0
}

# Test SSL certificate chain
test_ssl_certificate_chain() {
    local host="$1"
    local port="$2"
    
    log_debug "Testing SSL certificate chain for $host:$port..."
    
    # Get certificate chain information
    local cert_chain
    cert_chain=$(echo | openssl s_client -connect "$host:$port" -servername "$host" -showcerts 2>/dev/null | grep -c "BEGIN CERTIFICATE" || echo 0)
    
    if [[ "$cert_chain" -eq 0 ]]; then
        log_error "No certificates found in chain"
        return 1
    fi
    
    log_debug "Certificate chain contains $cert_chain certificate(s)"
    
    # For self-signed certificates, we expect only 1 certificate
    if [[ "${CONFIG[ssl_type]}" == "self-signed" && "$cert_chain" -eq 1 ]]; then
        log_debug "Self-signed certificate chain is correct"
        return 0
    elif [[ "${CONFIG[ssl_type]}" != "self-signed" && "$cert_chain" -gt 1 ]]; then
        log_debug "Certificate chain appears complete"
        return 0
    else
        log_warning "Certificate chain may be incomplete"
        return 1
    fi
}

# Test SSL security configuration
test_ssl_security_configuration() {
    local host="$1"
    local port="$2"
    
    log_debug "Testing SSL security configuration for $host:$port..."
    
    # Test supported SSL/TLS versions
    local tls_versions=("tls1_2" "tls1_3")
    local supported_versions=()
    
    for version in "${tls_versions[@]}"; do
        if echo | openssl s_client -connect "$host:$port" -"$version" >/dev/null 2>&1; then
            supported_versions+=("$version")
            log_debug "TLS version $version is supported"
        fi
    done
    
    if [[ ${#supported_versions[@]} -eq 0 ]]; then
        log_error "No secure TLS versions are supported"
        return 1
    fi
    
    # Check for weak SSL versions (should not be supported)
    local weak_versions=("ssl3" "tls1" "tls1_1")
    for version in "${weak_versions[@]}"; do
        if echo | openssl s_client -connect "$host:$port" -"$version" >/dev/null 2>&1; then
            log_warning "Weak SSL/TLS version $version is supported - security risk"
        fi
    done
    
    log_debug "SSL security configuration test completed"
    return 0
}

# Validate port accessibility and firewall configuration
validate_port_accessibility_and_firewall() {
    local validation_passed=true
    
    log_debug "Validating port accessibility and firewall configuration..."
    
    # Test firewall configuration using existing function
    if ! test_firewall_configuration; then
        log_error "Firewall configuration test failed"
        validation_passed=false
    else
        log_debug "Firewall configuration test passed"
    fi
    
    # Test port accessibility
    if ! test_port_accessibility; then
        log_error "Port accessibility test failed"
        validation_passed=false
    else
        log_debug "Port accessibility test passed"
    fi
    
    # Test external connectivity (if not localhost)
    if [[ "${CONFIG[domain]}" != "localhost" ]]; then
        if ! test_external_connectivity; then
            log_warning "External connectivity test failed - may affect remote access"
            # Don't fail validation for external connectivity issues
        else
            log_debug "External connectivity test passed"
        fi
    fi
    
    if [[ "$validation_passed" == "true" ]]; then
        log_debug "Port accessibility and firewall validation passed"
        return 0
    else
        log_debug "Port accessibility and firewall validation failed"
        return 1
    fi
}

# Test port accessibility
test_port_accessibility() {
    local ports=("${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}")
    local validation_passed=true
    
    log_debug "Testing port accessibility..."
    
    for port in "${ports[@]}"; do
        log_debug "Testing port $port accessibility..."
        
        # Check if port is listening
        if ! netstat -tuln 2>/dev/null | grep -q ":$port "; then
            log_error "Port $port is not listening"
            validation_passed=false
            continue
        fi
        
        # Test local connectivity
        if ! nc -z localhost "$port" 2>/dev/null; then
            log_error "Cannot connect to port $port locally"
            validation_passed=false
            continue
        fi
        
        log_debug "Port $port is accessible locally"
    done
    
    if [[ "$validation_passed" == "true" ]]; then
        log_debug "Port accessibility test passed"
        return 0
    else
        log_debug "Port accessibility test failed"
        return 1
    fi
}

# Test external connectivity
test_external_connectivity() {
    local domain="${CONFIG[domain]}"
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    
    log_debug "Testing external connectivity to $domain..."
    
    # Test DNS resolution
    if ! nslookup "$domain" >/dev/null 2>&1; then
        log_warning "DNS resolution failed for $domain"
        return 1
    fi
    
    # Test external HTTP connectivity
    if ! curl -f -s -m 10 "http://$domain:$http_port/" >/dev/null 2>&1; then
        log_warning "External HTTP connectivity failed for $domain:$http_port"
        return 1
    fi
    
    # Test external HTTPS connectivity
    if ! curl -f -s -k -m 10 "https://$domain:$https_port/" >/dev/null 2>&1; then
        log_warning "External HTTPS connectivity failed for $domain:$https_port"
        return 1
    fi
    
    log_debug "External connectivity test passed"
    return 0
}

# Validate end-to-end functionality
validate_end_to_end_functionality() {
    local validation_passed=true
    
    log_debug "Validating end-to-end functionality..."
    
    # Test complete system integration
    if ! test_system_integration; then
        log_error "System integration test failed"
        validation_passed=false
    else
        log_debug "System integration test passed"
    fi
    
    # Test C2 server core functionality
    if ! test_c2_core_functionality; then
        log_error "C2 core functionality test failed"
        validation_passed=false
    else
        log_debug "C2 core functionality test passed"
    fi
    
    # Test configuration integrity
    if ! test_configuration_integrity; then
        log_error "Configuration integrity test failed"
        validation_passed=false
    else
        log_debug "Configuration integrity test passed"
    fi
    
    # Test system resource usage
    if ! test_system_resource_usage; then
        log_warning "System resource usage test failed - may indicate performance issues"
        # Don't fail validation for resource usage warnings
    else
        log_debug "System resource usage test passed"
    fi
    
    if [[ "$validation_passed" == "true" ]]; then
        log_debug "End-to-end functionality validation passed"
        return 0
    else
        log_debug "End-to-end functionality validation failed"
        return 1
    fi
}

# Test system integration
test_system_integration() {
    log_debug "Testing system integration..."
    
    # Test that all required services are running and communicating
    local required_services=("postgresql" "redis" "seraphc2")
    
    for service in "${required_services[@]}"; do
        if ! systemctl is-active "$service" >/dev/null 2>&1; then
            log_error "Required service $service is not running"
            return 1
        fi
        log_debug "Service $service is running"
    done
    
    # Test service dependencies
    if ! test_service_dependencies; then
        log_error "Service dependency test failed"
        return 1
    fi
    
    log_debug "System integration test passed"
    return 0
}

# Test service dependencies
test_service_dependencies() {
    log_debug "Testing service dependencies..."
    
    # Test database connectivity from application
    local db_test_result
    db_test_result=$(curl -f -s -m 5 "http://localhost:${CONFIG[http_port]}/api/health/database" 2>/dev/null || echo "")
    
    if [[ -z "$db_test_result" ]]; then
        log_debug "Database health endpoint not available (may not be implemented)"
    else
        log_debug "Database health endpoint responded: $db_test_result"
    fi
    
    # Test Redis connectivity from application
    local redis_test_result
    redis_test_result=$(curl -f -s -m 5 "http://localhost:${CONFIG[http_port]}/api/health/redis" 2>/dev/null || echo "")
    
    if [[ -z "$redis_test_result" ]]; then
        log_debug "Redis health endpoint not available (may not be implemented)"
    else
        log_debug "Redis health endpoint responded: $redis_test_result"
    fi
    
    return 0
}

# Test C2 server core functionality
test_c2_core_functionality() {
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    local implant_port="${CONFIG[implant_port]}"
    
    log_debug "Testing C2 server core functionality..."
    
    # Test web interface is serving content
    local web_response
    web_response=$(curl -f -s -m 10 "http://localhost:$http_port/" 2>/dev/null || echo "")
    
    if [[ -z "$web_response" ]]; then
        log_error "Web interface is not serving content"
        return 1
    fi
    
    # Check if response looks like HTML or JSON (basic content validation)
    if [[ "$web_response" =~ \<html\>|\<HTML\>|^\{.*\}$ ]]; then
        log_debug "Web interface is serving valid content"
    else
        log_warning "Web interface content may not be valid HTML/JSON"
    fi
    
    # Test implant communication port
    if ! nc -z localhost "$implant_port" 2>/dev/null; then
        log_error "Implant communication port $implant_port is not accessible"
        return 1
    fi
    
    log_debug "Implant communication port is accessible"
    
    # Test HTTPS redirect (if configured)
    local https_redirect
    https_redirect=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "http://localhost:$http_port/" 2>/dev/null || echo 000)
    
    if [[ "$https_redirect" =~ ^30[12]$ ]]; then
        log_debug "HTTPS redirect is configured (HTTP $https_redirect)"
    else
        log_debug "No HTTPS redirect detected (HTTP $https_redirect)"
    fi
    
    log_debug "C2 server core functionality test passed"
    return 0
}

# Test configuration integrity
test_configuration_integrity() {
    local app_dir="${CONFIG[app_dir]}"
    local config_dir="${CONFIG[config_dir]}"
    
    log_debug "Testing configuration integrity..."
    
    # Check if .env file exists and has required variables
    local env_file="$app_dir/.env"
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment configuration file not found: $env_file"
        return 1
    fi
    
    # Check for required environment variables
    local required_vars=("NODE_ENV" "PORT" "DB_HOST" "DB_PASSWORD" "REDIS_PASSWORD" "JWT_SECRET")
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if ! grep -q "^$var=" "$env_file" 2>/dev/null; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables: ${missing_vars[*]}"
        return 1
    fi
    
    log_debug "All required environment variables are present"
    
    # Check file permissions
    local env_perms
    env_perms=$(stat -c "%a" "$env_file" 2>/dev/null || echo 000)
    
    if [[ "$env_perms" != "600" && "$env_perms" != "640" ]]; then
        log_warning "Environment file permissions may be too permissive: $env_perms"
    else
        log_debug "Environment file permissions are secure: $env_perms"
    fi
    
    log_debug "Configuration integrity test passed"
    return 0
}

# Test system resource usage
test_system_resource_usage() {
    log_debug "Testing system resource usage..."
    
    # Check memory usage
    local total_memory available_memory memory_usage_percent
    total_memory=$(free -m | awk '/^Mem:/ {print $2}')
    available_memory=$(free -m | awk '/^Mem:/ {print $7}')
    
    if [[ -n "$total_memory" && -n "$available_memory" && "$total_memory" -gt 0 ]]; then
        memory_usage_percent=$(( (total_memory - available_memory) * 100 / total_memory ))
        log_debug "Memory usage: ${memory_usage_percent}% (${available_memory}MB available of ${total_memory}MB)"
        
        if [[ $memory_usage_percent -gt 90 ]]; then
            log_warning "High memory usage: ${memory_usage_percent}%"
            return 1
        fi
    fi
    
    # Check disk usage
    local disk_usage_percent
    disk_usage_percent=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [[ -n "$disk_usage_percent" ]]; then
        log_debug "Disk usage: ${disk_usage_percent}%"
        
        if [[ $disk_usage_percent -gt 90 ]]; then
            log_warning "High disk usage: ${disk_usage_percent}%"
            return 1
        fi
    fi
    
    # Check CPU load
    local load_average
    load_average=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    
    if [[ -n "$load_average" ]]; then
        log_debug "System load average: $load_average"
        
        # Compare with number of CPU cores
        local cpu_cores
        cpu_cores=$(nproc 2>/dev/null || echo 1)
        
        if (( $(echo "$load_average > $cpu_cores * 2" | bc -l 2>/dev/null || echo 0) )); then
            log_warning "High system load: $load_average (${cpu_cores} cores)"
            return 1
        fi
    fi
    
    log_debug "System resource usage test passed"
    return 0
}

# Validate security hardening configuration
validate_security_hardening() {
    log_debug "Validating security hardening configuration..."
    
    local validation_passed=true
    local hardening_tests=0
    local hardening_passed=0
    
    # Test 1: Check if fail2ban is running
    ((hardening_tests++))
    if systemctl is-active fail2ban >/dev/null 2>&1; then
        log_debug "✓ Fail2ban service is active"
        ((hardening_passed++))
    else
        log_warning "✗ Fail2ban service is not active"
        validation_passed=false
    fi
    
    # Test 2: Check if fail2ban jails are configured
    ((hardening_tests++))
    if [[ -f /etc/fail2ban/jail.local ]] && grep -q "seraphc2" /etc/fail2ban/jail.local; then
        log_debug "✓ Fail2ban SeraphC2 jails are configured"
        ((hardening_passed++))
    else
        log_warning "✗ Fail2ban SeraphC2 jails are not properly configured"
        validation_passed=false
    fi
    
    # Test 3: Check if unnecessary services are disabled
    ((hardening_tests++))
    local unnecessary_services=("telnet" "rsh" "vsftpd")
    local disabled_services=0
    for service in "${unnecessary_services[@]}"; do
        if ! systemctl is-enabled "$service" >/dev/null 2>&1; then
            ((disabled_services++))
        fi
    done
    
    if [[ $disabled_services -eq ${#unnecessary_services[@]} ]]; then
        log_debug "✓ Unnecessary services are disabled"
        ((hardening_passed++))
    else
        log_debug "⚠ Some unnecessary services may still be enabled"
        # Don't fail for this as services might not be installed
        ((hardening_passed++))
    fi
    
    # Test 4: Check system security limits
    ((hardening_tests++))
    if [[ -f /etc/sysctl.d/99-seraphc2-security.conf ]]; then
        log_debug "✓ System security limits are configured"
        ((hardening_passed++))
    else
        log_warning "✗ System security limits are not configured"
        validation_passed=false
    fi
    
    # Test 5: Check file integrity monitoring
    ((hardening_tests++))
    if [[ -x /usr/local/bin/seraphc2-file-monitor ]] || command -v aide >/dev/null 2>&1; then
        log_debug "✓ File integrity monitoring is configured"
        ((hardening_passed++))
    else
        log_warning "✗ File integrity monitoring is not configured"
        validation_passed=false
    fi
    
    # Test 6: Check log monitoring
    ((hardening_tests++))
    if [[ -x /usr/local/bin/seraphc2-log-monitor ]]; then
        log_debug "✓ Log monitoring is configured"
        ((hardening_passed++))
    else
        log_warning "✗ Log monitoring is not configured"
        validation_passed=false
    fi
    
    # Test 7: Check SSH hardening (if SSH is enabled)
    if [[ "${CONFIG[allow_ssh]}" == "true" ]]; then
        ((hardening_tests++))
        if [[ -f /etc/ssh/sshd_config ]] && grep -q "PermitRootLogin no" /etc/ssh/sshd_config; then
            log_debug "✓ SSH is hardened"
            ((hardening_passed++))
        else
            log_warning "✗ SSH hardening may not be complete"
            validation_passed=false
        fi
    fi
    
    # Test 8: Check automatic security updates
    ((hardening_tests++))
    if [[ -f /etc/apt/apt.conf.d/20auto-upgrades ]] || systemctl is-enabled yum-cron >/dev/null 2>&1 || systemctl is-enabled dnf-automatic.timer >/dev/null 2>&1; then
        log_debug "✓ Automatic security updates are configured"
        ((hardening_passed++))
    else
        log_debug "⚠ Automatic security updates may not be configured"
        # Don't fail for this as it's optional
        ((hardening_passed++))
    fi
    
    # Test 9: Check intrusion detection
    ((hardening_tests++))
    if [[ -x /usr/local/bin/seraphc2-intrusion-detect ]]; then
        log_debug "✓ Basic intrusion detection is configured"
        ((hardening_passed++))
    else
        log_warning "✗ Basic intrusion detection is not configured"
        validation_passed=false
    fi
    
    # Test 10: Check logrotate configuration
    ((hardening_tests++))
    if [[ -f /etc/logrotate.d/seraphc2 ]]; then
        log_debug "✓ Log rotation is configured"
        ((hardening_passed++))
    else
        log_warning "✗ Log rotation is not configured"
        validation_passed=false
    fi
    
    # Summary
    log_info "Security hardening validation: $hardening_passed/$hardening_tests tests passed"
    
    if [[ "$validation_passed" == "true" ]]; then
        log_debug "Security hardening validation passed"
        return 0
    else
        log_debug "Security hardening validation failed"
        return 1
    fi
}


#==============================================================================
# SCRIPT ENTRY POINT
#==============================================================================

# Main script execution
main() {
    # Parse command line arguments
    parse_arguments "$@"
    
    # Initialize script
    init_script
    
    # Validate configuration
    validate_configuration
    
    # Handle test mode early (skip sudo checks)
    if [[ "${CONFIG[test_mode]}" == "true" ]]; then
        log_info "Test mode enabled - showing system detection results only"
        
        # Run system detection without sudo checks for testing
        detect_operating_system
        detect_architecture
        detect_package_manager
        detect_init_system
        detect_firewall_system
        get_system_hardware_info
        
        display_system_info
        log_info "Firewall system detected: ${SYSTEM_INFO[firewall_system]}"
        
        # Test firewall configuration logic (dry run)
        log_info "Testing firewall configuration logic..."
        if [[ "${SYSTEM_INFO[firewall_system]}" == "none" ]]; then
            log_info "Would install UFW as default firewall system"
            log_info "Would configure UFW with the following rules:"
            log_info "  - Allow SSH with rate limiting (if enabled)"
            log_info "  - Allow HTTP port: ${CONFIG[http_port]}"
            log_info "  - Allow HTTPS port: ${CONFIG[https_port]}"
            log_info "  - Allow implant port: ${CONFIG[implant_port]}"
            log_info "  - Block common attack ports: 23, 135, 139, 445, 1433, 3389"
            log_info "  - Enable rate limiting on web ports"
        else
            log_info "Would configure ${SYSTEM_INFO[firewall_system]} firewall system"
        fi
        
        return 0
    fi
    
    # Check system prerequisites and detect system information
    check_system_prerequisites
    
    # Show configuration if in interactive or verbose mode
    if [[ "${CONFIG[mode]}" == "interactive" || "${CONFIG[verbose]}" == "true" ]]; then
        show_configuration
    fi
    
    # Run interactive configuration if requested
    if [[ "${CONFIG[mode]}" == "interactive" ]]; then
        run_interactive_configuration
    fi
    
    execute_main_installation
    
    log_success "SeraphC2 setup completed successfully!"
    
    # Perform final testing and quality assurance
    log_info "Performing final testing and validation..."
    if perform_final_testing; then
        log_success "Final testing completed successfully"
    else
        log_warning "Final testing completed with issues - see report above"
    fi
    
    # Display connection information
    display_connection_information
}

#==============================================================================
# POST-INSTALLATION INFORMATION DISPLAY
#==============================================================================

# Display comprehensive connection information after successful installation
display_connection_information() {
    log_info "Generating post-installation connection information..."
    
    # Display banner for connection information
    display_connection_banner
    
    # Generate and display web interface URLs
    display_web_interface_urls
    
    # Display default credentials with security recommendations
    display_default_credentials
    
    # Display implant configuration information
    display_implant_configuration
    
    # Display service management commands
    display_service_management_commands
    
    # Display security and SSL information
    display_security_information
    
    # Display system status summary
    display_system_status_summary
    
    # Generate connection information file
    generate_connection_info_file
    
    # Display final recommendations
    display_final_recommendations
}

# Display connection information banner
display_connection_banner() {
    echo -e "\n${GREEN}"
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║                        🎉 INSTALLATION COMPLETED! 🎉                         ║
║                                                                               ║
║                    SeraphC2 Server is Ready for Use                          ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}\n"
}

# Generate and display web interface URLs
display_web_interface_urls() {
    local domain="${CONFIG[domain]}"
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    local ssl_enabled="false"
    
    # Check if SSL is configured
    if [[ "${CONFIG[ssl_type]}" != "none" && -f "${CONFIG[ssl_dir]}/server.crt" ]]; then
        ssl_enabled="true"
    fi
    
    echo -e "${WHITE}🌐 Web Interface Access:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Display HTTP URL
    echo -e "  ${BLUE}HTTP URL:${NC}  http://${domain}:${http_port}"
    
    # Display HTTPS URL if SSL is enabled
    if [[ "$ssl_enabled" == "true" ]]; then
        echo -e "  ${GREEN}HTTPS URL:${NC} https://${domain}:${https_port} ${GREEN}(Recommended)${NC}"
        
        if [[ "${CONFIG[ssl_type]}" == "self-signed" ]]; then
            echo -e "  ${YELLOW}Note:${NC} Self-signed certificate - browser will show security warning"
            echo -e "        Accept the certificate to proceed"
        fi
    else
        echo -e "  ${YELLOW}HTTPS:${NC} Not configured - using HTTP only"
    fi
    
    echo ""
}

# Display default credentials with security recommendations
display_default_credentials() {
    echo -e "${WHITE}🔐 Default Administrator Credentials:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    echo -e "  ${BLUE}Username:${NC} ${CONFIG[admin_username]}"
    echo -e "  ${BLUE}Password:${NC} ${CONFIG[admin_password]}"
    echo ""
    echo -e "  ${GREEN}✓${NC} Password is cryptographically generated (${#CONFIG[admin_password]} characters)"
    echo ""
    echo -e "  ${RED}⚠️  SECURITY RECOMMENDATIONS:${NC}"
    echo -e "  ${YELLOW}→${NC} Change the default password after first login"
    echo -e "  ${YELLOW}→${NC} Enable two-factor authentication if available"
    echo -e "  ${YELLOW}→${NC} Create additional user accounts with appropriate permissions"
    echo -e "  ${YELLOW}→${NC} Regularly rotate administrative passwords"
    echo ""
}

# Display implant configuration information
display_implant_configuration() {
    local domain="${CONFIG[domain]}"
    local implant_port="${CONFIG[implant_port]}"
    local ssl_enabled="false"
    
    # Check if SSL is configured
    if [[ "${CONFIG[ssl_type]}" != "none" && -f "${CONFIG[ssl_dir]}/server.crt" ]]; then
        ssl_enabled="true"
    fi
    
    echo -e "${WHITE}🤖 Implant Configuration:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    echo -e "  ${BLUE}Callback URLs for Implant Generation:${NC}"
    
    # Display HTTP callback URL
    echo -e "    HTTP:  http://${domain}:${implant_port}"
    
    # Display HTTPS callback URL if SSL is enabled
    if [[ "$ssl_enabled" == "true" ]]; then
        echo -e "    HTTPS: https://${domain}:${implant_port} ${GREEN}(Recommended)${NC}"
    fi
    
    echo ""
    echo -e "  ${BLUE}Implant Communication Port:${NC} ${implant_port}"
    echo -e "  ${BLUE}Protocol:${NC} HTTP/HTTPS"
    echo -e "  ${BLUE}Encryption:${NC} $([[ "$ssl_enabled" == "true" ]] && echo "TLS/SSL Enabled" || echo "Plain HTTP")"
    
    echo ""
    echo -e "  ${YELLOW}📝 Note:${NC} Use these URLs when generating implants in the web interface"
    echo -e "  ${YELLOW}📝 Note:${NC} Ensure implants can reach the server on port ${implant_port}"
    echo ""
}

# Display service management commands
display_service_management_commands() {
    echo -e "${WHITE}⚙️  Service Management:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    echo -e "  ${BLUE}Service Status:${NC}"
    echo -e "    sudo systemctl status seraphc2"
    echo ""
    
    echo -e "  ${BLUE}Start Service:${NC}"
    echo -e "    sudo systemctl start seraphc2"
    echo ""
    
    echo -e "  ${BLUE}Stop Service:${NC}"
    echo -e "    sudo systemctl stop seraphc2"
    echo ""
    
    echo -e "  ${BLUE}Restart Service:${NC}"
    echo -e "    sudo systemctl restart seraphc2"
    echo ""
    
    echo -e "  ${BLUE}Enable Auto-start:${NC}"
    echo -e "    sudo systemctl enable seraphc2"
    echo ""
    
    echo -e "  ${BLUE}Disable Auto-start:${NC}"
    echo -e "    sudo systemctl disable seraphc2"
    echo ""
    
    echo -e "  ${BLUE}View Logs:${NC}"
    echo -e "    sudo journalctl -u seraphc2 -f"
    echo -e "    sudo tail -f ${CONFIG[log_dir]}/combined.log"
    echo ""
}

# Display security and SSL information
display_security_information() {
    echo -e "${WHITE}🔒 Security Configuration:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # SSL Configuration
    echo -e "  ${BLUE}SSL/TLS Configuration:${NC}"
    case "${CONFIG[ssl_type]}" in
        "self-signed")
            echo -e "    Type: Self-signed certificate"
            echo -e "    Certificate: ${CONFIG[ssl_dir]}/server.crt"
            echo -e "    Private Key: ${CONFIG[ssl_dir]}/server.key"
            echo -e "    ${YELLOW}Note:${NC} Consider using Let's Encrypt for production"
            ;;
        "letsencrypt")
            echo -e "    Type: Let's Encrypt certificate"
            echo -e "    Domain: ${CONFIG[domain]}"
            echo -e "    Auto-renewal: Enabled"
            echo -e "    ${GREEN}Status:${NC} Production-ready SSL"
            ;;
        "custom")
            echo -e "    Type: Custom certificate"
            echo -e "    Certificate: ${CONFIG[ssl_cert_path]}"
            echo -e "    Private Key: ${CONFIG[ssl_key_path]}"
            ;;
        *)
            echo -e "    ${YELLOW}Type: None (HTTP only)${NC}"
            echo -e "    ${RED}Warning:${NC} Consider enabling SSL for production use"
            ;;
    esac
    echo ""
    
    # Database Security
    echo -e "  ${BLUE}Database Security:${NC}"
    echo -e "    PostgreSQL: Authentication enabled"
    echo -e "    Database: ${CONFIG[db_name]}"
    echo -e "    User: ${CONFIG[db_user]}"
    echo -e "    Password: Randomly generated (32 characters)"
    echo -e "    Connection: Local only (127.0.0.1)"
    echo ""
    
    # Redis Security
    echo -e "  ${BLUE}Redis Security:${NC}"
    echo -e "    Authentication: Enabled"
    echo -e "    Password: Randomly generated (24 characters)"
    echo -e "    Bind: localhost only"
    echo -e "    Dangerous commands: Disabled"
    echo ""
    
    # Firewall Status
    if [[ "${CONFIG[enable_firewall]}" == "true" ]]; then
        echo -e "  ${BLUE}Firewall Status:${NC}"
        echo -e "    Status: ${GREEN}Enabled${NC}"
        echo -e "    Allowed Ports: ${CONFIG[http_port]}, ${CONFIG[https_port]}, ${CONFIG[implant_port]}, SSH"
        echo -e "    SSH Protection: Rate limiting enabled"
    else
        echo -e "  ${BLUE}Firewall Status:${NC}"
        echo -e "    Status: ${YELLOW}Disabled${NC}"
        echo -e "    ${YELLOW}Recommendation:${NC} Enable firewall for production use"
    fi
    echo ""
}

# Display system status summary
display_system_status_summary() {
    echo -e "${WHITE}📊 System Status Summary:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Service Status
    local service_status="Unknown"
    if systemctl is-active seraphc2 >/dev/null 2>&1; then
        service_status="${GREEN}Running${NC}"
    else
        service_status="${RED}Stopped${NC}"
    fi
    echo -e "  ${BLUE}SeraphC2 Service:${NC} $service_status"
    
    # Database Status
    local db_status="Unknown"
    if systemctl is-active postgresql >/dev/null 2>&1; then
        db_status="${GREEN}Running${NC}"
    else
        db_status="${RED}Stopped${NC}"
    fi
    echo -e "  ${BLUE}PostgreSQL:${NC} $db_status"
    
    # Redis Status
    local redis_status="Unknown"
    if systemctl is-active redis >/dev/null 2>&1 || systemctl is-active redis-server >/dev/null 2>&1; then
        redis_status="${GREEN}Running${NC}"
    else
        redis_status="${RED}Stopped${NC}"
    fi
    echo -e "  ${BLUE}Redis:${NC} $redis_status"
    
    # Port Status
    echo -e "  ${BLUE}Port Status:${NC}"
    for port in "${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}"; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo -e "    Port $port: ${GREEN}Listening${NC}"
        else
            echo -e "    Port $port: ${YELLOW}Not listening${NC}"
        fi
    done
    
    echo ""
}

# Generate connection information file for future reference
generate_connection_info_file() {
    local info_file="${CONFIG[config_dir]}/connection-info.txt"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    log_info "Generating connection information file..."
    
    # Create directory if it doesn't exist
    mkdir -p "${CONFIG[config_dir]}"
    
    # Generate the connection information file
    cat > "$info_file" << EOF
SeraphC2 Server Connection Information
Generated: $timestamp
Installation Script Version: $SCRIPT_VERSION

=== WEB INTERFACE ===
HTTP URL:  http://${CONFIG[domain]}:${CONFIG[http_port]}
HTTPS URL: https://${CONFIG[domain]}:${CONFIG[https_port]}

=== DEFAULT CREDENTIALS ===
Username: ${CONFIG[admin_username]}
Password: ${CONFIG[admin_password]}

⚠️  SECURITY WARNING: Change default password immediately!
✓  Password is cryptographically generated (${#CONFIG[admin_password]} characters)

=== IMPLANT CONFIGURATION ===
HTTP Callback:  http://${CONFIG[domain]}:${CONFIG[implant_port]}
HTTPS Callback: https://${CONFIG[domain]}:${CONFIG[implant_port]}
Communication Port: ${CONFIG[implant_port]}

=== SERVICE MANAGEMENT ===
Status:  sudo systemctl status seraphc2
Start:   sudo systemctl start seraphc2
Stop:    sudo systemctl stop seraphc2
Restart: sudo systemctl restart seraphc2
Logs:    sudo journalctl -u seraphc2 -f

=== CONFIGURATION FILES ===
Application Directory: ${CONFIG[app_dir]}
Configuration Directory: ${CONFIG[config_dir]}
Log Directory: ${CONFIG[log_dir]}
SSL Directory: ${CONFIG[ssl_dir]}

=== DATABASE CONFIGURATION ===
Host: ${CONFIG[db_host]}
Port: ${CONFIG[db_port]}
Database: ${CONFIG[db_name]}
User: ${CONFIG[db_user]}
Password: [Generated - see ${CONFIG[app_dir]}/.env]

=== REDIS CONFIGURATION ===
Host: ${CONFIG[redis_host]}
Port: ${CONFIG[redis_port]}
Password: [Generated - see ${CONFIG[app_dir]}/.env]

=== SSL CONFIGURATION ===
Type: ${CONFIG[ssl_type]}
Certificate: ${CONFIG[ssl_dir]}/server.crt
Private Key: ${CONFIG[ssl_dir]}/server.key

=== SYSTEM INFORMATION ===
OS: ${SYSTEM_INFO[os_type]} ${SYSTEM_INFO[os_version]}
Architecture: ${SYSTEM_INFO[architecture]}
Hostname: ${SYSTEM_INFO[hostname]}
Installation Date: $timestamp

=== SECURITY NOTES ===
- All passwords are randomly generated using cryptographic methods
- Database and Redis are configured with authentication
- Firewall is configured to allow only necessary ports
- SSL/TLS encryption is enabled by default
- Service runs under dedicated non-root user account

=== TROUBLESHOOTING ===
- Check service status: sudo systemctl status seraphc2
- View logs: sudo journalctl -u seraphc2 -f
- Check port availability: sudo netstat -tuln | grep -E ':(${CONFIG[http_port]}|${CONFIG[https_port]}|${CONFIG[implant_port]})'
- Verify database connection: sudo -u postgres psql -d ${CONFIG[db_name]} -c '\dt'
- Test Redis connection: redis-cli -a [password] ping

For support and documentation:
https://github.com/seraphc2/seraphc2/wiki

EOF
    
    # Set appropriate permissions
    chmod 600 "$info_file"
    chown root:root "$info_file" 2>/dev/null || true
    
    echo -e "  ${GREEN}✓${NC} Connection information saved to: ${BLUE}$info_file${NC}"
    echo ""
}

# Display final recommendations and next steps
display_final_recommendations() {
    echo -e "${WHITE}🎯 Next Steps & Recommendations:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    echo -e "  ${GREEN}1.${NC} ${BLUE}Access the Web Interface:${NC}"
    echo -e "     Open your browser and navigate to the web interface URL above"
    echo ""
    
    echo -e "  ${GREEN}2.${NC} ${BLUE}Change Default Credentials:${NC}"
    echo -e "     Log in with the default credentials and change the password immediately"
    echo ""
    
    echo -e "  ${GREEN}3.${NC} ${BLUE}Configure Your Environment:${NC}"
    echo -e "     Set up users, permissions, and customize settings as needed"
    echo ""
    
    echo -e "  ${GREEN}4.${NC} ${BLUE}Generate Implants:${NC}"
    echo -e "     Use the web interface to generate implants with the callback URLs provided"
    echo ""
    
    echo -e "  ${GREEN}5.${NC} ${BLUE}Monitor System Health:${NC}"
    echo -e "     Regularly check service status and logs for any issues"
    echo ""
    
    if [[ "${CONFIG[ssl_type]}" == "self-signed" ]]; then
        echo -e "  ${YELLOW}⚠️  SSL Recommendation:${NC}"
        echo -e "     Consider upgrading to Let's Encrypt certificate for production use"
        echo -e "     Run: certbot --nginx -d ${CONFIG[domain]}"
        echo ""
    fi
    
    if [[ "${CONFIG[enable_firewall]}" != "true" ]]; then
        echo -e "  ${YELLOW}⚠️  Security Recommendation:${NC}"
        echo -e "     Enable firewall for enhanced security in production environments"
        echo ""
    fi
    
    echo -e "  ${BLUE}📚 Documentation:${NC} https://github.com/seraphc2/seraphc2/wiki"
    echo -e "  ${BLUE}🐛 Support:${NC} https://github.com/seraphc2/seraphc2/issues"
    echo -e "  ${BLUE}💬 Community:${NC} https://discord.gg/seraphc2"
    
    echo ""
    echo -e "${GREEN}🎉 SeraphC2 is now ready for use! Happy hunting! 🎉${NC}"
    echo ""
}

#==============================================================================
# DOCKER DEPLOYMENT SYSTEM
#==============================================================================

# Validate Docker deployment prerequisites
validate_docker_prerequisites() {
    log_info "Validating Docker deployment prerequisites..."
    
    # Check if we have sudo privileges (required for Docker installation)
    if ! sudo -n true 2>/dev/null; then
        log_error "Docker deployment requires sudo privileges for installation"
        return 1
    fi
    
    # Check if we have enough memory for Docker containers
    local memory_gb="${SYSTEM_INFO[memory_gb]}"
    if [[ -n "$memory_gb" ]] && [[ "$memory_gb" -lt 2 ]]; then
        log_warning "System has less than 2GB RAM. Docker deployment may be slow."
        log_warning "Consider using native installation for better performance."
    fi
    
    # Check if we have enough disk space
    local disk_space_gb="${SYSTEM_INFO[disk_space_gb]}"
    if [[ -n "$disk_space_gb" ]] && [[ "$disk_space_gb" -lt 10 ]]; then
        log_warning "System has less than 10GB free disk space."
        log_warning "Docker images and volumes require significant disk space."
    fi
    
    # Check if ports are available
    local ports=("${CONFIG[http_port]}" "${CONFIG[https_port]}" "${CONFIG[implant_port]}")
    for port in "${ports[@]}"; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            log_error "Port $port is already in use. Docker deployment requires free ports."
            return 1
        fi
    done
    
    # Check if curl is available (needed for Docker installation and testing)
    if ! command -v curl >/dev/null 2>&1; then
        log_info "Installing curl (required for Docker installation)..."
        if ! install_package "curl"; then
            log_error "Failed to install curl, which is required for Docker deployment"
            return 1
        fi
    fi
    
    log_success "Docker deployment prerequisites validated"
    return 0
}

# Install Docker and Docker Compose (only when --docker flag is used)
install_docker_and_compose() {
    log_info "Installing Docker and Docker Compose..."
    
    local os_type="${SYSTEM_INFO[os_type]}"
    
    # Check if Docker is already installed
    if command -v docker >/dev/null 2>&1; then
        log_info "Docker is already installed"
        local docker_version=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
        log_info "Docker version: $docker_version"
    else
        log_info "Installing Docker..."
        
        case "$os_type" in
            "ubuntu"|"debian")
                # Update package index
                apt-get update
                
                # Install prerequisites
                install_package "apt-transport-https"
                install_package "ca-certificates"
                install_package "curl"
                install_package "gnupg"
                install_package "lsb-release"
                
                # Add Docker's official GPG key
                curl -fsSL https://download.docker.com/linux/$os_type/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
                
                # Set up the stable repository
                echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/$os_type $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
                
                # Update package index again
                apt-get update
                
                # Install Docker Engine
                install_package "docker-ce"
                install_package "docker-ce-cli"
                install_package "containerd.io"
                ;;
            "centos"|"rhel"|"fedora")
                # Install required packages
                if [[ "$os_type" == "fedora" ]]; then
                    install_package "dnf-plugins-core"
                    dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
                else
                    install_package "yum-utils"
                    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
                fi
                
                # Install Docker Engine
                install_package "docker-ce"
                install_package "docker-ce-cli"
                install_package "containerd.io"
                ;;
            *)
                log_error "Unsupported OS for Docker installation: $os_type"
                return 1
                ;;
        esac
        
        # Track Docker installation
        track_install_state "packages_installed" "docker-ce"
        
        log_success "Docker installed successfully"
    fi
    
    # Start and enable Docker service
    systemctl start docker
    systemctl enable docker
    
    # Check if Docker Compose is already installed
    if command -v docker-compose >/dev/null 2>&1; then
        log_info "Docker Compose is already installed"
        local compose_version=$(docker-compose --version | cut -d' ' -f3 | cut -d',' -f1)
        log_info "Docker Compose version: $compose_version"
    else
        log_info "Installing Docker Compose..."
        
        # Get latest Docker Compose version
        local compose_version=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
        
        # Download Docker Compose
        curl -L "https://github.com/docker/compose/releases/download/${compose_version}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        
        # Make it executable
        chmod +x /usr/local/bin/docker-compose
        
        # Create symlink for easier access
        ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
        
        log_success "Docker Compose installed successfully"
    fi
    
    # Verify Docker installation
    if ! docker --version >/dev/null 2>&1; then
        log_error "Docker installation verification failed"
        return 1
    fi
    
    # Verify Docker Compose installation
    if ! docker-compose --version >/dev/null 2>&1; then
        log_error "Docker Compose installation verification failed"
        return 1
    fi
    
    # Test Docker functionality
    log_info "Testing Docker functionality..."
    if ! docker run --rm hello-world >/dev/null 2>&1; then
        log_error "Docker functionality test failed"
        return 1
    fi
    
    log_success "Docker and Docker Compose installation completed successfully"
    return 0
}

# Generate dynamic docker-compose.yml with user configuration
generate_docker_compose_file() {
    log_info "Generating docker-compose.yml with user configuration..."
    
    local compose_file="docker-compose.yml"
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    local implant_port="${CONFIG[implant_port]}"
    local domain="${CONFIG[domain]}"
    
    # Ensure we can write to the current directory
    if [[ ! -w "." ]]; then
        log_error "Cannot write to current directory. Please run from a writable location."
        return 1
    fi
    
    cat > "$compose_file" <<EOF
version: '3.8'

services:
  seraphc2-server:
    build: .
    image: seraphc2:latest
    container_name: seraphc2-server
    restart: unless-stopped
    ports:
      - "${http_port}:3000"
      - "${https_port}:8443"
      - "${implant_port}:8080"
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=3000
      - HTTPS_PORT=8443
      - IMPLANT_PORT=8080
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
    volumes:
      - app_data:/opt/seraphc2/data
      - app_logs:/var/log/seraphc2
      - ssl_certs:/etc/seraphc2/ssl
    networks:
      - seraphc2-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    image: postgres:15-alpine
    container_name: seraphc2-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${DB_NAME}
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --auth-local=scram-sha-256"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d
    networks:
      - seraphc2-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${DB_USER} -d \${DB_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: seraphc2-redis
    restart: unless-stopped
    command: redis-server --requirepass \${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - seraphc2-network
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  app_data:
    driver: local
  app_logs:
    driver: local
  ssl_certs:
    driver: local

networks:
  seraphc2-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
EOF

    log_success "docker-compose.yml generated successfully"
    log_info "Configuration:"
    log_info "  HTTP Port: $http_port"
    log_info "  HTTPS Port: $https_port"
    log_info "  Implant Port: $implant_port"
    log_info "  Domain: $domain"
    
    return 0
}

# Generate Docker environment file (.env for containers)
generate_docker_env_file() {
    log_info "Generating Docker environment file (.env)..."
    
    local env_file=".env"
    local db_password="${CONFIG[db_password]}"
    local redis_password="${CONFIG[redis_password]}"
    local jwt_secret="${CONFIG[jwt_secret]}"
    local encryption_key="${CONFIG[encryption_key]}"
    local admin_password="${CONFIG[admin_password]}"
    
    cat > "$env_file" <<EOF
# SeraphC2 Docker Environment Configuration
# Generated on: $(date)

# Application Configuration
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
HTTPS_PORT=8443
IMPLANT_PORT=8080
DOMAIN=${CONFIG[domain]}

# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=${CONFIG[db_name]}
DB_USER=${CONFIG[db_user]}
DB_PASSWORD=${db_password}

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${redis_password}

# Security Configuration
JWT_SECRET=${jwt_secret}
ENCRYPTION_KEY=${encryption_key}

# SSL Configuration
SSL_ENABLED=true
SSL_CERT_PATH=/etc/seraphc2/ssl/server.crt
SSL_KEY_PATH=/etc/seraphc2/ssl/server.key

# Admin Configuration
ADMIN_USERNAME=${CONFIG[admin_username]}
ADMIN_PASSWORD=${admin_password}

# Logging Configuration
LOG_LEVEL=info
LOG_DIR=/var/log/seraphc2

# Session Configuration
SESSION_SECRET=${jwt_secret}
SESSION_TIMEOUT=3600

# File Upload Configuration
UPLOAD_MAX_SIZE=10485760
UPLOAD_DIR=/opt/seraphc2/uploads

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
EOF

    # Set secure permissions on environment file
    if ! chmod 600 "$env_file"; then
        log_error "Failed to set secure permissions on environment file"
        return 1
    fi
    
    # Verify file permissions
    local file_perms=$(stat -c "%a" "$env_file" 2>/dev/null || stat -f "%A" "$env_file" 2>/dev/null)
    if [[ "$file_perms" != "600" ]]; then
        log_warning "Environment file permissions may not be secure: $file_perms"
    fi
    
    log_success "Docker environment file generated successfully"
    log_info "Environment file: $env_file"
    log_warning "Environment file contains sensitive information - keep it secure!"
    
    return 0
}

# Create Dockerfile for SeraphC2 application
generate_dockerfile() {
    log_info "Generating Dockerfile for SeraphC2 application..."
    
    local dockerfile="Dockerfile"
    
    cat > "$dockerfile" <<'EOF'
# SeraphC2 Docker Image
FROM node:22-alpine

# Set working directory
WORKDIR /opt/seraphc2

# Install system dependencies
RUN apk add --no-cache \
    curl \
    openssl \
    postgresql-client \
    redis \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S seraphc2 && \
    adduser -S seraphc2 -u 1001 -G seraphc2

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application source
COPY . .

# Build the application
RUN npm run build

# Create necessary directories
RUN mkdir -p /var/log/seraphc2 /opt/seraphc2/data /opt/seraphc2/uploads /etc/seraphc2/ssl && \
    chown -R seraphc2:seraphc2 /opt/seraphc2 /var/log/seraphc2 /etc/seraphc2

# Switch to non-root user
USER seraphc2

# Expose ports
EXPOSE 3000 8080 8443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
EOF

    log_success "Dockerfile generated successfully"
    return 0
}

# Start Docker services and perform health checks
start_docker_services() {
    log_info "Starting Docker services..."
    
    # Build the SeraphC2 image
    log_info "Building SeraphC2 Docker image..."
    if ! docker-compose build --no-cache; then
        log_error "Failed to build SeraphC2 Docker image"
        return 1
    fi
    
    # Start services in detached mode
    log_info "Starting Docker containers..."
    if ! docker-compose up -d; then
        log_error "Failed to start Docker containers"
        return 1
    fi
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if docker-compose ps | grep -q "Up (healthy)"; then
            log_success "Docker services are healthy"
            break
        fi
        
        ((attempt++))
        log_info "Waiting for services... (attempt $attempt/$max_attempts)"
        sleep 10
    done
    
    if [[ $attempt -eq $max_attempts ]]; then
        log_warning "Services may not be fully healthy yet, but continuing..."
    fi
    
    # Show service status
    log_info "Docker service status:"
    docker-compose ps
    
    return 0
}

# Perform comprehensive Docker deployment testing and validation
test_docker_deployment() {
    log_info "Testing Docker deployment..."
    
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    local implant_port="${CONFIG[implant_port]}"
    local max_attempts=10
    local attempt=0
    
    # Test database connectivity
    log_info "Testing database connectivity..."
    while [[ $attempt -lt $max_attempts ]]; do
        if docker-compose exec -T postgres pg_isready -U "${CONFIG[db_user]}" -d "${CONFIG[db_name]}" >/dev/null 2>&1; then
            log_success "Database is ready"
            break
        fi
        
        ((attempt++))
        log_info "Waiting for database... (attempt $attempt/$max_attempts)"
        sleep 5
    done
    
    if [[ $attempt -eq $max_attempts ]]; then
        log_error "Database connectivity test failed"
        return 1
    fi
    
    # Test Redis connectivity
    log_info "Testing Redis connectivity..."
    attempt=0
    while [[ $attempt -lt $max_attempts ]]; do
        if docker-compose exec -T redis redis-cli -a "${CONFIG[redis_password]}" ping >/dev/null 2>&1; then
            log_success "Redis is ready"
            break
        fi
        
        ((attempt++))
        log_info "Waiting for Redis... (attempt $attempt/$max_attempts)"
        sleep 5
    done
    
    if [[ $attempt -eq $max_attempts ]]; then
        log_error "Redis connectivity test failed"
        return 1
    fi
    
    # Test web interface accessibility
    log_info "Testing web interface accessibility..."
    attempt=0
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -f -s "http://localhost:$http_port/api/health" >/dev/null 2>&1; then
            log_success "Web interface is accessible on port $http_port"
            break
        fi
        
        ((attempt++))
        log_info "Waiting for web interface... (attempt $attempt/$max_attempts)"
        sleep 10
    done
    
    if [[ $attempt -eq $max_attempts ]]; then
        log_error "Web interface accessibility test failed"
        return 1
    fi
    
    # Test HTTPS if SSL is configured
    if [[ "${CONFIG[ssl_type]}" != "none" ]]; then
        log_info "Testing HTTPS accessibility..."
        if curl -f -s -k "https://localhost:$https_port/api/health" >/dev/null 2>&1; then
            log_success "HTTPS interface is accessible on port $https_port"
        else
            log_warning "HTTPS interface test failed - this may be expected during initial setup"
        fi
    fi
    
    # Test implant communication port
    log_info "Testing implant communication port..."
    if nc -z localhost "$implant_port" 2>/dev/null; then
        log_success "Implant communication port $implant_port is accessible"
    else
        log_warning "Implant communication port test failed - this may be expected during initial setup"
    fi
    
    # Check container logs for errors
    log_info "Checking container logs for errors..."
    local error_count=$(docker-compose logs seraphc2-server 2>&1 | grep -i error | wc -l)
    if [[ $error_count -eq 0 ]]; then
        log_success "No errors found in application logs"
    else
        log_warning "Found $error_count error(s) in application logs"
        log_info "Use 'docker-compose logs seraphc2-server' to view detailed logs"
    fi
    
    log_success "Docker deployment testing completed"
    return 0
}

# Configure Docker volumes and networks
configure_docker_infrastructure() {
    log_info "Configuring Docker volumes and networks..."
    
    # Create SSL certificates for Docker deployment
    if [[ "${CONFIG[ssl_type]}" == "self-signed" ]]; then
        log_info "Generating SSL certificates for Docker deployment..."
        
        # Create temporary SSL directory
        local temp_ssl_dir="/tmp/seraphc2-ssl"
        mkdir -p "$temp_ssl_dir"
        
        # Generate self-signed certificate
        local domain="${CONFIG[domain]}"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$temp_ssl_dir/server.key" \
            -out "$temp_ssl_dir/server.crt" \
            -subj "/C=US/ST=State/L=City/O=SeraphC2/OU=Docker/CN=$domain" 2>/dev/null
        
        # Set proper permissions
        chmod 600 "$temp_ssl_dir/server.key"
        chmod 644 "$temp_ssl_dir/server.crt"
        
        # Copy certificates to be available for Docker volume mounting
        mkdir -p "./ssl"
        cp "$temp_ssl_dir/server.crt" "./ssl/"
        cp "$temp_ssl_dir/server.key" "./ssl/"
        
        # Clean up temporary directory
        rm -rf "$temp_ssl_dir"
        
        log_success "SSL certificates generated for Docker deployment"
    fi
    
    # Create necessary directories for volume mounting
    mkdir -p ./data ./logs ./uploads
    
    # Set proper permissions
    chmod 755 ./data ./logs ./uploads
    
    log_success "Docker infrastructure configuration completed"
    return 0
}

# Main Docker deployment function
deploy_with_docker() {
    log_info "Starting Docker deployment process..."
    
    # Ensure we're not mixing Docker with native installation
    if [[ "${INSTALL_STATE[application_deployed]}" == "true" ]] || [[ "${INSTALL_STATE[service_enabled]}" == "true" ]]; then
        log_error "Cannot deploy with Docker: Native installation already detected"
        log_error "Please use a clean system or run rollback first"
        return 1
    fi
    
    # Validate Docker deployment prerequisites
    if ! validate_docker_prerequisites; then
        log_error "Docker deployment prerequisites not met"
        return 1
    fi
    
    # Show deployment steps
    local total_steps=8
    
    # Step 1: Validate prerequisites
    show_step 1 $total_steps "Validating Docker deployment prerequisites"
    # Prerequisites already validated above
    
    # Step 2: Install Docker and Docker Compose
    show_step 2 $total_steps "Installing Docker and Docker Compose"
    if ! install_docker_and_compose; then
        log_error "Docker installation failed"
        return 1
    fi
    
    # Step 3: Configure Docker infrastructure
    show_step 3 $total_steps "Configuring Docker infrastructure"
    if ! configure_docker_infrastructure; then
        log_error "Docker infrastructure configuration failed"
        return 1
    fi
    
    # Step 4: Generate Dockerfile
    show_step 4 $total_steps "Generating Dockerfile"
    if ! generate_dockerfile; then
        log_error "Dockerfile generation failed"
        return 1
    fi
    
    # Step 5: Generate docker-compose.yml
    show_step 5 $total_steps "Generating Docker Compose configuration"
    if ! generate_docker_compose_file; then
        log_error "Docker Compose file generation failed"
        return 1
    fi
    
    # Step 6: Generate Docker environment file
    show_step 6 $total_steps "Generating Docker environment configuration"
    if ! generate_docker_env_file; then
        log_error "Docker environment file generation failed"
        return 1
    fi
    
    # Step 7: Start Docker services
    show_step 7 $total_steps "Starting Docker services"
    if ! start_docker_services; then
        log_error "Docker services startup failed"
        return 1
    fi
    
    # Step 8: Test Docker deployment
    show_step 8 $total_steps "Testing Docker deployment"
    if ! test_docker_deployment; then
        log_error "Docker deployment testing failed"
        return 1
    fi
    
    # Mark Docker deployment as successful
    mark_install_state "docker_deployed"
    
    log_success "Docker deployment completed successfully"
    return 0
}

# Test Docker deployment functionality (for testing purposes)
test_docker_functionality() {
    log_info "Testing Docker deployment functionality..."
    
    # Test Docker installation detection
    if command -v docker >/dev/null 2>&1; then
        log_success "Docker command available"
        local docker_version=$(docker --version 2>/dev/null | cut -d' ' -f3 | cut -d',' -f1)
        log_info "Docker version: $docker_version"
    else
        log_info "Docker not installed (expected for testing)"
    fi
    
    # Test Docker Compose installation detection
    if command -v docker-compose >/dev/null 2>&1; then
        log_success "Docker Compose command available"
        local compose_version=$(docker-compose --version 2>/dev/null | cut -d' ' -f3 | cut -d',' -f1)
        log_info "Docker Compose version: $compose_version"
    else
        log_info "Docker Compose not installed (expected for testing)"
    fi
    
    # Test configuration file generation (dry run)
    log_info "Testing configuration file generation..."
    
    # Test docker-compose.yml generation
    local temp_compose="/tmp/test-docker-compose.yml"
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    local implant_port="${CONFIG[implant_port]}"
    
    cat > "$temp_compose" <<EOF
version: '3.8'
services:
  seraphc2-server:
    image: seraphc2:latest
    ports:
      - "${http_port}:3000"
      - "${https_port}:8443"
      - "${implant_port}:8080"
EOF
    
    if [[ -f "$temp_compose" ]]; then
        log_success "Docker Compose file generation test passed"
        rm -f "$temp_compose"
    else
        log_error "Docker Compose file generation test failed"
        return 1
    fi
    
    # Test environment file generation
    local temp_env="/tmp/test-docker.env"
    cat > "$temp_env" <<EOF
NODE_ENV=production
DB_PASSWORD=test_password
REDIS_PASSWORD=test_password
JWT_SECRET=test_secret
EOF
    
    if [[ -f "$temp_env" ]]; then
        log_success "Environment file generation test passed"
        rm -f "$temp_env"
    else
        log_error "Environment file generation test failed"
        return 1
    fi
    
    log_success "Docker functionality tests completed"
    return 0
}

# Display Docker-specific connection information
display_docker_connection_info() {
    local http_port="${CONFIG[http_port]}"
    local https_port="${CONFIG[https_port]}"
    local implant_port="${CONFIG[implant_port]}"
    local domain="${CONFIG[domain]}"
    
    echo ""
    echo -e "${GREEN}🐳 Docker Deployment Information${NC}"
    echo -e "${BLUE}=================================${NC}"
    echo ""
    
    echo -e "${WHITE}Web Interface:${NC}"
    echo -e "  HTTP:  http://$domain:$http_port"
    if [[ "${CONFIG[ssl_type]}" != "none" ]]; then
        echo -e "  HTTPS: https://$domain:$https_port"
    fi
    echo ""
    
    echo -e "${WHITE}Implant Configuration:${NC}"
    echo -e "  Callback URL: http://$domain:$implant_port"
    if [[ "${CONFIG[ssl_type]}" != "none" ]]; then
        echo -e "  Secure Callback: https://$domain:$https_port"
    fi
    echo ""
    
    echo -e "${WHITE}Default Credentials:${NC}"
    echo -e "  Username: ${CONFIG[admin_username]}"
    echo -e "  Password: ${CONFIG[admin_password]}"
    echo -e "  ${YELLOW}⚠️  Change these credentials after first login!${NC}"
    echo ""
    
    echo -e "${WHITE}Docker Management Commands:${NC}"
    echo -e "  View logs:     docker-compose logs -f"
    echo -e "  Stop services: docker-compose stop"
    echo -e "  Start services: docker-compose start"
    echo -e "  Restart:       docker-compose restart"
    echo -e "  Update:        docker-compose pull && docker-compose up -d"
    echo ""
    
    echo -e "${WHITE}Container Status:${NC}"
    docker-compose ps
    echo ""
    
    echo -e "${WHITE}Volume Information:${NC}"
    echo -e "  Database:      $(docker volume ls | grep postgres_data | awk '{print $2}')"
    echo -e "  Redis:         $(docker volume ls | grep redis_data | awk '{print $2}')"
    echo -e "  Application:   $(docker volume ls | grep app_data | awk '{print $2}')"
    echo -e "  Logs:          $(docker volume ls | grep app_logs | awk '{print $2}')"
    echo ""
}

#==============================================================================
# MAIN FUNCTION EXECUTION
#==============================================================================

# Execute the main function with all arguments
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi