# Многоступенчатая сборка для оптимизации размера
FROM node:18-alpine AS builder

WORKDIR /app

# Копируем package файлы
COPY package*.json ./
COPY client/package*.json ./client/

# Устанавливаем зависимости
RUN npm install
RUN cd client && npm install

# Копируем исходный код
COPY . .

# Собираем React приложение
RUN cd client && npm run build

# Продакшен образ
FROM node:18-alpine

WORKDIR /app

# Копируем только необходимые файлы
COPY package*.json ./
RUN npm install --production

COPY server ./server
COPY --from=builder /app/client/build ./client/build

# Создаем директорию для БД
RUN mkdir -p /tmp/discord-clone

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "server/index.js"]

