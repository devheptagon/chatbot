FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server ./server
COPY client ./client
COPY docs ./docs

ENV NODE_ENV=production
ENV USAGE_STORE_PATH=/app/data/usage.json
ENV CLIENT_ROUTING_STORE_PATH=/app/data/client-routing.json

CMD ["node", "server/index.js"]
