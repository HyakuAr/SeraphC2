#!/bin/bash

# SeraphC2 Kubernetes Deployment Script
# This script helps deploy SeraphC2 on Kubernetes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="seraphc2"
K8S_DIR="k8s"
DOCKER_IMAGE="seraphc2:latest"

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
    
    # Check if Docker is available for building images
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

validate_configuration() {
    log_info "Validating Kubernetes configuration..."
    
    # Check if k8s directory exists
    if [ ! -d "$K8S_DIR" ]; then
        log_error "Kubernetes configuration directory ($K8S_DIR) not found."
        exit 1
    fi
    
    # Check required files
    required_files=(
        "namespace.yaml"
        "configmap.yaml"
        "secret.yaml"
        "deployment.yaml"
        "service.yaml"
        "ingress.yaml"
        "pvc.yaml"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$K8S_DIR/$file" ]; then
            log_error "Required file $K8S_DIR/$file not found"
            exit 1
        fi
    done
    
    log_success "Configuration validation passed"
}

build_image() {
    log_info "Building Docker image..."
    
    # Build production image
    docker build -f docker/server/Dockerfile.prod -t "$DOCKER_IMAGE" .
    
    # Tag for registry if specified
    if [ ! -z "$DOCKER_REGISTRY" ]; then
        docker tag "$DOCKER_IMAGE" "$DOCKER_REGISTRY/$DOCKER_IMAGE"
        log_info "Pushing image to registry..."
        docker push "$DOCKER_REGISTRY/$DOCKER_IMAGE"
    fi
    
    log_success "Docker image built successfully"
}

create_namespace() {
    log_info "Creating namespace..."
    
    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_info "Namespace $NAMESPACE already exists"
    else
        kubectl apply -f "$K8S_DIR/namespace.yaml"
        log_success "Namespace $NAMESPACE created"
    fi
}

update_secrets() {
    log_info "Updating secrets..."
    
    log_warning "IMPORTANT: Update the secrets in $K8S_DIR/secret.yaml before production deployment!"
    log_warning "The default secrets are for demonstration only and MUST be changed."
    
    # Check if secrets exist
    if kubectl get secret seraphc2-secrets -n "$NAMESPACE" &> /dev/null; then
        log_info "Secrets already exist. Use 'kubectl delete secret seraphc2-secrets -n $NAMESPACE' to recreate."
    else
        kubectl apply -f "$K8S_DIR/secret.yaml"
        log_success "Secrets created"
    fi
}

deploy_storage() {
    log_info "Deploying storage resources..."
    
    # Apply PVCs
    kubectl apply -f "$K8S_DIR/pvc.yaml"
    
    # Wait for PVCs to be bound
    log_info "Waiting for PVCs to be bound..."
    kubectl wait --for=condition=Bound pvc --all -n "$NAMESPACE" --timeout=300s
    
    log_success "Storage resources deployed"
}

deploy_config() {
    log_info "Deploying configuration..."
    
    kubectl apply -f "$K8S_DIR/configmap.yaml"
    
    log_success "Configuration deployed"
}

deploy_applications() {
    log_info "Deploying applications..."
    
    # Deploy applications
    kubectl apply -f "$K8S_DIR/deployment.yaml"
    
    # Wait for deployments to be ready
    log_info "Waiting for deployments to be ready..."
    kubectl wait --for=condition=Available deployment --all -n "$NAMESPACE" --timeout=600s
    
    log_success "Applications deployed"
}

deploy_services() {
    log_info "Deploying services..."
    
    kubectl apply -f "$K8S_DIR/service.yaml"
    
    log_success "Services deployed"
}

deploy_ingress() {
    log_info "Deploying ingress..."
    
    log_warning "Update the domain names in $K8S_DIR/ingress.yaml before applying"
    
    kubectl apply -f "$K8S_DIR/ingress.yaml"
    
    log_success "Ingress deployed"
}

deploy_rbac() {
    log_info "Deploying RBAC resources..."
    
    kubectl apply -f "$K8S_DIR/rbac.yaml"
    
    log_success "RBAC resources deployed"
}

deploy_network_policies() {
    log_info "Deploying network policies..."
    
    # Check if network policies are supported
    if kubectl api-resources | grep -q networkpolicies; then
        kubectl apply -f "$K8S_DIR/network-policy.yaml"
        log_success "Network policies deployed"
    else
        log_warning "Network policies not supported by this cluster"
    fi
}

deploy_hpa() {
    log_info "Deploying horizontal pod autoscaler..."
    
    # Check if metrics server is available
    if kubectl get apiservice v1beta1.metrics.k8s.io &> /dev/null; then
        kubectl apply -f "$K8S_DIR/hpa.yaml"
        log_success "HPA deployed"
    else
        log_warning "Metrics server not available. HPA not deployed."
        log_info "Install metrics server: kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml"
    fi
}

show_status() {
    log_info "Deployment status:"
    
    echo ""
    echo "Namespace:"
    kubectl get namespace "$NAMESPACE"
    
    echo ""
    echo "Pods:"
    kubectl get pods -n "$NAMESPACE" -o wide
    
    echo ""
    echo "Services:"
    kubectl get services -n "$NAMESPACE"
    
    echo ""
    echo "Ingress:"
    kubectl get ingress -n "$NAMESPACE"
    
    echo ""
    echo "PVCs:"
    kubectl get pvc -n "$NAMESPACE"
    
    echo ""
    echo "Recent events:"
    kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' | tail -10
}

show_logs() {
    log_info "Recent application logs:"
    kubectl logs -n "$NAMESPACE" -l app.kubernetes.io/name=seraphc2 --tail=50
}

cleanup() {
    log_warning "This will delete all SeraphC2 resources in the $NAMESPACE namespace!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Deleting all resources..."
        kubectl delete namespace "$NAMESPACE"
        log_success "Cleanup completed"
    else
        log_info "Cleanup cancelled"
    fi
}

backup_data() {
    log_info "Creating database backup..."
    
    # Get postgres pod name
    POSTGRES_POD=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=postgres -o jsonpath='{.items[0].metadata.name}')
    
    if [ -z "$POSTGRES_POD" ]; then
        log_error "No postgres pod found"
        exit 1
    fi
    
    # Create backup
    BACKUP_FILE="seraphc2_backup_$(date +%Y%m%d_%H%M%S).sql"
    kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- pg_dump -U seraphc2 seraphc2 > "$BACKUP_FILE"
    
    log_success "Backup created: $BACKUP_FILE"
}

