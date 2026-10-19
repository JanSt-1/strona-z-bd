import React, { useState } from 'react';
import Modal from './Modal';

export default function AssignWorkerModal({ ticket, workers = [], onClose, onAssign }) {
  const [selectedWorkerId, setSelectedWorkerId] = useState(
    ticket?.przypisany_pracownik_id ? String(ticket.przypisany_pracownik_id) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!ticket) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onAssign(ticket.id, selectedWorkerId);
      onClose();
    } catch (err) {
      setError(err.message || 'Wystąpił błąd podczas przypisywania pracownika.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal icon="👤" title={`Przypisz pracownika — #${ticket.id}`} error={error} onClose={onClose}>
      <div className="bg-page border border-line text-ink p-3 rounded-lg mb-4 text-xs space-y-1">
        <div>
          <strong>Klient:</strong> {ticket.imie} {ticket.nazwisko}{' '}
          {ticket.nazwa_firmy ? `(${ticket.nazwa_firmy})` : ''}
        </div>
        <div>
          <strong>Produkt:</strong> {ticket.przedmiot_zgloszenia || '—'}
        </div>
        <div>
          <strong>Aktualny status:</strong>{' '}
          <span className="font-semibold text-primary-dark">{ticket.status}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="workerSelect" className="block font-semibold text-ink text-sm mb-1.5">
            Wybierz osobę do realizacji naprawy *
          </label>
          <select
            id="workerSelect"
            autoFocus
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            className="w-full bg-card text-ink border border-line rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
          >
            <option value="">— Brak (Cofnij przypisanie) —</option>
            {workers
              .filter((w) => w.role === 'pracownik' || w.role === 'serwisant' || w.role === 'admin')
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.username} ({w.role})
                </option>
              ))}
          </select>
          <small className="block text-muted text-xs mt-1.5 leading-normal">
            {ticket.status === 'nowe'
              ? 'Przypisanie pracownika lub serwisanta rozpoczyna realizację i zmienia status na "W realizacji". Magazynier widzi zlecenie automatycznie po zakończeniu naprawy.'
              : 'Zlecenie zostanie przypisane wybranej osobie do naprawy.'}
          </small>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary text-xs" onClick={onClose} disabled={saving}>
            Anuluj
          </button>
          <button type="submit" disabled={saving} className="btn-primary text-xs">
            {saving ? 'Zapisywanie...' : 'Zatwierdź przypisanie'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
