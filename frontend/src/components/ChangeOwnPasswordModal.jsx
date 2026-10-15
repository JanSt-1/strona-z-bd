import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { userApi } from '../api';

export default function ChangeOwnPasswordModal({ onClose, showAlert }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!currentPassword) {
      setError('Podaj aktualne hasło.');
      return;
    }
    if (!newPassword) {
      setError('Podaj nowe hasło.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Nowe hasło musi mieć co najmniej 8 znaków.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Nowe hasła nie są identyczne.');
      return;
    }

    setLoading(true);
    try {
      const data = await userApi.changeOwnPassword({
        currentPassword,
        newPassword: newPassword.trim()
      });
      if (!data) return;

      showAlert(data.message || 'Twoje hasło zostało pomyślnie zmienione.', 'success');
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
            <span>🔒</span>
            <span>Zmiana własnego hasła</span>
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
              Aktualne hasło *
            </label>
            <input
              type="password"
              required
              placeholder="Wpisz dotychczasowe hasło..."
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
              className="w-full bg-white text-slate-900 border border-emerald-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-white font-semibold text-sm mb-1.5">
              Nowe hasło (min. 8 znaków) *
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="Wpisz nowe hasło (min. 8 znaków)..."
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
              {loading ? 'Zapisywanie...' : 'Zmień hasło'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
