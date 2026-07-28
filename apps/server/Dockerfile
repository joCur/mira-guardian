FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @guardian/shared build && pnpm --filter @guardian/server build

FROM node:22-slim
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/server

# Die Version kommt von außen herein, weil sie erst beim Release entsteht
# (0.1.<Build-Nummer>). Bewusst als letzte Zeilen: ein Argument, das sich bei
# jedem Build ändert, würde den Layer-Cache ab seiner Verwendung entwerten —
# hier ist darüber nichts mehr zu bauen.
#
# GUARDIAN_BUILD_VERSION und nicht GUARDIAN_VERSION: Letzteres wählt im
# Deployment den Image-Tag und landet über `env_file` mit im Container, wo es
# diesen Wert überschreiben würde (siehe deploy/docker-compose.yml).
ARG VERSION=0.0.0-dev
ENV GUARDIAN_BUILD_VERSION=$VERSION

EXPOSE 4000
CMD ["node", "dist/main.js"]
