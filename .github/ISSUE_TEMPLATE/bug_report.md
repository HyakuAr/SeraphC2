---
name: Bug Report
about: Create a report to help us improve SeraphC2
title: '[BUG] '
labels: ['bug', 'needs-triage']
assignees: ''
---

## Bug Description

<!-- A clear and concise description of what the bug is -->

## Steps to Reproduce

<!-- Steps to reproduce the behavior -->

1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior

<!-- A clear and concise description of what you expected to happen -->

## Actual Behavior

<!-- A clear and concise description of what actually happened -->

## Screenshots

<!-- If applicable, add screenshots to help explain your problem -->

## Environment Information

### System Information
- **OS**: [e.g., Ubuntu 22.04, Windows 11, macOS 13.0]
- **Architecture**: [e.g., x64, arm64]
- **Node.js Version**: [e.g., 18.17.0]
- **npm Version**: [e.g., 9.6.7]

### SeraphC2 Information
- **Version**: [e.g., 1.2.3]
- **Installation Method**: [e.g., Docker, npm, source]
- **Configuration**: [e.g., default, custom - describe key changes]

### Database Information
- **Database Type**: [e.g., PostgreSQL]
- **Database Version**: [e.g., 14.8]
- **Connection Method**: [e.g., local, Docker, remote]

### Browser Information (if web-related)
- **Browser**: [e.g., Chrome, Firefox, Safari]
- **Version**: [e.g., 115.0.5790.110]

## Configuration Details

### Environment Variables
<!-- Share relevant environment variables (remove sensitive data) -->
```
NODE_ENV=development
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
# Add other relevant variables
```

### Docker Configuration (if applicable)
<!-- Share docker-compose.yml or Dockerfile modifications -->

## Error Logs

### Server Logs
<!-- Include relevant server error logs -->
```
[timestamp] ERROR: Error message here
[timestamp] STACK: Stack trace here
```

### Browser Console (if web-related)
<!-- Include browser console errors -->
```
Error: Error message here
    at function (file:line:column)
```

### Database Logs (if applicable)
<!-- Include relevant database error logs -->

## Network Information (if applicable)

- **Firewall**: [e.g., enabled/disabled, specific rules]
- **Proxy**: [e.g., none, corporate proxy]
- **Network Configuration**: [e.g., local network, VPN, cloud]

## Reproduction Details

### Minimal Reproduction Case
<!-- Provide the smallest possible code/configuration that reproduces the issue -->

### Frequency
- [ ] Always occurs
- [ ] Occurs sometimes
- [ ] Occurred once
- [ ] Cannot reproduce consistently

### Impact
- [ ] Blocks core functionality
- [ ] Reduces functionality
- [ ] Minor inconvenience
- [ ] Cosmetic issue

## Additional Context

### Recent Changes
<!-- Any recent changes to your setup that might be related -->

- [ ] Updated SeraphC2 version
- [ ] Changed configuration
- [ ] Updated dependencies
- [ ] Changed environment
- [ ] No recent changes

### Workarounds
<!-- Any workarounds you've found -->

### Related Issues
<!-- Link to any related issues -->

- Related to #
- Similar to #

## Security Considerations

<!-- Important: Do not include sensitive information -->

- [ ] This bug does not expose sensitive information
- [ ] No credentials or secrets included in this report
- [ ] This is not a security vulnerability (use SECURITY.md for those)

## Debugging Information

### What I've Tried
<!-- List troubleshooting steps you've already attempted -->

- [ ] Restarted the application
- [ ] Cleared cache/temporary files
- [ ] Checked configuration files
- [ ] Reviewed documentation
- [ ] Searched existing issues
- [ ] Tested with minimal configuration

### Debug Output
<!-- Include any debug output that might be helpful -->

```
# Add debug output here
```

## Checklist

<!-- Please check all applicable items -->

- [ ] I have searched existing issues for duplicates
- [ ] I have provided all requested information
- [ ] I have removed any sensitive information
- [ ] I can reproduce this issue consistently
- [ ] I have tested with the latest version
- [ ] I have included relevant logs and error messages

---

**Additional Notes:**
<!-- Add any other context about the problem here -->

**For Maintainers:**
<!-- This section will be filled by maintainers -->
- **Priority**: 
- **Component**: 
- **Assignee**: 
- **Milestone**: