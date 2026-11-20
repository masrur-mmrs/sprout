# The sprout-api image. Cloud Run runs both the service and the sprout-migrate job from it.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
# tsc emits no .sql files, and migrate.ts reads them from dist/db/migrations/.
RUN npm run build \
  && cp -R src/db/migrations dist/db/migrations \
  && npm prune --omit=dev

FROM node:22-slim
# env.ts has no default for NODE_ENV, so the service and the migration job both get it here.
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
