import React from 'react';
import StatusBadge from './StatusBadge';
import ShipControl from './ShipControl';

export default function StatusControl({
  ticket,
  user,
  onUpdateStatus,
  onOpenRepairModal
}) {
  const curStatus = ticket?.status || 'nowe';
  const actions = Array.isArray(ticket?.dozwolone_akcje) ? ticket.dozwolone_akcje : [];

  const forwardActions = actions.filter((a) => a.typ !== 'cofnij');
  const rollbackActions = actions.filter((a) => a.typ === 'cofnij');

  return (
    <div className="flex flex-col gap-2 items-start">
      <StatusBadge status={curStatus} />

      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Akcje przejścia w przód / specjalne (naprawa, wysyłka, rozpoczęcie) */}
        {forwardActions.map((akcja) => {
          if (akcja.typ === 'wysylka') {
            return (
              <ShipControl
                key={`wysylka-${ticket.id}`}
                ticket={ticket}
                onUpdateStatus={onUpdateStatus}
              />
            );
          }

          if (akcja.typ === 'naprawa') {
            return (
              <button
                key={`naprawa-${ticket.id}`}
                type="button"
                onClick={() => onOpenRepairModal(ticket)}
                title="Opisz wykonane prace i przekaż do magazynu jako Do wysyłki"
                className="btn-primary py-1 px-2.5 text-xs"
              >
                {akcja.etykieta}
              </button>
            );
          }

          return (
            <button
              key={`${akcja.akcja}-${akcja.na_status}-${ticket.id}`}
              type="button"
              onClick={() => onUpdateStatus(ticket.id, akcja.na_status)}
              title={akcja.etykieta}
              className="btn-primary py-1 px-2.5 text-xs"
            >
              {akcja.etykieta}
            </button>
          );
        })}

        {/* Akcje cofania (wyłącznie gdy dozwolone w dozwolone_akcje, np. dla admina) */}
        {rollbackActions.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                onUpdateStatus(ticket.id, e.target.value);
              }
            }}
            title="Cofnij status zgłoszenia"
            className="bg-card border border-line text-ink rounded px-2 py-1 text-xs outline-none focus:border-primary/30 cursor-pointer"
          >
            <option value="" disabled>
              Cofnij status...
            </option>
            {rollbackActions.map((rb) => (
              <option key={rb.na_status} value={rb.na_status}>
                {rb.etykieta}
              </option>
            ))}
          </select>
        )}

        {/* Informacja gdy dla użytkownika brak dostępnych akcji na danym etapie */}
        {actions.length === 0 && (
          <>
            {curStatus === 'zakończone' && (
              <span className="text-xs text-status-zakonczone font-semibold bg-status-zakonczone/10 px-2 py-0.5 rounded">
                ✔ Zakończone
              </span>
            )}
            {curStatus === 'do_wysylki' && (
              <span className="text-xs text-status-wysylki font-semibold bg-status-wysylki/10 px-2 py-0.5 rounded">
                Przekazano do wysyłki
              </span>
            )}
            {curStatus === 'w_realizacji' && (
              <span className="text-xs text-muted italic">
                {ticket?.przypisany_pracownik_username
                  ? `Realizuje: ${ticket.przypisany_pracownik_username}`
                  : 'Wymaga przypisania pracownika'}
              </span>
            )}
            {curStatus === 'nowe' && (
              <span className="text-xs text-muted italic">
                Oczekuje na przypisanie
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

