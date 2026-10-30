// Treści prawne i organizacyjne formularza zgłoszeniowego - do uzupełnienia przez właściciela serwisu.
// Wartości z literą X w nawiasach kwadratowych to zaślepki: `npm run check:placeholders` zwraca błąd,
// dopóki którakolwiek zostanie w frontend/src lub frontend/dist.
// Treść klauzuli jest szablonem art. 13 RODO i przed publikacją wymaga weryfikacji przez administratora danych.

export const CZAS_KONTAKTU_DNI_ROBOCZYCH = '[X]';

export const ADMINISTRATOR_DANYCH = {
  nazwa: '[X]',
  adres: '[X]',
  email: '[X]',
  // Dane inspektora ochrony danych (IOD) - null, jeśli administrator nie wyznaczył IOD
  iod: null
};

export const OKRES_PRZECHOWYWANIA = '[X]';

export const KLAUZULA_INFORMACYJNA = [
  `Do uzupełnienia ${ADMINISTRATOR_DANYCH.nazwa}, ${ADMINISTRATOR_DANYCH.adres}, ${ADMINISTRATOR_DANYCH.email}.`,
  ...(ADMINISTRATOR_DANYCH.iod ? [`Do uzupełnienia: ${ADMINISTRATOR_DANYCH.iod}.`] : []),
  'Do uzupełnienia',
  'Do uzupełnienia',
  ` ${OKRES_PRZECHOWYWANIA}.`,
];
