import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function TrackingNumberModal({ ticket, onClose, onSave }) {
  const [numer, setNumer] = useState(ticket?.numer_listu || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (!ticket) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const trimmed = numer.trim();
    if (trimmed.length > 100) {
      setError('Numer listu nie może być dłuższy niż 100 znaków.');
      return;
    }
    setSaving(true);
    try {
      await onSave(ticket.id, trimmed);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
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
            <span>📦</span>
            <span>Numer listu przewozowego — #{ticket.id}</span>
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
              Numer listu przewozowego / przesyłki (maks. 100 znaków)
            </label>
            <input
              type="text"
              placeholder="Wpisz np. DPD0123456789, 00000123..."
              maxLength={100}
              value={numer}
              onChange={(e) => setNumer(e.target.value)}
              autoFocus
              className="w-full bg-white text-slate-900 border border-emerald-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex justify-end text-xs text-emerald-100 mt-1">
              <span>{numer.length}/100</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-reset"
              onClick={onClose}
              disabled={saving}
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? 'Zapisywanie...' : 'Zapisz numer listu'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
