import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { STATUS_LABELS } from '../constants';
import { workerApi } from '../api';

export default function AssignWorkerModal({
  ticket,
  workers: initialWorkers = [],
  onClose,
  onAssign,
  onWorkersLoaded
}) {
  const [workersList, setWorkersList] = useState(initialWorkers);
  const isAssigned = Boolean(ticket?.przypisany_pracownik_id);
  const [selectedWorkerId, setSelectedWorkerId] = useState(
    ticket?.przypisany_pracownik_id ? String(ticket.przypisany_pracownik_id) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadWorkers() {
      try {
        const freshWorkers = await workerApi.getWorkers();
        if (isMounted && Array.isArray(freshWorkers)) {
          setWorkersList(freshWorkers);
          onWorkersLoaded?.(freshWorkers);
        }
      } catch (err) {
        console.error('Błąd odświeżania listy pracowników:', err);
      }
    }
    loadWorkers();
    return () => {
      isMounted = false;
    };
  }, [onWorkersLoaded]);

  if (!ticket) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!isAssigned && !selectedWorkerId) {
      setError('Wybierz pracownika do realizacji zlecenia.');
      return;
    }

    if (selectedWorkerId && !workersList.some((w) => String(w.id) === String(selectedWorkerId))) {
      setError('Wybrany pracownik jest zablokowany lub nieaktywny. Wybierz aktywnego pracownika lub cofnij przypisanie.');
      return;
    }

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

  const isAssignedWorkerBlocked =
    selectedWorkerId && !workersList.some((w) => String(w.id) === String(selectedWorkerId));

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
          <span className="font-semibold text-primary-dark">{STATUS_LABELS[ticket.status] || ticket.status}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="workerSelect" className="block font-semibold text-ink text-sm mb-1.5">
            Wybierz osobę do realizacji naprawy {!isAssigned ? '*' : ''}
          </label>
          <select
            id="workerSelect"
            data-autofocus
            value={selectedWorkerId}
            onChange={(e) => {
              setSelectedWorkerId(e.target.value);
              setError(null);
            }}
            className="w-full bg-card text-ink border border-line rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
          >
            {!isAssigned ? (
              <option value="" disabled>
                — Wybierz pracownika z listy —
              </option>
            ) : (
              <option value="">— Brak (Cofnij przypisanie) —</option>
            )}
            {isAssignedWorkerBlocked && (
              <option value={selectedWorkerId} disabled>
                {ticket.przypisany_pracownik_username || 'Dotychczas przypisany pracownik'} (konto zablokowane / nieaktywne)
              </option>
            )}
            {workersList
              .filter((w) => w.role === 'pracownik' || w.role === 'serwisant')
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.username} ({w.role})
                </option>
              ))}
          </select>
          <small className="block text-muted text-xs mt-1.5 leading-normal">
            {ticket.status === 'nowe'
              ? 'Przypisanie pracownika lub serwisanta rozpoczyna realizację i zmienia status na "W realizacji". Magazynier widzi zlecenie automatycznie po zakończeniu naprawy.'
              : isAssigned
              ? 'Możesz zmienić przypisaną osobę lub wybrać "Brak", aby cofnąć przypisanie zlecenia.'
              : 'Zlecenie zostanie przypisane wybranej osobie do naprawy.'}
          </small>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary text-xs" onClick={onClose} disabled={saving}>
            Anuluj
          </button>
          <button
            type="submit"
            disabled={saving || (!isAssigned && !selectedWorkerId)}
            className="btn-primary text-xs"
          >
            {saving
              ? 'Zapisywanie...'
              : isAssigned && !selectedWorkerId
              ? 'Cofnij przypisanie'
              : 'Zatwierdź przypisanie'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
