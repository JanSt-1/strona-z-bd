// Szkic opisu naprawy w sessionStorage: przeżywa wygaśnięcie sesji i przeładowanie karty, znika po udanym zapisie.
// Klucze zawierają ID użytkownika, więc inna osoba zalogowana w tej samej karcie nie zobaczy cudzego szkicu.

const RESTORE_KEY = 'serwis_przywroc_naprawe';

export const repairDraftKey = (userId, ticketId) => `serwis_szkic_naprawy_${userId}_${ticketId}`;

function safeStorage(action) {
  try {
    return action(window.sessionStorage);
  } catch {
    return null;
  }
}

export function readDraft(key) {
  return safeStorage((s) => s.getItem(key));
}

export function writeDraft(key, value) {
  safeStorage((s) => (value ? s.setItem(key, value) : s.removeItem(key)));
}

export function clearDraft(key) {
  safeStorage((s) => s.removeItem(key));
}

// Zapamiętuje otwarte okno naprawy, żeby po ponownym zalogowaniu otworzyć je z zachowanym szkicem
export function rememberOpenRepair(userId, ticketId) {
  safeStorage((s) => s.setItem(RESTORE_KEY, JSON.stringify({ userId, ticketId })));
}

export function forgetOpenRepair() {
  safeStorage((s) => s.removeItem(RESTORE_KEY));
}

// ID zlecenia, którego okno naprawy było otwarte w chwili wylogowania tego samego użytkownika
export function pendingRepairTicketId(userId) {
  const saved = safeStorage((s) => JSON.parse(s.getItem(RESTORE_KEY) || 'null'));
  return saved && saved.userId === userId ? saved.ticketId : null;
}
