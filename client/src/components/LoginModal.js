import React, { useState } from 'react';
import './LoginModal.css';

function LoginModal({ onLogin }) {
  const [username, setUsername] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      onLogin(username.trim());
    }
  };

  return (
    <div className="login-modal-overlay">
      <div className="login-modal">
        <h2>Добро пожаловать!</h2>
        <p>Введите ваше имя для входа</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Имя пользователя"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            maxLength={32}
          />
          <button type="submit">Войти</button>
        </form>
      </div>
    </div>
  );
}

export default LoginModal;

