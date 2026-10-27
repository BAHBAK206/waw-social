# Build context: repository root.   docker build -f services/api/Dockerfile -t qubedu-api .
FROM node:22-bookworm-slim AS build
ENV CI=1 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY services/api ./services/api
# Only the API and the workspace packages it bundles are installed.
RUN pnpm install --frozen-lockfile --filter @qubedu/api... \
 && pnpm --filter @qubedu/api build
# Runtime dependencies = the API's third-party dependencies, at the exact pinned versions.
RUN mkdir /out && cp -r services/api/dist /out/dist \
 && node -e "const p=require('./services/api/package.json');const d=Object.fromEntries(Object.entries(p.dependencies).filter(([,v])=>!String(v).startsWith('workspace:')));require('fs').writeFileSync('/out/package.json',JSON.stringify({name:'qubedu-api-runtime',private:true,type:'module',dependencies:d}))" \
 && cd /out && npm install --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8787 STORAGE_DIR=/data/storage
WORKDIR /app
COPY --from=build /out ./
RUN mkdir -p /data/storage && chown -R node:node /data /app
USER node
EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations run on start (MIGRATE_ON_START=false to disable); seed demo data once with: node dist/seed.js
CMD ["node", "dist/server.js"]
