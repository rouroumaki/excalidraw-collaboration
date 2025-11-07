FROM node:18 AS build

WORKDIR /opt/node_app

COPY . .

# do not ignore optional dependencies:
# Error: Cannot find module @rollup/rollup-linux-x64-gnu
RUN yarn --network-timeout 600000

ARG NODE_ENV=production
ARG VITE_APP_HTTP_STORAGE_BACKEND_URL=/api/v2
# WebSocket 服务器地址，构建时可通过 --build-arg 传入
# 例如: --build-arg VITE_APP_WS_SERVER_URL=http://your-server.com:1106
ARG VITE_APP_WS_SERVER_URL=https://excalidrawws.kloud.cn
ARG VITE_APP_STORAGE_BACKEND=http

# Vite 在构建时需要这些环境变量
ENV VITE_APP_HTTP_STORAGE_BACKEND_URL=${VITE_APP_HTTP_STORAGE_BACKEND_URL}
ENV VITE_APP_WS_SERVER_URL=${VITE_APP_WS_SERVER_URL}
ENV VITE_APP_STORAGE_BACKEND=${VITE_APP_STORAGE_BACKEND}
ENV VITE_APP_DISABLE_SENTRY=true

RUN yarn build:app:docker

FROM nginx:1.27-alpine

COPY --from=build /opt/node_app/excalidraw-app/build /usr/share/nginx/html

HEALTHCHECK CMD wget -q -O /dev/null http://localhost || exit 1
