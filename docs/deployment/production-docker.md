# SeraphC2 Production Deployment with Docker

This guide covers deploying SeraphC2 in production using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+ 
- Docker Compose 2.0+
- At least 4GB RAM
- At least 20GB disk space
- SSL certificates (optional, self-signed will be generated)

## Quick Start

1. **Clone the repository and navigate to the project directory**
   ```bash
   git clone <repository-url>
   cd seraphc2
   ```

2. **Create production environment configuration**
   ```bash
   cp .env.production.example .env.production
   ```

3. **Edit the production environment file**
   ```bash
   nano .env.production
   ```
   
   **Critical settings to change:**
   - `DB_PASSWORD`: Strong database password
   - `REDIS_PASSWORD`: Strong Redis password  
   - `JWT_SECRET`: At least 64 character random string
   - `ENCRYPTION_KEY`: Exactly 32 character random string
   - `CORS_ORIGIN`: Your domain (e.g., https://yourdomain.com)

4. **Deploy using the deployment script**
   ```bash
   ./scripts/deploy-production.sh deploy
   ```

## Manual Deployment

If you prefer manual deployment:

1. **Build and start services**
   ```bash
   docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```

2. **Check service status**
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   ```

3. **View logs**
   ```bash
   docker-compose -f docker-compose.prod.yml logs -f
   ```

## Configuration

### Environment Variables

Key production environment variables:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DB_PASSWORD` | PostgreSQL password | Yes | - |
| `REDIS_PASSWORD` | Redis password | Yes | - |
| `JWT_SECRET` | JWT signing secret (64+ chars) | Yes | - |
| `ENCRYPTION_KEY` | Data encryption key (32 chars) | Yes | - |
| `CORS_ORIGIN` | Allowed CORS origins | Yes | * |
| `LOG_LEVEL` | Logging level | No | info |
| `PORT` | Application port | No | 3000 |
| `HTTPS_PORT` | HTTPS port | No | 8443 |

### SSL Certificates

For production use, replace the self-signed certificates:

1. **Place your SSL certificates**
   ```bash
   cp your-certificate.crt docker/nginx/ssl/server.crt
   cp your-private-key.key docker/nginx/ssl/server.key
   ```

2. **Restart nginx**
   ```bash
   docker-compose -f docker-compose.prod.yml restart nginx
   ```

### Database Configuration

The production setup uses PostgreSQL with the following optimizations:

- Connection pooling (2-10 connections)
- Read-only filesystem for security
- Health checks with proper timeouts
- Resource limits (1GB RAM, 0.5 CPU)

### Redis Configuration

Production Redis configuration includes:

- Password authentication
- Memory limits (256MB)
- Persistence enabled
- Dangerous commands disabled
- Performance optimizations

## Security Features

### Container Security

- **Non-root user**: Application runs as non-root user (UID 1001)
- **Read-only filesystem**: Containers use read-only root filesystem
- **No new privileges**: Prevents privilege escalation
- **Resource limits**: CPU and memory limits enforced
- **Security options**: Additional security constraints

### Network Security

- **Internal networking**: Services communicate on isolated network
- **Port binding**: Database ports bound to localhost only
- **SSL/TLS**: HTTPS enforced with security headers
- **Rate limiting**: API and authentication endpoints rate limited

### Application Security

- **Environment validation**: Configuration validated at startup
- **Secrets management**: Sensitive data via environment variables
- **Security headers**: Comprehensive HTTP security headers
- **CORS configuration**: Configurable cross-origin policies

## Monitoring and Health Checks

### Health Endpoints

- **Application**: `https://yourdomain.com/health`
- **Database**: Built-in PostgreSQL health checks
- **Redis**: Built-in Redis health checks
- **Nginx**: HTTP health check endpoint

### Logging

Logs are available via Docker Compose:

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f seraphc2-server

# Application logs (if volume mounted)
tail -f logs/seraphc2.log
```

### Metrics

If metrics are enabled (`ENABLE_METRICS=true`):

- **Metrics endpoint**: `http://localhost:9090/metrics`
- **Format**: Prometheus-compatible metrics
- **Data**: Application performance and business metrics

## Backup and Recovery

### Automated Backup

The deployment script includes backup functionality:

```bash
# Create backup
./scripts/deploy-production.sh backup

# Deploy with backup
./scripts/deploy-production.sh deploy

# Deploy without backup
./scripts/deploy-production.sh deploy --skip-backup
```

### Manual Backup

1. **Database backup**
   ```bash
   docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U seraphc2 seraphc2 > backup.sql
   ```

2. **Volume backup**
   ```bash
   docker run --rm -v seraphc2_postgres_data_prod:/data -v $(pwd):/backup alpine tar czf /backup/postgres_data.tar.gz /data
   ```

### Recovery

1. **Database restore**
   ```bash
   docker-compose -f docker-compose.prod.yml exec -T postgres psql -U seraphc2 -d seraphc2 < backup.sql
   ```

2. **Volume restore**
   ```bash
   docker run --rm -v seraphc2_postgres_data_prod:/data -v $(pwd):/backup alpine tar xzf /backup/postgres_data.tar.gz -C /
   ```

## Scaling and Performance

### Horizontal Scaling

To scale the application:

```bash
docker-compose -f docker-compose.prod.yml up -d --scale seraphc2-server=3
```

### Performance Tuning

1. **Database connections**: Adjust `DB_POOL_MIN` and `DB_POOL_MAX`
2. **Redis memory**: Modify `maxmemory` in Redis configuration
3. **Worker processes**: Set `WORKER_PROCESSES` for multi-core systems
4. **Resource limits**: Adjust Docker resource limits based on hardware

## Troubleshooting

### Common Issues

1. **Services not starting**
   ```bash
   # Check logs
   docker-compose -f docker-compose.prod.yml logs
   
   # Check service status
   docker-compose -f docker-compose.prod.yml ps
   ```

2. **Database connection issues**
   ```bash
   # Test database connectivity
   docker-compose -f docker-compose.prod.yml exec postgres pg_isready -U seraphc2
   ```

3. **SSL certificate issues**
   ```bash
   # Check certificate validity
   openssl x509 -in docker/nginx/ssl/server.crt -text -noout
   ```

4. **Permission issues**
   ```bash
   # Fix log directory permissions
   sudo chown -R 1001:1001 logs/
   ```

### Performance Issues

1. **High memory usage**
   - Check Docker stats: `docker stats`
   - Adjust resource limits in docker-compose.prod.yml
   - Monitor application metrics

2. **Slow database queries**
   - Enable PostgreSQL slow query log
   - Check database connections and pooling
   - Monitor database performance

3. **Network connectivity**
   - Check nginx configuration
   - Verify firewall settings
   - Test internal service communication

## Maintenance

### Updates

1. **Pull latest changes**
   ```bash
   git pull origin main
   ```

2. **Rebuild and deploy**
   ```bash
   ./scripts/deploy-production.sh deploy
   ```

### Log Rotation

Configure log rotation for persistent logs:

```bash
# Add to /etc/logrotate.d/seraphc2
/path/to/seraphc2/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 1001 1001
}
```

### Security Updates

1. **Update base images regularly**
   ```bash
   docker-compose -f docker-compose.prod.yml pull
   docker-compose -f docker-compose.prod.yml up -d
   ```

2. **Monitor security advisories**
   - Subscribe to security mailing lists
   - Use automated vulnerability scanning
   - Keep dependencies updated

## Support

For production deployment support:

1. Check the [troubleshooting guide](../troubleshooting/common-issues.md)
2. Review application logs for error details
3. Consult the [configuration reference](../configuration/environment.md)
4. Open an issue with deployment details and logs