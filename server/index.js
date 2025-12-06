const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');
const { setupSocketHandlers } = require('./socketHandlers');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Разрешаем подключения с любых источников
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;
// Определяем режим работы
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(cors({
  origin: "*" // Разрешаем CORS для всех
}));
app.use(express.json());

// Инициализация базы данных
initDatabase();

// Настройка обработчиков Socket.io
setupSocketHandlers(io);

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Получение IP адреса сервера
app.get('/api/server-info', (req, res) => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  
  res.json({ 
    ip: addresses[0] || 'localhost',
    port: PORT,
    allAddresses: addresses
  });
});

// Раздача статических файлов React в продакшене
if (NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../client/build');
  app.use(express.static(buildPath));
  
  // Все остальные маршруты отправляем на React приложение
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

const listenHost = NODE_ENV === 'production' ? '0.0.0.0' : '0.0.0.0';

server.listen(PORT, listenHost, () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';
  
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }
  
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📦 Режим: ${NODE_ENV}`);
  if (NODE_ENV === 'development') {
    console.log(`📡 Локальный доступ: http://localhost:${PORT}`);
    console.log(`🌐 Сетевой доступ: http://${localIP}:${PORT}`);
    console.log(`\n💡 Друзья могут подключиться по адресу: http://${localIP}:3000`);
    console.log(`   (Убедитесь, что порты ${PORT} и 3000 открыты в файрволе)`);
  } else {
    console.log(`🌐 Приложение доступно на порту ${PORT}`);
    console.log(`✅ Статические файлы раздаются из client/build`);
  }
});

