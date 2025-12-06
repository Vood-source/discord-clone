import React, { useState } from 'react';
import './Sidebar.css';

function Sidebar({ servers, channels, selectedServer, selectedChannel, onSelectServer, onSelectChannel, user, onServerConfig, onCreateServer, onCreateChannel, onlineUsers }) {
  const [showCreateServerModal, setShowCreateServerModal] = useState(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  // Фильтруем каналы по выбранному серверу и типу
  const serverChannels = channels.filter(c => c.server_id === selectedServer);
  const textChannels = serverChannels.filter(c => c.type === 'text');
  const voiceChannels = serverChannels.filter(c => c.type === 'voice');

  return (
    <div className="sidebar">
      <div className="sidebar-servers">
        <div className="server-list">
          {servers.map(server => (
            <div
              key={server.id}
              className={`server-icon ${selectedServer === server.id ? 'active' : ''}`}
              onClick={() => onSelectServer(server.id)}
              title={server.name}
            >
              {server.name.charAt(0).toUpperCase()}
            </div>
          ))}
          <div 
            className="server-icon add-server"
            onClick={() => setShowCreateServerModal(true)}
            title="Создать сервер"
          >
            +
          </div>
        </div>
      </div>

      <div className="sidebar-content">
        <div className="server-header">
          <h3>{servers.find(s => s.id === selectedServer)?.name || 'Сервер'}</h3>
        </div>

        <div className="channels-section">
          <div className="channels-header">
            <span>ТЕКСТОВЫЕ КАНАЛЫ</span>
            {selectedServer && (
              <button 
                className="add-channel-btn"
                onClick={() => setShowCreateChannelModal({ type: 'text' })}
                title="Создать текстовый канал"
              >
                +
              </button>
            )}
          </div>
          <div className="channels-list">
            {textChannels.map(channel => (
              <div
                key={channel.id}
                className={`channel-item ${selectedChannel === channel.id ? 'active' : ''}`}
                onClick={() => onSelectChannel(channel.id)}
              >
                <span className="channel-icon">#</span>
                <span className="channel-name">{channel.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="channels-section">
          <div className="channels-header">
            <span>ГОЛОСОВЫЕ КАНАЛЫ</span>
            {selectedServer && (
              <button 
                className="add-channel-btn"
                onClick={() => setShowCreateChannelModal({ type: 'voice' })}
                title="Создать голосовой канал"
              >
                +
              </button>
            )}
          </div>
          <div className="channels-list">
            {voiceChannels.map(channel => (
              <div
                key={channel.id}
                className={`channel-item voice ${selectedChannel === channel.id ? 'active' : ''}`}
                onClick={() => onSelectChannel(channel.id)}
              >
                <span className="channel-icon">🔊</span>
                <span className="channel-name">{channel.name}</span>
              </div>
            ))}
          </div>
        </div>

        {onlineUsers && onlineUsers.length > 0 && (
          <div className="channels-section">
            <div className="channels-header">
              <span>ОНЛАЙН — {onlineUsers.length}</span>
            </div>
            <div className="users-list">
              {onlineUsers.map(onlineUser => (
                <div key={onlineUser.id} className="user-item">
                  <div className="user-status-indicator online"></div>
                  <span className="user-name">{onlineUser.username}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-user">
        <div className="user-info">
          <div className="user-avatar">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="user-details">
            <div className="username">{user?.username || 'Гость'}</div>
            <div className="user-status">В сети</div>
          </div>
        </div>
        {onServerConfig && (
          <button 
            className="server-config-btn" 
            onClick={onServerConfig}
            title="Настройки сервера"
          >
            ⚙️
          </button>
        )}
      </div>

      {showCreateServerModal && (
        <CreateServerModal
          onClose={() => setShowCreateServerModal(false)}
          onCreate={onCreateServer}
        />
      )}

      {showCreateChannelModal && (
        <CreateChannelModal
          onClose={() => setShowCreateChannelModal(false)}
          onCreate={onCreateChannel}
          type={showCreateChannelModal.type}
        />
      )}
    </div>
  );
}

function CreateServerModal({ onClose, onCreate }) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim());
      setName('');
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Создать сервер</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Название сервера"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={32}
          />
          <div className="modal-buttons">
            <button type="button" onClick={onClose}>Отмена</button>
            <button type="submit">Создать</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateChannelModal({ onClose, onCreate, type }) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim(), type);
      setName('');
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Создать {type === 'voice' ? 'голосовой' : 'текстовый'} канал</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder={`Название ${type === 'voice' ? 'голосового' : 'текстового'} канала`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={32}
          />
          <div className="modal-buttons">
            <button type="button" onClick={onClose}>Отмена</button>
            <button type="submit">Создать</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Sidebar;

