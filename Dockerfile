FROM php:8.4-fpm-alpine AS php-base

# System dependencies
RUN apk add --no-cache \
    nginx \
    supervisor \
    nodejs \
    npm \
    postgresql-dev \
    libzip-dev \
    libpng-dev \
    oniguruma-dev \
    git \
    curl \
    bash \
    icu-dev \
    autoconf \
    g++ \
    make

# PHP extensions
RUN docker-php-ext-install pdo pdo_pgsql mbstring zip gd bcmath

# Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Application code
COPY . .

# PHP dependencies — --no-scripts avoids artisan running before .env exists.
RUN composer install --no-dev --optimize-autoloader --no-interaction --no-scripts

# Front-end build. --legacy-peer-deps works around Vite 8 / @vitejs/plugin-react 4
# peer conflict; tree-shake node_modules out of the image afterwards.
RUN npm install --legacy-peer-deps \
    && npm run build \
    && rm -rf node_modules

# Permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html/storage \
    && chmod -R 755 /var/www/html/bootstrap/cache

# Nginx + supervisor + boot script
COPY docker/nginx.conf       /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/start.sh         /start.sh
RUN chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
