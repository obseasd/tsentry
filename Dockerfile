FROM node:22-alpine

LABEL maintainer="obseasd" \
      description="Tsentry — Autonomous Multi-Chain Treasury Agent"

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ src/
COPY web/ web/
COPY skills/ skills/
COPY openclaw.json ./

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "src/server.js"]
