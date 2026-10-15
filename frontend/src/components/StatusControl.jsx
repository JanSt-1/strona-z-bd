import React from 'react';
import StatusBadge from './StatusBadge';
import ShipControl from './ShipControl';

export default function StatusControl({
  ticket,
  user,
  onUpdateStatus,
  onOpenRepairModal
}) {
  const role = user?.role || 'pracownik';
  const curStatus = ticket.status || 'nowe';

  return (
    <div className="flex flex-col gap-2 items-start">
      <StatusBadge status={curStatus} />

      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Rola: PRACOWNIK */}
        {role === 'pracownik' && (
          <>
            {curStatus === 'nowe' && (
              <button
                type="button"
                onClick={() => onUpdateStatus(ticket.id, 'w_realizacji')}
                title="Rozpocznij realizację tego zgłoszenia"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-1 px-2.5 rounded shadow-sm transition-all cursor-pointer"
              >
                Rozpocznij realizację
              </button>
            )}
            {curStatus === 'w_realizacji' && (
              <button
                type="button"
                onClick={() => onOpenRepairModal(ticket)}
                title="Opisz wykonane prace i przekaż do magazynu jako Do wysyłki"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-1 px-2.5 rounded shadow-sm transition-all cursor-pointer"
              >
                Oznacz jako naprawione
              </button>
            )}
            {curStatus === 'do_wysylki' && (
              <span className="text-xs text-purple-700 font-semibold bg-purple-100 px-2 py-0.5 rounded">
                Przekazano do wysyłki
              </span>
            )}
            {curStatus === 'zakończone' && (
              <span className="text-xs text-blue-700 font-semibold bg-blue-100 px-2 py-0.5 rounded">
                ✔ Zakończone
              </span>
            )}
          </>
        )}

        {/* Rola: MAGAZYNIER */}
        {role === 'magazynier' && (
          <>
            {curStatus === 'do_wysylki' && (
              <ShipControl ticket={ticket} onUpdateStatus={onUpdateStatus} />
            )}
            {curStatus === 'zakończone' && (
              <span className="text-xs text-blue-700 font-semibold bg-blue-100 px-2 py-0.5 rounded">
                ✔ Wysłano / Zakończono
              </span>
            )}
          </>
        )}

        {/* Rola: SERWISANT */}
        {role === 'serwisant' && (
          <>
            {curStatus === 'w_realizacji' && (
              <button
                type="button"
                onClick={() => onOpenRepairModal(ticket)}
                title="Opisz wykonane prace i oznacz jako Do wysyłki"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-1 px-2.5 rounded shadow-sm transition-all cursor-pointer"
              >
                Oznacz jako naprawione
              </button>
            )}
          </>
        )}

        {/* Rola: ADMIN */}
        {role === 'admin' && (
          <div className="flex flex-col gap-1.5 w-full">
            {(curStatus === 'nowe' || curStatus === 'w_realizacji') && (
              <button
                type="button"
                onClick={() => onOpenRepairModal(ticket)}
                title="Opisz naprawę i oznacz jako Do wysyłki"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-1 px-2.5 rounded shadow-sm transition-all cursor-pointer"
              >
                Oznacz jako naprawione
              </button>
            )}
            {curStatus === 'do_wysylki' && (
              <div className="my-0.5">
                <ShipControl ticket={ticket} onUpdateStatus={onUpdateStatus} />
              </div>
            )}
            <select
              value={curStatus}
              onChange={(e) => onUpdateStatus(ticket.id, e.target.value)}
              title="Zmień status zgłoszenia"
              className="bg-white border border-slate-300 text-slate-800 rounded px-2 py-1 text-xs outline-none focus:border-emerald-600 cursor-pointer"
            >
              <option value="nowe">nowe</option>
              <option value="w_realizacji">w realizacji</option>
              <option value="do_wysylki" disabled={curStatus !== 'do_wysylki'}>
                {curStatus === 'do_wysylki' ? 'do wysyłki' : 'do wysyłki (użyj: Oznacz jako naprawione)'}
              </option>
              <option value="zakończone">zakończone</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
