# The online-play server (ADR 0004). Build from the repo root:
#   docker build -f server/Dockerfile -t quizzer-server .
# thewahlstedts-genai builds this straight from GitHub (see its docs/quizzer-server.md).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY package.json package-lock.json ./
# Only runtime dependencies; `ws` is the one the bundle leaves external.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8787
CMD ["node", "dist-server/index.js"]
