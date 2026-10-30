# Build context: repository root.   docker build -f apps/web/Dockerfile -t qubedu-web .
FROM node:22-bookworm-slim AS build
ENV CI=1 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter @qubedu/web...
# Leave VITE_API_URL empty to call the API on the same origin (nginx proxies /api, /files and /ws).
ARG VITE_API_URL=""
ARG VITE_REALTIME_URL=""
ENV VITE_API_URL=$VITE_API_URL VITE_REALTIME_URL=$VITE_REALTIME_URL
RUN pnpm --filter @qubedu/web build

FROM nginx:1.27-alpine
COPY infra/nginx/web.conf /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
ENV API_UPSTREAM=http://api:8787 REALTIME_UPSTREAM=http://realtime:8788
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
