# Security Configuration Guide

This guide provides comprehensive security configuration recommendations for SeraphC2 deployments across different environments.

## Security Overview

SeraphC2 implements multiple layers of security controls to protect against various threats. This guide covers configuration of authentication, authorization, encryption, network security, and monitoring.

## Authentication and Authorization

### JWT Configuration

JSON Web Tokens (JWT) are used for stateless authentication. Proper configuration is critical for security.

**Required Settings:**
```bash
# Generate a cryptographically secure secret (minimum 32 characters)
JWT_SECRET=$(openssl rand -base64 32)

# Token expiration settings
JWT_ACCESS_TOKEN_EXPIRY=3600      # 1 hour
JWT_REFRESH_TOKEN_EXPIRY=604800   # 7 days
JWT_ISSUER=seraphc2.yourdomain.com
JWT_AUDIENCE=seraphc2-api
```

**Security Recommendations:**
- Use different secrets for each environment
- Rotate JWT secrets regularly (quarterly recommended)
- Set short expiration times for access tokens
- Use longer expiration for refresh tokens but implement revocation
- Include issuer and audience claims for additional validation

### Password Security

**Password Policy Configuration:**
```bash
# Password requirements
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SYMBOLS=true
PASSWORD_HISTORY_COUNT=5          # Prevent reuse of last 5 passwords
PASSWORD_MAX_AGE_DAYS=90          # Force password change every 90 days

# Account lockout policy
ACCOUNT_LOCKOUT_THRESHOLD=5       # Lock after 5 failed attempts
ACCOUNT_LOCKOUT_DURATION=1800     # Lock for 30 minutes
ACCOUNT_LOCKOUT_RESET_TIME=900    # Reset counter after 15 minutes
```

**bcrypt Configuration:**
```bash
# Hash rounds (higher = more secure but slower)
HASH_ROUNDS=12                    # Recommended for production
# HASH_ROUNDS=10                  # For development/testing
```

### Multi-Factor Authentication (MFA)

**TOTP Configuration:**
```bash
# Time-based One-Time Password settings
MFA_ENABLED=true
MFA_REQUIRED_FOR_ADMIN=true       # Require MFA for admin accounts
MFA_BACKUP_CODES_COUNT=10         # Number of backup codes to generate
MFA_WINDOW_SIZE=1                 # Allow 1 time step tolerance
MFA_ISSUER=SeraphC2
```

**MFA Enforcement:**
```bash
# Grace period for MFA setup (seconds)
MFA_GRACE_PERIOD=86400           # 24 hours to set up MFA

# MFA bypass for emergency access
MFA_EMERGENCY_BYPASS_ENABLED=false
MFA_EMERGENCY_BYPASS_CODE=emergency_access_code_change_me
```

## Data Encryption

### Encryption at Rest

**Database Encryption:**
```bash
# Enable database encryption
DB_ENCRYPTION_ENABLED=true
DB_ENCRYPTION_KEY=$(openssl rand -base64 32 | head -c 32)

# Transparent Data Encryption (TDE) for PostgreSQL
DB_TDE_ENABLED=true
DB_TDE_KEY_ROTATION_DAYS=90
```

**File System Encryption:**
```bash
# Encrypt uploaded files
FILE_ENCRYPTION_ENABLED=true
FILE_ENCRYPTION_ALGORITHM=AES-256-GCM
FILE_ENCRYPTION_KEY=$(openssl rand -base64 32 | head -c 32)

# Encrypt log files
LOG_ENCRYPTION_ENABLED=true
LOG_ENCRYPTION_KEY=$(openssl rand -base64 32 | head -c 32)
```

### Encryption in Transit

**TLS/SSL Configuration:**
```bash
# TLS settings
TLS_ENABLED=true
TLS_MIN_VERSION=TLSv1.2
TLS_MAX_VERSION=TLSv1.3
TLS_PREFER_SERVER_CIPHERS=true

# Certificate paths
SSL_CERT_PATH=/etc/ssl/certs/seraphc2.crt
SSL_KEY_PATH=/etc/ssl/private/seraphc2.key
SSL_CA_PATH=/etc/ssl/certs/ca-bundle.crt

# Certificate validation
SSL_VERIFY_PEER=true
SSL_VERIFY_HOST=true
SSL_CHECK_HOSTNAME=true
```

