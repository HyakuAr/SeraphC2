#!/bin/bash

# SeraphC2 Development Environment Setup Script

set -e

echo "🔧 Setting up SeraphC2 development environment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created. Please review and update the configuration."
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p logs
mkdir -p certificates
mkdir -p docker/nginx/ssl

# Generate self-signed certificates for development
if [ ! -f certificates/server.crt ]; then
    echo "🔐 Generating self-signed SSL certificates for development..."
    openssl req -x509 -newkey rsa:4096 -keyout certificates/server.key -out certificates/server.crt -days 365 -nodes -subj "/C=US/ST=Development/L=Development/O=SeraphC2/CN=localhost"
    echo "✅ SSL certificates generated."
fi

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Build the project
echo "🔨 Building the project..."
npm run build

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d postgres redis

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Run database migrations (when implemented)
# echo "🗄️ Running database migrations..."
# npm run migrate

# Run tests
echo "🧪 Running tests..."
npm test

echo "✅ Development environment setup complete!"
echo ""
echo "🚀 To start the development server:"
echo "   npm run dev"
echo ""
echo "🐳 To start all services with Docker:"
echo "   docker-compose up"
echo ""
echo "📊 To view logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 To stop services:"
echo "   docker-compose down"