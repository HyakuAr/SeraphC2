# SeraphC2 Monitoring Infrastructure

This directory contains the complete monitoring and alerting infrastructure for SeraphC2, including Prometheus for metrics collection, Grafana for visualization, Alertmanager for alert routing, and Loki/Promtail for log aggregation.

## Components

### Prometheus
- **Purpose**: Metrics collection and storage
- **Port**: 9090
- **Configuration**: `prometheus.yml`
- **Alerts**: `alerts.yml`

### Grafana
- **Purpose**: Metrics visualization and dashboards
- **Port**: 3001 (to avoid conflict with SeraphC2 on 3000)
- **Configuration**: `grafana/grafana.ini`
- **Dashboards**: `grafana/dashboards/`

### Alertmanager
- **Purpose**: Alert routing and notification
- **Port**: 9093
- **Configuration**: `alertmanager.yml`

### Loki
- **Purpose**: Log aggregation and storage
- **Port**: 3100
- **Configuration**: `loki.yml`

### Promtail
- **Purpose**: Log collection and forwarding to Loki
- **Configuration**: `promtail.yml`

### Exporters
- **Node Exporter**: System metrics (port 9100)
- **PostgreSQL Exporter**: Database metrics (port 9187)
- **Redis Exporter**: Redis metrics (port 9121)

## Quick Start

### 1. Environment Setup

Create a `.env` file in the monitoring directory:

```bash
# Grafana Configuration
GRAFANA_ADMIN_PASSWORD=your_secure_password
GRAFANA_SECRET_KEY=your_secret_key

# Database Connection for PostgreSQL Exporter
POSTGRES_EXPORTER_DSN=postgresql://seraphc2:password@postgres:5432/seraphc2?sslmode=disable

# Redis Connection for Redis Exporter
REDIS_ADDR=redis://redis:6379
REDIS_PASSWORD=

# Alert Email Configuration
ALERT_EMAIL_CRITICAL=admin@seraphc2.local
ALERT_EMAIL_SECURITY=security@seraphc2.local
ALERT_EMAIL_DATABASE=dba@seraphc2.local
ALERT_EMAIL_APPLICATION=ops@seraphc2.local

# Webhook URLs for Alert Integration
WEBHOOK_URL_CRITICAL=http://127.0.0.1:5001/critical
WEBHOOK_URL_SECURITY=http://127.0.0.1:5001/security
WEBHOOK_URL_DATABASE=http://127.0.0.1:5001/database
WEBHOOK_URL_APPLICATION=http://127.0.0.1:5001/application

# Slack Integration (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

### 2. Start Monitoring Stack

```bash
# Start the monitoring stack
docker-compose -f docker-compose.monitoring.yml up -d

# Check status
docker-compose -f docker-compose.monitoring.yml ps

# View logs
docker-compose -f docker-compose.monitoring.yml logs -f
```

### 3. Access Services

- **Grafana**: http://localhost:3001 (admin/your_password)
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

## Dashboards

### SeraphC2 Overview Dashboard
- HTTP request rates and response times
- Success rates and error rates
- CPU and memory usage
- Active connections and implants

### Security Dashboard
- Failed login attempts
- Suspicious activity detection
- Unauthorized access attempts
- Authentication status

### Infrastructure Dashboard
- System resource usage (CPU, memory, disk)
- Network I/O
- Database connection usage
- Redis memory usage

## Alerts

### Application Alerts
- **SeraphC2Down**: Application is not responding
- **SeraphC2HighErrorRate**: High HTTP error rate (>10%)
- **SeraphC2HighResponseTime**: 95th percentile response time >2s
- **SeraphC2HighCPUUsage**: CPU usage >80%
- **SeraphC2HighMemoryUsage**: Memory usage >2GB

### Security Alerts
- **SeraphC2FailedLogins**: High failed login attempts (>10/sec)
- **SeraphC2SuspiciousActivity**: Suspicious requests detected (>5/sec)
- **SeraphC2UnauthorizedAccess**: Unauthorized access attempts (>1/sec)

### Infrastructure Alerts
- **HighCPUUsage**: System CPU usage >85%
- **HighMemoryUsage**: System memory usage >90%
- **DiskSpaceLow**: Disk usage >85%
- **DiskSpaceCritical**: Disk usage >95%

### Database Alerts
- **PostgreSQLDown**: Database is not responding
- **PostgreSQLHighConnections**: Connection usage >80%
- **RedisDown**: Redis is not responding
- **RedisHighMemoryUsage**: Redis memory usage >90%

## Configuration

### Adding Custom Metrics

To add custom metrics to your SeraphC2 application:

1. Install a metrics library (e.g., `prom-client` for Node.js)
2. Add metrics endpoints to your application
3. Update `prometheus.yml` to scrape your new endpoints
4. Create custom dashboards in Grafana

### Customizing Alerts

1. Edit `alerts.yml` to add new alert rules
2. Update `alertmanager.yml` to configure notification routing
3. Restart Prometheus and Alertmanager

### Log Collection

Promtail is configured to collect logs from:
- SeraphC2 application logs
- System logs
- Docker container logs
- PostgreSQL logs
- Redis logs
- Nginx logs (if applicable)

## Production Considerations

### Security
- Change default passwords
- Use TLS/SSL for external access
- Implement proper authentication
- Restrict network access

### Scalability
- Use external storage for Prometheus (e.g., Thanos)
- Implement Grafana clustering
- Use external databases for Grafana

### Backup
- Backup Prometheus data regularly
- Backup Grafana dashboards and configuration
- Backup alert rules and configuration

### High Availability
- Deploy multiple Prometheus instances
- Use Alertmanager clustering
- Implement load balancing

## Troubleshooting

### Common Issues

1. **Metrics not appearing**: Check Prometheus targets page
2. **Alerts not firing**: Verify alert rules syntax
3. **Dashboards not loading**: Check Grafana logs
4. **High resource usage**: Adjust retention policies

### Useful Commands

```bash
# Check Prometheus configuration
docker exec seraphc2-prometheus promtool check config /etc/prometheus/prometheus.yml

# Reload Prometheus configuration
curl -X POST http://localhost:9090/-/reload

# Check Alertmanager configuration
docker exec seraphc2-alertmanager amtool check-config /etc/alertmanager/alertmanager.yml

# View Grafana logs
docker logs seraphc2-grafana

# Test alert rules
docker exec seraphc2-prometheus promtool query instant 'up{job="seraphc2-app"}'
```

## Integration with SeraphC2

To integrate monitoring with your SeraphC2 application:

1. Add metrics endpoints to your application
2. Implement structured logging
3. Add health check endpoints
4. Configure log rotation
5. Set up custom alerts for business metrics

For detailed integration instructions, see the main SeraphC2 documentation.