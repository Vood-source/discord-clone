const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

// Используем временную директорию в продакшене (для хостингов)
const dbDir = process.env.NODE_ENV === 'production' 
  ? path.join(require('os').tmpdir(), 'discord-clone')
  : __dirname;

// Создаем директорию если не существует
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.sqlite');
let db;

function initDatabase() {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Ошибка подключения к БД:', err);
      return;
    }
    console.log('✅ База данных подключена');
    createTables();
  });
}

function createTables() {
  // Таблица пользователей
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Таблица серверов
  db.run(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `);

  // Таблица каналов
  db.run(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id)
    )
  `);

  // Таблица сообщений
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Таблица участников сервера
  db.run(`
    CREATE TABLE IF NOT EXISTS server_members (
      server_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      PRIMARY KEY (server_id, user_id),
      FOREIGN KEY (server_id) REFERENCES servers(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Создаем тестовый сервер и каналы
  setTimeout(() => {
    createDefaultServer();
  }, 1000);
}

function createDefaultServer() {
  db.get("SELECT id FROM servers LIMIT 1", (err, row) => {
    if (!row) {
      const serverId = 'default-server';
      db.run(
        "INSERT INTO servers (id, name, owner_id) VALUES (?, ?, ?)",
        [serverId, 'Общий сервер', 'system']
      );
      
      db.run(
        "INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, ?, ?)",
        ['text-channel-1', serverId, 'общий', 'text']
      );
      
      db.run(
        "INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, ?, ?)",
        ['voice-channel-1', serverId, 'Голосовой канал', 'voice']
      );
    }
  });
}

function getDatabase() {
  return db;
}

module.exports = { initDatabase, getDatabase };

