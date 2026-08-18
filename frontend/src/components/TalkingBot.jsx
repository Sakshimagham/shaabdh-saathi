import React, { useState, useEffect, useRef, useCallback } from 'react';

function TalkingBot({ user, onBack }) {
  // 1. Persistent Experience & Progress State
  const [level, setLevel] = useState(() => {
    const savedLevel = localStorage.getItem('shaabdh_english_level');
    return savedLevel ? parseInt(savedLevel, 10) : user?.level || 1;
  });

  const [englishPercent, setEnglishPercent] = useState(() => {
    const savedPercent = localStorage.getItem('shaabdh_english_percent');
    return savedPercent ? parseInt(savedPercent, 10) : 10;
  });

  const [isRecording, setIsRecording] = useState(false);
  const [sessionDay, setSessionDay] = useState(1);
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const [pastSessions, setPastSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [dailyTopic, setDailyTopic] = useState(null);

  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem('shaabdh_talk_bot_messages');
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [input, setInput] = useState('');
  const [sttLang, setSttLang] = useState('mr-IN');

  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');

  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef(null);
  const sentenceQueueRef = useRef([]);
  const isSentencePlayingRef = useRef(false);

  // 🔥 FIXED: Always include /api
  const API_BASE_URL = import.meta.env?.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : 'http://localhost:8000/api';

  useEffect(() => {
    localStorage.setItem('shaabdh_talk_bot_messages', JSON.stringify(messages));
  }, [messages]);

  const splitTextByLanguage = useCallback((text) => {
    if (!text) return [];
    const parts = [];
    let currentPart = '';
    let currentLang = 'en';
    let i = 0;
    while (i < text.length) {
      const char = text[i];
      const isDevanagariChar = /[\u0900-\u097F]/.test(char);
      const isEnglishChar = /[a-zA-Z]/.test(char);
      let charLang = 'en';
      if (isDevanagariChar) {
        charLang = 'mr';
      } else if (isEnglishChar) {
        charLang = 'en';
      } else {
        charLang = currentLang;
      }
      if (charLang !== currentLang && currentPart.trim()) {
        parts.push({ text: currentPart.trim(), lang: currentLang });
        currentPart = '';
      }
      currentLang = charLang;
      currentPart += char;
      i++;
    }
    if (currentPart.trim()) {
      parts.push({ text: currentPart.trim(), lang: currentLang });
    }
    const mergedParts = [];
    for (const part of parts) {
      if (mergedParts.length > 0 && mergedParts[mergedParts.length - 1].lang === part.lang) {
        mergedParts[mergedParts.length - 1].text += ' ' + part.text;
      } else {
        mergedParts.push({ ...part });
      }
    }
    const finalParts = mergedParts.filter(p => p.text.trim().length > 0);
    if (finalParts.length === 0) {
      return [{ text: text, lang: 'en' }];
    }
    return finalParts;
  }, []);

  useEffect(() => {
    localStorage.setItem('shaabdh_english_level', level.toString());
    localStorage.setItem('shaabdh_english_percent', englishPercent.toString());
  }, [level, englishPercent]);

  const speakWithBrowserTTS = useCallback((text, lang) => {
    if (!text) return;
    console.log(`🗣️ Browser TTS fallback for: "${text}" (${lang})`);
    let voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      setTimeout(() => {
        voices = window.speechSynthesis.getVoices();
      }, 200);
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'mr' ? 'mr-IN' : 'en-US';
    utterance.rate = 0.9;
    const voice = voices.find(v => v.lang.startsWith(lang === 'mr' ? 'mr' : 'en'));
    if (voice) {
      utterance.voice = voice;
      console.log(`✅ Using voice: ${voice.name} (${voice.lang})`);
    } else {
      console.warn(`⚠️ No voice found for ${lang}, using default.`);
    }
    window.speechSynthesis.speak(utterance);
  }, []);

  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      setTimeout(() => {
        playNextSentence();
      }, 500);
      return;
    }
    const item = audioQueueRef.current.shift();
    isPlayingRef.current = true;
    console.log(`🔊 Playing chunk: "${item.text}" (${item.lang}) from ${item.url}`);
    const audio = new Audio(item.url);
    currentAudioRef.current = audio;
    audio.onended = () => {
      console.log(`✅ Chunk finished: "${item.text}"`);
      setTimeout(() => {
        playNextInQueue();
      }, 500);
    };
    audio.onerror = (e) => {
      console.warn(`⚠️ Backend TTS failed for "${item.text}" (${item.lang})`, e);
      speakWithBrowserTTS(item.text, item.lang);
      setTimeout(() => {
        playNextInQueue();
      }, 500);
    };
    audio.play().catch((err) => {
      console.warn(`⚠️ Audio play error for "${item.text}"`, err);
      speakWithBrowserTTS(item.text, item.lang);
      setTimeout(() => {
        playNextInQueue();
      }, 500);
    });
  }, [speakWithBrowserTTS]);

  const playNextSentence = useCallback(() => {
    if (sentenceQueueRef.current.length === 0) {
      isSentencePlayingRef.current = false;
      return;
    }
    isSentencePlayingRef.current = true;
    const sentence = sentenceQueueRef.current.shift();
    const cleanSentence = sentence.replace(/[🙏💡📊➔←🎙️⏹️▶️⚠️*]/g, '').trim();
    if (!cleanSentence) {
      setTimeout(() => {
        playNextSentence();
      }, 300);
      return;
    }
    const parts = splitTextByLanguage(cleanSentence);
    if (parts.length === 0) {
      setTimeout(() => {
        playNextSentence();
      }, 300);
      return;
    }
    parts.forEach((part) => {
      if (!part.text.trim()) return;
      const lang = part.lang === 'mr' ? 'mr' : 'en';
      const audioUrl = `${API_BASE_URL}/tts?text=${encodeURIComponent(part.text)}&language=${lang}`;
      audioQueueRef.current.push({ url: audioUrl, text: part.text, lang: lang });
    });
    if (!isPlayingRef.current) {
      playNextInQueue();
    }
  }, [API_BASE_URL, splitTextByLanguage, playNextInQueue]);

  const speakSentences = useCallback((sentences) => {
    if (!sentences || sentences.length === 0) return;
    audioQueueRef.current = [];
    sentenceQueueRef.current = [];
    isPlayingRef.current = false;
    isSentencePlayingRef.current = false;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    const validSentences = sentences.filter(s => s && s.trim());
    if (validSentences.length === 0) return;
    sentenceQueueRef.current = validSentences;
    setTimeout(() => {
      playNextSentence();
    }, 300);
  }, [playNextSentence]);

  const incrementProgress = () => {
    setEnglishPercent((prev) => {
      const nextPercent = Math.min(prev + 5, 100);
      if (nextPercent % 10 === 0 && level < 10) {
        setLevel((l) => l + 1);
      }
      return nextPercent;
    });
  };

  const fetchDynamicGreeting = useCallback(async (currentDay) => {
    setLoading(true);
    setDailyTopic(null);
    audioQueueRef.current = [];
    sentenceQueueRef.current = [];
    isPlayingRef.current = false;
    isSentencePlayingRef.current = false;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/groq-talk-bot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          conversation: [],
          level: level,
          english_percent: englishPercent,
          is_initial_greeting: true,
          day: currentDay,
        }),
      });
      if (!response.ok) throw new Error(`API Returned ${response.status}`);
      const data = await response.json();
      console.log('📨 Greeting API Response:', data);
      const greetingText = data.reply || `Hello! Day ${currentDay} session is live. How are you feeling today?`;
      if (data.daily_topic) {
        setDailyTopic({
          topic: data.daily_topic,
          question: data.question,
          question_mr: data.question_mr,
          marathi_intro: data.marathi_intro,
          fun_fact: data.fun_fact,
          follow_up: data.follow_up
        });
      }
      const initialMsg = {
        id: Date.now(),
        sender: 'bot',
        text: greetingText,
        feedback_mr: data.feedback_mr || '',
        soft_skill_tip: data.soft_skill_tip || '',
        isVoice: true,
        timestamp: new Date().toISOString(),
      };
      setMessages([initialMsg]);
      const sentencesToSpeak = [];
      sentencesToSpeak.push(greetingText);
      if (data.feedback_mr) {
        sentencesToSpeak.push(data.feedback_mr);
      }
      speakSentences(sentencesToSpeak);
    } catch (err) {
      console.error('Greeting API Error:', err);
      const fallbackGreeting = `Hello! Day ${currentDay} session is live. How are you feeling today?`;
      setMessages([{
        id: Date.now(),
        sender: 'bot',
        text: fallbackGreeting,
        isVoice: true,
        timestamp: new Date().toISOString()
      }]);
      speakSentences([fallbackGreeting]);
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL, level, englishPercent, speakSentences]);

  useEffect(() => {
    const savedSessions = JSON.parse(localStorage.getItem('talk_bot_sessions') || '[]');
    setPastSessions(savedSessions);
    const currentDay = savedSessions.length + 1;
    setSessionDay(currentDay);
    const savedMessages = localStorage.getItem('shaabdh_talk_bot_messages');
    if (savedMessages) {
      const parsedMessages = JSON.parse(savedMessages);
      if (parsedMessages.length > 0) {
        setMessages(parsedMessages);
        setLoading(false);
        return;
      }
    }
    fetchDynamicGreeting(currentDay);
  }, [fetchDynamicGreeting]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const startSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = sttLang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      recognition.onstart = () => {
        setIsRecording(true);
        isRecordingRef.current = true;
        console.log('🎤 Recording started...');
        setInput('🎤 Recording... Click mic to stop, then Send');
      };
      recognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }
        if (final) {
          finalTranscriptRef.current += ' ' + final;
        }
        interimTranscriptRef.current = interim;
        const displayText = finalTranscriptRef.current + interim;
        if (displayText.trim()) {
          setInput(displayText.trim());
        }
      };
      recognition.onerror = (event) => {
        console.error('🎤 Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          alert('Please allow microphone access to use voice input.');
        } else if (event.error === 'no-speech') {
          setInput('No speech detected. Please try again.');
          setTimeout(() => {
            if (isRecordingRef.current) {
              setInput('🎤 Recording... Click mic to stop, then Send');
            }
          }, 2000);
        }
      };
      recognition.onend = () => {
        console.log('🎤 Recording ended');
        setIsRecording(false);
        isRecordingRef.current = false;
        if (finalTranscriptRef.current.trim()) {
          setInput(finalTranscriptRef.current.trim());
        } else if (interimTranscriptRef.current.trim()) {
          setInput(interimTranscriptRef.current.trim());
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Microphone error:', err);
      setIsRecording(false);
      isRecordingRef.current = false;
      alert('Could not access microphone. Please check permissions and try again.');
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.error('Error stopping recognition:', err);
      }
    }
    setIsRecording(false);
    isRecordingRef.current = false;
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopSpeechRecognition();
    } else {
      startSpeechRecognition();
    }
  };

  const handleSend = async (textToSend) => {
    const finalMsg = textToSend || input;
    const cleanMsg = finalMsg.trim();
    if (!cleanMsg ||
      cleanMsg === '🎤 Recording... Click mic to stop, then Send' ||
      cleanMsg === '🎤 Listening... Speak now!' ||
      cleanMsg === 'No speech detected. Please try again.' ||
      cleanMsg === '🎤 Recording...') {
      setInput('');
      return;
    }
    if (isSessionEnded) {
      alert('Session has ended. Please start a new session.');
      return;
    }
    if (isRecording) {
      stopSpeechRecognition();
    }
    const messageToSend = cleanMsg;
    setInput('');
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    const newUserMsg = {
      id: Date.now(),
      sender: 'user',
      text: messageToSend,
      isVoice: false,
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setLoading(true);
    try {
      console.log('📤 Sending message to API:', messageToSend);
      const response = await fetch(`${API_BASE_URL}/groq-talk-bot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          conversation: updatedMessages,
          level: level,
          english_percent: englishPercent,
          is_initial_greeting: false,
          day: sessionDay,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }
      const data = await response.json();
      console.log('📨 Bot Response:', data);
      const botReplyText = data.reply || "Great job! Let's keep going.";
      if (data.daily_topic) {
        setDailyTopic({
          topic: data.daily_topic,
          question: data.question,
          question_mr: data.question_mr,
          marathi_intro: data.marathi_intro,
          fun_fact: data.fun_fact,
          follow_up: data.follow_up
        });
      }
      const messageMetrics = data.message_metrics || null;
      setMessages((prev) => {
        const updated = [...prev];
        const lastUserIndex = updated.length - 2;
        if (lastUserIndex >= 0 && updated[lastUserIndex].sender === 'user') {
          updated[lastUserIndex] = {
            ...updated[lastUserIndex],
            messageMetrics: messageMetrics
          };
        }
        return updated;
      });
      const botReplyMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: botReplyText,
        feedback_mr: data.feedback_mr || '',
        soft_skill_tip: data.soft_skill_tip || '',
        isVoice: true,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, botReplyMsg]);
      const sentencesToSpeak = [];
      sentencesToSpeak.push(botReplyText);
      if (data.feedback_mr) {
        sentencesToSpeak.push(data.feedback_mr);
      }
      speakSentences(sentencesToSpeak);
      incrementProgress();
    } catch (err) {
      console.error('❌ API Error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: `⚠️ Could not connect to server (${err.message}). Please ensure FastAPI backend is running.`,
          isVoice: false,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (messages.length <= 1) {
      alert('Please have at least one conversation before ending the session.');
      return;
    }
    setLoading(true);
    try {
      console.log('📊 Fetching session metrics...');
      const response = await fetch(`${API_BASE_URL}/groq-session-metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: messages,
          day: sessionDay,
          level: level
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch metrics: ${errorText}`);
      }
      const data = await response.json();
      console.log('📊 Session Metrics Data:', data);
      setMetrics(data);
      setIsSessionEnded(true);
      const sessionRecord = {
        day: sessionDay,
        date: new Date().toLocaleDateString(),
        metrics: data,
        messages: messages,
        messageCount: messages.length
      };
      const updatedSessions = [...pastSessions, sessionRecord];
      localStorage.setItem('talk_bot_sessions', JSON.stringify(updatedSessions));
      setPastSessions(updatedSessions);
    } catch (err) {
      console.error('❌ Metrics API Error:', err);
      alert('Could not generate metrics from API. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartNewSession = () => {
    setIsSessionEnded(false);
    setMetrics(null);
    setMessages([]);
    setDailyTopic(null);
    localStorage.removeItem('shaabdh_talk_bot_messages');
    const nextDay = pastSessions.length + 1;
    setSessionDay(nextDay);
    fetchDynamicGreeting(nextDay);
  };

  const handleClearChat = () => {
    if (window.confirm('Clear all chat messages?')) {
      setMessages([]);
      setDailyTopic(null);
      localStorage.removeItem('shaabdh_talk_bot_messages');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault();
      handleSend(input);
    }
  };

  // --- RENDER ---
  return (
    <div style={{ maxWidth: '850px', margin: '0 auto', padding: '20px', fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={onBack} style={{ padding: '6px 14px', background: '#EDF2F7', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              ← Back
            </button>
            <h2 style={{ margin: 0, color: '#805AD5', fontSize: '20px' }}>🗣️ Shaabdh Saathi - English Coach</h2>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ background: '#FAF5FF', color: '#6B46C1', border: '1px solid #D6BCFA', padding: '4px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '13px' }}>
              Day {sessionDay}
            </span>
            {!isSessionEnded && messages.length > 0 && (
              <button onClick={handleClearChat} style={{ padding: '4px 10px', background: 'transparent', color: '#718096', border: '1px solid #CBD5E0', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>
                🗑️ Clear
              </button>
            )}
            {!isSessionEnded && (
              <button onClick={handleEndSession} disabled={messages.length <= 1 || loading} style={{ padding: '6px 12px', background: '#E53E3E', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', opacity: messages.length <= 1 ? 0.5 : 1 }}>
                End Session 📊
              </button>
            )}
          </div>
        </div>

        {dailyTopic && messages.length > 0 && (
          <div style={{ background: '#EBF8FF', border: '1px solid #90CDF4', borderRadius: '8px', padding: '8px 14px', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#2B6CB0' }}>📚 Today's Topic:</span>
              <span style={{ fontSize: '13px', color: '#2C5282', fontWeight: '600' }}>{dailyTopic.topic}</span>
              {dailyTopic.fun_fact && (
                <span style={{ fontSize: '11px', color: '#4A5568', background: '#EDF2F7', padding: '2px 10px', borderRadius: '12px' }}>
                  💡 {dailyTopic.fun_fact}
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F7FAFC', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#6B46C1' }}>🇬🇧 {englishPercent}% English Blend</span>
          <div style={{ flex: 1, background: '#E2E8F0', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${englishPercent}%`, background: '#805AD5', height: '100%', transition: 'width 0.4s ease' }} />
          </div>
          <span style={{ fontSize: '11px', color: '#718096' }}>{100 - englishPercent}% मराठी</span>
        </div>
      </div>

      {isSessionEnded && metrics ? (
        <div style={{ background: '#FAF5FF', border: '2px solid #9F7AEA', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
          <h3 style={{ color: '#44337A', margin: '0 0 4px 0' }}>🎉 Day {sessionDay} Report</h3>
          <p style={{ color: '#6B46C1', fontSize: '13px', fontWeight: '600', marginBottom: '16px' }}>
            🇬🇧 {metrics.englishPercentage || englishPercent}% English Blend • {metrics.totalMessages || messages.length} messages • {metrics.totalWords || 0} words
          </p>
          {metrics.feedback_mr && (
            <p style={{ background: '#FFFFFF', border: '1px solid #E9D8FD', padding: '12px', borderRadius: '8px', fontStyle: 'italic', color: '#553C9A', marginBottom: '16px', textAlign: 'left', fontSize: '14px' }}>
              💬 "{metrics.feedback_mr}"
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '16px' }}>
            <div style={{ background: 'white', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '10px', color: '#718096' }}>FLUENCY</div>
              <div style={{ fontSize: '20px', color: '#6B46C1', fontWeight: 'bold' }}>{metrics.fluencyScore || 0}%</div>
            </div>
            <div style={{ background: 'white', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '10px', color: '#718096' }}>CONFIDENCE</div>
              <div style={{ fontSize: '20px', color: '#38A169', fontWeight: 'bold' }}>{metrics.confidenceScore || 0}%</div>
            </div>
            <div style={{ background: 'white', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '10px', color: '#718096' }}>VOCABULARY</div>
              <div style={{ fontSize: '20px', color: '#3182CE', fontWeight: 'bold' }}>{metrics.vocabularyScore || 0}%</div>
            </div>
            <div style={{ background: 'white', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '10px', color: '#718096' }}>GRAMMAR</div>
              <div style={{ fontSize: '20px', color: '#DD6B20', fontWeight: 'bold' }}>{metrics.grammarScore || 0}%</div>
            </div>
            <div style={{ background: 'white', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '10px', color: '#718096' }}>PRONUNCIATION</div>
              <div style={{ fontSize: '20px', color: '#E53E3E', fontWeight: 'bold' }}>{metrics.pronunciationScore || 0}%</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px', padding: '12px', background: '#F7FAFC', borderRadius: '8px' }}>
            <div>
              <div style={{ fontSize: '10px', color: '#718096' }}>Total Words</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2D3748' }}>{metrics.totalWords || 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#718096' }}>Avg Words/Message</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2D3748' }}>{metrics.averageWordsPerMessage || 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#718096' }}>Questions Asked</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2D3748' }}>{metrics.questionsAsked || 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#718096' }}>Messages</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2D3748' }}>{metrics.totalMessages || 0}</div>
            </div>
          </div>
          {metrics.englishPercentage !== undefined && (
            <div style={{ background: '#FFFFFF', padding: '10px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#4A5568' }}>🇬🇧 English: {metrics.englishPercentage || englishPercent}%</span>
                <span style={{ fontSize: '13px', color: '#4A5568' }}>🇮🇳 Marathi: {100 - (metrics.englishPercentage || englishPercent)}%</span>
              </div>
              <div style={{ background: '#E2E8F0', height: '6px', borderRadius: '4px', overflow: 'hidden', marginTop: '4px' }}>
                <div style={{ width: `${metrics.englishPercentage || englishPercent}%`, background: '#805AD5', height: '100%', transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )}
          <button onClick={handleStartNewSession} style={{ padding: '10px 20px', background: '#6B46C1', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
            Start Next Day ➔
          </button>
        </div>
      ) : (
        <div>
          <div style={{ background: '#EFEAE2', borderRadius: '12px', padding: '16px', height: '420px', overflowY: 'auto', border: '1px solid #CBD5E0', marginBottom: '12px', display: 'flex', flexDirection: 'column' }}>
            {messages.length === 0 && !loading && (
              <div style={{ textAlign: 'center', color: '#718096', padding: '40px 0', fontStyle: 'italic' }}>💬 No messages yet. Start the conversation!</div>
            )}
            {messages.map((msg, index) => (
              <div key={msg.id || index} style={{ textAlign: msg.sender === 'user' ? 'right' : 'left', marginBottom: '12px', animation: 'fadeIn 0.3s ease-in' }}>
                <div style={{ display: 'inline-block', maxWidth: msg.sender === 'user' ? '85%' : '80%', padding: '10px 14px', borderRadius: '12px', background: msg.sender === 'user' ? '#D9FDD3' : '#FFFFFF', color: '#111B21', textAlign: 'left', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', wordWrap: 'break-word' }}>
                  {msg.isVoice && msg.sender === 'bot' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <button onClick={() => {
                        audioQueueRef.current = [];
                        sentenceQueueRef.current = [];
                        isPlayingRef.current = false;
                        isSentencePlayingRef.current = false;
                        if (currentAudioRef.current) {
                          currentAudioRef.current.pause();
                          currentAudioRef.current = null;
                        }
                        const sentencesToSpeak = [];
                        sentencesToSpeak.push(msg.text);
                        if (msg.feedback_mr) {
                          sentencesToSpeak.push(msg.feedback_mr);
                        }
                        speakSentences(sentencesToSpeak);
                      }} style={{ background: '#805AD5', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', fontSize: '10px' }} title="Replay Audio">▶️</button>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#805AD5' }}>Coach</span>
                    </div>
                  )}
                  {msg.sender === 'user' && (
                    <div style={{ fontSize: '11px', color: '#6B46C1', marginBottom: '3px', fontWeight: '500' }}>You</div>
                  )}
                  <div style={{ fontSize: '14px', lineHeight: '1.5' }}>{msg.text}</div>
                  {msg.sender === 'user' && msg.messageMetrics && (
                    <div style={{ marginTop: '8px', padding: '8px 10px', background: '#F7FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}>
                      <div style={{ fontWeight: 'bold', color: '#4A5568', fontSize: '10px', marginBottom: '4px' }}>📊 Message Analysis</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                        <div><span style={{ color: '#718096' }}>Fluency</span><span style={{ fontWeight: 'bold', color: '#6B46C1', marginLeft: '4px' }}>{msg.messageMetrics.fluency || 0}%</span></div>
                        <div><span style={{ color: '#718096' }}>Grammar</span><span style={{ fontWeight: 'bold', color: '#DD6B20', marginLeft: '4px' }}>{msg.messageMetrics.grammar || 0}%</span></div>
                        <div><span style={{ color: '#718096' }}>Vocab</span><span style={{ fontWeight: 'bold', color: '#3182CE', marginLeft: '4px' }}>{msg.messageMetrics.vocabulary || 0}%</span></div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginTop: '2px' }}>
                        <div><span style={{ color: '#718096' }}>Pronounce</span><span style={{ fontWeight: 'bold', color: '#E53E3E', marginLeft: '4px' }}>{msg.messageMetrics.pronunciation || 0}%</span></div>
                        <div><span style={{ color: '#718096' }}>Confidence</span><span style={{ fontWeight: 'bold', color: '#38A169', marginLeft: '4px' }}>{msg.messageMetrics.confidence || 0}%</span></div>
                        <div><span style={{ color: '#718096' }}>Words</span><span style={{ fontWeight: 'bold', color: '#2D3748', marginLeft: '4px' }}>{msg.messageMetrics.word_count || 0}</span></div>
                      </div>
                      {msg.messageMetrics.grammar_errors > 0 && (
                        <div style={{ marginTop: '4px', color: '#C53030', fontSize: '10px' }}>⚠️ {msg.messageMetrics.grammar_errors} grammar {msg.messageMetrics.grammar_errors === 1 ? 'error' : 'errors'} found</div>
                      )}
                      {msg.messageMetrics.vocabulary_suggestions && msg.messageMetrics.vocabulary_suggestions.length > 0 && (
                        <div style={{ marginTop: '2px', color: '#2B6CB0', fontSize: '10px' }}>💡 Try: {msg.messageMetrics.vocabulary_suggestions.join(', ')}</div>
                      )}
                      {msg.messageMetrics.pronunciation_hints && msg.messageMetrics.pronunciation_hints.length > 0 && (
                        <div style={{ marginTop: '2px', color: '#805AD5', fontSize: '10px' }}>🔊 {msg.messageMetrics.pronunciation_hints[0]}</div>
                      )}
                      {msg.messageMetrics.english_percentage !== undefined && (
                        <div style={{ marginTop: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#4A5568' }}>
                            <span>🇬🇧 {msg.messageMetrics.english_percentage}%</span>
                            <span>🇮🇳 {100 - msg.messageMetrics.english_percentage}%</span>
                          </div>
                          <div style={{ background: '#E2E8F0', height: '3px', borderRadius: '2px', overflow: 'hidden', marginTop: '2px' }}>
                            <div style={{ width: `${msg.messageMetrics.english_percentage}%`, background: '#805AD5', height: '100%', transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      )}
                      {msg.messageMetrics.feedback_short && (
                        <div style={{ marginTop: '4px', color: '#276749', fontSize: '10px', fontStyle: 'italic' }}>{msg.messageMetrics.feedback_short}</div>
                      )}
                    </div>
                  )}
                  {msg.feedback_mr && msg.sender === 'bot' && (
                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #EDF2F7', fontSize: '12px', color: '#276749', fontWeight: '600' }}>💡 {msg.feedback_mr}</div>
                  )}
                  {msg.soft_skill_tip && msg.sender === 'bot' && (
                    <div style={{ marginTop: '6px', padding: '6px 8px', background: '#FEFCBF', borderRadius: '6px', fontSize: '11px', color: '#744210' }}>{msg.soft_skill_tip}</div>
                  )}
                  <div style={{ fontSize: '10px', color: '#A0AEC0', marginTop: '4px', textAlign: 'right' }}>
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ textAlign: 'left', marginBottom: '12px' }}>
                <div style={{ display: 'inline-block', maxWidth: '80%', padding: '10px 14px', borderRadius: '12px', background: '#FFFFFF', color: '#111B21', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#805AD5', borderRadius: '50%', animation: 'bounce 1.4s infinite 0s' }} />
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#805AD5', borderRadius: '50%', animation: 'bounce 1.4s infinite 0.2s' }} />
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#805AD5', borderRadius: '50%', animation: 'bounce 1.4s infinite 0.4s' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={{ background: '#F0F2F5', padding: '10px 14px', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #D1D7DB' }}>
            <select
              value={sttLang}
              onChange={(e) => setSttLang(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: '12px', border: '1px solid #CBD5E0', background: '#FFFFFF', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', outline: 'none' }}
            >
              <option value="mr-IN">🇮🇳 मराठी</option>
              <option value="en-IN">🇬🇧 English</option>
              <option value="hi-IN">🇮🇳 हिंदी</option>
            </select>

            <button
              onClick={toggleRecording}
              disabled={loading}
              style={{
                background: isRecording ? '#EA0038' : '#00A884',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '20px',
                flexShrink: 0,
                animation: isRecording ? 'pulse 1s infinite' : 'none',
                opacity: loading ? 0.6 : 1,
                transition: 'all 0.3s ease'
              }}
              title={isRecording ? "Stop recording" : "Click to record voice"}
            >
              {isRecording ? '⏹️' : '🎙️'}
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? `🔴 Recording... Click mic to stop, then Send` : "Type a message or use mic..."}
              style={{ flex: 1, padding: '10px 14px', borderRadius: '20px', border: 'none', outline: 'none', fontSize: '15px', background: '#FFFFFF' }}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />

            <button
              onClick={() => handleSend(input)}
              disabled={loading || !input.trim() || isRecording}
              style={{
                background: '#00A884',
                color: 'white',
                border: 'none',
                borderRadius: '20px',
                padding: '10px 18px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '14px',
                opacity: (loading || !input.trim() || isRecording) ? 0.6 : 1
              }}
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>

          {isRecording && (
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px', color: '#EA0038', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#EA0038', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
              🔴 Recording... Speak clearly. Click mic to stop, then Send.
            </div>
          )}
        </div>
      )}

      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.9); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-10px); }
          }
        `}
      </style>
    </div>
  );
}

export default TalkingBot;
