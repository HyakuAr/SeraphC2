# Production Deployment Best Practices

This guide provides comprehensive best practices for deploying SeraphC2 in production environments, covering security, performance, monitoring, and operational considerations.

## Pre-Deployment Planning

### Infrastructure Assessment

**Capacity Planning:**
- Estimate concurrent users and sessions
- Calculate storage requirements for logs and data
- Plan network bandwidth requirements
- Assess backup and disaster recovery needs

**Security Requirements:**
- Define network segmentation requirements
- Identify compliance requirements (SOC2, ISO27001, etc.)
- Plan certificate management strategy
- Define access control policies

**Operational Requirements:**
- Define SLA requirements (uptime, response time)
- Plan monitoring and alerting strategy
- Define backup and recovery procedures
- Plan maintenance windows

### Environment Architecture

**Recommended Production Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer / CDN                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                  Reverse Proxy (Nginx)                     │
│                    - SSL Termination                       │
│                    - Rate Limiting                         │
│                    - Request Routing                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│              Application Tier (Multiple Instances)         │
│                    - SeraphC2 Servers                      │
│                    - Auto-scaling                          │
│                    - Health Checks                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                    Data Tier                               │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   PostgreSQL    │    │      Redis      │                │
│  │   (Primary +    │    │   (Cluster)     │                │
│  │   Read Replica) │    │                 │                │
│  └─────────────────┘    └─────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## Security Hardening

### Network Security

**Firewall Configuration:**
```bash
# Allow only necessary ports
# HTTP/HTTPS traffic
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# SSH (restrict to management networks)
iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/8 -j ACCEPT

# Database (internal only)
iptables -A INPUT -p tcp --dport 5432 -s 10.0.0.0/8 -j ACCEPT

# Redis (internal only)
iptables -A INPUT -p tcp --dport 6379 -s 10.0.0.0/8 -j ACCEPT

# Drop all other traffic
iptables -A INPUT -j DROP
```

**TLS/SSL Configuration:**
```nginx
# Nginx SSL configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

# HSTS
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Security headers
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

### Application Security

**Environment Variables:**
```bash
# Production environment configuration
NODE_ENV=production
LOG_LEVEL=warn

# Strong secrets (minimum requirements)
JWT_SECRET=your-jwt-secret-minimum-32-characters-long-and-random
ENCRYPTION_KEY=your-32-character-encryption-key-random

# Database security
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# Session security
SESSION_TIMEOUT=3600  # 1 hour
SECURE_COOKIES=true
SAME_SITE_COOKIES=strict

# File upload limits
MAX_FILE_SIZE=10485760  # 10MB
ALLOWED_FILE_TYPES=pdf,txt,log,json
```

**Database Security:**
```sql
-- Create dedicated database user with minimal privileges
CREATE USER seraphc2_app WITH PASSWORD 'strong-random-password';
GRANT CONNECT ON DATABASE seraphc2 TO seraphc2_app;
GRANT USAGE ON SCHEMA public TO seraphc2_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO seraphc2_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO seraphc2_app;

-- Enable SSL
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET ssl_cert_file = '/path/to/server.crt';
ALTER SYSTEM SET ssl_key_file = '/path/to/server.key';

-- Configure authentication
# In pg_hba.conf
hostssl seraphc2 seraphc2_app 0.0.0.0/0 md5
```

### Secrets Management

**Using HashiCorp Vault:**
```bash
# Store secrets in Vault
vault kv put secret/seraphc2/prod \
  jwt_secret="your-jwt-secret" \
  encryption_key="your-encryption-key" \
  db_password="your-db-password"

# Retrieve secrets in application
export VAULT_ADDR="https://vault.yourdomain.com"
export VAULT_TOKEN="your-vault-token"
```

**Using AWS Secrets Manager:**
```bash
# Store secrets
aws secretsmanager create-secret \
  --name "seraphc2/prod/database" \
  --description "SeraphC2 Production Database Credentials" \
  --secret-string '{"username":"seraphc2","password":"your-secure-password"}'
```

## Performance Optimization

### Application Performance

**Node.js Optimization:**
```javascript
// Production optimizations in package.json
{
  "scripts": {
    "start:prod": "NODE_ENV=production node --max-old-space-size=2048 dist/index.js"
  }
}
```

**Database Optimization:**
```sql
-- PostgreSQL performance tuning
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

-- Create indexes for common queries
CREATE INDEX CONCURRENTLY idx_sessions_user_id ON sessions(user_id);
CREATE INDEX CONCURRENTLY idx_audit_logs_timestamp ON audit_logs(created_at);
CREATE INDEX CONCURRENTLY idx_implants_status ON implants(status);
```

**Redis Optimization:**
```bash
# Redis configuration for production
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### Load Balancing

**Nginx Load Balancer Configuration:**
```nginx
upstream seraphc2_backend {
    least_conn;
    server 10.0.1.10:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name seraphc2.yourdomain.com;
    
    location / {
        proxy_pass http://seraphc2_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://seraphc2_backend;
    }
}
```

## Monitoring and Observability

