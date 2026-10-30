export const PRZEDMIOTY_LISTA = [
  'Monitor interaktywny myBoard Titan (Android 15)',
  'Monitor interaktywny myBoard Grey Arrow (Android 13)',
  'Monitor interaktywny myBoard Panda (Android 13)',
  'Monitor interaktywny myBoard Black Arrow (Android 13)',
  'Monitor interaktywny myBoard Grey Rock (Android 11)',
  'Monitor interaktywny myBoard Grey Rock 2.0 (Android 11)',
  'Monitor interaktywny myBoard White Arrow (Android 14)',
  'Monitor interaktywny myBoard Panda 2.0 (Android 14)',
  'Monitor interaktywny myBoard Black (Android 8)',
  'Monitor interaktywny myBoard Silver (Android 9)',
  'Monitor interaktywny myBoard Grey UP (Android 8)',
  'Monitor interaktywny (Model spoza listy)',
  'Tablica interaktywna myBoard Silver',
  'Tablica interaktywna myBoard Black',
  'Akcesoria do tablic interaktywnych myBoard',
  'Akcesoria dla monitorów interaktywnych myBoard',
  'Pracownie językowe',
  'Podłoga interaktywna SmartFloor',
  'Meble',
  'Systemy konferencyjne',
  'Projektory',
  'Laptop',
  'Inne'
];

export function isSerialNumberAllowed(product) {
  if (!product) return false;
  const lower = product.toLowerCase();
  return (
    !lower.includes('akcesoria') &&
    (lower.includes('monitor interaktywny') || lower.includes('tablica interaktywna'))
  );
}

// Reguły formularza zgłoszenia - te same wartości ma serwer (app.js); test w app.test.js pilnuje zgodności
export const FIELD_LABELS = {
  imie: 'Imię',
  nazwisko: 'Nazwisko',
  nazwa_firmy: 'Nazwa firmy',
  adres: 'Adres',
  kod_pocztowy: 'Kod pocztowy',
  miasto: 'Miasto',
  numer_telefonu: 'Telefon kontaktowy',
  telefon_stacjonarny: 'Telefon stacjonarny',
  email: 'E-mail',
  przedmiot_zgloszenia: 'Przedmiot zgłoszenia',
  numer_seryjny: 'Numer seryjny (S/N)',
  data_zakupu: 'Data zakupu',
  numer_fv: 'Numer faktury / paragonu',
  nip: 'NIP',
  opis_usterki: 'Opis usterki'
};

export const FIELD_MAX_LENGTHS = {
  imie: 50,
  nazwisko: 50,
  nazwa_firmy: 100,
  adres: 500,
  kod_pocztowy: 6,
  miasto: 100,
  numer_telefonu: 20,
  email: 100,
  przedmiot_zgloszenia: 100,
  numer_seryjny: 100,
  data_zakupu: 10,
  numer_fv: 50,
  nip: 10,
  opis_usterki: 5000
};

