# Performance Testing Suite

This directory contains comprehensive performance tests for SeraphC2, including load testing and stress testing capabilities.

## Test Files

### `load.test.ts`
- **Purpose**: Tests system performance under normal and high load conditions
- **Features**:
  - Concurrent user simulation
  - Response time measurement
  - Throughput analysis
  - Memory usage monitoring
  - Database connection pool testing

### `stress.test.ts`
- **Purpose**: Tests system behavior under extreme load conditions
- **Features**:
  - Progressive load increase until breaking point
  - Spike load testing
  - Memory stress testing
  - Connection pool exhaustion testing
  - Long-running stability testing

## Running Performance Tests

### Using Jest
```bash
# Run all performance tests
npm run test:performance

# Run only load tests
npm test -- --testPathPattern=performance/load.test.ts

# Run only stress tests
npm test -- --testPathPattern=performance/stress.test.ts
```

### Using Performance Script
```bash
# Run comprehensive performance testing with reporting
npm run performance:test

# Run only load tests
npm run performance:load

# Run only stress tests
npm run performance:stress
```

## Performance Metrics

The tests measure and report:

- **Response Time**: Average, minimum, and maximum response times
- **Throughput**: Requests per second (RPS)
- **Error Rate**: Percentage of failed requests
- **Memory Usage**: Heap memory consumption during tests
- **Concurrency**: Number of concurrent users supported
- **Breaking Point**: Maximum load before system degradation

## Test Configuration

### Load Test Configuration
- **Concurrent Users**: 10-100 users
- **Requests per User**: 5-30 requests
- **Test Duration**: 15-60 seconds
- **Ramp-up Time**: 2-5 seconds

### Stress Test Configuration
- **Progressive Load**: 10-300 users (incremental)
- **Spike Testing**: Sudden load increases
- **Endurance Testing**: 2+ minutes sustained load
- **Memory Limits**: Monitor up to 1GB usage

## Performance Benchmarks

### Expected Performance Targets
- **Response Time**: < 1000ms for 95% of requests
- **Throughput**: > 100 RPS for health endpoints
- **Error Rate**: < 1% under normal load
- **Memory Growth**: < 50% increase during testing

### Breaking Point Indicators
- Error rate > 50%
- Average response time > 10 seconds
- Memory usage > 1GB
- Connection pool exhaustion

## Reports

Performance test results are saved to:
- `performance-reports/` directory
- JSON format with detailed metrics
- Summary reports for quick analysis
- Historical comparison data

## Troubleshooting

### Common Issues
1. **Port Conflicts**: Tests use ports 3001-3002, ensure they're available
2. **Database Connections**: Tests require database access
3. **Memory Limits**: Increase Node.js memory if needed: `--max-old-space-size=4096`
4. **Timeouts**: Long-running tests may need increased Jest timeout

### Performance Optimization Tips
1. Monitor database query performance
2. Check connection pool configuration
3. Analyze memory leaks during sustained load
4. Review error handling under stress conditions

## Integration with CI/CD

Performance tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Run Performance Tests
  run: |
    npm run performance:test
    # Upload performance reports as artifacts
```

Consider running performance tests:
- On release branches
- Nightly builds
- Before production deployments
- After significant changes