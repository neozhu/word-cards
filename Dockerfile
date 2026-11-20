FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache nodejs
ENV TTS_API_URL=http://127.0.0.1:48731 TTS_API_KEY="" SPEAK_APP_ID="" SPEAK_APP_SECRET="" SPEAK_LOCAL_CLIENT_IP=""
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
COPY server/speak-auth.mjs /app/server/speak-auth.mjs
COPY docker-start.sh /usr/local/bin/docker-start.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-start.sh && chmod +x /usr/local/bin/docker-start.sh
EXPOSE 80
CMD ["/usr/local/bin/docker-start.sh"]
