// =========================================================================
// API CLIENT - Obsługa wszystkich wywołań sieciowych REST API
// =========================================================================

const API_BASE = '/api';

// Rejestr słuchaczy wylogowania przy 401 Unauthorized
let unauthorizedHandlers = [];

export function onUnauthorized(callback) {
  unauthorizedHandlers.push(callback);
  return () => {
    unauthorizedHandlers = unauthorizedHandlers.filter(cb => cb !== callback);
  };
}

function notifyUnauthorized() {
  localStorage.removeItem('serwis_token');
  localStorage.removeItem('serwis_user');
  unauthorizedHandlers.forEach(cb => {
    try {
      cb();
    } catch (err) {
      console.error('Błąd podczas obsługi wylogowania:', err);
    }
  });
}

/**
 * Podstawowa funkcja pobierająca z automatycznym dołączaniem tokenu JWT
 * oraz wykrywaniem 401 Unauthorized.
 */
export async function apiFetch(endpoint, options = {}) {
  const currentToken = localStorage.getItem('serwis_token');
  const headers = {
    ...(options.headers || {}),
    ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {})
  };

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    notifyUnauthorized();
    return null;
  }

  return response;
}

/**
 * Pomocnik apiFetch parsujący odpowiedź JSON i rzucający błąd przy !response.ok
 */
export async function apiJson(endpoint, options = {}, fallbackError = 'Wystąpił nieoczekiwany błąd serwera.') {
  const response = await apiFetch(endpoint, options);
  if (!response) {
    return null; // Sesja wygasła (401), użytkownik został wylogowany
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || fallbackError);
  }

  return data;
}

export async function apiPatch(endpoint, body, fallbackError) {
  return apiJson(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, fallbackError);
}

export async function apiPost(endpoint, body, fallbackError) {
  return apiJson(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, fallbackError);
}

// =========================================================================
// MODUŁY API DEDYKOWANE POSZCZEGÓLNYM OBSZAROM
// =========================================================================

export const authApi = {
  async login(username, password) {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Nieprawidłowe dane logowania.');
    }
    return data;
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
  // Publiczne dodawanie zgłoszenia
  async createTicket(ticketData) {
    const response = await fetch(`${API_BASE}/zgloszenia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticketData)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Błąd podczas wysyłania zgłoszenia.');
    }
    return data;
  },

  // Pobieranie listy zgłoszeń z filtrami i paginacją
  async getTickets(params = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('strona', params.page);
    q.set('limit', params.limit || '25');
    if (params.search && params.search.trim()) q.set('szukaj', params.search.trim());
    if (params.status) q.set('status', params.status);
    if (params.worker) q.set('pracownik', params.worker);
    if (params.sort) q.set('sort', params.sort);

    return apiJson(`/zgloszenia?${q.toString()}`, {}, 'Błąd podczas pobierania zgłoszeń.');
  },

  // Szczegóły zgłoszenia
  async getTicketById(id) {
    return apiJson(`/zgloszenia/${id}`, {}, 'Błąd podczas pobierania szczegółów zgłoszenia.');
  },

  // Przypisanie pracownika do zgłoszenia
  async assignWorker(ticketId, pracownikId) {
    return apiPatch(`/zgloszenia/${ticketId}/przypisz`, { pracownik_id: pracownikId || null }, 'Nie udało się przypisać pracownika.');
  },

  // Zatwierdzenie naprawy (przekazanie do statusu 'do_wysylki')
  async submitRepair(ticketId, opisNaprawy) {
    return apiPatch(`/zgloszenia/${ticketId}/naprawione`, { opis_naprawy: opisNaprawy }, 'Nie udało się zatwierdzić naprawy.');
  },

  // Zmiana statusu zgłoszenia
  async updateStatus(ticketId, status, extraData = {}) {
    return apiPatch(`/zgloszenia/${ticketId}/status`, { status, ...extraData }, 'Nie udało się zaktualizować statusu.');
  },

  // Zapisanie lub zmiana numeru listu przewozowego
  async saveTrackingNumber(ticketId, currentStatus, numerListu) {
    return this.updateStatus(ticketId, currentStatus, { numer_listu: numerListu });
  },

  // Usunięcie zgłoszenia (admin)
  async deleteTicket(ticketId) {
    return apiJson(`/zgloszenia/${ticketId}`, {
      method: 'DELETE'
    }, 'Nie udało się usunąć zgłoszenia.');
  },

  // Historia zdarzeń zgłoszenia
  async getHistory(ticketId) {
    return apiJson(`/zgloszenia/${ticketId}/historia`, {}, 'Błąd pobierania historii zgłoszenia.');
  }
};

export const workerApi = {
  async getWorkers() {
    return apiJson('/pracownicy', {}, 'Błąd podczas pobierania listy pracowników.');
  }
};

export const userApi = {
  async getUsers() {
    return apiJson('/admin/users', {}, 'Błąd podczas pobierania listy użytkowników.');
  },

  async createUser({ username, password, role }) {
    return apiPost('/admin/users', { username, password, role }, 'Nie udało się utworzyć użytkownika.');
  },

  async updateRole(userId, role) {
    return apiPatch(`/admin/users/${userId}`, { role }, 'Nie udało się zmienić roli użytkownika.');
  },

  async toggleStatus(userId, aktywny) {
    return apiPatch(`/admin/users/${userId}/status`, { aktywny }, 'Nie udało się zmienić statusu konta.');
  },

  async resetPassword(userId, password) {
    return apiPatch(`/admin/users/${userId}/haslo`, { password }, 'Nie udało się zmienić hasła użytkownika.');
  },

  async changeOwnPassword({ currentPassword, newPassword }) {
    return apiPatch('/profil/haslo', { currentPassword, newPassword }, 'Nie udało się zmienić własnego hasła.');
  }
};
