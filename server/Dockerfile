FROM node:24-slim

# System deps for Cursor CLI installer (glibc, curl, bash)
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates bash \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Cursor CLI (provides the `agent` binary)
RUN curl https://cursor.com/install -fsS | bash
ENV PATH="/root/.local/bin:${PATH}"

# Build-time sanity check
RUN agent --version || echo "WARN: agent --version failed; check PATH at runtime"

COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3004
CMD ["node", "index.js"]
