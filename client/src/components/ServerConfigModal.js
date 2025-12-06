import React, { useState } from 'react';
import './ServerConfigModal.css';

function ServerConfigModal({ onConfig, currentUrl, onClose }) {
  const [serverUrl, setServerUrl] = useState(currentUrl);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (serverUrl.trim()) {
      onConfig(serverUrl.trim());
    }
  };

  return (
    <div className="server-config-overlay">
      <div className="server-config-modal">
        <h2>Настройка сервера</h2>
        <p>Введите адрес сервера для подключения</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="http://192.168.1.100:5000"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            autoFocus
          />
          <div className="server-config-buttons">
            <button type="button" onClick={onClose} className="cancel-btn">
              Отмена
            </button>
            <button type="submit" className="connect-btn">
              Подключиться
            </button>
          </div>
        </form>
        <div className="server-config-hint">
          <p><strong>Для локальной сети:</strong></p>
          <p>Узнайте IP адрес сервера (например: 192.168.1.100)</p>
          <p>Используйте формат: http://IP_АДРЕС:5000</p>
          <p><strong>Для интернета:</strong></p>
          <p>Используйте ваш внешний IP или домен</p>
        </div>
      </div>
    </div>
  );
}

export default ServerConfigModal;