// Litery dowolnego alfabetu (José, Müller), spacja, łącznik i apostrof prosty lub typograficzny (O’Brien z iPhone'a)
export const NAME_REGEX = /^[\p{L}\p{M}\s'’-]+$/u;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PHONE_PREFIX = '+48 ';

// Wyciąga 9 cyfr numeru komórkowego z tego, co jest w polu (także po wklejeniu numeru z prefiksem kraju).
// Stały prefiks "+48 " jest zdejmowany przed wyciągnięciem cyfr, a 0048/48 tylko gdy po nim zostaje pełny numer,
// żeby nie uciąć cyfr numeru zaczynającego się od 48 (np. stacjonarny z Radomia).
export function normalizePhoneDigits(value) {
  let rest = String(value ?? '');
  if (rest.startsWith(PHONE_PREFIX)) rest = rest.slice(PHONE_PREFIX.length);
  let digits = rest.replace(/\D/g, '');
  if (digits.startsWith('0048') && digits.length >= 13) digits = digits.slice(4);
  else if (digits.startsWith('48') && digits.length >= 11) digits = digits.slice(2);
  return digits.slice(0, 9);
}

export function formatPhone(digits) {
  return PHONE_PREFIX + [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(' ');
}

// Dzisiejsza data (RRRR-MM-DD) w Polsce, niezależnie od strefy czasowej przeglądarki
export function todayInPoland(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(now);
}

export function validatePurchaseDate(dateStr, now = new Date()) {
  if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return 'Proszę wybrać datę zakupu sprzętu z kalendarza.';
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    return 'Pole "Data zakupu" zawiera nieprawidłową datę (nie istnieje w kalendarzu).';
  }
  if (dateStr > todayInPoland(now)) {
    return 'Data zakupu nie może być datą z przyszłości.';
  }
  return null;
}

// Zwraca pierwszy błąd w kolejności pól na formularzu: { field: id pola do podświetlenia, message }
export function validateTicketForm(formData) {
  const value = (name) => (formData[name] || '').trim();
  const label = (name) => `Pole „${FIELD_LABELS[name]}”`;
  const hasLandlineInput = Boolean(formData.telefon_kierunkowy || formData.telefon_firmowy_7);
  const snActive = isSerialNumberAllowed(formData.przedmiot_zgloszenia);
  const dateErr = validatePurchaseDate(formData.data_zakupu);

  const checks = [
    ...['imie', 'nazwisko'].flatMap((name) => [
      [name, !value(name), `${label(name)} jest wymagane.`],
      [name, !NAME_REGEX.test(value(name)), `${label(name)} może zawierać wyłącznie litery, spacje, łącznik i apostrof.`]
    ]),
    ['numer_telefonu', normalizePhoneDigits(formData.numer_telefonu).length !== 9, 'Proszę podać pełny, 9-cyfrowy numer telefonu po prefiksie +48.'],
    ['email', !value('email'), `${label('email')} jest wymagane.`],
    ['email', !EMAIL_REGEX.test(value('email')), 'Proszę podać poprawny adres e-mail (np. jan.kowalski@example.com).'],
    ['adres', !value('adres'), `${label('adres')} jest wymagane.`],
    ['kod_pocztowy', !/^\d{2}-\d{3}$/.test(value('kod_pocztowy')), 'Kod pocztowy musi mieć format XX-XXX (np. 00-001).'],
    ['miasto', !value('miasto'), `${label('miasto')} jest wymagane.`],
    ['nip', !/^\d{10}$/.test(value('nip')), 'Pole „NIP” jest wymagane i musi składać się z dokładnie 10 cyfr (bez myślników).'],
    ['telefon_kierunkowy', hasLandlineInput && !formData.telefon_kierunkowy, 'Proszę wybrać 2-cyfrowy numer kierunkowy dla telefonu stacjonarnego.'],
    ['telefon_firmowy_7', hasLandlineInput && formData.telefon_firmowy_7.length < 7, 'Dla telefonu stacjonarnego należy podać pełne 7 cyfr po numerze kierunkowym.'],
    ['data_zakupu', Boolean(dateErr), dateErr],
    ['numer_fv', !value('numer_fv'), `${label('numer_fv')} jest wymagane.`],
    ['przedmiot_zgloszenia', !formData.przedmiot_zgloszenia, 'Proszę wybrać przedmiot zgłoszenia z listy.'],
    ['numer_seryjny', snActive && !value('numer_seryjny'), `${label('numer_seryjny')} jest obowiązkowe dla wybranego przedmiotu zgłoszenia.`],
    ['opis_usterki', !value('opis_usterki'), `${label('opis_usterki')} jest wymagane.`],
    ...Object.keys(FIELD_MAX_LENGTHS)
      .filter((name) => name !== 'numer_telefonu')
      .map((name) => [name, value(name).length > FIELD_MAX_LENGTHS[name], `${label(name)} może mieć maksymalnie ${FIELD_MAX_LENGTHS[name]} znaków.`]),
    ['zgoda_rodo', !formData.zgoda_rodo, 'Wymagane jest potwierdzenie zapoznania się z informacją o przetwarzaniu danych osobowych.']
  ];
  const failed = checks.find(([, invalid]) => invalid);
  return failed ? { field: failed[0], message: failed[2] } : null;
}

export const NUMERY_KIERUNKOWE = [
  ['12', 'Kraków'], ['13', 'Krosno'], ['14', 'Tarnów'], ['15', 'Tarnobrzeg'],
  ['16', 'Przemyśl'], ['17', 'Rzeszów'], ['18', 'Nowy Sącz'], ['22', 'Warszawa'],
  ['23', 'Ciechanów'], ['24', 'Płock'], ['25', 'Siedlce'], ['29', 'Ostrołęka'],
  ['32', 'Katowice'], ['33', 'Bielsko-Biała'], ['34', 'Częstochowa'], ['41', 'Kielce'],
  ['42', 'Łódź'], ['43', 'Sieradz'], ['44', 'Piotrków Trybunalski'], ['46', 'Skierniewice'],
  ['48', 'Radom'], ['52', 'Bydgoszcz'], ['54', 'Włocławek'], ['55', 'Elbląg'],
  ['56', 'Toruń'], ['58', 'Gdańsk'], ['59', 'Słupsk'], ['61', 'Poznań'],
  ['62', 'Kalisz'], ['63', 'Konin'], ['65', 'Leszno'], ['67', 'Piła'],
  ['68', 'Zielona Góra'], ['71', 'Wrocław'], ['74', 'Wałbrzych'], ['75', 'Jelenia Góra'],
  ['76', 'Legnica'], ['77', 'Opole'], ['81', 'Lublin'], ['82', 'Chełm'],
  ['83', 'Biała Podlaska'], ['84', 'Zamość'], ['85', 'Białystok'], ['86', 'Łomża'],
  ['87', 'Suwałki'], ['89', 'Olsztyn'], ['91', 'Szczecin'], ['94', 'Koszalin'],
  ['95', 'Gorzów Wielkopolski']
].map(([code, miasto]) => ({ code, miasto }));

export const HISTORY_ACTION_LABELS = {
  utworzenie: 'Utworzenie',
  przypisanie: 'Przypisanie',
  naprawa: 'Naprawa',
  wysyłka: 'Wysyłka',
  zmiana_numeru_listu: 'Zmiana numeru listu',
  zmiana_statusu: 'Zmiana statusu',
  usunięcie: 'Usunięcie'
};

export const STATUS_LABELS = {
  nowe: 'Nowe',
  w_realizacji: 'W realizacji',
  do_wysylki: 'Do wysyłki',
  zakończone: 'Zakończone'
};

export function formatDateTime(dateVal) {
  if (!dateVal) return '—';
  const dt = new Date(dateVal);
  if (isNaN(dt.getTime())) {
    const fallback = new Date(String(dateVal).replace(' ', 'T'));
    if (!isNaN(fallback.getTime())) {
      return fallback.toLocaleString('pl-PL');
    }
    return String(dateVal);
  }
  return dt.toLocaleString('pl-PL');
}

export function formatDate(dateVal) {
  if (!dateVal) return '—';
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    const [y, m, d] = dateVal.split('-');
    return `${d}.${m}.${y}`;
  }
  const dt = new Date(dateVal);
  if (isNaN(dt.getTime())) {
    const fallback = new Date(String(dateVal).replace(' ', 'T'));
    if (!isNaN(fallback.getTime())) {
      return fallback.toLocaleDateString('pl-PL');
    }
    return String(dateVal);
  }
  return dt.toLocaleDateString('pl-PL');
}

