import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import PublicTicketForm from './pages/PublicTicketForm';
import LoginForm from './pages/LoginForm';
import Dashboard from './pages/Dashboard';
import { authApi, onUnauthorized, onSessionUpdated } from './api';

const SESSION_KEYS = ['serwis_token', 'serwis_user'];

const ADMIN_URL_KEYS = ['status', 'pracownik', 'worker', 'szukaj', 'search', 'strona', 'page'];

function resolveTabFromUrl(fallbackTab) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'public') return 'public';
  if (params.get('tab') === 'admin' || ADMIN_URL_KEYS.some((k) => params.has(k))) return 'admin';
  return fallbackTab;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
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
            Nieoczekiwany błąd w interfejsie użytkownika.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                this.setState({ hasError: false });
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
  const [activeTab, setActiveTab] = useState(() =>
    resolveTabFromUrl(authApi.getToken() ? 'admin' : 'public')
  );
  const [token, setToken] = useState(() => authApi.getToken());
  const [user, setUser] = useState(() => authApi.getUser());
  // Komunikat na ekranie logowania (wygasła sesja, wylogowanie w innej karcie)
  const [loginNotice, setLoginNotice] = useState(null);

  useEffect(() => {
    const offUnauthorized = onUnauthorized((message) => {
      setToken(null);
      setUser(null);
      if (message) setLoginNotice(message);
    });
    const offSession = onSessionUpdated((newToken, newUser) => {
      setToken(newToken);
      setUser(newUser);
    });
    return () => {
      offUnauthorized();
      offSession();
    };
  }, []);

  // Rola i nazwa użytkownika z bazy (/api/me), a nie z localStorage zapisanego przy logowaniu
  useEffect(() => {
    if (token) authApi.me();
  }, [token]);

  // Inna karta zalogowała innego użytkownika albo wylogowała - ta karta przejmuje jej sesję zamiast pokazywać stary panel
  useEffect(() => {
    function handleStorage(e) {
      if (e.key !== null && !SESSION_KEYS.includes(e.key)) return;
      const newToken = authApi.getToken();
      if (!newToken) {
        setToken(null);
        setUser(null);
        setLoginNotice('Wylogowano w innej karcie przeglądarki.');
        return;
      }
      setToken(newToken);
      setUser(authApi.getUser());
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const handlePopState = () =>
      setActiveTab((prev) => resolveTabFromUrl(prev));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function handleTabChange(newTab) {
    setActiveTab(newTab);
    const url = new URL(window.location.href);
    if (newTab === 'public') {
      url.searchParams.set('tab', 'public');
    } else {
      url.searchParams.delete('tab');
    }
    const query = url.searchParams.toString();
    window.history.pushState({}, '', url.pathname + (query ? `?${query}` : ''));
  }

  function handleLogout(message = null) {
    authApi.clearSession();
    setToken(null);
    setUser(null);
    setLoginNotice(message);
  }

  const isWideDashboard = activeTab !== 'public' && Boolean(token);

  return (
    <div className="min-h-screen flex flex-col bg-page">
      <Header activeTab={activeTab} setActiveTab={handleTabChange} />

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
            // Inny użytkownik lub nowa rola = świeży panel (bez przycisków i filtrów poprzedniej sesji)
            <Dashboard key={`${user?.id}:${user?.role}`} user={user} token={token} onLogout={handleLogout} />
          ) : (
            <LoginForm
              notice={loginNotice}
              onLoginSuccess={(newToken, newUser) => {
                setLoginNotice(null);
                setToken(newToken);
                setUser(newUser);
              }}
            />
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
