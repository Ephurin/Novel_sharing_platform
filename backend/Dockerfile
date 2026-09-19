FROM node:22-bookworm-slim

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend ./
COPY docs/Assets /app/docs/Assets

RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh
RUN npm run build

EXPOSE 4000

CMD ["./docker-entrypoint.sh"]
