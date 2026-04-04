FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY packages/agm/test/docker/profile-e2e/fake-ingress/package.json .
RUN npm install
COPY packages/agm/test/docker/profile-e2e/fake-ingress/server.js .
EXPOSE 3099
CMD ["node", "server.js"]
