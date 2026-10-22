FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV HOST=0.0.0.0
EXPOSE 3010
CMD ["node", "src/server.mjs"]
