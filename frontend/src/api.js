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

export const SESSION_EXPIRED_MESSAGE =
  'Sesja wygasła lub została zakończona. Zaloguj się ponownie.';

let unauthorizedHandlers = [];
let sessionHandlers = [];

function subscribe(list, callback) {
  list.push(callback);
  return () => {
    const index = list.indexOf(callback);
    if (index !== -1) list.splice(index, 1);
  };
}

function notify(list, ...args) {
  list.slice().forEach((cb) => {
    try {
      cb(...args);
    } catch (err) {
      console.error('Błąd podczas obsługi zmiany sesji:', err);
    }
  });
}

// Wywoływane z komunikatem dla ekranu logowania, gdy serwer odrzuci token (401)
export function onUnauthorized(callback) {
  return subscribe(unauthorizedHandlers, callback);
}

// Wywoływane z (token, user), gdy w tej karcie zmienił się token lub dane użytkownika (np. nowa rola z /api/me)
export function onSessionUpdated(callback) {
  return subscribe(sessionHandlers, callback);
}

function notifyUnauthorized(message) {
  authApi.clearSession();
  notify(unauthorizedHandlers, message);
}

let refreshUserPromise = null;

// Pobiera aktualne dane użytkownika z serwera (rola z bazy, nie z localStorage); równoległe wywołania są łączone
export function refreshCurrentUser() {
  if (!refreshUserPromise) {
    refreshUserPromise = apiJson('/me', {}, 'Nie udało się pobrać danych użytkownika.')
      .then((user) => {
        const token = authApi.getToken();
        if (user && token) {
          const prev = authApi.getUser();
          if (prev?.id !== user.id || prev?.role !== user.role || prev?.username !== user.username) {
            authApi.updateSession(token, user);
          }
        }
        return user;
      })
      .catch((err) => {
        console.error('Błąd odświeżania danych użytkownika:', err);
        return null;
      })
      .finally(() => {
        refreshUserPromise = null;
      });
  }
  return refreshUserPromise;
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
    // Odrzucony token, który w międzyczasie zastąpiło logowanie w innej karcie, nie wylogowuje nowej sesji
    if (localStorage.getItem('serwis_token') === currentToken) {
      notifyUnauthorized(currentToken ? SESSION_EXPIRED_MESSAGE : null);
    }
    return null;
  }

  // 403 może oznaczać zmienioną rolę - panel pobiera aktualne dane użytkownika z /api/me
  if (response.status === 403 && currentToken && endpoint !== '/me') {
    refreshCurrentUser();
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
    const err = new Error(data.error || fallbackError);
    err.status = response.status;
    throw err;
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
  // Jak setSession, ale dodatkowo powiadamia aplikację (zdarzenie "storage" nie dociera do karty, która zapisała)
  updateSession(token, user) {
    authApi.setSession(token, user);
    notify(sessionHandlers, token, user);
  },
  me() {
    return refreshCurrentUser();
  },
  logoutEverywhere() {
    return apiPost('/wyloguj-wszedzie', {}, 'Nie udało się wylogować pozostałych sesji.');
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
  // Zmiana hasła unieważnia stare tokeny; gdy dotyczy własnego konta, serwer zwraca nowy token dla tej karty
  async resetPassword(userId, password) {
    return keepSessionFrom(
      await apiPatch(`/admin/users/${userId}/haslo`, { password }, 'Nie udało się zmienić hasła użytkownika.')
    );
  },
  async changeOwnPassword({ currentPassword, newPassword }) {
    return keepSessionFrom(
      await apiPatch('/profil/haslo', { currentPassword, newPassword }, 'Nie udało się zmienić własnego hasła.')
    );
  }
};

function keepSessionFrom(data) {
  if (data?.token && data.user) authApi.updateSession(data.token, data.user);
  return data;
}
