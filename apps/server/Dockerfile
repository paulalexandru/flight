FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/server ./apps/server
COPY packages ./packages

RUN npm install --workspace=@flight/server --include-workspace-root

WORKDIR /app/apps/server
RUN npm run build

EXPOSE 4000
CMD ["npm", "run", "start"]
