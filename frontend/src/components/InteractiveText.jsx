import React, { useState } from 'react';

const DICTIONARY = {
  behavioral: { mr: 'वर्तणूक / वर्तन विषयक', hi: 'व्यवहार संबंधी' },
  technical: { mr: 'तांत्रिक / तंत्रज्ञानाशी संबंधित', hi: 'तकनीकी' },
  negotiations: { mr: 'बोलणी / वाटाघाटी', hi: 'मोल-भाव / बातचीत' },
  conflict: { mr: 'वाद / मतभेद', hi: 'विवाद / टकराव' },
  salary: { mr: 'पगार / वेतन', hi: 'वेतन / तनख्वाह' },
  expectation: { mr: 'अपेक्षा', hi: 'अपेक्षा' },
  experience: { mr: 'अनुभव', hi: 'अनुभव' },
  strength: { mr: 'सामर्थ्य / ताकद', hi: 'ताकत' },
  weakness: { mr: 'कमकुवतपणा / त्रुटी', hi: 'कमजोरी' },
  project: { mr: 'प्रकल्प / काम', hi: 'परियोजना' },
  leadership: { mr: 'नेतृत्व गुण', hi: 'नेतृत्व' },
  deadline: { mr: 'अंतिम मुदत', hi: 'समय सीमा' }
};

export default function InteractiveText({ text, fontSize = '16px', lineHeight = '1.8' }) {
  const [selectedWord, setSelectedWord] = useState(null);

  if (!text) return null;

  const words = text.split(' ');

  const handleWordClick = (word) => {
    const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (!clean) return;

    const lookup = DICTIONARY[clean] || {
      mr: `${clean} (मराठी अर्थ)`,
      hi: `${clean} (हिंदी अर्थ)`
    };

    setSelectedWord({
      original: word.replace(/[^a-zA-Z]/g, ''),
      mr: lookup.mr,
      hi: lookup.hi
    });
  };

  return (
    <div>
      <div style={{ fontSize, lineHeight, color: '#2D3748' }}>
        {words.map((w, idx) => (
          <span
            key={idx}
            onClick={() => handleWordClick(w)}
            style={{
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: '4px',
              display: 'inline-block',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => (e.target.style.background = '#FEFCBF')}
            onMouseOut={(e) => (e.target.style.background = 'transparent')}
          >
            {w}{' '}
          </span>
        ))}
      </div>

      {selectedWord && (
        <div style={{
          marginTop: '12px',
          background: '#FFFFF0',
          border: '2px solid #ECC94B',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
        }}>
          <div>
            <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#744210' }}>
              🔤 {selectedWord.original}
            </span>
            <div style={{ fontSize: '13px', marginTop: '4px', color: '#2D3748' }}>
              🚩 <strong>मराठी:</strong> {selectedWord.mr} &nbsp;|&nbsp; 🚩 <strong>हिंदी:</strong> {selectedWord.hi}
            </div>
          </div>
          <button
            onClick={() => setSelectedWord(null)}
            style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#744210' }}
          >
            ✖
          </button>
        </div>
      )}
    </div>
  );
}