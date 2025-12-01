#!/bin/bash

echo "🚀 Starting Rust+ Web Development Environment"
echo "=============================================="
echo ""

# Check if Redis is running
echo "Checking Redis..."
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is running"
else
    echo "⚠️  Starting Redis..."
    redis-server --daemonize yes
    sleep 1
    if redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis started"
    else
        echo "❌ Failed to start Redis"
        exit 1
    fi
fi

echo ""
echo "Checking Supabase..."
# Check if Supabase is running
if curl -s http://127.0.0.1:54321/rest/v1/ > /dev/null 2>&1; then
    echo "✅ Supabase is already running"
else
    echo "⚠️  Starting Supabase (this may take a minute)..."
    npx supabase start
fi

echo ""
echo "=============================================="
echo "✅ Development environment ready!"
echo ""
echo "Services:"
echo "  📱 Next.js:          http://localhost:3000"
echo "  ☁️  Cloud Shim:       http://localhost:4000"
echo "  🗄️  Supabase Studio:  http://localhost:54323"
echo "  🔴 Redis:            localhost:6379"
echo ""
echo "To start the application:"
echo "  Terminal 1: npm run dev"
echo "  Terminal 2: cd cloud-shim && node src/index.js"
echo ""
echo "To stop Supabase:"
echo "  npx supabase stop"
echo ""
