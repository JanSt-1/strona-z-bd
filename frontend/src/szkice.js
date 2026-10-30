// Szkice w sessionStorage: opis naprawy i numer listu przewozowego przeżywają wygaśnięcie sesji i przeładowanie karty, znikają po udanym zapisie.
// Klucze zawierają ID użytkownika, więc inna osoba zalogowana w tej samej karcie nie zobaczy cudzego szkicu.

const RESTORE_KEY = 'serwis_przywroc_okno';

// Okna ze szkicem: naprawa, "Oznacz jako wysłane" i edycja numeru listu - każde ma osobny szkic
const DRAFT_PREFIXES = {
  repair: 'serwis_szkic_naprawy',
  ship: 'serwis_szkic_wysylki',
  tracking: 'serwis_szkic_numeru_listu'
};

export const modalDraftKey = (kind, userId, ticketId) => `${DRAFT_PREFIXES[kind]}_${userId}_${ticketId}`;

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

// Zapamiętuje otwarte okno, żeby po ponownym zalogowaniu otworzyć je z zachowanym szkicem
export function rememberOpenModal(kind, userId, ticketId) {
  safeStorage((s) => s.setItem(RESTORE_KEY, JSON.stringify({ kind, userId, ticketId })));
}

export function forgetOpenModal() {
  safeStorage((s) => s.removeItem(RESTORE_KEY));
}

// { kind, ticketId } okna, które było otwarte w chwili wylogowania tego samego użytkownika
export function pendingModal(userId) {
  const saved = safeStorage((s) => JSON.parse(s.getItem(RESTORE_KEY) || 'null'));
  if (!saved || saved.userId !== userId || !Object.hasOwn(DRAFT_PREFIXES, saved.kind)) return null;
  return { kind: saved.kind, ticketId: saved.ticketId };
}
