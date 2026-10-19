import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import StatusBadge from './StatusBadge';
import { ticketApi } from '../api';
import { getTicketActionState } from '../constants';

export default function TicketDetailsDrawer({
  ticket,
  user,
  onClose,
  onOpenAssignModal,
  onOpenRepairModal,
  onOpenShipModal,
  onOpenRollbackModal,
  onOpenTrackingModal
}) {
  const [fetchedData, setFetchedData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(Boolean(ticket?.id));

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);

    let isMounted = true;
    if (ticket?.id) {
      ticketApi
        .getTicketById(ticket.id)
        .then((res) => {
          if (isMounted && res) {
            setFetchedData(res);
          }
        })
        .catch(() => {
          // Podstawowe dane zgłoszenia pozostają widoczne
        })
        .finally(() => {
          if (isMounted) setLoadingHistory(false);
        });
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      isMounted = false;
    };
  }, [ticket?.id, onClose]);

  if (!ticket) return null;
  const currentTicket = fetchedData ? { ...ticket, ...fetchedData } : ticket;
  const history = Array.isArray(fetchedData?.historia) ? fetchedData.historia : [];
  const {
    curStatus,
    rollbackActions,
    isAssignAction,
    isRepairAction,
    isShipAction
  } = getTicketActionState(currentTicket, user);

  function getActionIcon(akcja) {
    switch (akcja) {
      case 'utworzenie':
        return '📝';
      case 'przypisanie':
        return '👤';
      case 'naprawa':
        return '🔧';
      case 'wysyłka':
        return '📦';
      case 'zmiana_numeru_listu':
        return '🚚';
      case 'zmiana_statusu':
        return '🔄';
      case 'usunięcie':
        return '🗑️';
      default:
        return '⚡';
    }
  }

  return createPortal(
    <div
      className="drawer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Pasek nagłówka panelu bocznego */}
        <div className="p-4 sm:p-5 border-b border-line bg-card flex items-start justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xl font-bold text-ink">
                Zgłoszenie #{ticket.id}
              </span>
              <StatusBadge status={curStatus} />
            </div>
            <div className="text-xs text-muted mt-1">
              Data przyjęcia: {ticket.created_at ? new Date(ticket.created_at).toLocaleString('pl-PL') : '—'}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink text-xl font-bold p-1 leading-none rounded-md hover:bg-page transition-colors cursor-pointer"
            title="Zamknij panel (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Pasek pojedynczej akcji (Jedna akcja = jeden przycisk w jednym miejscu) */}
        <div className="px-4 sm:px-5 py-3 bg-page border-b border-line flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isAssignAction && onOpenAssignModal && (
              <button
                type="button"
                onClick={() => onOpenAssignModal(currentTicket)}
                title="Przypisz osobę do naprawy, aby rozpocząć realizację"
                className="btn-primary py-1 px-3 text-xs inline-flex items-center gap-1.5"
              >
                <span>👤</span>
                <span>Przypisz</span>
              </button>
            )}

            {isRepairAction && onOpenRepairModal && (
              <button
                type="button"
                onClick={() => onOpenRepairModal(currentTicket)}
                title="Opisz wykonane prace naprawcze i przekaż do wysyłki"
                className="btn-primary py-1 px-3 text-xs inline-flex items-center gap-1.5"
              >
                <span>🔧</span>
                <span>Oznacz jako naprawione</span>
              </button>
            )}

            {isShipAction && onOpenShipModal && (
              <button
                type="button"
                onClick={() => onOpenShipModal(currentTicket)}
                title="Wprowadź numer listu przewozowego i sfinalizuj wysyłkę"
                className="btn-primary py-1 px-3 text-xs inline-flex items-center gap-1.5"
              >
                <span>📦</span>
                <span>Oznacz jako wysłane</span>
              </button>
            )}

            {!isAssignAction && !isRepairAction && !isShipAction && (
              <span className="text-xs text-muted font-medium">
                {curStatus === 'nowe' && 'Oczekuje na przypisanie'}
                {curStatus === 'w_realizacji' && (currentTicket.przypisany_pracownik_username ? `Realizuje: ${currentTicket.przypisany_pracownik_username}` : 'W realizacji')}
                {curStatus === 'do_wysylki' && 'Oczekuje na wysyłkę w magazynie'}
                {curStatus === 'zakończone' && '✔ Zlecenie zrealizowane'}
              </span>
            )}
          </div>

          {user?.role === 'admin' && rollbackActions.length > 0 && onOpenRollbackModal && (
            <button
              type="button"
              onClick={() => onOpenRollbackModal(currentTicket, rollbackActions)}
              title="Cofnij status zgłoszenia do wcześniejszego etapu"
              className="btn-secondary py-1 px-2.5 text-xs text-muted hover:text-danger hover:border-danger/40 inline-flex items-center gap-1 transition-colors"
            >
              <span>↩</span>
              <span>Cofnij status</span>
            </button>
          )}
        </div>

        {/* Przewijana treść panelu */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Sekcja 1: Dane klienta i kontakt */}
          <div className="bg-page rounded-xl p-4 border border-line space-y-3">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <span>👤</span>
              <span>Klient i rozliczenie</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Osoba kontaktowa</span>
                <span className="font-semibold text-ink text-sm">
                  {currentTicket.imie} {currentTicket.nazwisko}
                </span>
                {currentTicket.nazwa_firmy && (
                  <div className="text-primary-dark font-semibold mt-0.5">
                    {currentTicket.nazwa_firmy}
                  </div>
                )}
              </div>

              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Kontakt</span>
                <div className="font-medium text-ink">
                  {currentTicket.numer_telefonu ? (
                    <a href={`tel:${currentTicket.numer_telefonu}`} className="hover:underline">
                      📞 {currentTicket.numer_telefonu}
                    </a>
                  ) : '—'}
                </div>
                {currentTicket.telefon_stacjonarny && (
                  <div className="font-medium text-ink mt-0.5">
                    <a href={`tel:${currentTicket.telefon_stacjonarny}`} className="hover:underline">
                      ☎️ {currentTicket.telefon_stacjonarny} <span className="text-muted text-[0.7rem] font-normal">(stacjonarny)</span>
                    </a>
                  </div>
                )}
                <div className="text-muted mt-0.5">
                  {currentTicket.email ? (
                    <a href={`mailto:${currentTicket.email}`} className="hover:underline">
                      ✉ {currentTicket.email}
                    </a>
                  ) : '—'}
                </div>
              </div>

              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Adres wysyłki</span>
                <div className="font-medium text-ink">
                  {currentTicket.adres || '—'}
                </div>
                {(currentTicket.kod_pocztowy || currentTicket.miasto) && (
                  <div className="text-muted">
                    {currentTicket.kod_pocztowy} {currentTicket.miasto}
                  </div>
                )}
              </div>

              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Dokument sprzedaży / NIP</span>
                <div className="font-medium text-ink">
                  Nr faktury / paragonu: <strong>{currentTicket.numer_fv || '—'}</strong>
                </div>
                {currentTicket.nip && (
                  <div className="text-ink mt-0.5">
                    NIP: <span className="font-semibold">{currentTicket.nip}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sekcja 2: Urządzenie i treść usterki */}
          <div className="bg-card rounded-xl p-4 border border-line space-y-3">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <span>🖥️</span>
              <span>Urządzenie i zgłoszona usterka</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Produkt</span>
                <span className="font-semibold text-primary-dark text-sm">
                  {currentTicket.przedmiot_zgloszenia || 'Nie określono'}
                </span>
              </div>
              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Numer seryjny (S/N)</span>
                <span className="font-medium text-ink">
                  {currentTicket.numer_seryjny || 'Brak S/N'}
                </span>
              </div>
              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Data zakupu</span>
                <span className="font-medium text-ink">
                  {currentTicket.data_zakupu || 'Nie podano'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-line">
              <span className="text-muted block text-[0.7rem] uppercase font-semibold mb-1">
                Opis usterki zgłoszony przez klienta
              </span>
              <div className="text-ink whitespace-pre-wrap break-words leading-relaxed text-xs bg-page p-3 rounded-lg border border-line">
                {currentTicket.opis_usterki || 'Brak opisu usterki.'}
              </div>
            </div>
          </div>

          {/* Sekcja 3: Realizacja i raport naprawy */}
          <div className="bg-card rounded-xl p-4 border border-line space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                <span>🔧</span>
                <span>Realizacja i raport naprawy</span>
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Przypisany wykonawca</span>
                <span className="font-medium text-ink">
                  {currentTicket.przypisany_pracownik_username
                    ? `👤 ${currentTicket.przypisany_pracownik_username}`
                    : '— Nieprzypisane —'}
                </span>
              </div>

              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Status prac</span>
                <span className="font-medium text-ink">
                  {currentTicket.opis_naprawy ? 'Naprawa ukończona' : 'Oczekuje na wykonanie'}
                </span>
              </div>
            </div>

            {currentTicket.opis_naprawy ? (
              <div className="repair-box p-3">
                <div className="font-semibold text-primary-dark text-xs mb-1">
                  Wykonane prace naprawcze:
                </div>
                <div className="text-ink whitespace-pre-wrap break-words leading-relaxed text-xs">
                  {currentTicket.opis_naprawy}
                </div>
                {currentTicket.opis_naprawy_data && (
                  <div className="text-[0.7rem] text-ink font-medium mt-2 pt-1.5 border-t border-primary/30 flex items-center gap-1">
                    <span>🕒</span>
                    <span>Zatwierdzono: {currentTicket.opis_naprawy_data}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted italic p-2.5 bg-page rounded-lg border border-line">
                Brak zarejestrowanego raportu naprawy.
              </div>
            )}
          </div>

          {/* Sekcja 4: Wysyłka */}
          <div className="bg-page rounded-xl p-4 border border-line space-y-3">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <span>📦</span>
              <span>Wysyłka i doręczenie</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Data wysłania</span>
                <span className="font-medium text-ink">
                  {currentTicket.data_wyslania ? `📦 ${currentTicket.data_wyslania}` : 'Jeszcze nie wysłano'}
                </span>
              </div>

              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Numer listu przewozowego</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink">
                    {currentTicket.numer_listu || 'Brak'}
                  </span>
                  {user?.role === 'admin' && onOpenTrackingModal && (
                    <button
                      type="button"
                      className="btn-secondary py-0.5 px-1.5 text-[0.7rem]"
                      onClick={() => onOpenTrackingModal(currentTicket)}
                    >
                      ✏ Edytuj
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sekcja 5: Oś czasu z historii zgłoszenia */}
          <div className="bg-card rounded-xl p-4 border border-line space-y-3">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <span>🕒</span>
              <span>Oś czasu zdarzeń (Historia)</span>
            </h4>

            {loadingHistory ? (
              <div className="text-xs text-muted italic py-3 text-center">
                Ładowanie historii zdarzeń...
              </div>
            ) : history.length > 0 ? (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
                {history.map((h) => (
                  <div key={h.id} className="relative text-xs">
                    {/* Węzeł osi czasu */}
                    <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-card border border-line flex items-center justify-center text-[0.65rem] shadow-xs">
                      {getActionIcon(h.akcja)}
                    </div>

                    <div className="bg-page p-3 rounded-lg border border-line space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-semibold text-ink">
                          {h.username ? `@${h.username}` : 'System'}
                        </span>
                        <span className="text-muted text-[0.7rem]">
                          {h.created_at}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-primary-dark uppercase text-[0.7rem]">
                          {h.akcja}
                        </span>
                        {h.z_statusu && h.na_status && (
                          <span className="text-muted text-[0.7rem] bg-card px-1.5 py-0.5 rounded border border-line">
                            {h.z_statusu} &rarr; {h.na_status}
                          </span>
                        )}
                      </div>

                      {h.szczegoly && (
                        <div className="text-muted text-xs whitespace-pre-wrap break-words pt-1 border-t border-line/60">
                          {h.szczegoly}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted italic py-2">
                Brak wpisów w historii zgłoszenia.
              </div>
            )}
          </div>
        </div>

        {/* Dolny pasek panelu bocznego */}
        <div className="p-3 sm:p-4 border-t border-line bg-card flex justify-end items-center shrink-0">
          <button
            type="button"
            className="btn-secondary py-1.5 px-4 text-xs"
            onClick={onClose}
          >
            Zamknij panel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
