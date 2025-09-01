# Environment Configuration Reference

This document provides a comprehensive reference for all environment variables and configuration options available in SeraphC2.

## Configuration Overview

SeraphC2 uses environment variables for configuration, with different settings optimized for development, staging, and production environments. Configuration is loaded from:

1. Environment variables
2. `.env` files (in order of precedence):
   - `.env.local` (ignored by git)
   - `.env.{NODE_ENV}` (e.g., `.env.production`)
   - `.env`

## Environment Types

### NODE_ENV

The `NODE_ENV` variable determines the application's runtime environment and affects default configurations.

| Value | Description | Default Log Level | Security Features |
|-------|-------------|-------------------|-------------------|
| `development` | Local development | `debug` | Relaxed |
| `staging` | Pre-production testing | `info` | Enhanced |
| `production` | Production deployment | `warn` | Maximum |
| `test` | Automated testing | `error` | Minimal |

## Server Configuration

### Basic Server Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | `3000` | Primary HTTP server port |
| `HOST` | string | `localhost` | Server bind address |
| `HTTP_PORT` | number | `8080` | HTTP protocol handler port |
| `HTTPS_PORT` | number | `8443` | HTTPS protocol handler port |

**Examples:**
```bash
# Development
PORT=3000
HOST=localhost

# Production
PORT=3000
HOST=0.0.0.0
```

### CORS Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CORS_ORIGINS` | string | `*` | Comma-separated list of allowed origins |
| `CORS_CREDENTIALS` | boolean | `true` | Allow credentials in CORS requests |
| `CORS_MAX_AGE` | number | `86400` | CORS preflight cache duration (seconds) |

**Examples:**
```bash
# Development - allow all origins
CORS_ORIGINS=*

# Production - restrict to specific domains
CORS_ORIGINS=https://seraphc2.yourdomain.com,https://api.yourdomain.com

# Staging - allow staging domains
CORS_ORIGINS=https://staging.yourdomain.com,https://staging-api.yourdomain.com
```

### Request Logging

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_REQUEST_LOGGING` | boolean | `false` | Enable HTTP request logging |
| `REQUEST_LOG_FORMAT` | string | `combined` | Log format (combined, common, dev, short, tiny) |

## Database Configuration

### PostgreSQL Connection

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_HOST` | string | `localhost` | PostgreSQL server hostname |
| `DB_PORT` | number | `5432` | PostgreSQL server port |
| `DB_NAME` | string | `seraphc2` | Database name |
| `DB_USER` | string | `seraphc2` | Database username |
| `DB_PASSWORD` | string | **required** | Database password |
| `DB_SSL` | boolean | `false` | Enable SSL/TLS for database connections |
| `DB_SSL_REJECT_UNAUTHORIZED` | boolean | `true` | Reject unauthorized SSL certificates |

**Examples:**
```bash
# Development - local database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=seraphc2_dev
DB_USER=seraphc2
DB_PASSWORD=dev_password
DB_SSL=false

# Production - managed database with SSL
DB_HOST=prod-db.cluster-xyz.us-west-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=seraphc2_prod
DB_USER=seraphc2_prod
DB_PASSWORD=secure_production_password
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
```

### Connection Pool Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_POOL_MIN` | number | `2` | Minimum connections in pool |
| `DB_POOL_MAX` | number | `20` | Maximum connections in pool |
| `DB_POOL_IDLE_TIMEOUT` | number | `30000` | Idle connection timeout (ms) |
| `DB_POOL_CONNECTION_TIMEOUT` | number | `10000` | Connection timeout (ms) |
| `DB_POOL_ACQUIRE_TIMEOUT` | number | `60000` | Pool acquire timeout (ms) |

**Recommendations by Environment:**

```bash
# Development
DB_POOL_MIN=2
DB_POOL_MAX=10

# Staging
DB_POOL_MIN=5
DB_POOL_MAX=20

# Production
DB_POOL_MIN=10
DB_POOL_MAX=50
```

