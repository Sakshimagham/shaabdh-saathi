import React, { useState, useEffect, useRef } from 'react';

// ==========================================
// API BASE URL – uses environment variable or falls back to localhost
// ==========================================
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ==========================================
// UNIVERSAL AUDIO PLAYER CONTROL COMPONENT
// ==========================================
function UniversalAudioPlayer({ textToRead, title = "Voice Assistant" }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const synthRef = useRef(window.speechSynthesis);
  const utteranceRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!textToRead) return;

    // Clean quotes and clean text for natural speech synthesis
    const cleanText = textToRead.replace(/^"+|"+$/g, "").trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = playbackSpeed;

    // Estimate duration in seconds based on average reading rate
    const wordsCount = cleanText.split(/\s+/).length;
    const estSecs = Math.max(3, Math.ceil(wordsCount / (2.6 * playbackSpeed)));
    setDuration(estSecs);

    utterance.onend = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      clearInterval(timerRef.current);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      clearInterval(timerRef.current);
    };

    utteranceRef.current = utterance;

    return () => {
      synthRef.current.cancel();
      clearInterval(timerRef.current);
    };
  }, [textToRead, playbackSpeed]);

  const togglePlayPause = () => {
    if (!utteranceRef.current) return;

    if (isPlaying) {
      synthRef.current.pause();
      setIsPlaying(false);
      clearInterval(timerRef.current);
    } else {
      if (synthRef.current.paused) {
        synthRef.current.resume();
      } else {
        synthRef.current.cancel();
        synthRef.current.speak(utteranceRef.current);
      }
      setIsPlaying(true);

      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            clearInterval(timerRef.current);
            return duration;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const handleSeek = (e) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    synthRef.current.cancel();
    if (isPlaying) {
      synthRef.current.speak(utteranceRef.current);
    }
  };

  const cycleSpeed = () => {
    const speeds = [0.75, 1.0, 1.25, 1.5];
    const nextSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    if (isPlaying) {
      synthRef.current.cancel();
      setIsPlaying(false);
      setCurrentTime(0);
    }
  };

  const resetAudio = () => {
    synthRef.current.cancel();
    setCurrentTime(0);
    setIsPlaying(false);
    clearInterval(timerRef.current);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div style={{
      backgroundColor: '#1E293B',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '12px',
      marginTop: '12px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      border: '1px solid #334155'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#FBBF24' }}>🔊</span>
          <span style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8' }}>
            {title}
          </span>
        </div>
        <button
          onClick={cycleSpeed}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: '#334155',
            color: '#FBBF24',
            fontSize: '11px',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #475569',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#475569'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#334155'}
        >
          ⏩ {playbackSpeed}x Speed
        </button>
      </div>

      {/* Progress & Seek Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}>
        <span style={{ fontSize: '11px', color: '#94A3B8', width: '28px', textAlign: 'right', fontFamily: 'monospace' }}>
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min="0"
          max={duration}
          value={currentTime}
          onChange={handleSeek}
          style={{
            flex: 1,
            accentColor: '#F59E0B',
            height: '6px',
            backgroundColor: '#475569',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        />
        <span style={{ fontSize: '11px', color: '#94A3B8', width: '28px', fontFamily: 'monospace' }}>
          {formatTime(duration)}
        </span>
      </div>

      {/* Control Buttons */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
        <button
          onClick={resetAudio}
          style={{
            padding: '6px',
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            color: '#94A3B8',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => { e.target.style.color = 'white'; e.target.style.backgroundColor = '#334155'; }}
          onMouseLeave={(e) => { e.target.style.color = '#94A3B8'; e.target.style.backgroundColor = 'transparent'; }}
          title="Restart Audio"
        >
          🔄
        </button>

        <button
          onClick={togglePlayPause}
          style={{
            backgroundColor: '#F59E0B',
            color: 'white',
            padding: '10px',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '44px',
            height: '44px'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#D97706'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#F59E0B'}
        >
          {isPlaying ? '⏸' : '▶️'}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// DIALOGUE CARD WITH AUDIO
// ==========================================
function DialogueCard({ dialogue, index }) {
  const cleanQuote = (dialogue.quote || dialogue.dialogue || dialogue.expression || "")
    .replace(/^"+|"+$/g, "")
    .trim();

  const movie = dialogue.movie || "";
  const speaker = dialogue.speaker || "";
  const meaning = dialogue.what_it_means || dialogue.whatItMeans || dialogue.meaning || dialogue.what || "";
  const whenToUse = dialogue.when_to_use || dialogue.whenToUse || dialogue.when || "";
  const whereToUse = dialogue.where_to_use || dialogue.whereToUse || dialogue.where || "";
  const howToUse = dialogue.how_to_use || dialogue.howToUse || dialogue.how || dialogue.example || "";
  const marathi = dialogue.marathi_explanation || dialogue.marathiExplanation || dialogue.marathi || dialogue.marathi_meaning || "";

  // Audio script combining full dialogue context
  const fullAudioScript = `${cleanQuote}. ${meaning ? "Meaning: " + meaning : ""}. ${marathi ? "Marathi: " + marathi : ""}`;

  return (
    <div style={{
      border: '1px solid #FDE68A',
      borderRadius: '16px',
      padding: '20px',
      background: '#FFFFFF',
      marginBottom: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
    }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span style={{ background: '#F59E0B', color: '#FFF', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px' }}>
            {index + 1}
          </span>
          <h4 style={{ margin: 0, color: '#1F2937', fontSize: '18px', fontWeight: '700' }}>
            "{cleanQuote}"
          </h4>
        </div>
        {(movie || speaker) && (
          <p style={{ fontSize: '12px', fontWeight: '500', color: '#D97706', margin: '4px 0 0 38px' }}>
            🎬 {movie} {speaker ? `• ${speaker}` : ""}
          </p>
        )}
      </div>

      {/* Details */}
      <div style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>
        {meaning && (
          <p style={{ margin: '4px 0' }}><strong>💡 Meaning:</strong> {meaning}</p>
        )}
        {whenToUse && (
          <p style={{ margin: '4px 0' }}><strong>⏰ When to use:</strong> {whenToUse}</p>
        )}
        {whereToUse && (
          <p style={{ margin: '4px 0' }}><strong>📍 Where to use:</strong> {whereToUse}</p>
        )}
        {howToUse && (
          <p style={{ margin: '4px 0' }}><strong>💬 How to use:</strong> <em>"{howToUse}"</em></p>
        )}
        {marathi && (
          <div style={{
            marginTop: '8px',
            padding: '12px',
            background: '#FFFBEB',
            borderRadius: '8px',
            borderLeft: '4px solid #F59E0B'
          }}>
            <p style={{ margin: 0, color: '#92400E', fontSize: '13px' }}>
              🚩 मराठी स्पष्टीकरण: {marathi}
            </p>
          </div>
        )}
      </div>

      {/* Audio Controls */}
      <UniversalAudioPlayer
        textToRead={fullAudioScript}
        title="Listen to Dialogue & Meaning"
      />
    </div>
  );
}

// ==========================================
// MAIN READING COMPONENT
// ==========================================
const TOPICS = [
  'Finance & Wealth',
  'Video Editing & AI Tools',
  'Sales & Deal Closing',
  'Hollywood Dialogues & Expressions'
];

const formatTranslation = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return Object.values(value).join(' ');
  return String(value);
};

function Reading({ onBack }) {
  const [selectedTopic, setSelectedTopic] = useState('Hollywood Dialogues & Expressions');
  const [chapterNumber, setChapterNumber] = useState(1);
  const [chapterData, setChapterData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showMarathi, setShowMarathi] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [loadingWord, setLoadingWord] = useState(false);

  const fetchChapter = async (topic, currentChapter) => {
    setLoading(true);
    setSelectedWord(null);
    setShowMarathi(false);
    try {
      const response = await fetch(`${API_BASE}/api/generate-passage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: 'default_user', 
          domain: topic, 
          chapter_number: currentChapter,
          random_seed: Math.random()
        })
      });

      if (!response.ok) throw new Error('API Request Failed');
      const data = await response.json();
      setChapterData(data);
    } catch (error) {
      console.error('Error fetching chapter data:', error);
      setChapterData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setChapterNumber(1);
    fetchChapter(selectedTopic, 1);
  }, [selectedTopic]);

  const handleNextChapter = () => {
    const nextNum = chapterNumber + 1;
    setChapterNumber(nextNum);
    fetchChapter(selectedTopic, nextNum);
  };

  const handleRefreshRandomDialogues = () => {
    const randomSet = chapterNumber + 1;
    setChapterNumber(randomSet);
    fetchChapter(selectedTopic, randomSet);
  };

  const handleWordClick = async (e, word) => {
    e.stopPropagation();
    const cleanWord = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (!cleanWord) return;

    setLoadingWord(true);
    setSelectedWord({ original: cleanWord, mr: 'Loading...', hi: 'Loading...' });

    try {
      const response = await fetch(`${API_BASE}/api/translate-word`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: cleanWord })
      });

      if (!response.ok) throw new Error('Translation failed');
      const data = await response.json();

      setSelectedWord({
        original: cleanWord,
        mr: formatTranslation(data.mr, 'अर्थ उपलब्ध नाही'),
        hi: formatTranslation(data.hi, 'अर्थ उपलब्ध नहीं')
      });
    } catch (error) {
      console.error('Translation error:', error);
      setSelectedWord({
        original: cleanWord,
        mr: 'भाषांतर त्रुटी (Error fetching translation)',
        hi: 'अनुवाद त्रुटि (Error fetching translation)'
      });
    } finally {
      setLoadingWord(false);
    }
  };

  const renderInteractiveText = (text) => {
    if (!text || typeof text !== 'string') return null;
    return text.split(' ').map((word, index) => (
      <span
        key={index}
        onClick={(e) => handleWordClick(e, word)}
        style={{
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: '4px',
          display: 'inline-block',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#FEEBC8';
          e.target.style.color = '#744210';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'transparent';
          e.target.style.color = 'inherit';
        }}
      >
        {word}{' '}
      </span>
    ));
  };

  // Safe multi-format array parser for backend response
  const parseDialoguesList = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.dialogues)) return data.dialogues;
    if (Array.isArray(data.data)) return data.data;
    if (data.page_content) {
      try {
        const parsed = typeof data.page_content === 'string' ? JSON.parse(data.page_content) : data.page_content;
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed.dialogues)) return parsed.dialogues;
      } catch (e) {
        return [];
      }
    }
    return [];
  };

  const dialoguesList = selectedTopic === 'Hollywood Dialogues & Expressions' 
    ? parseDialoguesList(chapterData)
    : [];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', fontFamily: "'Segoe UI', sans-serif" }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
        <button
          onClick={onBack}
          style={{ padding: '8px 16px', background: '#EDF2F7', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0, color: '#DD6B20' }}>🎓 AI Skill Builder Roadmap (Chapter-Based Learning)</h2>
      </div>

      {/* Domain Chips */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {TOPICS.map((topic) => (
          <button
            key={topic}
            onClick={() => setSelectedTopic(topic)}
            style={{
              padding: '10px 18px',
              borderRadius: '24px',
              border: selectedTopic === topic ? '2px solid #DD6B20' : '1px solid #CBD5E0',
              background: selectedTopic === topic ? '#FFFAF0' : '#FFFFFF',
              color: selectedTopic === topic ? '#DD6B20' : '#4A5568',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {topic}
          </button>
        ))}
      </div>

      {/* Content Container */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#718096' }}>
          ⏳ Fetching Content from API...
        </div>
      ) : selectedTopic === 'Hollywood Dialogues & Expressions' ? (
        
        <div style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          padding: '28px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 14px rgba(0,0,0,0.06)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #EDF2F7', paddingBottom: '14px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#2C5282', fontSize: '22px' }}>
                🎬 Hollywood Dialogues & Expressions (10 Random Expressions)
              </h3>
              <p style={{ margin: '4px 0 0 0', color: '#718096', fontSize: '13px' }}>
                Click any word to get instant Marathi and Hindi dictionary translations.
              </p>
            </div>
            <button
              onClick={handleRefreshRandomDialogues}
              style={{ padding: '10px 18px', background: '#DD6B20', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
            >
              🎲 Load 10 New Dialogues
            </button>
          </div>

          {dialoguesList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {dialoguesList.slice(0, 10).map((item, index) => (
                <DialogueCard key={index} dialogue={item} index={index} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '30px', textAlign: 'center', color: '#718096' }}>
              ⚠️ No dialogues received from API. Ensure your backend return object contains a key named <code>"dialogues"</code>.
            </div>
          )}
        </div>

      ) : chapterData ? (

        <div style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          padding: '28px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 14px rgba(0,0,0,0.06)'
        }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: '#2C5282', fontSize: '22px' }}>
              📚 {chapterData.chapter_title}
            </h3>
            <button
              onClick={handleNextChapter}
              style={{ padding: '8px 16px', background: '#EDF2F7', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
            >
              🔄 Next Chapter ({chapterNumber + 1})
            </button>
          </div>

          <div style={{ fontSize: '18px', lineHeight: '1.8', color: '#2D3748', marginBottom: '20px', whiteSpace: 'pre-line' }}>
            {renderInteractiveText(chapterData.page_content)}
          </div>

          {/* Audio Player for Full Chapter */}
          <UniversalAudioPlayer
            textToRead={chapterData.page_content}
            title="Listen to Full Chapter"
          />

          {chapterData.marathi_summary && (
            <div style={{ marginBottom: '24px', marginTop: '16px' }}>
              <button
                onClick={() => setShowMarathi(!showMarathi)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 16px',
                  background: '#F7FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  color: '#2B6CB0',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>🚩 Marathi Explanation (मराठी स्पष्टीकरण)</span>
                <span>{showMarathi ? '▲ Hide' : '▼ Expand'}</span>
              </button>

              {showMarathi && (
                <div style={{
                  padding: '16px',
                  background: '#EBF8FF',
                  borderRadius: '0 0 8px 8px',
                  borderLeft: '4px solid #3182CE',
                  marginTop: '4px',
                  color: '#2D3748',
                  fontSize: '16px',
                  lineHeight: '1.7'
                }}>
                  {chapterData.marathi_summary}
                </div>
              )}
            </div>
          )}

          <div style={{
            background: '#F7FAFC',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            marginTop: '20px'
          }}>
            {chapterData.key_takeaway && (
              <p style={{ margin: '0 0 8px 0', color: '#2C5282', fontSize: '15px' }}>
                🎯 <strong>Key Takeaway:</strong> {chapterData.key_takeaway}
              </p>
            )}
            {chapterData.action_item && (
              <p style={{ margin: 0, color: '#38A169', fontSize: '15px' }}>
                ⚡ <strong>Action Item:</strong> {chapterData.action_item}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* Instant Translation Modal */}
      {selectedWord && (
        <div style={{
          marginTop: '20px',
          background: '#FFFFF0',
          border: '2px solid #ECC94B',
          borderRadius: '12px',
          padding: '18px',
          boxShadow: '0 4px 12px rgba(236, 201, 75, 0.2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h4 style={{ margin: '0 0 8px 0', color: '#744210', textTransform: 'capitalize' }}>
                🔤 Word: <span style={{ color: '#DD6B20' }}>{selectedWord.original}</span>
              </h4>
              {loadingWord ? (
                <p style={{ color: '#718096', fontStyle: 'italic', margin: 0 }}>Translating...</p>
              ) : (
                <>
                  <p style={{ margin: '4px 0', color: '#2D3748' }}>🚩 <strong>मराठी अर्थ:</strong> {selectedWord.mr}</p>
                  <p style={{ margin: '4px 0', color: '#2D3748' }}>🚩 <strong>हिंदी अर्थ:</strong> {selectedWord.hi}</p>
                </>
              )}
            </div>
            <button
              onClick={() => setSelectedWord(null)}
              style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#744210' }}
            >
              ✖
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reading;
