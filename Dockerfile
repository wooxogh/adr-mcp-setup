FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY index.js db.js adr.js hook.js .env.example ./

ENV NODE_ENV=production
ENV ANTHROPIC_API_KEY=""

EXPOSE 3000

ENTRYPOINT ["node", "index.js"]