**Cipher Suite Configuration:**
```bash
# Strong cipher suites only
TLS_CIPHERS="ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA256"

# Disable weak ciphers
TLS_DISABLE_WEAK_CIPHERS=true
TLS_DISABLE_SSLv2=true
TLS_DISABLE_SSLv3=true
TLS_DISABLE_TLSv1=true
TLS_DISABLE_TLSv1_1=true
```

### Application-Level Encryption

**Sensitive Data Encryption:**
```bash
# Encryption for sensitive fields
FIELD_ENCRYPTION_ENABLED=true
FIELD_ENCRYPTION_KEY=$(openssl rand -base64 32 | head -c 32)
FIELD_ENCRYPTION_ALGORITHM=AES-256-GCM

# Fields to encrypt (comma-separated)
ENCRYPTED_FIELDS=password,api_key,secret,token,private_key
```

## Network Security

### Firewall Configuration

**Iptables Rules Example:**
```bash
#!/bin/bash
# Basic firewall configuration for SeraphC2

# Flush existing rules
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X

# Default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow SSH (restrict to management networks)
iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -s 192.168.0.0/16 -j ACCEPT

# Allow HTTP/HTTPS
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Allow SeraphC2 application ports
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
iptables -A INPUT -p tcp --dport 8443 -j ACCEPT

# Allow database (internal networks only)
iptables -A INPUT -p tcp --dport 5432 -s 10.0.0.0/8 -j ACCEPT

# Allow Redis (internal networks only)
iptables -A INPUT -p tcp --dport 6379 -s 10.0.0.0/8 -j ACCEPT

# Allow monitoring (internal networks only)
iptables -A INPUT -p tcp --dport 9090 -s 10.0.0.0/8 -j ACCEPT

# Log dropped packets
iptables -A INPUT -j LOG --log-prefix "DROPPED: "

# Save rules
iptables-save > /etc/iptables/rules.v4
```

### Rate Limiting and DDoS Protection

**Application-Level Rate Limiting:**
```bash
# Global rate limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000       # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100       # 100 requests per window

# Authentication rate limiting
AUTH_RATE_LIMIT_WINDOW_MS=300000  # 5 minutes
AUTH_RATE_LIMIT_MAX_ATTEMPTS=5    # 5 login attempts per window

# API rate limiting
API_RATE_LIMIT_WINDOW_MS=3600000  # 1 hour
API_RATE_LIMIT_MAX_REQUESTS=1000  # 1000 API calls per hour

# Per-IP rate limiting
IP_RATE_LIMIT_ENABLED=true
IP_RATE_LIMIT_MAX_REQUESTS=50     # 50 requests per IP per window
```

**Nginx Rate Limiting:**
```nginx
# /etc/nginx/conf.d/rate-limiting.conf

# Define rate limiting zones
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=1r/s;
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;

server {
    # General rate limiting
    limit_req zone=general burst=20 nodelay;
    
    # Authentication endpoints
    location /api/auth/ {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://seraphc2_backend;
    }
    
    # API endpoints
    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://seraphc2_backend;
    }
}
```

### Network Segmentation

**VLAN Configuration:**
```bash
# Network segmentation recommendations

# Management Network (VLAN 10)
# - Administrative access
# - Monitoring systems
# - Backup systems

# Application Network (VLAN 20)
# - SeraphC2 application servers
# - Load balancers
# - Web servers

# Database Network (VLAN 30)
# - Database servers
# - Redis servers
# - Internal services only

# DMZ Network (VLAN 40)
# - External-facing services
# - Reverse proxies
# - Public endpoints
```

## Input Validation and Sanitization

### Request Validation

**Express Validator Configuration:**
```javascript
// Input validation middleware
const { body, param, query, validationResult } = require('express-validator');

// User input validation
const validateUserInput = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username must be 3-50 characters, alphanumeric with _ and -'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required'),
  
  body('password')
    .isLength({ min: 12 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must meet complexity requirements'),
];

// Command validation
const validateCommand = [
  body('command')
    .isLength({ min: 1, max: 1000 })
    .matches(/^[a-zA-Z0-9\s\-_\.\/\\:]+$/)
    .withMessage('Invalid command format'),
  
  body('implantId')
    .isUUID()
    .withMessage('Valid implant ID required'),
];
```

**Environment Variable Validation:**
```bash
# Input validation settings
INPUT_VALIDATION_ENABLED=true
INPUT_VALIDATION_STRICT_MODE=true
INPUT_VALIDATION_MAX_LENGTH=10000
INPUT_VALIDATION_ALLOW_HTML=false
INPUT_VALIDATION_SANITIZE_SQL=true

# File upload validation
FILE_UPLOAD_MAX_SIZE=10485760     # 10MB
FILE_UPLOAD_ALLOWED_TYPES=pdf,txt,log,json,csv
FILE_UPLOAD_SCAN_ENABLED=true
FILE_UPLOAD_QUARANTINE_SUSPICIOUS=true
```

