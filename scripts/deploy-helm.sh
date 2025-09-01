#!/bin/bash

# SeraphC2 Helm Deployment Script
# This script helps deploy SeraphC2 using Helm

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CHART_PATH="helm/seraphc2"
RELEASE_NAME="seraphc2"
NAMESPACE="seraphc2"
VALUES_FILE=""

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

show_usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  install     Install SeraphC2 using Helm"
    echo "  upgrade     Upgrade existing SeraphC2 installation"
    echo "  uninstall   Uninstall SeraphC2"
    echo "  status      Show deployment status"
    echo "  values      Show current values"
    echo "  template    Generate Kubernetes manifests without installing"
    echo "  lint        Lint the Helm chart"
    echo "  test        Run Helm tests"
    echo ""
    echo "Options:"
    echo "  -n, --namespace NAMESPACE    Kubernetes namespace (default: seraphc2)"
    echo "  -r, --release RELEASE        Helm release name (default: seraphc2)"
    echo "  -f, --values FILE           Values file to use"
    echo "  --set KEY=VALUE             Set individual values"
    echo "  --dry-run                   Simulate installation"
    echo "  --wait                      Wait for deployment to be ready"
    echo "  --timeout DURATION          Timeout for operations (default: 10m)"
    echo "  -h, --help                  Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 install -f values-prod.yaml"
    echo "  $0 upgrade --set image.tag=v1.1.0"
    echo "  $0 install --set ingress.hosts[0].host=seraphc2.example.com"
    echo "  $0 template -f values-prod.yaml > manifests.yaml"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if helm is installed
    if ! command -v helm &> /dev/null; then
        log_error "Helm is not installed. Please install Helm first."
        log_info "Visit: https://helm.sh/docs/intro/install/"
        exit 1
    fi
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed. Please install kubectl first."
        exit 1
    fi
    
    # Check if kubectl can connect to cluster
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
        exit 1
    fi
    
    # Check if chart directory exists
    if [ ! -d "$CHART_PATH" ]; then
        log_error "Helm chart directory ($CHART_PATH) not found."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

validate_chart() {
    log_info "Validating Helm chart..."
    
    if ! helm lint "$CHART_PATH" &> /dev/null; then
        log_error "Helm chart validation failed"
        helm lint "$CHART_PATH"
        exit 1
    fi
    
    log_success "Chart validation passed"
}

create_namespace() {
    log_info "Creating namespace if it doesn't exist..."
    
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        kubectl create namespace "$NAMESPACE"
        log_success "Namespace $NAMESPACE created"
    else
        log_info "Namespace $NAMESPACE already exists"
    fi
}

generate_values_file() {
    local output_file="$1"
    
    log_info "Generating production values file: $output_file"
    
    cat > "$output_file" << 'EOF'
# Production values for SeraphC2
# Copy this file and customize for your environment

# Image configuration
image:
  repository: seraphc2
  tag: "latest"
  pullPolicy: Always

# Ingress configuration
ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: seraphc2.yourdomain.com  # CHANGE THIS
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: seraphc2-tls
      hosts:
        - seraphc2.yourdomain.com  # CHANGE THIS

# Application configuration
config:
  corsOrigin: "https://seraphc2.yourdomain.com"  # CHANGE THIS

# Secrets (CHANGE ALL OF THESE)
secrets:
  dbPassword: "CHANGE_ME_STRONG_DB_PASSWORD"
  redisPassword: "CHANGE_ME_STRONG_REDIS_PASSWORD"
  jwtSecret: "CHANGE_ME_VERY_LONG_JWT_SECRET_AT_LEAST_64_CHARACTERS_FOR_SECURITY"
  encryptionKey: "CHANGE_ME_32_CHARACTER_ENCRYPTION_KEY"
  webhookSecret: "CHANGE_ME_WEBHOOK_SECRET"
  apiKeyEncryptionKey: "CHANGE_ME_API_KEY_ENCRYPTION"

# Resource configuration
deployment:
  resources:
    requests:
      memory: "2Gi"
      cpu: "1000m"
    limits:
      memory: "4Gi"
      cpu: "2000m"

# PostgreSQL configuration
postgresql:
  primary:
    persistence:
      size: 50Gi
    resources:
      requests:
        memory: "1Gi"
        cpu: "500m"
      limits:
        memory: "2Gi"
        cpu: "1000m"

# Redis configuration
redis:
  master:
    persistence:
      size: 10Gi
    resources:
      requests:
        memory: "512Mi"
        cpu: "250m"
      limits:
        memory: "1Gi"
        cpu: "500m"

# Autoscaling
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20

# Monitoring
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
EOF
    
    log_success "Production values file generated: $output_file"
    log_warning "Please customize the values in $output_file before deployment"
}

