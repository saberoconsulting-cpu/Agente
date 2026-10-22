FROM node:22-alpine

WORKDIR /app
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
COPY scripts ./scripts
COPY prisma ./prisma

RUN DATABASE_URL=postgresql://build:build@localhost:5432/build DIRECT_DATABASE_URL=postgresql://build:build@localhost:5432/build npm run prisma:generate
RUN NODE_OPTIONS=--max-old-space-size=1536 npm run build

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "run", "start"]