### SQL Injection Prevention

**Database Security Configuration:**
```bash
# Parameterized queries enforcement
DB_FORCE_PARAMETERIZED_QUERIES=true
DB_DISABLE_DYNAMIC_SQL=true
DB_LOG_QUERIES=true
DB_LOG_SLOW_QUERIES=true
DB_SLOW_QUERY_THRESHOLD=1000      # Log queries taking >1 second

# Database user permissions (principle of least privilege)
DB_USER_PERMISSIONS=SELECT,INSERT,UPDATE,DELETE
DB_DISABLE_DDL=true               # Disable CREATE, ALTER, DROP
DB_DISABLE_ADMIN_FUNCTIONS=true   # Disable administrative functions
```

### XSS Prevention

**Content Security Policy (CSP):**
```bash
# CSP configuration
CSP_ENABLED=true
CSP_DEFAULT_SRC="'self'"
CSP_SCRIPT_SRC="'self' 'unsafe-inline'"
CSP_STYLE_SRC="'self' 'unsafe-inline'"
CSP_IMG_SRC="'self' data: https:"
CSP_FONT_SRC="'self'"
CSP_CONNECT_SRC="'self'"
CSP_FRAME_ANCESTORS="'none'"
CSP_REPORT_URI="/api/csp-report"
```

**Output Encoding:**
```bash
# Output encoding settings
OUTPUT_ENCODING_ENABLED=true
OUTPUT_ENCODING_HTML=true
OUTPUT_ENCODING_JAVASCRIPT=true
OUTPUT_ENCODING_CSS=true
OUTPUT_ENCODING_URL=true
```

## Session Security

### Session Configuration

**Secure Session Settings:**
```bash
# Session security
SESSION_SECURE_COOKIES=true       # Require HTTPS
SESSION_HTTP_ONLY=true           # Prevent XSS access
SESSION_SAME_SITE=strict         # CSRF protection
SESSION_DOMAIN=.yourdomain.com   # Restrict to domain

# Session lifecycle
SESSION_TTL_SECONDS=3600         # 1 hour session timeout
SESSION_MAX_IDLE_SECONDS=1800    # 30 minutes idle timeout
SESSION_ABSOLUTE_TIMEOUT=28800   # 8 hours absolute timeout
SESSION_REGENERATE_ON_AUTH=true  # Regenerate session ID on login

# Session storage
SESSION_STORE=redis              # Use Redis for session storage
SESSION_ENCRYPTION_ENABLED=true # Encrypt session data
SESSION_ENCRYPTION_KEY=$(openssl rand -base64 32 | head -c 32)
```

### CSRF Protection

**CSRF Configuration:**
```bash
# CSRF protection
CSRF_ENABLED=true
CSRF_SECRET=$(openssl rand -base64 32)
CSRF_COOKIE_NAME=_csrf
CSRF_HEADER_NAME=X-CSRF-Token
CSRF_SAME_ORIGIN_ONLY=true
CSRF_SECURE_COOKIE=true
```

## API Security

### API Authentication

**API Key Management:**
```bash
# API key settings
API_KEY_ENABLED=true
API_KEY_HEADER_NAME=X-API-Key
API_KEY_MIN_LENGTH=32
API_KEY_EXPIRY_DAYS=365
API_KEY_ROTATION_ENABLED=true
API_KEY_ROTATION_WARNING_DAYS=30

# API key permissions
API_KEY_SCOPE_ENFORCEMENT=true
API_KEY_RATE_LIMITING=true
API_KEY_IP_RESTRICTION_ENABLED=true
```

### API Rate Limiting

**Advanced Rate Limiting:**
```bash
# Tiered rate limiting
API_RATE_LIMIT_TIER_1=100        # Basic tier: 100 requests/hour
API_RATE_LIMIT_TIER_2=500        # Premium tier: 500 requests/hour
API_RATE_LIMIT_TIER_3=2000       # Enterprise tier: 2000 requests/hour

# Burst protection
API_BURST_LIMIT=10               # Allow 10 requests in burst
API_BURST_WINDOW=60              # 1 minute burst window

# Rate limit headers
API_RATE_LIMIT_HEADERS=true
API_RATE_LIMIT_SKIP_SUCCESS=false
```

