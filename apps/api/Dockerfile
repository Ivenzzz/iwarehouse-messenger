FROM node:20-alpine AS build
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY apps/api/package.json ./
RUN npm install
COPY apps/api/prisma ./prisma
RUN npx prisma generate
COPY apps/api/tsconfig.json apps/api/nest-cli.json ./
COPY apps/api/src ./src
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.json ./
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
