import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function RepairModal({ ticket, onClose, onSubmit }) {
  const [opis, setOpis] = useState(ticket?.opis_naprawy || '');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

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
    setModalError(null);
    if (!opis.trim()) {
      setModalError('Podaj opis wykonanych prac naprawczych.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(ticket.id, opis.trim());
    } catch (err) {
      setModalError(err.message || 'Wystąpił błąd podczas zatwierdzania naprawy.');
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-line">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <span>🔧</span>
            <span>Raport z naprawy — Zgłoszenie #{ticket.id}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-danger hover:text-danger text-xl font-bold p-1 leading-none transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="bg-page border border-line text-ink p-3.5 rounded-lg mb-4 text-sm space-y-1">
          <div>
            <strong>Klient:</strong> {ticket.imie} {ticket.nazwisko}{' '}
            {ticket.nazwa_firmy ? `(${ticket.nazwa_firmy})` : ''}
          </div>
          <div>
            <strong>Produkt:</strong> {ticket.przedmiot_zgloszenia}{' '}
            {ticket.numer_seryjny ? `| SN: ${ticket.numer_seryjny}` : ''}
          </div>
          <div className="mt-1 text-muted whitespace-pre-wrap break-words leading-relaxed text-xs">
            <strong>Zgłoszona usterka:</strong> {ticket.opis_usterki}
          </div>
        </div>

        {modalError && (
          <div className="bg-danger/10 border border-danger/40 text-danger p-3 rounded-lg text-sm mb-4">
            {modalError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="repairDescription"
              className="block font-semibold text-ink text-sm mb-1.5"
            >
              Opis wykonanych prac (co zostało zrobione / wymienione) *
            </label>
            <textarea
              autoFocus
              id="repairDescription"
              required
              rows={6}
              placeholder="np. Wymieniono moduł zasilacza, przetestowano ekran dotykowy, wgrano aktualizację firmware..."
              value={opis}
              onChange={(e) => setOpis(e.target.value)}
              className="w-full bg-card text-ink border border-line rounded-lg p-3 text-sm resize-y outline-none focus:ring-2 focus:ring-primary"
            />
            <small className="block text-muted text-xs mt-1.5 leading-normal">
              Wpis zostanie automatycznie opatrzony bieżącą datą i czasem serwera. Po zatwierdzeniu zlecenie natychmiast pojawi się u magazynierów ze statusem "Do wysyłki".
            </small>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? 'Zapisywanie...' : '✔ Zatwierdź naprawę i przekaż do wysyłki'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
