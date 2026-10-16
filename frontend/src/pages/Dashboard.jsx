import React, { useState, useEffect, useCallback } from 'react';
import { ticketApi, workerApi } from '../api';
import Alert from '../components/Alert';
import StatusControl from '../components/StatusControl';
import RepairModal from '../components/RepairModal';
import TrackingNumberModal from '../components/TrackingNumberModal';
import ChangeOwnPasswordModal from '../components/ChangeOwnPasswordModal';
import AdminUsersPanel from '../components/AdminUsersPanel';
import TicketDetailsModal from '../components/TicketDetailsModal';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard({ user, token, onLogout }) {
  const [tickets, setTickets] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [alert, setAlert] = useState(null);
  const [repairModalTicket, setRepairModalTicket] = useState(null);
  const [trackingModalTicket, setTrackingModalTicket] = useState(null);
  const [detailsModalTicket, setDetailsModalTicket] = useState(null);
  const [dashboardTab, setDashboardTab] = useState('tickets'); // 'tickets' | 'users'
  const [showOwnPasswordModal, setShowOwnPasswordModal] = useState(false);

  // Filtry i paginacja
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');

  function showAlert(message, type = 'success') {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 5000);
  }

  const fetchWorkers = useCallback(async () => {
    if (user?.role !== 'admin' && user?.role !== 'serwisant') return;
    try {
      const data = await workerApi.getWorkers();
      if (Array.isArray(data)) {
        setWorkers(data);
      }
    } catch (err) {
      console.error('Błąd pobierania pracowników:', err);
    }
  }, [user?.role]);

  const fetchTickets = useCallback(
    async (overrides = {}) => {
      setLoading(true);
      try {
        const currentPage = overrides.page !== undefined ? overrides.page : page;
        const currentSearch = overrides.search !== undefined ? overrides.search : searchQuery;
        const currentStatus = overrides.status !== undefined ? overrides.status : statusFilter;
        const currentWorker = overrides.worker !== undefined ? overrides.worker : workerFilter;
        const currentSort = overrides.sort !== undefined ? overrides.sort : sortOrder;

        const data = await ticketApi.getTickets({
          page: currentPage,
          limit: 25,
          search: currentSearch,
          status: currentStatus,
          worker: currentWorker,
          sort: currentSort
        });

        if (!data) return;

        const list = Array.isArray(data) ? data : data.data || data.zgloszenia || [];
        setTickets(list);

        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setTotal(typeof data.total === 'number' ? data.total : list.length);
          setPage(data.page || currentPage || 1);
          setTotalPages(data.totalPages || 1);
        } else {
          setTotal(list.length);
          setTotalPages(1);
        }
      } catch (err) {
        showAlert(err.message, 'error');
      } finally {
        setLoading(false);
      }
    },
    [page, searchQuery, statusFilter, workerFilter, sortOrder]
  );

  useEffect(() => {
    fetchTickets();
    fetchWorkers();
  }, [fetchTickets, fetchWorkers, token]);

  async function handleAssignWorker(ticketId, pracownikId) {
    try {
      const data = await ticketApi.assignWorker(ticketId, pracownikId);
      if (!data) return;

      showAlert(data.message, 'success');
      fetchTickets();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  async function handleRepairSubmit(ticketId, opisNaprawy) {
    try {
      const data = await ticketApi.submitRepair(ticketId, opisNaprawy);
      if (!data) return;

      showAlert(
        `Zgłoszenie #${ticketId} zostało opisane i przekazane do magazynu jako "Do wysyłki"!`,
        'success'
      );
      setRepairModalTicket(null);
      fetchTickets();
    } catch (err) {
      showAlert(err.message, 'error');
      fetchTickets();
      throw err;
    }
  }

  async function handleUpdateStatus(id, newStatus, extraData = {}) {
    try {
      const data = await ticketApi.updateStatus(id, newStatus, extraData);
      if (!data) return;

      showAlert(`Zgłoszenie #${id}: zmieniono status na "${newStatus}".`, 'success');
      fetchTickets();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  async function handleSaveTrackingNumber(id, numerListu) {
    const targetTicket = tickets.find((t) => t.id === id);
    const currentStatus = targetTicket?.status || 'zakończone';
    try {
      const data = await ticketApi.saveTrackingNumber(id, currentStatus, numerListu);
      if (!data) return;

      showAlert(
        `Zgłoszenie #${id}: numer listu przewozowego został pomyślnie zapisany.`,
        'success'
      );
      fetchTickets();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  async function handleDeleteTicket(id) {
    if (user?.role !== 'admin') {
      showAlert('Brak uprawnień do usuwania zgłoszeń (wymagana rola: admin).', 'error');
      return;
    }
    const confirmed = window.confirm(`Czy na pewno chcesz bezpowrotnie usunąć zgłoszenie #${id}?`);
    if (!confirmed) return;

    setDeletingId(id);
    try {
      const data = await ticketApi.deleteTicket(id);
      if (!data) return;

      showAlert(`Zgłoszenie #${id} zostało pomyślnie usunięte.`, 'success');
      setTickets((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  const getEmptyMessage = () => {
    if (user?.role === 'pracownik') {
      return 'Brak przypisanych zleceń. Zlecenia pojawią się tutaj po przypisaniu ich przez serwisanta lub administratora.';
    }
    if (user?.role === 'magazynier') {
      return 'Brak zleceń oczekujących na wysyłkę. Zlecenia pojawią się tutaj ze statusem "Do wysyłki", gdy pracownik zakończy i opisze naprawę.';
    }
    return 'Brak zgłoszeń w bazie danych.';
  };

  const currentTab = user?.role === 'admin' ? dashboardTab : 'tickets';

  return (
    <div className="app-card">
      {/* Pasek nagłówka panelu pracownika */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-4 border-b border-primary/30">
        <div>
          <h2 className="text-2xl font-bold text-ink">
            {currentTab === 'users' ? 'Użytkownicy (Zarządzanie kontami)' : 'Zgłoszenia serwisowe'}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="bg-primary/10 text-primary-dark font-semibold text-xs px-2.5 py-1 rounded-full border border-primary/30">
              Zalogowano: {user?.username || 'Użytkownik'} (Rola: {user?.role || 'pracownik'})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
            onClick={() => setShowOwnPasswordModal(true)}
            title="Zmień swoje hasło logowania"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Zmień hasło
          </button>
          <button
            type="button"
            className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
            onClick={currentTab === 'users' ? () => { } : () => fetchTickets()}
            title="Odśwież listę zgłoszeń"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            Odśwież
          </button>
          <button
            type="button"
            className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
            onClick={onLogout}
            title="Wyloguj z systemu"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Wyloguj
          </button>
        </div>
      </div>

      {/* Zakładki pod-nawigacji dla administratora */}
      {user?.role === 'admin' && (
        <div className="flex gap-2 bg-page p-1.5 rounded-xl border border-line mb-6">
          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${currentTab === 'tickets'
                ? 'bg-[var(--primary)] text-[var(--text-white)] shadow-sm'
                : 'text-ink hover:bg-line'
              }`}
            onClick={() => setDashboardTab('tickets')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Zgłoszenia serwisowe ({total !== undefined ? total : tickets.length})
          </button>
          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${currentTab === 'users'
                ? 'bg-[var(--primary)] text-[var(--text-white)] shadow-sm'
                : 'text-ink hover:bg-line'
              }`}
            onClick={() => setDashboardTab('users')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Zarządzanie użytkownikami (Admin)
          </button>
        </div>
      )}

      <Alert alert={alert} />

      {currentTab === 'users' && user?.role === 'admin' ? (
        <AdminUsersPanel currentUser={user} showAlert={showAlert} />
      ) : (
        <>
          {/* Pasek kontrolny filtrów */}
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4 bg-page p-3 rounded-xl border border-line">
            <div className="flex flex-wrap gap-2.5 items-center flex-1">
              <form
                className="flex items-center gap-1.5 flex-1 min-w-[220px] max-w-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  setPage(1);
                  fetchTickets({ page: 1, search: searchQuery });
                }}
              >
                <input
                  type="text"
                  placeholder="Szukaj w zgłoszeniach..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="app-input py-1.5 text-xs"
                />
                <button type="submit" className="btn-secondary py-1.5 px-3 text-xs" title="Szukaj">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Szukaj
                </button>
              </form>

              {/* Filtr statusu */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setStatusFilter(val);
                  setPage(1);
                  fetchTickets({ page: 1, status: val });
                }}
                className="app-select py-1.5 text-xs w-auto cursor-pointer"
              >
                <option value="">Wszystkie statusy</option>
                {user?.role !== 'magazynier' && <option value="nowe">Nowe</option>}
                {user?.role !== 'magazynier' && <option value="w_realizacji">W realizacji</option>}
                <option value="do_wysylki">Do wysyłki</option>
                <option value="zakończone">Zakończone</option>
              </select>

              {/* Filtr pracownika */}
              {(user?.role === 'admin' || user?.role === 'serwisant') && (
                <select
                  value={workerFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setWorkerFilter(val);
                    setPage(1);
                    fetchTickets({ page: 1, worker: val });
                  }}
                  className="app-select py-1.5 text-xs w-auto min-w-[190px] cursor-pointer"
                >
                  <option value="">Wszyscy pracownicy</option>
                  <option value="nieprzypisane">Nieprzypisane</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.username} ({w.role})
                    </option>
                  ))}
                </select>
              )}

              {/* Sortowanie po dacie */}
              <select
                value={sortOrder}
                onChange={(e) => {
                  const val = e.target.value;
                  setSortOrder(val);
                  setPage(1);
                  fetchTickets({ page: 1, sort: val });
                }}
                className="app-select py-1.5 text-xs w-auto cursor-pointer"
              >
                <option value="desc">Data: od najnowszych</option>
                <option value="asc">Data: od najstarszych</option>
              </select>

              {(searchQuery || statusFilter || workerFilter || sortOrder !== 'desc') && (
                <button
                  type="button"
                  className="btn-secondary py-1.5 px-3 text-xs"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('');
                    setWorkerFilter('');
                    setSortOrder('desc');
                    setPage(1);
                    fetchTickets({ page: 1, search: '', status: '', worker: '', sort: 'desc' });
                  }}
                  title="Zresetuj wszystkie filtry"
                >
                  Wyczyść filtry
                </button>
              )}
            </div>
          </div>

          {/* Tabela zgłoszeń (Widok DESKTOP: 6 kolumn: Nr, Klient, Produkt, Przypisany, Status, Data) */}
          <div className="hidden md:block overflow-x-auto bg-card rounded-xl shadow-sm border border-line">
            <table>
              <thead>
                <tr>
                  <th className="w-16 text-center">Nr</th>
                  <th className="min-w-[170px]">Klient</th>
                  <th className="min-w-[180px]">Produkt / Usterka</th>
                  <th className="min-w-[230px]">Przypisany</th>
                  <th className="min-w-[160px]">Status</th>
                  <th className="min-w-[140px]">Data</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-muted font-medium">
                      Ładowanie danych z bazy MySQL...
                    </td>
                  </tr>
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted font-medium">
                      {getEmptyMessage()}
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-page transition-colors">
                      <td className="text-center font-bold text-ink">
                        <button
                          type="button"
                          onClick={() => setDetailsModalTicket(t)}
                          className="font-bold text-ink hover:text-[var(--primary)] hover:underline cursor-pointer"
                          title="Kliknij, aby otworzyć szczegóły"
                        >
                          #{t.id}
                        </button>
                      </td>
                      <td>
                        <div className="font-semibold text-ink">
                          {t.imie} {t.nazwisko}
                        </div>
                        {t.nazwa_firmy && (
                          <div className="text-xs text-primary-dark font-semibold">
                            Firma: {t.nazwa_firmy}
                          </div>
                        )}
                        <div className="text-xs text-muted">{t.numer_telefonu}</div>
                        <div className="text-xs text-muted">{t.email}</div>
                      </td>
                      <td>
                        <div className="font-semibold text-primary-dark text-xs">
                          {t.przedmiot_zgloszenia || '—'}
                        </div>
                        {t.numer_seryjny && (
                          <div className="text-xs text-ink font-medium mt-0.5">
                            SN: {t.numer_seryjny}
                          </div>
                        )}
                        {t.opis_usterki && (
                          <div
                            className="text-xs text-muted mt-1.5 ticket-excerpt max-w-[240px]"
                            title={t.opis_usterki}
                          >
                            <span className="font-semibold text-ink">Usterka: </span>
                            {t.opis_usterki}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="min-w-[210px]">
                          {user?.role === 'admin' || user?.role === 'serwisant' ? (
                            <select
                              value={t.przypisany_pracownik_id || ''}
                              onChange={(e) => handleAssignWorker(t.id, e.target.value)}
                              title="Przypisz to zlecenie pracownikowi"
                              className="w-full min-w-[200px] bg-card border border-line text-ink rounded px-2.5 py-1.5 text-xs outline-none focus:border-primary/30 cursor-pointer font-medium"
                            >
                              <option value="">— Nieprzypisane —</option>
                              {workers.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.username} ({w.role})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div>
                              {t.przypisany_pracownik_username ? (
                                <span className="font-semibold text-primary-dark text-xs whitespace-normal break-words">
                                  👤 {t.przypisany_pracownik_username}
                                </span>
                              ) : (
                                <span className="text-muted text-xs">Nieprzypisane</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <StatusControl
                          ticket={t}
                          user={user}
                          onUpdateStatus={handleUpdateStatus}
                          onOpenRepairModal={(ticketToRepair) => setRepairModalTicket(ticketToRepair)}
                        />
                      </td>
                      <td>
                        <div className="text-xs text-ink font-medium whitespace-nowrap">
                          {t.created_at ? new Date(t.created_at).toLocaleDateString('pl-PL') : '-'}
                        </div>
                        <div className="text-[0.7rem] text-muted">
                          {t.created_at ? new Date(t.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            className="btn-secondary py-1 px-2.5 text-xs"
                            onClick={() => setDetailsModalTicket(t)}
                            title="Zobacz pełne szczegóły zgłoszenia (adres, NIP, FV, usterka, raport)"
                          >
                            Szczegóły
                          </button>
                          {user?.role === 'admin' && (
                            <button
                              type="button"
                              disabled={deletingId === t.id}
                              onClick={() => handleDeleteTicket(t.id)}
                              title={`Usuń zgłoszenie #${t.id}`}
                              className="btn-danger text-xs py-1 px-2 inline-flex items-center gap-1"
                            >
                              {deletingId === t.id ? (
                                '...'
                              ) : (
                                <>
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                  Usuń
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Karty zgłoszeń (Widok MOBILE / TELEFON: jedna karta pod drugą) */}
          <div className="block md:hidden space-y-3">
            {loading ? (
              <div className="bg-card rounded-xl border border-line p-8 text-center text-muted font-medium">
                Ładowanie danych z bazy MySQL...
              </div>
            ) : tickets.length === 0 ? (
              <div className="bg-card rounded-xl border border-line p-8 text-center text-muted font-medium">
                {getEmptyMessage()}
              </div>
            ) : (
              tickets.map((t) => (
                <div
                  key={t.id}
                  className="bg-card rounded-xl border border-line p-4 shadow-xs space-y-3 hover:border-line transition-colors"
                >
                  {/* Górny wiersz karty: ID, Data i Status */}
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-line">
                    <div>
                      <button
                        type="button"
                        onClick={() => setDetailsModalTicket(t)}
                        className="text-base font-bold text-ink hover:text-[var(--primary)] hover:underline cursor-pointer"
                      >
                        #{t.id}
                      </button>
                      <div className="text-[0.7rem] text-muted mt-0.5">
                        {t.created_at ? new Date(t.created_at).toLocaleString('pl-PL') : '-'}
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>

                  {/* Dane klienta */}
                  <div className="text-xs space-y-0.5">
                    <span className="text-[0.7rem] text-muted uppercase font-semibold block">Klient</span>
                    <div className="font-semibold text-ink text-sm">
                      {t.imie} {t.nazwisko}
                    </div>
                    {t.nazwa_firmy && (
                      <div className="text-primary-dark font-semibold">
                        Firma: {t.nazwa_firmy}
                      </div>
                    )}
                    <div className="text-muted">{t.numer_telefonu} &bull; {t.email}</div>
                  </div>

                  {/* Produkt i usterka */}
                  <div className="text-xs bg-page p-2.5 rounded-lg border border-line">
                    <span className="text-[0.7rem] text-muted uppercase font-semibold block mb-0.5">Produkt</span>
                    <div className="font-semibold text-primary-dark">
                      {t.przedmiot_zgloszenia || '—'}
                    </div>
                    {t.numer_seryjny && (
                      <div className="text-ink font-medium mt-0.5">
                        SN: {t.numer_seryjny}
                      </div>
                    )}
                    {t.opis_usterki && (
                      <div className="text-muted mt-1.5 pt-1.5 border-t border-line/60 ticket-excerpt" title={t.opis_usterki}>
                        <span className="font-semibold text-ink">Usterka: </span>
                        {t.opis_usterki}
                      </div>
                    )}
                  </div>

                  {/* Przypisany pracownik */}
                  <div className="text-xs">
                    <span className="text-[0.7rem] text-muted uppercase font-semibold block mb-1">Przypisany</span>
                    {user?.role === 'admin' || user?.role === 'serwisant' ? (
                      <select
                        value={t.przypisany_pracownik_id || ''}
                        onChange={(e) => handleAssignWorker(t.id, e.target.value)}
                        title="Przypisz to zlecenie pracownikowi"
                        className="w-full bg-card border border-line text-ink rounded px-2.5 py-1.5 text-xs outline-none focus:border-primary/30 cursor-pointer"
                      >
                        <option value="">— Nieprzypisane —</option>
                        {workers.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.username} ({w.role})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="font-medium text-ink">
                        {t.przypisany_pracownik_username ? (
                          <span className="font-semibold text-primary-dark">
                            👤 {t.przypisany_pracownik_username}
                          </span>
                        ) : (
                          <span className="text-muted">Nieprzypisane</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Kontrolki zmiany statusu */}
                  <div className="pt-1">
                    <StatusControl
                      ticket={t}
                      user={user}
                      onUpdateStatus={handleUpdateStatus}
                      onOpenRepairModal={(ticketToRepair) => setRepairModalTicket(ticketToRepair)}
                    />
                  </div>

                  {/* Dolne przyciski karty */}
                  <div className="pt-2 border-t border-line flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="btn-secondary py-1.5 px-3 text-xs flex-1 justify-center"
                      onClick={() => setDetailsModalTicket(t)}
                    >
                      Szczegóły
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        type="button"
                        disabled={deletingId === t.id}
                        onClick={() => handleDeleteTicket(t.id)}
                        title={`Usuń zgłoszenie #${t.id}`}
                        className="btn-danger py-1.5 px-3 text-xs inline-flex items-center gap-1 justify-center"
                      >
                        {deletingId === t.id ? (
                          'Usuwanie...'
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            Usuń
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Paginacja */}
          <div className="flex flex-wrap justify-between items-center gap-3 mt-4 p-3 bg-page rounded-xl border border-line text-xs text-ink">
            <div>
              <span>
                Strona <strong>{page}</strong> z <strong>{totalPages || 1}</strong>
              </span>
              <span className="ml-3 text-muted">
                (Łącznie wyników: <strong>{total}</strong>)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary py-1 px-3 text-xs"
                disabled={page <= 1 || loading}
                onClick={() => {
                  const prev = Math.max(1, page - 1);
                  setPage(prev);
                  fetchTickets({ page: prev });
                }}
              >
                &laquo; Poprzednia
              </button>
              <button
                type="button"
                className="btn-secondary py-1 px-3 text-xs"
                disabled={page >= totalPages || loading}
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  fetchTickets({ page: next });
                }}
              >
                Następna &raquo;
              </button>
            </div>
          </div>

          {detailsModalTicket && (
            <TicketDetailsModal
              key={detailsModalTicket.id}
              ticket={detailsModalTicket}
              user={user}
              onClose={() => setDetailsModalTicket(null)}
              onOpenRepairModal={(t) => setRepairModalTicket(t)}
              onOpenTrackingModal={(t) => setTrackingModalTicket(t)}
            />
          )}

          {repairModalTicket && (
            <RepairModal
              key={repairModalTicket.id}
              ticket={repairModalTicket}
              onClose={() => setRepairModalTicket(null)}
              onSubmit={handleRepairSubmit}
            />
          )}

          {trackingModalTicket && (
            <TrackingNumberModal
              ticket={trackingModalTicket}
              onClose={() => setTrackingModalTicket(null)}
              onSave={handleSaveTrackingNumber}
            />
          )}
        </>
      )}

      {showOwnPasswordModal && (
        <ChangeOwnPasswordModal
          onClose={() => setShowOwnPasswordModal(false)}
          showAlert={showAlert}
        />
      )}
    </div>
  );
}