### Application Monitoring

**Prometheus Metrics Configuration:**
```javascript
// metrics.js
const prometheus = require('prom-client');

// Custom metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const activeConnections = new prometheus.Gauge({
  name: 'seraphc2_active_connections',
  help: 'Number of active connections'
});

const databaseConnections = new prometheus.Gauge({
  name: 'seraphc2_database_connections',
  help: 'Number of database connections'
});
```

**Health Check Implementation:**
```javascript
// health.js
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {}
  };

  try {
    // Database health check
    await db.query('SELECT 1');
    health.checks.database = 'healthy';
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'unhealthy';
  }

  try {
    // Redis health check
    await redis.ping();
    health.checks.redis = 'healthy';
  } catch (error) {
    health.checks.redis = 'unhealthy';
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

### Log Management

**Structured Logging Configuration:**
```javascript
// logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'seraphc2',
    environment: process.env.NODE_ENV
  },
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
});

// Don't log to console in production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

**Log Rotation with Logrotate:**
```bash
# /etc/logrotate.d/seraphc2
/var/log/seraphc2/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 seraphc2 seraphc2
    postrotate
        systemctl reload seraphc2
    endscript
}
```

### Alerting

**Prometheus Alerting Rules:**
```yaml
# alerts.yml
groups:
- name: seraphc2
  rules:
  - alert: SeraphC2Down
    expr: up{job="seraphc2"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "SeraphC2 instance is down"
      description: "SeraphC2 instance {{ $labels.instance }} has been down for more than 1 minute."

  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value }} errors per second."

  - alert: DatabaseConnectionsHigh
    expr: seraphc2_database_connections > 80
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "High database connection count"
      description: "Database connections: {{ $value }}"
```

## Backup and Disaster Recovery

### Database Backup Strategy

**Automated Backup Script:**
```bash
#!/bin/bash
# backup-database.sh

BACKUP_DIR="/var/backups/seraphc2"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="seraphc2"
DB_USER="seraphc2"
RETENTION_DAYS=30

# Create backup directory
mkdir -p $BACKUP_DIR

# Create database backup
pg_dump -h localhost -U $DB_USER -d $DB_NAME | gzip > $BACKUP_DIR/seraphc2_$DATE.sql.gz

# Upload to S3 (optional)
aws s3 cp $BACKUP_DIR/seraphc2_$DATE.sql.gz s3://seraphc2-backups/database/

# Clean up old backups
find $BACKUP_DIR -name "seraphc2_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Log backup completion
echo "$(date): Database backup completed: seraphc2_$DATE.sql.gz" >> /var/log/seraphc2-backup.log
```

**Cron Job Configuration:**
```bash
# Add to crontab
0 2 * * * /usr/local/bin/backup-database.sh
```

### Application Data Backup

**File System Backup:**
```bash
#!/bin/bash
# backup-files.sh

BACKUP_DIR="/var/backups/seraphc2"
DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR="/opt/seraphc2"

# Backup application files
tar -czf $BACKUP_DIR/seraphc2_files_$DATE.tar.gz \
  --exclude='node_modules' \
  --exclude='logs' \
  --exclude='tmp' \
  $APP_DIR

# Upload to S3
aws s3 cp $BACKUP_DIR/seraphc2_files_$DATE.tar.gz s3://seraphc2-backups/files/
```

### Disaster Recovery Plan

**Recovery Procedures:**

1. **Database Recovery:**
```bash
# Restore from backup
gunzip -c seraphc2_20231201_020000.sql.gz | psql -h localhost -U seraphc2 -d seraphc2
```

2. **Application Recovery:**
```bash
# Extract application files
tar -xzf seraphc2_files_20231201_020000.tar.gz -C /opt/

# Restore configuration
cp /var/backups/seraphc2/config/.env /opt/seraphc2/

# Restart services
systemctl restart seraphc2
```

3. **Verification:**
```bash
# Check application health
curl http://localhost:3000/health

# Verify database connectivity
npm run test:db
```

## Deployment Automation

### CI/CD Pipeline

**GitHub Actions Workflow:**
```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Build application
      run: npm run build
    
    - name: Build Docker image
      run: |
        docker build -f docker/server/Dockerfile.prod -t seraphc2:${{ github.ref_name }} .
        docker tag seraphc2:${{ github.ref_name }} seraphc2:latest
    
    - name: Deploy to production
      run: |
        # Deploy using your preferred method
        # Docker Compose, Kubernetes, etc.
        docker-compose -f docker-compose.prod.yml up -d
    
    - name: Health check
      run: |
        sleep 30
        curl -f http://localhost:3000/health
```

### Blue-Green Deployment

