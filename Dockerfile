FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine
ENV TTS_API_URL=http://127.0.0.1:48731 TTS_API_KEY="" \
    OPENPRONOUNCE_API_URL=https://openpronounce.blazorserver.com OPENPRONOUNCE_API_KEY=""
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
