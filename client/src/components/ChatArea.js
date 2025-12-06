import React, { useState, useRef, useEffect } from 'react';
import './ChatArea.css';

function ChatArea({ channelName, messages, onSendMessage, user, socket, channelId }) {
  const [inputValue, setInputValue] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [hoveredMessage, setHoveredMessage] = useState(null);
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
      if (editingMessage) {
        handleSaveEdit(e);
      } else {
        onSendMessage(inputValue);
        setInputValue('');
      }
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const handleEditMessage = (messageId, currentContent) => {
    setEditingMessage({ id: messageId, content: currentContent });
    setInputValue(currentContent);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (editingMessage && inputValue.trim()) {
      socket.emit('edit_message', {
        messageId: editingMessage.id,
        channelId: channelId,
        content: inputValue.trim()
      });
      setEditingMessage(null);
      setInputValue('');
    }
  };

  const handleDeleteMessage = (messageId) => {
    if (window.confirm('Удалить это сообщение?')) {
      socket.emit('delete_message', {
        messageId: messageId,
        channelId: channelId
      });
    }
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setInputValue('');
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
                  <div 
                    className="message-content"
                    onMouseEnter={() => setHoveredMessage(message.id)}
                    onMouseLeave={() => setHoveredMessage(null)}
                  >
                    {showAvatar && (
                      <div className="message-header">
                        <span className="message-author">{message.username || 'Неизвестный'}</span>
                        <span className="message-time">{formatTime(message.created_at)}</span>
                      </div>
                    )}
                    <div className="message-text">
                      {editingMessage?.id === message.id ? (
                        <span style={{ fontStyle: 'italic', color: '#72767d' }}>Редактируется...</span>
                      ) : (
                        message.content
                      )}
                    </div>
                    {isOwnMessage && hoveredMessage === message.id && !editingMessage && (
                      <div className="message-actions">
                        <button 
                          className="message-action-btn"
                          onClick={() => handleEditMessage(message.id, message.content)}
                          title="Редактировать"
                        >
                          ✏️
                        </button>
                        <button 
                          className="message-action-btn"
                          onClick={() => handleDeleteMessage(message.id)}
                          title="Удалить"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
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
            placeholder={editingMessage ? 'Редактировать сообщение...' : `Написать в #${channelName || 'канал'}`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          {editingMessage && (
            <button 
              type="button" 
              className="cancel-edit-btn" 
              onClick={cancelEdit}
            >
              Отмена
            </button>
          )}
          <button type="submit" className="send-button" disabled={!inputValue.trim()}>
            {editingMessage ? 'Сохранить' : 'Отправить'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatArea;

