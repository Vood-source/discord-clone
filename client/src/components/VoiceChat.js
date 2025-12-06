import React, { useState, useEffect, useRef } from 'react';
import './VoiceChat.css';

function VoiceChat({ channelId, channelName, socket, user }) {
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const peerConnections = useRef(new Map());
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef(new Map());

  useEffect(() => {
    socket.on('voice_joined', () => {
      setIsConnected(true);
    });

    socket.on('user_joined_voice', (data) => {
      setParticipants(prev => [...prev, data]);
      if (data.socketId !== socket.id) {
        createPeerConnection(data.socketId);
      }
    });

    socket.on('user_left_voice', (data) => {
      setParticipants(prev => prev.filter(p => p.socketId !== data.socketId));
      if (peerConnections.current.has(data.socketId)) {
        peerConnections.current.get(data.socketId).close();
        peerConnections.current.delete(data.socketId);
      }
      if (remoteStreams.has(data.socketId)) {
        const newStreams = new Map(remoteStreams);
        newStreams.delete(data.socketId);
        setRemoteStreams(newStreams);
      }
    });

    socket.on('voice_signal', async (data) => {
      if (data.from === socket.id) return; // Игнорируем свои сигналы
      
      let pc = peerConnections.current.get(data.from);
      
      // Создаем новое соединение, если его еще нет
      if (!pc) {
        pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        });

        pc.ontrack = (event) => {
          const newStreams = new Map(remoteStreams);
          newStreams.set(data.from, event.streams[0]);
          setRemoteStreams(newStreams);
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('voice_signal', {
              channelId,
              signal: {
                type: 'ice-candidate',
                candidate: event.candidate
              },
              to: data.from
            });
          }
        };

        peerConnections.current.set(data.from, pc);
        
        if (localStream) {
          localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
          });
        }
      }

      try {
        if (data.signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voice_signal', {
            channelId,
            signal: answer,
            to: data.from
          });
        } else if (data.signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
        } else if (data.signal.type === 'ice-candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
        }
      } catch (error) {
        console.error('Ошибка обработки сигнала:', error);
      }
    });

    return () => {
      socket.off('voice_joined');
      socket.off('user_joined_voice');
      socket.off('user_left_voice');
      socket.off('voice_signal');
    };
  }, [socket]);

  const createPeerConnection = async (socketId) => {
    // Проверяем, не создано ли уже соединение
    if (peerConnections.current.has(socketId)) {
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    pc.ontrack = (event) => {
      const newStreams = new Map(remoteStreams);
      newStreams.set(socketId, event.streams[0]);
      setRemoteStreams(newStreams);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('voice_signal', {
          channelId,
          signal: {
            type: 'ice-candidate',
            candidate: event.candidate
          },
          to: socketId
        });
      }
    };

    peerConnections.current.set(socketId, pc);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice_signal', {
        channelId,
        signal: offer,
        to: socketId
      });
    } catch (error) {
      console.error('Ошибка создания offer:', error);
    }
  };

  const joinVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      socket.emit('join_voice', channelId);
    } catch (error) {
      console.error('Ошибка доступа к микрофону:', error);
      alert('Не удалось получить доступ к микрофону. Проверьте разрешения.');
    }
  };

  const leaveVoice = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    setRemoteStreams(new Map());
    setIsConnected(false);
    socket.emit('leave_voice', channelId);
  };

  useEffect(() => {
    return () => {
      leaveVoice();
    };
  }, []);

  return (
    <div className="voice-chat">
      <div className="voice-header">
        <div className="channel-info">
          <span className="channel-icon">🔊</span>
          <h2>{channelName || 'Голосовой канал'}</h2>
        </div>
      </div>

      <div className="voice-content">
        <div className="voice-participants">
          <h3>Участники ({participants.length + (isConnected ? 1 : 0)})</h3>
          
          {isConnected && (
            <div className="participant-card local">
              <div className="participant-avatar">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="participant-info">
                <div className="participant-name">{user?.username || 'Вы'}</div>
                <div className="participant-status">Вы</div>
              </div>
              <audio ref={localVideoRef} autoPlay muted />
            </div>
          )}

          {participants.map(participant => (
            <div key={participant.socketId} className="participant-card">
              <div className="participant-avatar">
                {participant.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="participant-info">
                <div className="participant-name">{participant.username || 'Участник'}</div>
                <div className="participant-status">В сети</div>
              </div>
              {remoteStreams.has(participant.socketId) && (
                <audio
                  ref={el => {
                    if (el && remoteStreams.has(participant.socketId)) {
                      el.srcObject = remoteStreams.get(participant.socketId);
                    }
                    remoteVideoRefs.current.set(participant.socketId, el);
                  }}
                  autoPlay
                />
              )}
            </div>
          ))}

          {!isConnected && participants.length === 0 && (
            <div className="empty-participants">
              <p>В канале пока никого нет</p>
            </div>
          )}
        </div>

        <div className="voice-controls">
          {!isConnected ? (
            <button className="join-voice-btn" onClick={joinVoice}>
              <span>🔊</span>
              Присоединиться к голосовому каналу
            </button>
          ) : (
            <button className="leave-voice-btn" onClick={leaveVoice}>
              <span>📞</span>
              Покинуть канал
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default VoiceChat;

