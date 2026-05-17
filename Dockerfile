FROM php:8.4-fpm-alpine AS php-base

# System dependencies + build toolchain (autoconf/g++/make via $PHPIZE_DEPS)
RUN apk add --no-cache \
    nginx \
    supervisor \
    nodejs \
    npm \
    postgresql-dev \
    postgresql-client \
    libzip-dev \
    libpng-dev \
    oniguruma-dev \
    icu-dev \
    git \
    curl \
    bash \
    $PHPIZE_DEPS

# PHP extensions — pgsql + mbstring/zip/gd/bcmath, plus intl, pcntl, and opcache for prod
RUN docker-php-ext-install pdo pdo_pgsql mbstring zip gd bcmath intl pcntl opcache

# Composer (pinned via copy-from image)
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# ── Layered caching: dependencies before source ─────────────────────────────
# Copy only manifests first so dependency installs cache across source edits.
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY package.json package-lock.json ./
# --legacy-peer-deps works around the Vite 8 / @vitejs/plugin-react 4 peer conflict.
RUN npm ci --legacy-peer-deps

# ── Application source ──────────────────────────────────────────────────────
COPY . .

# Re-run autoloader now that source is present, then build front-end assets
# and strip node_modules from the final image.
RUN composer dump-autoload --optimize --no-dev \
    && npm run build \
    && rm -rf node_modules

# Storage + permissions
RUN mkdir -p storage/framework/sessions storage/framework/views storage/framework/cache storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

# Nginx + php-fpm + supervisor configs
COPY docker/nginx.conf       /etc/nginx/nginx.conf
COPY docker/php-fpm.conf     /usr/local/etc/php-fpm.d/zz-custom.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/start.sh         /start.sh
RUN chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
