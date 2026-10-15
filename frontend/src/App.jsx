import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import PublicTicketForm from './pages/PublicTicketForm';
import LoginForm from './pages/LoginForm';
import Dashboard from './pages/Dashboard';
import { authApi, onUnauthorized } from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState('public');
  const [token, setToken] = useState(() => authApi.getToken());
  const [user, setUser] = useState(() => authApi.getUser());

  useEffect(() => {
    // Automatyczne wylogowanie przy 401 Unauthorized z backendu
    const unsubscribe = onUnauthorized(() => {
      setToken(null);
      setUser(null);
    });
    return unsubscribe;
  }, []);

  function handleLoginSuccess(newToken, newUser) {
    setToken(newToken);
    setUser(newUser);
  }

  function handleLogout() {
    authApi.clearSession();
    setToken(null);
    setUser(null);
  }

  const isWideDashboard = activeTab !== 'public' && Boolean(token);

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <main
        className={`w-full transition-all duration-300 ${
          isWideDashboard
            ? 'max-w-[98%] mx-auto px-2 md:px-6 pb-12'
            : 'max-w-5xl mx-auto px-4 pb-12'
        }`}
      >
        {activeTab === 'public' ? (
          <PublicTicketForm />
        ) : token ? (
          <Dashboard user={user} token={token} onLogout={handleLogout} />
        ) : (
          <LoginForm onLoginSuccess={handleLoginSuccess} />
        )}
      </main>
    </div>
  );
}
