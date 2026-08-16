import React, { useState } from 'react';
import { api } from '../context/AppContext';   //

function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || !contact.trim()) {
      setError('Please enter both name and contact information.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // ✅ Use the api instance (base URL already configured)
      const response = await api.post('/auth/login', {
        name: name.trim(),
        contact: contact.trim()
      });

      const data = response.data;

      const successMsg = isRegister 
        ? `🎉 Account created successfully! Welcome, ${data.name}!` 
        : `✅ Welcome back, ${data.name}!`;

      alert(successMsg);
      
      localStorage.setItem('user', JSON.stringify(data));

      if (onLogin) {
        onLogin(data);
      }

    } catch (err) {
      console.error('API error:', err);
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail);
      } else {
        setError('❌ Unable to connect to server. Please check your internet connection and try again.');
      }
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: '30px 20px', maxWidth: '400px', margin: '40px auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#E65F2B', textAlign: 'center', marginBottom: '5px' }}>Shaabdh Saathi</h1>
      <p style={{ textAlign: 'center', color: '#666', marginBottom: '25px' }}>
        {isRegister ? 'Create a new account to get started.' : 'Welcome back! Please login to continue.'}
      </p>

      <div style={{ display: 'flex', marginBottom: '20px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E65F2B' }}>
        <button
          onClick={() => { setIsRegister(false); setError(''); }}
          style={{
            flex: 1,
            padding: '10px',
            background: !isRegister ? '#E65F2B' : '#fff',
            color: !isRegister ? '#fff' : '#E65F2B',
            border: 'none',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Login
        </button>
        <button
          onClick={() => { setIsRegister(true); setError(''); }}
          style={{
            flex: 1,
            padding: '10px',
            background: isRegister ? '#E65F2B' : '#fff',
            color: isRegister ? '#fff' : '#E65F2B',
            border: 'none',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Register
        </button>
      </div>

      {error && (
        <div style={{ 
          background: '#ffebee', 
          color: '#c62828', 
          padding: '10px 12px', 
          borderRadius: '5px', 
          marginBottom: '15px',
          border: '1px solid #ffcdd2',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      <div>
        <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>Full Name</label>
        <input
          type="text"
          placeholder="Enter your full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ 
            width: '100%', 
            padding: '10px', 
            marginTop: '5px',
            marginBottom: '15px', 
            borderRadius: '5px', 
            border: '1px solid #ccc',
            fontSize: '15px',
            boxSizing: 'border-box'
          }}
        />

        <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>Email or Mobile Number</label>
        <input
          type="text"
          placeholder="Enter email or phone"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          style={{ 
            width: '100%', 
            padding: '10px', 
            marginTop: '5px',
            marginBottom: '20px', 
            borderRadius: '5px', 
            border: '1px solid #ccc',
            fontSize: '15px',
            boxSizing: 'border-box'
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: loading ? '#ccc' : '#E65F2B',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            transition: 'background 0.2s'
          }}
        >
          {loading ? (isRegister ? 'Creating Account...' : 'Logging in...') : (isRegister ? 'Register' : 'Login')}
        </button>
      </div>

      <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#555' }}>
        {isRegister ? (
          <span>
            Already have an account?{' '}
            <button 
              onClick={() => { setIsRegister(false); setError(''); }} 
              style={{ background: 'none', border: 'none', color: '#E65F2B', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
            >
              Login here
            </button>
          </span>
        ) : (
          <span>
            Don't have an account?{' '}
            <button 
              onClick={() => { setIsRegister(true); setError(''); }} 
              style={{ background: 'none', border: 'none', color: '#E65F2B', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
            >
              Register here
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

export default Login;
