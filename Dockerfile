# Stage 1: Build Vue frontend
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Run Express server (needs glibc for Cursor CLI binary)
FROM node:20-slim

# System deps for Cursor CLI installer
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates bash \
 && rm -rf /var/lib/apt/lists/*

# Install Cursor CLI (`agent` binary)
RUN curl https://cursor.com/install -fsS | bash \
 && if [ -f /root/.local/bin/agent ]; then \
      ln -sf /root/.local/bin/agent /usr/local/bin/agent; \
    else \
      echo "ERROR: cursor install finished but agent binary missing" >&2; \
      ls -la /root/.local/bin/ 2>&1 || true; \
      find / -name "agent" -type f 2>/dev/null | head -5 || true; \
      exit 1; \
    fi

ENV PATH="/usr/local/bin:/root/.local/bin:${PATH}"

# Fail build if agent isn't callable — better to fail here than ship broken
RUN agent --version

WORKDIR /app
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/ ./
COPY --from=client-builder /app/client/dist ./public
EXPOSE 3004
CMD ["node", "index.js"]
