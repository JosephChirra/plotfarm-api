# ---- Build stage ----
FROM node:20-alpine AS builder

# Install ffmpeg and openssl (required by Prisma binary engine)
RUN apk add --no-cache ffmpeg openssl

WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npx prisma generate
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build

# ---- Production stage ----
FROM node:20-alpine AS runner

RUN apk add --no-cache ffmpeg openssl

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

RUN mkdir -p uploads

EXPOSE 3001

CMD ["node", "dist/src/main.js"]
