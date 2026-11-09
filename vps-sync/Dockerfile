FROM node:24-alpine

WORKDIR /app
COPY bunny-sync/handler.mjs bunny-sync/schema.sql ./bunny-sync/
COPY vps-sync/server.mjs vps-sync/sqlite.mjs vps-sync/rumble-public.mjs ./vps-sync/

RUN mkdir /data && chown node:node /data
USER node
ENV SMARTTUBE_DB_PATH=/data/smarttube.sqlite \
    SMARTTUBE_BIND=0.0.0.0 \
    SMARTTUBE_PORT=8765
EXPOSE 8765
CMD ["node", "vps-sync/server.mjs"]
