FROM node:20-alpine as builder

ARG CHINA_MIRROR=false

# enable china mirror when ENABLE_CHINA_MIRROR is true
RUN if [[ "$CHINA_MIRROR" = "true" ]] ; then \
    echo "Enable China Alpine Mirror" && \
    sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories; \
    fi

RUN if [[ "$CHINA_MIRROR" = "true" ]] ; then \
    echo "Enable China NPM Mirror" && \
    npm install -g cnpm --registry=https://registry.npmmirror.com; \
    npm config set registry https://registry.npmmirror.com; \
    fi

RUN apk add --update python3 make g++ curl
RUN npm install -g eslint
RUN npm install -g @nestjs/cli

WORKDIR /app

COPY package.json .
COPY package-lock.json .
RUN npm ci

COPY . .
RUN npx nest build


FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json
COPY --from=builder /app/dist /app/dist

# 只安装生产依赖，减小镜像大小
RUN npm ci --only=production

USER node

EXPOSE 8080

ENTRYPOINT ["npm", "run", "start:prod"]
