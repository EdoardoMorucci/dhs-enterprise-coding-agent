# Build from repository/portable runtime root. Supply an immutable glibc Node 24.13.0 base image.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
WORKDIR /opt/native-worker
COPY packages/company-delegation/runtime/package.json packages/company-delegation/runtime/package-lock.json ./
RUN npm ci --omit=dev --include=optional --ignore-scripts && npm cache clean --force
RUN groupadd --gid 10001 native && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /tmp/native-worker native
COPY packages/company-delegation/dist ./dist
COPY packages/company-delegation/runtime/entrypoint.mjs ./runtime/entrypoint.mjs
ENV NATIVE_WORKER_MODULES=/opt/native-worker/node_modules
ENV SHELL=/bin/sh
USER 10001:10001
ENTRYPOINT ["node", "/opt/native-worker/runtime/entrypoint.mjs"]
