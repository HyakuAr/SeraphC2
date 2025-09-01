# SeraphC2 Web Client

The SeraphC2 Web Management Interface is a React-based frontend application that provides operators with a comprehensive dashboard for managing C2 operations.

## Features

- **SeraphC2 Branding**: Professional branded interface with seraphim-inspired graphics
- **Authentication**: JWT-based authentication with automatic token refresh
- **Responsive Design**: Works on desktop and tablet devices
- **Material-UI**: Modern, accessible UI components
- **Real-time Updates**: WebSocket integration for live data
- **Role-based Access**: Support for different operator permission levels

## Technology Stack

- **React 18** with TypeScript for type safety
- **Material-UI (MUI)** for UI components and theming
- **Redux Toolkit** for state management
- **React Router** for navigation
- **Axios** for API communication
- **Jest & React Testing Library** for testing

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- SeraphC2 server running on port 3001

### Installation

```bash
cd web-client
npm install
```

### Development

```bash
# Start development server
npm start

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Build for production
npm run build
```

The development server will start on `http://localhost:3000` and proxy API requests to the SeraphC2 server on `http://localhost:3001`.

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Auth/           # Authentication components
│   ├── Branding/       # SeraphC2 branding components
│   └── Layout/         # Layout and navigation components
├── pages/              # Page components
├── services/           # API service layer
├── store/              # Redux store and slices
├── theme/              # Material-UI theme configuration
└── __tests__/          # Test files
```

## Authentication

The web client implements JWT-based authentication with the following features:

- Secure login with username/password
- Automatic token refresh
- Protected routes
- Session persistence
- Logout functionality

## Theming

The SeraphC2 theme features:

- Dark mode design
- Divine blue primary color (#1976d2)
- Golden secondary color (#ffd700) for accents
- Seraphim-inspired branding elements
- Semi-transparent watermark background

## Testing

The project includes comprehensive tests for:

- Authentication components and flows
- Redux state management
- API service layer
- Protected routing
- User interactions

Run tests with:

```bash
npm test
```

## Environment Variables

Create a `.env` file in the web-client directory:

```
REACT_APP_API_URL=http://localhost:3001
```

## Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` directory.

## Integration with SeraphC2 Server

The web client communicates with the SeraphC2 server through REST API endpoints:

- `POST /api/auth/login` - User authentication
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Token refresh
- `GET /api/auth/me` - Get current user info

The client automatically handles token refresh and redirects to login on authentication failures.