# Contributing to SeraphC2

Thank you for your interest in contributing to SeraphC2! This document provides guidelines and information for contributors to help maintain code quality and ensure a smooth development process.

## ⚠️ Important Security Notice

SeraphC2 is a command and control framework designed for **authorized security testing and research purposes only**. By contributing to this project, you acknowledge that:

- This tool should only be used in environments where you have explicit permission
- Contributors are responsible for ensuring their contributions do not enable malicious activities
- All contributions must comply with applicable laws and regulations
- The project maintainers reserve the right to reject contributions that could facilitate unauthorized access

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- PostgreSQL 14+
- Redis 6+
- Git

### Development Environment Setup

1. **Fork and Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/seraphc2.git
   cd seraphc2
   ```

2. **Install Dependencies**
   ```bash
   npm install
   cd web-client && npm install && cd ..
   ```

3. **Set Up Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. **Start Development Services**
   ```bash
   docker-compose up -d postgres redis
   npm run dev
   ```

5. **Run Tests**
   ```bash
   npm test
   npm run test:integration
   ```

## Development Workflow

### Branch Strategy

- `main` - Production-ready code, protected branch
- `develop` - Integration branch for features
- `feature/*` - Feature development branches
- `bugfix/*` - Bug fix branches
- `hotfix/*` - Critical production fixes

### Making Changes

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   - Follow the coding standards outlined below
   - Write tests for new functionality
   - Update documentation as needed

3. **Test Your Changes**
   ```bash
   npm run lint
   npm run format:check
   npm test
   npm run test:integration
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

5. **Push and Create Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Coding Standards

### TypeScript Guidelines

- Use TypeScript for all new code
- Enable strict mode in tsconfig.json
- Provide explicit type annotations for public APIs
- Use interfaces for object shapes
- Prefer `const` assertions for immutable data

### Code Style

- Use Prettier for code formatting (configured in `.prettierrc`)
- Use ESLint for code linting (configured in `.eslintrc.json`)
- Follow naming conventions:
  - `camelCase` for variables and functions
  - `PascalCase` for classes and interfaces
  - `UPPER_SNAKE_CASE` for constants
  - `kebab-case` for file names

### Testing Requirements

- **Unit Tests**: All new functions and classes must have unit tests
- **Integration Tests**: API endpoints and database interactions require integration tests
- **Test Coverage**: Maintain minimum 80% code coverage
- **Test Naming**: Use descriptive test names that explain the scenario

Example test structure:
```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', async () => {
      // Test implementation
    });
    
    it('should throw error when email already exists', async () => {
      // Test implementation
    });
  });
});
```

## Commit Message Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) for automated changelog generation and semantic versioning.

### Format
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples
```
feat(auth): add JWT token validation
fix(database): resolve connection pool leak
docs(api): update endpoint documentation
test(user): add integration tests for user creation
```

## Pull Request Process

### Before Submitting

- [ ] Code follows the style guidelines
- [ ] Self-review of code completed
- [ ] Tests added for new functionality
- [ ] All tests pass locally
- [ ] Documentation updated if needed
- [ ] No merge conflicts with target branch

### Pull Request Template

When creating a pull request, please use the provided template and include:

- Clear description of changes
- Link to related issues
- Testing instructions
- Screenshots (if UI changes)
- Breaking changes (if any)

### Review Process

1. **Automated Checks**: All CI checks must pass
2. **Code Review**: At least one maintainer review required
3. **Testing**: Reviewers may test changes locally
4. **Approval**: Maintainer approval required for merge

## Issue Reporting

### Bug Reports

Use the bug report template and include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment information
- Relevant logs or screenshots

### Feature Requests

Use the feature request template and include:
- Clear description of the proposed feature
- Use case and motivation
- Proposed implementation approach
- Potential alternatives considered

## Security Considerations

### Reporting Security Vulnerabilities

**Do not report security vulnerabilities through public GitHub issues.**

Please follow our [Security Policy](SECURITY.md) for responsible disclosure.

### Security Guidelines for Contributors

- Never commit secrets, API keys, or passwords
- Use environment variables for sensitive configuration
- Validate all user inputs
- Follow OWASP security guidelines
- Consider security implications of new features

## Documentation

### Code Documentation

- Use JSDoc comments for public APIs
- Include examples in documentation
- Document complex algorithms and business logic
- Keep README files up to date

### API Documentation

- Update OpenAPI/Swagger specifications for API changes
- Include request/response examples
- Document error codes and messages
- Provide integration examples

## Performance Guidelines

- Profile performance-critical code
- Use appropriate data structures and algorithms
- Implement proper caching strategies
- Monitor memory usage and prevent leaks
- Consider scalability implications

## Database Guidelines

### Migrations

- Create migrations for all schema changes
- Test migrations on sample data
- Provide rollback procedures
- Document breaking changes

### Queries

- Use parameterized queries to prevent SQL injection
- Optimize query performance
- Use appropriate indexes
- Consider transaction boundaries

## Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and community discussion
- **Security Issues**: Follow the security policy for private disclosure

### Resources

- [Project Documentation](docs/)
- [API Documentation](docs/api/)
- [Development Setup Guide](docs/DEVELOPMENT.md)
- [Security Policy](SECURITY.md)

## Recognition

Contributors will be recognized in:
- CHANGELOG.md for significant contributions
- GitHub contributors list
- Release notes for major features

## License

By contributing to SeraphC2, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for contributing to SeraphC2! Your efforts help make this project better for the security research community.