### Database Health Monitoring

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_ENABLE_HEALTH_CHECK` | boolean | `true` | Enable database health monitoring |
| `DB_HEALTH_CHECK_INTERVAL` | number | `30000` | Health check interval (ms) |
| `DB_HEALTH_CHECK_TIMEOUT` | number | `5000` | Health check timeout (ms) |

## Redis Configuration

### Redis Connection

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `REDIS_HOST` | string | `localhost` | Redis server hostname |
| `REDIS_PORT` | number | `6379` | Redis server port |
| `REDIS_PASSWORD` | string | `""` | Redis authentication password |
| `REDIS_DB` | number | `0` | Redis database number |
| `REDIS_KEY_PREFIX` | string | `seraphc2:` | Key prefix for namespacing |
| `REDIS_TLS` | boolean | `false` | Enable TLS for Redis connections |

**Examples:**
```bash
# Development - local Redis without auth
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=seraphc2:dev:

# Production - managed Redis with auth and TLS
REDIS_HOST=prod-redis.cluster.cache.amazonaws.com
REDIS_PORT=6380
REDIS_PASSWORD=secure_redis_password
REDIS_DB=0
REDIS_KEY_PREFIX=seraphc2:prod:
REDIS_TLS=true
```

### Redis Connection Behavior

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `REDIS_MAX_RETRIES` | number | `3` | Maximum connection retry attempts |
| `REDIS_CONNECT_TIMEOUT` | number | `10000` | Connection timeout (ms) |
| `REDIS_COMMAND_TIMEOUT` | number | `5000` | Command execution timeout (ms) |
| `REDIS_RETRY_DELAY` | number | `1000` | Delay between retry attempts (ms) |

## Session Management

### Session Lifecycle

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SESSION_TTL_SECONDS` | number | `3600` | Session time-to-live (seconds) |
| `SESSION_MAX_IDLE_SECONDS` | number | `1800` | Maximum idle time before expiration |
| `SESSION_ENABLE_SLIDING_EXPIRATION` | boolean | `true` | Extend session on activity |
| `SESSION_MAX_CONCURRENT` | number | `5` | Maximum concurrent sessions per user |
| `SESSION_ENABLE_DISTRIBUTED` | boolean | `false` | Enable distributed session storage |

**Recommendations by Environment:**

```bash
# Development - longer sessions for convenience
SESSION_TTL_SECONDS=7200
SESSION_MAX_IDLE_SECONDS=3600
SESSION_MAX_CONCURRENT=10

# Production - shorter sessions for security
SESSION_TTL_SECONDS=3600
SESSION_MAX_IDLE_SECONDS=1800
SESSION_MAX_CONCURRENT=3
```

### Session Security

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SESSION_SECURE_COOKIES` | boolean | `false` | Require HTTPS for session cookies |
| `SESSION_SAME_SITE` | string | `lax` | SameSite cookie attribute (strict, lax, none) |
| `SESSION_HTTP_ONLY` | boolean | `true` | Prevent client-side cookie access |

## Cluster Configuration

### Node Identification

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ID` | string | `seraphc2-node-1` | Unique node identifier |
| `NODE_ROLE` | string | `primary` | Node role (primary, secondary, worker) |
| `NODE_REGION` | string | `us-east-1` | Geographic region identifier |
| `NODE_ZONE` | string | `us-east-1a` | Availability zone identifier |

### Cluster Behavior

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CLUSTER_ENABLE` | boolean | `false` | Enable cluster mode |
| `CLUSTER_HEARTBEAT_INTERVAL` | number | `5000` | Heartbeat interval (ms) |
| `CLUSTER_HEARTBEAT_TIMEOUT` | number | `15000` | Heartbeat timeout (ms) |
| `CLUSTER_ENABLE_AUTO_SCALING` | boolean | `false` | Enable automatic scaling |
| `CLUSTER_MIN_NODES` | number | `1` | Minimum cluster nodes |
| `CLUSTER_MAX_NODES` | number | `10` | Maximum cluster nodes |

**Examples:**
```bash
# Single node deployment
CLUSTER_ENABLE=false
NODE_ID=seraphc2-standalone

# Multi-node cluster
CLUSTER_ENABLE=true
NODE_ID=seraphc2-prod-node-1
NODE_ROLE=primary
CLUSTER_MIN_NODES=3
CLUSTER_MAX_NODES=20
CLUSTER_ENABLE_AUTO_SCALING=true
```

## Load Balancer Configuration

### Load Balancing Algorithm

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LB_ALGORITHM` | string | `round-robin` | Load balancing algorithm |
| `LB_HEALTH_CHECK_INTERVAL` | number | `30000` | Health check interval (ms) |
| `LB_HEALTH_CHECK_TIMEOUT` | number | `5000` | Health check timeout (ms) |
| `LB_ENABLE_STICKY_SESSIONS` | boolean | `false` | Enable session affinity |

