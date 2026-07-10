# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14-debian AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

FROM deps AS build
ENV RUSTUP_HOME=/usr/local/rustup
ENV CARGO_HOME=/usr/local/cargo
ENV PATH=/usr/local/cargo/bin:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential ca-certificates curl \
  && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain 1.88.0 \
  && rm -rf /var/lib/apt/lists/*
COPY server server
COPY packages packages
RUN cd server && bun run native:build && bun run typecheck

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps --chown=bun:bun /app/node_modules /app/node_modules
COPY --from=deps --chown=bun:bun /app/package.json /app/package.json
COPY --from=deps --chown=bun:bun /app/bun.lock /app/bun.lock
COPY --from=build --chown=bun:bun /app/packages /app/packages
COPY --from=build --chown=bun:bun /app/server /app/server

WORKDIR /app/server
USER bun
EXPOSE 3000

CMD ["bun", "src/main.ts"]
