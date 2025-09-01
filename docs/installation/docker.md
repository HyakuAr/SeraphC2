# Docker Deployment Guide

This guide covers deploying SeraphC2 using Docker and Docker Compose for both development and production environments.

## Prerequisites

### Required Software

- **Docker** (version 20.0 or higher)
  - Download from [docker.com](https://www.docker.com/products/docker-desktop)
  - Verify installation: `docker --version`
- **Docker Compose** (version 2.0 or higher)
  - Usually included with Docker Desktop
  - Verify installation: `docker-compose --version`

### System Requirements

**Minimum Requirements:**
- CPU: 2 cores
- RAM: 4GB
- Storage: 20GB free space
- Network: Internet access for image downloads

**Recommended for Production:**
- CPU: 4+ cores
- RAM: 8GB+
- Storage: 50GB+ SSD
- Network: Stable internet connection

## Development Deployment

### Quick Start

1. **Clone the repository:**
```bash
git clone https://github.com/your-org/seraphc2.git
cd seraphc2
```

2. **Start all services:**
```bash
docker-compose up -d
```

This will start:
- PostgreSQL database
- Redis cache
- SeraphC2 application server
- Nginx reverse proxy (optional)

3. **Verify deployment:**
```bash
# Check running containers
docker-compose ps

# View logs
docker-compose logs -f seraphc2-server
```

4. **Access the application:**
- Web Interface: http://localhost:3000
- API: http://localhost:3000/api
- Health Check: http://localhost:3000/health

### Development Configuration

The development Docker Compose setup includes:

```yaml
# Key services from docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: seraphc2
      POSTGRES_USER: seraphc2
      POSTGRES_PASSWORD: seraphc2_dev_password

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

  seraphc2-server:
    build:
      context: .
      dockerfile: docker/server/Dockerfile.dev
    ports:
      - '3000:3000'
      - '8080:8080'
      - '8443:8443'
    volumes:
      - .:/app
      - /app/node_modules
```

### Development Commands

```bash
# Start all services
docker-compose up -d

# Start with logs visible
docker-compose up

# Stop all services
docker-compose down

# Rebuild and start
docker-compose up --build -d

# View logs
docker-compose logs -f [service-name]

# Execute commands in container
docker-compose exec seraphc2-server npm test

# Access database
docker-compose exec postgres psql -U seraphc2 -d seraphc2
```

## Production Deployment

### Environment Setup

1. **Create production environment file:**
```bash
cp .env.production.example .env.production
```

2. **Configure production variables:**
```bash
# Database Configuration
DB_PASSWORD=your_secure_database_password
REDIS_PASSWORD=your_secure_redis_password

# Security Configuration
JWT_SECRET=your_jwt_secret_minimum_32_characters_long
ENCRYPTION_KEY=your_32_character_encryption_key

# Application Configuration
CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=info

# SSL Configuration (if using HTTPS)
SSL_CERT_PATH=/path/to/ssl/cert.pem
SSL_KEY_PATH=/path/to/ssl/private.key
```

### Production Deployment

1. **Deploy using production compose file:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

2. **Verify deployment:**
```bash
# Check container health
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Test health endpoint
curl http://localhost:3000/health
```

### Production Configuration Features

The production setup includes:

- **Security hardening:**
  - Non-root user execution
  - Read-only root filesystem
  - No new privileges
  - Resource limits

- **Performance optimization:**
  - Multi-stage builds
  - Optimized images
  - Resource constraints
  - Health checks

- **Monitoring:**
  - Health check endpoints
  - Metrics collection
  - Structured logging

## SSL/TLS Configuration

### Using Let's Encrypt with Nginx

1. **Install Certbot:**
```bash
# On the host system
sudo apt-get install certbot python3-certbot-nginx
```

2. **Generate certificates:**
```bash
sudo certbot --nginx -d yourdomain.com
```

3. **Update nginx configuration:**
```bash
# Mount certificates in docker-compose.prod.yml
volumes:
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

### Using Custom Certificates

1. **Place certificates in the ssl directory:**
```bash
mkdir -p docker/nginx/ssl
cp your-cert.pem docker/nginx/ssl/
cp your-key.pem docker/nginx/ssl/
```

2. **Update nginx configuration:**
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/nginx/ssl/your-cert.pem;
    ssl_certificate_key /etc/nginx/ssl/your-key.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
}
```

## Data Persistence

### Volume Management

The Docker setup uses named volumes for data persistence:

```yaml
volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  seraphc2_uploads:
    driver: local
```

### Backup and Restore

**Database Backup:**
```bash
# Create backup
docker-compose exec postgres pg_dump -U seraphc2 seraphc2 > backup.sql

# Restore backup
docker-compose exec -T postgres psql -U seraphc2 seraphc2 < backup.sql
```

**Volume Backup:**
```bash
# Backup volumes
docker run --rm -v seraphc2_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz -C /data .

# Restore volumes
docker run --rm -v seraphc2_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres_backup.tar.gz -C /data
```

## Monitoring and Logging

### Container Logs

```bash
# View all logs
docker-compose logs

# Follow logs for specific service
docker-compose logs -f seraphc2-server

# View last 100 lines
docker-compose logs --tail=100 seraphc2-server
```

### Health Monitoring

```bash
# Check container health
docker-compose ps

# Inspect container health
docker inspect seraphc2-server-prod | grep -A 10 Health
```

### Resource Monitoring

```bash
# Monitor resource usage
docker stats

# Monitor specific container
docker stats seraphc2-server-prod
```

## Scaling and Load Balancing

### Horizontal Scaling

Scale the application containers:

```bash
# Scale to 3 instances
docker-compose -f docker-compose.prod.yml up -d --scale seraphc2-server=3

# Verify scaling
docker-compose -f docker-compose.prod.yml ps
```

### Load Balancer Configuration

Update nginx configuration for load balancing:

```nginx
upstream seraphc2_backend {
    server seraphc2-server-1:3000;
    server seraphc2-server-2:3000;
    server seraphc2-server-3:3000;
}

server {
    location / {
        proxy_pass http://seraphc2_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Troubleshooting

### Common Issues

**Container Won't Start:**
```bash
# Check container logs
docker-compose logs seraphc2-server

# Check container status
docker-compose ps

# Inspect container
docker inspect seraphc2-server
```

**Database Connection Issues:**
```bash
# Test database connectivity
docker-compose exec seraphc2-server nc -zv postgres 5432

# Check database logs
docker-compose logs postgres
```

**Permission Issues:**
```bash
# Fix volume permissions
docker-compose exec seraphc2-server chown -R 1001:1001 /app/logs
```

**Out of Memory:**
```bash
# Check memory usage
docker stats

# Increase memory limits in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 4G
```

### Performance Optimization

**Image Optimization:**
```bash
# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove unused networks
docker network prune
```

**Build Optimization:**
```bash
# Use build cache
docker-compose build --parallel

# Multi-stage builds (already implemented)
# See docker/server/Dockerfile.prod
```

## Security Considerations

### Container Security

- Containers run as non-root users
- Read-only root filesystems where possible
- Minimal base images (Alpine Linux)
- No unnecessary capabilities
- Resource limits enforced

### Network Security

- Internal network isolation
- Exposed ports minimized
- TLS encryption for external traffic
- Secrets management via Docker secrets

### Regular Maintenance

```bash
# Update base images
docker-compose pull
docker-compose up -d

# Security scanning
docker scan seraphc2:latest

# Remove old images
docker image prune -a --filter "until=24h"
```

## Production Checklist

Before deploying to production:

- [ ] Configure strong passwords and secrets
- [ ] Set up SSL/TLS certificates
- [ ] Configure firewall rules
- [ ] Set up monitoring and alerting
- [ ] Configure log rotation
- [ ] Set up automated backups
- [ ] Test disaster recovery procedures
- [ ] Configure resource limits
- [ ] Set up health checks
- [ ] Review security settings

## Next Steps

After successful Docker deployment:

1. Configure [monitoring and alerting](../configuration/monitoring.md)
2. Set up [backup procedures](../operations/backup.md)
3. Review [security hardening](../configuration/security.md)
4. Configure [load balancing](../operations/scaling.md) if needed
5. Set up [CI/CD pipelines](../operations/cicd.md) for automated deployments

For Kubernetes deployment, see the [Kubernetes Deployment Guide](kubernetes.md).