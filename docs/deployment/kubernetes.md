# SeraphC2 Kubernetes Deployment Guide

This guide covers deploying SeraphC2 on Kubernetes for production use.

## Prerequisites

- Kubernetes cluster 1.20+
- kubectl configured to access your cluster
- Docker for building images
- At least 8GB RAM and 4 CPU cores available in cluster
- Storage class for persistent volumes
- Ingress controller (nginx recommended)
- cert-manager for SSL certificates (optional)

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd seraphc2
   ```

2. **Update configuration**
   ```bash
   # Update secrets (REQUIRED for production)
   nano k8s/secret.yaml
   
   # Update domain names in ingress
   nano k8s/ingress.yaml
   
   # Update storage classes if needed
   nano k8s/pvc.yaml
   ```

3. **Deploy to Kubernetes**
   ```bash
   ./scripts/deploy-kubernetes.sh deploy
   ```

## Configuration

### Secrets Management

**CRITICAL**: Update all secrets in `k8s/secret.yaml` before production deployment:

```bash
# Generate strong passwords
DB_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
ENCRYPTION_KEY=$(openssl rand -base64 24)

# Encode to base64
echo -n "$DB_PASSWORD" | base64
echo -n "$REDIS_PASSWORD" | base64
echo -n "$JWT_SECRET" | base64
echo -n "$ENCRYPTION_KEY" | base64
```

Update the secret.yaml file with these base64-encoded values.

### Domain Configuration

Update domain names in `k8s/ingress.yaml`:

```yaml
spec:
  tls:
  - hosts:
    - your-domain.com
    - www.your-domain.com
  rules:
  - host: your-domain.com
  - host: www.your-domain.com
```

### Storage Configuration

Update storage classes in `k8s/pvc.yaml` to match your cluster:

```yaml
spec:
  storageClassName: fast-ssd  # Change to your storage class
```

Common storage classes:
- **GKE**: `standard-rwo`, `ssd-rwo`
- **EKS**: `gp2`, `gp3`
- **AKS**: `default`, `managed-premium`

## Architecture

### Components

- **SeraphC2 Application**: 2+ replicas with auto-scaling
- **PostgreSQL**: Single instance with persistent storage
- **Redis**: Single instance with persistent storage
- **Ingress**: HTTPS termination and routing
- **Network Policies**: Micro-segmentation security

### Resource Requirements

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| SeraphC2  | 500m        | 1000m     | 1Gi            | 2Gi          |
| PostgreSQL| 250m        | 500m      | 512Mi          | 1Gi          |
| Redis     | 100m        | 250m      | 256Mi          | 512Mi        |

### Storage Requirements

| Component | Size | Access Mode | Purpose |
|-----------|------|-------------|---------|
| PostgreSQL| 20Gi | ReadWriteOnce | Database storage |
| Redis     | 5Gi  | ReadWriteOnce | Cache persistence |
| Uploads   | 10Gi | ReadWriteMany | File uploads |

## Security Features

### Pod Security

- **Non-root containers**: All containers run as non-root users
- **Read-only root filesystem**: Prevents runtime modifications
- **Security contexts**: Restricted capabilities and privileges
- **Resource limits**: CPU and memory limits enforced

### Network Security

- **Network policies**: Micro-segmentation between components
- **Service mesh ready**: Compatible with Istio/Linkerd
- **Ingress security**: Rate limiting and security headers
- **Internal communication**: TLS between services (when configured)

### RBAC

- **Service accounts**: Dedicated service accounts per component
- **Minimal permissions**: Least privilege access
- **Role-based access**: Granular permission control

## Deployment Options

### Standard Deployment

```bash
./scripts/deploy-kubernetes.sh deploy
```

### With Custom Registry

```bash
export DOCKER_REGISTRY=your-registry.com/seraphc2
./scripts/deploy-kubernetes.sh deploy
```

### Manual Deployment

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Deploy secrets and config
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml

# Deploy storage
kubectl apply -f k8s/pvc.yaml

# Deploy applications
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Deploy ingress
kubectl apply -f k8s/ingress.yaml

# Deploy security policies
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/network-policy.yaml

# Deploy autoscaling
kubectl apply -f k8s/hpa.yaml
```

## Monitoring and Observability

### Health Checks

All components include comprehensive health checks:

- **Liveness probes**: Restart unhealthy containers
- **Readiness probes**: Remove unhealthy pods from load balancing
- **Startup probes**: Handle slow-starting containers

### Metrics

Prometheus-compatible metrics available at:
- **Application metrics**: `http://seraphc2-service:9090/metrics`
- **Kubernetes metrics**: Via metrics-server

### Logging

Structured JSON logging to stdout for log aggregation:

```bash
# View application logs
kubectl logs -n seraphc2 -l app.kubernetes.io/name=seraphc2 -f

# View all logs
kubectl logs -n seraphc2 --all-containers=true -f
```

## Scaling and Performance

### Horizontal Pod Autoscaling

Automatic scaling based on CPU and memory usage:

```yaml
spec:
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        averageUtilization: 70
```

### Manual Scaling

```bash
# Scale application
kubectl scale deployment seraphc2-app --replicas=5 -n seraphc2

# Check scaling status
kubectl get hpa -n seraphc2
```

