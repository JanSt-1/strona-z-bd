import React, { useState } from 'react';
import { authApi } from '../api';
import Alert from '../components/Alert';

export default function LoginForm({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setAlert(null);

    try {
      const data = await authApi.login(username, password);
      authApi.setSession(data.token, data.user);
      onLoginSuccess(data.token, data.user);
    } catch (err) {
      setAlert({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-card max-w-md mx-auto my-12">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Logowanie do panelu</h2>
        <p className="text-xs text-slate-800">
          Dostęp wyłącznie dla uprawnionych pracowników serwisu
        </p>
      </div>

      <Alert alert={alert} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="loginUsername" className="app-label">
            Nazwa użytkownika
          </label>
          <input
            type="text"
            id="loginUsername"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="app-input"
            placeholder="Wpisz login..."
          />
        </div>

        <div>
          <label htmlFor="loginPassword" className="app-label">
            Hasło
          </label>
          <input
            type="password"
            id="loginPassword"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="app-input"
            placeholder="Wpisz hasło..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full mt-2 cursor-pointer"
        >
          {loading ? 'Logowanie...' : 'Zaloguj się'}
        </button>
      </form>
    </div>
  );
}
