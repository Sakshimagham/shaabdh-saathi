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

  // WhatsApp-style messages storage
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
  
  // Audio queue system
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef(null);
  const sentenceQueueRef = useRef([]);
  const isSentencePlayingRef = useRef(false);

  // 🔥 FIXED: Always include /api in the base URL
  const API_BASE_URL = import.meta.env?.VITE_API_URL 
    ? `${import.meta.env.VITE_API_URL}/api` 
    : 'http://localhost:8000/api';

  // Save messages to localStorage
  useEffect(() => {
    localStorage.setItem('shaabdh_talk_bot_messages', JSON.stringify(messages));
  }, [messages]);

  // Split mixed text into English and Marathi parts
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

  // Save Progression across sessions
  useEffect(() => {
    localStorage.setItem('shaabdh_english_level', level.toString());
    localStorage.setItem('shaabdh_english_percent', englishPercent.toString());
  }, [level, englishPercent]);

  // ----- Helper: Speak with browser TTS as fallback -----
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

  // Play next audio chunk in queue
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

  // Play next complete sentence
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
      // Use the updated API_BASE_URL which now ends with /api
      const audioUrl = `${API_BASE_URL}/tts?text=${encodeURIComponent(part.text)}&language=${lang}`;
      audioQueueRef.current.push({ url: audioUrl, text: part.text, lang: lang });
    });
    
    if (!isPlayingRef.current) {
      playNextInQueue();
    }
  }, [API_BASE_URL, splitTextByLanguage, playNextInQueue]);

  // Speak multiple sentences in sequence
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

  // Increment progression per exchange
  const incrementProgress = () => {
    setEnglishPercent((prev) => {
      const nextPercent = Math.min(prev + 5, 100);
      if (nextPercent % 10 === 0 && level < 10) {
        setLevel((l) => l + 1);
      }
      return nextPercent;
    });
  };

  // Dynamic API Initial Greeting
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

  // Initial Load Handler
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

  // ==========================================
  // SPEECH RECOGNITION - NO AUTO-SEND
  // ==========================================
  
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

  // ==========================================
  // Send Message Handler with Per-Message Metrics
  // ==========================================
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

  // ==========================================
  // End Session with Enhanced Metrics
  // ==========================================
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

  // ==========================================
  // RENDER (unchanged from earlier)
  // ==========================================
  return (
    <div style={{ maxWidth: '850px', margin: '0 auto', padding: '20px', fontFamily: "'Segoe UI', sans-serif" }}>
      {/* ... everything else is exactly as before ... */}
      {/* To keep the answer concise, I omit the full render which is identical */}
      {/* But you can copy the full version from the previous message or just replace the API_BASE_URL line */}
    </div>
  );
}

export default TalkingBot;
