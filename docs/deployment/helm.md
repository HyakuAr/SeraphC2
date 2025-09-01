# SeraphC2 Helm Deployment Guide

This guide covers deploying SeraphC2 using Helm charts for production Kubernetes environments.

## Prerequisites

- Kubernetes cluster 1.20+
- Helm 3.8+
- kubectl configured to access your cluster
- Ingress controller (nginx recommended)
- cert-manager for SSL certificates (optional)
- Storage provisioner for persistent volumes

## Quick Start

1. **Install Helm** (if not already installed)
   ```bash
   curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
   ```

2. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd seraphc2
   ```

3. **Generate production values file**
   ```bash
   ./scripts/deploy-helm.sh --generate-values
   ```

4. **Customize the values file**
   ```bash
   nano values-production.yaml
   ```

5. **Deploy with Helm**
   ```bash
   ./scripts/deploy-helm.sh install -f values-production.yaml
   ```

## Configuration

### Values File Structure

The Helm chart uses a comprehensive values.yaml file for configuration. Key sections include:

#### Image Configuration
```yaml
image:
  registry: ""
  repository: seraphc2
  tag: "latest"
  pullPolicy: Always
```

#### Ingress Configuration
```yaml
ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: seraphc2.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: seraphc2-tls
      hosts:
        - seraphc2.yourdomain.com
```

#### Application Configuration
```yaml
config:
  nodeEnv: production
  port: 3000
  corsOrigin: "https://seraphc2.yourdomain.com"
  logLevel: info
  enableMetrics: true
```

#### Secrets Configuration
```yaml
secrets:
  dbPassword: "your-strong-db-password"
  redisPassword: "your-strong-redis-password"
  jwtSecret: "your-64-character-jwt-secret"
  encryptionKey: "your-32-character-encryption-key"
```

#### Resource Configuration
```yaml
deployment:
  resources:
    requests:
      memory: "1Gi"
      cpu: "500m"
    limits:
      memory: "2Gi"
      cpu: "1000m"
```

### Database Configuration

#### Built-in PostgreSQL (Default)
```yaml
postgresql:
  enabled: true
  primary:
    persistence:
      enabled: true
      size: 20Gi
    resources:
      requests:
        memory: "512Mi"
        cpu: "250m"
```

#### External Database
```yaml
postgresql:
  enabled: false

externalDatabase:
  enabled: true
  host: "postgres.example.com"
  port: 5432
  database: seraphc2
  username: seraphc2
  password: "your-password"
```

### Redis Configuration

#### Built-in Redis (Default)
```yaml
redis:
  enabled: true
  master:
    persistence:
      enabled: true
      size: 5Gi
```

#### External Redis
```yaml
redis:
  enabled: false

externalRedis:
  enabled: true
  host: "redis.example.com"
  port: 6379
  password: "your-password"
```

## Deployment Commands

### Installation

```bash
# Basic installation
helm install seraphc2 helm/seraphc2 -n seraphc2 --create-namespace

# With custom values
helm install seraphc2 helm/seraphc2 -n seraphc2 --create-namespace -f values-production.yaml

# With inline values
helm install seraphc2 helm/seraphc2 -n seraphc2 --create-namespace \
  --set ingress.hosts[0].host=seraphc2.example.com \
  --set secrets.dbPassword=strongpassword

# Dry run (test without installing)
helm install seraphc2 helm/seraphc2 -n seraphc2 --dry-run --debug
```

### Upgrade

```bash
# Upgrade with new values
helm upgrade seraphc2 helm/seraphc2 -n seraphc2 -f values-production.yaml

# Upgrade with new image tag
helm upgrade seraphc2 helm/seraphc2 -n seraphc2 --set image.tag=v1.1.0

# Force upgrade
helm upgrade seraphc2 helm/seraphc2 -n seraphc2 --force
```

### Status and Management

```bash
# Check status
helm status seraphc2 -n seraphc2

# Get values
helm get values seraphc2 -n seraphc2

# Get all values (including defaults)
helm get values seraphc2 -n seraphc2 --all

# View history
helm history seraphc2 -n seraphc2

# Rollback
helm rollback seraphc2 1 -n seraphc2
```

### Uninstallation

```bash
# Uninstall release
helm uninstall seraphc2 -n seraphc2

# Delete namespace and all resources
kubectl delete namespace seraphc2
```

## Using the Deployment Script

The included deployment script provides a convenient interface:

### Basic Usage

```bash
# Install
./scripts/deploy-helm.sh install -f values-production.yaml

# Upgrade
./scripts/deploy-helm.sh upgrade --set image.tag=v1.1.0

# Check status
./scripts/deploy-helm.sh status

# Uninstall
./scripts/deploy-helm.sh uninstall
```

### Advanced Usage

```bash
# Generate production values template
./scripts/deploy-helm.sh --generate-values

# Template without installing
./scripts/deploy-helm.sh template -f values-production.yaml > manifests.yaml

# Lint chart
./scripts/deploy-helm.sh lint

