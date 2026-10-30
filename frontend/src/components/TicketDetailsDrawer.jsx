import React, { useState, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import StatusBadge from './StatusBadge';
import StatusControl from './StatusControl';
import { ticketApi } from '../api';
import { useDialog } from '../useDialog';
import { STATUS_LABELS, HISTORY_ACTION_LABELS, formatDate, formatDateTime, getTicketActionState } from '../constants';

const ACTION_ICONS = {
  utworzenie: '📝',
  przypisanie: '👤',
  naprawa: '🔧',
  wysyłka: '📦',
  zmiana_numeru_listu: '🚚',
  zmiana_statusu: '🔄',
  usunięcie: '🗑️'
};

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
  const [historyError, setHistoryError] = useState(null);

  const dialogRef = useRef(null);
  const titleId = useId();
  // Escape zamyka panel tylko wtedy, gdy nie ma nad nim otwartego okna (np. "Cofnij status")
  useDialog(dialogRef, onClose);

  useEffect(() => {
    let isMounted = true;
    if (ticket?.id) {
      ticketApi
        .getTicketById(ticket.id)
        .then((res) => {
          if (isMounted && res) setFetchedData(res);
        })
        .catch((err) => {
          if (isMounted) setHistoryError(err?.message || 'Nie udało się pobrać historii zgłoszenia.');
        })
        .finally(() => {
          if (isMounted) setLoadingHistory(false);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [ticket?.id]);

  if (!ticket) return null;
  // Po mutacji Dashboard podaje świeżo pobrane szczegóły (z historią) - wtedy mają pierwszeństwo przed danymi z montowania
  const currentTicket = Array.isArray(ticket.historia)
    ? ticket
    : fetchedData
      ? { ...ticket, ...fetchedData }
      : ticket;
  const history = Array.isArray(currentTicket.historia) ? currentTicket.historia : [];
  const { trackingAction } = getTicketActionState(currentTicket);
  const curStatus = currentTicket.status || 'nowe';

  return createPortal(
    // Kliknięcie w tło to wygoda dla myszy; z klawiatury panel zamyka Escape albo przycisk "Zamknij"
    <div
      className="drawer-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <dialog
        open
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="drawer-panel outline-none"
      >
        {/* Pasek nagłówka panelu bocznego */}
        <div className="p-4 sm:p-5 border-b border-line bg-card flex items-start justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 id={titleId} className="text-xl font-bold text-ink">
                Zgłoszenie #{ticket.id}
              </h2>
              <StatusBadge status={curStatus} />
            </div>
            <div className="text-xs text-muted mt-1">
              Data przyjęcia:{' '}
              {formatDateTime(ticket.created_at)}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink text-xl font-bold p-1 leading-none rounded-md hover:bg-page transition-colors cursor-pointer"
            title="Zamknij panel (Esc)"
            aria-label="Zamknij panel szczegółów"
          >
            ✕
          </button>
        </div>

        {/* Pasek pojedynczej akcji */}
        <div className="px-4 sm:px-5 py-3 bg-page border-b border-line shrink-0">
          <StatusControl
            ticket={currentTicket}
            user={user}
            hideBadge
            barLayout
            onOpenAssignModal={onOpenAssignModal}
            onOpenRepairModal={onOpenRepairModal}
            onOpenShipModal={onOpenShipModal}
            onOpenRollbackModal={onOpenRollbackModal}
          />
        </div>

        {/* Przewijana treść panelu: osobny cel fokusu (od razu po otwarciu), żeby strzałki i PageUp/PageDown przewijały ją z klawiatury */}
        <section
          aria-label={`Szczegóły zgłoszenia #${ticket.id}`}
          tabIndex={0}
          data-autofocus
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
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
                  ) : (
                    '—'
                  )}
                </div>
                {currentTicket.telefon_stacjonarny && (
                  <div className="font-medium text-ink mt-0.5">
                    <a href={`tel:${currentTicket.telefon_stacjonarny}`} className="hover:underline">
                      ☎️ {currentTicket.telefon_stacjonarny}{' '}
                      <span className="text-muted text-[0.7rem] font-normal">(stacjonarny)</span>
                    </a>
                  </div>
                )}
                <div className="text-muted mt-0.5">
                  {currentTicket.email ? (
                    <a href={`mailto:${currentTicket.email}`} className="hover:underline">
                      ✉ {currentTicket.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </div>
              </div>

              <div>
                <span className="text-muted block text-[0.7rem] uppercase">Adres wysyłki</span>
                <div className="font-medium text-ink">{currentTicket.adres || '—'}</div>
                {(currentTicket.kod_pocztowy || currentTicket.miasto) && (
                  <div className="text-muted">
                    {currentTicket.kod_pocztowy} {currentTicket.miasto}
                  </div>
                )}
              </div>

              <div>
                <span className="text-muted block text-[0.7rem] uppercase">
                  Dokument sprzedaży / NIP
                </span>
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
                  {currentTicket.data_zakupu ? formatDate(currentTicket.data_zakupu) : 'Nie podano'}
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
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <span>🔧</span>
              <span>Realizacja i raport naprawy</span>
            </h4>

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
                    <span>Zatwierdzono: {formatDateTime(currentTicket.opis_naprawy_data)}</span>
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
                  {currentTicket.data_wyslania
                    ? `📦 ${formatDateTime(currentTicket.data_wyslania)}`
                    : 'Jeszcze nie wysłano'}
                </span>
              </div>
              <div>
                <span className="text-muted block text-[0.7rem] uppercase">
                  Numer listu przewozowego
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink">
                    {currentTicket.numer_listu || 'Brak'}
                  </span>
                  {trackingAction && onOpenTrackingModal && (
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
            ) : historyError ? (
              <div className="bg-danger/10 border border-danger/30 text-danger p-3 rounded-lg text-xs">
                {historyError}
              </div>
            ) : history.length > 0 ? (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
                {history.map((h) => (
                  <div key={h.id} className="relative text-xs">
                    <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-card border border-line flex items-center justify-center text-[0.65rem] shadow-xs">
                      {ACTION_ICONS[h.akcja] || '⚡'}
                    </div>

                    <div className="bg-page p-3 rounded-lg border border-line space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-semibold text-ink">
                          {h.username ? `@${h.username}` : 'System'}
                        </span>
                        <span className="text-muted text-[0.7rem]">{formatDateTime(h.created_at)}</span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-primary-dark text-xs">
                          {HISTORY_ACTION_LABELS[h.akcja] || HISTORY_ACTION_LABELS[h.akcja?.toLowerCase()] || h.akcja}
                        </span>
                        {h.z_statusu && h.na_status && (
                          <span className="text-muted text-[0.7rem] bg-card px-1.5 py-0.5 rounded border border-line">
                            {(STATUS_LABELS[h.z_statusu] || h.z_statusu)} &rarr; {(STATUS_LABELS[h.na_status] || h.na_status)}
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
        </section>

        {/* Dolny pasek panelu bocznego */}
        <div className="p-3 sm:p-4 border-t border-line bg-card flex justify-end items-center shrink-0">
          <button type="button" className="btn-secondary py-1.5 px-4 text-xs" onClick={onClose}>
            Zamknij panel
          </button>
        </div>
      </dialog>
    </div>,
    document.body
  );
}
