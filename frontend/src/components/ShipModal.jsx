import React, { useState } from 'react';
import Modal from './Modal';

export default function ShipModal({ ticket, mode = 'ship', onClose, onShip, onSave }) {
  const isEditOnly = mode === 'edit';
  const [numer, setNumer] = useState(ticket?.numer_listu || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);
  // Zlecenie zmienił w międzyczasie ktoś inny (409) - ponowne zatwierdzenie nie ma sensu, zostaje tylko zamknięcie
  const [conflict, setConflict] = useState(false);

  if (!ticket) return null;

  const trimmed = numer.trim();
  const isEmpty = !isEditOnly && !trimmed;
  const isTooLong = trimmed.length > 100;
  const showErrorEmpty = touched && isEmpty;

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    setError(null);

    if (isEmpty) {
      return setError('Podanie numeru listu przewozowego jest obowiązkowe przy wysyłce.');
    }
    if (isTooLong) {
      return setError('Numer listu nie może przekraczać 100 znaków.');
    }

    setSaving(true);
    try {
      const handler = isEditOnly ? onSave : onShip;
      await handler(ticket.id, trimmed);
      onClose();
    } catch (err) {
      setError(err.message || 'Wystąpił błąd podczas zapisywania numeru listu.');
      if (err.status === 409) setConflict(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      icon="📦"
      title={
        isEditOnly
          ? `Numer listu przewozowego — #${ticket.id}`
          : `Oznacz jako wysłane — #${ticket.id}`
      }
      error={error}
      onClose={onClose}
    >
      {!isEditOnly && (
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
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="shippingTrackingNumber"
            className="block font-semibold text-ink text-sm mb-1.5"
          >
            {isEditOnly
              ? 'Numer listu przewozowego / przesyłki (maks. 100 znaków)'
              : 'Numer listu przewozowego (np. DPD, DHL, InPost) *'}
          </label>
          <input
            id="shippingTrackingNumber"
            type="text"
            autoFocus
            disabled={conflict}
            required={!isEditOnly}
            maxLength={100}
            placeholder="np. DPD0123456789PL, 628001234567..."
            value={numer}
            onChange={(e) => setNumer(e.target.value)}
            onBlur={() => setTouched(true)}
            className={`w-full bg-card text-ink border rounded-lg p-2.5 text-sm outline-none transition-colors ${
              showErrorEmpty || isTooLong
                ? 'border-danger focus:ring-2 focus:ring-danger/30'
                : 'border-line focus:ring-2 focus:ring-primary'
            }`}
          />
          <div className="flex justify-between items-center text-xs mt-1">
            <span className="text-danger font-medium">
              {showErrorEmpty && 'Numer listu jest wymagany.'}
              {isTooLong && 'Maksymalnie 100 znaków.'}
            </span>
            <span className={`ml-auto font-normal ${isTooLong ? 'text-danger font-semibold' : 'text-muted'}`}>
              {trimmed.length}/100
            </span>
          </div>
          {!isEditOnly && (
            <small className="block text-muted text-xs mt-1.5 leading-normal">
              Po zatwierdzeniu status zlecenia zostanie zmieniony na "Zakończone" z zarejestrowaną bieżącą datą i godziną wysłania.
            </small>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary text-xs" onClick={onClose} disabled={saving}>
            {conflict ? 'Zamknij' : 'Anuluj'}
          </button>
          {!conflict && (
            <button
              type="submit"
              disabled={saving || isEmpty || isTooLong}
              className="btn-primary text-xs"
            >
              {saving ? 'Zapisywanie...' : isEditOnly ? 'Zapisz numer listu' : 'Oznacz jako wysłane'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
