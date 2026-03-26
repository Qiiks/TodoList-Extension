FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/
RUN npm ci
COPY . .
RUN npm run build -w packages/shared
RUN npm run build -w packages/server
CMD ["npm", "start", "-w", "packages/server"]
