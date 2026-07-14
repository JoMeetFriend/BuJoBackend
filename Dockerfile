FROM node:22-bullseye-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

RUN npx prisma generate

ENV NODE_ENV=production
ENV TZ=Asia/Taipei

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