install_chart() {
    local extra_args=("$@")
    
    log_info "Installing SeraphC2 with Helm..."
    
    create_namespace
    
    local helm_cmd="helm install $RELEASE_NAME $CHART_PATH --namespace $NAMESPACE"
    
    if [ ! -z "$VALUES_FILE" ]; then
        helm_cmd="$helm_cmd --values $VALUES_FILE"
    fi
    
    # Add extra arguments
    for arg in "${extra_args[@]}"; do
        helm_cmd="$helm_cmd $arg"
    done
    
    log_info "Running: $helm_cmd"
    eval "$helm_cmd"
    
    log_success "SeraphC2 installed successfully"
    
    # Show status
    show_status
}

upgrade_chart() {
    local extra_args=("$@")
    
    log_info "Upgrading SeraphC2 with Helm..."
    
    local helm_cmd="helm upgrade $RELEASE_NAME $CHART_PATH --namespace $NAMESPACE"
    
    if [ ! -z "$VALUES_FILE" ]; then
        helm_cmd="$helm_cmd --values $VALUES_FILE"
    fi
    
    # Add extra arguments
    for arg in "${extra_args[@]}"; do
        helm_cmd="$helm_cmd $arg"
    done
    
    log_info "Running: $helm_cmd"
    eval "$helm_cmd"
    
    log_success "SeraphC2 upgraded successfully"
    
    # Show status
    show_status
}

uninstall_chart() {
    log_warning "This will uninstall SeraphC2 and all its resources!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Uninstalling SeraphC2..."
        helm uninstall "$RELEASE_NAME" --namespace "$NAMESPACE"
        log_success "SeraphC2 uninstalled successfully"
        
        log_info "Note: PVCs may still exist. To delete them:"
        log_info "kubectl delete pvc --all -n $NAMESPACE"
    else
        log_info "Uninstall cancelled"
    fi
}

show_status() {
    log_info "Deployment status:"
    
    echo ""
    echo "Helm release:"
    helm status "$RELEASE_NAME" --namespace "$NAMESPACE"
    
    echo ""
    echo "Pods:"
    kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME"
    
    echo ""
    echo "Services:"
    kubectl get services -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME"
    
    echo ""
    echo "Ingress:"
    kubectl get ingress -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME"
}

show_values() {
    log_info "Current values:"
    helm get values "$RELEASE_NAME" --namespace "$NAMESPACE" --all
}

template_chart() {
    local extra_args=("$@")
    
    local helm_cmd="helm template $RELEASE_NAME $CHART_PATH --namespace $NAMESPACE"
    
    if [ ! -z "$VALUES_FILE" ]; then
        helm_cmd="$helm_cmd --values $VALUES_FILE"
    fi
    
    # Add extra arguments
    for arg in "${extra_args[@]}"; do
        helm_cmd="$helm_cmd $arg"
    done
    
    eval "$helm_cmd"
}

lint_chart() {
    log_info "Linting Helm chart..."
    helm lint "$CHART_PATH"
    log_success "Chart linting completed"
}

test_chart() {
    log_info "Running Helm tests..."
    helm test "$RELEASE_NAME" --namespace "$NAMESPACE"
    log_success "Helm tests completed"
}

# Parse command line arguments
COMMAND=""
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        install|upgrade|uninstall|status|values|template|lint|test)
            COMMAND="$1"
            shift
            ;;
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -r|--release)
            RELEASE_NAME="$2"
            shift 2
            ;;
        -f|--values)
            VALUES_FILE="$2"
            shift 2
            ;;
        --generate-values)
            generate_values_file "values-production.yaml"
            exit 0
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            EXTRA_ARGS+=("$1")
            shift
            ;;
    esac
done

# Check if command is provided
if [ -z "$COMMAND" ]; then
    log_error "No command provided"
    show_usage
    exit 1
fi

# Run the appropriate command
case "$COMMAND" in
    "install")
        check_prerequisites
        validate_chart
        install_chart "${EXTRA_ARGS[@]}"
        ;;
    "upgrade")
        check_prerequisites
        validate_chart
        upgrade_chart "${EXTRA_ARGS[@]}"
        ;;
    "uninstall")
        uninstall_chart
        ;;
    "status")
        show_status
        ;;
    "values")
        show_values
        ;;
    "template")
        template_chart "${EXTRA_ARGS[@]}"
        ;;
    "lint")
        lint_chart
        ;;
    "test")
        test_chart
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        show_usage
        exit 1
        ;;
esac