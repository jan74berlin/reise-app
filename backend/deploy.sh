#!/bin/bash
set -e

echo "→ Pushing to GitHub..."
cd "$(dirname "$0")/.."
git push origin main

# Heimnetz: 192.168.2.111  |  Tailscale (überall): 100.84.90.104 / reise
SSH_HOST="${REISE_HOST:-192.168.2.111}"

echo "→ Building locally (avoids OOM on LXC 2GB RAM)..."
cd backend
npm run build
cd ..

echo "→ Syncing dist/ to LXC..."
tar czf - backend/dist/ | ssh root@$SSH_HOST "cd /var/www/reise && tar xzf - --no-same-owner --overwrite --strip-components=1"

echo "→ Restarting on LXC..."
ssh root@$SSH_HOST << 'REMOTE'
set -e
cd /var/www/reise
git pull origin main
cd backend
npm ci --omit=dev
pm2 restart reise-api
pm2 save
echo "✓ Deployed successfully"
REMOTE