**Available Algorithms:**
- `round-robin`: Distribute requests evenly
- `least-connections`: Route to least busy server
- `ip-hash`: Route based on client IP hash
- `weighted`: Route based on server weights

### Circuit Breaker

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LB_ENABLE_CIRCUIT_BREAKER` | boolean | `true` | Enable circuit breaker pattern |
| `LB_CIRCUIT_BREAKER_THRESHOLD` | number | `5` | Failure threshold to open circuit |
| `LB_CIRCUIT_BREAKER_TIMEOUT` | number | `60000` | Circuit breaker timeout (ms) |
| `LB_MAX_RETRIES` | number | `3` | Maximum retry attempts |

## Security Configuration

### Cryptographic Keys

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `JWT_SECRET` | string | **required** | JWT signing secret (min 32 chars) |
| `ENCRYPTION_KEY` | string | **required** | Data encryption key (exactly 32 chars) |
| `HASH_ROUNDS` | number | `12` | bcrypt hash rounds |

**Security Requirements:**
- `JWT_SECRET`: Minimum 32 characters, cryptographically random
- `ENCRYPTION_KEY`: Exactly 32 characters, cryptographically random
- Use `openssl rand -base64 32` to generate secure keys

**Examples:**
```bash
# Generate secure keys
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32 | head -c 32)

# Or use Node.js
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex').substring(0,32))")
```

### Rate Limiting

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | number | `900000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | number | `100` | Max requests per window |
| `RATE_LIMIT_SKIP_SUCCESSFUL` | boolean | `false` | Skip counting successful requests |
| `RATE_LIMIT_HEADERS` | boolean | `true` | Include rate limit headers |

**Rate Limit Tiers:**
```bash
# Strict (production)
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# Moderate (staging)
RATE_LIMIT_WINDOW_MS=600000  # 10 minutes
RATE_LIMIT_MAX_REQUESTS=200

# Relaxed (development)
RATE_LIMIT_WINDOW_MS=300000  # 5 minutes
RATE_LIMIT_MAX_REQUESTS=500
```

### File Upload Security

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MAX_FILE_SIZE` | number | `10485760` | Maximum file size (bytes) |
| `ALLOWED_FILE_TYPES` | string | `pdf,txt,log,json` | Comma-separated allowed extensions |
| `UPLOAD_SCAN_ENABLED` | boolean | `true` | Enable virus scanning |
| `UPLOAD_QUARANTINE_ENABLED` | boolean | `true` | Quarantine suspicious files |

## Monitoring and Alerting

### Performance Monitoring

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MONITORING_ENABLE` | boolean | `true` | Enable performance monitoring |
| `MONITORING_METRICS_INTERVAL` | number | `30000` | Metrics collection interval (ms) |
| `MONITORING_RETENTION_DAYS` | number | `7` | Metrics retention period |
| `MONITORING_ENABLE_PROFILING` | boolean | `false` | Enable CPU/memory profiling |

### Alerting Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MONITORING_ENABLE_ALERTING` | boolean | `true` | Enable alerting system |
| `MONITORING_ALERT_CHECK_INTERVAL` | number | `60000` | Alert check interval (ms) |
| `MONITORING_MAX_ALERTS_PER_HOUR` | number | `10` | Maximum alerts per hour |
| `MONITORING_ALERT_COOLDOWN` | number | `300000` | Alert cooldown period (ms) |

### Metrics Export

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_METRICS` | boolean | `true` | Enable metrics endpoint |
| `METRICS_PORT` | number | `9090` | Metrics server port |
| `METRICS_PATH` | string | `/metrics` | Metrics endpoint path |
| `METRICS_AUTH_REQUIRED` | boolean | `false` | Require authentication for metrics |

## Logging Configuration

### Log Levels and Output

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | string | `info` | Minimum log level |
| `LOG_FILE` | string | `logs/seraphc2.log` | Log file path |
| `LOG_MAX_SIZE` | string | `10m` | Maximum log file size |
| `LOG_MAX_FILES` | number | `5` | Maximum log files to retain |
| `LOG_COMPRESS` | boolean | `true` | Compress rotated log files |

**Log Levels (in order of verbosity):**
- `error`: Error conditions only
- `warn`: Warning conditions and errors
- `info`: Informational messages, warnings, and errors
- `debug`: Debug information and all above
- `verbose`: Detailed debug information and all above

### Structured Logging

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_FORMAT` | string | `json` | Log format (json, simple, combined) |
| `LOG_TIMESTAMP` | boolean | `true` | Include timestamps in logs |
| `LOG_COLORIZE` | boolean | `false` | Colorize console output |
| `LOG_INCLUDE_STACK_TRACE` | boolean | `true` | Include stack traces for errors |

