# Migration and Upgrade Guide

This directory contains version-specific migration guides and upgrade procedures for SeraphC2.

## Overview

SeraphC2 uses database migrations to manage schema changes and data transformations between versions. This guide covers:

- Database migration procedures
- Version upgrade processes
- Compatibility requirements
- Rollback procedures
- Troubleshooting common issues

## Quick Start

### Running Migrations

```bash
# Check migration status
npm run migrate:status

# Run all pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Create new migration
npm run migrate:create "description of changes"
```

### Upgrading Between Versions

1. **Backup your database** before any upgrade
2. Check the version-specific upgrade guide
3. Run database migrations
4. Update configuration files if needed
5. Restart the application
6. Verify the upgrade was successful

## Migration Commands

### Status Check
```bash
ts-node scripts/migrate.ts status
```
Shows current migration status, including applied and pending migrations.

### Apply Migrations
```bash
# Apply all pending migrations
ts-node scripts/migrate.ts up

# Apply specific number of migrations
ts-node scripts/migrate.ts up 3
```

### Rollback Migrations
```bash
# Rollback last migration
ts-node scripts/migrate.ts down

# Rollback specific number of migrations
ts-node scripts/migrate.ts down 2
```

### Create New Migration
```bash
ts-node scripts/migrate.ts create "add new feature table"
```

### Validate Migrations
```bash
ts-node scripts/migrate.ts validate
```

## Database Configuration

Migrations use the same database configuration as the main application:

### Environment Variables
```bash
# Full connection string (recommended)
DATABASE_URL=postgresql://user:password@localhost:5432/seraphc2

# Or individual components
DB_HOST=localhost
DB_PORT=5432
DB_NAME=seraphc2
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false  # Set to true in production
```

### Configuration Files
- `.env` - Development configuration
- `.env.production` - Production configuration
- `.env.staging` - Staging configuration

## Migration File Format

Migration files follow this structure:

```sql
-- Migration: Description of changes
-- Created: 2024-01-01T00:00:00.000Z
-- Description: Detailed description of what this migration does

-- Up migration
BEGIN;

-- Your migration SQL here
CREATE TABLE example_table (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMIT;

-- Down migration (for rollback)
-- BEGIN;
-- DROP TABLE IF EXISTS example_table;
-- COMMIT;
```

### Best Practices

1. **Always use transactions** - Wrap changes in BEGIN/COMMIT
2. **Include rollback SQL** - Add down migration for rollbacks
3. **Test migrations** - Test both up and down migrations
4. **Use descriptive names** - Make migration purpose clear
5. **Avoid destructive operations** - Be careful with DROP statements
6. **Check dependencies** - Ensure required tables/columns exist

## Version-Specific Guides

- [v1.0.0 to v1.1.0](v1.0.0-to-v1.1.0.md) - Initial release to first update
- [v1.1.0 to v1.2.0](v1.1.0-to-v1.2.0.md) - API enhancements
- [v1.2.0 to v2.0.0](v1.2.0-to-v2.0.0.md) - Major version upgrade

## Backup and Recovery

### Before Upgrading

Always create a backup before running migrations:

```bash
# PostgreSQL backup
pg_dump -h localhost -U postgres -d seraphc2 > backup_$(date +%Y%m%d_%H%M%S).sql

# Or using Docker
docker exec postgres_container pg_dump -U postgres seraphc2 > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Recovery

If a migration fails or you need to rollback:

```bash
# Restore from backup
psql -h localhost -U postgres -d seraphc2 < backup_20240101_120000.sql

# Or rollback using migrations
ts-node scripts/migrate.ts down
```

## Troubleshooting

### Common Issues

#### Migration Fails with "relation does not exist"
- Check if dependent tables/columns exist
- Verify migration order
- Check for typos in table/column names

#### Migration Hangs or Times Out
- Check for long-running queries
- Verify database connectivity
- Look for blocking locks

#### Rollback Fails
- Check down migration SQL syntax
- Verify rollback dependencies
- Manual cleanup may be required

#### Version Mismatch
- Check current database version
- Verify migration files are present
- Run migration status check

### Getting Help

1. Check the [troubleshooting guide](../troubleshooting/common-issues.md)
2. Review migration logs
3. Check database logs
4. Create an issue with detailed error information

## Production Considerations

### Pre-Migration Checklist

- [ ] Database backup completed
- [ ] Maintenance window scheduled
- [ ] Migration tested in staging
- [ ] Rollback plan prepared
- [ ] Team notified

### Migration Strategy

1. **Blue-Green Deployment** - Recommended for zero-downtime
2. **Rolling Updates** - For compatible schema changes
3. **Maintenance Window** - For breaking changes

### Monitoring

- Monitor migration progress
- Watch for performance impact
- Check application logs
- Verify data integrity

## Security Considerations

- Migrations run with database admin privileges
- Review migration SQL for security issues
- Avoid logging sensitive data during migrations
- Use secure connections in production

## Performance Tips

- Run migrations during low-traffic periods
- Consider impact on large tables
- Use indexes appropriately
- Monitor query performance
- Plan for data migration time

## Contributing

When adding new migrations:

1. Follow naming conventions
2. Include both up and down migrations
3. Test thoroughly
4. Document breaking changes
5. Update version-specific guides

For more information, see the [contributing guide](../../CONTRIBUTING.md).