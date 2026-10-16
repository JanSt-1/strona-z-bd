import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import StatusBadge from './StatusBadge';
import { ticketApi } from '../api';

export default function TicketDetailsModal({
  ticket,
  user,
  onClose,
  onOpenRepairModal,
  onOpenTrackingModal
}) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [detailsTicket, setDetailsTicket] = useState(ticket);

  useEffect(() => {
    setDetailsTicket(ticket);
  }, [ticket]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);

    // Pobranie historii i świeżych danych zgłoszenia z backendu
    let isMounted = true;
    if (ticket?.id) {
      ticketApi
        .getTicketById(ticket.id)
        .then((res) => {
          if (isMounted && res) {
            if (res.historia) {
              setHistory(res.historia);
            }
            setDetailsTicket((prev) => ({ ...prev, ...res }));
          }
        })
        .catch(() => {
          // Ignorujemy cichy błąd historii, podstawowe dane zgłoszenia i tak są widoczne
        })
        .finally(() => {
          if (isMounted) setLoadingHistory(false);
        });
    } else {
      setLoadingHistory(false);
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      isMounted = false;
    };
  }, [ticket?.id, onClose]);

  if (!ticket) return null;
  const currentTicket = detailsTicket || ticket;

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card max-w-3xl">
        {/* Nagłówek okna szczegółów */}
        <div className="flex justify-between items-start mb-4 pb-3 border-b border-line">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-xl font-bold text-ink">
                Zgłoszenie #{ticket.id}
              </h3>
              <StatusBadge status={ticket.status} />
            </div>
            <div className="text-xs text-muted mt-1">
              Data wpłynięcia: {ticket.created_at ? new Date(ticket.created_at).toLocaleString('pl-PL') : '-'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink text-2xl font-bold p-1 leading-none transition-colors cursor-pointer"
            title="Zamknij (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 text-sm">
          {/* Sekcja 1: Dane klienta, adres, NIP i faktura */}
          <div className="bg-page rounded-xl p-4 border border-line">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
              1. Klient, adres i faktura
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted block">Imię i nazwisko</span>
                <span className="font-semibold text-ink">{ticket.imie} {ticket.nazwisko}</span>
                {ticket.nazwa_firmy && (
                  <div className="text-xs text-primary-dark font-semibold mt-0.5">
                    Firma: {ticket.nazwa_firmy}
                  </div>
                )}
              </div>

              <div>
                <span className="text-xs text-muted block">Kontakt</span>
                <div className="text-ink font-medium">{ticket.numer_telefonu}</div>
                <div className="text-muted text-xs">{ticket.email}</div>
              </div>

              <div>
                <span className="text-xs text-muted block">Adres</span>
                <div className="font-medium text-ink">{ticket.adres || 'Brak danych'}</div>
                {(ticket.kod_pocztowy || ticket.miasto) && (
                  <div className="text-xs text-muted font-medium">
                    {ticket.kod_pocztowy} {ticket.miasto}
                  </div>
                )}
              </div>

              <div>
                <span className="text-xs text-muted block">Rozliczenie (FV / NIP)</span>
                <div className="font-medium text-ink">
                  Nr faktury / paragonu: <strong>{ticket.numer_fv || 'Brak'}</strong>
                </div>
                {ticket.nip && (
                  <div className="text-xs text-ink mt-0.5">
                    NIP: <span className="font-semibold">{ticket.nip}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sekcja 2: Przedmiot zgłoszenia */}
          <div className="bg-page rounded-xl p-4 border border-line">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
              2. Przedmiot zgłoszenia
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <span className="text-xs text-muted block">Produkt / Urządzenie</span>
                <span className="font-semibold text-primary-dark">{ticket.przedmiot_zgloszenia || 'Nie określono'}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">Numer seryjny (S/N)</span>
                <span className="font-medium text-ink">{ticket.numer_seryjny || 'Brak S/N'}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">Data zakupu</span>
                <span className="font-medium text-ink">{ticket.data_zakupu || 'Nie podano'}</span>
              </div>
            </div>
          </div>

          {/* Sekcja 3: Opis usterki */}
          <div className="border border-line rounded-xl p-4 bg-card">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
              3. Opis usterki zgłoszonej przez klienta
            </h4>
            <div className="text-ink whitespace-pre-wrap break-words leading-relaxed text-sm bg-page p-3 rounded-lg border border-line">
              {ticket.opis_usterki || 'Brak opisu usterki.'}
            </div>
          </div>

          {/* Sekcja 4: Raport z naprawy */}
          <div className="border border-line rounded-xl p-4 bg-card">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-bold text-muted uppercase tracking-wider">
                4. Raport z naprawy
              </h4>
              {(!currentTicket.opis_naprawy &&
                currentTicket.dozwolone_akcje?.some((a) => a.typ === 'naprawa')) && (
                <button
                  type="button"
                  className="btn-primary py-1 px-3 text-xs"
                  onClick={() => {
                    onClose();
                    onOpenRepairModal(currentTicket);
                  }}
                >
                  Opisz naprawę
                </button>
              )}
            </div>

            {ticket.opis_naprawy ? (
              <div className="repair-box p-3.5">
                <div className="font-semibold text-primary-dark text-sm mb-1">
                  Wykonane prace naprawcze:
                </div>
                <div className="text-ink whitespace-pre-wrap break-words leading-relaxed text-sm">
                  {ticket.opis_naprawy}
                </div>
                {ticket.opis_naprawy_data && (
                  <div className="text-xs text-ink font-medium mt-2 flex items-center gap-1.5 pt-1.5 border-t border-primary/30">
                    <span>🕒</span>
                    <span>Zatwierdzono: {ticket.opis_naprawy_data}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted italic p-3 bg-page rounded-lg border border-line">
                Brak zarejestrowanego opisu naprawy.
              </div>
            )}
          </div>

          {/* Sekcja 5: Realizacja i wysyłka */}
          <div className="bg-page rounded-xl p-4 border border-line">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
              5. Przypisanie i wysyłka
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <span className="text-xs text-muted block">Przypisany pracownik</span>
                <span className="font-medium text-ink">
                  {ticket.przypisany_pracownik_username
                    ? `👤 ${ticket.przypisany_pracownik_username}`
                    : 'Nieprzypisane'}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted block">Data wysyłki</span>
                <span className="font-medium text-ink">
                  {ticket.data_wyslania ? `📦 ${ticket.data_wyslania}` : 'Jeszcze nie wysłano'}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted block">Numer listu przewozowego</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">
                    {ticket.numer_listu || 'Brak'}
                  </span>
                  {user?.role === 'admin' && (
                    <button
                      type="button"
                      className="btn-secondary py-0.5 px-2 text-[0.7rem]"
                      onClick={() => {
                        onClose();
                        onOpenTrackingModal(ticket);
                      }}
                    >
                      ✏ Edytuj
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sekcja 6: Historia zmian statusów */}
          <div className="border border-line rounded-xl p-4 bg-card">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
              6. Historia zgłoszenia
            </h4>
            {loadingHistory ? (
              <div className="text-xs text-muted italic">Ładowanie historii zdarzeń...</div>
            ) : history.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between text-xs p-2 bg-page rounded border border-line gap-1"
                  >
                    <div>
                      <span className="font-semibold text-ink">
                        {h.username ? `@${h.username}` : 'System'}:
                      </span>{' '}
                      <span className="text-ink">{h.akcja}</span>
                      {h.z_statusu && h.na_status && (
                        <span className="ml-1 text-muted">
                          ({h.z_statusu} &rarr; {h.na_status})
                        </span>
                      )}
                      {h.szczegoly && (
                        <div className="text-[0.7rem] text-muted mt-0.5">
                          {h.szczegoly}
                        </div>
                      )}
                    </div>
                    <div className="text-muted text-[0.7rem] shrink-0">
                      {h.created_at}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted italic">Brak zarejestrowanych wpisów w historii.</div>
            )}
          </div>
        </div>

        {/* Dolny pasek akcji */}
        <div className="flex justify-end items-center gap-3 mt-6 pt-3 border-t border-line">
          <button
            type="button"
            className="btn-secondary py-2 px-5 text-sm"
            onClick={onClose}
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
