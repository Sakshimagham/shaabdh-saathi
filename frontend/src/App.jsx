// src/App.jsx
import React, { useState, useEffect } from 'react';
import { AppProvider } from './context/AppContext';
import Login from "./pages/Login";
import Dashboard from './pages/Dashboard';
import Reading from './components/Reading';
import Writing from './components/Writing';
import TalkingBot from './components/TalkingBot';
import Interview from './components/Interview';

function AppContent() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('login');

  // Check for stored user session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        setPage('dashboard');
      } catch (err) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    setPage('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setPage('login');
  };

  const goToPage = (pageName) => {
    setPage(pageName);
  };

  if (page === 'login' || !user) {
    return <Login onLogin={handleLogin} />;
  }

  if (page === 'reading') {
    return <Reading user={user} onBack={() => goToPage('dashboard')} />;
  }

  if (page === 'writing') {
    return <Writing user={user} onBack={() => goToPage('dashboard')} />;
  }

  if (page === 'speaking' || page === 'talkingbot' || page === 'bot') {
    return <TalkingBot user={user} onBack={() => goToPage('dashboard')} />;
  }

  if (page === 'interview' || page === 'interviewprep') {
    return <Interview user={user} onBack={() => goToPage('dashboard')} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} goToPage={goToPage} />;
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}