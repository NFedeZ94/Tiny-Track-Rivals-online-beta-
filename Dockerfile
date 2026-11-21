FROM node:22-alpine
WORKDIR /app
COPY server.js simulation.js ttr-core.js ws-lite.js beta.html beta.js ./
ENV NODE_ENV=production PORT=10000
EXPOSE 10000
USER node
CMD ["node", "server.js"]
