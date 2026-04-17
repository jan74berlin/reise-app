#!/bin/bash
set -e

echo "→ Pushing to GitHub..."
cd "$(dirname "$0")/.."
git push origin main

echo "→ Deploying to LXC 111 (reise)..."
# Heimnetz: 192.168.2.111  |  Tailscale (überall): 100.84.90.104 / reise
SSH_HOST="${REISE_HOST:-192.168.2.111}"
ssh root@$SSH_HOST << 'REMOTE'
set -e
cd /var/www/reise
git pull origin main
cd backend
npm ci
npm run build
npm prune --omit=dev
pm2 restart reise-api
pm2 save
echo "✓ Deployed successfully"
REMOTE
