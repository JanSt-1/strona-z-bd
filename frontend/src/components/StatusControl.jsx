import React from 'react';
import StatusBadge from './StatusBadge';
import { getTicketActionState } from '../constants';

export default function StatusControl({
  ticket,
  user,
  onOpenAssignModal,
  onOpenRepairModal,
  onOpenShipModal,
  onOpenRollbackModal
}) {
  const {
    curStatus,
    rollbackActions,
    isAssignAction,
    isRepairAction,
    isShipAction,
    hasForwardButton
  } = getTicketActionState(ticket, user);

  return (
    <div className="flex flex-col gap-2 items-start">
      <StatusBadge status={curStatus} />

      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Jedna główna akcja kroku w jednym miejscu */}
        {isAssignAction && (
          <button
            type="button"
            onClick={() => onOpenAssignModal(ticket)}
            title="Przypisz zlecenie pracownikowi, aby rozpocząć realizację"
            className="btn-primary py-1 px-2.5 text-xs inline-flex items-center gap-1"
          >
            <span>👤</span>
            <span>Przypisz</span>
          </button>
        )}

        {isRepairAction && (
          <button
            type="button"
            onClick={() => onOpenRepairModal(ticket)}
            title="Opisz wykonane prace i przekaż do magazynu jako Do wysyłki"
            className="btn-primary py-1 px-2.5 text-xs inline-flex items-center gap-1"
          >
            <span>🔧</span>
            <span>Oznacz jako naprawione</span>
          </button>
        )}

        {isShipAction && (
          <button
            type="button"
            onClick={() => onOpenShipModal(ticket)}
            title="Wprowadź numer listu przewozowego i oznacz zlecenie jako wysłane"
            className="btn-primary py-1 px-2.5 text-xs inline-flex items-center gap-1"
          >
            <span>📦</span>
            <span>Oznacz jako wysłane</span>
          </button>
        )}

        {/* Informacje, gdy zalogowana rola nie wykonuje kroku w przód */}
        {!hasForwardButton && (
          <>
            {curStatus === 'nowe' && (
              <span className="text-xs text-muted italic">
                Oczekuje na przypisanie
              </span>
            )}
            {curStatus === 'w_realizacji' && (
              <span className="text-xs text-muted italic">
                {ticket?.przypisany_pracownik_username
                  ? `Realizuje: ${ticket.przypisany_pracownik_username}`
                  : 'Wymaga przypisania pracownika'}
              </span>
            )}
            {curStatus === 'do_wysylki' && (
              <span className="text-xs text-status-wysylki font-semibold bg-status-wysylki/10 px-2 py-0.5 rounded">
                Oczekuje na wysyłkę
              </span>
            )}
            {curStatus === 'zakończone' && (
              <span className="text-xs text-status-zakonczone font-semibold bg-status-zakonczone/10 px-2 py-0.5 rounded">
                ✔ Zakończone
              </span>
            )}
          </>
        )}

        {/* U admina osobno przycisk „Cofnij status” (z potwierdzeniem w dedykowanym modalu) */}
        {user?.role === 'admin' && rollbackActions.length > 0 && (
          <button
            type="button"
            onClick={() => onOpenRollbackModal(ticket, rollbackActions)}
            title="Cofnij status zgłoszenia do wcześniejszego etapu (wymaga potwierdzenia)"
            className="btn-secondary py-1 px-2 text-xs text-muted hover:text-danger hover:border-danger/40 inline-flex items-center gap-1 transition-colors"
          >
            <span>↩</span>
            <span>Cofnij status</span>
          </button>
        )}
      </div>
    </div>
  );
}

