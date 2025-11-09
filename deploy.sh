#!/bin/bash

# Automated deployment script for PigeonIdP to Fly.io
# This script deploys without interactive prompts

set -e  # Exit on error

echo "🚀 Deploying PigeonIdP to Fly.io (non-interactive)..."

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "❌ Error: flyctl is not installed"
    echo "Install it from: https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# Check if logged in
if ! flyctl auth whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Fly.io"
    echo "Run: flyctl auth login"
    exit 1
fi

# Deploy with automatic yes to all prompts
echo "📦 Building and deploying..."
flyctl deploy --yes --ha=false

# Check deployment status
echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔍 Checking health..."
sleep 3
curl -s https://pigeonidp.fly.dev/health | jq '.' || echo "Health check endpoint not responding yet"

echo ""
echo "📊 App status:"
flyctl status

echo ""
echo "🌐 Your app is live at: https://pigeonidp.fly.dev"
echo "📋 View logs: npm run logs"
echo "📈 Dashboard: https://fly.io/apps/pigeonidp"
