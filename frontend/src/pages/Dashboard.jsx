import React, { useState, useEffect, useCallback } from 'react';
import { ticketApi, workerApi } from '../api';
import Alert from '../components/Alert';
import StatusControl from '../components/StatusControl';
import RepairModal from '../components/RepairModal';
import TrackingNumberModal from '../components/TrackingNumberModal';
import ChangeOwnPasswordModal from '../components/ChangeOwnPasswordModal';
import AdminUsersPanel from '../components/AdminUsersPanel';

export default function Dashboard({ user, token, onLogout }) {
  const [tickets, setTickets] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [alert, setAlert] = useState(null);
  const [repairModalTicket, setRepairModalTicket] = useState(null);
  const [trackingModalTicket, setTrackingModalTicket] = useState(null);
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-4 border-b border-emerald-800/20">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {currentTab === 'users' ? 'Użytkownicy (Zarządzanie kontami)' : 'Zgłoszenia serwisowe'}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="bg-cyan-500/20 text-[#002911] font-semibold text-xs px-2.5 py-1 rounded-full border border-cyan-500/40">
              Zalogowano: {user?.username || 'Użytkownik'} (Rola: {user?.role || 'pracownik'})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            className="btn-reset py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
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
            className="btn-reset py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
            onClick={currentTab === 'users' ? () => {} : () => fetchTickets()}
            title="Odśwież listę zgłoszeń"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            Odśwież
          </button>
          <button
            type="button"
            className="btn-reset py-1.5 px-3 text-xs inline-flex items-center gap-1.5 !text-red-700 hover:!text-red-800 !border-red-300 hover:!border-red-400 !bg-red-50/70 hover:!bg-red-100/80"
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
        <div className="flex gap-2 bg-white/50 p-1.5 rounded-xl border border-[var(--card-border)] mb-6">
          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              currentTab === 'tickets'
                ? 'bg-[#005c1f] text-white shadow-md'
                : 'text-emerald-950 hover:bg-emerald-500/20'
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
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              currentTab === 'users'
                ? 'bg-[#005c1f] text-white shadow-md'
                : 'text-emerald-950 hover:bg-emerald-500/20'
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
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4 bg-white/70 p-3 rounded-xl border border-[var(--card-border)] backdrop-blur-md">
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
                <button type="submit" className="btn-reset py-1.5 px-3 text-xs" title="Szukaj">
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
                  className="app-select py-1.5 text-xs w-auto cursor-pointer"
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
                  className="btn-reset py-1.5 px-3 text-xs"
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

          {/* Tabela zgłoszeń */}
          <div className="overflow-x-auto bg-white/95 rounded-xl shadow-md border border-[var(--card-border)]">
            <table>
              <thead>
                <tr>
                  <th className="w-12 text-center">ID</th>
                  <th className="min-w-[150px]">Klient &amp; Kontakt</th>
                  <th className="min-w-[120px]">Adres</th>
                  <th className="min-w-[220px] max-w-[340px]">Przedmiot &amp; Usterka</th>
                  <th className="min-w-[140px]">Przypisany pracownik</th>
                  <th className="min-w-[220px] max-w-[340px]">Raport z naprawy</th>
                  <th className="min-w-[110px]">Nr FV &amp; NIP</th>
                  <th className="min-w-[140px]">Status</th>
                  <th className="min-w-[130px]">Data</th>
                  <th className="min-w-[80px]">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-slate-500 font-medium">
                      Ładowanie danych z bazy MySQL...
                    </td>
                  </tr>
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-slate-600 font-medium">
                      {getEmptyMessage()}
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="text-center font-bold text-slate-800">#{t.id}</td>
                      <td>
                        <div className="font-semibold text-slate-900">
                          {t.imie} {t.nazwisko}
                        </div>
                        {t.nazwa_firmy && (
                          <div className="text-xs text-[#005c1f] font-semibold">
                            Firma: {t.nazwa_firmy}
                          </div>
                        )}
                        <div className="text-xs text-slate-600">{t.email}</div>
                        <div className="text-xs text-slate-600">{t.numer_telefonu}</div>
                      </td>
                      <td>
                        <div className="text-xs text-slate-800">{t.adres}</div>
                        {(t.kod_pocztowy || t.miasto) && (
                          <div className="text-xs text-slate-500 font-medium">
                            {t.kod_pocztowy} {t.miasto}
                          </div>
                        )}
                      </td>
                      <td>
                        {t.przedmiot_zgloszenia && (
                          <div className="font-semibold text-[#005c1f] text-xs mb-0.5">
                            {t.przedmiot_zgloszenia}
                          </div>
                        )}
                        {t.numer_seryjny && (
                          <div className="text-xs text-slate-800 font-semibold mb-0.5">
                            SN: {t.numer_seryjny}
                          </div>
                        )}
                        {t.data_zakupu && (
                          <div className="text-[0.7rem] text-slate-500 mb-1">
                            Data zakupu: {t.data_zakupu}
                          </div>
                        )}
                        <div className="text-xs text-slate-700 whitespace-pre-wrap break-words leading-relaxed max-h-32 overflow-y-auto">
                          {t.opis_usterki}
                        </div>
                      </td>
                      <td>
                        {user?.role === 'admin' || user?.role === 'serwisant' ? (
                          <select
                            value={t.przypisany_pracownik_id || ''}
                            onChange={(e) => handleAssignWorker(t.id, e.target.value)}
                            title="Przypisz to zlecenie pracownikowi"
                            className="w-full max-w-[170px] bg-white border border-slate-300 text-slate-800 rounded px-2 py-1 text-xs outline-none focus:border-emerald-600 cursor-pointer"
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
                              <span className="font-semibold text-[#005c1f] text-xs">
                                👤 {t.przypisany_pracownik_username}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">Nieprzypisane</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {t.opis_naprawy ? (
                          <div className="repair-box">
                            <div className="font-semibold text-[#005c1f] text-xs mb-0.5">
                              Naprawiono:
                            </div>
                            <div className="text-xs text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                              {t.opis_naprawy}
                            </div>
                            {t.opis_naprawy_data && (
                              <div className="text-[0.7rem] text-slate-500 mt-1 flex items-center gap-1">
                                <span>🕒</span>
                                <span>{t.opis_naprawy_data}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            {((user?.role === 'pracownik' && t.status === 'w_realizacji') ||
                              user?.role === 'admin') &&
                            t.status !== 'zakończone' ? (
                              <button
                                type="button"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-1 px-2.5 rounded shadow-sm transition-all cursor-pointer"
                                onClick={() => setRepairModalTicket(t)}
                                title="Wpisz co zostało zrobione i przekaż do wysyłki"
                              >
                                Opisz naprawę
                              </button>
                            ) : (
                              <span className="text-slate-400 text-xs">
                                {user?.role === 'pracownik' && t.status === 'nowe'
                                  ? 'Wymaga rozpoczęcia'
                                  : 'Oczekuje na opis'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="font-semibold text-xs text-slate-800">{t.numer_fv}</div>
                        {t.nip && (
                          <div className="text-[0.7rem] text-slate-500">NIP: {t.nip}</div>
                        )}
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
                        <small className="text-slate-600 text-[0.75rem]">
                          {t.created_at ? new Date(t.created_at).toLocaleString('pl-PL') : '-'}
                        </small>
                        {t.data_wyslania && (
                          <div className="mt-1 text-xs text-[#005c1f] font-semibold">
                            Wysłano: {t.data_wyslania}
                          </div>
                        )}
                        {t.numer_listu && (
                          <div className="mt-0.5 text-xs text-slate-700 break-all">
                            List:{' '}
                            <strong className="text-slate-900 font-semibold">{t.numer_listu}</strong>
                          </div>
                        )}
                        {user?.role === 'admin' && (
                          <div className="mt-1.5">
                            <button
                              type="button"
                              className="btn-reset text-[0.7rem] py-0.5 px-1.5"
                              onClick={() => setTrackingModalTicket(t)}
                              title="Wpisz lub zmień numer listu przewozowego"
                            >
                              ✏ {t.numer_listu ? 'Zmień nr listu' : '+ Nr listu'}
                            </button>
                          </div>
                        )}
                      </td>
                      <td>
                        {user?.role === 'admin' ? (
                          <button
                            type="button"
                            disabled={deletingId === t.id}
                            onClick={() => handleDeleteTicket(t.id)}
                            title={`Usuń zgłoszenie #${t.id}`}
                            className="bg-red-100 hover:bg-red-600 text-red-700 hover:text-white border border-red-300 text-xs font-semibold px-2 py-1 rounded transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
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
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginacja */}
          <div className="flex flex-wrap justify-between items-center gap-3 mt-4 p-3 bg-white/70 rounded-xl border border-[var(--card-border)] text-xs text-slate-700">
            <div>
              <span>
                Strona <strong>{page}</strong> z <strong>{totalPages || 1}</strong>
              </span>
              <span className="ml-3 text-slate-500">
                (Łącznie wyników: <strong>{total}</strong>)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-reset py-1 px-3 text-xs"
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
                className="btn-reset py-1 px-3 text-xs"
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
