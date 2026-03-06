#!/bin/bash
# Truco Card Game - Startup Script
# Run this to start both server and client

echo "🃏 Starting Truco Card Game..."
echo ""

# Build and start server
echo "📦 Building server..."
cd "$(dirname "$0")/server"
npm run build
echo "🚀 Starting server on port 3001..."
node dist/server.mjs &
SERVER_PID=$!

# Start client
echo "🎨 Starting client on port 5173..."
cd "$(dirname "$0")/client"
npx vite --host 0.0.0.0 --port 5173 &
CLIENT_PID=$!

echo ""
echo "✅ Game is running!"
echo ""
echo "   Open in browser: http://localhost:5173"
echo ""
echo "   For other devices on same network:"
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-ip")
echo "   http://${LOCAL_IP}:5173"
echo ""
echo "   Press Ctrl+C to stop both servers"
echo ""

# Handle cleanup
trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null; exit" SIGINT SIGTERM

wait