export const EMPTY_TICKET_FORM = {
  imie: '',
  nazwisko: '',
  nazwa_firmy: '',
  numer_telefonu: '+48 ',
  email: '',
  adres: '',
  kod_pocztowy: '',
  miasto: '',
  nip: '',
  telefon_kierunkowy: '',
  telefon_firmowy_7: '',
  przedmiot_zgloszenia: '',
  numer_seryjny: '',
  data_zakupu: '',
  numer_fv: '',
  opis_usterki: '',
  website: '',
  zgoda_rodo: false
};

export function getTicketActionState(ticket) {
  const curStatus = ticket?.status || 'nowe';
  const actions = Array.isArray(ticket?.dozwolone_akcje) ? ticket.dozwolone_akcje : [];
  const assignAction = actions.find((a) => a.typ === 'przypisanie' || a.akcja === 'przypisz') || null;
  const repairAction = actions.find((a) => a.typ === 'naprawa' || a.akcja === 'naprawione') || null;
  const shipAction = actions.find((a) => a.typ === 'wysylka' || a.akcja === 'wyslij') || null;
  const rollbackActions = actions.filter((a) => a.typ === 'cofnij');
  const trackingAction = actions.find((a) => a.akcja === 'edytuj_numer_listu') || null;

  const isAssignAction = Boolean(assignAction);
  const isRepairAction = Boolean(repairAction);
  const isShipAction = Boolean(shipAction);

  return {
    curStatus,
    actions,
    assignAction,
    repairAction,
    shipAction,
    rollbackActions,
    trackingAction,
    isAssignAction,
    isRepairAction,
    isShipAction,
    hasForwardButton: isAssignAction || isRepairAction || isShipAction
  };
}