# Main script
case "${1:-deploy}" in
    "deploy")
        check_prerequisites
        validate_configuration
        build_image
        create_namespace
        update_secrets
        deploy_config
        deploy_storage
        deploy_rbac
        deploy_applications
        deploy_services
        deploy_ingress
        deploy_network_policies
        deploy_hpa
        show_status
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "backup")
        backup_data
        ;;
    "cleanup")
        cleanup
        ;;
    "build")
        build_image
        ;;
    "update")
        log_info "Updating deployment..."
        kubectl rollout restart deployment/seraphc2-app -n "$NAMESPACE"
        kubectl rollout status deployment/seraphc2-app -n "$NAMESPACE"
        log_success "Deployment updated"
        ;;
    *)
        echo "Usage: $0 {deploy|status|logs|backup|cleanup|build|update}"
        echo ""
        echo "Commands:"
        echo "  deploy    Deploy SeraphC2 to Kubernetes"
        echo "  status    Show deployment status"
        echo "  logs      Show application logs"
        echo "  backup    Create database backup"
        echo "  cleanup   Delete all resources"
        echo "  build     Build Docker image only"
        echo "  update    Update running deployment"
        echo ""
        echo "Environment variables:"
        echo "  DOCKER_REGISTRY   Docker registry for pushing images"
        exit 1
        ;;
esac