FROM node:22-alpine AS build
WORKDIR /app
# Rewrites (/api/* → backend) are fixed at build time in standalone mode.
ARG API_URL_INTERNAL=http://api:8000
ENV API_URL_INTERNAL=$API_URL_INTERNAL
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
