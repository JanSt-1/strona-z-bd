import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { modalDraftKey, readDraft, writeDraft, clearDraft } from '../szkice';

export default function RepairModal({ ticket, userId, onClose, onSubmit }) {
  const draftKey = modalDraftKey('repair', userId, ticket?.id);
  // Szkic z sessionStorage ma pierwszeństwo - np. po wygaśnięciu sesji w trakcie pisania
  const [opis, setOpis] = useState(() => readDraft(draftKey) ?? ticket?.opis_naprawy ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [hasDraft] = useState(() => Boolean(readDraft(draftKey)));

  useEffect(() => {
    writeDraft(draftKey, opis.trim() ? opis : '');
  }, [draftKey, opis]);

  if (!ticket) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setModalError(null);
    if (!opis.trim()) {
      return setModalError('Podaj opis wykonanych prac naprawczych.');
    }
    setSubmitting(true);
    try {
      const saved = await onSubmit(ticket.id, opis.trim());
      if (saved) clearDraft(draftKey);
    } catch (err) {
      setModalError(err.message || 'Wystąpił błąd podczas zatwierdzania naprawy.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      icon="🔧"
      title={`Raport z naprawy — Zgłoszenie #${ticket.id}`}
      maxWidth=""
      error={modalError}
      onClose={onClose}
    >
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="repairDescription" className="block font-semibold text-ink text-sm mb-1.5">
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
          {hasDraft && (
            <small className="block text-primary-dark text-xs mt-1.5 font-medium">
              Przywrócono niezapisany szkic opisu. Szkic jest przechowywany w tej karcie do czasu zatwierdzenia naprawy.
            </small>
          )}
          <small className="block text-muted text-xs mt-1.5 leading-normal">
            Wpis zostanie automatycznie opatrzony bieżącą datą i czasem serwera. Po zatwierdzeniu zlecenie natychmiast pojawi się u magazynierów ze statusem "Do wysyłki".
          </small>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Anuluj
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Zapisywanie...' : '✔ Zatwierdź naprawę i przekaż do wysyłki'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
