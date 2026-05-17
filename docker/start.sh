#!/bin/bash
set -e

cd /var/www/html

echo "[Start] Running database migrations..."
php artisan migrate --force || echo "[Start] Migration failed but continuing..."

echo "[Start] Caching config..."
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo "[Start] Creating storage symlink..."
php artisan storage:link || true

echo "[Start] Starting supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
