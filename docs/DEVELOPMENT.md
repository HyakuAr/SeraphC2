# SeraphC2 Development Environment

This document describes how to set up and use the SeraphC2 development environment.

## Prerequisites

- Node.js 18+ 
- Docker and Docker Compose
- Git

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd seraphc2
   ```

2. **Run the setup script**
   ```bash
   ./scripts/dev-setup.sh
   ```

3. **Start development**
   ```bash
   npm run dev
   ```

## Manual Setup

### 1. Environment Configuration

Copy the environment template and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your preferred settings. The defaults are suitable for development.

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Services

Start the database and Redis services:

```bash
docker-compose up -d postgres redis
```

### 4. Run Tests

```bash
npm test
```

### 5. Start Development Server

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the project for production
- `npm run test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run format` - Format code with Prettier

## Docker Services

### PostgreSQL Database
- **Port**: 5432
- **Database**: seraphc2
- **Username**: seraphc2
- **Password**: seraphc2_dev_password

### Redis Cache
- **Port**: 6379
- **No authentication** (development only)

### SeraphC2 Server
- **Port**: 3000 (Main API)
- **Port**: 8080 (HTTP Protocol Handler)
- **Port**: 8443 (HTTPS Protocol Handler)

## Development Utilities

### Logging

The application uses Winston for structured logging:

```typescript
import { log } from '@utils/logger';

log.info('Information message', { context: 'data' });
log.error('Error message', error, { additional: 'context' });
log.security('Security event', { details });
log.audit('operator', 'action', 'target', { metadata });
```

### Configuration

Environment configuration is managed centrally:

```typescript
import { config, configUtils } from '@utils/config';

console.log(config.database.host);
console.log(configUtils.isDevelopment());
```

### Error Handling

Structured error handling with custom error types:

```typescript
import { ValidationError, asyncHandler } from '@utils/errors';

throw new ValidationError('Invalid input', { field: 'username' });

const safeFunction = asyncHandler(async () => {
  // Your async code here
});
```

## Testing

### Unit Tests
```bash
npm test -- --testPathPattern=unit
```

### Integration Tests
```bash
npm test -- --testPathPattern=integration
```

### Test Coverage
```bash
npm run test:coverage
```

## Troubleshooting

### Port Conflicts
If you encounter port conflicts, update the ports in `docker-compose.yml` and `.env`.

### Database Connection Issues
Ensure PostgreSQL is running and accessible:
```bash
docker-compose logs postgres
```

### Permission Issues
On Unix systems, ensure the setup script is executable:
```bash
chmod +x scripts/dev-setup.sh
```

## Project Structure

```
src/
├── core/          # Core C2 engine components
├── protocols/     # Communication protocol handlers
├── web/           # Web interface components
├── implant/       # Implant-related code
├── utils/         # Utility functions and helpers
└── types/         # TypeScript type definitions

tests/
├── unit/          # Unit tests
├── integration/   # Integration tests
└── e2e/           # End-to-end tests

docker/
├── server/        # Server Docker configuration
├── database/      # Database initialization scripts
└── redis/         # Redis configuration
```

## Next Steps

After setting up the development environment, you can:

1. Review the [Requirements Document](.kiro/specs/c2-server/requirements.md)
2. Study the [Design Document](.kiro/specs/c2-server/design.md)
3. Start implementing tasks from the [Implementation Plan](.kiro/specs/c2-server/tasks.md)

For more information, see the main [README.md](../README.md).