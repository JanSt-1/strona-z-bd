import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import PublicTicketForm from './pages/PublicTicketForm';
import LoginForm from './pages/LoginForm';
import Dashboard from './pages/Dashboard';
import { authApi, onUnauthorized } from './api';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary przechwycił błąd:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-card max-w-lg mx-auto my-12 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">Wystąpił błąd w panelu</h2>
          <p className="text-sm text-muted mb-4">
            {this.state.error?.message || 'Nieoczekiwany błąd w interfejsie użytkownika.'}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Odśwież stronę
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                authApi.clearSession();
                window.location.reload();
              }}
            >
              Wyczyść sesję i zresetuj
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <div className="min-h-screen flex flex-col bg-page">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <main
        className={`w-full transition-all duration-300 ${
          isWideDashboard
            ? 'max-w-[98%] mx-auto px-2 md:px-6 pb-12'
            : 'max-w-5xl mx-auto px-4 pb-12'
        }`}
      >
        <ErrorBoundary>
          {activeTab === 'public' ? (
            <PublicTicketForm />
          ) : token ? (
            <Dashboard user={user} token={token} onLogout={handleLogout} />
          ) : (
            <LoginForm onLoginSuccess={handleLoginSuccess} />
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
