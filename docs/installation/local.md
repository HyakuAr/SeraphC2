# Local Development Setup Guide

This guide will help you set up SeraphC2 for local development on your machine.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

### Required Software

- **Node.js** (version 18.0 or higher)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version`
- **npm** (comes with Node.js)
  - Verify installation: `npm --version`
- **Git**
  - Download from [git-scm.com](https://git-scm.com/)
  - Verify installation: `git --version`

### Database Requirements

You'll need either:

**Option 1: Local Database Installation**
- **PostgreSQL** (version 13 or higher)
  - Download from [postgresql.org](https://www.postgresql.org/download/)
  - Verify installation: `psql --version`
- **Redis** (version 6 or higher)
  - Download from [redis.io](https://redis.io/download)
  - Verify installation: `redis-cli --version`

**Option 2: Docker (Recommended for Development)**
- **Docker Desktop**
  - Download from [docker.com](https://www.docker.com/products/docker-desktop)
  - Verify installation: `docker --version`
- **Docker Compose** (included with Docker Desktop)
  - Verify installation: `docker-compose --version`

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/seraphc2.git
cd seraphc2
```

### 2. Install Dependencies

Install the main application dependencies:

```bash
npm install
```

Install web client dependencies:

```bash
npm run install:web
```

### 3. Environment Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit the `.env` file with your preferred text editor and configure the following variables:

```bash
# Server Configuration
NODE_ENV=development
PORT=3000
HOST=localhost

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=seraphc2
DB_USER=seraphc2
DB_PASSWORD=your_secure_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Security Configuration
JWT_SECRET=your_jwt_secret_key_minimum_32_characters
ENCRYPTION_KEY=your_encryption_key_exactly_32_characters

# Logging
LOG_LEVEL=debug
```

### 4. Database Setup

#### Option A: Using Docker (Recommended)

Start the database services using Docker Compose:

```bash
docker-compose up -d postgres redis
```

This will start PostgreSQL and Redis containers with the default development configuration.

#### Option B: Local Database Installation

**PostgreSQL Setup:**

1. Create a database and user:
```sql
CREATE DATABASE seraphc2;
CREATE USER seraphc2 WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE seraphc2 TO seraphc2;
```

2. Update your `.env` file with the correct database credentials.

**Redis Setup:**

1. Start Redis server:
```bash
redis-server
```

2. (Optional) Set a password by editing `redis.conf`:
```
requirepass your_redis_password
```

### 5. Database Migration

Run the database migrations to set up the schema:

```bash
npm run migrate
```

### 6. Build the Application

Build the TypeScript application:

```bash
npm run build
```

Build the web client:

```bash
npm run build:web
```

### 7. Start Development Server

Start the development server with hot reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000` by default.

### 8. Start Web Client (Optional)

In a separate terminal, start the React development server:

```bash
npm run dev:web
```

The web client will be available at `http://localhost:3001`.

## Verification

### Health Check

Verify the server is running by accessing the health endpoint:

```bash
curl http://localhost:3000/health
```

You should receive a JSON response indicating the server status.

### Database Connection

Test the database connection:

```bash
npm run test:db
```

### Run Tests

Execute the test suite to ensure everything is working:

```bash
npm test
```

## Development Workflow

### Code Quality

Before committing code, run the linting and formatting tools:

```bash
# Check for linting errors
npm run lint

# Fix linting errors automatically
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

### Testing

Run different types of tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run end-to-end tests
npm run test:e2e
```

### Hot Reload Development

The development server supports hot reload for both the backend and frontend:

- Backend changes will automatically restart the server
- Frontend changes will automatically refresh the browser

## Troubleshooting

### Common Issues

**Port Already in Use**
```bash
Error: listen EADDRINUSE: address already in use :::3000
```
Solution: Change the `PORT` in your `.env` file or kill the process using the port:
```bash
# Find the process
lsof -i :3000
# Kill the process
kill -9 <PID>
```

**Database Connection Failed**
```bash
Error: connect ECONNREFUSED 127.0.0.1:5432
```
Solution: Ensure PostgreSQL is running and the connection details in `.env` are correct.

**Redis Connection Failed**
```bash
Error: connect ECONNREFUSED 127.0.0.1:6379
```
Solution: Ensure Redis is running and accessible.

**Permission Denied**
```bash
Error: EACCES: permission denied
```
Solution: Check file permissions or run with appropriate privileges.

### Getting Help

If you encounter issues:

1. Check the [troubleshooting guide](../troubleshooting/common-issues.md)
2. Review the application logs in the `logs/` directory
3. Ensure all prerequisites are properly installed
4. Verify your environment configuration
5. Check the [GitHub Issues](https://github.com/your-org/seraphc2/issues) for similar problems

## Next Steps

Once you have the local development environment running:

1. Read the [Development Guide](../DEVELOPMENT.md) for coding standards and practices
2. Review the [API Documentation](../api/README.md) to understand the available endpoints
3. Check out the [Contributing Guidelines](../../CONTRIBUTING.md) if you plan to contribute
4. Explore the [Configuration Reference](../configuration/environment.md) for advanced setup options

## Development Tools

### Recommended VS Code Extensions

- **TypeScript and JavaScript Language Features** (built-in)
- **ESLint** - For code linting
- **Prettier** - For code formatting
- **Jest** - For running tests
- **Docker** - For container management
- **PostgreSQL** - For database management

### Useful Commands

```bash
# Clean build artifacts
npm run clean

# Rebuild everything
npm run clean && npm run build

# Watch for TypeScript changes
npm run build:watch

# Performance testing
npm run performance:test

# Security testing
npm run test:security
```

This completes the local development setup. You should now have a fully functional SeraphC2 development environment running on your machine.