# Custom namespace and release name
./scripts/deploy-helm.sh install -n custom-ns -r my-seraphc2 -f values.yaml
```

## Production Configuration

### Security Hardening

1. **Update all secrets**
   ```bash
   # Generate secure secrets
   DB_PASSWORD=$(openssl rand -base64 32)
   REDIS_PASSWORD=$(openssl rand -base64 32)
   JWT_SECRET=$(openssl rand -base64 64)
   ENCRYPTION_KEY=$(openssl rand -base64 24)
   ```

2. **Configure proper domains**
   ```yaml
   ingress:
     hosts:
       - host: seraphc2.yourdomain.com
   config:
     corsOrigin: "https://seraphc2.yourdomain.com"
   ```

3. **Enable network policies**
   ```yaml
   networkPolicy:
     enabled: true
   ```

### Resource Planning

#### Small Deployment (< 100 users)
```yaml
deployment:
  replicaCount: 2
  resources:
    requests:
      memory: "1Gi"
      cpu: "500m"
    limits:
      memory: "2Gi"
      cpu: "1000m"

autoscaling:
  minReplicas: 2
  maxReplicas: 5
```

#### Medium Deployment (100-1000 users)
```yaml
deployment:
  replicaCount: 3
  resources:
    requests:
      memory: "2Gi"
      cpu: "1000m"
    limits:
      memory: "4Gi"
      cpu: "2000m"

autoscaling:
  minReplicas: 3
  maxReplicas: 10
```

#### Large Deployment (1000+ users)
```yaml
deployment:
  replicaCount: 5
  resources:
    requests:
      memory: "4Gi"
      cpu: "2000m"
    limits:
      memory: "8Gi"
      cpu: "4000m"

autoscaling:
  minReplicas: 5
  maxReplicas: 20
```

### Storage Configuration

#### Local Storage
```yaml
global:
  storageClass: "local-path"

postgresql:
  primary:
    persistence:
      size: 50Gi

redis:
  master:
    persistence:
      size: 10Gi
```

#### Cloud Storage
```yaml
# AWS EKS
global:
  storageClass: "gp3"

# Google GKE
global:
  storageClass: "ssd-rwo"

# Azure AKS
global:
  storageClass: "managed-premium"
```

## Monitoring and Observability

### Prometheus Integration

```yaml
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
    namespace: "monitoring"
    labels:
      prometheus: kube-prometheus
```

### Grafana Dashboards

The chart includes annotations for automatic dashboard discovery:

```yaml
deployment:
  podAnnotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "9090"
    prometheus.io/path: "/metrics"
```

### Log Aggregation

Configure structured logging for log aggregation:

```yaml
config:
  logLevel: info
  logFileEnabled: false  # Use stdout for container logs
```

## Backup and Recovery

### Database Backup

```bash
# Create backup job
kubectl create job --from=cronjob/seraphc2-backup seraphc2-backup-manual -n seraphc2

# Manual backup
kubectl exec -n seraphc2 deployment/seraphc2-postgresql -- pg_dump -U seraphc2 seraphc2 > backup.sql
```

### Volume Snapshots

```yaml
# Enable volume snapshots (if supported)
postgresql:
  primary:
    persistence:
      annotations:
        volume.beta.kubernetes.io/storage-class: "snapshot-enabled"
```

## Troubleshooting

### Common Issues

1. **Chart validation errors**
   ```bash
   helm lint helm/seraphc2
   helm template seraphc2 helm/seraphc2 --debug
   ```

2. **Pod startup issues**
   ```bash
   kubectl describe pod -n seraphc2 -l app.kubernetes.io/name=seraphc2
   kubectl logs -n seraphc2 -l app.kubernetes.io/name=seraphc2
   ```

3. **Ingress issues**
   ```bash
   kubectl describe ingress -n seraphc2
   kubectl get events -n seraphc2
   ```

4. **Storage issues**
   ```bash
   kubectl get pvc -n seraphc2
   kubectl describe pvc -n seraphc2
   ```

### Debug Commands

```bash
# Template with debug
helm template seraphc2 helm/seraphc2 -f values.yaml --debug

# Install with debug
helm install seraphc2 helm/seraphc2 -f values.yaml --debug --dry-run

# Check rendered templates
helm get manifest seraphc2 -n seraphc2
```

## Migration from Docker Compose

To migrate from Docker Compose to Helm:

1. **Export existing data**
   ```bash
   docker-compose exec postgres pg_dump -U seraphc2 seraphc2 > backup.sql
   ```

2. **Deploy with Helm**
   ```bash
   ./scripts/deploy-helm.sh install -f values-production.yaml
   ```

3. **Import data**
   ```bash
   kubectl exec -n seraphc2 deployment/seraphc2-postgresql -i -- psql -U seraphc2 -d seraphc2 < backup.sql
   ```

## Best Practices

1. **Use version control for values files**
2. **Test deployments in staging first**
3. **Use semantic versioning for image tags**
4. **Monitor resource usage and adjust limits**
5. **Implement proper backup strategies**
6. **Use secrets management tools (e.g., Sealed Secrets, External Secrets)**
7. **Enable network policies for security**
8. **Use Pod Disruption Budgets for availability**
9. **Implement proper monitoring and alerting**
10. **Keep Helm charts and values files updated**

## Support

For Helm deployment support:

1. Check the [Kubernetes deployment guide](kubernetes.md)
2. Review Helm chart templates and values
3. Consult the [troubleshooting guide](../troubleshooting/common-issues.md)
4. Use `helm template` to debug chart rendering issues