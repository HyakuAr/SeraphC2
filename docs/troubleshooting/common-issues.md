# Common Issues and Troubleshooting Guide

This guide provides solutions to common issues encountered when deploying and operating SeraphC2.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Database Connection Problems](#database-connection-problems)
3. [Redis Connection Issues](#redis-connection-issues)
4. [Authentication and Authorization Problems](#authentication-and-authorization-problems)
5. [Performance Issues](#performance-issues)
6. [Network and Connectivity Problems](#network-and-connectivity-problems)
7. [SSL/TLS Certificate Issues](#ssltls-certificate-issues)
8. [Docker and Container Issues](#docker-and-container-issues)
9. [Kubernetes Deployment Problems](#kubernetes-deployment-problems)
10. [Logging and Monitoring Issues](#logging-and-monitoring-issues)
11. [API and Integration Problems](#api-and-integration-problems)
12. [Security-Related Issues](#security-related-issues)

## Installation Issues

### Node.js Version Compatibility

**Problem:** Application fails to start with Node.js version errors.

**Symptoms:**
```
Error: The engine "node" is incompatible with this module
Expected version ">=18.0.0"
```

**Solution:**
```bash
# Check current Node.js version
node --version

# Install Node.js 18+ using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# Or using package manager
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

### NPM Installation Failures

**Problem:** `npm install` fails with permission errors or package conflicts.

**Symptoms:**
```
EACCES: permission denied, mkdir '/usr/local/lib/node_modules'
npm ERR! peer dep missing
```

**Solutions:**

1. **Fix NPM permissions:**
```bash
# Create npm global directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

2. **Clear npm cache:**
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

3. **Use specific npm version:**
```bash
npm install -g npm@9
npm install
```

### TypeScript Compilation Errors

**Problem:** TypeScript compilation fails during build.

**Symptoms:**
```
error TS2307: Cannot find module '@types/node'
error TS2304: Cannot find name 'process'
```

**Solution:**
```bash
# Install missing type definitions
npm install --save-dev @types/node @types/express

# Clean and rebuild
npm run clean
npm run build

# Check TypeScript configuration
npx tsc --showConfig
```

## Database Connection Problems

### PostgreSQL Connection Refused

**Problem:** Cannot connect to PostgreSQL database.

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
Error: password authentication failed for user "seraphc2"
```

**Diagnostic Steps:**
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql
ps aux | grep postgres

# Test connection manually
psql -h localhost -U seraphc2 -d seraphc2

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

**Solutions:**

1. **Start PostgreSQL service:**
```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

2. **Create database and user:**
```sql
-- Connect as postgres superuser
sudo -u postgres psql

-- Create database and user
CREATE DATABASE seraphc2;
CREATE USER seraphc2 WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE seraphc2 TO seraphc2;
\q
```

3. **Configure PostgreSQL authentication:**
```bash
# Edit pg_hba.conf
sudo nano /etc/postgresql/13/main/pg_hba.conf

# Add or modify line:
local   seraphc2    seraphc2                                md5
host    seraphc2    seraphc2    127.0.0.1/32               md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Database Migration Failures

**Problem:** Database migrations fail to run.

**Symptoms:**
```
Migration failed: relation "users" already exists
Error: column "created_at" does not exist
```

**Solutions:**

1. **Check migration status:**
```bash
npm run migrate:status
```

2. **Reset migrations (development only):**
```bash
npm run migrate:down
npm run migrate:up
```

3. **Manual migration repair:**
```sql
-- Connect to database
psql -h localhost -U seraphc2 -d seraphc2

-- Check migration table
SELECT * FROM pgmigrations;

-- Manually mark migration as complete (if needed)
INSERT INTO pgmigrations (name, run_on) VALUES ('001_initial_schema.sql', NOW());
```

### Database Performance Issues

**Problem:** Slow database queries and timeouts.

**Symptoms:**
```
Error: Query timeout after 30000ms
Slow query detected: SELECT * FROM implants
```

**Solutions:**

1. **Analyze slow queries:**
```sql
-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();

-- Check slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

2. **Add missing indexes:**
```sql
-- Common indexes for SeraphC2
CREATE INDEX CONCURRENTLY idx_implants_status ON implants(status);
CREATE INDEX CONCURRENTLY idx_commands_implant_id ON commands(implant_id);
CREATE INDEX CONCURRENTLY idx_sessions_user_id ON sessions(user_id);
CREATE INDEX CONCURRENTLY idx_audit_logs_timestamp ON audit_logs(created_at);
```

3. **Optimize PostgreSQL configuration:**
```bash
# Edit postgresql.conf
sudo nano /etc/postgresql/13/main/postgresql.conf

# Recommended settings for production
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
```

## Redis Connection Issues

### Redis Connection Refused

**Problem:** Cannot connect to Redis server.

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:6379
Error: NOAUTH Authentication required
```

**Diagnostic Steps:**
```bash
# Check if Redis is running
sudo systemctl status redis
ps aux | grep redis

# Test connection
redis-cli ping
redis-cli -a your_password ping

# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log
```

**Solutions:**

1. **Start Redis service:**
```bash
sudo systemctl start redis
sudo systemctl enable redis
```

2. **Configure Redis authentication:**
```bash
# Edit redis.conf
sudo nano /etc/redis/redis.conf

# Set password
requirepass your_secure_password

# Restart Redis
sudo systemctl restart redis
```

3. **Test Redis connection:**
```bash
# Test with password
redis-cli -a your_secure_password ping

# Test from application
redis-cli -a your_secure_password
> SET test "hello"
> GET test
> DEL test
```

### Redis Memory Issues

**Problem:** Redis runs out of memory or performance degrades.

**Symptoms:**
```
Error: OOM command not allowed when used memory > 'maxmemory'
Warning: Redis is using more memory than expected
```

**Solutions:**

1. **Configure memory limits:**
```bash
# Edit redis.conf
sudo nano /etc/redis/redis.conf

# Set memory limit
maxmemory 512mb
maxmemory-policy allkeys-lru

# Restart Redis
sudo systemctl restart redis
```

2. **Monitor Redis memory usage:**
```bash
redis-cli info memory
redis-cli --bigkeys
redis-cli --memkeys
```

3. **Optimize Redis configuration:**
```bash
# Disable unused features
save ""  # Disable persistence if not needed
appendonly no

# Optimize for memory
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
set-max-intset-entries 512
```

## Authentication and Authorization Problems

### JWT Token Issues

**Problem:** JWT tokens are invalid or expired.

**Symptoms:**
```
Error: JsonWebTokenError: invalid token
Error: TokenExpiredError: jwt expired
Error: JsonWebTokenError: invalid signature
```

**Solutions:**

1. **Verify JWT configuration:**
```bash
# Check JWT secret is set and consistent
echo $JWT_SECRET
# Should be at least 32 characters

# Verify token manually
node -e "
const jwt = require('jsonwebtoken');
const token = 'your_token_here';
const secret = process.env.JWT_SECRET;
try {
  const decoded = jwt.verify(token, secret);
  console.log('Token valid:', decoded);
} catch (error) {
  console.log('Token error:', error.message);
}
"
```

2. **Check system time synchronization:**
```bash
# Ensure system time is correct
timedatectl status
sudo ntpdate -s time.nist.gov
```

3. **Debug token generation:**
```javascript
// Add debugging to token generation
const jwt = require('jsonwebtoken');
const payload = { userId: '123', role: 'admin' };
const secret = process.env.JWT_SECRET;
const options = { expiresIn: '1h', issuer: 'seraphc2' };

console.log('Generating token with:', { payload, secret: secret.substring(0, 8) + '...', options });
const token = jwt.sign(payload, secret, options);
console.log('Generated token:', token);
```

### Login Failures

**Problem:** Users cannot log in with correct credentials.

**Symptoms:**
```
Error: Invalid username or password
Error: Account locked due to too many failed attempts
Error: MFA token required
```

**Solutions:**

1. **Check password hashing:**
```javascript
// Test password verification
const bcrypt = require('bcrypt');
const password = 'user_password';
const hash = '$2b$12$...'; // from database

bcrypt.compare(password, hash, (err, result) => {
  console.log('Password match:', result);
});
```

2. **Reset account lockout:**
```sql
-- Reset failed login attempts
UPDATE users SET 
  failed_login_attempts = 0,
  locked_until = NULL
WHERE username = 'username';
```

3. **Check MFA configuration:**
```javascript
// Test TOTP token
const speakeasy = require('speakeasy');
const token = '123456'; // User's token
const secret = 'user_mfa_secret';

const verified = speakeasy.totp.verify({
  secret: secret,
  encoding: 'base32',
  token: token,
  window: 1
});

console.log('MFA token valid:', verified);
```

### Permission Denied Errors

**Problem:** Users get permission denied for actions they should be able to perform.

**Symptoms:**
```
Error: Insufficient permissions
Error: Access denied for resource
HTTP 403 Forbidden
```

**Solutions:**

1. **Check user roles and permissions:**
```sql
-- Check user permissions
SELECT u.username, u.role, p.permission_name
FROM users u
LEFT JOIN user_permissions up ON u.id = up.user_id
LEFT JOIN permissions p ON up.permission_id = p.id
WHERE u.username = 'username';
```

2. **Verify RBAC configuration:**
```javascript
// Debug permission checking
const checkPermission = (user, requiredPermission) => {
  console.log('User permissions:', user.permissions);
  console.log('Required permission:', requiredPermission);
  
  const hasPermission = user.permissions.includes(requiredPermission);
  console.log('Permission granted:', hasPermission);
  
  return hasPermission;
};
```

3. **Update user permissions:**
```sql
-- Grant permission to user
INSERT INTO user_permissions (user_id, permission_id)
SELECT u.id, p.id
FROM users u, permissions p
WHERE u.username = 'username' AND p.permission_name = 'implants:read';
```

## Performance Issues

### High Memory Usage

**Problem:** Application consumes excessive memory.

**Symptoms:**
```
Warning: Memory usage high: 2.1GB
Error: JavaScript heap out of memory
Process killed by OOM killer
```

**Solutions:**

1. **Monitor memory usage:**
```bash
# Check Node.js memory usage
node --inspect dist/index.js
# Open chrome://inspect in browser

# Monitor system memory
htop
free -h
cat /proc/meminfo
```

2. **Optimize Node.js memory:**
```bash
# Increase heap size
node --max-old-space-size=4096 dist/index.js

# Enable garbage collection logging
node --trace-gc dist/index.js
```

3. **Identify memory leaks:**
```javascript
// Add memory monitoring
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('Memory usage:', {
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    external: Math.round(usage.external / 1024 / 1024) + 'MB'
  });
}, 30000);
```

### Slow Response Times

**Problem:** API responses are slow or timeout.

**Symptoms:**
```
Request timeout after 30 seconds
Average response time: 5000ms
Database query took 10 seconds
```

**Solutions:**

1. **Profile application performance:**
```bash
# Use Node.js profiler
node --prof dist/index.js
# Generate report after stopping
node --prof-process isolate-*.log > profile.txt
```

2. **Optimize database queries:**
```sql
-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM implants WHERE status = 'active';

-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_implants_status ON implants(status);
```

3. **Implement caching:**
```javascript
// Add Redis caching
const redis = require('redis');
const client = redis.createClient();

const getCachedData = async (key) => {
  const cached = await client.get(key);
  if (cached) {
    return JSON.parse(cached);
  }
  
  const data = await fetchDataFromDatabase();
  await client.setex(key, 300, JSON.stringify(data)); // Cache for 5 minutes
  return data;
};
```

### High CPU Usage

**Problem:** Application consumes excessive CPU resources.

**Symptoms:**
```
CPU usage consistently above 80%
Load average: 5.0
Node.js process using 100% CPU
```

**Solutions:**

1. **Identify CPU-intensive operations:**
```bash
# Use htop to identify processes
htop

# Profile CPU usage
node --prof dist/index.js
```

2. **Optimize algorithms:**
```javascript
// Use efficient data structures
const Map = require('map'); // Instead of objects for frequent lookups
const Set = require('set'); // For unique collections

// Implement pagination
const getImplants = async (page = 1, limit = 50) => {
  const offset = (page - 1) * limit;
  return await db.query('SELECT * FROM implants LIMIT $1 OFFSET $2', [limit, offset]);
};
```

3. **Implement rate limiting:**
```javascript
// Prevent CPU exhaustion from too many requests
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## Network and Connectivity Problems

### Port Already in Use

**Problem:** Cannot start server because port is already in use.

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3000
Port 3000 is already in use
```

**Solutions:**

1. **Find and kill process using port:**
```bash
# Find process using port
lsof -i :3000
netstat -tulpn | grep :3000

# Kill process
kill -9 <PID>

# Or kill all Node.js processes
pkill -f node
```

2. **Use different port:**
```bash
# Set different port in environment
export PORT=3001
npm start

# Or modify .env file
PORT=3001
```

3. **Check for port conflicts:**
```bash
# Check all listening ports
netstat -tulpn | grep LISTEN
ss -tulpn | grep LISTEN
```

### Firewall Blocking Connections

**Problem:** External connections are blocked by firewall.

**Symptoms:**
```
Connection timeout
Connection refused from external IP
curl: (7) Failed to connect to server
```

**Solutions:**

1. **Check firewall status:**
```bash
# Ubuntu/Debian (ufw)
sudo ufw status
sudo ufw allow 3000/tcp
sudo ufw allow 443/tcp

# CentOS/RHEL (firewalld)
sudo firewall-cmd --list-all
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload

# iptables
sudo iptables -L
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

2. **Test connectivity:**
```bash
# Test from local machine
curl http://localhost:3000/health

# Test from external machine
curl http://your-server-ip:3000/health
telnet your-server-ip 3000
```

3. **Check cloud provider security groups:**
```bash
# AWS Security Groups
aws ec2 describe-security-groups --group-ids sg-12345678

# Add rule to allow port 3000
aws ec2 authorize-security-group-ingress \
  --group-id sg-12345678 \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0
```

### DNS Resolution Issues

**Problem:** Cannot resolve hostnames or external services.

**Symptoms:**
```
Error: getaddrinfo ENOTFOUND database.example.com
DNS lookup failed
Connection timeout to external API
```

**Solutions:**

1. **Test DNS resolution:**
```bash
# Test DNS resolution
nslookup database.example.com
dig database.example.com
host database.example.com

# Test with different DNS servers
nslookup database.example.com 8.8.8.8
```

2. **Configure DNS servers:**
```bash
# Edit /etc/resolv.conf
sudo nano /etc/resolv.conf

# Add DNS servers
nameserver 8.8.8.8
nameserver 8.8.4.4
nameserver 1.1.1.1
```

3. **Check /etc/hosts file:**
```bash
# Add manual DNS entries if needed
sudo nano /etc/hosts

# Add entries
127.0.0.1 localhost
10.0.1.100 database.internal
10.0.1.101 redis.internal
```

## SSL/TLS Certificate Issues

### Certificate Validation Errors

**Problem:** SSL certificate validation fails.

**Symptoms:**
```
Error: unable to verify the first certificate
Error: certificate has expired
Error: hostname/IP does not match certificate's altnames
```

**Solutions:**

1. **Check certificate validity:**
```bash
# Check certificate details
openssl x509 -in certificate.crt -text -noout

# Check certificate expiration
openssl x509 -in certificate.crt -noout -dates

# Test SSL connection
openssl s_client -connect yourdomain.com:443
```

2. **Verify certificate chain:**
```bash
# Check certificate chain
openssl verify -CAfile ca-bundle.crt certificate.crt

# Download certificate chain
openssl s_client -showcerts -connect yourdomain.com:443 < /dev/null
```

3. **Update certificate configuration:**
```bash
# Update certificate paths in .env
SSL_CERT_PATH=/etc/ssl/certs/yourdomain.crt
SSL_KEY_PATH=/etc/ssl/private/yourdomain.key
SSL_CA_PATH=/etc/ssl/certs/ca-bundle.crt

# Set proper permissions
sudo chmod 644 /etc/ssl/certs/yourdomain.crt
sudo chmod 600 /etc/ssl/private/yourdomain.key
```

### Self-Signed Certificate Issues

**Problem:** Self-signed certificates are rejected.

**Symptoms:**
```
Error: self signed certificate
Error: unable to get local issuer certificate
Certificate verification failed
```

**Solutions:**

1. **Create proper self-signed certificate:**
```bash
# Generate private key
openssl genrsa -out server.key 2048

# Generate certificate signing request
openssl req -new -key server.key -out server.csr

# Generate self-signed certificate
openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt

# Create certificate bundle
cat server.crt > server-bundle.crt
cat ca.crt >> server-bundle.crt
```

2. **Configure application to accept self-signed certificates:**
```bash
# For development only
NODE_TLS_REJECT_UNAUTHORIZED=0

# Better: Add certificate to trusted store
sudo cp server.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

3. **Use Let's Encrypt for production:**
```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Docker and Container Issues

### Container Won't Start

**Problem:** Docker container fails to start or exits immediately.

**Symptoms:**
```
Container exited with code 1
Error: Cannot find module 'express'
Permission denied
```

**Solutions:**

1. **Check container logs:**
```bash
# View container logs
docker logs container-name
docker logs -f container-name

# Check container status
docker ps -a
docker inspect container-name
```

2. **Debug container startup:**
```bash
# Run container interactively
docker run -it --entrypoint /bin/bash seraphc2:latest

# Check file permissions
ls -la /app
whoami
id

# Test application manually
cd /app
npm start
```

3. **Fix common issues:**
```dockerfile
# Ensure proper user permissions
RUN chown -R node:node /app
USER node

# Install dependencies properly
COPY package*.json ./
RUN npm ci --only=production

# Set proper working directory
WORKDIR /app
```

### Docker Build Failures

**Problem:** Docker image build fails.

**Symptoms:**
```
Error: npm install failed
Error: COPY failed
Error: unable to prepare context
```

**Solutions:**

1. **Check Dockerfile syntax:**
```dockerfile
# Use proper base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]
```

2. **Check .dockerignore file:**
```
node_modules
npm-debug.log
.git
.gitignore
README.md
.env
.nyc_output
coverage
.nyc_output
```

3. **Debug build process:**
```bash
# Build with verbose output
docker build --no-cache --progress=plain -t seraphc2 .

# Build specific stage
docker build --target development -t seraphc2:dev .
```

### Container Networking Issues

**Problem:** Containers cannot communicate with each other.

**Symptoms:**
```
Error: connect ECONNREFUSED 172.17.0.2:5432
Service discovery failed
Cannot reach database container
```

**Solutions:**

1. **Check Docker network:**
```bash
# List networks
docker network ls

# Inspect network
docker network inspect bridge

# Create custom network
docker network create seraphc2-network
```

2. **Use Docker Compose networking:**
```yaml
version: '3.8'
services:
  app:
    build: .
    networks:
      - seraphc2-network
    depends_on:
      - database
  
  database:
    image: postgres:15
    networks:
      - seraphc2-network

networks:
  seraphc2-network:
    driver: bridge
```

3. **Test container connectivity:**
```bash
# Test from within container
docker exec -it app-container ping database-container
docker exec -it app-container nc -zv database-container 5432
```

## Kubernetes Deployment Problems

### Pod Startup Failures

**Problem:** Kubernetes pods fail to start or crash.

**Symptoms:**
```
Pod status: CrashLoopBackOff
Pod status: ImagePullBackOff
Pod status: Pending
```

**Solutions:**

1. **Check pod status and logs:**
```bash
# Check pod status
kubectl get pods -n seraphc2
kubectl describe pod pod-name -n seraphc2

# Check logs
kubectl logs pod-name -n seraphc2
kubectl logs -f deployment/seraphc2-app -n seraphc2
```

2. **Debug pod issues:**
```bash
# Check events
kubectl get events -n seraphc2 --sort-by='.lastTimestamp'

# Check resource usage
kubectl top pods -n seraphc2
kubectl describe node node-name
```

3. **Fix common issues:**
```yaml
# Ensure proper resource limits
resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "1Gi"
    cpu: "500m"

# Add health checks
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Service Discovery Issues

**Problem:** Services cannot communicate within Kubernetes cluster.

**Symptoms:**
```
Error: getaddrinfo ENOTFOUND postgres-service
Service not found
Connection refused to internal service
```

**Solutions:**

1. **Check service configuration:**
```bash
# List services
kubectl get services -n seraphc2

# Check service details
kubectl describe service postgres-service -n seraphc2

# Test service connectivity
kubectl exec -it pod-name -n seraphc2 -- nc -zv postgres-service 5432
```

2. **Verify DNS resolution:**
```bash
# Test DNS from pod
kubectl exec -it pod-name -n seraphc2 -- nslookup postgres-service
kubectl exec -it pod-name -n seraphc2 -- dig postgres-service.seraphc2.svc.cluster.local
```

3. **Check network policies:**
```bash
# List network policies
kubectl get networkpolicies -n seraphc2

# Check if policies are blocking traffic
kubectl describe networkpolicy policy-name -n seraphc2
```

### Persistent Volume Issues

**Problem:** Persistent volumes are not mounting or data is lost.

**Symptoms:**
```
Pod status: Pending (FailedMount)
Error: unable to mount volume
Data not persisting between pod restarts
```

**Solutions:**

1. **Check PVC status:**
```bash
# Check persistent volume claims
kubectl get pvc -n seraphc2
kubectl describe pvc postgres-data-pvc -n seraphc2

# Check persistent volumes
kubectl get pv
kubectl describe pv pv-name
```

2. **Verify storage class:**
```bash
# Check storage classes
kubectl get storageclass
kubectl describe storageclass fast-ssd
```

3. **Fix volume mounting:**
```yaml
# Ensure proper volume configuration
volumeMounts:
  - name: postgres-data
    mountPath: /var/lib/postgresql/data
    subPath: postgres

volumes:
  - name: postgres-data
    persistentVolumeClaim:
      claimName: postgres-data-pvc
```

## Logging and Monitoring Issues

### Log Files Not Created

**Problem:** Application logs are not being written to files.

**Symptoms:**
```
Log directory empty
No log rotation occurring
Cannot find application logs
```

**Solutions:**

1. **Check log configuration:**
```bash
# Verify log directory exists and has proper permissions
ls -la logs/
mkdir -p logs
chmod 755 logs

# Check log configuration in .env
echo $LOG_FILE
echo $LOG_LEVEL
```

2. **Test logging manually:**
```javascript
// Test logger configuration
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/test.log' })
  ]
});

logger.info('Test log message');
```

3. **Configure log rotation:**
```bash
# Install logrotate configuration
sudo nano /etc/logrotate.d/seraphc2

# Add configuration
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

### Monitoring Metrics Not Available

**Problem:** Prometheus metrics endpoint not working.

**Symptoms:**
```
Error: Cannot GET /metrics
Metrics endpoint returns 404
Prometheus cannot scrape metrics
```

**Solutions:**

1. **Check metrics configuration:**
```bash
# Verify metrics are enabled
echo $ENABLE_METRICS
echo $METRICS_PORT

# Test metrics endpoint
curl http://localhost:9090/metrics
curl http://localhost:3000/metrics
```

2. **Debug metrics collection:**
```javascript
// Test Prometheus client
const prometheus = require('prom-client');

// Create test metric
const testCounter = new prometheus.Counter({
  name: 'test_counter',
  help: 'Test counter metric'
});

testCounter.inc();

// Get metrics
console.log(prometheus.register.metrics());
```

3. **Configure Prometheus scraping:**
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'seraphc2'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 30s
    metrics_path: /metrics
```

## API and Integration Problems

### API Rate Limiting Issues

**Problem:** API requests are being rate limited unexpectedly.

**Symptoms:**
```
HTTP 429 Too Many Requests
Rate limit exceeded
X-RateLimit-Remaining: 0
```

**Solutions:**

1. **Check rate limit configuration:**
```bash
# Check rate limit settings
echo $RATE_LIMIT_WINDOW_MS
echo $RATE_LIMIT_MAX_REQUESTS

# Check current rate limit status
curl -I http://localhost:3000/api/info
```

2. **Debug rate limiting:**
```javascript
// Check rate limit store
const redis = require('redis');
const client = redis.createClient();

// Check rate limit keys
client.keys('rate-limit:*', (err, keys) => {
  console.log('Rate limit keys:', keys);
  
  keys.forEach(key => {
    client.get(key, (err, value) => {
      console.log(`${key}: ${value}`);
    });
  });
});
```

3. **Adjust rate limits:**
```bash
# Increase rate limits for development
RATE_LIMIT_WINDOW_MS=60000    # 1 minute
RATE_LIMIT_MAX_REQUESTS=1000  # 1000 requests

# Or disable rate limiting temporarily
RATE_LIMIT_ENABLED=false
```

### Webhook Delivery Failures

**Problem:** Webhooks are not being delivered to external endpoints.

**Symptoms:**
```
Webhook delivery failed
HTTP 500 Internal Server Error
Connection timeout to webhook URL
```

**Solutions:**

1. **Check webhook configuration:**
```bash
# Test webhook endpoint manually
curl -X POST https://webhook.example.com/seraphc2 \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

2. **Debug webhook delivery:**
```javascript
// Test webhook delivery
const axios = require('axios');

const testWebhook = async (url, data) => {
  try {
    const response = await axios.post(url, data, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SeraphC2-Webhook/1.0'
      }
    });
    console.log('Webhook delivered:', response.status);
  } catch (error) {
    console.error('Webhook failed:', error.message);
  }
};
```

3. **Check webhook logs:**
```sql
-- Check webhook delivery history
SELECT * FROM webhook_deliveries 
WHERE webhook_id = 'webhook-id' 
ORDER BY created_at DESC 
LIMIT 10;
```

## Security-Related Issues

### Authentication Bypass

**Problem:** Users can access protected resources without authentication.

**Symptoms:**
```
Unauthorized access to admin panel
API endpoints accessible without token
Session not being validated
```

**Solutions:**

1. **Check authentication middleware:**
```javascript
// Verify middleware is applied
app.use('/api/protected', authMiddleware.authenticate());

// Debug authentication
const authMiddleware = (req, res, next) => {
  console.log('Auth header:', req.headers.authorization);
  console.log('Session:', req.session);
  console.log('User:', req.user);
  next();
};
```

2. **Test authentication:**
```bash
# Test without token
curl http://localhost:3000/api/protected

# Test with invalid token
curl -H "Authorization: Bearer invalid-token" http://localhost:3000/api/protected

# Test with valid token
curl -H "Authorization: Bearer valid-token" http://localhost:3000/api/protected
```

3. **Check session configuration:**
```javascript
// Verify session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000 // 1 hour
  }
}));
```

### CORS Issues

**Problem:** Cross-origin requests are being blocked.

**Symptoms:**
```
CORS policy error
Access-Control-Allow-Origin header missing
Preflight request failed
```

**Solutions:**

1. **Check CORS configuration:**
```bash
# Check CORS settings
echo $CORS_ORIGINS

# Test CORS headers
curl -H "Origin: https://example.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     http://localhost:3000/api/info
```

2. **Configure CORS properly:**
```javascript
// CORS configuration
const cors = require('cors');

const corsOptions = {
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
```

3. **Debug CORS issues:**
```javascript
// Add CORS debugging
app.use((req, res, next) => {
  console.log('Origin:', req.headers.origin);
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  next();
});
```

## Getting Additional Help

### Log Analysis

When reporting issues, include relevant log information:

```bash
# Collect system logs
journalctl -u seraphc2 --since "1 hour ago"

# Collect application logs
tail -n 100 logs/seraphc2.log
tail -n 100 logs/error.log

# Collect system information
uname -a
node --version
npm --version
docker --version
kubectl version --client
```

### Performance Profiling

For performance issues, collect profiling data:

```bash
# Generate heap dump
kill -USR2 $(pgrep node)

# CPU profiling
node --prof dist/index.js
# After stopping: node --prof-process isolate-*.log > profile.txt

# Memory profiling
node --inspect dist/index.js
# Open chrome://inspect in browser
```

### Support Resources

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Check the latest documentation
- **Community Forums**: Ask questions and share solutions
- **Security Issues**: Report security vulnerabilities privately

### Creating Effective Bug Reports

When reporting issues, include:

1. **Environment Information**:
   - Operating system and version
   - Node.js version
   - SeraphC2 version
   - Deployment method (Docker, Kubernetes, etc.)

2. **Steps to Reproduce**:
   - Exact steps that lead to the issue
   - Expected behavior
   - Actual behavior

3. **Error Messages**:
   - Complete error messages and stack traces
   - Relevant log entries
   - Configuration files (sanitized)

4. **System State**:
   - Resource usage (CPU, memory, disk)
   - Network connectivity
   - External service status

This troubleshooting guide covers the most common issues encountered with SeraphC2. For issues not covered here, please check the GitHub issues or create a new issue with detailed information about your problem.