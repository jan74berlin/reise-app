#!/bin/bash
set -e

echo "→ Pushing to GitHub..."
cd "$(dirname "$0")/.."
git push origin main

echo "→ Deploying to LXC 111 (reise)..."
ssh root@192.168.2.111 << 'REMOTE'
set -e
cd /var/www/reise
git pull origin main
cd backend
npm ci --omit=dev
npm run build
pm2 restart reise-api
pm2 save
echo "✓ Deployed successfully"
REMOTE
