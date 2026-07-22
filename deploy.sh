#!/bin/bash
set -e

echo "=============================="
echo "  Access API — Auto Deploy"
echo "=============================="

PROJECT_DIR="/var/www/projects/banking/access/api"

echo "[1/5] Navigating to project..."
cd "$PROJECT_DIR"

echo "[2/5] Pulling latest changes from git..."
git pull origin main

echo "[3/5] Installing dependencies..."
npm install --legacy-peer-deps

echo "[4/5] Building TypeScript..."
npm run build

echo "[5/5] Restarting PM2 process: access-api..."
pm2 restart access-api

echo ""
echo "✅ Access API deployed successfully!"
