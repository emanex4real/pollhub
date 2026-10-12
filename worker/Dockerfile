# Stage 1: install the app's dependencies
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

# Stage 2: small runtime image. npm, yarn and corepack are not needed to run
# the worker, so they are removed (they carry their own vulnerable packages).
FROM node:20-alpine
WORKDIR /app
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
COPY --from=build /app /app
USER node
EXPOSE 3001
CMD ["node", "index.js"]
