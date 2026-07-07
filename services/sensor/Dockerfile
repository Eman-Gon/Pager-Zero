FROM node:20-alpine
RUN apk add --no-cache git && git config --global --add safe.directory /target
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]
