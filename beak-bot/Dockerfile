FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production

# -r dotenv/config so the API keys referenced as ${VAR} in settings.yaml are in
# the environment before settings.ts is evaluated.
CMD ["node", "-r", "dotenv/config", "bin/index.js"]
