FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY index.js db.js adr.js hook.js .env.example ./

ENV NODE_ENV=production

ENTRYPOINT ["node", "index.js"]
