FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV AI_SERVER_PORT=3001

COPY server ./server
COPY .env.example ./.env.example

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const port=process.env.AI_SERVER_PORT||3001;fetch(`http://127.0.0.1:${port}/api/health`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1));"

CMD ["node", "server/index.mjs"]
