// =========================================================================
// LISTA PRZEDMIOTÓW ZGŁOSZENIA
// =========================================================================
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

// Sprawdza czy dla wybranego przedmiotu dozwolony jest numer seryjny
// (wyłącznie monitory interaktywne i tablice interaktywne, z wyłączeniem akcesoriów)
export function isSerialNumberAllowed(product) {
  if (!product) return false;
  const lower = product.toLowerCase();
  const isMonitor = lower.includes('monitor interaktywny') && !lower.includes('akcesoria');
  const isTablica = lower.includes('tablica interaktywna') && !lower.includes('akcesoria');
  return isMonitor || isTablica;
}

// Walidacja daty zakupu (format RRRR-MM-DD, poprawność kalendarzowa, zakaz dat z przyszłości)
export function validatePurchaseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return 'Proszę wybrać datę zakupu sprzętu z kalendarza.';
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.getUTCFullYear() !== year ||
    (parsedDate.getUTCMonth() + 1) !== month ||
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

// =========================================================================
// LISTA NUMERÓW KIERUNKOWYCH (STREF NUMERACYJNYCH)
// =========================================================================
export const NUMERY_KIERUNKOWE = [
  { code: '12', miasto: 'Kraków' },
  { code: '13', miasto: 'Krosno' },
  { code: '14', miasto: 'Tarnów' },
  { code: '15', miasto: 'Tarnobrzeg' },
  { code: '16', miasto: 'Przemyśl' },
  { code: '17', miasto: 'Rzeszów' },
  { code: '18', miasto: 'Nowy Sącz' },
  { code: '22', miasto: 'Warszawa' },
  { code: '23', miasto: 'Ciechanów' },
  { code: '24', miasto: 'Płock' },
  { code: '25', miasto: 'Siedlce' },
  { code: '29', miasto: 'Ostrołęka' },
  { code: '32', miasto: 'Katowice' },
  { code: '33', miasto: 'Bielsko-Biała' },
  { code: '34', miasto: 'Częstochowa' },
  { code: '41', miasto: 'Kielce' },
  { code: '42', miasto: 'Łódź' },
  { code: '43', miasto: 'Sieradz' },
  { code: '44', miasto: 'Piotrków Trybunalski' },
  { code: '46', miasto: 'Skierniewice' },
  { code: '48', miasto: 'Radom' },
  { code: '52', miasto: 'Bydgoszcz' },
  { code: '54', miasto: 'Włocławek' },
  { code: '55', miasto: 'Elbląg' },
  { code: '56', miasto: 'Toruń' },
  { code: '58', miasto: 'Gdańsk' },
  { code: '59', miasto: 'Słupsk' },
  { code: '61', miasto: 'Poznań' },
  { code: '62', miasto: 'Kalisz' },
  { code: '63', miasto: 'Konin' },
  { code: '65', miasto: 'Leszno' },
  { code: '67', miasto: 'Piła' },
  { code: '68', miasto: 'Zielona Góra' },
  { code: '71', miasto: 'Wrocław' },
  { code: '74', miasto: 'Wałbrzych' },
  { code: '75', miasto: 'Jelenia Góra' },
  { code: '76', miasto: 'Legnica' },
  { code: '77', miasto: 'Opole' },
  { code: '81', miasto: 'Lublin' },
  { code: '82', miasto: 'Chełm' },
  { code: '83', miasto: 'Biała Podlaska' },
  { code: '84', miasto: 'Zamość' },
  { code: '85', miasto: 'Białystok' },
  { code: '86', miasto: 'Łomża' },
  { code: '87', miasto: 'Suwałki' },
  { code: '89', miasto: 'Olsztyn' },
  { code: '91', miasto: 'Szczecin' },
  { code: '94', miasto: 'Koszalin' },
  { code: '95', miasto: 'Gorzów Wielkopolski' }
];

// =========================================================================
// ETYKIETY I STATUSY ZGŁOSZEŃ
// =========================================================================
export const STATUS_LABELS = {
  nowe: 'nowe',
  w_realizacji: 'w realizacji',
  do_wysylki: 'do wysyłki',
  zakończone: 'zakończone'
};

// Pusty stan formularza zgłoszenia
export const EMPTY_TICKET_FORM = {
  imie: '',
  nazwisko: '',
  nazwa_firmy: '',
  numer_telefonu: '',
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

/**
 * Zunifikowane określanie pojedynczej akcji głównej oraz akcji cofnięcia
 * dla zlecenia w zależności od statusu i uprawnień użytkownika.
 */
export function getTicketActionState(ticket, user) {
  const curStatus = ticket?.status || 'nowe';
  const actions = Array.isArray(ticket?.dozwolone_akcje) ? ticket.dozwolone_akcje : [];
  const forwardAction = actions.find((a) => a.typ !== 'cofnij');
  const rollbackActions = actions.filter((a) => a.typ === 'cofnij');
  const canAssign = user?.role === 'admin' || user?.role === 'serwisant';

  const isAssignAction =
    curStatus === 'nowe' &&
    (canAssign ||
      forwardAction?.typ === 'przypisanie' ||
      forwardAction?.akcja === 'przypisz' ||
      forwardAction?.akcja === 'rozpocznij_realizacje');

  const isRepairAction =
    curStatus === 'w_realizacji' &&
    (forwardAction?.typ === 'naprawa' ||
      forwardAction?.akcja === 'naprawione' ||
      forwardAction?.na_status === 'do_wysylki');

  const isShipAction =
    curStatus === 'do_wysylki' &&
    (forwardAction?.typ === 'wysylka' ||
      forwardAction?.akcja === 'wyslij' ||
      forwardAction?.na_status === 'zakończone');

  return {
    curStatus,
    actions,
    forwardAction,
    rollbackActions,
    isAssignAction,
    isRepairAction,
    isShipAction,
    hasForwardButton: isAssignAction || isRepairAction || isShipAction
  };
}
