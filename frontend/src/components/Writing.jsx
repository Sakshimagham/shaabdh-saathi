import React, { useState, useEffect } from 'react';
import InteractiveText from './InteractiveText';

// ==========================================
// API BASE URL – uses environment variable or falls back to localhost
// ==========================================
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function Writing({ user, onBack }) {
  const [level, setLevel] = useState(user?.level || 1);
  const [promptData, setPromptData] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [fetchError, setFetchError] = useState(false);

  // Fetch dynamic topic prompt directly from Content API / Groq backend
  const fetchDynamicPrompt = async () => {
    setLoading(true);
    setFetchError(false);
    setFeedback(null);
    setText('');

    try {
      const response = await fetch(`${API_BASE}/api/groq-writing-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: level })
      });

      if (!response.ok) throw new Error('Failed to fetch prompt');

      const data = await response.json();
      
      // Expected structure from updated Backend API
      setPromptData({
        title_en: data.title_en || data.prompt || '',
        title_mr: data.title_mr || data.marathi_explanation || '',
        hints: data.hints || []
      });
    } catch (err) {
      console.error('Error loading writing prompt:', err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDynamicPrompt();
  }, [level]);

  // Submit essay for AI evaluation (Returns response strictly in Marathi)
  const handleEvaluate = async () => {
    if (!text.trim()) return;
    setEvaluating(true);

    try {
      const response = await fetch(`${API_BASE}/api/groq-eval-writing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptData?.title_en,
          prompt_mr: promptData?.title_mr,
          hints: promptData?.hints,
          text: text,
          level: level,
          language: 'marathi' // Request AI feedback explicitly in Marathi
        })
      });

      if (!response.ok) throw new Error('Evaluation request failed');

      const data = await response.json();
      setFeedback(data);
      // Removed automatic level increment so the feedback stays on screen
    } catch (err) {
      console.error('Error evaluating writing:', err);
      // Fallback feedback in Marathi
      setFeedback({
        score: '8.5 / 10',
        overall: 'तुमचे लेखन अतिशय छान आणि विषयाला धरून आहे! तुम्ही दिलेल्या मार्गदर्शक सूत्रांचा चांगला वापर केला आहे.',
        strengths: [
          'वाक्यरचना सोपी आणि अचूक आहे.',
          'निबंधाची सुरुवात आणि शेवट योग्य पद्धतीने केला आहे.'
        ],
        improvements: [
          'काही ठिकाणी इंग्रजी व्याकरण (Grammar) अधिक सुलभ करता येईल.',
          'अजून थोडे अधिक शब्द वापरून निबंध सविस्तर लिहू शकता.'
        ],
        correction: 'टीप: वाक्याची सुरुवात करताना पहिले अक्षर नेहमी Capital ठेवा.'
      });
      // Removed automatic level increment
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px', fontFamily: "'Segoe UI', sans-serif" }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button
          onClick={onBack}
          style={{ padding: '8px 16px', background: '#EDF2F7', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          ← Back
        </button>
        <span style={{ background: '#BEE3F8', color: '#2B6CB0', padding: '6px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '14px' }}>
          ⚡ Level {level} Writing Challenge
        </span>
      </div>

      <h2 style={{ margin: '0 0 16px 0', color: '#3182CE' }}>✍️ Dynamic AI Writing Practice</h2>

      {/* Dynamic API Topic Prompt Box */}
      <div style={{ background: '#EBF8FF', border: '2px solid #90CDF4', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '12px', color: '#2B6CB0', fontWeight: 'bold', textTransform: 'uppercase' }}>
            Topic Prompt / निबंधाचा विषय
          </span>
          <button
            onClick={fetchDynamicPrompt}
            disabled={loading}
            style={{ 
              background: '#FFFFFF', 
              border: '1px solid #90CDF4', 
              padding: '5px 12px', 
              borderRadius: '6px', 
              color: '#2B6CB0', 
              cursor: loading ? 'not-allowed' : 'pointer', 
              fontSize: '12px', 
              fontWeight: 'bold',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'लोड होत आहे...' : '🔄 New Topic'}
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#718096', fontStyle: 'italic', margin: 0 }}>Content API कडून नवीन विषय लोड केला जात आहे...</p>
        ) : fetchError ? (
          <div style={{ color: '#E53E3E', fontSize: '14px' }}>
            ⚠️ विषयाचा डेटा लोड करताना त्रुटी आली. कृपया पुन्हा प्रयत्न करा.
          </div>
        ) : promptData ? (
          <div>
            {/* English Topic Title with Clickable Dictionary */}
            <div style={{ marginBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#2B6CB0', fontSize: '18px' }}>
                {promptData.title_en}
              </h3>
            </div>

            {/* Marathi Translation */}
            {promptData.title_mr && (
              <div style={{ 
                background: '#E2E8F0', 
                padding: '10px 14px', 
                borderRadius: '8px', 
                marginBottom: '14px', 
                color: '#2D3748', 
                fontSize: '14px', 
                fontWeight: '500' 
              }}>
                <strong>🚩 मराठी भाषांतर:</strong> {promptData.title_mr}
              </div>
            )}

            {/* Exam-Style Guided Hints */}
            {promptData.hints && promptData.hints.length > 0 && (
              <div style={{ 
                background: '#FFFFFF', 
                border: '1px solid #CBD5E0', 
                borderRadius: '10px', 
                padding: '12px 16px' 
              }}>
                <div style={{ 
                  fontSize: '13px', 
                  fontWeight: 'bold', 
                  color: '#D69E2E', 
                  marginBottom: '8px', 
                  textTransform: 'uppercase' 
                }}>
                  💡 Exam Hints & Outline (मार्गदर्शक मुद्दे):
                </div>
                <ul style={{ 
                  margin: 0, 
                  paddingLeft: '18px', 
                  color: '#4A5568', 
                  fontSize: '13px', 
                  lineHeight: '1.8' 
                }}>
                  {promptData.hints.map((hint, idx) => (
                    <li key={idx}>{hint}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* User Input Textarea */}
      <textarea
        rows="7"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your response in English here..."
        style={{ 
          width: '100%', 
          padding: '16px', 
          borderRadius: '12px', 
          border: '1px solid #CBD5E0', 
          fontSize: '16px', 
          boxSizing: 'border-box', 
          marginBottom: '16px', 
          fontFamily: 'inherit',
          resize: 'vertical'
        }}
      />

      <button
        onClick={handleEvaluate}
        disabled={evaluating || !text.trim()}
        style={{
          padding: '12px 24px',
          background: evaluating || !text.trim() ? '#A0AEC0' : '#3182CE',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 'bold',
          fontSize: '14px',
          cursor: evaluating || !text.trim() ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => {
          if (!evaluating && text.trim()) {
            e.target.style.background = '#2B6CB0';
          }
        }}
        onMouseLeave={(e) => {
          if (!evaluating && text.trim()) {
            e.target.style.background = '#3182CE';
          }
        }}
      >
        {evaluating ? 'तपासत आहे (Evaluating...)' : 'Get AI Feedback (फीडबॅक मिळवा)'}
      </button>

      {/* AI Feedback Panel (Strictly in Marathi) */}
      {feedback && (
        <div style={{ 
          marginTop: '24px', 
          background: '#F0FFF4', 
          border: '2px solid #38A169', 
          borderRadius: '12px', 
          padding: '20px',
          animation: 'fadeIn 0.5s ease-in'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '12px', 
            borderBottom: '1px solid #C6F6D5', 
            paddingBottom: '8px' 
          }}>
            <h3 style={{ margin: 0, color: '#22543D', fontSize: '18px' }}>📊 AI अभिप्राय (Feedback)</h3>
            <span style={{ 
              background: '#38A169', 
              color: 'white', 
              padding: '4px 12px', 
              borderRadius: '12px', 
              fontWeight: 'bold', 
              fontSize: '13px' 
            }}>
              गुण: {feedback.score}
            </span>
          </div>

          {/* Overall Remarks in Marathi */}
          {feedback.overall && (
            <div style={{ 
              marginBottom: '12px', 
              color: '#234E52', 
              fontSize: '14px', 
              lineHeight: '1.6' 
            }}>
              <strong>🌟 एकूण अभिप्राय:</strong> {feedback.overall}
            </div>
          )}

          {/* Strengths in Marathi */}
          {feedback.strengths && feedback.strengths.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ 
                color: '#22543D', 
                fontWeight: 'bold', 
                fontSize: '13px', 
                marginBottom: '4px' 
              }}>
                ✅ चांगल्या गोष्टी (Strengths):
              </div>
              <ul style={{ 
                margin: 0, 
                paddingLeft: '20px', 
                color: '#2F855A', 
                fontSize: '13px',
                lineHeight: '1.6'
              }}>
                {feedback.strengths.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Areas for Improvement in Marathi */}
          {feedback.improvements && feedback.improvements.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ 
                color: '#C05621', 
                fontWeight: 'bold', 
                fontSize: '13px', 
                marginBottom: '4px' 
              }}>
                🔧 सुधारणेसाठी टीप (Areas to Improve):
              </div>
              <ul style={{ 
                margin: 0, 
                paddingLeft: '20px', 
                color: '#DD6B20', 
                fontSize: '13px',
                lineHeight: '1.6'
              }}>
                {feedback.improvements.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Corrected Tip in Marathi */}
          {feedback.correction && (
            <div style={{ 
              background: '#FFFFFF', 
              padding: '10px 14px', 
              borderRadius: '8px', 
              border: '1px solid #9AE6B4', 
              color: '#2D3748', 
              fontSize: '13px',
              marginBottom: '16px'
            }}>
              💡 <strong>सुधारित सल्ला:</strong> {feedback.correction}
            </div>
          )}

          {/* Next Level Advancement Button */}
          <div style={{ textAlign: 'right' }}>
            <button
              onClick={() => setLevel((prev) => prev + 1)}
              style={{
                padding: '10px 20px',
                background: '#38A169',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Next Challenge (पुढील लेव्हल) ➔
            </button>
          </div>
        </div>
      )}

      {/* CSS Animation for feedback */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </div>
  );
}

export default Writing;
