import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { modalDraftKey, readDraft, writeDraft, clearDraft } from '../szkice';

export default function ShipModal({ ticket, userId, mode = 'ship', onClose, onShip, onSave }) {
  const isEditOnly = mode === 'edit';
  const savedNumer = ticket?.numer_listu || '';
  const draftKey = modalDraftKey(isEditOnly ? 'tracking' : 'ship', userId, ticket?.id);
  // Szkic z sessionStorage ma pierwszeństwo - np. po wygaśnięciu sesji w trakcie wpisywania
  const [numer, setNumer] = useState(() => readDraft(draftKey) ?? savedNumer);
  const [hasDraft] = useState(() => Boolean(readDraft(draftKey)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);
  // Zlecenie zmienił w międzyczasie ktoś inny (409) - ponowne zatwierdzenie nie ma sensu, zostaje tylko zamknięcie
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    // Szkic tylko wtedy, gdy wpis różni się od numeru zapisanego w zleceniu
    writeDraft(draftKey, numer.trim() && numer !== savedNumer ? numer : '');
  }, [draftKey, numer, savedNumer]);

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
      // Okno zamyka runTicketMutation po sukcesie; false = sesja wygasła, szkic zostaje do przywrócenia
      const saved = await handler(ticket.id, trimmed);
      if (saved) clearDraft(draftKey);
    } catch (err) {
      setError(err.message || 'Wystąpił błąd podczas zapisywania numeru listu.');
      if (err.status === 409) {
        // Zlecenie obsłużył już ktoś inny - wpisany numer nie zostanie zapisany, więc szkic jest zbędny
        setConflict(true);
        clearDraft(draftKey);
      }
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
            data-autofocus
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
          {hasDraft && !conflict && (
            <small className="block text-primary-dark text-xs mt-1.5 font-medium">
              Przywrócono niezapisany numer listu. Szkic jest przechowywany w tej karcie do czasu zapisania.
            </small>
          )}
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
