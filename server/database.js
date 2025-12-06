const sqlite3 = require('sqlite3').verbose();
const path = require('path');
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
let dbReady = false;

function initDatabase() {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Ошибка подключения к БД:', err);
      process.exit(1); // Завершаем процесс при критической ошибке БД
      return;
    }
    console.log('✅ База данных подключена:', dbPath);
    
    // Проверяем существование таблиц перед созданием
    checkAndCreateTables();
  });
  
  // Обработка ошибок БД
  db.on('error', (err) => {
    console.error('❌ Ошибка базы данных:', err);
    if (err.message && err.message.includes('no such table')) {
      console.error('⚠️ Таблица не найдена. Пересоздаем таблицы...');
      dbReady = false;
      createTables();
    }
  });
}

function checkAndCreateTables() {
  // Проверяем существование таблицы messages (как индикатор всех таблиц)
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'", (err, row) => {
    if (err) {
      console.error('Ошибка проверки таблиц:', err);
      console.log('Создаем таблицы...');
      createTables();
      return;
    }
    
    if (!row) {
      console.log('⚠️ Таблицы не найдены. Создаем таблицы...');
      createTables();
    } else {
      console.log('✅ Таблицы уже существуют');
      dbReady = true;
      // Проверяем наличие дефолтного сервера
      createDefaultServer();
    }
  });
}

function createTables() {
  // Создаем таблицы последовательно, чтобы гарантировать их создание
  db.serialize(() => {
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
    `, (err) => {
      if (err) {
        console.error('Ошибка создания таблицы users:', err);
      }
    });

    // Таблица серверов
    db.run(`
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      )
    `, (err) => {
      if (err) {
        console.error('Ошибка создания таблицы servers:', err);
      }
    });

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
    `, (err) => {
      if (err) {
        console.error('Ошибка создания таблицы channels:', err);
      }
    });

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
    `, (err) => {
      if (err) {
        console.error('Ошибка создания таблицы messages:', err);
      } else {
        console.log('✅ Таблица messages создана');
      }
    });

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
    `, (err) => {
      if (err) {
        console.error('Ошибка создания таблицы server_members:', err);
      }
    });

    // Создание индексов для оптимизации запросов
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id)`, (err) => {
      if (err) console.error('Ошибка создания индекса idx_messages_channel:', err);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC)`, (err) => {
      if (err) console.error('Ошибка создания индекса idx_messages_created:', err);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id)`, (err) => {
      if (err) console.error('Ошибка создания индекса idx_messages_user:', err);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id)`, (err) => {
      if (err) console.error('Ошибка создания индекса idx_channels_server:', err);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type)`, (err) => {
      if (err) console.error('Ошибка создания индекса idx_channels_type:', err);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_server_members_server ON server_members(server_id)`, (err) => {
      if (err) console.error('Ошибка создания индекса idx_server_members_server:', err);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id)`, (err) => {
      if (err) {
        console.error('Ошибка создания индекса idx_server_members_user:', err);
      } else {
        console.log('✅ Все таблицы и индексы созданы');
        dbReady = true;
        // Создаем тестовый сервер и каналы после создания всех таблиц
        createDefaultServer();
      }
    });
  });
}

function isDatabaseReady() {
  return dbReady && db;
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
  if (!db) {
    throw new Error('База данных не инициализирована. Вызовите initDatabase() сначала.');
  }
  if (!dbReady) {
    console.warn('⚠️ База данных еще не готова. Таблицы могут быть не созданы.');
  }
  return db;
}

module.exports = { initDatabase, getDatabase, isDatabaseReady };

