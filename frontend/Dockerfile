# HolzERP Frontend - Placeholder for Phase 6
# Currently serves a minimal static page

FROM nginx:alpine

# Copy placeholder HTML
COPY index.html /usr/share/nginx/html/

# Nginx config
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { try_files $uri $uri/ /index.html; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
