FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace @focusguard/web --include-workspace-root
COPY apps/web ./apps/web
RUN npm run build --workspace @focusguard/web

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app ./
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@focusguard/web"]
