import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ticketApi, workerApi } from '../api';
import Alert from '../components/Alert';
import StatusControl from '../components/StatusControl';
import RepairModal from '../components/RepairModal';
import AssignWorkerModal from '../components/AssignWorkerModal';
import ShipModal from '../components/ShipModal';
import RollbackStatusModal from '../components/RollbackStatusModal';
import PasswordModal from '../components/PasswordModal';
import AdminUsersPanel from '../components/AdminUsersPanel';
import TicketDetailsDrawer from '../components/TicketDetailsDrawer';
import StatusBadge from '../components/StatusBadge';

function readFiltersFromUrl() {
  const sp = new URLSearchParams(window.location.search);
  let status = sp.get('status') || '';
  if (status === 'zakonczone') status = 'zakończone';

  const worker = sp.get('pracownik') || sp.get('worker') || '';
  const search = sp.get('szukaj') || sp.get('search') || sp.get('q') || '';
  const pageRaw = sp.get('strona') || sp.get('page') || '1';
  const page = Math.max(1, parseInt(pageRaw, 10) || 1);
  const sort = sp.get('sort') === 'asc' ? 'asc' : 'desc';

  return { status, worker, search, page, sort };
}

function syncUrlWithFilters({ status, worker, search, page, sort }, replace = false) {
  const url = new URL(window.location.href);
  const sp = url.searchParams;

  const setOrDel = (key, val, legacyKeys = []) => {
    legacyKeys.forEach((k) => sp.delete(k));
    if (val) sp.set(key, String(val));
    else sp.delete(key);
  };

  setOrDel('status', status);
  setOrDel('pracownik', worker, ['worker']);
  setOrDel('szukaj', search?.trim(), ['search', 'q']);
  setOrDel('strona', page && page > 1 ? page : '', ['page']);
  setOrDel('sort', sort === 'asc' ? 'asc' : '');

  const query = sp.toString();
  const targetUrl = url.pathname + (query ? `?${query}` : '');

  if (window.location.pathname + window.location.search !== targetUrl) {
    window.history[replace ? 'replaceState' : 'pushState']({}, '', targetUrl);
  }
}

const Bar = ({ w, h = 'h-3', tone = 'bg-page', round = 'rounded' }) => (
  <div className={`${h} ${w} ${tone} ${round}`} />
);

const LoadingNote = () => (
  <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary-dark">
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
      <circle className="opacity-25" cx="12" cy="12" r="10" />
      <path className="opacity-75" d="M4 12a8 8 0 018-8" strokeLinecap="round" />
    </svg>
    Ładowanie zgłoszeń...
  </span>
);

const SKELETON_COLUMNS = [
  ['w-9', null],
  ['w-32', 'w-40'],
  ['w-36', 'w-48'],
  ['w-28', 'w-20'],
  ['w-24', null],
  ['w-20', 'w-16']
];

