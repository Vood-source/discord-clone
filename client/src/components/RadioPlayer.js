import React, { useState, useRef, useEffect } from 'react';
import './RadioPlayer.css';

// Список русских радиостанций
const RADIO_STATIONS = [
  {
    id: 'europa-plus',
    name: 'Европа Плюс',
    url: 'https://ep256.hostingradio.ru:8052/europaplus256.mp3',
    description: 'Популярная музыка и хиты'
  },
  {
    id: 'russian-radio',
    name: 'Русское Радио',
    url: 'https://rusradio.hostingradio.ru/rusradio96.aacp',
    description: 'Русская эстрада и шансон'
  },
  {
    id: 'avtoradio',
    name: 'Авторадио',
    url: 'https://pub0301.101.ru:8000/stream/air/aac/64/99',
    description: 'Автомобильное радио'
  },
  {
    id: 'retro-fm',
    name: 'Retro FM',
    url: 'https://retroserver.streamr.ru:8043/retro256.mp3',
    description: 'Ретро хиты 80-90х'
  },
  {
    id: 'dorozhnoe',
    name: 'Дорожное Радио',
    url: 'https://dorognoe.hostingradio.ru:8000/dorognoe',
    description: 'Музыка для дороги'
  },
  {
    id: 'love-radio',
    name: 'Love Radio',
    url: 'https://pub0301.101.ru:8000/stream/air/aac/64/200',
    description: 'Романтическая музыка'
  },
  {
    id: 'hits-fm',
    name: 'Хит FM',
    url: 'https://hithit.hostingradio.ru:8052/hitfm256.mp3',
    description: 'Только хиты'
  },
  {
    id: 'monte-carlo',
    name: 'Монте-Карло',
    url: 'https://montecarlo.hostingradio.ru:8060/montecarlo256.mp3',
    description: 'Легкая музыка'
  }
];

function RadioPlayer() {
  const [currentStation, setCurrentStation] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume;

    const handleError = (e) => {
      console.error('Ошибка воспроизведения радио:', e);
      setError('Не удалось загрузить радиостанцию. Попробуйте другую.');
      setIsPlaying(false);
    };

    const handleLoadStart = () => {
      setError(null);
      console.log('Начинаю загрузку радиостанции...');
    };

    const handleCanPlay = () => {
      console.log('Радио готово к воспроизведению');
      setError(null);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setError(null);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('error', handleError);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [volume]);

  const handleStationSelect = (station) => {
    if (currentStation?.id === station.id && isPlaying) {
      // Если выбрана та же станция и она играет - останавливаем
      handleStop();
      return;
    }

    setCurrentStation(station);
    setError(null);
    
    if (audioRef.current) {
      audioRef.current.src = station.url;
      audioRef.current.load();
      
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error('Ошибка воспроизведения:', err);
        setError('Не удалось начать воспроизведение. Проверьте подключение к интернету.');
        setIsPlaying(false);
      });
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      setIsPlaying(false);
      setCurrentStation(null);
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  return (
    <div className="radio-player">
      <div className="radio-header">
        <div className="radio-info">
          <span className="radio-icon">📻</span>
          <h2>Русское Радио</h2>
        </div>
      </div>

      <div className="radio-content">
        {currentStation && isPlaying && (
          <div className="radio-now-playing">
            <div className="now-playing-info">
              <div className="station-name-large">{currentStation.name}</div>
              <div className="station-description">{currentStation.description}</div>
              <div className="radio-visualizer">
                <div className="visualizer-bar"></div>
                <div className="visualizer-bar"></div>
                <div className="visualizer-bar"></div>
                <div className="visualizer-bar"></div>
                <div className="visualizer-bar"></div>
              </div>
            </div>
          </div>
        )}

        <div className="radio-stations-list">
          <h3>Выберите радиостанцию:</h3>
          <div className="stations-grid">
            {RADIO_STATIONS.map(station => (
              <div
                key={station.id}
                className={`station-card ${currentStation?.id === station.id && isPlaying ? 'active' : ''}`}
                onClick={() => handleStationSelect(station)}
              >
                <div className="station-icon">
                  {currentStation?.id === station.id && isPlaying ? '▶️' : '📻'}
                </div>
                <div className="station-info">
                  <div className="station-name">{station.name}</div>
                  <div className="station-desc">{station.description}</div>
                </div>
                {currentStation?.id === station.id && isPlaying && (
                  <div className="playing-indicator">●</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="radio-error">
            ⚠️ {error}
          </div>
        )}

        <div className="radio-controls">
          {currentStation && (
            <>
              <button
                className="stop-radio-btn"
                onClick={handleStop}
                title="Остановить"
              >
                ⏹️ Остановить
              </button>
              
              <div className="volume-control">
                <span>🔊</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="volume-slider"
                />
                <span>{Math.round(volume * 100)}%</span>
              </div>
            </>
          )}
        </div>
      </div>

      <audio
        ref={audioRef}
        preload="none"
        crossOrigin="anonymous"
      />
    </div>
  );
}

export default RadioPlayer;