### Security Logging

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_SECURITY_EVENTS` | boolean | `true` | Log security-related events |
| `LOG_FAILED_LOGINS` | boolean | `true` | Log failed login attempts |
| `LOG_SENSITIVE_DATA` | boolean | `false` | Log sensitive data (NOT recommended) |
| `LOG_AUDIT_TRAIL` | boolean | `true` | Maintain comprehensive audit trail |

## Protocol Configuration

### Communication Protocols

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DNS_PORT` | number | `53` | DNS protocol handler port |
| `SMB_PIPE_NAME` | string | `seraphc2` | SMB named pipe identifier |
| `WEBSOCKET_PING_INTERVAL` | number | `30000` | WebSocket ping interval (ms) |
| `WEBSOCKET_PONG_TIMEOUT` | number | `5000` | WebSocket pong timeout (ms) |

### Protocol Security

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PROTOCOL_ENCRYPTION_ENABLED` | boolean | `true` | Enable protocol-level encryption |
| `PROTOCOL_COMPRESSION_ENABLED` | boolean | `true` | Enable data compression |
| `PROTOCOL_OBFUSCATION_ENABLED` | boolean | `true` | Enable traffic obfuscation |

## SSL/TLS Configuration

### Certificate Management

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SSL_CERT_PATH` | string | `certificates/server.crt` | SSL certificate file path |
| `SSL_KEY_PATH` | string | `certificates/server.key` | SSL private key file path |
| `SSL_CA_PATH` | string | `""` | Certificate authority file path |
| `SSL_PASSPHRASE` | string | `""` | Private key passphrase |

### TLS Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TLS_MIN_VERSION` | string | `TLSv1.2` | Minimum TLS version |
| `TLS_MAX_VERSION` | string | `TLSv1.3` | Maximum TLS version |
| `TLS_CIPHERS` | string | `HIGH:!aNULL:!MD5` | Allowed cipher suites |
| `TLS_PREFER_SERVER_CIPHERS` | boolean | `true` | Prefer server cipher order |

## External Integrations

### Webhook Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WEBHOOK_TIMEOUT` | number | `30000` | Webhook request timeout (ms) |
| `WEBHOOK_RETRY_ATTEMPTS` | number | `3` | Maximum retry attempts |
| `WEBHOOK_RETRY_DELAY` | number | `1000` | Delay between retries (ms) |
| `WEBHOOK_MAX_PAYLOAD_SIZE` | number | `1048576` | Maximum payload size (bytes) |

### API Integration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `API_KEY_EXPIRY_DAYS` | number | `365` | Default API key expiry (days) |
| `API_RATE_LIMIT_ENABLED` | boolean | `true` | Enable API rate limiting |
| `API_VERSIONING_ENABLED` | boolean | `true` | Enable API versioning |

## Environment-Specific Examples

### Development Environment

```bash
# .env.development
NODE_ENV=development
PORT=3000
HOST=localhost

# Database
DB_HOST=localhost
DB_NAME=seraphc2_dev
DB_USER=seraphc2
DB_PASSWORD=dev_password
DB_POOL_MAX=10

# Redis
REDIS_HOST=localhost
REDIS_PASSWORD=
REDIS_KEY_PREFIX=seraphc2:dev:

# Security (development keys - NOT for production)
JWT_SECRET=dev_jwt_secret_key_change_in_production_32chars
ENCRYPTION_KEY=dev_encryption_key_change_in_production_32chars

# Logging
LOG_LEVEL=debug
LOG_FORMAT=simple
LOG_COLORIZE=true

# Monitoring
MONITORING_ENABLE=true
MONITORING_RETENTION_DAYS=3

# Cluster
CLUSTER_ENABLE=false
```

### Staging Environment

