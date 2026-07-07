# Mission Control — production build served by nginx with API reverse proxy.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG VITE_BUTTERBASE_APP_ID=app_gsuwgmmbc74g
ARG VITE_BUTTERBASE_API_URL=https://api.butterbase.ai
ARG VITE_NEO4J_URL=
ARG VITE_NEO4J_USER=
ARG VITE_NEO4J_PASSWORD=
ARG VITE_AUTO_LOGIN=1
ARG VITE_DEMO_EMAIL=oncall@rescueops.dev
ARG VITE_DEMO_PASSWORD=Resc!ue0ps2026

ENV VITE_BUTTERBASE_APP_ID=$VITE_BUTTERBASE_APP_ID \
    VITE_BUTTERBASE_API_URL=$VITE_BUTTERBASE_API_URL \
    VITE_NEO4J_URL=$VITE_NEO4J_URL \
    VITE_NEO4J_USER=$VITE_NEO4J_USER \
    VITE_NEO4J_PASSWORD=$VITE_NEO4J_PASSWORD \
    VITE_AUTO_LOGIN=$VITE_AUTO_LOGIN \
    VITE_DEMO_EMAIL=$VITE_DEMO_EMAIL \
    VITE_DEMO_PASSWORD=$VITE_DEMO_PASSWORD

RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