## Audit Logging and Monitoring

### Security Event Logging

**Audit Configuration:**
```bash
# Audit logging
AUDIT_LOGGING_ENABLED=true
AUDIT_LOG_LEVEL=info
AUDIT_LOG_FILE=/var/log/seraphc2/audit.log
AUDIT_LOG_MAX_SIZE=100MB
AUDIT_LOG_MAX_FILES=10
AUDIT_LOG_COMPRESS=true

# Events to audit
AUDIT_LOGIN_ATTEMPTS=true
AUDIT_PERMISSION_CHANGES=true
AUDIT_DATA_ACCESS=true
AUDIT_CONFIGURATION_CHANGES=true
AUDIT_SYSTEM_EVENTS=true
AUDIT_API_CALLS=true
```

**Security Event Categories:**
```bash
# Authentication events
LOG_AUTH_SUCCESS=true
LOG_AUTH_FAILURE=true
LOG_AUTH_LOCKOUT=true
LOG_PASSWORD_CHANGES=true
LOG_MFA_EVENTS=true

# Authorization events
LOG_PERMISSION_DENIED=true
LOG_PRIVILEGE_ESCALATION=true
LOG_ROLE_CHANGES=true

# Data access events
LOG_DATA_ACCESS=true
LOG_DATA_EXPORT=true
LOG_FILE_UPLOADS=true
LOG_FILE_DOWNLOADS=true

# System events
LOG_CONFIGURATION_CHANGES=true
LOG_SERVICE_STARTS=true
LOG_SERVICE_STOPS=true
LOG_ERROR_CONDITIONS=true
```

### Intrusion Detection

**Anomaly Detection:**
```bash
# Intrusion detection
IDS_ENABLED=true
IDS_FAILED_LOGIN_THRESHOLD=5
IDS_UNUSUAL_ACTIVITY_DETECTION=true
IDS_GEO_LOCATION_TRACKING=true
IDS_DEVICE_FINGERPRINTING=true

# Automated responses
IDS_AUTO_BLOCK_ENABLED=true
IDS_AUTO_BLOCK_DURATION=3600     # 1 hour
IDS_ALERT_THRESHOLD=3
IDS_NOTIFICATION_ENABLED=true
```

## Secrets Management

### Environment-Based Secrets

**Development Environment:**
```bash
# Use simple secrets for development (NOT for production)
JWT_SECRET=dev_jwt_secret_32_characters_minimum
ENCRYPTION_KEY=dev_encryption_key_exactly_32_chars
DB_PASSWORD=dev_password
REDIS_PASSWORD=dev_redis_password
```

**Production Environment with External Secrets Manager:**
```bash
# AWS Secrets Manager
SECRETS_MANAGER=aws
AWS_REGION=us-west-2
AWS_SECRETS_PREFIX=seraphc2/prod/

# Secrets to retrieve from AWS Secrets Manager
JWT_SECRET_ARN=arn:aws:secretsmanager:us-west-2:123456789012:secret:seraphc2/prod/jwt-secret
ENCRYPTION_KEY_ARN=arn:aws:secretsmanager:us-west-2:123456789012:secret:seraphc2/prod/encryption-key
DB_PASSWORD_ARN=arn:aws:secretsmanager:us-west-2:123456789012:secret:seraphc2/prod/db-password
```

**HashiCorp Vault Integration:**
```bash
# Vault configuration
VAULT_ENABLED=true
VAULT_ADDR=https://vault.yourdomain.com:8200
VAULT_TOKEN_FILE=/etc/seraphc2/vault-token
VAULT_MOUNT_PATH=secret/seraphc2/prod
VAULT_RENEWAL_ENABLED=true
VAULT_RENEWAL_THRESHOLD=3600     # Renew token 1 hour before expiry
```

### Secret Rotation

**Automated Secret Rotation:**
```bash
# Secret rotation settings
SECRET_ROTATION_ENABLED=true
SECRET_ROTATION_SCHEDULE="0 2 * * 0"  # Weekly on Sunday at 2 AM
SECRET_ROTATION_NOTIFICATION=true
SECRET_ROTATION_BACKUP_COUNT=3

# Rotation policies
JWT_SECRET_ROTATION_DAYS=90
ENCRYPTION_KEY_ROTATION_DAYS=180
API_KEY_ROTATION_DAYS=365
DB_PASSWORD_ROTATION_DAYS=90
```

## Security Headers

### HTTP Security Headers

