import React, { useState } from 'react';
import Modal from './Modal';
import { userApi } from '../api';

export default function PasswordModal({ userToEdit = null, onClose, onPasswordChanged, showAlert }) {
  const isOwnPassword = !userToEdit;
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (isOwnPassword && !currentPassword) {
      return setError('Podaj aktualne hasło.');
    }
    if (!password.trim()) {
      return setError('Podaj nowe hasło.');
    }
    if (password.length < 8) {
      return setError('Hasło musi mieć co najmniej 8 znaków.');
    }
    if (password !== confirm) {
      return setError('Wpisane hasła nie są identyczne.');
    }

    setLoading(true);
    try {
      const data = isOwnPassword
        ? await userApi.changeOwnPassword({ currentPassword, newPassword: password.trim() })
        : await userApi.resetPassword(userToEdit.id, password.trim());

      if (!data) return;

      showAlert(
        data.message ||
          (isOwnPassword
            ? 'Twoje hasło zostało pomyślnie zmienione.'
            : `Hasło dla użytkownika ${userToEdit.username} zostało zmienione.`),
        'success'
      );
      if (onPasswordChanged) onPasswordChanged();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const title = isOwnPassword ? (
    'Zmiana własnego hasła'
  ) : (
    <>
      Nowe hasło dla konta:{' '}
      <span className="text-primary-dark font-semibold">{userToEdit.username}</span>
    </>
  );

  return (
    <Modal icon={isOwnPassword ? '🔒' : '🔑'} title={title} error={error} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isOwnPassword && (
          <div>
            <label className="block text-ink font-semibold text-sm mb-1.5">Aktualne hasło *</label>
            <input
              type="password"
              required
              autoFocus
              placeholder="Wpisz dotychczasowe hasło..."
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-card text-ink border border-line rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}
        <div>
          <label className="block text-ink font-semibold text-sm mb-1.5">
            Nowe hasło (min. 8 znaków) *
          </label>
          <input
            type="password"
            required
            minLength={8}
            autoFocus={!isOwnPassword}
            placeholder="Wpisz nowe hasło (min. 8 znaków)..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-card text-ink border border-line rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Anuluj
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Zapisywanie...' : isOwnPassword ? 'Zmień hasło' : 'Zapisz nowe hasło'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
