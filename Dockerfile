FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY index.js db.js adr.js hook.js .env.example ./

ENV NODE_ENV=production
ENV ANTHROPIC_API_KEY=""

ENTRYPOINT ["node", "index.js"]
