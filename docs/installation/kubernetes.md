# Kubernetes Deployment Guide

This guide covers deploying SeraphC2 on Kubernetes clusters for production environments with high availability, scalability, and enterprise-grade features.

## Prerequisites

### Required Software

- **kubectl** (version 1.24 or higher)
  - Install from [kubernetes.io](https://kubernetes.io/docs/tasks/tools/)
  - Verify installation: `kubectl version --client`
- **Helm** (version 3.8 or higher)
  - Install from [helm.sh](https://helm.sh/docs/intro/install/)
  - Verify installation: `helm version`

### Kubernetes Cluster Requirements

**Minimum Cluster Specifications:**
- Kubernetes version: 1.24+
- Nodes: 3+ worker nodes
- CPU: 8+ cores total
- Memory: 16GB+ total
- Storage: 100GB+ persistent storage
- Network: CNI plugin installed (Calico, Flannel, etc.)

**Supported Platforms:**
- Amazon EKS
- Google GKE
- Azure AKS
- On-premises clusters
- Minikube (development only)

## Quick Start

### 1. Cluster Access

Ensure you have access to your Kubernetes cluster:

```bash
# Test cluster connectivity
kubectl cluster-info

# Check node status
kubectl get nodes

# Verify you have cluster-admin permissions
kubectl auth can-i '*' '*'
```

### 2. Deploy Using Helm (Recommended)

```bash
# Add the SeraphC2 Helm repository (if available)
helm repo add seraphc2 https://charts.seraphc2.com
helm repo update

# Install SeraphC2
helm install seraphc2 seraphc2/seraphc2 \
  --namespace seraphc2 \
  --create-namespace \
  --set database.password=your-secure-password \
  --set redis.password=your-redis-password \
  --set app.jwtSecret=your-jwt-secret-32-chars-min \
  --set app.encryptionKey=your-32-character-encryption-key
```

### 3. Deploy Using Raw Manifests

```bash
# Clone the repository
git clone https://github.com/your-org/seraphc2.git
cd seraphc2

# Apply all Kubernetes manifests
kubectl apply -f k8s/
```

### 4. Verify Deployment

```bash
# Check pod status
kubectl get pods -n seraphc2

# Check services
kubectl get services -n seraphc2

# Check ingress
kubectl get ingress -n seraphc2

# View logs
kubectl logs -f deployment/seraphc2-app -n seraphc2
```

## Detailed Deployment

### 1. Namespace Creation

Create a dedicated namespace for SeraphC2:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: seraphc2
  labels:
    name: seraphc2
    app.kubernetes.io/name: seraphc2
    app.kubernetes.io/part-of: seraphc2
EOF
```

### 2. Secrets Management

Create secrets for sensitive configuration:

```bash
# Create database secrets
kubectl create secret generic postgres-secrets \
  --namespace=seraphc2 \
  --from-literal=POSTGRES_PASSWORD=your-secure-database-password

# Create application secrets
kubectl create secret generic seraphc2-secrets \
  --namespace=seraphc2 \
  --from-literal=JWT_SECRET=your-jwt-secret-minimum-32-characters \
  --from-literal=ENCRYPTION_KEY=your-32-character-encryption-key \
  --from-literal=REDIS_PASSWORD=your-secure-redis-password

# Create TLS secrets (if using HTTPS)
kubectl create secret tls seraphc2-tls \
  --namespace=seraphc2 \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key
```

### 3. ConfigMaps

Create configuration maps:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: seraphc2-config
  namespace: seraphc2
data:
  NODE_ENV: "production"
  PORT: "3000"
  HOST: "0.0.0.0"
  DB_HOST: "postgres-service"
  DB_PORT: "5432"
  DB_NAME: "seraphc2"
  DB_USER: "seraphc2"
  REDIS_HOST: "redis-service"
  REDIS_PORT: "6379"
  LOG_LEVEL: "info"
  CORS_ORIGIN: "https://yourdomain.com"
  RATE_LIMIT_WINDOW_MS: "900000"
  RATE_LIMIT_MAX_REQUESTS: "100"
  ENABLE_METRICS: "true"
  METRICS_PORT: "9090"
EOF
```

### 4. Persistent Storage

Create persistent volume claims:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data-pvc
  namespace: seraphc2
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
  storageClassName: fast-ssd
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-data-pvc
  namespace: seraphc2
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: fast-ssd
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: seraphc2-uploads-pvc
  namespace: seraphc2
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 10Gi
  storageClassName: shared-storage
EOF
```

### 5. Deploy Database Services

Apply the database deployments:

```bash
# Deploy PostgreSQL and Redis
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

### 6. Deploy Application

Deploy the main SeraphC2 application:

```bash
# Apply the application deployment
kubectl apply -f k8s/deployment.yaml

# Wait for rollout to complete
kubectl rollout status deployment/seraphc2-app -n seraphc2
```

### 7. Configure Ingress

Set up ingress for external access:

```bash
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: seraphc2-ingress
  namespace: seraphc2
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  tls:
    - hosts:
        - seraphc2.yourdomain.com
      secretName: seraphc2-tls
  rules:
    - host: seraphc2.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: seraphc2-service
                port:
                  number: 80
EOF
```

## Helm Deployment

### 1. Using the Helm Chart

The SeraphC2 Helm chart provides a more flexible deployment option:

```bash
# Install with custom values
helm install seraphc2 ./helm/seraphc2 \
  --namespace seraphc2 \
  --create-namespace \
  --values values-production.yaml
```

### 2. Custom Values File

Create a `values-production.yaml` file:

```yaml
# Application configuration
app:
  replicaCount: 3
  image:
    repository: seraphc2
    tag: "1.0.0"
    pullPolicy: IfNotPresent
  
  resources:
    requests:
      memory: "1Gi"
      cpu: "500m"
    limits:
      memory: "2Gi"
      cpu: "1000m"
  
  # Security configuration
  jwtSecret: "your-jwt-secret-minimum-32-characters"
  encryptionKey: "your-32-character-encryption-key"
  
  # Environment-specific settings
  corsOrigin: "https://seraphc2.yourdomain.com"
  logLevel: "info"

# Database configuration
postgresql:
  enabled: true
  auth:
    postgresPassword: "your-secure-postgres-password"
    username: "seraphc2"
    password: "your-secure-database-password"
    database: "seraphc2"
  
  primary:
    persistence:
      enabled: true
      size: 20Gi
      storageClass: "fast-ssd"
  
  resources:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "1Gi"
      cpu: "500m"

# Redis configuration
redis:
  enabled: true
  auth:
    enabled: true
    password: "your-secure-redis-password"
  
  master:
    persistence:
      enabled: true
      size: 5Gi
      storageClass: "fast-ssd"
  
  resources:
    requests:
      memory: "256Mi"
      cpu: "100m"
    limits:
      memory: "512Mi"
      cpu: "250m"

# Ingress configuration
ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: seraphc2.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: seraphc2-tls
      hosts:
        - seraphc2.yourdomain.com

# Monitoring
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
  prometheusRule:
    enabled: true
```

### 3. Helm Operations

```bash
# Upgrade deployment
helm upgrade seraphc2 ./helm/seraphc2 \
  --namespace seraphc2 \
  --values values-production.yaml

# Check status
helm status seraphc2 -n seraphc2

# Rollback if needed
helm rollback seraphc2 1 -n seraphc2

# Uninstall
helm uninstall seraphc2 -n seraphc2
```

## High Availability Configuration

### 1. Multi-Zone Deployment

Configure pod anti-affinity for high availability:

```yaml
spec:
  template:
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app.kubernetes.io/name
                  operator: In
                  values:
                  - seraphc2
              topologyKey: kubernetes.io/hostname
```

### 2. Database High Availability

For production, consider using managed database services:

**AWS RDS:**
```yaml
# Update ConfigMap to point to RDS endpoint
data:
  DB_HOST: "seraphc2-prod.cluster-xyz.us-west-2.rds.amazonaws.com"
  DB_SSL: "true"
```

**Google Cloud SQL:**
```yaml
data:
  DB_HOST: "10.1.2.3"  # Private IP
  DB_SSL: "true"
```

### 3. Redis High Availability

Deploy Redis in cluster mode:

```bash
helm install redis bitnami/redis-cluster \
  --namespace seraphc2 \
  --set auth.enabled=true \
  --set auth.password=your-redis-password \
  --set cluster.nodes=6 \
  --set cluster.replicas=1
```

## Monitoring and Observability

### 1. Prometheus Monitoring

Deploy Prometheus monitoring:

```bash
# Install Prometheus Operator
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace
```

### 2. ServiceMonitor Configuration

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: seraphc2-metrics
  namespace: seraphc2
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: seraphc2
  endpoints:
  - port: metrics
    path: /metrics
    interval: 30s
```

### 3. Grafana Dashboards

Import SeraphC2 Grafana dashboards for visualization.

## Security Hardening

### 1. Network Policies

Implement network segmentation:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: seraphc2-network-policy
  namespace: seraphc2
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: seraphc2
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app.kubernetes.io/name: postgres
    ports:
    - protocol: TCP
      port: 5432
```

### 2. Pod Security Standards

Apply pod security standards:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: seraphc2
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### 3. RBAC Configuration

Create service accounts with minimal permissions:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: seraphc2-sa
  namespace: seraphc2
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: seraphc2-role
  namespace: seraphc2
rules:
- apiGroups: [""]
  resources: ["configmaps", "secrets"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: seraphc2-rolebinding
  namespace: seraphc2
subjects:
- kind: ServiceAccount
  name: seraphc2-sa
  namespace: seraphc2
roleRef:
  kind: Role
  name: seraphc2-role
  apiGroup: rbac.authorization.k8s.io
```

## Scaling and Performance

### 1. Horizontal Pod Autoscaler

Configure automatic scaling:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: seraphc2-hpa
  namespace: seraphc2
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: seraphc2-app
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 2. Vertical Pod Autoscaler

Install VPA for resource optimization:

```bash
# Install VPA
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/download/vertical-pod-autoscaler-0.13.0/vpa-release-0.13.0-yaml.tar.gz
```

### 3. Cluster Autoscaler

Configure cluster-level scaling based on your cloud provider.

## Backup and Disaster Recovery

### 1. Database Backups

Set up automated database backups:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: seraphc2
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: postgres-backup
            image: postgres:15-alpine
            command:
            - /bin/bash
            - -c
            - |
              pg_dump -h postgres-service -U seraphc2 seraphc2 | \
              gzip > /backup/seraphc2-$(date +%Y%m%d-%H%M%S).sql.gz
            env:
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secrets
                  key: POSTGRES_PASSWORD
            volumeMounts:
            - name: backup-storage
              mountPath: /backup
          volumes:
          - name: backup-storage
            persistentVolumeClaim:
              claimName: backup-pvc
          restartPolicy: OnFailure
```

### 2. Velero Backup

Install Velero for cluster-wide backups:

```bash
# Install Velero
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.6.0 \
  --bucket seraphc2-backups \
  --backup-location-config region=us-west-2 \
  --snapshot-location-config region=us-west-2
```

## Troubleshooting

### Common Issues

**Pods Not Starting:**
```bash
# Check pod status
kubectl describe pod <pod-name> -n seraphc2

# Check events
kubectl get events -n seraphc2 --sort-by='.lastTimestamp'

# Check logs
kubectl logs <pod-name> -n seraphc2 --previous
```

**Database Connection Issues:**
```bash
# Test database connectivity
kubectl exec -it deployment/seraphc2-app -n seraphc2 -- nc -zv postgres-service 5432

# Check database logs
kubectl logs deployment/postgres -n seraphc2
```

**Ingress Issues:**
```bash
# Check ingress status
kubectl describe ingress seraphc2-ingress -n seraphc2

# Check ingress controller logs
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller
```

### Performance Issues

**Resource Constraints:**
```bash
# Check resource usage
kubectl top pods -n seraphc2
kubectl top nodes

# Check resource limits
kubectl describe pod <pod-name> -n seraphc2 | grep -A 5 Limits
```

**Storage Issues:**
```bash
# Check PVC status
kubectl get pvc -n seraphc2

# Check storage class
kubectl get storageclass
```

## Production Checklist

Before deploying to production:

- [ ] Configure resource limits and requests
- [ ] Set up monitoring and alerting
- [ ] Configure automated backups
- [ ] Implement network policies
- [ ] Set up RBAC with minimal permissions
- [ ] Configure TLS/SSL certificates
- [ ] Set up log aggregation
- [ ] Configure autoscaling
- [ ] Test disaster recovery procedures
- [ ] Set up CI/CD pipelines
- [ ] Configure secrets management
- [ ] Implement security scanning
- [ ] Set up performance monitoring
- [ ] Configure health checks
- [ ] Test rolling updates

## Next Steps

After successful Kubernetes deployment:

1. Set up [monitoring and alerting](../operations/monitoring.md)
2. Configure [CI/CD pipelines](../operations/cicd.md)
3. Implement [backup strategies](../operations/backup.md)
4. Review [security hardening](../configuration/security.md)
5. Set up [disaster recovery](../operations/disaster-recovery.md)
6. Configure [performance tuning](../operations/performance.md)

For advanced configurations, see the [Production Deployment Best Practices](production.md) guide.