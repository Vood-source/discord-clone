const { getDatabase } = require('./database');
const { v4: uuidv4 } = require('uuid');

const users = new Map(); // socketId -> user info
const voiceRooms = new Map(); // channelId -> Set of socketIds

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`👤 Пользователь подключен: ${socket.id}`);

    // Регистрация пользователя с валидацией
    socket.on('register', async (userData) => {
      // Валидация данных
      if (!userData || !userData.username) {
        socket.emit('error', { message: 'Имя пользователя обязательно' });
        return;
      }

      const username = String(userData.username).trim();
      
      // Валидация имени пользователя
      if (username.length < 2 || username.length > 30) {
        socket.emit('error', { message: 'Имя пользователя должно быть от 2 до 30 символов' });
        return;
      }

      // Проверка на допустимые символы (буквы, цифры, подчеркивание)
      if (!/^[a-zA-Zа-яА-ЯёЁ0-9_]+$/.test(username)) {
        socket.emit('error', { message: 'Имя может содержать только буквы, цифры и подчеркивание' });
        return;
      }

      const db = getDatabase();
      const userId = uuidv4();
      
      db.run(
        "INSERT INTO users (id, username, email) VALUES (?, ?, ?)",
        [userId, username, userData.email || null],
        function(err) {
          if (err) {
            // Проверка на дублирование username
            if (err.message && err.message.includes('UNIQUE constraint')) {
              socket.emit('error', { message: 'Имя пользователя уже занято' });
            } else {
              console.error('Ошибка регистрации:', err);
              socket.emit('error', { message: 'Ошибка регистрации' });
            }
            return;
          }
          
          users.set(socket.id, {
            id: userId,
            username: username,
            socketId: socket.id
          });
          
          socket.emit('registered', { userId, username: username });
          socket.broadcast.emit('user_joined', { userId, username: username });
          
          // Отправляем обновленный список пользователей онлайн
          const onlineUsers = Array.from(users.values()).map(u => ({
            id: u.id,
            username: u.username
          }));
          io.emit('online_users_list', onlineUsers);
        }
      );
    });

    // Получение списка серверов
    socket.on('get_servers', () => {
      const db = getDatabase();
      db.all("SELECT * FROM servers", (err, servers) => {
        if (!err) {
          socket.emit('servers_list', servers || []);
        }
      });
    });

    // Создание нового сервера с валидацией
    socket.on('create_server', (serverData) => {
      const user = users.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'Пользователь не авторизован' });
        return;
      }

      // Валидация названия сервера
      const serverName = serverData?.name ? String(serverData.name).trim() : 'Новый сервер';
      if (serverName.length === 0 || serverName.length > 100) {
        socket.emit('error', { message: 'Название сервера должно быть от 1 до 100 символов' });
        return;
      }

      const db = getDatabase();
      const serverId = uuidv4();
      
      db.run(
        "INSERT INTO servers (id, name, owner_id) VALUES (?, ?, ?)",
        [serverId, serverName, user.id],
        function(err) {
          if (err) {
            console.error('Ошибка создания сервера:', err);
            socket.emit('error', { message: 'Ошибка создания сервера' });
            return;
          }

          const server = {
            id: serverId,
            name: serverName,
            owner_id: user.id,
            created_at: new Date().toISOString()
          };

          // Создаем текстовый канал по умолчанию
          const defaultChannelId = uuidv4();
          db.run(
            "INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, ?, ?)",
            [defaultChannelId, serverId, 'общий', 'text'],
            (err) => {
              if (err) {
                console.error('Ошибка создания канала по умолчанию:', err);
              }
              io.emit('server_created', server);
            }
          );
        }
      );
    });

    // Получение каналов сервера
    socket.on('get_channels', (serverId) => {
      const db = getDatabase();
      db.all(
        "SELECT * FROM channels WHERE server_id = ? ORDER BY created_at",
        [serverId],
        (err, channels) => {
          if (!err) {
            socket.emit('channels_list', channels || []);
          }
        }
      );
    });

    // Создание нового канала с валидацией
    socket.on('create_channel', (channelData) => {
      const user = users.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'Пользователь не авторизован' });
        return;
      }

      // Валидация данных
      if (!channelData || !channelData.serverId) {
        socket.emit('error', { message: 'Не указан ID сервера' });
        return;
      }

      const channelName = channelData.name ? String(channelData.name).trim() : 'новый-канал';
      const channelType = (channelData.type === 'voice' || channelData.type === 'text') 
        ? channelData.type 
        : 'text';

      // Валидация названия канала
      if (channelName.length === 0 || channelName.length > 50) {
        socket.emit('error', { message: 'Название канала должно быть от 1 до 50 символов' });
        return;
      }

      const db = getDatabase();
      const channelId = uuidv4();
      
      db.run(
        "INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, ?, ?)",
        [channelId, channelData.serverId, channelName, channelType],
        function(err) {
          if (err) {
            console.error('Ошибка создания канала:', err);
            socket.emit('error', { message: 'Ошибка создания канала' });
            return;
          }

          const channel = {
            id: channelId,
            server_id: channelData.serverId,
            name: channelName,
            type: channelType,
            created_at: new Date().toISOString()
          };

          io.to(channelData.serverId).emit('channel_created', channel);
        }
      );
    });

    // Получение сообщений канала с оптимизацией
    socket.on('get_messages', (data) => {
      const channelId = typeof data === 'string' ? data : data?.channelId;
      const limit = (typeof data === 'object' && data?.limit) ? Math.min(data.limit, 100) : 50;
      const offset = (typeof data === 'object' && data?.offset) ? Math.max(data.offset, 0) : 0;
      
      if (!channelId) {
        socket.emit('error', { message: 'Не указан ID канала' });
        return;
      }

      try {
        const db = getDatabase();
        // Используем индекс для быстрого поиска по channel_id и created_at
        db.all(
          `SELECT m.*, u.username, u.avatar 
           FROM messages m 
           JOIN users u ON m.user_id = u.id 
           WHERE m.channel_id = ? 
           ORDER BY m.created_at DESC 
           LIMIT ? OFFSET ?`,
          [channelId, limit, offset],
          (err, messages) => {
            if (err) {
              console.error('Ошибка получения сообщений:', err);
              if (err.message && err.message.includes('no such table')) {
                socket.emit('error', { message: 'База данных еще не инициализирована. Попробуйте позже.' });
              } else {
                socket.emit('error', { message: 'Ошибка получения сообщений' });
              }
              return;
            }
            socket.emit('messages_list', (messages || []).reverse());
          }
        );
      } catch (error) {
        console.error('Ошибка при получении базы данных:', error);
        socket.emit('error', { message: 'База данных не доступна' });
      }
    });

    // Отправка сообщения с валидацией
    socket.on('send_message', (data) => {
      const user = users.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'Пользователь не авторизован' });
        return;
      }

      // Валидация данных
      if (!data || !data.channelId || !data.content) {
        socket.emit('error', { message: 'Неверные данные сообщения' });
        return;
      }

      // Ограничение длины сообщения
      const content = String(data.content).trim();
      if (content.length === 0) {
        socket.emit('error', { message: 'Сообщение не может быть пустым' });
        return;
      }
      if (content.length > 2000) {
        socket.emit('error', { message: 'Сообщение слишком длинное (максимум 2000 символов)' });
        return;
      }

      try {
        const db = getDatabase();
        const messageId = uuidv4();
        
        db.run(
          "INSERT INTO messages (id, channel_id, user_id, content) VALUES (?, ?, ?, ?)",
          [messageId, data.channelId, user.id, content],
          function(err) {
            if (err) {
              console.error('Ошибка отправки сообщения:', err);
              if (err.message && err.message.includes('no such table')) {
                socket.emit('error', { message: 'База данных еще не инициализирована. Попробуйте позже.' });
              } else {
                socket.emit('error', { message: 'Ошибка отправки сообщения: ' + err.message });
              }
              return;
            }

            const message = {
              id: messageId,
              channel_id: data.channelId,
              user_id: user.id,
              username: user.username,
              content: content,
              created_at: new Date().toISOString()
            };

            io.to(data.channelId).emit('new_message', message);
          }
        );
      } catch (error) {
        console.error('Ошибка при получении базы данных для отправки сообщения:', error);
        socket.emit('error', { message: 'База данных не доступна' });
      }
    });

    // Редактирование сообщения
    socket.on('edit_message', (data) => {
      const user = users.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'Пользователь не авторизован' });
        return;
      }

      const db = getDatabase();
      db.run(
        "UPDATE messages SET content = ? WHERE id = ? AND user_id = ?",
        [data.content, data.messageId, user.id],
        function(err) {
          if (err || this.changes === 0) {
            socket.emit('error', { message: 'Ошибка редактирования сообщения' });
            return;
          }

          io.to(data.channelId).emit('message_edited', {
            id: data.messageId,
            content: data.content
          });
        }
      );
    });

    // Удаление сообщения
    socket.on('delete_message', (data) => {
      const user = users.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'Пользователь не авторизован' });
        return;
      }

      const db = getDatabase();
      db.run(
        "DELETE FROM messages WHERE id = ? AND user_id = ?",
        [data.messageId, user.id],
        function(err) {
          if (err || this.changes === 0) {
            socket.emit('error', { message: 'Ошибка удаления сообщения' });
            return;
          }

          io.to(data.channelId).emit('message_deleted', {
            id: data.messageId
          });
        }
      );
    });

    // Получение списка пользователей онлайн
    socket.on('get_online_users', () => {
      const onlineUsers = Array.from(users.values()).map(u => ({
        id: u.id,
        username: u.username
      }));
      socket.emit('online_users_list', onlineUsers);
    });

    // Присоединение к каналу
    socket.on('join_channel', (channelId) => {
      socket.join(channelId);
      socket.emit('channel_joined', channelId);
    });

    // Покидание канала
    socket.on('leave_channel', (channelId) => {
      socket.leave(channelId);
      socket.emit('channel_left', channelId);
    });

    // Голосовой чат - присоединение
    socket.on('join_voice', (channelId) => {
      if (!voiceRooms.has(channelId)) {
        voiceRooms.set(channelId, new Set());
      }
      voiceRooms.get(channelId).add(socket.id);
      socket.join(`voice_${channelId}`);
      
      const user = users.get(socket.id);
      socket.to(`voice_${channelId}`).emit('user_joined_voice', {
        socketId: socket.id,
        username: user?.username || 'Unknown'
      });
      
      socket.emit('voice_joined', channelId);
    });

    // Голосовой чат - WebRTC сигналы
    socket.on('voice_error', (data) => {
      console.error(`🚨 Ошибка голосового чата в канале ${data.channelId}:`, data.error);
      // Можно добавить логирование в базу данных здесь
    });

    socket.on('voice_signal', (data) => {
      if (data.to) {
        // Отправляем конкретному пользователю
        socket.to(data.to).emit('voice_signal', {
          signal: data.signal,
          from: socket.id,
          channelId: data.channelId
        });
      } else {
        // Broadcast всем в комнате (для обратной совместимости)
        socket.to(`voice_${data.channelId}`).emit('voice_signal', {
          signal: data.signal,
          from: socket.id,
          channelId: data.channelId
        });
      }
    });

    // Голосовой чат - выход
    socket.on('leave_voice', (channelId) => {
      if (voiceRooms.has(channelId)) {
        voiceRooms.get(channelId).delete(socket.id);
        if (voiceRooms.get(channelId).size === 0) {
          voiceRooms.delete(channelId);
        }
      }
      socket.leave(`voice_${channelId}`);
      
      socket.to(`voice_${channelId}`).emit('user_left_voice', {
        socketId: socket.id
      });
    });

    // Отключение с оптимизированной очисткой
    socket.on('disconnect', () => {
      const user = users.get(socket.id);
      
      // Удаляем из всех голосовых комнат
      voiceRooms.forEach((members, channelId) => {
        if (members.has(socket.id)) {
          members.delete(socket.id);
          socket.to(`voice_${channelId}`).emit('user_left_voice', {
            socketId: socket.id
          });
          // Удаляем комнату, если она пустая
          if (members.size === 0) {
            voiceRooms.delete(channelId);
          }
        }
      });
      
      if (user) {
        socket.broadcast.emit('user_left', { userId: user.id });
        
        // Оптимизированное обновление списка пользователей
        users.delete(socket.id);
        const onlineUsers = Array.from(users.values()).map(u => ({
          id: u.id,
          username: u.username
        }));
        socket.broadcast.emit('online_users_list', onlineUsers);
      } else {
        users.delete(socket.id);
      }
      
      console.log(`👋 Пользователь отключен: ${socket.id}`);
    });
  });
}

module.exports = { setupSocketHandlers };

