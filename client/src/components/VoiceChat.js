import React, { useState, useEffect, useRef, useCallback } from 'react';
import './VoiceChat.css';

// Конфигурация ICE серверов вынесена в константу для переиспользования
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

function VoiceChat({ channelId, channelName, socket, user }) {
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState(null);
  const peerConnections = useRef(new Map());
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef(new Map());
  const remoteStreamsRef = useRef(new Map()); // Резервное хранилище потоков
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const isMountedRef = useRef(true);

  // Единая функция создания RTCPeerConnection (убрано дублирование)
  const createRTCPeerConnection = useCallback((socketId, isInitiator = false) => {
    // Проверяем, не создано ли уже соединение
    if (peerConnections.current.has(socketId)) {
      const existingPc = peerConnections.current.get(socketId);
      // Если локальный поток еще не добавлен, добавляем его
      if (localStream && existingPc.getSenders().length === 0) {
        console.log('Добавляю треки к существующему peer connection для:', socketId);
        localStream.getTracks().forEach(track => {
          existingPc.addTrack(track, localStream);
        });
      }
      return existingPc;
    }

    const pc = new RTCPeerConnection({ 
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });

    // Храним накопленные ICE candidates до установки remote description
    const pendingIceCandidates = [];

    // Добавляем локальный поток, если он есть
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('Добавляю трек к новому peer connection:', track.kind, track.id, 'для:', socketId);
        pc.addTrack(track, localStream);
      });
    } else {
      console.warn('⚠️ Локальный поток еще не готов при создании peer connection для:', socketId);
    }

    // Обработчик получения удаленного потока
    pc.ontrack = (event) => {
      if (!isMountedRef.current) return;
      console.log('🎵 Получен удаленный аудио поток от:', socketId, event.streams);
      
      const remoteStream = event.streams[0];
      if (remoteStream) {
        console.log('Треки в потоке:', remoteStream.getTracks().length);
        remoteStream.getTracks().forEach(track => {
          console.log('  - Трек:', track.kind, track.id, 'enabled:', track.enabled, 'muted:', track.muted, 'readyState:', track.readyState);
          
          // ВАЖНО: Включаем трек если он отключен
          if (!track.enabled) {
            console.log('  ⚠️ Трек отключен, включаю его');
            track.enabled = true;
          }
          
          // Обработчик изменения состояния трека
          track.onended = () => {
            console.warn('⚠️ Трек завершен для:', socketId, 'попытка восстановить...');
            // Пытаемся получить трек из потока снова
            const currentStream = remoteStreams.get(socketId);
            if (currentStream && currentStream.getTracks().length > 0) {
              console.log('  Трек все еще в потоке, возможно это временная проблема');
            } else {
              console.error('  ❌ Поток потерян!');
            }
          };
          
          track.onmute = () => {
            console.warn('⚠️ Трек заглушен для:', socketId);
            // Пытаемся разглушить
            if (track.enabled) {
              console.log('  Трек enabled, но muted - это может быть проблемой браузера');
            }
          };
          
          track.onunmute = () => {
            console.log('✅ Трек разглушен для:', socketId);
          };
          
          // Предотвращаем завершение трека
          track.addEventListener('ended', (e) => {
            console.warn('⚠️ Событие ended для трека:', track.id);
            e.preventDefault();
          }, { once: false });
        });
        
        // ВАЖНО: Сохраняем поток в ref СНАЧАЛА для немедленного доступа
        remoteStreamsRef.current.set(socketId, remoteStream);
        console.log('💾 Сохраняю поток в ref для:', socketId, 'всего потоков в ref:', remoteStreamsRef.current.size);
        
        // Затем обновляем state (создаем новую Map для React)
        setRemoteStreams(prevStreams => {
          const newStreams = new Map(prevStreams);
          newStreams.set(socketId, remoteStream);
          console.log('💾 Сохраняю поток в state для:', socketId, 'всего потоков в state:', newStreams.size);
          console.log('  Проверка: поток в новой Map?', newStreams.has(socketId));
          return newStreams;
        });
        
        // Дополнительно сохраняем поток в peer connection для надежности
        pc._remoteStream = remoteStream;
        
        // Принудительно обновляем компонент через небольшой таймаут
        setTimeout(() => {
          setRemoteStreams(current => {
            if (!current.has(socketId)) {
              console.warn('⚠️ Поток потерян в state, восстанавливаю из ref');
              const restored = new Map(current);
              restored.set(socketId, remoteStream);
              return restored;
            }
            return current;
          });
        }, 100);
      }
    };

    // Обработчик ICE кандидатов
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && socket.connected) {
        console.log('Отправляю ICE candidate для:', socketId);
        socket.emit('voice_signal', {
          channelId,
          signal: {
            type: 'ice-candidate',
            candidate: event.candidate
          },
          to: socketId
        });
      } else if (!event.candidate) {
        console.log('ICE gathering завершен для:', socketId);
      }
    };

    // Обработчик ICE соединения
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state для ${socketId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.error('❌ ICE connection failed для:', socketId);
        // Попробуем перезапустить ICE
        pc.restartIce();
      }
    };

    // Обработка ошибок соединения
    pc.onerror = (error) => {
      console.error('RTCPeerConnection error:', error);
    };

    // Обработка закрытия соединения
    pc.onconnectionstatechange = () => {
      console.log(`Peer connection ${socketId} state: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn(`⚠️ Peer connection ${socketId} state: ${pc.connectionState}`);
      }
      if (pc.connectionState === 'connected') {
        console.log(`✅ Peer connection ${socketId} установлено!`);
      }
    };

    // Функция для обработки накопленных ICE candidates
    const processPendingIceCandidates = async () => {
      while (pendingIceCandidates.length > 0 && pc.remoteDescription) {
        const candidate = pendingIceCandidates.shift();
        try {
          await pc.addIceCandidate(candidate);
          console.log('Добавлен накопленный ICE candidate для:', socketId);
        } catch (error) {
          console.error('Ошибка добавления накопленного ICE candidate:', error);
        }
      }
    };

    // Сохраняем функцию обработки в объекте соединения
    pc._processPendingCandidates = processPendingIceCandidates;

    peerConnections.current.set(socketId, pc);
    return pc;
  }, [channelId, localStream, socket]);

  // Создание peer connection с инициацией offer
  const createPeerConnection = useCallback(async (socketId) => {
    if (peerConnections.current.has(socketId)) {
      const existingPc = peerConnections.current.get(socketId);
      
      // Проверяем состояние соединения
      const state = existingPc.signalingState;
      console.log('Существующее соединение для', socketId, 'в состоянии:', state);
      
      // Если уже есть remote offer, не создаем свой offer - ждем answer
      if (state === 'have-remote-offer') {
        console.log('Уже есть remote offer, не создаю свой offer для:', socketId);
        return;
      }
      
      // Если уже установлены descriptions, не создаем offer
      if (state === 'stable' && existingPc.localDescription && existingPc.remoteDescription) {
        console.log('Descriptions уже установлены для:', socketId);
        return;
      }
      
      // Проверяем, есть ли уже треки
      if (existingPc.getSenders().length > 0 && state === 'stable') {
        console.log('Peer connection уже существует с треками для:', socketId);
        return;
      }
      
      // Если соединение есть, но треков нет, добавляем их
      if (localStream && existingPc.getSenders().length === 0) {
        localStream.getTracks().forEach(track => {
          existingPc.addTrack(track, localStream);
        });
        // Создаем offer только если нет remote description
        if (!existingPc.remoteDescription && state === 'stable') {
          try {
            const offer = await existingPc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: false
            });
            await existingPc.setLocalDescription(offer);
            console.log('Offer создан для существующего соединения:', socketId);
            if (socket && socket.connected) {
              socket.emit('voice_signal', {
                channelId,
                signal: offer,
                to: socketId
              });
            }
          } catch (error) {
            console.error('Ошибка создания offer для существующего соединения:', error);
          }
        }
      }
      return;
    }

    if (!localStream) {
      console.warn('⚠️ Локальный поток не готов, не могу создать peer connection для:', socketId);
      return;
    }

    console.log('Создаю новый peer connection для:', socketId);
    const pc = createRTCPeerConnection(socketId, true);

    // Убеждаемся, что треки добавлены
    if (localStream && pc.getSenders().length === 0) {
      localStream.getTracks().forEach(track => {
        console.log('Добавляю трек к peer connection:', track.kind, track.id);
        pc.addTrack(track, localStream);
      });
    }

    try {
      // Проверяем, не получили ли мы уже offer от этого пользователя
      if (pc.signalingState !== 'stable' || pc.remoteDescription) {
        console.log('Уже есть remote description, не создаю offer для:', socketId);
        return;
      }
      
      // Создаем offer с правильными настройками для аудио
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await pc.setLocalDescription(offer);
      console.log('Offer создан и отправляется для:', socketId, offer.type);
      if (socket && socket.connected) {
        socket.emit('voice_signal', {
          channelId,
          signal: offer,
          to: socketId
        });
      }
    } catch (error) {
      console.error('Ошибка создания offer:', error);
      // Очищаем соединение при ошибке
      if (peerConnections.current.has(socketId)) {
        peerConnections.current.get(socketId).close();
        peerConnections.current.delete(socketId);
      }
      if (socket && socket.connected) {
        socket.emit('voice_error', {
          channelId,
          error: error.message,
          type: 'offer_creation'
        });
      }
    }
  }, [channelId, socket, createRTCPeerConnection, localStream]);

  // Обработка WebRTC сигналов
  useEffect(() => {
    if (!socket) return;

    const handleVoiceJoined = () => {
      if (isMountedRef.current) {
        console.log('✅ Подтверждение: присоединился к голосовому каналу');
        setIsConnected(true);
      }
    };

    const handleExistingParticipants = (data) => {
      if (!isMountedRef.current) return;
      
      console.log('Получен список существующих участников:', data.participants);
      
      // Добавляем существующих участников
      setParticipants(prev => {
        const newParticipants = [...prev];
        data.participants.forEach(participant => {
          if (!newParticipants.some(p => p.socketId === participant.socketId)) {
            newParticipants.push(participant);
          }
        });
        return newParticipants;
      });
      
      // ВАЖНО: Новый пользователь создает offer для существующих участников
      // Это произойдет через useEffect когда localStream будет готов
      console.log('Буду создавать offer для существующих участников когда локальный поток будет готов');
    };

    const handleUserJoinedVoice = (data) => {
      if (!isMountedRef.current) return;
      
      // Проверяем, что это не мы сами
      const currentSocketId = socket.id;
      if (!currentSocketId || data.socketId === currentSocketId) {
        return;
      }

      console.log('Новый пользователь присоединился к голосовому каналу:', data.socketId, data.username);

      setParticipants(prev => {
        // Предотвращаем дублирование участников
        if (prev.some(p => p.socketId === data.socketId)) {
          return prev;
        }
        return [...prev, data];
      });
      
      // ВАЖНО: Существующий участник создает offer для нового пользователя
      // Это должно произойти только если у нас уже есть локальный поток
      if (localStream) {
        console.log('Создаю offer для нового пользователя:', data.socketId);
        createPeerConnection(data.socketId);
      } else {
        console.warn('⚠️ Локальный поток не готов, не могу создать offer для:', data.socketId);
      }
    };

    const handleUserLeftVoice = (data) => {
      if (!isMountedRef.current) return;
      
      console.log('👋 Пользователь покинул голосовой канал:', data.socketId);
      
      setParticipants(prev => prev.filter(p => p.socketId !== data.socketId));
      
      // Очищаем peer connection
      const pc = peerConnections.current.get(data.socketId);
      if (pc) {
        console.log('Закрываю peer connection для:', data.socketId);
        pc.close();
        peerConnections.current.delete(data.socketId);
      }
      
      // Очищаем удаленный поток только если пользователь действительно ушел
      setRemoteStreams(prevStreams => {
        const newStreams = new Map(prevStreams);
        if (newStreams.has(data.socketId)) {
          console.log('Удаляю поток для покинувшего пользователя:', data.socketId);
          newStreams.delete(data.socketId);
        }
        return newStreams;
      });
    };

    const handleVoiceSignal = async (data) => {
      if (!isMountedRef.current) return;
      
      const currentSocketId = socket.id;
      if (!currentSocketId || data.from === currentSocketId) {
        return; // Игнорируем свои сигналы
      }

      console.log('Получен сигнал от:', data.from, 'тип:', data.signal.type);

      let pc = peerConnections.current.get(data.from);

      // Создаем новое соединение, если его еще нет (используем единую функцию)
      if (!pc) {
        console.log('Создаю новое peer connection для сигнала от:', data.from);
        pc = createRTCPeerConnection(data.from, false);
      }

      try {
        // Проверяем текущее состояние соединения
        const currentState = pc.signalingState;
        console.log('Текущее состояние соединения для', data.from, ':', currentState);

        if (data.signal.type === 'offer') {
          // Проверяем, не создали ли мы уже свой offer
          if (currentState === 'have-local-offer' || pc.localDescription) {
            console.warn('⚠️ Уже есть local offer, игнорирую входящий offer от:', data.from);
            return;
          }
          
          console.log('Обрабатываю offer от:', data.from);
          
          // Убеждаемся, что локальный поток добавлен перед обработкой offer
          if (localStream && pc.getSenders().length === 0) {
            localStream.getTracks().forEach(track => {
              console.log('Добавляю трек перед обработкой offer:', track.kind, track.id);
              pc.addTrack(track, localStream);
            });
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          console.log('Remote description (offer) установлен для:', data.from);
          
          // Обрабатываем накопленные ICE candidates если они есть
          if (pc._pendingCandidates && pc._pendingCandidates.length > 0) {
            console.log('Обрабатываю накопленные ICE candidates:', pc._pendingCandidates.length);
            for (const candidate of pc._pendingCandidates) {
              try {
                await pc.addIceCandidate(candidate);
                console.log('✅ Добавлен накопленный ICE candidate');
              } catch (error) {
                console.error('Ошибка добавления накопленного candidate:', error);
              }
            }
            pc._pendingCandidates = [];
          }
          
          const answer = await pc.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
          });
          await pc.setLocalDescription(answer);
          console.log('Answer создан и отправляется для:', data.from, answer.type);
          if (socket && socket.connected) {
            socket.emit('voice_signal', {
              channelId,
              signal: answer,
              to: data.from
            });
          }
        } else if (data.signal.type === 'answer') {
          // Проверяем, что мы в правильном состоянии для установки answer
          if (currentState !== 'have-local-offer') {
            console.warn('⚠️ Неправильное состояние для answer:', currentState, 'от:', data.from);
            return;
          }
          
          console.log('Обрабатываю answer от:', data.from);
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          console.log('Remote description (answer) установлен для:', data.from);
          
          // Обрабатываем накопленные ICE candidates если они есть
          if (pc._pendingCandidates && pc._pendingCandidates.length > 0) {
            console.log('Обрабатываю накопленные ICE candidates после answer:', pc._pendingCandidates.length);
            for (const candidate of pc._pendingCandidates) {
              try {
                await pc.addIceCandidate(candidate);
              } catch (error) {
                console.error('Ошибка добавления накопленного candidate:', error);
              }
            }
            pc._pendingCandidates = [];
          }
        } else if (data.signal.type === 'ice-candidate') {
          if (data.signal.candidate) {
            console.log('Добавляю ICE candidate от:', data.from);
            try {
              const candidate = new RTCIceCandidate(data.signal.candidate);
              
              // Проверяем, установлен ли remote description
              if (pc.remoteDescription) {
                await pc.addIceCandidate(candidate);
                console.log('✅ ICE candidate добавлен для:', data.from);
              } else {
                // Сохраняем candidate для добавления позже
                if (!pc._pendingCandidates) {
                  pc._pendingCandidates = [];
                }
                pc._pendingCandidates.push(candidate);
                console.log('⏳ Remote description еще не установлен, сохраняю candidate (всего:', pc._pendingCandidates.length, ')');
              }
            } catch (error) {
              // Игнорируем ошибки если description еще не установлен
              if (error.message && error.message.includes('remote description')) {
                console.log('Remote description еще не установлен, сохраняю candidate');
                if (!pc._pendingCandidates) {
                  pc._pendingCandidates = [];
                }
                pc._pendingCandidates.push(new RTCIceCandidate(data.signal.candidate));
              } else {
                console.error('Ошибка добавления ICE candidate:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error('❌ Ошибка обработки сигнала:', error, 'от:', data.from, 'тип:', data.signal.type);
        console.error('Состояние соединения:', pc.signalingState);
        console.error('Local description:', pc.localDescription ? 'есть' : 'нет');
        console.error('Remote description:', pc.remoteDescription ? 'есть' : 'нет');
        
        // Очищаем соединение при критической ошибке
        if (error.name === 'InvalidStateError' || error.name === 'OperationError') {
          console.error('Критическая ошибка, закрываю соединение для:', data.from);
          if (peerConnections.current.has(data.from)) {
            peerConnections.current.get(data.from).close();
            peerConnections.current.delete(data.from);
          }
        }
        if (socket && socket.connected) {
          socket.emit('voice_error', {
            channelId,
            error: error.message,
            type: 'signal_processing'
          });
        }
      }
    };

    socket.on('voice_joined', handleVoiceJoined);
    socket.on('existing_voice_participants', handleExistingParticipants);
    socket.on('user_joined_voice', handleUserJoinedVoice);
    socket.on('user_left_voice', handleUserLeftVoice);
    socket.on('voice_signal', handleVoiceSignal);

    return () => {
      socket.off('voice_joined', handleVoiceJoined);
      socket.off('existing_voice_participants', handleExistingParticipants);
      socket.off('user_joined_voice', handleUserJoinedVoice);
      socket.off('user_left_voice', handleUserLeftVoice);
      socket.off('voice_signal', handleVoiceSignal);
    };
  }, [socket, channelId, createPeerConnection, createRTCPeerConnection]);

  // Проверка разрешений при монтировании компонента
  useEffect(() => {
    checkMicrophonePermission();
  }, []);

  // Запуск анализатора речи
  useEffect(() => {
    if (!localStream || !isConnected) {
      // Останавливаем анализ, если нет потока или не подключены
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      return;
    }

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(localStream);
      source.connect(analyser);
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Проверка активности речи с оптимизацией
      const checkSpeaking = () => {
        if (!isMountedRef.current || !analyserRef.current) {
          return;
        }
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Оптимизированный расчет среднего значения
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        
        const muted = localStream?.getAudioTracks()[0]?.enabled === false;
        if (isMountedRef.current) {
          setIsSpeaking(!muted && average > 20);
        }
        
        animationFrameIdRef.current = requestAnimationFrame(checkSpeaking);
      };
      
      checkSpeaking();
    } catch (e) {
      console.log('Анализатор аудио недоступен:', e);
    }

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [localStream, isConnected]);

  const joinVoice = async () => {
    // Проверяем доступность mediaDevices API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Fallback для старых браузеров
      const getUserMedia = navigator.mediaDevices?.getUserMedia || 
                           navigator.getUserMedia || 
                           navigator.webkitGetUserMedia || 
                           navigator.mozGetUserMedia;
      
      if (!getUserMedia) {
        const errorMsg = 'Ваш браузер не поддерживает доступ к микрофону. Используйте современный браузер (Chrome, Firefox, Edge).';
        console.error(errorMsg);
        alert(errorMsg);
        return;
      }
    }

    // Проверяем, что мы на localhost или HTTPS (требование браузеров)
    const isSecureContext = window.isSecureContext || 
                            window.location.protocol === 'https:' || 
                            window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1' ||
                            window.location.hostname === '[::1]';
    
    if (!isSecureContext) {
      const errorMsg = 'Для доступа к микрофону требуется HTTPS соединение или localhost.\n' +
                       'Текущий протокол: ' + window.location.protocol + '\n' +
                       'Текущий хост: ' + window.location.hostname;
      console.error(errorMsg);
      alert(errorMsg);
      return;
    }

    try {
      console.log('Запрос доступа к микрофону...');
      console.log('Протокол:', window.location.protocol);
      console.log('Хост:', window.location.hostname);
      console.log('Secure context:', window.isSecureContext);
      
      // Сначала пробуем с полными настройками
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
      } catch (constraintError) {
        // Если не получилось с настройками, пробуем без них
        console.warn('Не удалось получить доступ с настройками, пробуем без них:', constraintError);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
      }
      
      console.log('Доступ к микрофону получен:', stream);
      
      if (!isMountedRef.current) {
        // Если компонент размонтирован, останавливаем поток
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      console.log('✅ Локальный поток установлен, треки:', stream.getTracks().map(t => ({ kind: t.kind, id: t.id, enabled: t.enabled })));

      if (socket && socket.connected) {
        console.log('📤 Отправляю join_voice для канала:', channelId);
        socket.emit('join_voice', channelId);
      } else {
        console.error('❌ Socket не подключен!', socket ? 'socket существует' : 'socket отсутствует', socket?.connected);
      }
      
      // Очищаем предыдущие ошибки
      setMicPermissionError(null);
    } catch (error) {
      console.error('Ошибка доступа к микрофону:', error);
      console.error('Тип ошибки:', error.name);
      console.error('Сообщение:', error.message);
      console.error('Стек:', error.stack);
      
      let errorMessage = 'Не удалось получить доступ к микрофону.';
      
      switch (error.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          errorMessage = 'Доступ к микрофону запрещен.\n\n' +
            'Как разрешить:\n' +
            '1. Нажмите на иконку замка 🔒 или информации ℹ️ в адресной строке\n' +
            '2. Найдите "Микрофон" в настройках сайта\n' +
            '3. Выберите "Разрешить" или "Спрашивать"\n' +
            '4. Обновите страницу (F5) и попробуйте снова\n\n' +
            'Или в настройках браузера:\n' +
            'Chrome: Настройки → Конфиденциальность → Настройки сайта → Микрофон\n' +
            'Firefox: Настройки → Приватность → Разрешения → Микрофон';
          setMicPermissionError(errorMessage);
          break;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
          errorMessage = 'Микрофон не найден. Убедитесь, что микрофон подключен и работает.';
          setMicPermissionError(errorMessage);
          break;
        case 'NotReadableError':
        case 'TrackStartError':
          errorMessage = 'Микрофон используется другим приложением. Закройте другие программы, использующие микрофон.';
          setMicPermissionError(errorMessage);
          break;
        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
          errorMessage = 'Микрофон не поддерживает требуемые настройки.';
          setMicPermissionError(errorMessage);
          break;
        case 'TypeError':
          errorMessage = 'Ошибка инициализации микрофона. Попробуйте обновить страницу.';
          setMicPermissionError(errorMessage);
          break;
        default:
          errorMessage = `Ошибка доступа к микрофону: ${error.message || error.name}`;
          setMicPermissionError(errorMessage);
      }
      
      alert(errorMessage);
    }
  };

  // Проверка разрешений микрофона
  const checkMicrophonePermission = async () => {
    if (!navigator.permissions) {
      console.log('API permissions не поддерживается в этом браузере');
      return;
    }

    try {
      const result = await navigator.permissions.query({ name: 'microphone' });
      console.log('Статус разрешения микрофона:', result.state);
      
      if (result.state === 'denied') {
        setMicPermissionError('Доступ к микрофону заблокирован. Разрешите доступ в настройках браузера.');
      } else if (result.state === 'prompt') {
        setMicPermissionError(null);
      } else if (result.state === 'granted') {
        setMicPermissionError(null);
      }
      
      result.onchange = () => {
        console.log('Статус разрешения изменился:', result.state);
        if (result.state === 'granted') {
          setMicPermissionError(null);
        }
      };
    } catch (error) {
      console.log('Не удалось проверить разрешения:', error);
    }
  };

  const toggleMute = () => {
    if (localStream) {
      const newMutedState = !isMuted;
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !newMutedState; // Инвертируем: если muted=true, то track.enabled=false
      });
      setIsMuted(newMutedState);
    }
  };

  // Функция очистки всех ресурсов
  const cleanupResources = useCallback(() => {
    // Останавливаем animation frame
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    // Закрываем audio context
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        console.warn('Ошибка при закрытии AudioContext:', e);
      }
      audioContextRef.current = null;
    }

    // Останавливаем локальный поток
    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
      });
    }

    // Закрываем все peer connections
    peerConnections.current.forEach(pc => {
      try {
        pc.close();
      } catch (e) {
        console.warn('Ошибка при закрытии RTCPeerConnection:', e);
      }
    });
    peerConnections.current.clear();

    // НЕ очищаем удаленные потоки при cleanup - они могут быть нужны
    // setRemoteStreams(new Map());
    console.log('🧹 Cleanup ресурсов, но сохраняю remote streams');
  }, [localStream]);

  const leaveVoice = () => {
    cleanupResources();
    setIsConnected(false);
    setIsMuted(false);
    setIsSpeaking(false);
    setLocalStream(null);
    
    if (socket && socket.connected) {
      socket.emit('leave_voice', channelId);
    }
  };

  // Создаем peer connections для всех участников когда локальный поток готов
  useEffect(() => {
    console.log('🔍 useEffect для peer connections:', {
      hasLocalStream: !!localStream,
      participantsCount: participants.length,
      participants: participants.map(p => ({ socketId: p.socketId, username: p.username }))
    });
    
    if (localStream && participants.length > 0) {
      console.log('✅ Локальный поток готов, создаю peer connections для участников:', participants.length);
      participants.forEach(participant => {
        // Создаем peer connection только если его еще нет
        if (!peerConnections.current.has(participant.socketId)) {
          console.log('🚀 Создаю peer connection для участника:', participant.socketId, participant.username);
          createPeerConnection(participant.socketId);
        } else {
          console.log('⚠️ Peer connection уже существует для:', participant.socketId);
        }
      });
    } else if (participants.length > 0 && !localStream) {
      console.log('⏳ Ожидаю локальный поток для создания peer connections...');
    } else if (localStream && participants.length === 0) {
      console.log('⏳ Локальный поток готов, но участников пока нет');
    }
  }, [localStream, participants, createPeerConnection]);

  // Обновляем audio элементы когда появляются удаленные потоки
  useEffect(() => {
    console.log('🔄 useEffect для remoteStreams вызван, потоков в state:', remoteStreams.size, 'в ref:', remoteStreamsRef.current.size);
    
    // Если в state нет потоков, но в ref есть - восстанавливаем
    if (remoteStreams.size === 0 && remoteStreamsRef.current.size > 0) {
      console.warn('⚠️ Потоки потеряны в state, но есть в ref. Восстанавливаю...');
      setRemoteStreams(new Map(remoteStreamsRef.current));
      return;
    }
    
    if (remoteStreams.size === 0) {
      console.warn('⚠️ Нет удаленных потоков! Проверьте, что peer connections установлены.');
      console.warn('  Peer connections:', Array.from(peerConnections.current.keys()));
      console.warn('  Потоки в ref:', Array.from(remoteStreamsRef.current.keys()));
    }
    
    const intervals = new Map();
    
    // Используем потоки из ref если state пустой
    const streamsToProcess = remoteStreams.size > 0 ? remoteStreams : remoteStreamsRef.current;
    console.log('📋 Обрабатываю потоки из:', remoteStreams.size > 0 ? 'state' : 'ref', 'количество:', streamsToProcess.size);
    
    streamsToProcess.forEach((stream, socketId) => {
      // Проверяем, что поток все еще активен
      if (!stream || !stream.getTracks) {
        console.warn('⚠️ Некорректный поток для', socketId);
        return;
      }
      
      const tracks = stream.getTracks();
      if (tracks.length === 0) {
        console.warn('⚠️ Поток для', socketId, 'не имеет треков!');
        return;
      }
      
      const activeTracks = tracks.filter(t => t.readyState === 'live');
      if (activeTracks.length === 0) {
        console.warn('⚠️ Нет активных треков для', socketId);
      }
      
      // Обновляем ref если поток из state
      if (remoteStreams.has(socketId)) {
        remoteStreamsRef.current.set(socketId, stream);
      }
      
      let audioElement = remoteVideoRefs.current.get(socketId);
      
      console.log('🔍 Обрабатываю поток для:', socketId, {
        audioElement: audioElement ? 'есть' : 'нет',
        tracksCount: tracks.length,
        activeTracks: activeTracks.length
      });
      
      // Создаем audio элемент если его нет (fallback, обычно создается в JSX)
      if (!audioElement) {
        console.log('🔊 Создаю новый audio элемент программно для:', socketId);
        audioElement = document.createElement('audio');
        audioElement.autoplay = true;
        audioElement.playsInline = true;
        audioElement.volume = 1.0;
        audioElement.muted = false;
        remoteVideoRefs.current.set(socketId, audioElement);
      }
      
      if (audioElement.srcObject !== stream) {
        console.log('🎵 Обновляю audio элемент для:', socketId);
        audioElement.srcObject = stream;
        audioElement.volume = 1.0;
        audioElement.muted = false;
        
        // Убеждаемся, что треки включены
        stream.getTracks().forEach(track => {
          console.log('  Трек в потоке:', track.kind, track.id, 'enabled:', track.enabled, 'muted:', track.muted, 'readyState:', track.readyState);
          if (!track.enabled) {
            console.log('  ⚠️ Включаю отключенный трек');
            track.enabled = true;
          }
        });
        
        // Принудительное воспроизведение
        const playAudio = async () => {
          try {
            console.log('▶️ Пытаюсь воспроизвести для:', socketId);
            await audioElement.play();
            console.log('✅ Аудио воспроизводится для:', socketId);
          } catch (err) {
            console.error('❌ Ошибка воспроизведения аудио для:', socketId, err);
            setTimeout(() => {
              audioElement.play().catch(e => {
                console.error('❌ Повторная ошибка воспроизведения:', e);
              });
            }, 500);
          }
        };
        
        playAudio();
      } else if (audioElement.paused && audioElement.srcObject) {
        console.log('▶️ Возобновляю воспроизведение для:', socketId);
        audioElement.play().catch(err => {
          console.error('Ошибка возобновления воспроизведения:', err);
        });
      }
      
      // Периодически проверяем, что аудио воспроизводится и поток активен
      if (!intervals.has(socketId)) {
        const checkInterval = setInterval(() => {
          const el = remoteVideoRefs.current.get(socketId);
          // Проверяем сначала в ref, потом в state
          const currentStream = remoteStreamsRef.current.get(socketId) || remoteStreams.get(socketId);
          
          if (!currentStream) {
            console.warn('⚠️ Поток исчез для:', socketId, 'проверяю peer connection...');
            const pc = peerConnections.current.get(socketId);
            if (pc && pc._remoteStream) {
              console.log('  Восстанавливаю поток из peer connection');
              remoteStreamsRef.current.set(socketId, pc._remoteStream);
              setRemoteStreams(prev => {
                const newMap = new Map(prev);
                newMap.set(socketId, pc._remoteStream);
                return newMap;
              });
            }
            return;
          }
          
          if (el) {
            if (el.paused && el.srcObject) {
              console.warn('⚠️ Аудио приостановлено для:', socketId, 'пробую возобновить');
              el.play().catch(err => {
                console.error('Ошибка при попытке возобновить:', err);
              });
            }
            
            // Проверяем треки
            const tracks = currentStream.getTracks();
            const activeTracks = tracks.filter(t => t.readyState === 'live' && t.enabled);
            if (activeTracks.length === 0 && tracks.length > 0) {
              console.warn('⚠️ Нет активных треков для:', socketId);
            }
          }
        }, 2000);
        intervals.set(socketId, checkInterval);
      }
    });
    
    // Очищаем все интервалы при размонтировании
    return () => {
      intervals.forEach(interval => clearInterval(interval));
    };
  }, [remoteStreams]);

  // Очистка при размонтировании компонента или смене канала
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      cleanupResources();
      
      // Уведомляем сервер о выходе, если были подключены
      if (isConnected && socket && socket.connected) {
        socket.emit('leave_voice', channelId);
      }
    };
  }, [channelId, isConnected, socket, cleanupResources]);

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
            <div className={`participant-card local ${isSpeaking ? 'speaking' : ''}`}>
              <div className={`participant-avatar-wrapper ${isSpeaking ? 'speaking' : ''}`}>
                <div className="participant-avatar">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
              </div>
              <div className="participant-info">
                <div className="participant-name">{user?.username || 'Вы'}</div>
                <div className="participant-status">
                  {isMuted ? '🔇 Заглушен' : isSpeaking ? '🎤 Говорит' : 'В сети'}
                </div>
              </div>
              <div className="participant-controls">
                <button 
                  className={`mute-btn ${isMuted ? 'muted' : ''}`}
                  onClick={toggleMute}
                  title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
                >
                  {isMuted ? '🔇' : '🎤'}
                </button>
              </div>
              <audio ref={localVideoRef} autoPlay muted />
            </div>
          )}

          {participants.map(participant => {
            const hasStream = remoteStreams.has(participant.socketId);
            const stream = hasStream ? remoteStreams.get(participant.socketId) : null;
            const isRemoteSpeaking = stream && stream.getTracks().some(track => 
              track.enabled && track.readyState === 'live' && !track.muted
            );
            
            return (
              <div key={participant.socketId} className={`participant-card ${isRemoteSpeaking ? 'speaking' : ''}`}>
                <div className={`participant-avatar-wrapper ${isRemoteSpeaking ? 'speaking' : ''}`}>
                  <div className="participant-avatar">
                    {participant.username?.charAt(0).toUpperCase() || 'U'}
                  </div>
                </div>
                <div className="participant-info">
                  <div className="participant-name">{participant.username || 'Участник'}</div>
                  <div className="participant-status">
                    {hasStream ? (isRemoteSpeaking ? '🎤 Говорит' : '🔊 В сети') : '⏳ Подключение...'}
                  </div>
                </div>
                <audio
                  ref={el => {
                    if (el) {
                      console.log('🎧 Audio элемент создан/обновлен в JSX для:', participant.socketId);
                      remoteVideoRefs.current.set(participant.socketId, el);
                      
                      // Настраиваем элемент
                      el.volume = 1.0;
                      el.muted = false;
                      el.autoplay = true;
                      el.playsInline = true;
                      
                      // Устанавливаем поток если он уже есть
                      if (remoteStreams.has(participant.socketId)) {
                        const stream = remoteStreams.get(participant.socketId);
                        console.log('🎵 Устанавливаю поток в JSX audio элемент для:', participant.socketId);
                        el.srcObject = stream;
                        
                        // Включаем все треки
                        stream.getTracks().forEach(track => {
                          if (!track.enabled) {
                            console.log('  Включаю трек в JSX:', track.id);
                            track.enabled = true;
                          }
                        });
                        
                        // Принудительное воспроизведение
                        el.play().then(() => {
                          console.log('✅ Аудио воспроизводится в JSX для:', participant.socketId);
                        }).catch(err => {
                          console.error('❌ Ошибка воспроизведения в JSX:', err);
                        });
                      }
                    }
                  }}
                  autoPlay
                  playsInline
                  style={{ display: 'none' }}
                />
              </div>
            );
          })}

          {!isConnected && participants.length === 0 && (
            <div className="empty-participants">
              <p>В канале пока никого нет</p>
            </div>
          )}
        </div>

        <div className="voice-controls">
          {micPermissionError && (
            <div className="mic-error-message" style={{
              padding: '10px',
              marginBottom: '10px',
              backgroundColor: '#ff4444',
              color: 'white',
              borderRadius: '5px',
              fontSize: '12px'
            }}>
              ⚠️ {micPermissionError}
            </div>
          )}
          {!isConnected ? (
            <button className="join-voice-btn" onClick={joinVoice}>
              <span>🔊</span>
              Присоединиться к голосовому каналу
            </button>
          ) : (
            <div className="voice-controls-buttons">
              <button 
                className={`mute-control-btn ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
                title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
              >
                {isMuted ? '🔇' : '🎤'}
              </button>
              <button className="leave-voice-btn" onClick={leaveVoice}>
                <span>📞</span>
                Покинуть канал
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VoiceChat;