### Performance Tuning

1. **Resource requests/limits**: Adjust based on workload
2. **JVM settings**: Configure heap size for Java components
3. **Database connections**: Tune connection pool settings
4. **Redis memory**: Adjust maxmemory settings

## SSL/TLS Configuration

### Using cert-manager (Recommended)

1. **Install cert-manager**
   ```bash
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
   ```

2. **Create ClusterIssuer**
   ```yaml
   apiVersion: cert-manager.io/v1
   kind: ClusterIssuer
   metadata:
     name: letsencrypt-prod
   spec:
     acme:
       server: https://acme-v02.api.letsencrypt.org/directory
       email: your-email@domain.com
       privateKeySecretRef:
         name: letsencrypt-prod
       solvers:
       - http01:
           ingress:
             class: nginx
   ```

3. **Certificates are automatically managed** via ingress annotations

### Manual Certificate Management

```bash
# Create TLS secret with your certificates
kubectl create secret tls seraphc2-tls \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key \
  -n seraphc2
```

## Backup and Recovery

### Database Backup

```bash
# Automated backup via script
./scripts/deploy-kubernetes.sh backup

# Manual backup
kubectl exec -n seraphc2 deployment/postgres -- pg_dump -U seraphc2 seraphc2 > backup.sql
```

### Volume Backup

```bash
# Using Velero (recommended for production)
velero backup create seraphc2-backup --include-namespaces seraphc2

# Manual volume backup
kubectl get pvc -n seraphc2
# Use your storage provider's snapshot functionality
```

### Disaster Recovery

1. **Restore namespace**
   ```bash
   kubectl apply -f k8s/namespace.yaml
   ```

2. **Restore secrets and config**
   ```bash
   kubectl apply -f k8s/secret.yaml
   kubectl apply -f k8s/configmap.yaml
   ```

3. **Restore volumes** (using your backup solution)

4. **Redeploy applications**
   ```bash
   ./scripts/deploy-kubernetes.sh deploy
   ```

## Troubleshooting

### Common Issues

1. **Pods not starting**
   ```bash
   kubectl describe pod -n seraphc2 <pod-name>
   kubectl logs -n seraphc2 <pod-name>
   ```

2. **Storage issues**
   ```bash
   kubectl get pvc -n seraphc2
   kubectl describe pvc -n seraphc2 <pvc-name>
   ```

3. **Network connectivity**
   ```bash
   kubectl get networkpolicy -n seraphc2
   kubectl describe networkpolicy -n seraphc2 <policy-name>
   ```

4. **Ingress issues**
   ```bash
   kubectl get ingress -n seraphc2
   kubectl describe ingress -n seraphc2 seraphc2-ingress
   ```

### Debug Commands

```bash
# Check cluster resources
kubectl top nodes
kubectl top pods -n seraphc2

# Check events
kubectl get events -n seraphc2 --sort-by='.lastTimestamp'

# Port forward for debugging
kubectl port-forward -n seraphc2 service/seraphc2-service 3000:80

# Execute into pod
kubectl exec -it -n seraphc2 deployment/seraphc2-app -- /bin/sh
```

### Performance Issues

1. **Resource constraints**
   ```bash
   kubectl describe pod -n seraphc2 <pod-name>
   # Look for resource limit warnings
   ```

2. **Database performance**
   ```bash
   kubectl exec -n seraphc2 deployment/postgres -- psql -U seraphc2 -c "SELECT * FROM pg_stat_activity;"
   ```

3. **Network latency**
   ```bash
   kubectl exec -n seraphc2 deployment/seraphc2-app -- ping postgres-service
   ```

## Maintenance

### Updates

1. **Update image**
   ```bash
   # Build new image
   docker build -f docker/server/Dockerfile.prod -t seraphc2:v1.1.0 .
   
   # Update deployment
   kubectl set image deployment/seraphc2-app seraphc2=seraphc2:v1.1.0 -n seraphc2
   
   # Check rollout status
   kubectl rollout status deployment/seraphc2-app -n seraphc2
   ```

2. **Rollback if needed**
   ```bash
   kubectl rollout undo deployment/seraphc2-app -n seraphc2
   ```

### Security Updates

1. **Update base images regularly**
2. **Scan images for vulnerabilities**
3. **Keep Kubernetes cluster updated**
4. **Review and update network policies**

## Production Checklist

- [ ] Update all secrets in `k8s/secret.yaml`
- [ ] Configure proper domain names in ingress
- [ ] Set up SSL certificates (cert-manager recommended)
- [ ] Configure storage classes for your environment
- [ ] Set up monitoring and alerting
- [ ] Configure backup strategy
- [ ] Review resource limits and requests
- [ ] Test disaster recovery procedures
- [ ] Set up log aggregation
- [ ] Configure network policies
- [ ] Review RBAC permissions
- [ ] Set up image scanning
- [ ] Configure pod security policies/standards

## Support

For Kubernetes deployment support:

1. Check pod logs: `kubectl logs -n seraphc2 <pod-name>`
2. Check events: `kubectl get events -n seraphc2`
3. Review the [troubleshooting guide](../troubleshooting/common-issues.md)
4. Consult Kubernetes documentation for cluster-specific issues