**Deployment Script:**
```bash
#!/bin/bash
# blue-green-deploy.sh

CURRENT_COLOR=$(docker-compose -f docker-compose.prod.yml ps --services --filter "status=running" | grep seraphc2 | head -1 | cut -d'-' -f2)
NEW_COLOR="blue"

if [ "$CURRENT_COLOR" = "blue" ]; then
    NEW_COLOR="green"
fi

echo "Current deployment: $CURRENT_COLOR"
echo "New deployment: $NEW_COLOR"

# Deploy new version
docker-compose -f docker-compose.$NEW_COLOR.yml up -d

# Health check
sleep 30
if curl -f http://localhost:3000/health; then
    echo "Health check passed, switching traffic"
    
    # Update load balancer to point to new deployment
    # This depends on your load balancer configuration
    
    # Stop old deployment
    docker-compose -f docker-compose.$CURRENT_COLOR.yml down
    
    echo "Deployment completed successfully"
else
    echo "Health check failed, rolling back"
    docker-compose -f docker-compose.$NEW_COLOR.yml down
    exit 1
fi
```

## Maintenance and Operations

### Regular Maintenance Tasks

**Weekly Maintenance Checklist:**
- [ ] Review application logs for errors
- [ ] Check disk space usage
- [ ] Verify backup integrity
- [ ] Review security alerts
- [ ] Update dependencies (security patches)
- [ ] Monitor performance metrics
- [ ] Review access logs for anomalies

**Monthly Maintenance Checklist:**
- [ ] Update operating system packages
- [ ] Review and rotate secrets
- [ ] Analyze performance trends
- [ ] Review and update documentation
- [ ] Test disaster recovery procedures
- [ ] Review user access and permissions
- [ ] Update SSL certificates if needed

### Performance Tuning

**Database Performance Monitoring:**
```sql
-- Monitor slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Monitor database connections
SELECT count(*) as connections,
       state,
       application_name
FROM pg_stat_activity
GROUP BY state, application_name;
```

**Application Performance Monitoring:**
```bash
# Monitor Node.js memory usage
node --inspect dist/index.js

# Monitor system resources
htop
iotop
nethogs
```

## Security Compliance

### Audit Logging

**Comprehensive Audit Trail:**
```javascript
// audit.js
const auditLog = (action, user, resource, details) => {
  logger.info('AUDIT', {
    timestamp: new Date().toISOString(),
    action,
    user: user.id,
    username: user.username,
    resource,
    details,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
};

// Usage examples
auditLog('LOGIN', user, 'authentication', { success: true });
auditLog('CREATE_IMPLANT', user, 'implant', { implantId: implant.id });
auditLog('DELETE_SESSION', user, 'session', { sessionId: session.id });
```

### Compliance Reporting

**Generate Compliance Reports:**
```bash
#!/bin/bash
# compliance-report.sh

REPORT_DATE=$(date +%Y%m%d)
REPORT_DIR="/var/reports/seraphc2"

mkdir -p $REPORT_DIR

# Generate access report
psql -h localhost -U seraphc2 -d seraphc2 -c "
COPY (
  SELECT created_at, username, action, resource, ip_address
  FROM audit_logs
  WHERE created_at >= NOW() - INTERVAL '30 days'
  ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER" > $REPORT_DIR/access_report_$REPORT_DATE.csv

# Generate security events report
grep -E "(FAILED_LOGIN|UNAUTHORIZED_ACCESS|SECURITY_VIOLATION)" /var/log/seraphc2/security.log > $REPORT_DIR/security_events_$REPORT_DATE.log

echo "Compliance reports generated in $REPORT_DIR"
```

## Production Checklist

### Pre-Deployment Checklist

**Infrastructure:**
- [ ] Load balancer configured and tested
- [ ] SSL certificates installed and valid
- [ ] Firewall rules configured
- [ ] DNS records configured
- [ ] Monitoring systems deployed
- [ ] Backup systems configured
- [ ] Log aggregation configured

**Security:**
- [ ] All secrets properly configured
- [ ] Database access restricted
- [ ] Network segmentation implemented
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] Audit logging enabled
- [ ] Vulnerability scanning completed

**Application:**
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Health checks implemented
- [ ] Performance testing completed
- [ ] Load testing completed
- [ ] Error handling tested
- [ ] Graceful shutdown implemented

**Operations:**
- [ ] Monitoring dashboards configured
- [ ] Alerting rules configured
- [ ] Runbooks documented
- [ ] Incident response procedures defined
- [ ] Backup procedures tested
- [ ] Disaster recovery plan tested
- [ ] On-call procedures established

### Post-Deployment Checklist

**Immediate (0-1 hour):**
- [ ] Verify all services are running
- [ ] Check health endpoints
- [ ] Verify database connectivity
- [ ] Test user authentication
- [ ] Check log output
- [ ] Verify monitoring data

**Short-term (1-24 hours):**
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify backup completion
- [ ] Review security logs
- [ ] Test key user workflows
- [ ] Monitor resource usage

**Medium-term (1-7 days):**
- [ ] Analyze performance trends
- [ ] Review user feedback
- [ ] Monitor capacity utilization
- [ ] Verify alerting is working
- [ ] Review and tune configurations
- [ ] Document any issues and resolutions

This comprehensive production deployment guide ensures that SeraphC2 is deployed securely, performantly, and maintainably in production environments. Regular review and updates of these practices are essential for maintaining a robust production system.