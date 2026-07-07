FROM node:22-alpine AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@11.7.0 --registry=https://registry.npmmirror.com
RUN pnpm config set registry https://registry.npmmirror.com
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @gewehub/contracts --filter @gewehub/web --prod=false

FROM deps AS build
COPY packages/contracts packages/contracts
COPY web web
RUN pnpm --filter @gewehub/contracts build
RUN pnpm --filter @gewehub/web build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=build /app/web/dist /app/dist
COPY web/docker-server.mjs /app/docker-server.mjs
EXPOSE 80
CMD ["node", "docker-server.mjs"]
