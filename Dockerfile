FROM node:24-bookworm-slim

WORKDIR /app

# Install cloudflared and required OS packages
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl \
    && curl -fsSL \
       https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
       -o /tmp/cloudflared.deb \
    && apt-get install -y /tmp/cloudflared.deb \
    && rm -rf /var/lib/apt/lists/* /tmp/cloudflared.deb

# Copy the complete project, including npm workspaces
COPY . .

# Install project dependencies
RUN npm ci --omit=dev

ENV NODE_ENV=production

# CouPI Control Center / Render public port
EXPOSE 8090

CMD ["npm", "start"]