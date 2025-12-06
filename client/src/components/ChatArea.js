import React, { useState, useRef, useEffect } from 'react';
import './ChatArea.css';

function ChatArea({ channelName, messages, onSendMessage, user }) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="channel-info">
          <span className="channel-icon">#</span>
          <h2>{channelName || 'Канал'}</h2>
        </div>
      </div>

      <div className="messages-container">
        <div className="messages-list">
          {messages.length === 0 ? (
            <div className="empty-messages">
              <p>Пока нет сообщений. Начните общение!</p>
            </div>
          ) : (
            messages.map((message, index) => {
              const showAvatar = index === 0 || messages[index - 1].user_id !== message.user_id;
              const isOwnMessage = message.user_id === user?.id;

              return (
                <div key={message.id} className={`message-wrapper ${isOwnMessage ? 'own' : ''}`}>
                  {showAvatar && (
                    <div className="message-avatar">
                      {message.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                  {!showAvatar && <div className="message-avatar-spacer"></div>}
                  <div className="message-content">
                    {showAvatar && (
                      <div className="message-header">
                        <span className="message-author">{message.username || 'Неизвестный'}</span>
                        <span className="message-time">{formatTime(message.created_at)}</span>
                      </div>
                    )}
                    <div className="message-text">{message.content}</div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="chat-input-container">
        <form onSubmit={handleSubmit} className="chat-input-form">
          <input
            type="text"
            className="chat-input"
            placeholder={`Написать в #${channelName || 'канал'}`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button type="submit" className="send-button" disabled={!inputValue.trim()}>
            Отправить
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatArea;

