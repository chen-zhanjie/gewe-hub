FROM node:22-alpine AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
RUN npm install -g pnpm@11.7.0 --registry=https://registry.npmmirror.com
RUN pnpm config set registry https://registry.npmmirror.com
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @gewehub/contracts --filter @gewehub/server --filter @gewehub/web --prod=false

FROM deps AS build
COPY packages/contracts packages/contracts
COPY server server
COPY web web
RUN pnpm --filter @gewehub/contracts build
RUN PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma pnpm --filter @gewehub/server prisma:generate
RUN pnpm --filter @gewehub/server build
ARG VITE_CALLBACK_BASE_URL=https://gewehub.yunzxu.com
ARG VITE_API_BASE_URL=
ENV VITE_CALLBACK_BASE_URL=$VITE_CALLBACK_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @gewehub/web build

FROM alpine:3.20 AS silk-builder
WORKDIR /build
RUN set -eux; \
  apk add --no-cache git gcc g++ make; \
  git clone --depth 1 https://github.com/kn007/silk-v3-decoder.git /build/silk-v3-decoder; \
  make -C /build/silk-v3-decoder/silk; \
  make -C /build/silk-v3-decoder/silk encoder; \
  chmod +x /build/silk-v3-decoder/silk/decoder /build/silk-v3-decoder/silk/encoder

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV FILE_STORAGE_DIR=/app/server/storage/files
ENV GEWE_SILK_ENCODER_PATH=/opt/silk-v3-encoder/silk/encoder
ENV GEWE_SILK_DECODER_PATH=/opt/silk-v3-decoder/silk/decoder
RUN set -eux; \
  apk add --no-cache nginx ffmpeg libstdc++; \
  mkdir -p /run/nginx /var/log/nginx /app/server/storage/files /app/server/storage/logs /opt/silk-v3-encoder/silk /opt/silk-v3-decoder/silk
COPY --from=silk-builder /build/silk-v3-decoder/silk/encoder /opt/silk-v3-encoder/silk/encoder
COPY --from=silk-builder /build/silk-v3-decoder/silk/decoder /opt/silk-v3-decoder/silk/decoder
RUN chmod +x /opt/silk-v3-encoder/silk/encoder /opt/silk-v3-decoder/silk/decoder
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/server ./server
COPY --from=build /app/web/dist ./web
COPY deploy/nginx.conf /etc/nginx/http.d/default.conf
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
WORKDIR /app/server
EXPOSE 80
ENTRYPOINT ["/app/entrypoint.sh"]