```bash
# .env.staging
NODE_ENV=staging
PORT=3000
HOST=0.0.0.0

# Database
DB_HOST=staging-db.internal
DB_NAME=seraphc2_staging
DB_USER=seraphc2_staging
DB_PASSWORD=staging_secure_password
DB_SSL=true
DB_POOL_MAX=20

# Redis
REDIS_HOST=staging-redis.internal
REDIS_PASSWORD=staging_redis_password
REDIS_KEY_PREFIX=seraphc2:staging:

# Security
JWT_SECRET=staging_jwt_secret_32_characters_minimum
ENCRYPTION_KEY=staging_encryption_key_exactly_32_chars

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Monitoring
MONITORING_ENABLE=true
MONITORING_RETENTION_DAYS=7

# Cluster
CLUSTER_ENABLE=true
CLUSTER_MIN_NODES=2
CLUSTER_MAX_NODES=5
```

### Production Environment

```bash
# .env.production
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DB_HOST=prod-db.cluster-xyz.us-west-2.rds.amazonaws.com
DB_NAME=seraphc2_prod
DB_USER=seraphc2_prod
DB_PASSWORD=highly_secure_production_password
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_POOL_MIN=10
DB_POOL_MAX=50

# Redis
REDIS_HOST=prod-redis.cluster.cache.amazonaws.com
REDIS_PORT=6380
REDIS_PASSWORD=highly_secure_redis_password
REDIS_TLS=true
REDIS_KEY_PREFIX=seraphc2:prod:

# Security
JWT_SECRET=production_jwt_secret_minimum_32_characters_cryptographically_secure
ENCRYPTION_KEY=production_encryption_key_32_chars

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=warn
LOG_FORMAT=json
LOG_SECURITY_EVENTS=true

# Monitoring
MONITORING_ENABLE=true
MONITORING_RETENTION_DAYS=30
MONITORING_ENABLE_ALERTING=true

# Cluster
CLUSTER_ENABLE=true
CLUSTER_MIN_NODES=3
CLUSTER_MAX_NODES=20
CLUSTER_ENABLE_AUTO_SCALING=true

# SSL/TLS
SSL_CERT_PATH=/etc/ssl/certs/seraphc2.crt
SSL_KEY_PATH=/etc/ssl/private/seraphc2.key
TLS_MIN_VERSION=TLSv1.2

# CORS
CORS_ORIGINS=https://seraphc2.yourdomain.com
```

## Configuration Validation

SeraphC2 includes built-in configuration validation that runs at startup. The validation checks:

1. **Required Variables**: Ensures all required variables are set
2. **Type Validation**: Validates data types (number, boolean, string)
3. **Range Validation**: Ensures numeric values are within acceptable ranges
4. **Format Validation**: Validates formats (URLs, email addresses, etc.)
5. **Security Validation**: Ensures security-related configurations meet minimum requirements

### Validation Errors

Common validation errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| `JWT_SECRET too short` | JWT secret less than 32 characters | Generate longer secret |
| `ENCRYPTION_KEY invalid length` | Encryption key not exactly 32 characters | Generate 32-character key |
| `DB_PASSWORD required` | Database password not set | Set secure password |
| `Invalid LOG_LEVEL` | Unsupported log level | Use: error, warn, info, debug, verbose |
| `PORT out of range` | Port number invalid | Use port between 1-65535 |

## Best Practices

### Security Best Practices

1. **Never use default secrets in production**
2. **Generate cryptographically secure random keys**
3. **Use environment-specific configurations**
4. **Enable SSL/TLS in production**
5. **Implement proper rate limiting**
6. **Use strong database passwords**
7. **Enable audit logging**
8. **Restrict CORS origins in production**

### Performance Best Practices

1. **Optimize database connection pools**
2. **Enable Redis for session storage**
3. **Configure appropriate log levels**
4. **Enable compression and caching**
5. **Use cluster mode for high availability**
6. **Monitor resource usage**
7. **Implement health checks**

### Operational Best Practices

1. **Use configuration management tools**
2. **Implement secrets management**
3. **Set up monitoring and alerting**
4. **Configure log rotation**
5. **Test configurations in staging**
6. **Document environment-specific settings**
7. **Implement configuration validation**
8. **Use infrastructure as code**

This configuration reference provides comprehensive coverage of all SeraphC2 configuration options. For specific deployment scenarios, refer to the installation guides and security configuration documentation.