#!/bin/bash

# SeraphC2 Production Deployment Script
# This script helps deploy SeraphC2 in production using Docker Compose

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
BACKUP_DIR="./backups"
SSL_DIR="./docker/nginx/ssl"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi
    
    # Check if production environment file exists
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Production environment file ($ENV_FILE) not found."
        log_info "Please copy .env.production.example to $ENV_FILE and configure it."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

validate_environment() {
    log_info "Validating environment configuration..."
    
    # Source the environment file
    source "$ENV_FILE"
    
    # Check required variables
    required_vars=(
        "DB_PASSWORD"
        "REDIS_PASSWORD"
        "JWT_SECRET"
        "ENCRYPTION_KEY"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ] || [ "${!var}" = "CHANGE_ME"* ]; then
            log_error "Environment variable $var is not set or contains default value"
            log_info "Please update $ENV_FILE with proper values"
            exit 1
        fi
    done
    
    # Check JWT secret length
    if [ ${#JWT_SECRET} -lt 64 ]; then
        log_error "JWT_SECRET must be at least 64 characters long"
        exit 1
    fi
    
    # Check encryption key length
    if [ ${#ENCRYPTION_KEY} -ne 32 ]; then
        log_error "ENCRYPTION_KEY must be exactly 32 characters long"
        exit 1
    fi
    
    log_success "Environment validation passed"
}

setup_ssl() {
    log_info "Setting up SSL certificates..."
    
    mkdir -p "$SSL_DIR"
    
    if [ ! -f "$SSL_DIR/server.crt" ] || [ ! -f "$SSL_DIR/server.key" ]; then
        log_warning "SSL certificates not found. Generating self-signed certificates..."
        log_warning "For production use, replace with proper SSL certificates from a CA"
        
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$SSL_DIR/server.key" \
            -out "$SSL_DIR/server.crt" \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
        
        chmod 600 "$SSL_DIR/server.key"
        chmod 644 "$SSL_DIR/server.crt"
        
        log_success "Self-signed SSL certificates generated"
    else
        log_success "SSL certificates found"
    fi
}

backup_data() {
    if [ "$1" = "--skip-backup" ]; then
        log_info "Skipping backup as requested"
        return
    fi
    
    log_info "Creating backup before deployment..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Create backup timestamp
    BACKUP_TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="$BACKUP_DIR/seraphc2_backup_$BACKUP_TIMESTAMP.tar.gz"
    
    # Backup database if running
    if docker-compose -f "$COMPOSE_FILE" ps postgres | grep -q "Up"; then
        log_info "Backing up database..."
        docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U seraphc2 seraphc2 > "$BACKUP_DIR/db_backup_$BACKUP_TIMESTAMP.sql"
    fi
    
    # Backup volumes and configuration
    tar -czf "$BACKUP_FILE" \
        --exclude='node_modules' \
        --exclude='dist' \
        --exclude='.git' \
        --exclude='logs/*.log' \
        .env.production docker-compose.prod.yml docker/ 2>/dev/null || true
    
    log_success "Backup created: $BACKUP_FILE"
}

deploy() {
    log_info "Starting production deployment..."
    
    # Pull latest images
    log_info "Pulling latest images..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
    
    # Build application image
    log_info "Building application image..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache seraphc2-server
    
    # Start services
    log_info "Starting services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 30
    
    # Check service health
    if docker-compose -f "$COMPOSE_FILE" ps | grep -q "unhealthy\|Exit"; then
        log_error "Some services are not healthy. Check logs with: docker-compose -f $COMPOSE_FILE logs"
        exit 1
    fi
    
    log_success "Deployment completed successfully"
}

show_status() {
    log_info "Service status:"
    docker-compose -f "$COMPOSE_FILE" ps
    
    log_info "Service logs (last 20 lines):"
    docker-compose -f "$COMPOSE_FILE" logs --tail=20
}

cleanup() {
    log_info "Cleaning up unused Docker resources..."
    docker system prune -f
    docker volume prune -f
    log_success "Cleanup completed"
}

# Main script
case "${1:-deploy}" in
    "deploy")
        check_prerequisites
        validate_environment
        setup_ssl
        backup_data "$2"
        deploy
        show_status
        ;;
    "backup")
        backup_data
        ;;
    "status")
        show_status
        ;;
    "cleanup")
        cleanup
        ;;
    "stop")
        log_info "Stopping services..."
        docker-compose -f "$COMPOSE_FILE" down
        log_success "Services stopped"
        ;;
    "restart")
        log_info "Restarting services..."
        docker-compose -f "$COMPOSE_FILE" restart
        log_success "Services restarted"
        ;;
    "logs")
        docker-compose -f "$COMPOSE_FILE" logs -f
        ;;
    *)
        echo "Usage: $0 {deploy|backup|status|cleanup|stop|restart|logs}"
        echo ""
        echo "Commands:"
        echo "  deploy [--skip-backup]  Deploy SeraphC2 in production mode"
        echo "  backup                  Create backup of current deployment"
        echo "  status                  Show service status and recent logs"
        echo "  cleanup                 Clean up unused Docker resources"
        echo "  stop                    Stop all services"
        echo "  restart                 Restart all services"
        echo "  logs                    Follow service logs"
        exit 1
        ;;
esac