function TableSkeleton({ rows = 5 }) {
  return (
    <>
      <tr>
        <td colSpan={6} className="py-3 text-center border-b border-line">
          <LoadingNote />
        </td>
      </tr>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="animate-pulse">
          {SKELETON_COLUMNS.map(([a, b], c) => (
            <td key={c} className="py-4 px-3 space-y-2">
              <Bar w={a} h="h-4" tone="bg-line" round={c === 4 ? 'rounded-full' : 'rounded'} />
              {b && <Bar w={b} />}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function CardsSkeleton({ count = 3 }) {
  return (
    <div className="space-y-3">
      <div className="text-center py-2">
        <LoadingNote />
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-card rounded-xl border border-line p-4 space-y-3 animate-pulse">
          <div className="flex justify-between items-center">
            <Bar w="w-12" h="h-4" tone="bg-line" />
            <Bar w="w-20" h="h-6" tone="bg-line" round="rounded-full" />
          </div>
          <Bar w="w-36" h="h-4" tone="bg-line" />
          <Bar w="w-48" />
        </div>
      ))}
    </div>
  );
}

function TicketEmptyState({ hasActiveFilters, onClearFilters, defaultMessage }) {
  return (
    <div className="flex flex-col items-center max-w-md mx-auto text-center py-6 px-4 gap-2">
      {hasActiveFilters ? (
        <>
          <h3 className="text-base font-bold text-ink">Brak zgłoszeń dla wybranych filtrów</h3>
          <p className="text-xs text-muted">
            Żadne zgłoszenie nie spełnia wybranych kryteriów wyszukiwania ani filtrów.
          </p>
          <button type="button" className="btn-secondary py-1.5 px-4 text-xs mt-1" onClick={onClearFilters}>
            Wyczyść filtry
          </button>
        </>
      ) : (
        <p className="text-sm font-medium text-muted">{defaultMessage}</p>
      )}
    </div>
  );
}

function DeleteTicketButton({ id, deletingId, onDelete, mobile = false }) {
  const isDeleting = deletingId === id;
  return (
    <button
      type="button"
      disabled={isDeleting}
      onClick={() => onDelete(id)}
      title={`Usuń zgłoszenie #${id}`}
      className={`btn-danger text-xs inline-flex items-center gap-1 ${
        mobile ? 'py-1.5 px-3 justify-center' : 'py-1 px-2'
      }`}
    >
      {isDeleting ? (
        mobile ? 'Usuwanie...' : '...'
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
  );
}

export default function Dashboard({ user, token, onLogout }) {
  const initialFilters = readFiltersFromUrl();
  const [tickets, setTickets] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [alert, setAlert] = useState(null);
  const [assignModalTicket, setAssignModalTicket] = useState(null);
  const [repairModalTicket, setRepairModalTicket] = useState(null);
  const [shipModalTicket, setShipModalTicket] = useState(null);
  const [rollbackModalData, setRollbackModalData] = useState(null);
  const [trackingModalTicket, setTrackingModalTicket] = useState(null);
  const [detailsDrawerTicket, setDetailsDrawerTicket] = useState(null);
  const [dashboardTab, setDashboardTab] = useState('tickets');
  const [showOwnPasswordModal, setShowOwnPasswordModal] = useState(false);

  const [page, setPage] = useState(initialFilters.page);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState(initialFilters.search);
  const [statusFilter, setStatusFilter] = useState(initialFilters.status);
  const [workerFilter, setWorkerFilter] = useState(initialFilters.worker);
  const [sortOrder, setSortOrder] = useState(initialFilters.sort);

  const filtersRef = useRef(initialFilters);
  useEffect(() => {
    filtersRef.current = {
      page,
      search: searchQuery,
      status: statusFilter,
      worker: workerFilter,
      sort: sortOrder
    };
  }, [page, searchQuery, statusFilter, workerFilter, sortOrder]);

  const showAlert = useCallback((message, type = 'success') => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 5000);
  }, []);

  const fetchTickets = useCallback(
    async (overrides = {}) => {
      try {
        const base = filtersRef.current;
        const current = {
          page: overrides.page ?? base.page,
          search: overrides.search ?? base.search,
          status: overrides.status ?? base.status,
          worker: overrides.worker ?? base.worker,
          sort: overrides.sort ?? base.sort
        };

        const data = await ticketApi.getTickets({ ...current, limit: 25 });
        if (!data) return;

        const list = Array.isArray(data) ? data : data.data || data.zgloszenia || [];
        setTickets(list);

        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setTotal(typeof data.total === 'number' ? data.total : list.length);
          const resolvedPage = data.page || current.page || 1;
          setPage(resolvedPage);
          setTotalPages(data.totalPages || 1);
          syncUrlWithFilters({ ...current, page: resolvedPage }, true);
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
    [showAlert]
  );

  useEffect(() => {
    fetchTickets();
    if (user?.role === 'admin' || user?.role === 'serwisant') {
      workerApi
        .getWorkers()
        .then((data) => {
          if (Array.isArray(data)) setWorkers(data);
        })
        .catch((err) => console.error('Błąd pobierania pracowników:', err));
    }
  }, [fetchTickets, user?.role, token]);

  useEffect(() => {
    function handlePopState() {
      const fromUrl = readFiltersFromUrl();
      setPage(fromUrl.page);
      setSearchQuery(fromUrl.search);
      setStatusFilter(fromUrl.status);
      setWorkerFilter(fromUrl.worker);
      setSortOrder(fromUrl.sort);
      setLoading(true);
      fetchTickets(fromUrl);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [fetchTickets]);

  const applyFilters = useCallback(
    (patch) => {
      const next = {
        status: statusFilter,
        worker: workerFilter,
        search: searchQuery,
        sort: sortOrder,
        page: 1,
        ...patch
      };
      setStatusFilter(next.status);
      setWorkerFilter(next.worker);
      setSearchQuery(next.search);
      setSortOrder(next.sort);
      setPage(next.page);
      syncUrlWithFilters(next);
      setLoading(true);
      fetchTickets(next);
    },
    [fetchTickets, searchQuery, sortOrder, statusFilter, workerFilter]
  );

  const handleClearAllFilters = useCallback(() => {
    applyFilters({ status: '', worker: '', search: '', sort: 'desc', page: 1 });
  }, [applyFilters]);

  const handlePageChange = useCallback(
    (newPage) => {
      if (newPage < 1 || (totalPages && newPage > totalPages) || newPage === page) return;
      applyFilters({ page: newPage });
    },
    [applyFilters, page, totalPages]
  );

  async function refreshDrawerTicket(ticketId) {
    if (!ticketId || detailsDrawerTicket?.id !== ticketId) return;
    try {
      const updated = await ticketApi.getTicketById(ticketId);
      if (updated) setDetailsDrawerTicket(updated);
    } catch (err) {
      console.error('Błąd odświeżania szczegółów w panelu:', err);
    }
  }

  async function runTicketMutation(ticketId, apiCall, getSuccessMsg, closeFn, refreshOnErr = false) {
    try {
      const data = await apiCall();
      if (!data) return;
      showAlert(getSuccessMsg(data), 'success');
      if (closeFn) closeFn();
      fetchTickets();
      refreshDrawerTicket(ticketId);
    } catch (err) {
      showAlert(err.message, 'error');
      if (refreshOnErr) fetchTickets();
      throw err;
    }
  }

  const handleAssignWorker = (ticketId, pracownikId) =>
    runTicketMutation(
      ticketId,
      () =>
        ticketApi.assignWorker(
          ticketId,
          pracownikId === '' || pracownikId === null ? null : Number(pracownikId)
        ),
      (data) => data.message,
      () => setAssignModalTicket(null)
    );

  const handleRepairSubmit = (ticketId, opisNaprawy) =>
    runTicketMutation(
      ticketId,
      () => ticketApi.submitRepair(ticketId, opisNaprawy),
      () => `Zgłoszenie #${ticketId} zostało opisane i przekazane do magazynu jako "Do wysyłki"!`,
      () => setRepairModalTicket(null),
      true
    );

  const handleShipSubmit = (ticketId, numerListu) =>
    runTicketMutation(
      ticketId,
      () => ticketApi.updateStatus(ticketId, 'zakończone', { numer_listu: numerListu }),
      () => `Zgłoszenie #${ticketId} zostało oznaczone jako wysłane.`,
      () => setShipModalTicket(null)
    );

  const handleRollbackSubmit = (ticketId, targetStatus) =>
    runTicketMutation(
      ticketId,
      () => ticketApi.updateStatus(ticketId, targetStatus),
      () => `Status zgłoszenia #${ticketId} został cofnięty do "${targetStatus}".`,
      () => setRollbackModalData(null)
    );

  const handleSaveTrackingNumber = (id, numerListu) => {
    const currentStatus = tickets.find((t) => t.id === id)?.status || 'zakończone';
    return runTicketMutation(
      id,
      () => ticketApi.saveTrackingNumber(id, currentStatus, numerListu),
      () => `Zgłoszenie #${id}: numer listu przewozowego został pomyślnie zapisany.`,
      () => setTrackingModalTicket(null)
    );
  };

  async function handleDeleteTicket(id) {
    if (user?.role !== 'admin') {
      return showAlert('Brak uprawnień do usuwania zgłoszeń (wymagana rola: admin).', 'error');
    }
    if (!window.confirm(`Czy na pewno chcesz bezpowrotnie usunąć zgłoszenie #${id}?`)) return;

    setDeletingId(id);
    try {
      const data = await ticketApi.deleteTicket(id);
      if (!data) return;
      showAlert(`Zgłoszenie #${id} zostało pomyślnie usunięte.`, 'success');
      setTickets((prev) => prev.filter((t) => t.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      if (detailsDrawerTicket?.id === id) setDetailsDrawerTicket(null);
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  const emptyMessage =
    user?.role === 'pracownik'
      ? 'Brak przypisanych zleceń. Zlecenia pojawią się tutaj po przypisaniu ich przez serwisanta lub administratora.'
      : user?.role === 'magazynier'
      ? 'Brak zleceń oczekujących na wysyłkę. Zlecenia pojawią się tutaj ze statusem "Do wysyłki", gdy pracownik zakończy i opisze naprawę.'
      : 'Brak zgłoszeń w bazie danych.';

  const hasActiveFilters = Boolean(
    searchQuery.trim() || statusFilter || workerFilter || sortOrder !== 'desc' || page > 1
  );

  const currentTab = user?.role === 'admin' ? dashboardTab : 'tickets';

  const modalHandlers = {
    onOpenAssignModal: setAssignModalTicket,
    onOpenRepairModal: setRepairModalTicket,
    onOpenShipModal: setShipModalTicket,
    onOpenRollbackModal: (ticket, actions) => setRollbackModalData({ ticket, actions })
  };

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
          {currentTab === 'tickets' && (
            <button
              type="button"
              className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
              onClick={() => {
                setLoading(true);
                fetchTickets();
              }}
              title="Odśwież listę zgłoszeń"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              Odśwież
            </button>
          )}
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
        <div className="flex flex-col sm:flex-row gap-2 bg-page p-1.5 rounded-xl border border-line mb-6">
          {[
            {
              id: 'tickets',
              label: `Zgłoszenia serwisowe (${total !== undefined ? total : tickets.length})`,
              icon: (
                <>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </>
              )
            },
            {
              id: 'users',
              label: 'Zarządzanie użytkownikami (Admin)',
              icon: (
                <>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </>
              )
            }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`flex items-center justify-center sm:justify-start gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                currentTab === tab.id ? 'bg-primary text-inverse shadow-sm' : 'text-ink hover:bg-line'
              }`}
              onClick={() => setDashboardTab(tab.id)}
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {tab.icon}
              </svg>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      )}

      <Alert alert={alert} />

      {currentTab === 'users' && user?.role === 'admin' ? (
        <AdminUsersPanel currentUser={user} showAlert={showAlert} />
      ) : (
        <>
          {/* Pasek kontrolny filtrów i stronicowania nad listą */}
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4 bg-page p-3 rounded-xl border border-line">
            <div className="flex flex-wrap gap-2.5 items-center flex-1">
              <form
                className="flex items-center gap-1.5 flex-1 min-w-[220px] max-w-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyFilters({ search: searchQuery });
                }}
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Szukaj w zgłoszeniach..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="app-input py-1.5 pr-7 text-xs w-full"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => applyFilters({ search: '' })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs font-bold p-0.5 cursor-pointer"
                      title="Wyczyść szukanie"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button type="submit" className="btn-secondary py-1.5 px-3 text-xs" title="Szukaj">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Szukaj
                </button>
              </form>

              <select
                value={statusFilter}
                onChange={(e) => applyFilters({ status: e.target.value })}
                className="app-select py-1.5 text-xs w-auto cursor-pointer"
                title="Filtruj według statusu zgłoszenia"
              >
                <option value="">Wszystkie statusy</option>
                {user?.role !== 'magazynier' && <option value="nowe">Nowe</option>}
                {user?.role !== 'magazynier' && <option value="w_realizacji">W realizacji</option>}
                <option value="do_wysylki">Do wysyłki</option>
                <option value="zakończone">Zakończone</option>
              </select>

              {(user?.role === 'admin' || user?.role === 'serwisant') && (
                <select
                  value={workerFilter}
                  onChange={(e) => applyFilters({ worker: e.target.value })}
                  className="app-select py-1.5 text-xs w-auto min-w-[180px] cursor-pointer"
                  title="Filtruj według przypisanego pracownika"
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

              <select
                value={sortOrder}
                onChange={(e) => applyFilters({ sort: e.target.value })}
                className="app-select py-1.5 text-xs w-auto cursor-pointer"
                title="Kolejność sortowania po dacie"
              >
                <option value="desc">Data: od najnowszych</option>
                <option value="asc">Data: od najstarszych</option>
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn-secondary py-1.5 px-3 text-xs"
                  onClick={handleClearAllFilters}
                  title="Zresetuj wszystkie filtry i wyszukiwanie"
                >
                  Wyczyść filtry
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-ink ml-auto shrink-0">
              <span className="text-muted text-[0.75rem]">
                Strona <strong>{page}</strong> z <strong>{totalPages || 1}</strong>
                <span className="hidden sm:inline text-muted ml-1">({total} wyników)</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
                  disabled={page <= 1 || loading}
                  onClick={() => handlePageChange(page - 1)}
                  title="Poprzednia strona"
                >
                  &laquo;
                </button>
                <button
                  type="button"
                  className="btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
                  disabled={page >= totalPages || loading}
                  onClick={() => handlePageChange(page + 1)}
                  title="Następna strona"
                >
                  &raquo;
                </button>
              </div>
            </div>
          </div>

          {/* Tabela zgłoszeń (Widok DESKTOP: 6 kolumn) */}
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
                  <TableSkeleton rows={5} />
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 px-4">
                      <TicketEmptyState
                        hasActiveFilters={hasActiveFilters}
                        onClearFilters={handleClearAllFilters}
                        defaultMessage={emptyMessage}
                      />
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setDetailsDrawerTicket(t)}
                      className="hover:bg-page transition-colors cursor-pointer"
                      title="Kliknij, aby otworzyć panel boczny ze szczegółami"
                    >
                      <td className="text-center font-bold text-ink">
                        <span className="font-bold text-ink hover:text-primary">#{t.id}</span>
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
                        <div className="min-w-[150px]">
                          {t.przypisany_pracownik_username ? (
                            <span className="font-semibold text-primary-dark text-xs whitespace-normal break-words">
                              👤 {t.przypisany_pracownik_username}
                            </span>
                          ) : (
                            <span className="text-muted text-xs italic">— Nieprzypisane —</span>
                          )}
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <StatusControl ticket={t} user={user} {...modalHandlers} />
                      </td>
                      <td>
                        <div className="text-xs text-ink font-medium whitespace-nowrap">
                          {t.created_at ? new Date(t.created_at).toLocaleDateString('pl-PL') : '-'}
                        </div>
                        <div className="text-[0.7rem] text-muted">
                          {t.created_at
                            ? new Date(t.created_at).toLocaleTimeString('pl-PL', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : ''}
                        </div>
                        {user?.role === 'admin' && (
                          <div
                            className="mt-2 flex items-center gap-1.5 flex-wrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DeleteTicketButton
                              id={t.id}
                              deletingId={deletingId}
                              onDelete={handleDeleteTicket}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Karty zgłoszeń (Widok MOBILE / TELEFON) */}
          <div className="block md:hidden space-y-3">
            {loading ? (
              <CardsSkeleton count={3} />
            ) : tickets.length === 0 ? (
              <div className="bg-card rounded-xl border border-line p-6 text-center">
                <TicketEmptyState
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={handleClearAllFilters}
                  defaultMessage={emptyMessage}
                />
              </div>
            ) : (
              tickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setDetailsDrawerTicket(t)}
                  className="bg-card rounded-xl border border-line p-4 shadow-xs space-y-3 hover:border-primary/50 transition-colors cursor-pointer"
                  title="Kliknij, aby otworzyć panel boczny ze szczegółami"
                >
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-line">
                    <div>
                      <span className="text-base font-bold text-ink">#{t.id}</span>
                      <div className="text-[0.7rem] text-muted mt-0.5">
                        {t.created_at ? new Date(t.created_at).toLocaleString('pl-PL') : '-'}
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>

                  <div className="text-xs space-y-0.5">
                    <span className="text-[0.7rem] text-muted uppercase font-semibold block">Klient</span>
                    <div className="font-semibold text-ink text-sm">
                      {t.imie} {t.nazwisko}
                    </div>
                    {t.nazwa_firmy && (
                      <div className="text-primary-dark font-semibold">Firma: {t.nazwa_firmy}</div>
                    )}
                    <div className="text-muted">
                      {t.numer_telefonu} &bull; {t.email}
                    </div>
                  </div>

                  <div className="text-xs bg-page p-2.5 rounded-lg border border-line">
                    <span className="text-[0.7rem] text-muted uppercase font-semibold block mb-0.5">
                      Produkt
                    </span>
                    <div className="font-semibold text-primary-dark">
                      {t.przedmiot_zgloszenia || '—'}
                    </div>
                    {t.numer_seryjny && (
                      <div className="text-ink font-medium mt-0.5">SN: {t.numer_seryjny}</div>
                    )}
                    {t.opis_usterki && (
                      <div
                        className="text-muted mt-1.5 pt-1.5 border-t border-line/60 ticket-excerpt"
                        title={t.opis_usterki}
                      >
                        <span className="font-semibold text-ink">Usterka: </span>
                        {t.opis_usterki}
                      </div>
                    )}
                  </div>

                  <div className="text-xs">
                    <span className="text-[0.7rem] text-muted uppercase font-semibold block mb-1">
                      Przypisany
                    </span>
                    <div className="flex items-center gap-2">
                      {t.przypisany_pracownik_username ? (
                        <span className="font-semibold text-primary-dark">
                          👤 {t.przypisany_pracownik_username}
                        </span>
                      ) : (
                        <span className="text-muted italic">— Nieprzypisane —</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                    <StatusControl ticket={t} user={user} {...modalHandlers} />
                  </div>

                  {user?.role === 'admin' && (
                    <div
                      className="pt-2 border-t border-line flex items-center justify-end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DeleteTicketButton
                        id={t.id}
                        deletingId={deletingId}
                        onDelete={handleDeleteTicket}
                        mobile
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Paginacja dolna */}
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
                className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
                disabled={page <= 1 || loading}
                onClick={() => handlePageChange(page - 1)}
                title="Poprzednia strona"
              >
                &laquo; Poprzednia
              </button>
              <button
                type="button"
                className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
                disabled={page >= totalPages || loading}
                onClick={() => handlePageChange(page + 1)}
                title="Następna strona"
              >
                Następna &raquo;
              </button>
            </div>
          </div>

          {detailsDrawerTicket && (
            <TicketDetailsDrawer
              key={detailsDrawerTicket.id}
              ticket={detailsDrawerTicket}
              user={user}
              onClose={() => setDetailsDrawerTicket(null)}
              {...modalHandlers}
              onOpenTrackingModal={setTrackingModalTicket}
            />
          )}

          {assignModalTicket && (
            <AssignWorkerModal
              key={assignModalTicket.id}
              ticket={assignModalTicket}
              workers={workers}
              onClose={() => setAssignModalTicket(null)}
              onAssign={handleAssignWorker}
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

          {shipModalTicket && (
            <ShipModal
              key={shipModalTicket.id}
              ticket={shipModalTicket}
              mode="ship"
              onClose={() => setShipModalTicket(null)}
              onShip={handleShipSubmit}
            />
          )}

          {rollbackModalData && (
            <RollbackStatusModal
              key={rollbackModalData.ticket.id}
              ticket={rollbackModalData.ticket}
              rollbackActions={rollbackModalData.actions}
              onClose={() => setRollbackModalData(null)}
              onConfirm={handleRollbackSubmit}
            />
          )}

          {trackingModalTicket && (
            <ShipModal
              key={`edit-${trackingModalTicket.id}`}
              ticket={trackingModalTicket}
              mode="edit"
              onClose={() => setTrackingModalTicket(null)}
              onSave={handleSaveTrackingNumber}
            />
          )}
        </>
      )}

      {showOwnPasswordModal && (
        <PasswordModal
          onClose={() => setShowOwnPasswordModal(false)}
          showAlert={showAlert}
        />
      )}
    </div>
  );
}
