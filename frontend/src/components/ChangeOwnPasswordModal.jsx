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
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-line">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <span>🔒</span>
            <span>Zmiana własnego hasła</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-danger hover:text-danger text-xl font-bold p-1 leading-none transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/40 text-danger p-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-ink font-semibold text-sm mb-1.5">
              Aktualne hasło *
            </label>
            <input
              type="password"
              required
              placeholder="Wpisz dotychczasowe hasło..."
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
              className="w-full bg-card text-ink border border-line rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-ink font-semibold text-sm mb-1.5">
              Nowe hasło (min. 8 znaków) *
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="Wpisz nowe hasło (min. 8 znaków)..."
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-card text-ink border border-line rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-ink font-semibold text-sm mb-1.5">
              Powtórz nowe hasło *
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="Powtórz nowe hasło..."
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-card text-ink border border-line rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary"
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
