FROM node:22-alpine
WORKDIR /app
COPY package.json server.js simulation.js ttr-core.js ws-lite.js beta.html beta.js engine.cjs sync-engine.cjs ./
ENV NODE_ENV=production PORT=10000
RUN npm run build
EXPOSE 10000
USER node
CMD ["npm", "start"]
