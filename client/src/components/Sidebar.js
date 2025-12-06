import React from 'react';
import './Sidebar.css';

function Sidebar({ servers, channels, selectedServer, selectedChannel, onSelectServer, onSelectChannel, user, onServerConfig }) {
  const textChannels = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');

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
        </div>
      </div>

      <div className="sidebar-content">
        <div className="server-header">
          <h3>{servers.find(s => s.id === selectedServer)?.name || 'Сервер'}</h3>
        </div>

        <div className="channels-section">
          <div className="channels-header">
            <span>ТЕКСТОВЫЕ КАНАЛЫ</span>
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
    </div>
  );
}

export default Sidebar;

