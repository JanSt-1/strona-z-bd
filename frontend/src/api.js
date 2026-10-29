// =========================================================================
// API CLIENT - Obsługa wszystkich wywołań sieciowych REST API
// =========================================================================

const API_BASE = '/api';
const NETWORK_ERROR_MESSAGE =
  'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.';

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
}

let unauthorizedHandlers = [];

export function onUnauthorized(callback) {
  unauthorizedHandlers.push(callback);
  return () => {
    unauthorizedHandlers = unauthorizedHandlers.filter((cb) => cb !== callback);
  };
}

function notifyUnauthorized() {
  authApi.clearSession();
  unauthorizedHandlers.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error('Błąd podczas obsługi wylogowania:', err);
    }
  });
}

export async function apiFetch(endpoint, options = {}) {
  const currentToken = localStorage.getItem('serwis_token');
  const headers = {
    ...(options.headers || {}),
    ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {})
  };

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const response = await safeFetch(url, { ...options, headers });

  if (response.status === 401) {
    notifyUnauthorized();
    return null;
  }

  return response;
}

export async function apiJson(
  endpoint,
  options = {},
  fallbackError = 'Wystąpił nieoczekiwany błąd serwera.'
) {
  const response = await apiFetch(endpoint, options);
  if (!response) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || fallbackError);
  }
  return data;
}

export function apiPatch(endpoint, body, fallbackError) {
  return apiJson(
    endpoint,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    fallbackError
  );
}

export function apiPost(endpoint, body, fallbackError) {
  return apiJson(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    fallbackError
  );
}

async function publicPost(endpoint, body, fallbackError) {
  const response = await safeFetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || fallbackError);
  }
  return data;
}

export const authApi = {
  login(username, password) {
    return publicPost('/login', { username, password }, 'Nieprawidłowe dane logowania.');
  },
  getToken() {
    return localStorage.getItem('serwis_token');
  },
  getUser() {
    try {
      return JSON.parse(localStorage.getItem('serwis_user') || 'null');
    } catch {
      return null;
    }
  },
  setSession(token, user) {
    localStorage.setItem('serwis_token', token);
    localStorage.setItem('serwis_user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('serwis_token');
    localStorage.removeItem('serwis_user');
  }
};

export const ticketApi = {
  createTicket(ticketData) {
    return publicPost('/zgloszenia', ticketData, 'Błąd podczas wysyłania zgłoszenia.');
  },
  getTickets(params = {}) {
    const q = new URLSearchParams({ limit: String(params.limit || 25) });
    if (params.page) q.set('strona', params.page);
    if (params.search?.trim()) q.set('szukaj', params.search.trim());
    if (params.status) q.set('status', params.status);
    if (params.worker) q.set('pracownik', params.worker);
    if (params.sort) q.set('sort', params.sort);
    return apiJson(`/zgloszenia?${q.toString()}`, {}, 'Błąd podczas pobierania zgłoszeń.');
  },
  getTicketById(id) {
    return apiJson(`/zgloszenia/${id}`, {}, 'Błąd podczas pobierania szczegółów zgłoszenia.');
  },
  assignWorker(ticketId, pracownikId) {
    return apiPatch(
      `/zgloszenia/${ticketId}/przypisz`,
      { pracownik_id: pracownikId || null },
      'Nie udało się przypisać pracownika.'
    );
  },
  submitRepair(ticketId, opisNaprawy) {
    return apiPatch(
      `/zgloszenia/${ticketId}/naprawione`,
      { opis_naprawy: opisNaprawy },
      'Nie udało się zatwierdzić naprawy.'
    );
  },
  updateStatus(ticketId, status, extraData = {}) {
    return apiPatch(
      `/zgloszenia/${ticketId}/status`,
      { status, ...extraData },
      'Nie udało się zaktualizować statusu.'
    );
  },
  saveTrackingNumber(ticketId, numerListu) {
    return apiPatch(
      `/zgloszenia/${ticketId}/numer-listu`,
      { numer_listu: numerListu },
      'Nie udało się zapisać numeru listu przewozowego.'
    );
  },
  deleteTicket(ticketId) {
    return apiJson(`/zgloszenia/${ticketId}`, { method: 'DELETE' }, 'Nie udało się usunąć zgłoszenia.');
  }
};

export const workerApi = {
  getWorkers() {
    return apiJson('/pracownicy', {}, 'Błąd podczas pobierania listy pracowników.');
  }
};

export const userApi = {
  getUsers() {
    return apiJson('/admin/users', {}, 'Błąd podczas pobierania listy użytkowników.');
  },
  createUser({ username, password, role }) {
    return apiPost('/admin/users', { username, password, role }, 'Nie udało się utworzyć użytkownika.');
  },
  updateRole(userId, role) {
    return apiPatch(`/admin/users/${userId}`, { role }, 'Nie udało się zmienić roli użytkownika.');
  },
  toggleStatus(userId, aktywny) {
    return apiPatch(`/admin/users/${userId}/status`, { aktywny }, 'Nie udało się zmienić statusu konta.');
  },
  resetPassword(userId, password) {
    return apiPatch(`/admin/users/${userId}/haslo`, { password }, 'Nie udało się zmienić hasła użytkownika.');
  },
  changeOwnPassword({ currentPassword, newPassword }) {
    return apiPatch('/profil/haslo', { currentPassword, newPassword }, 'Nie udało się zmienić własnego hasła.');
  }
};
