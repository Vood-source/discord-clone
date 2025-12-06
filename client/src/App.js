import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import VoiceChat from './components/VoiceChat';
import LoginModal from './components/LoginModal';
import ServerConfigModal from './components/ServerConfigModal';

// Получаем адрес сервера из localStorage или автоматически определяем
const getServerUrl = () => {
  const savedUrl = localStorage.getItem('serverUrl');
  if (savedUrl) return savedUrl;
  
  // В продакшене используем тот же домен (проверяем по hostname)
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return window.location.origin;
  }
  
  // В разработке используем localhost
  return 'http://localhost:5000';
};

let socket = io(getServerUrl());

function App() {
  const [user, setUser] = useState(null);
  const [servers, setServers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showLogin, setShowLogin] = useState(true);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState(getServerUrl());
  const [socketInstance, setSocketInstance] = useState(socket);

  useEffect(() => {
    const currentSocket = socketInstance;
    
    currentSocket.on('connect', () => {
      console.log('✅ Подключено к серверу');
      currentSocket.emit('get_servers');
    });

    currentSocket.on('disconnect', () => {
      console.log('❌ Отключено от сервера');
    });

    currentSocket.on('connect_error', (error) => {
      console.error('Ошибка подключения:', error);
      setShowServerConfig(true);
    });

    currentSocket.on('registered', (userData) => {
      setUser(userData);
      setShowLogin(false);
    });

    currentSocket.on('servers_list', (serversList) => {
      setServers(serversList);
      if (serversList.length > 0 && !selectedServer) {
        setSelectedServer(serversList[0].id);
      }
    });

    currentSocket.on('channels_list', (channelsList) => {
      setChannels(channelsList);
    });

    currentSocket.on('messages_list', (messagesList) => {
      setMessages(messagesList);
    });

    currentSocket.on('new_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    currentSocket.on('error', (error) => {
      console.error('Ошибка:', error);
      alert(error.message);
    });

    return () => {
      currentSocket.off('connect');
      currentSocket.off('disconnect');
      currentSocket.off('connect_error');
      currentSocket.off('registered');
      currentSocket.off('servers_list');
      currentSocket.off('channels_list');
      currentSocket.off('messages_list');
      currentSocket.off('new_message');
      currentSocket.off('error');
    };
  }, [socketInstance, selectedServer]);

  useEffect(() => {
    if (selectedServer) {
      socketInstance.emit('get_channels', selectedServer);
    }
  }, [selectedServer, socketInstance]);

  useEffect(() => {
    if (selectedChannel) {
      socketInstance.emit('join_channel', selectedChannel);
      socketInstance.emit('get_messages', selectedChannel);
    }
  }, [selectedChannel, socketInstance]);

  const handleLogin = (username) => {
    socketInstance.emit('register', { username, email: `${username}@example.com` });
  };

  const sendMessage = (content) => {
    if (selectedChannel && content.trim()) {
      socketInstance.emit('send_message', {
        channelId: selectedChannel,
        content: content.trim()
      });
    }
  };

  const handleServerConfig = (url) => {
    const newUrl = url || 'http://localhost:5000';
    localStorage.setItem('serverUrl', newUrl);
    setServerUrl(newUrl);
    
    // Переподключаемся к новому серверу
    socketInstance.disconnect();
    const newSocket = io(newUrl);
    setSocketInstance(newSocket);
    setShowServerConfig(false);
  };

  const selectedChannelData = channels.find(c => c.id === selectedChannel);
  const isVoiceChannel = selectedChannelData?.type === 'voice';

  return (
    <div className="app">
      {showServerConfig && (
        <ServerConfigModal 
          onConfig={handleServerConfig} 
          currentUrl={serverUrl}
          onClose={() => setShowServerConfig(false)}
        />
      )}
      {showLogin && !user && !showServerConfig && (
        <LoginModal onLogin={handleLogin} />
      )}
      {user && (
        <>
          <Sidebar
            servers={servers}
            channels={channels}
            selectedServer={selectedServer}
            selectedChannel={selectedChannel}
            onSelectServer={setSelectedServer}
            onSelectChannel={setSelectedChannel}
            user={user}
            onServerConfig={() => setShowServerConfig(true)}
          />
          {selectedChannel && (
            <>
              {isVoiceChannel ? (
                <VoiceChat
                  channelId={selectedChannel}
                  channelName={selectedChannelData?.name}
                  socket={socketInstance}
                  user={user}
                />
              ) : (
                <ChatArea
                  channelName={selectedChannelData?.name}
                  messages={messages}
                  onSendMessage={sendMessage}
                  user={user}
                />
              )}
            </>
          )}
          {!selectedChannel && (
            <div className="welcome-screen">
              <h1>Добро пожаловать!</h1>
              <p>Выберите канал для начала общения</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;

