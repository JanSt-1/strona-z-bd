import React, { useState } from 'react';
import Modal from './Modal';
import StatusBadge from './StatusBadge';
import { STATUS_LABELS } from '../constants';

export default function RollbackStatusModal({
  ticket,
  rollbackActions = [],
  onClose,
  onConfirm
}) {
  const [targetStatus, setTargetStatus] = useState(
    rollbackActions[0]?.na_status || 'w_realizacji'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!ticket) return null;

  const currentStatus = ticket.status;
  const isTargetBeforeZakonczone = targetStatus !== 'zakończone' && currentStatus === 'zakończone';
  const isTargetBeforeDoWysylki =
    (targetStatus === 'nowe' || targetStatus === 'w_realizacji') &&
    (currentStatus === 'do_wysylki' || currentStatus === 'zakończone');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!targetStatus) {
      return setError('Wybierz status, do którego chcesz cofnąć zlecenie.');
    }

    setSubmitting(true);
    try {
      await onConfirm(ticket.id, targetStatus);
      onClose();
    } catch (err) {
      setError(err.message || 'Wystąpił błąd podczas cofania statusu.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      icon="↩"
      title={`Cofnij status zgłoszenia #${ticket.id}`}
      maxWidth="max-w-lg"
      error={error}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-page border border-line rounded-lg p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted font-medium">Aktualny etap zlecenia:</span>
            <StatusBadge status={currentStatus} />
          </div>
          <div>
            <span className="text-muted font-medium">Klient: </span>
            <span className="font-semibold text-ink">
              {ticket.imie} {ticket.nazwisko}
            </span>
          </div>
          <div>
            <span className="text-muted font-medium">Przedmiot: </span>
            <span className="font-semibold text-ink">{ticket.przedmiot_zgloszenia}</span>
          </div>
        </div>

        <div>
          {rollbackActions.length === 1 ? (
            <div className="block font-semibold text-ink text-sm mb-1.5">Status docelowy:</div>
          ) : (
            <label htmlFor="targetStatusSelect" className="block font-semibold text-ink text-sm mb-1.5">
              Wybierz status docelowy:
            </label>
          )}
          {rollbackActions.length === 1 ? (
            <div className="p-3 bg-page border border-line rounded-lg text-sm font-semibold text-ink flex items-center gap-2">
              <span aria-hidden="true">&rarr;</span>
              <span>{STATUS_LABELS[rollbackActions[0].na_status] || rollbackActions[0].na_status}</span>
            </div>
          ) : (
            <select
              id="targetStatusSelect"
              data-autofocus
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value)}
              className="w-full bg-card text-ink border border-line rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
            >
              {rollbackActions.map((rb) => (
                <option key={rb.na_status} value={rb.na_status}>
                  {STATUS_LABELS[rb.na_status] || rb.na_status}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="p-3.5 rounded-lg border border-danger/40 bg-danger/10 text-ink text-xs space-y-1.5">
          <div className="font-bold text-danger flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Wymagane potwierdzenie administratora</span>
          </div>
          <p className="leading-relaxed">
            Cofnięcie statusu wpłynie na dane zarejestrowane w późniejszych etapach:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-muted">
            {isTargetBeforeZakonczone && (
              <li>
                <strong className="text-danger">Wysyłka:</strong> Zostanie usunięty numer listu przewozowego oraz data wysłania.
              </li>
            )}
            {isTargetBeforeDoWysylki && (
              <li>
                <strong className="text-danger">Naprawa:</strong> Opis wykonanej naprawy zostanie wyczyszczony ze zlecenia (jego treść zostanie trwale zarchiwizowana we wpisie historii audytowej).
              </li>
            )}
            <li>
              Zdarzenie cofnięcia statusu zostanie zarejestrowane w historii audytowej zgłoszenia z Twoim loginem.
            </li>
          </ul>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary text-xs" onClick={onClose} disabled={submitting}>
            Anuluj
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-danger text-xs inline-flex items-center gap-1"
          >
            {submitting ? 'Cofanie...' : 'Potwierdź cofnięcie statusu'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
