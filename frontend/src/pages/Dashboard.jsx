// src/pages/Dashboard.jsx
import React, { useState } from 'react';

function Dashboard({ user, onLogout, goToPage }) {
  const [showMarathi, setShowMarathi] = useState(true);

  const skills = user?.skills || {
    reading: user?.reading_progress || 0,
    writing: user?.writing_progress || 0,
    speaking: user?.speaking_progress || 0,
    interview: user?.interview_progress || 0,
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", color: '#2D3748' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: '#E65F2B', margin: 0, fontSize: '32px', fontWeight: '800' }}>Shaabdh Saathi</h1>
          <p style={{ margin: '6px 0 0 0', color: '#718096', fontSize: '15px' }}>
            {showMarathi ? 'मराठीतून इंग्रजी शिकण्याचे सोपे व प्रभावी माध्यम' : 'Learn English comfortably through Marathi'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => setShowMarathi(!showMarathi)}
            style={{
              padding: '8px 16px',
              border: '2px solid #E65F2B',
              borderRadius: '24px',
              background: showMarathi ? '#FFF0EB' : '#FFFFFF',
              color: '#E65F2B',
              fontWeight: '700',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {showMarathi ? '🌐 Marathi Active' : '🌐 English Only'}
          </button>

          <button
            onClick={onLogout}
            style={{
              padding: '8px 18px',
              background: '#E53E3E',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(229, 62, 62, 0.2)'
            }}
          >
            Logout / बाहेर पडा
          </button>
        </div>
      </div>

      {/* Welcome Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #FF7E5F 0%, #FEB47B 100%)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '30px',
        color: 'white',
        boxShadow: '0 8px 20px rgba(230, 95, 43, 0.25)'
      }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: '700' }}>
          👋 {showMarathi ? `स्वागत आहे, ${user?.name || 'मित्र'}!` : `Welcome, ${user?.name || 'Friend'}!`}
        </h2>
        <p style={{ margin: '0 0 16px 0', opacity: 0.9, fontSize: '14px' }}>
          {showMarathi ? 'आज तुमचा इंग्रजी बोलण्याचा, लिहिण्याचा आणि मुलाखतीचा सराव करा!' : 'Practice your English reading, writing, speaking, and interview skills today!'}
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(255,255,255,0.25)', padding: '6px 16px', borderRadius: '20px', fontWeight: '600', fontSize: '13px' }}>
            🏆 Level: {user?.level || 1}
          </span>
          <span style={{ background: 'rgba(255,255,255,0.25)', padding: '6px 16px', borderRadius: '20px', fontWeight: '600', fontSize: '13px' }}>
            ⚡ XP: {user?.xp || 0}
          </span>
          <span style={{ background: 'rgba(255,255,255,0.25)', padding: '6px 16px', borderRadius: '20px', fontWeight: '600', fontSize: '13px' }}>
            🔥 Streak: {user?.streak || 0} {showMarathi ? 'दिवस' : 'Days'}
          </span>
        </div>
      </div>

      {/* Modules Grid */}
      <h3 style={{ color: '#2D3748', marginBottom: '16px', fontSize: '20px' }}>
        {showMarathi ? 'अभ्यास विभाग (Learning Modules)' : 'Learning Modules'}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        
        {/* Module 1: Reading */}
        <div
          onClick={() => goToPage('reading')}
          style={{
            background: '#FFFFFF',
            border: '2px solid #FEEBC8',
            borderRadius: '16px',
            padding: '22px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            transition: 'transform 0.2s'
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '10px' }}>📖</div>
          <h4 style={{ margin: '0 0 6px 0', color: '#DD6B20', fontSize: '18px' }}>Reading (वाचन)</h4>
          <p style={{ margin: 0, color: '#718096', fontSize: '13px', lineHeight: '1.5' }}>
            {showMarathi ? 'डायनामिक परिच्छेद वाचा, उच्चार ऐका आणि शब्दांवर क्लिक करून मराठी + हिंदी अर्थ पहा.' : 'Read dynamic AI passages, listen to voice audio, and click words for meanings.'}
          </p>
        </div>

        {/* Module 2: Writing */}
        <div
          onClick={() => goToPage('writing')}
          style={{
            background: '#FFFFFF',
            border: '2px solid #BEE3F8',
            borderRadius: '16px',
            padding: '22px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '10px' }}>✍️</div>
          <h4 style={{ margin: '0 0 6px 0', color: '#3182CE', fontSize: '18px' }}>Writing (लेखन)</h4>
          <p style={{ margin: 0, color: '#718096', fontSize: '13px', lineHeight: '1.5' }}>
            {showMarathi ? 'तुमच्या पातळीनुसार AI विषयांवर लिहा आणि झटपट मराठीत मार्गदर्शन मिळवा.' : 'Write on level-adaptive AI prompts with instant feedback and Marathi guidance.'}
          </p>
        </div>

        {/* Module 3: AI Talking Bot */}
        <div
          onClick={() => goToPage('talkingbot')}
          style={{
            background: '#FFFFFF',
            border: '2px solid #E9D8FD',
            borderRadius: '16px',
            padding: '22px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ fontSize: '30px', marginBottom: '10px' }}>🤖 🎙️</div>
          <h4 style={{ margin: '0 0 6px 0', color: '#805AD5', fontSize: '18px' }}>AI Speaking Bot</h4>
          <p style={{ margin: 0, color: '#718096', fontSize: '13px', lineHeight: '1.5' }}>
            {showMarathi ? 'AI सोबत मायक्रोफोनद्वारे इंग्रजी आणि मराठीच्या सोप्या मिश्रणात संभाषण करा.' : 'Practice real-time speaking using voice mic or text with bilingual guidance.'}
          </p>
        </div>

        {/* Module 4: Interview Prep */}
        <div
          onClick={() => goToPage('interview')}
          style={{
            background: '#FFFFFF',
            border: '2px solid #C6F6D5',
            borderRadius: '16px',
            padding: '22px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '10px' }}>💼</div>
          <h4 style={{ margin: '0 0 6px 0', color: '#38A169', fontSize: '18px' }}>Interview Prep</h4>
          <p style={{ margin: 0, color: '#718096', fontSize: '13px', lineHeight: '1.5' }}>
            {showMarathi ? 'वर्तणूक, तांत्रिक, डोमेन आणि पगाराच्या वाटाघाटी (Behavioral, Technical, Domain & Negotiations) सराव.' : 'Practice Behavioral, Technical, Domain, and Salary Negotiation questions.'}
          </p>
        </div>

      </div>

      {/* Progress Section */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#2D3748', fontSize: '18px' }}>📊 Skills Progress (कौशल्य प्रगती)</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
              <span>📖 Reading (वाचन)</span>
              <span style={{ fontWeight: 'bold' }}>{skills.reading}%</span>
            </div>
            <div style={{ width: '100%', height: '10px', background: '#EDF2F7', borderRadius: '5px' }}>
              <div style={{ width: `${skills.reading}%`, height: '100%', background: '#DD6B20', borderRadius: '5px' }}></div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
              <span>✍️ Writing (लेखन)</span>
              <span style={{ fontWeight: 'bold' }}>{skills.writing}%</span>
            </div>
            <div style={{ width: '100%', height: '10px', background: '#EDF2F7', borderRadius: '5px' }}>
              <div style={{ width: `${skills.writing}%`, height: '100%', background: '#3182CE', borderRadius: '5px' }}></div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
              <span>🎙️ Speaking (बोलणे)</span>
              <span style={{ fontWeight: 'bold' }}>{skills.speaking}%</span>
            </div>
            <div style={{ width: '100%', height: '10px', background: '#EDF2F7', borderRadius: '5px' }}>
              <div style={{ width: `${skills.speaking}%`, height: '100%', background: '#805AD5', borderRadius: '5px' }}></div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
              <span>💼 Interview Skills</span>
              <span style={{ fontWeight: 'bold' }}>{skills.interview}%</span>
            </div>
            <div style={{ width: '100%', height: '10px', background: '#EDF2F7', borderRadius: '5px' }}>
              <div style={{ width: `${skills.interview}%`, height: '100%', background: '#38A169', borderRadius: '5px' }}></div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

export default Dashboard;