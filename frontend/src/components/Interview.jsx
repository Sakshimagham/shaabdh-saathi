import React, { useState, useEffect, useRef } from 'react';

function Interview({ user, onBack }) {
  const [level, setLevel] = useState(user?.level || 1);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('resume');
  
  // ==========================================
  // STATE FOR ALL SECTIONS
  // ==========================================
  
  // Resume State
  const [resumeText, setResumeText] = useState('');
  const [resumeAnalysis, setResumeAnalysis] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const [isResumeUploading, setIsResumeUploading] = useState(false);
  const [resumeUploadError, setResumeUploadError] = useState(null);
  
  // JD State
  const [jdText, setJdText] = useState('');
  const [showSampleJD, setShowSampleJD] = useState(false);
  const [jdAnalysisLoading, setJdAnalysisLoading] = useState(false);
  
  // Interview Questions State
  const [interviewQuestions, setInterviewQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  
  // Practice State
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [practiceHistory, setPracticeHistory] = useState([]);
  const [isPracticing, setIsPracticing] = useState(false);
  const [currentPracticeQuestion, setCurrentPracticeQuestion] = useState(null);
  const [practiceScore, setPracticeScore] = useState(0);
  const [totalQuestionsAnswered, setTotalQuestionsAnswered] = useState(0);
  const [isPracticeComplete, setIsPracticeComplete] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [practiceError, setPracticeError] = useState(null);
  
  // ==========================================
  // VOICE RECORDING – Web Speech API
  // ==========================================
  const [isRecordingAnswer, setIsRecordingAnswer] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceError, setVoiceError] = useState(null);
  
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const isRecordingRef = useRef(false);
  
  const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8000/api';

  // Sample Job Descriptions
  const sampleJDs = [
    {
      title: "Software Engineer",
      description: "We are looking for a Software Engineer with 3-5 years of experience in full-stack development. Skills required: React, Node.js, Python, AWS. The ideal candidate should have strong problem-solving skills and experience with agile methodologies."
    },
    {
      title: "Data Scientist",
      description: "Join our data science team to build machine learning models. Requirements: Python, TensorFlow, SQL, 2+ years experience in ML/AI. Strong analytical skills and experience with big data technologies preferred."
    },
    {
      title: "Product Manager",
      description: "Seeking a Product Manager to lead our product development. Requirements: 4+ years in product management, experience with agile methodologies, strong communication skills, and a track record of successful product launches."
    }
  ];

  // Load existing interview data on mount and from localStorage
  useEffect(() => {
    const savedData = localStorage.getItem(`interview_data_${user?.id || 'guest'}`);
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        if (data.resumeText) setResumeText(data.resumeText);
        if (data.resumeAnalysis) setResumeAnalysis(data.resumeAnalysis);
        if (data.resumeFileName) setResumeFileName(data.resumeFileName);
        if (data.jdText) setJdText(data.jdText);
        if (data.interviewQuestions) setInterviewQuestions(data.interviewQuestions);
        if (data.practiceHistory) setPracticeHistory(data.practiceHistory);
        if (data.practiceScore) setPracticeScore(data.practiceScore);
        if (data.totalQuestionsAnswered) setTotalQuestionsAnswered(data.totalQuestionsAnswered);
        if (data.conversation) setConversation(data.conversation);
        if (data.currentQuestionIndex) setCurrentQuestionIndex(data.currentQuestionIndex);
      } catch (e) {
        console.error('Error loading saved data:', e);
      }
    }
    
    if (user?.id) {
      fetchInterviewData();
    }
  }, [user]);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    const dataToSave = {
      resumeText,
      resumeAnalysis,
      resumeFileName,
      jdText,
      interviewQuestions,
      practiceHistory,
      practiceScore,
      totalQuestionsAnswered,
      conversation,
      currentQuestionIndex
    };
    try {
      localStorage.setItem(`interview_data_${user?.id || 'guest'}`, JSON.stringify(dataToSave));
    } catch (e) {
      console.error('Error saving data:', e);
    }
  }, [resumeText, resumeAnalysis, resumeFileName, jdText, interviewQuestions, practiceHistory, practiceScore, totalQuestionsAnswered, conversation, currentQuestionIndex, user]);

  const fetchInterviewData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/interview/session/${user.id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.has_data) {
          if (data.resume_analysis) setResumeAnalysis(data.resume_analysis);
          if (data.generated_questions) setInterviewQuestions(data.generated_questions);
          if (data.resume_text) setResumeText(data.resume_text);
          if (data.job_description) setJdText(data.job_description);
        }
      }
    } catch (err) {
      console.error('Error fetching interview data:', err);
    }
  };

  // ==========================================
  // CLEAR ALL DATA (Reset Everything)
  // ==========================================
  const handleClearAll = () => {
    if (window.confirm('⚠️ This will erase all your uploaded data, JD, questions, and practice history. Are you sure?')) {
      // Reset all state to initial values
      setResumeText('');
      setResumeAnalysis(null);
      setResumeFileName('');
      setJdText('');
      setInterviewQuestions([]);
      setPracticeHistory([]);
      setPracticeScore(0);
      setTotalQuestionsAnswered(0);
      setConversation([]);
      setCurrentQuestionIndex(0);
      setIsPracticing(false);
      setIsPracticeComplete(false);
      setFeedback(null);
      setSessionFeedback(null);
      setUserAnswer('');
      setVoiceTranscript('');
      setPracticeError(null);
      setVoiceError(null);
      setActiveTab('resume');
      // Stop recording if active
      if (isRecordingAnswer) stopVoiceRecording();
      // Clear localStorage
      localStorage.removeItem(`interview_data_${user?.id || 'guest'}`);
    }
  };

  // ==========================================
  // 1. RESUME ANALYSIS
  // ==========================================
  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const validTypes = [
      'text/plain', 
      'application/pdf', 
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!validTypes.includes(file.type)) {
      alert('Please upload a valid PDF, DOC, DOCX, or TXT file.');
      return;
    }
    
    setResumeFile(file);
    setResumeFileName(file.name);
    setIsResumeUploading(true);
    setLoading(true);
    setResumeUploadError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('job_description', jdText || '');
      if (user?.id) formData.append('user_id', user.id);

      const response = await fetch(`${API_BASE_URL}/interview/analyze-resume`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        setResumeAnalysis(data);
        if (data.extracted_text) {
          setResumeText(data.extracted_text);
        }
        alert('✅ Resume analyzed successfully!');
      } else {
        const errorText = await response.text();
        console.error('Resume analysis error:', errorText);
        setResumeUploadError('Failed to analyze resume. Please ensure it is a valid PDF or text document.');
        alert('Failed to analyze resume. Please ensure it is a valid PDF or text document.');
      }
    } catch (err) {
      console.error('Resume analysis error:', err);
      setResumeUploadError('Error uploading resume file. Please try again.');
      alert('Error uploading resume file. Please try again.');
    } finally {
      setLoading(false);
      setIsResumeUploading(false);
    }
  };

  // ==========================================
  // 2. JD ANALYSIS (JSON endpoint)
  // ==========================================
  const handleJDAnalysis = async () => {
    if (!jdText.trim()) {
      alert('Please paste the Job Description first.');
      return;
    }
    
    setJdAnalysisLoading(true);
    setPracticeError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/interview/analyze-jd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          resume_text: resumeText || 'Resume not provided',
          job_description: jdText,
          user_id: user?.id 
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setResumeAnalysis(data);
        alert('✅ Job Description analyzed successfully!');
      } else {
        const errorText = await response.text();
        console.error('JD analysis error:', errorText);
        alert('Failed to analyze Job Description. Please try again.');
      }
    } catch (err) {
      console.error('JD analysis error:', err);
      alert('Error analyzing Job Description. Please try again.');
    } finally {
      setJdAnalysisLoading(false);
    }
  };

  // ==========================================
  // 3. GENERATE INTERVIEW QUESTIONS
  // ==========================================
  const generateInterviewQuestions = async () => {
    if (!resumeText && !jdText) {
      alert('Please upload resume and JD first to generate relevant questions.');
      return;
    }
    
    setQuestionsLoading(true);
    setPracticeError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/interview/generate-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_text: resumeText,
          job_description: jdText,
          level: level,
          question_count: 12,
          user_id: user?.id
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.questions && data.questions.length > 0) {
          setInterviewQuestions(data.questions);
          setCurrentQuestionIndex(0);
          setIsPracticing(false);
          setIsPracticeComplete(false);
          setPracticeHistory([]);
          setConversation([]);
          setActiveTab('questions');
        } else {
          alert('No questions generated. Please try again.');
        }
      } else {
        const errorText = await response.text();
        console.error('Generate questions error:', errorText);
        alert('Failed to generate questions. Please try again.');
      }
    } catch (err) {
      console.error('Error generating questions:', err);
      alert('Error generating questions. Please try again.');
    } finally {
      setQuestionsLoading(false);
    }
  };

  // ==========================================
  // 4. VOICE RECORDING – Web Speech API (no auto-submit)
  // ==========================================
  const startVoiceRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    setVoiceError(null);
    setVoiceTranscript('');
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsRecordingAnswer(true);
        isRecordingRef.current = true;
        console.log('🎤 Recording started...');
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

        const displayText = (finalTranscriptRef.current + interim).trim();
        if (displayText) {
          setVoiceTranscript(displayText);
          setUserAnswer(displayText);
        }
      };

      recognition.onerror = (event) => {
        console.error('🎤 Speech recognition error:', event.error);
        let msg = 'Voice recognition error. Please try again.';
        if (event.error === 'not-allowed') {
          msg = 'Please allow microphone access.';
        } else if (event.error === 'no-speech') {
          msg = 'No speech detected. Please try again.';
        }
        setVoiceError(msg);
        setIsRecordingAnswer(false);
        isRecordingRef.current = false;
      };

      recognition.onend = () => {
        console.log('🎤 Recording ended');
        setIsRecordingAnswer(false);
        isRecordingRef.current = false;
        
        // Get the final transcript
        let finalText = finalTranscriptRef.current.trim();
        if (!finalText) {
          finalText = interimTranscriptRef.current.trim();
        }
        
        if (finalText) {
          setUserAnswer(finalText);
          setVoiceTranscript(finalText);
          // ✅ NO AUTO-SUBMIT – just fill the textarea
        } else {
          setVoiceError('No speech detected. Please type your answer.');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Microphone error:', err);
      setIsRecordingAnswer(false);
      isRecordingRef.current = false;
      setVoiceError('Could not access microphone. Please check permissions.');
      alert('Could not access microphone. Please check permissions and try again.');
    }
  };

  const stopVoiceRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.error('Error stopping recognition:', err);
      }
    }
    setIsRecordingAnswer(false);
    isRecordingRef.current = false;
  };

  const toggleVoiceRecording = () => {
    if (isRecordingAnswer) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  };

  // ==========================================
  // 5. SUBMIT ANSWER – manual only
  // ==========================================
  const submitAnswer = async (text) => {
    if (!text || !text.trim()) {
      alert('Please provide an answer first.');
      return;
    }
    
    if (loading) return;
    
    setLoading(true);
    setPracticeError(null);
    
    try {
      const updatedConversation = [...conversation, {
        role: 'candidate',
        question: currentPracticeQuestion?.question,
        answer: text,
        timestamp: new Date().toISOString()
      }];
      setConversation(updatedConversation);
      
      const response = await fetch(`${API_BASE_URL}/interview/practice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: currentPracticeQuestion?.question,
          user_answer: text,
          context: {
            conversation: updatedConversation,
            user_id: user?.id
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setFeedback(data);
        setPracticeScore(prev => prev + (data.score || 70));
        setTotalQuestionsAnswered(prev => prev + 1);
        
        setPracticeHistory(prev => [...prev, {
          question: currentPracticeQuestion?.question,
          answer: text,
          feedback: data,
          category: currentPracticeQuestion?.category,
          isVoice: true,
          timestamp: new Date().toISOString()
        }]);
      } else {
        const errorText = await response.text();
        console.error('Practice error:', errorText);
        setPracticeError('Failed to get feedback. Please try again.');
        alert('Failed to get feedback. Please try again.');
      }
    } catch (err) {
      console.error('Error in practice:', err);
      setPracticeError('Error submitting answer. Please try again.');
      alert('Error submitting answer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePracticeSubmit = async () => {
    const text = userAnswer.trim();
    if (!text) {
      alert('Please provide an answer first.');
      return;
    }
    await submitAnswer(text);
  };

  // ==========================================
  // 6. PRACTICE INTERVIEW
  // ==========================================
  const startPractice = () => {
    if (interviewQuestions.length === 0) {
      alert('Please generate interview questions first!');
      return;
    }
    setIsPracticing(true);
    setIsPracticeComplete(false);
    setCurrentPracticeQuestion(interviewQuestions[0]);
    setUserAnswer('');
    setFeedback(null);
    setCurrentQuestionIndex(0);
    setPracticeScore(0);
    setTotalQuestionsAnswered(0);
    setSessionFeedback(null);
    setConversation([]);
    setVoiceTranscript('');
    setPracticeError(null);
    setVoiceError(null);
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setActiveTab('practice');
  };

  const goToNextQuestion = () => {
    if (feedback) {
      const nextIndex = currentQuestionIndex + 1;
      if (nextIndex < interviewQuestions.length) {
        setCurrentQuestionIndex(nextIndex);
        setCurrentPracticeQuestion(interviewQuestions[nextIndex]);
        setUserAnswer('');
        setFeedback(null);
        setVoiceTranscript('');
        setPracticeError(null);
        setVoiceError(null);
        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
        const practiceSection = document.getElementById('practice-section');
        if (practiceSection) {
          practiceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        setIsPracticeComplete(true);
        getFinalFeedback();
      }
    }
  };

  const getFinalFeedback = async () => {
    setLoading(true);
    setPracticeError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/interview/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: conversation,
          job_role: jdText.slice(0, 100) || 'General',
          level: level
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setSessionFeedback(data);
        
        await fetch(`${API_BASE_URL}/interview/save-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user?.id,
            questions: interviewQuestions.map(q => q.question),
            answers: conversation.filter(c => c.role === 'candidate').map(c => c.answer),
            feedback: data,
            score: data.overall_score || 70
          })
        });
      } else {
        const errorText = await response.text();
        console.error('Feedback error:', errorText);
        setPracticeError('Failed to get session feedback. Please try again.');
        alert('Failed to get session feedback. Please try again.');
      }
    } catch (err) {
      console.error('Error getting final feedback:', err);
      setPracticeError('Error getting feedback. Please try again.');
      alert('Error getting feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetPractice = () => {
    if (isRecordingAnswer) {
      stopVoiceRecording();
    }
    setIsPracticing(false);
    setIsPracticeComplete(false);
    setCurrentQuestionIndex(0);
    setConversation([]);
    setFeedback(null);
    setSessionFeedback(null);
    setPracticeScore(0);
    setTotalQuestionsAnswered(0);
    setUserAnswer('');
    setPracticeHistory([]);
    setVoiceTranscript('');
    setPracticeError(null);
    setVoiceError(null);
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setActiveTab('questions');
  };

  const handleClearJD = () => {
    setJdText('');
  };

  const loadSampleJD = () => {
    const randomJD = sampleJDs[Math.floor(Math.random() * sampleJDs.length)];
    setJdText(randomJD.description);
    setShowSampleJD(true);
  };

  // ==========================================
  // RENDER FUNCTIONS (same as before)
  // ==========================================
  
  const renderResumeSection = () => (
    <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <h3 style={{ margin: '0 0 16px 0', color: '#2D3748' }}>📄 Resume & JD</h3>
      {resumeUploadError && (
        <div style={{
          padding: '12px',
          background: '#FED7D7',
          borderRadius: '8px',
          border: '1px solid #FEB2B2',
          marginBottom: '16px',
          color: '#9B2C2C',
          fontSize: '14px'
        }}>
          ⚠️ {resumeUploadError}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div style={{ 
          background: '#F7FAFC', 
          border: '2px dashed #CBD5E0', 
          borderRadius: '12px', 
          padding: '20px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }} 
        onClick={() => fileInputRef.current?.click()}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#805AD5'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#CBD5E0'}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.doc,.docx"
            onChange={handleResumeUpload}
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>
            {isResumeUploading ? '⏳' : '📤'}
          </div>
          <p style={{ margin: 0, fontWeight: 'bold', color: '#2D3748' }}>
            {resumeFileName || 'Click to Upload Resume'}
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#A0AEC0' }}>
            {isResumeUploading ? 'Uploading...' : 'Upload your resume for AI-powered analysis'}
          </p>
          {resumeText && !isResumeUploading && (
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#38A169' }}>
              ✅ {resumeText.length} characters loaded
            </p>
          )}
        </div>

        <div>
          <textarea
            placeholder="Enter your job description here..."
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            style={{
              width: '100%',
              height: '100px',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E0',
              fontSize: '14px',
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit'
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={loadSampleJD}
              style={{
                padding: '6px 12px',
                background: '#EDF2F7',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#4A5568'
              }}
            >
              📋 Use Sample JD
            </button>
            {jdText && (
              <button
                onClick={handleClearJD}
                style={{
                  padding: '6px 12px',
                  background: '#FED7D7',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#9B2C2C'
                }}
              >
                Clear
              </button>
            )}
            <button
              onClick={handleJDAnalysis}
              disabled={jdAnalysisLoading || !jdText.trim()}
              style={{
                padding: '6px 16px',
                background: '#805AD5',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                opacity: (jdAnalysisLoading || !jdText.trim()) ? 0.6 : 1,
                transition: 'opacity 0.2s ease'
              }}
            >
              {jdAnalysisLoading ? 'Analyzing...' : '🔍 Analyze JD'}
            </button>
          </div>
        </div>
      </div>

      {resumeAnalysis && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontWeight: 'bold', color: '#2D3748' }}>Analysis Results</span>
            <span style={{ 
              padding: '4px 12px',
              borderRadius: '20px',
              background: resumeAnalysis.overall_rating === 'Excellent' ? '#C6F6D5' :
                         resumeAnalysis.overall_rating === 'Good' ? '#FEFCBF' : '#FED7D7',
              color: resumeAnalysis.overall_rating === 'Excellent' ? '#276749' :
                     resumeAnalysis.overall_rating === 'Good' ? '#744210' : '#9B2C2C',
              fontWeight: 'bold',
              fontSize: '13px'
            }}>
              {resumeAnalysis.overall_rating || 'Needs Improvement'}
            </span>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#4A5568' }}>ATS Score</span>
              <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#805AD5' }}>
                {resumeAnalysis.ats_score || 0}%
              </span>
            </div>
            <div style={{ background: '#E2E8F0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${resumeAnalysis.ats_score || 0}%`,
                background: 'linear-gradient(90deg, #805AD5, #9F7AEA)',
                height: '100%',
                transition: 'width 0.6s ease'
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#A0AEC0', marginTop: '4px' }}>
              <span>Needs Work</span>
              <span>Good</span>
              <span>Excellent</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div style={{ background: '#F0FFF4', padding: '16px', borderRadius: '8px', border: '1px solid #C6F6D5' }}>
              <h5 style={{ margin: '0 0 8px 0', color: '#38A169', fontSize: '14px' }}>✅ Strengths</h5>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#2D3748' }}>
                {resumeAnalysis.strengths?.slice(0, 4).map((item, i) => (
                  <li key={i} style={{ marginBottom: '4px' }}>{item}</li>
                ))}
              </ul>
            </div>
            <div style={{ background: '#FFFFF0', padding: '16px', borderRadius: '8px', border: '1px solid #FEFCBF' }}>
              <h5 style={{ margin: '0 0 8px 0', color: '#DD6B20', fontSize: '14px' }}>⚠️ Improvements</h5>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#2D3748' }}>
                {resumeAnalysis.weaknesses?.slice(0, 4).map((item, i) => (
                  <li key={i} style={{ marginBottom: '4px' }}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h5 style={{ margin: '0 0 8px 0', color: '#2B6CB0', fontSize: '14px' }}>📝 Improvement Suggestions</h5>
            {resumeAnalysis.improvement_suggestions?.map((item, i) => (
              <div key={i} style={{
                padding: '12px 16px',
                background: '#F7FAFC',
                borderRadius: '8px',
                marginBottom: '8px',
                border: '1px solid #E2E8F0'
              }}>
                <div style={{ fontWeight: 'bold', color: '#2D3748', fontSize: '14px' }}>{item.section}</div>
                <div style={{ color: '#4A5568', fontSize: '13px' }}>{item.suggestion}</div>
                {item.example && (
                  <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px', padding: '4px 8px', background: '#FFFFFF', borderRadius: '4px' }}>
                    💡 {item.example}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <h5 style={{ margin: '0 0 8px 0', color: '#4A5568', fontSize: '14px' }}>🔑 Missing Keywords</h5>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {resumeAnalysis.missing_keywords?.map((kw, i) => (
                <span key={i} style={{
                  padding: '4px 14px',
                  background: '#FEFCBF',
                  borderRadius: '16px',
                  fontSize: '12px',
                  color: '#744210',
                  fontWeight: '500'
                }}>
                  {kw}
                </span>
              ))}
            </div>
          </div>

          <div style={{
            padding: '14px 18px',
            background: '#EDF2F7',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#2D3748',
            marginBottom: '16px',
            border: '1px solid #E2E8F0'
          }}>
            📌 {resumeAnalysis.summary_feedback}
          </div>

          <button
            onClick={generateInterviewQuestions}
            disabled={questionsLoading || !resumeText}
            style={{
              width: '100%',
              padding: '12px',
              background: '#6B46C1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              fontSize: '16px',
              cursor: 'pointer',
              opacity: (questionsLoading || !resumeText) ? 0.6 : 1,
              transition: 'opacity 0.2s ease'
            }}
          >
            {questionsLoading ? 'Generating...' : 'Generate Interview Questions ➔'}
          </button>
        </div>
      )}
    </div>
  );

  const renderQuestionsSection = () => {
    const questionsToShow = interviewQuestions;
    const behavioralCount = questionsToShow.filter(q => q.type === 'behavioral').length;
    const technicalCount = questionsToShow.filter(q => q.type === 'technical').length;
    const cultureCount = questionsToShow.filter(q => q.type === 'culture').length;
    const situationalCount = questionsToShow.filter(q => q.type === 'situational').length;
    const problemSolvingCount = questionsToShow.filter(q => q.type === 'problem_solving').length;

    return (
      <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#2D3748' }}>📝 Interview Questions</h3>
            {questionsToShow.length > 0 && (
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#718096' }}>
                {questionsToShow.length} questions • {behavioralCount} Behavioral, {technicalCount} Technical, {situationalCount} Situational, {cultureCount} Culture, {problemSolvingCount} Problem Solving
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={generateInterviewQuestions}
              disabled={questionsLoading}
              style={{
                padding: '8px 16px',
                background: '#DD6B20',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px',
                opacity: questionsLoading ? 0.6 : 1,
                transition: 'opacity 0.2s ease'
              }}
            >
              {questionsLoading ? 'Generating...' : '🔄 Generate'}
            </button>
            <button
              onClick={() => setShowAllQuestions(!showAllQuestions)}
              disabled={questionsToShow.length === 0}
              style={{
                padding: '8px 16px',
                background: '#EDF2F7',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px',
                opacity: questionsToShow.length === 0 ? 0.5 : 1,
                color: '#4A5568',
                transition: 'opacity 0.2s ease'
              }}
            >
              {showAllQuestions ? '📋 Less' : '📋 All'}
            </button>
            <button
              onClick={startPractice}
              disabled={questionsToShow.length === 0}
              style={{
                padding: '8px 16px',
                background: '#38A169',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px',
                opacity: questionsToShow.length === 0 ? 0.5 : 1,
                transition: 'opacity 0.2s ease'
              }}
            >
              🎯 Practice
            </button>
          </div>
        </div>
        
        {questionsToShow.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
            <p>Upload your resume and JD, then click "Generate"</p>
            <p style={{ fontSize: '13px' }}>Questions will be tailored to your profile</p>
          </div>
        ) : (
          <div>
            <div style={{
              border: '2px solid #805AD5',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '16px',
              background: '#FAF5FF'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ 
                  fontSize: '11px',
                  fontWeight: 'bold',
                  padding: '2px 12px',
                  borderRadius: '12px',
                  background: questionsToShow[0]?.type === 'behavioral' ? '#FEFCBF' :
                            questionsToShow[0]?.type === 'technical' ? '#BEE3F8' :
                            questionsToShow[0]?.type === 'situational' ? '#C6F6D5' :
                            questionsToShow[0]?.type === 'culture' ? '#FED7D7' : '#E9D8FD',
                  color: '#4A5568',
                  textTransform: 'capitalize'
                }}>
                  {questionsToShow[0]?.type || 'General'}
                </span>
                <span style={{ fontSize: '12px', color: '#A0AEC0' }}>
                  Q1 of {questionsToShow.length} • {questionsToShow[0]?.difficulty || 'Intermediate'}
                </span>
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '16px', fontWeight: '500', color: '#2D3748' }}>
                {questionsToShow[0]?.question}
              </p>
              <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>
                Category: {questionsToShow[0]?.category}
              </div>
            </div>

            {!showAllQuestions && questionsToShow.length > 1 && (
              <div style={{ textAlign: 'center', marginTop: '8px' }}>
                <button
                  onClick={() => setShowAllQuestions(true)}
                  style={{
                    padding: '6px 16px',
                    background: 'transparent',
                    border: '1px solid #CBD5E0',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#4A5568'
                  }}
                >
                  View all {questionsToShow.length} questions →
                </button>
              </div>
            )}

            {showAllQuestions && (
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {questionsToShow.map((q, idx) => (
                  <div key={q.id || idx} style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '14px',
                    marginBottom: '10px',
                    background: idx === 0 ? '#FAF5FF' : 'white'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ 
                        fontSize: '11px',
                        fontWeight: 'bold',
                        padding: '2px 12px',
                        borderRadius: '12px',
                        background: q.type === 'behavioral' ? '#FEFCBF' :
                                  q.type === 'technical' ? '#BEE3F8' :
                                  q.type === 'situational' ? '#C6F6D5' :
                                  q.type === 'culture' ? '#FED7D7' : '#E9D8FD',
                        color: '#4A5568',
                        textTransform: 'capitalize'
                      }}>
                        {q.type || 'General'}
                      </span>
                      <span style={{ fontSize: '12px', color: '#A0AEC0' }}>
                        Q{idx + 1} • {q.difficulty || 'Intermediate'}
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 4px 0', fontSize: '14px', fontWeight: '500', color: '#2D3748' }}>
                      {q.question}
                    </p>
                    <details style={{ fontSize: '13px', color: '#4A5568' }}>
                      <summary style={{ cursor: 'pointer', color: '#3182CE' }}>💡 Show Details</summary>
                      <p style={{ margin: '4px 0' }}><strong>Category:</strong> {q.category}</p>
                      <p style={{ margin: '4px 0' }}><strong>Sample Answer:</strong> {q.sample_answer}</p>
                      <p style={{ margin: '4px 0' }}><strong>Key Points:</strong> {q.key_points?.join(', ')}</p>
                      <p style={{ margin: '4px 0' }}><strong>Common Mistakes:</strong> {q.common_mistakes?.join(', ')}</p>
                      <p style={{ margin: '4px 0' }}><strong>Follow-up:</strong> {q.follow_up_hint}</p>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // RENDER PRACTICE SECTION (WITH VOICE INPUT – Web Speech API)
  // ==========================================
  const renderPracticeSection = () => {
    const questionsToUse = interviewQuestions;

    return (
      <div id="practice-section" style={{ background: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#38A169' }}>🎯 Interview Practice</h3>
        
        {!isPracticing && !isPracticeComplete ? (
          <div style={{ textAlign: 'center', padding: '30px' }}>
            <p style={{ fontSize: '16px', color: '#4A5568' }}>
              {questionsToUse.length > 0 
                ? `Ready to practice ${questionsToUse.length} interview questions?` 
                : 'Generate questions first to start practicing'}
            </p>
            {questionsToUse.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
                <span style={{ padding: '4px 12px', background: '#FEFCBF', borderRadius: '12px', fontSize: '12px' }}>
                  {questionsToUse.filter(q => q.type === 'behavioral').length} Behavioral
                </span>
                <span style={{ padding: '4px 12px', background: '#BEE3F8', borderRadius: '12px', fontSize: '12px' }}>
                  {questionsToUse.filter(q => q.type === 'technical').length} Technical
                </span>
                <span style={{ padding: '4px 12px', background: '#C6F6D5', borderRadius: '12px', fontSize: '12px' }}>
                  {questionsToUse.filter(q => q.type === 'situational').length} Situational
                </span>
                <span style={{ padding: '4px 12px', background: '#FED7D7', borderRadius: '12px', fontSize: '12px' }}>
                  {questionsToUse.filter(q => q.type === 'culture').length} Culture
                </span>
                <span style={{ padding: '4px 12px', background: '#E9D8FD', borderRadius: '12px', fontSize: '12px' }}>
                  {questionsToUse.filter(q => q.type === 'problem_solving').length} Problem Solving
                </span>
              </div>
            )}
            <button
              onClick={startPractice}
              disabled={questionsToUse.length === 0}
              style={{
                padding: '12px 30px',
                background: '#38A169',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '16px',
                opacity: questionsToUse.length === 0 ? 0.5 : 1,
                transition: 'opacity 0.2s ease'
              }}
            >
              🎯 Start Practice Session
            </button>
          </div>
        ) : isPracticeComplete ? (
          <div>
            {sessionFeedback ? (
              <div style={{
                padding: '20px',
                background: '#FAF5FF',
                borderRadius: '12px',
                border: '2px solid #9F7AEA'
              }}>
                <h4 style={{ color: '#44337A', marginBottom: '12px' }}>
                  🎉 Session Complete! Interview Feedback
                </h4>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                  <div style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    background: '#9F7AEA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '32px',
                    fontWeight: 'bold'
                  }}>
                    {sessionFeedback.overall_score || 70}%
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontWeight: 'bold', color: '#2D3748' }}>📋 Summary</div>
                  <div style={{ fontSize: '14px', color: '#4A5568' }}>{sessionFeedback.summary}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ background: '#F0FFF4', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 'bold', color: '#38A169' }}>✅ Strengths</div>
                    <ul style={{ margin: '4px 0', paddingLeft: '20px', fontSize: '13px' }}>
                      {sessionFeedback.strengths?.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div style={{ background: '#FFFFF0', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 'bold', color: '#E53E3E' }}>⚠️ Areas to Improve</div>
                    <ul style={{ margin: '4px 0', paddingLeft: '20px', fontSize: '13px' }}>
                      {sessionFeedback.weaknesses?.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontWeight: 'bold', color: '#2B6CB0' }}>💡 Tips for Actual Interview</div>
                  <ul style={{ margin: '4px 0', paddingLeft: '20px', fontSize: '13px' }}>
                    {sessionFeedback.tips?.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontWeight: 'bold', color: '#805AD5' }}>📚 Recommended Resources</div>
                  {sessionFeedback.recommended_resources?.map((r, i) => (
                    <div key={i} style={{ fontSize: '13px', color: '#4A5568' }}>
                      • <span style={{ fontWeight: 'bold' }}>{r.topic}:</span> {r.suggestion}
                    </div>
                  ))}
                </div>

                <div style={{
                  padding: '12px',
                  background: '#FFFFFF',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: '#2D3748',
                  textAlign: 'center',
                  fontStyle: 'italic'
                }}>
                  💪 {sessionFeedback.confidence_boost}
                </div>

                <button
                  onClick={resetPractice}
                  style={{
                    marginTop: '16px',
                    padding: '10px 24px',
                    background: '#6B46C1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  Practice Again 🔄
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>Loading final feedback...</p>
              </div>
            )}
          </div>
        ) : (
          // ACTIVE PRACTICE WITH VOICE INPUT (Web Speech API – manual submit)
          <div>
            <div style={{ 
              background: '#EDF2F7', 
              borderRadius: '8px', 
              padding: '8px 12px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '14px', color: '#4A5568' }}>
                Question {currentQuestionIndex + 1} of {questionsToUse.length}
              </span>
              <span style={{ 
                background: '#E9D8FD', 
                padding: '2px 12px', 
                borderRadius: '12px',
                fontSize: '12px',
                color: '#6B46C1',
                fontWeight: 'bold',
                textTransform: 'capitalize'
              }}>
                {currentPracticeQuestion?.type || 'HR'}
              </span>
            </div>
            
            <div style={{
              background: '#F7FAFC',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              marginBottom: '16px'
            }}>
              <p style={{ fontSize: '17px', fontWeight: '500', margin: 0, color: '#2D3748' }}>
                {currentPracticeQuestion?.question}
              </p>
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ 
                    fontSize: '12px', 
                    color: '#718096',
                    background: '#EDF2F7',
                    padding: '2px 10px',
                    borderRadius: '12px'
                  }}>
                    📂 {currentPracticeQuestion?.category || 'General'}
                  </span>
                  <span style={{ 
                    fontSize: '12px', 
                    color: '#718096',
                    background: '#EDF2F7',
                    padding: '2px 10px',
                    borderRadius: '12px'
                  }}>
                    🔑 {currentPracticeQuestion?.key_points?.join(', ')}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Answer Area with Voice Input */}
            <div style={{ position: 'relative' }}>
              <textarea
                rows="4"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder={voiceTranscript ? `Voice input: "${voiceTranscript}"` : "Type your answer here... or click the microphone to speak your answer aloud."}
                style={{
                  width: '100%',
                  padding: '12px',
                  paddingRight: '60px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E0',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                  marginBottom: '12px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  background: isRecordingAnswer ? '#FEFCBF' : (voiceTranscript ? '#EBF8FF' : '#FFFFFF')
                }}
                disabled={isRecordingAnswer || !!feedback}
              />
              
              {/* MIC BUTTON */}
              <button
                onClick={toggleVoiceRecording}
                disabled={!!feedback}
                style={{
                  position: 'absolute',
                  right: '12px',
                  bottom: '28px',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: 'none',
                  background: isRecordingAnswer ? '#E53E3E' : '#805AD5',
                  color: 'white',
                  cursor: !!feedback ? 'not-allowed' : 'pointer',
                  opacity: !!feedback ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  transition: 'all 0.3s ease',
                  animation: isRecordingAnswer ? 'pulse 1s infinite' : 'none'
                }}
                title={isRecordingAnswer ? "Stop recording" : "Click to speak your answer"}
              >
                {isRecordingAnswer ? '⏹️' : '🎙️'}
              </button>
            </div>

            {isRecordingAnswer && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                marginBottom: '12px',
                padding: '8px 12px',
                background: '#FED7D7',
                borderRadius: '8px',
                border: '1px solid #FEB2B2'
              }}>
                <span style={{ 
                  display: 'inline-block', 
                  width: '10px', 
                  height: '10px', 
                  background: '#E53E3E', 
                  borderRadius: '50%',
                  animation: 'pulse 1s infinite'
                }} />
                <span style={{ fontSize: '13px', color: '#9B2C2C' }}>
                  🔴 Recording... Speak clearly. Click the mic again to stop. Then click "Submit Answer".
                </span>
              </div>
            )}

            {voiceTranscript && !isRecordingAnswer && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 12px',
                background: '#EBF8FF',
                borderRadius: '8px',
                border: '1px solid #90CDF4',
                fontSize: '13px',
                color: '#2B6CB0'
              }}>
                🎤 Voice transcribed: "{voiceTranscript}"
              </div>
            )}

            {voiceError && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 12px',
                background: '#FED7D7',
                borderRadius: '8px',
                border: '1px solid #FEB2B2',
                fontSize: '13px',
                color: '#9B2C2C'
              }}>
                ⚠️ {voiceError}
              </div>
            )}

            {practiceError && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 12px',
                background: '#FED7D7',
                borderRadius: '8px',
                border: '1px solid #FEB2B2',
                fontSize: '13px',
                color: '#9B2C2C'
              }}>
                ⚠️ {practiceError}
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {!feedback ? (
                <button
                  onClick={handlePracticeSubmit}
                  disabled={loading || !userAnswer.trim() || isRecordingAnswer}
                  style={{
                    padding: '10px 24px',
                    background: '#38A169',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    opacity: (loading || !userAnswer.trim() || isRecordingAnswer) ? 0.6 : 1,
                    fontSize: '15px',
                    transition: 'opacity 0.2s ease'
                  }}
                >
                  {loading ? 'Evaluating...' : '✅ Submit Answer'}
                </button>
              ) : (
                <button
                  onClick={goToNextQuestion}
                  style={{
                    padding: '10px 24px',
                    background: '#805AD5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '15px'
                  }}
                >
                  {currentQuestionIndex < questionsToUse.length - 1 ? '➡️ Next Question' : '🏁 Finish Practice'}
                </button>
              )}
              
              <button
                onClick={resetPractice}
                style={{
                  padding: '10px 16px',
                  background: '#EDF2F7',
                  color: '#4A5568',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ⏹️ Exit Practice
              </button>
            </div>
            
            {feedback && (
              <div style={{
                marginTop: '16px',
                background: '#F0FFF4',
                border: '2px solid #38A169',
                borderRadius: '12px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, color: '#22543D' }}>🎉 Feedback</h4>
                  <span style={{
                    background: '#C6F6D5',
                    padding: '2px 12px',
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    color: '#22543D'
                  }}>
                    Score: {feedback.score}%
                  </span>
                </div>
                <p style={{ color: '#2F855A', margin: '8px 0 4px 0' }}>✅ {feedback.evaluation}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                  <div>
                    <p style={{ fontWeight: 'bold', color: '#38A169', margin: 0, fontSize: '13px' }}>Strengths</p>
                    <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '13px' }}>
                      {(feedback.strengths || []).map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p style={{ fontWeight: 'bold', color: '#DD6B20', margin: 0, fontSize: '13px' }}>Improvements</p>
                    <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '13px' }}>
                      {(feedback.improvements || []).map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                </div>
                <p style={{ color: '#805AD5', margin: '8px 0 0 0', fontSize: '14px' }}>
                  💡 <strong>Tip:</strong> {feedback.tip}
                </p>
                {feedback.follow_up_question && (
                  <p style={{ color: '#2B6CB0', margin: '4px 0 0 0', fontSize: '14px' }}>
                    🔍 <strong>Follow-up:</strong> {feedback.follow_up_question}
                  </p>
                )}
                {/* Extra HR-style fields (if returned by backend) */}
                {(feedback.key_points_covered || []).length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <p style={{ fontWeight: 'bold', color: '#2B6CB0', margin: 0, fontSize: '13px' }}>📋 Key Points Covered</p>
                    <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '13px' }}>
                      {(feedback.key_points_covered || []).map((kp, i) => <li key={i}>{kp}</li>)}
                    </ul>
                  </div>
                )}
                {feedback.communication_style && (
                  <div style={{ marginTop: '8px' }}>
                    <p style={{ fontWeight: 'bold', color: '#2B6CB0', margin: 0, fontSize: '13px' }}>🗣️ Communication Style</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#4A5568' }}>{feedback.communication_style}</p>
                  </div>
                )}
                {feedback.suggested_improvement && (
                  <div style={{ marginTop: '8px' }}>
                    <p style={{ fontWeight: 'bold', color: '#DD6B20', margin: 0, fontSize: '13px' }}>📈 Suggested Improvement</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#4A5568' }}>{feedback.suggested_improvement}</p>
                  </div>
                )}
              </div>
            )}
            
            {practiceHistory.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#4A5568', fontSize: '14px' }}>
                  📚 Practice History ({practiceHistory.length}/{questionsToUse.length})
                </h4>
                <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                  {practiceHistory.slice().reverse().map((item, idx) => (
                    <div key={idx} style={{
                      background: '#F7FAFC',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      marginBottom: '4px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ color: '#4A5568' }}>
                        Q{item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : idx + 1}: {item.question?.slice(0, 30)}...
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '10px', color: '#718096' }}>
                          {item.feedback?.score || 70}%
                        </span>
                        {item.isVoice && (
                          <span style={{ fontSize: '10px', color: '#805AD5' }}>🎙️</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // MAIN RENDER
  // ==========================================
  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px', fontFamily: "'Segoe UI', sans-serif" }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onBack} style={{ 
            padding: '8px 16px', 
            background: '#EDF2F7', 
            border: 'none', 
            borderRadius: '8px', 
            cursor: 'pointer', 
            fontWeight: 'bold',
            fontSize: '14px'
          }}>
            ← Back
          </button>
          <button 
            onClick={handleClearAll} 
            style={{ 
              padding: '8px 16px', 
              background: '#E53E3E', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            🔄 Clear All Data
          </button>
        </div>
        <div style={{ 
          background: '#C6F6D5', 
          color: '#22543D', 
          padding: '6px 14px', 
          borderRadius: '20px', 
          fontWeight: 'bold', 
          fontSize: '14px' 
        }}>
          🎯 Level {level} Interview Prep
        </div>
      </div>

      <h2 style={{ margin: '0 0 4px 0', color: '#2D3748', fontSize: '24px' }}>💼 Interview Preparation</h2>
      <p style={{ color: '#718096', marginBottom: '20px', fontSize: '14px' }}>
        Upload resume, analyze JD, get tailored questions, and practice with AI feedback
      </p>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '8px',
        marginBottom: '24px'
      }}>
        {[
          { id: 'resume', label: '📄 Resume & JD', color: '#3182CE' },
          { id: 'questions', label: '📝 Questions', color: '#DD6B20' },
          { id: 'practice', label: '🎯 Practice', color: '#38A169' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (isPracticing && tab.id !== 'practice') {
                if (!confirm('This will end your current practice session. Continue?')) return;
                resetPractice();
              }
              setActiveTab(tab.id);
            }}
            style={{
              padding: '12px 8px',
              borderRadius: '10px',
              border: activeTab === tab.id ? `2px solid ${tab.color}` : '1px solid #E2E8F0',
              background: activeTab === tab.id ? '#FFFFFF' : '#F7FAFC',
              color: activeTab === tab.id ? tab.color : '#4A5568',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              cursor: 'pointer',
              fontSize: '14px',
              boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ display: 'inline-block' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#805AD5', borderRadius: '50%', animation: 'bounce 1.4s infinite 0s' }} />
              <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#805AD5', borderRadius: '50%', animation: 'bounce 1.4s infinite 0.2s' }} />
              <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#805AD5', borderRadius: '50%', animation: 'bounce 1.4s infinite 0.4s' }} />
            </div>
            <div style={{ marginTop: '12px', color: '#718096' }}>Processing...</div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {activeTab === 'resume' && renderResumeSection()}
          {activeTab === 'questions' && renderQuestionsSection()}
          {activeTab === 'practice' && renderPracticeSection()}
        </>
      )}

      <style>
        {`
          @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-10px); }
          }
          @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.95); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}
      </style>
    </div>
  );
}

export default Interview;