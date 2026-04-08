FROM node:20-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production=false

COPY . .

RUN npm run build

# devDependencies 제거
RUN npm prune --production

EXPOSE 3000

CMD ["node", "-r", "tsconfig-paths/register", "dist/main"]
