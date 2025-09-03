#!/bin/bash

# Test script to verify PostgreSQL installation fixes
echo "Testing PostgreSQL installation fixes..."

# Test system detection
echo "=== System Detection Test ==="
if [[ -f /etc/os-release ]]; then
    source /etc/os-release
    echo "OS ID: $ID"
    echo "Version ID: $VERSION_ID"
    echo "Version Codename: ${VERSION_CODENAME:-not set}"
fi

# Test lsb_release if available
if command -v lsb_release >/dev/null 2>&1; then
    echo "LSB Release info:"
    lsb_release -a 2>/dev/null
fi

# Test PostgreSQL repository availability
echo ""
echo "=== Repository Test ==="
echo "Testing PostgreSQL repository availability..."

# Check if we can reach the PostgreSQL repository
if curl -s --head "http://apt.postgresql.org/pub/repos/apt/" | head -n 1 | grep -q "200 OK"; then
    echo "✓ PostgreSQL repository is reachable"
else
    echo "✗ PostgreSQL repository is not reachable"
fi

# Test package availability
echo ""
echo "=== Package Availability Test ==="
apt-cache search postgresql | grep -E "^postgresql-[0-9]+" | head -5

echo ""
echo "Available PostgreSQL versions:"
apt-cache search postgresql-server | grep -E "postgresql-[0-9]+" | head -3

echo ""
echo "Test completed. Check the output above for any issues."