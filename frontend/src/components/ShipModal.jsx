import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function ShipModal({ ticket, onClose, onShip }) {
  const [numer, setNumer] = useState(ticket?.numer_listu || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!ticket) return null;

  const trimmed = numer.trim();
  const isEmpty = !trimmed;
  const isTooLong = trimmed.length > 100;
  const showErrorEmpty = touched && isEmpty;
  const showErrorTooLong = isTooLong;

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    setError(null);

    if (isEmpty) {
      setError('Podanie numeru listu przewozowego jest obowiązkowe przy wysyłce.');
      return;
    }
    if (isTooLong) {
      setError('Numer listu nie może przekraczać 100 znaków.');
      return;
    }

    setSaving(true);
    try {
      await onShip(ticket.id, trimmed);
      onClose();
    } catch (err) {
      setError(err.message || 'Wystąpił błąd podczas zatwierdzania wysyłki.');
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
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-line">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <span>📦</span>
            <span>Oznacz jako wysłane — #{ticket.id}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-danger hover:text-danger text-xl font-bold p-1 leading-none transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Podsumowanie danych do wysyłki */}
        <div className="bg-page border border-line text-ink p-3 rounded-lg mb-4 text-xs space-y-1">
          <div>
            <strong>Odbiorca:</strong> {ticket.imie} {ticket.nazwisko}{' '}
            {ticket.nazwa_firmy ? `(${ticket.nazwa_firmy})` : ''}
          </div>
          <div>
            <strong>Adres doręczenia:</strong> {ticket.adres}, {ticket.kod_pocztowy} {ticket.miasto}
          </div>
          <div>
            <strong>Telefon kontaktowy:</strong> {ticket.numer_telefonu}
          </div>
          <div>
            <strong>Przedmiot:</strong> {ticket.przedmiot_zgloszenia}{' '}
            {ticket.numer_seryjny ? `(SN: ${ticket.numer_seryjny})` : ''}
          </div>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/40 text-danger p-3 rounded-lg text-xs mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="shippingTrackingNumber"
              className="block font-semibold text-ink text-sm mb-1.5"
            >
              Numer listu przewozowego (np. DPD, DHL, InPost) *
            </label>
            <input
              id="shippingTrackingNumber"
              type="text"
              autoFocus
              required
              maxLength={100}
              placeholder="np. DPD0123456789PL, 628001234567..."
              value={numer}
              onChange={(e) => setNumer(e.target.value)}
              onBlur={() => setTouched(true)}
              className={`w-full bg-card text-ink border rounded-lg p-2.5 text-sm outline-none transition-colors ${
                showErrorEmpty || showErrorTooLong
                  ? 'border-danger focus:ring-2 focus:ring-danger/30'
                  : 'border-line focus:ring-2 focus:ring-primary'
              }`}
            />
            <div className="flex justify-between items-center text-xs mt-1">
              <span className="text-danger font-medium">
                {showErrorEmpty && 'Numer listu jest wymagany.'}
                {showErrorTooLong && 'Maksymalnie 100 znaków.'}
              </span>
              <span className={`ml-auto font-normal ${isTooLong ? 'text-danger font-semibold' : 'text-muted'}`}>
                {trimmed.length}/100
              </span>
            </div>
            <small className="block text-muted text-xs mt-1.5 leading-normal">
              Po zatwierdzeniu status zlecenia zostanie zmieniony na "Zakończone" z zarejestrowaną bieżącą datą i godziną wysłania.
            </small>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={onClose}
              disabled={saving}
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={saving || isEmpty || isTooLong}
              className="btn-primary text-xs"
            >
              {saving ? 'Zapisywanie...' : 'Oznacz jako wysłane'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
