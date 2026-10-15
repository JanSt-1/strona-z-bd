import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { userApi } from '../api';

export default function AdminPasswordModal({
  userToEdit,
  onClose,
  onPasswordChanged,
  showAlert
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (!userToEdit) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError('Podaj nowe hasło.');
      return;
    }
    if (password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków.');
      return;
    }
    if (password !== confirm) {
      setError('Wpisane hasła nie są identyczne.');
      return;
    }

    setLoading(true);
    try {
      const data = await userApi.resetPassword(userToEdit.id, password.trim());
      if (!data) return;

      showAlert(
        data.message || `Hasło dla użytkownika ${userToEdit.username} zostało zmienione.`,
        'success'
      );
      onPasswordChanged();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card max-w-md">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-emerald-400/30">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🔑</span>
            <span>
              Nowe hasło dla konta:{' '}
              <span className="text-emerald-300 font-semibold">{userToEdit.username}</span>
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-red-400 hover:text-red-200 text-xl font-bold p-1 leading-none transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white font-semibold text-sm mb-1.5">
              Nowe hasło (min. 8 znaków) *
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="Wpisz nowe hasło (min. 8 znaków)..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="w-full bg-white text-slate-900 border border-emerald-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-white font-semibold text-sm mb-1.5">
              Powtórz nowe hasło *
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="Powtórz nowe hasło..."
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-white text-slate-900 border border-emerald-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-reset"
              onClick={onClose}
              disabled={loading}
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Zapisywanie...' : 'Zapisz nowe hasło'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
