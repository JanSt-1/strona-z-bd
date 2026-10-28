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

export function validatePurchaseDate(dateStr) {
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
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  if (parsedDate > today) {
    return 'Data zakupu nie może być datą z przyszłości.';
  }
  return null;
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
  const forwardAction = repairAction || shipAction || assignAction;
  const rollbackActions = actions.filter((a) => a.typ === 'cofnij');

  const isAssignAction = Boolean(assignAction);
  const isRepairAction = Boolean(repairAction);
  const isShipAction = Boolean(shipAction);

  return {
    curStatus,
    actions,
    assignAction,
    repairAction,
    shipAction,
    forwardAction,
    rollbackActions,
    isAssignAction,
    isRepairAction,
    isShipAction,
    hasForwardButton: isAssignAction || isRepairAction || isShipAction
  };
}
