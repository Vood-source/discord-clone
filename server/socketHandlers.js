const { getDatabase } = require('./database');
const { v4: uuidv4 } = require('uuid');

const users = new Map(); // socketId -> user info
const voiceRooms = new Map(); // channelId -> Set of socketIds

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`👤 Пользователь подключен: ${socket.id}`);

    // Регистрация пользователя
    socket.on('register', async (userData) => {
      const db = getDatabase();
      const userId = uuidv4();
      
      db.run(
        "INSERT INTO users (id, username, email) VALUES (?, ?, ?)",
        [userId, userData.username, userData.email || null],
        function(err) {
          if (err) {
            socket.emit('error', { message: 'Ошибка регистрации' });
            return;
          }
          
          users.set(socket.id, {
            id: userId,
            username: userData.username,
            socketId: socket.id
          });
          
          socket.emit('registered', { userId, username: userData.username });
          socket.broadcast.emit('user_joined', { userId, username: userData.username });
          
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

    // Создание нового сервера
    socket.on('create_server', (serverData) => {
      const user = users.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'Пользователь не авторизован' });
        return;
      }

      const db = getDatabase();
      const serverId = uuidv4();
      
      db.run(
        "INSERT INTO servers (id, name, owner_id) VALUES (?, ?, ?)",
        [serverId, serverData.name || 'Новый сервер', user.id],
        function(err) {
          if (err) {
            socket.emit('error', { message: 'Ошибка создания сервера' });
            return;
          }

          const server = {
            id: serverId,
            name: serverData.name || 'Новый сервер',
            owner_id: user.id,
            created_at: new Date().toISOString()
          };

          // Создаем текстовый канал по умолчанию
          const defaultChannelId = uuidv4();
          db.run(
            "INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, ?, ?)",
            [defaultChannelId, serverId, 'общий', 'text'],
            () => {
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

    // Создание нового канала
    socket.on('create_channel', (channelData) => {
      const user = users.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'Пользователь не авторизован' });
        return;
      }

      const db = getDatabase();
      const channelId = uuidv4();
      
      db.run(
        "INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, ?, ?)",
        [channelId, channelData.serverId, channelData.name || 'новый-канал', channelData.type || 'text'],
        function(err) {
          if (err) {
            socket.emit('error', { message: 'Ошибка создания канала' });
            return;
          }

          const channel = {
            id: channelId,
            server_id: channelData.serverId,
            name: channelData.name || 'новый-канал',
            type: channelData.type || 'text',
            created_at: new Date().toISOString()
          };

          io.to(channelData.serverId).emit('channel_created', channel);
        }
      );
    });

    // Получение сообщений канала
    socket.on('get_messages', (channelId) => {
      const db = getDatabase();
      db.all(
        `SELECT m.*, u.username, u.avatar 
         FROM messages m 
         JOIN users u ON m.user_id = u.id 
         WHERE m.channel_id = ? 
         ORDER BY m.created_at DESC 
         LIMIT 50`,
        [channelId],
        (err, messages) => {
          if (!err) {
            socket.emit('messages_list', (messages || []).reverse());
          }
        }
      );
    });

    // Отправка сообщения
    socket.on('send_message', (data) => {
      const user = users.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'Пользователь не авторизован' });
        return;
      }

      const db = getDatabase();
      const messageId = uuidv4();
      
      db.run(
        "INSERT INTO messages (id, channel_id, user_id, content) VALUES (?, ?, ?, ?)",
        [messageId, data.channelId, user.id, data.content],
        function(err) {
          if (err) {
            socket.emit('error', { message: 'Ошибка отправки сообщения' });
            return;
          }

          const message = {
            id: messageId,
            channel_id: data.channelId,
            user_id: user.id,
            username: user.username,
            content: data.content,
            created_at: new Date().toISOString()
          };

          io.to(data.channelId).emit('new_message', message);
        }
      );
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

    // Отключение
    socket.on('disconnect', () => {
      const user = users.get(socket.id);
      if (user) {
        socket.broadcast.emit('user_left', { userId: user.id });
        socket.broadcast.emit('online_users_list', Array.from(users.values()).filter(u => u.socketId !== socket.id).map(u => ({
          id: u.id,
          username: u.username
        })));
      }
      
      // Удаляем из всех голосовых комнат
      voiceRooms.forEach((members, channelId) => {
        if (members.has(socket.id)) {
          members.delete(socket.id);
          socket.to(`voice_${channelId}`).emit('user_left_voice', {
            socketId: socket.id
          });
        }
      });
      
      users.delete(socket.id);
      console.log(`👋 Пользователь отключен: ${socket.id}`);
    });
  });
}

module.exports = { setupSocketHandlers };