**Nginx Security Headers:**
```nginx
# Security headers configuration
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

# HSTS (HTTP Strict Transport Security)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Content Security Policy
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';" always;
```

**Application Security Headers:**
```bash
# Security headers configuration
SECURITY_HEADERS_ENABLED=true
HSTS_ENABLED=true
HSTS_MAX_AGE=31536000
HSTS_INCLUDE_SUBDOMAINS=true
HSTS_PRELOAD=true

FRAME_OPTIONS=DENY
CONTENT_TYPE_OPTIONS=nosniff
XSS_PROTECTION=1; mode=block
REFERRER_POLICY=strict-origin-when-cross-origin
```

## Compliance and Standards

### Security Standards Compliance

**OWASP Top 10 Mitigation:**
```bash
# OWASP compliance settings
OWASP_COMPLIANCE_ENABLED=true
OWASP_INJECTION_PROTECTION=true
OWASP_BROKEN_AUTH_PROTECTION=true
OWASP_SENSITIVE_DATA_PROTECTION=true
OWASP_XXE_PROTECTION=true
OWASP_BROKEN_ACCESS_CONTROL_PROTECTION=true
OWASP_SECURITY_MISCONFIGURATION_PROTECTION=true
OWASP_XSS_PROTECTION=true
OWASP_INSECURE_DESERIALIZATION_PROTECTION=true
OWASP_VULNERABLE_COMPONENTS_PROTECTION=true
OWASP_INSUFFICIENT_LOGGING_PROTECTION=true
```

### Regulatory Compliance

**GDPR Compliance:**
```bash
# GDPR settings
GDPR_COMPLIANCE_ENABLED=true
GDPR_DATA_RETENTION_DAYS=2555    # 7 years
GDPR_RIGHT_TO_ERASURE=true
GDPR_DATA_PORTABILITY=true
GDPR_CONSENT_TRACKING=true
GDPR_BREACH_NOTIFICATION=true
```

**SOC 2 Compliance:**
```bash
# SOC 2 compliance
SOC2_COMPLIANCE_ENABLED=true
SOC2_ACCESS_CONTROLS=true
SOC2_AUDIT_LOGGING=true
SOC2_DATA_ENCRYPTION=true
SOC2_INCIDENT_RESPONSE=true
SOC2_MONITORING=true
```

## Security Testing

### Automated Security Testing

**Security Scanning Configuration:**
```bash
# Security testing
SECURITY_TESTING_ENABLED=true
VULNERABILITY_SCANNING_ENABLED=true
DEPENDENCY_SCANNING_ENABLED=true
STATIC_CODE_ANALYSIS_ENABLED=true
DYNAMIC_SECURITY_TESTING_ENABLED=true

# Scanning schedules
VULNERABILITY_SCAN_SCHEDULE="0 3 * * *"    # Daily at 3 AM
DEPENDENCY_SCAN_SCHEDULE="0 4 * * 1"       # Weekly on Monday at 4 AM
```

### Penetration Testing

**Penetration Testing Configuration:**
```bash
# Penetration testing settings
PENTEST_MODE_ENABLED=false       # Enable only during testing
PENTEST_LOGGING_ENABLED=true
PENTEST_RATE_LIMIT_BYPASS=false  # Don't bypass rate limits
PENTEST_AUTH_BYPASS=false        # Don't bypass authentication
```

## Security Incident Response

### Incident Detection and Response

**Incident Response Configuration:**
```bash
# Incident response
INCIDENT_RESPONSE_ENABLED=true
INCIDENT_AUTO_DETECTION=true
INCIDENT_NOTIFICATION_ENABLED=true
INCIDENT_ESCALATION_ENABLED=true

# Response actions
INCIDENT_AUTO_BLOCK_ENABLED=true
INCIDENT_AUTO_ISOLATE_ENABLED=false
INCIDENT_FORENSICS_ENABLED=true
INCIDENT_BACKUP_ENABLED=true
```

### Emergency Procedures

**Emergency Access Configuration:**
```bash
# Emergency access
EMERGENCY_ACCESS_ENABLED=false   # Disable by default
EMERGENCY_ACCESS_CODE=emergency_code_change_immediately
EMERGENCY_ACCESS_DURATION=3600   # 1 hour emergency access
EMERGENCY_ACCESS_LOGGING=true
EMERGENCY_ACCESS_NOTIFICATION=true
```

This security configuration guide provides comprehensive coverage of all security aspects of SeraphC2. Regular review and updates of these configurations are essential for maintaining a secure deployment. Always test security configurations in a staging environment before applying to production.