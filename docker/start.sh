#!/bin/sh
set -e

cd /var/www/html

# Run migrations (idempotent — Postgres handles concurrent runs safely)
php artisan migrate --force

# Cache config, routes, views for production
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Hand off to supervisor (manages php-fpm + nginx)
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
