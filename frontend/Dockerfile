# HolzERP Frontend - Phase 5: Production UI

FROM nginx:alpine

# Copy HTML pages
COPY index.html /usr/share/nginx/html/
COPY production.html /usr/share/nginx/html/

# Nginx config with API proxy
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    # Production UI \
    location /production { \
        try_files /production.html =404; \
    } \
    \
    # API Proxy \
    location /api/ { \
        proxy_pass http://backend:3000/api/; \
        proxy_http_version 1.1; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    } \
    \
    # Fallback \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
