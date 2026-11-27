FROM node:22-alpine
WORKDIR /app
COPY package.json server.js simulation.js ttr-core.js ws-lite.js beta.html beta.js engine.cjs sync-engine.cjs 19-environment-events.js 15b-box-biliardo-rules.js 17b-bagno-sprint-rules.js 06-game-legacy.js 07d-race-safety-logic.js 21-online-netcode.js 07c-race-driver-logic.js 16b-desk-drift-rules.js ./
ENV NODE_ENV=production PORT=10000
RUN npm run build
EXPOSE 10000
USER node
CMD ["npm", "start"]
