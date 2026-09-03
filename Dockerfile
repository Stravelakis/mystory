# =============================================================================
# My Story — container image.
#
# The vault is a bind mount, never a layer. An image is a thing you throw away
# and rebuild; your entries are not.
# =============================================================================

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# -----------------------------------------------------------------------------

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# The vault and the .env are written at runtime, by a user who is not root.
RUN mkdir -p /app/vault && chown -R node:node /app
USER node

ENV PORT=3000
ENV HOST=0.0.0.0
ENV VAULT_DIR=/app/vault
EXPOSE 3000

# A container that cannot reach its own port should be restarted, and one whose
# model provider is down should not be — so this checks the app, not the models.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/auth/status >/dev/null 2>&1 || exit 1

CMD ["node", "dist/server.cjs"]
