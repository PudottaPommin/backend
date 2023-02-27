#################
#      BASE     #
#################
FROM node:19.4-alpine as base
RUN corepack enable pnpm
RUN corepack prepare pnpm@7.28.0 --activate

#################
#      DEPS     #
#################
FROM base AS deps
ARG BUILD_CONTEXT

WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY ./$BUILD_CONTEXT/package.json ./$BUILD_CONTEXT/
COPY ./packages/settings/package.json ./packages/settings/

RUN pnpm fetch

#################
#      DEPS     #
#################
FROM deps AS deps-prod
ARG BUILD_CONTEXT

ENV HUSKY 0
RUN pnpm -r install --frozen-lockfile --offline --prod


#################
#    BUILDER    #
#################
FROM deps AS builder
RUN apk add --no-cache git

WORKDIR /app

COPY package.json tsconfig.json ./
COPY ./packages/settings/package.json ./packages/settings/tsconfig.json /app/packages/settings/
COPY ./$BUILD_CONTEXT/package.json ./$BUILD_CONTEXT/tsconfig.json /app/$BUILD_CONTEXT/

RUN pnpm -r install --frozen-lockfile --offline

WORKDIR /app/packages/settings
COPY ./packages/settings/src ./src
RUN pnpm build

WORKDIR /app/$BUILD_CONTEXT
COPY ./$BUILD_CONTEXT/prisma ./prisma
COPY ./$BUILD_CONTEXT/src ./src

RUN pnpm prisma generate --schema ./prisma/postgres.prisma
RUN test -f ./prisma/postgres.prisma \
    && pnpm prisma generate --schema ./prisma/mongo.prisma \
    || true

RUN pnpm build

#################
#      DEV      #
#################
FROM base as dev

ARG BUILD_CONTEXT
ENV COMMIT_HASH $COMMIT_HASH

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/tsconfig.json ./

WORKDIR /app/packages/settings
COPY --from=base /app/packages/settings/node_modules* ./node_modules
COPY --from=builder /app/packages/settings/dist ./dist
COPY --from=builder /app/packages/settings/package.json ./
COPY --from=builder /app/packages/settings/tsconfig.json ./

WORKDIR /app/$BUILD_CONTEXT
COPY --from=base /app/$BUILD_CONTEXT/node_modules* ./node_modules
COPY --from=builder /app/$BUILD_CONTEXT/package.json ./
COPY --from=builder /app/$BUILD_CONTEXT/tsconfig.json ./
COPY --from=builder /app/$BUILD_CONTEXT/prisma ./prisma

RUN mkdir -p ./src/steam/volumes

CMD ["pnpm", "dev"]

#################
#     PROD      #
#################
FROM deps-prod as prod

ARG BUILD_CONTEXT
ENV COMMIT_HASH $COMMIT_HASH

LABEL org.opencontainers.image.source="https://github.com/dotabod/backend"
LABEL org.opencontainers.image.version=$COMMIT_HASH

WORKDIR /app
# COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# COPY --from=deps /app/packages/settings/node_modules* /app/packages/settings/node_modules
# COPY --from=builder /app/packages/settings/dist /app/packages/settings/package.json /app/packages/settings/tsconfig.json /app/packages/settings/

WORKDIR /app/$BUILD_CONTEXT
# COPY --from=deps /app/$BUILD_CONTEXT/node_modules* ./node_modules
COPY --from=builder /app/$BUILD_CONTEXT/package.json ./
COPY --from=builder /app/$BUILD_CONTEXT/dist ./dist
COPY --from=builder /app/$BUILD_CONTEXT/prisma ./prisma

RUN mkdir -p /app/$BUILD_CONTEXT/src/steam/volumes

CMD ["pnpm", "start"]
