# Kontekst Projektu: System Obsługi Zgłoszeń Serwisowych (Express.js + MySQL + JWT)

## 1. Przegląd i Cel Projektu
Projekt to pełny system backendowy i frontendowy (SPA) do rejestracji i kompleksowej obsługi zgłoszeń serwisowych.
Aplikacja składa się z:
- **Backendu w Express.js (v5) z architekturą Separation of Concerns**:
  - **`app.js`**: Wyodrębniona instancja aplikacji Express – konfiguracja middleware (CORS, JSON, pliki statyczne), autoryzacji JWT, kontroli dostępu RBAC, rate-limitera oraz tras API. Udostępnia metody `app.setPool()` i `app.getPool()` ułatwiające testowanie i zarządzanie pulą połączeń. Nie wywołuje `app.listen()`.
  - **`index.js`**: Punkt wejściowy uruchamiający serwer – odpowiada za wczytanie `.env`, weryfikację połączenia z bazą MySQL, automatyczną weryfikację/migrację kolumn w tabeli `zgloszenia` oraz nasłuchiwanie na wybranym porcie (`app.listen()`).
  - Asynchroniczne połączenie z bazą **MySQL** z pulą połączeń (`mysql2/promise`).
  - Publiczny endpoint przyjmowania zgłoszeń serwisowych (`POST /api/zgloszenia`) z rygorystyczną walidacją 15 pól (m.in. NIP, kod pocztowy, województwo, dozwolone kategorie sprzętu, warunkowy numer seryjny).
  - Moduł uwierzytelniania użytkowników oparty o nazwę użytkownika (`username`), haszowanie haseł **bcrypt** oraz tokeny **JWT** (`POST /api/login`) zabezpieczony **rate limiterem** (10 prób / 15 min, wyłączonym w środowisku testowym).
  - Pełna kontrola uprawnień oparta o role (RBAC): `admin`, `serwisant`, `pracownik`, `magazynier`.
  - Chronione endpointy zarządzania zgłoszeniami:
    - Pobieranie listy zgłoszeń zależne od roli (`GET /api/zgloszenia`).
    - Pobieranie listy pracowników do delegowania zadań (`GET /api/pracownicy`).
    - Przypisywanie zgłoszeń pracownikom (`PATCH /api/zgloszenia/:id/przypisz`, bez automatycznej zmiany statusu).
    - Raportowanie i opisywanie wykonanych prac naprawczych (`PATCH /api/zgloszenia/:id/naprawione`, dostępne dla `pracownik` i `admin`).
    - Aktualizacja statusu zgłoszenia wraz z obsługą numeru listu przewozowego i czasu wysyłki (`PATCH` / `PUT /api/zgloszenia/:id/status`, z blokadą dla `serwisant` i restrykcją dla `pracownik`).
    - Usuwanie zgłoszeń (tylko rola `admin`: `DELETE /api/zgloszenia/:id`).
  - Chroniony endpoint administracyjny do tworzenia kont użytkowników z dowolną rolą (`POST /api/admin/users`, tylko `admin`).
  - Serwowanie plików statycznych (`public/`) bezpośrednio przez Express.
- **Zestawu Testów Integracyjnych**:
  - Plik `app.test.js` oparty o natywny runner Node.js (`node:test`) oraz bibliotekę `supertest`.
  - Izolacja testów poprzez mockowanie zapytań SQL (`app.setPool()`), co pozwala na uruchamianie testów bez aktywnej bazy danych MySQL (np. w środowisku CI/CD).
  - Pokrycie 8 kluczowych przypadków testowych API (w tym walidacja warunkowego numeru seryjnego).
- **Narzędzi CLI**:
  - `create-user.js` do bezpiecznego tworzenia kont użytkowników w bazie z haszowaniem bcrypt dla ról: `admin`, `serwisant`, `pracownik`, `magazynier`.
  - `seed.js` do automatycznego wgrywania schematu bazy danych `schemat.sql`.
- **Frontendu SPA (React 18)**:
  - Zlokalizowany w katalogu `public/index.html` (React + ReactDOM + Babel Standalone).
  - Niezależne skalowanie kontenerów: `.container` dla formularza publicznego oraz dedykowany `.container-dashboard` dla panelu pracownika.
  - Publiczny formularz zgłoszeniowy z maskowaniem/walidacją numeru telefonu (`+48 ` i 9 cyfr), NIP-u, kodu pocztowego, listy województw i kategorii sprzętu.
  - Panel pracownika z logowaniem, tabelą zgłoszeń dostosowaną do ról (`admin`, `serwisant`, `pracownik`, `magazynier`).
  - Dedykowany przepływ statusów: pracownik samodzielnie rozpoczyna realizację przyciskiem `Rozpocznij realizację` (zmiana statusu z `nowe` na `w realizacji`), a po wykonaniu zadania klika `Oznacz jako naprawione` w kolumnie Status (usunięto nadmiarowy przycisk `Opisz naprawę` dla pracownika).
  - Serwisant ma możliwość wyłącznie przypisywania zleceń pracownikom (bez selektora i przycisków zmiany statusu).
  - Kontrolka wysyłki z polem na numer listu przewozowego (`ShipControl`) dla magazyniera.
  - Wyświetlanie informacji o dacie wysyłki oraz numerze listu przewozowego w wierszu zgłoszenia.
  - Automatyczna obsługa wygaśnięcia lub sfałszowania sesji: funkcja `handleAuthError` i `apiFetch` dynamicznie pobierają token z `localStorage.getItem('serwis_token')`, natychmiast wylogowując użytkownika w przypadku otrzymania kodu `401` lub `403`.

---

## 2. Co zostało zrobione i aktualny stan techniczny

- [x] **Backend & Baza Danych:**
  - Zainicjalizowano `package.json` ze skryptami (`start`, `dev`, `seed`, `test`).
  - Skonfigurowano zależności: `express` (v5), `mysql2`, `jsonwebtoken`, `bcrypt`, `dotenv`, `cors`, `express-rate-limit`, a w devDependencies: `supertest`.
  - Przeprowadzono architekturę **Separation of Concerns**:
    - `app.js` definiuje i eksportuje samą aplikację Express bez `app.listen()`.
    - `index.js` importuje `app.js`, weryfikuje łączność z bazą, przeprowadza automatyczną migrację brakujących kolumn tabeli `zgloszenia` i uruchamia serwer HTTP.
    - Dodano metody `app.setPool()` oraz `app.getPool()` do dynamicznej podmiany puli bazy danych.
  - Zapewniono bezpieczną obsługę `JWT_SECRET` (aplikacja zatrzymuje start serwera, gdy klucz nie jest zdefiniowany w `.env`).
  - Przygotowano pliki `.env` oraz `.env.example`.
  - Utworzono `schemat.sql` oraz skrypt `seed.js` (tworzy tabele `uzytkownicy` i `zgloszenia` z kluczami obcymi).
  - Utworzono skrypt CLI `create-user.js` do dodawania użytkowników z rolami `admin`, `serwisant`, `pracownik`, `magazynier`.
  - Zaimplementowano model ról (RBAC): middleware `authenticateToken`, `requireAdmin`, `requireAdminOrSerwisant`.
  - Zaimplementowano `loginLimiter` (`express-rate-limit`) ograniczający brute-force na `POST /api/login` (10 prób / 15 min z 1 IP, pomijany przy `NODE_ENV === 'test'`).
  - Rozszerzono model danych zgłoszenia:
    - `przypisany_pracownik_id` (relacja FK do tabeli `uzytkownicy`),
    - `opis_naprawy` oraz `opis_naprawy_data` (rejestracja przebiegu naprawy serwisowej),
    - `data_wyslania` (automatyczna data i czas wysyłki przez magazyniera),
    - `numer_listu` (opcjonalny numer listu przewozowego wprowadzany przez magazyniera).
  - Wdrożono endpointy obsługujące role:
    - `GET /api/pracownicy` (admin, serwisant),
    - `PATCH /api/zgloszenia/:id/przypisz` (admin, serwisant; przypisanie nie zmienia automatycznie statusu na 'w_realizacji'),
    - `PATCH /api/zgloszenia/:id/naprawione` (pracownik dla przypisanych zadań, admin; rola serwisant otrzymuje 403),
    - `PATCH /api/zgloszenia/:id/status` (admin - pełna edycja; pracownik - zmiana statusu na 'w_realizacji' i 'do_wysylki' dla własnych zadań; magazynier - wyłącznie 'zakończone'; serwisant - blokada 403),
    - `DELETE /api/zgloszenia/:id` (tylko admin),
    - `POST /api/admin/users` (tylko admin).
  - Serwowanie katalogu `public/` przez Express (`app.use(express.static(path.join(__dirname, 'public')))`).

- [x] **Testy Integracyjne:**
  - Utworzono plik `app.test.js` wykorzystujący wbudowany moduł `node:test` oraz `supertest`.
  - Skonfigurowano skrypt `"test": "node --test"` w `package.json`.
  - Pokryto testami 8 kluczowych wymagań integracyjnych:
    1. `POST /api/zgloszenia` bez przesłanych pól w body zwraca kod `400`.
    2. `GET /api/zgloszenia` bez podanego nagłówka autoryzacyjnego zwraca kod `401`.
    3. `GET /api/zgloszenia` z niepoprawnym tokenem JWT zwraca kod `403`.
    4. `POST /api/login` ze złym hasłem dla istniejącego użytkownika zwraca kod `401`.
    5. `GET /api/pracownicy` bez nagłówka Authorization zwraca kod `401`.
    6. `PATCH /api/zgloszenia/1/przypisz` bez tokenu zwraca kod `401`.
    7. `PATCH /api/zgloszenia/1/naprawione` bez tokenu zwraca kod `401`.
    8. `POST /api/zgloszenia` dla monitora interaktywnego bez numeru seryjnego zwraca kod `400`.

- [x] **Frontend (React 18 w `public/index.html`):**
  - Reaktywne komponenty: `App`, `Header`, `PublicTicketForm`, `LoginForm`, `Dashboard`, `StatusControl`, `ShipControl`, `RepairModal`, `Alert`.
  - Formularz publiczny z formatowaniem numeru telefonu (`+48 XXX XXX XXX`), NIP-u, kodu pocztowego, walidacją województw i dopuszczalnych urządzeń.
  - Logowanie z zapisem do `localStorage` (`serwis_token`, `serwis_user`) i natychmiastową reakcją interfejsu.
  - Wyświetlanie etykiety roli zalogowanego użytkownika (badge `admin`, `serwisant`, `pracownik`, `magazynier`).
  - Obsługa uprawnień w widoku tabeli:
    - `admin`: widzi wszystkie zlecenia, przypisuje pracownikom, modyfikuje statusy z listy rozwijanej, usuwa zgłoszenia (`DELETE`),
    - `serwisant`: widzi wszystkie zlecenia, ma rozwijaną listę do przypisania zgłoszenia pracownikowi, brak możliwości zmiany statusu (brak listy rozwijanej i przycisków naprawy),
    - `pracownik`: widzi wyłącznie swoje przypisane zlecenia; gdy status to `nowe`, klika przycisk `Rozpocznij realizację` (przejście na `w realizacji`), po ukończeniu klika `Oznacz jako naprawione` w kolumnie Status i sporządza raport, po czym zlecenie przechodzi do statusu `do_wysylki` (usunięto zduplikowany przycisk `Opisz naprawę` w kolumnie raportu dla pracownika),
    - `magazynier`: widzi zlecenia ze statusem `do_wysylki` i `zakończone`; posiada kontrolkę `ShipControl` z polem tekstowym na numer listu przewozowego i przyciskiem oznaczenia jako wysłane (`zakończone`),
    - `admin`: jako jedyny posiada przycisk usuwania zgłoszeń (`DELETE`).
  - Prezentacja szczegółów wysyłki: w kolumnie daty zgłoszenia prezentowane są informacje o dacie wysyłki (`Wysłano: ...`) oraz numerze listu przewozowego (`List: ...`).
  - **Dynamiczne sprawdzanie tokenu i obsługa 401/403:**
    - Wydzielona funkcja `handleAuthError(response)` wywołująca `onLogout()`.
    - Pomocnik `apiFetch(endpoint, options)` pobierający `localStorage.getItem('serwis_token')` w locie przed każdym zapytaniem.
    - Testowane zachowanie: manualna modyfikacja lub usunięcie klucza `serwis_token` w DevTools Local Storage skutkuje natychmiastowym wylogowaniem i powrotem do formularza logowania.

---

## 3. Struktura plików w projekcie

```
strona_z_bd/
├── .env                     # Zmienne środowiskowe (ignorowane w git)
├── .env.example             # Szablon konfiguracji zmiennych środowiskowych
├── .gitignore               # Wykluczenia gita: node_modules, .env
├── README.md                # Główna dokumentacja projektu i instrukcja wdrożenia
├── app.js                   # Instancja Express.js (konfiguracja middleware, routingu, walidacji, JWT i puli DB bez app.listen())
├── app.test.js              # Testy integracyjne API (node:test + supertest, 8 testów)
├── context.md               # [TEN PLIK] Pełny, aktualny kontekst dla deweloperów i agentów AI
├── create-user.js           # CLI: tworzenie kont użytkowników (admin, serwisant, pracownik, magazynier) z bcrypt
├── index.js                 # Punkt wejściowy: import app.js, auto-migracja kolumn w DB, app.listen()
├── package.json             # Zależności i skrypty npm (start, dev, seed, test)
├── package-lock.json        # Zablokowane wersje pakietów npm
├── schemat.sql              # Schemat bazy MySQL (tabele: uzytkownicy, zgloszenia)
├── seed.js                  # Skrypt inicjalizujący schemat bazy MySQL
├── public/                  # Katalog serwowany statycznie przez Express
│   ├── index.html           # Główny interfejs SPA (React 18 + Babel, formularz klienta + panel pracownika z rolami)
│   └── logo_mentor4.svg     # Logo systemu wyświetlane w nagłówku
└── node_modules/            # Zainstalowane moduły Node.js
```

---

## 4. Konfiguracja środowiska (`.env`)

```ini
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=serwis_db
DB_PORT=3306
JWT_SECRET=klucz_jwt
```

---

## 5. Baza Danych MySQL (`schemat.sql`)

Baza danych: `serwis_db` (kodowanie `utf8mb4_unicode_ci`).

### Tabela `zgloszenia`:
| Kolumna | Typ | Opis |
| :--- | :--- | :--- |
| `id` | `INT AUTO_INCREMENT PRIMARY KEY` | Unikalny identyfikator zgłoszenia |
| `imie` | `VARCHAR(50) NOT NULL` | Imię zgłaszającego (tylko litery) |
| `nazwisko` | `VARCHAR(50) NOT NULL` | Nazwisko zgłaszającego (tylko litery) |
| `nazwa_firmy` | `VARCHAR(100) NULL` | Opcjonalna nazwa firmy |
| `adres` | `TEXT NOT NULL` | Ulica i numer lokalu / odbioru sprzętu |
| `kod_pocztowy` | `VARCHAR(6) NOT NULL` | Kod pocztowy w formacie `XX-XXX` |
| `miasto` | `VARCHAR(100) NOT NULL` | Miasto klienta |
| `wojewodztwo` | `VARCHAR(50) NOT NULL` | Województwo (z listy 16 polskich województw) |
| `numer_telefonu` | `VARCHAR(20) NOT NULL` | Telefon kontaktowy (+48 i 9 cyfr) |
| `email` | `VARCHAR(100) NOT NULL` | Email klienta |
| `opis_usterki` | `TEXT NOT NULL` | Treść zgłoszenia, opis usterki |
| `numer_fv` | `VARCHAR(50) NOT NULL` | Wymagany numer faktury lub paragonu |
| `nip` | `VARCHAR(10) NOT NULL` | Wymagany NIP (10 cyfr, bez myślników) |
| `przedmiot_zgloszenia` | `VARCHAR(100) NOT NULL` | Kategoria urządzenia wyselekcjonowana z 23 dopuszczalnych pozycji |
| `numer_seryjny` | `VARCHAR(100) NULL` | Numer seryjny (dostępny wyłącznie dla monitorów i tablic interaktywnych) |
| `data_zakupu` | `DATE NOT NULL` | Data zakupu sprzętu (RRRR-MM-DD) |
| `przypisany_pracownik_id` | `INT NULL` | ID użytkownika z tabeli `uzytkownicy`, któremu przypisano zlecenie (FK) |
| `opis_naprawy` | `TEXT NULL` | Opis wykonanych prac naprawczych wprowadzony przez pracownika |
| `opis_naprawy_data` | `DATETIME NULL` | Automatyczna data i czas zatwierdzenia raportu z naprawy |
| `data_wyslania` | `DATETIME NULL` | Automatyczna data i czas oznaczenia przesyłki jako wysłana przez magazyniera |
| `numer_listu` | `VARCHAR(100) NULL` | Opcjonalny numer listu przewozowego wprowadzany przez magazyniera |
| `status` | `ENUM('nowe', 'w_realizacji', 'do_wysylki', 'zakończone')` | Domyślnie `'nowe'` |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | Data i czas rejestracji |

### Tabela `uzytkownicy`:
| Kolumna | Typ | Opis |
| :--- | :--- | :--- |
| `id` | `INT AUTO_INCREMENT PRIMARY KEY` | Unikalny identyfikator użytkownika |
| `username` | `VARCHAR(50) NOT NULL UNIQUE` | Nazwa użytkownika (login do panelu) |
| `password_hash` | `VARCHAR(255) NOT NULL` | Hash hasła (bcrypt) |
| `role` | `VARCHAR(20) DEFAULT 'pracownik'` | Rola: `'admin'`, `'serwisant'`, `'pracownik'`, `'magazynier'` |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | Data utworzenia konta |

---

## 6. Role użytkowników i przepływ zleceń

```
[Klient rejestruje zgłoszenie]
          │ (status: 'nowe')
          ▼
[Admin / Serwisant] ─── Przypisuje pracownika ───► [Pracownik]
                                                        │ (status nadal: 'nowe')
                                                        ▼
                                             [Kliknięcie "Rozpocznij realizację"]
                                                        │ (status: 'w_realizacji')
                                                        ▼
                                             [Wykonuje naprawę]
                                             [Kliknięcie "Oznacz jako naprawione"]
                                             [Wprowadza opis prac]
                                                        │ (status: 'do_wysylki')
                                                        ▼
                                                  [Magazynier]
                                             [Wpisuje nr listu (opcjonalnie)]
                                             [Oznacza jako wysłane]
                                                        │ (status: 'zakończone')
                                                        ▼
                                             [Zlecenie zrealizowane]
```

1. **`admin`**:
   - Pełne uprawnienia do podglądu wszystkich zgłoszeń.
   - Może przypisywać zlecenia pracownikom i serwisantom (`PATCH /api/zgloszenia/:id/przypisz`).
   - Może zmieniać dowolny status, usuwać zgłoszenia (`DELETE /api/zgloszenia/:id`) oraz zakładać konta użytkowników z dowolną rolą (`POST /api/admin/users`).
2. **`serwisant`**:
   - Widzi wszystkie zlecenia w systemie.
   - Może wyłącznie przypisywać zlecenia pracownikom (`PATCH /api/zgloszenia/:id/przypisz`).
   - Nie posiada uprawnień do zmiany statusu ani opisywania napraw (brak listy wyboru statusów i przycisków naprawy w UI, blokada 403 w API).
3. **`pracownik`**:
   - **Domyślnie NIE widzi obcych zleceń** – widzi wyłącznie zlecenia przypisane do niego przez serwisanta lub administratora.
   - Przypisane zlecenie ma status **`nowe`** – pracownik musi sam kliknąć przycisk **„Rozpocznij realizację”** (zmiana statusu na **`w_realizacji`**).
   - Dopiero po rozpoczęciu zlecenia pracownik klika **„Oznacz jako naprawione”** w kolumnie Status i **musi sporządzić opis wykonanych prac** w modalu.
   - Wpis z opisem naprawy jest **automatycznie datowany (data i czas: `NOW()`)**.
   - Po zatwierdzeniu naprawy zlecenie otrzymuje status **`do_wysylki`** i zostaje przekazane do magazynu.
4. **`magazynier`**:
   - **Domyślnie NIE widzi zleceń** nowych ani w toku naprawy.
   - Zlecenie pojawia się u magazynierów **dopiero gdy pracownik zakończy i opisze naprawę** – ma wtedy status **`do_wysylki`**.
   - Magazynier widzi dane wysyłkowe klienta, opis usterki, opis naprawy pracownika wraz z datą i godziną naprawy.
   - Posiada dedykowany formularz wysyłki (`ShipControl`): może wprowadzić **numer listu przewozowego** (pole tekstowe, opcjonalne) oraz kliknąć **„Oznacz jako wysłane”** (`zakończone`), co automatycznie zapisuje bieżącą datę wysyłki (`data_wyslania = NOW()`) i numer listu w bazie.

---

## 7. Dokumentacja Endpointów API

### 1. Rejestracja nowego zgłoszenia (Publiczny)
- **Metoda:** `POST`
- **Ścieżka:** `/api/zgloszenia`
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{
  "imie": "Jan",
  "nazwisko": "Kowalski",
  "nazwa_firmy": "Acme Sp. z o.o.",
  "adres": "ul. Kwiatowa 5",
  "kod_pocztowy": "00-001",
  "miasto": "Warszawa",
  "wojewodztwo": "mazowieckie",
  "numer_telefonu": "+48600700800",
  "email": "jan.kowalski@example.com",
  "przedmiot_zgloszenia": "Monitor interaktywny myBoard Titan (Android 15)",
  "numer_seryjny": "SN-987654321",
  "data_zakupu": "2025-11-20",
  "opis_usterki": "Urządzenie nie włącza się po burzy.",
  "numer_fv": "FV/2026/0123",
  "nip": "1234567890"
}
```
- **Odpowiedź (201 Created):**
```json
{
  "message": "Zgłoszenie serwisowe zostało pomyślnie przyjęte.",
  "id": 1
}
```

---

### 2. Logowanie do panelu (Publiczny, Rate-Limited)
- **Metoda:** `POST`
- **Ścieżka:** `/api/login`
- **Ograniczenie:** `10 prób / 15 minut` na dany adres IP (`loginLimiter`, pomijany w `NODE_ENV === 'test'`).
- **Body:**
```json
{
  "username": "admin",
  "password": "tajne_haslo"
}
```
- **Odpowiedź (200 OK):**
```json
{
  "message": "Zalogowano pomyślnie.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

---

### 3. Pobieranie listy pracowników (Chroniony, Admin i Serwisant)
- **Metoda:** `GET`
- **Ścieżka:** `/api/pracownicy`
- **Headers:** `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia:** `admin`, `serwisant`
- **Odpowiedź (200 OK):** Lista użytkowników z rolą `pracownik` i `serwisant` do wyboru w selektorze przypisywania:
```json
[
  { "id": 2, "username": "serwisant1", "role": "serwisant" },
  { "id": 3, "username": "marek_technik", "role": "pracownik" }
]
```

---

### 4. Pobieranie listy zgłoszeń (Chroniony, Zależny od roli)
- **Metoda:** `GET`
- **Ścieżka:** `/api/zgloszenia`
- **Headers:** `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia i widoczność:**
  - `admin`, `serwisant`: widzą wszystkie zgłoszenia w systemie.
  - `pracownik`: widzi wyłącznie zgłoszenia przypisane do niego (`WHERE z.przypisany_pracownik_id = ?`). Domyślnie pusto.
  - `magazynier`: widzi wyłącznie zgłoszenia gotowe do wysyłki lub zakończone (`WHERE z.status IN ('do_wysylki', 'zakończone')`). Domyślnie pusto.
- **Odpowiedź (200 OK):** Tablica obiektów zgłoszeń posortowana od najnowszego z polami m.in.: `przypisany_pracownik_username`, `opis_naprawy`, `opis_naprawy_data`, `data_wyslania`, `numer_listu`.

---

### 5. Przypisanie zgłoszenia pracownikowi (Chroniony, Admin i Serwisant)
- **Metoda:** `PATCH`
- **Ścieżka:** `/api/zgloszenia/:id/przypisz`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia:** `admin`, `serwisant`
- **Body:**
```json
{
  "pracownik_id": 3
}
```
*(lub `null` w celu cofnięcia przypisania)*
- **Odpowiedź (200 OK):** Potwierdzenie przypisania (status zgłoszenia nie ulega automatycznej zmianie i pozostaje `nowe`).

---

### 6. Opisanie naprawy i przekazanie do wysyłki (Chroniony)
- **Metoda:** `PATCH`
- **Ścieżka:** `/api/zgloszenia/:id/naprawione`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia:** `pracownik` (własne przypisane zlecenie), `admin`. Rola `serwisant` otrzymuje `403 Forbidden`.
- **Body:**
```json
{
  "opis_naprawy": "Wymieniono zasilacz, przetestowano płytę główną i matrycę dotykową."
}
```
- **Działanie:** Zapisuje treść opisu, ustawia `opis_naprawy_data = NOW()`, zmienia status na `do_wysylki`. Zlecenie natychmiast pojawia się u magazynierów.
- **Odpowiedź (200 OK):**
```json
{
  "message": "Zlecenie zostało opisane i przekazane do magazynu ze statusem \"Do wysyłki\".",
  "id": 1,
  "status": "do_wysylki",
  "opis_naprawy": "Wymieniono zasilacz..."
}
```

---

### 7. Aktualizacja statusu zgłoszenia (Chroniony)
- **Metoda:** `PATCH` lub `PUT`
- **Ścieżka:** `/api/zgloszenia/:id/status`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <TOKEN_JWT>`
- **Dozwolone statusy:** `"nowe"`, `"w_realizacji"`, `"do_wysylki"`, `"zakończone"`.
- **Zasady biznesowe ról:**
  - `serwisant`: brak uprawnień do zmiany statusu (odpowiedź `403 Forbidden`).
  - `magazynier`: może wyłącznie ustawić status `"zakończone"`.
  - Przy statusie `"zakończone"`: przyjmowany jest opcjonalny parametr `"numer_listu"`, a serwer automatycznie ustawia `data_wyslania = NOW()`.
  - `pracownik`: może modyfikować status tylko swojego przypisanego zlecenia i wyłącznie na `"w_realizacji"` lub `"do_wysylki"` (przy czym dla `"do_wysylki"` wymagany jest opis naprawy).
  - `admin`: może dowolnie modyfikować status zgłoszenia.
- **Body przykładowe (dla magazyniera):**
```json
{
  "status": "zakończone",
  "numer_listu": "DPD-1234567890PL"
}
```
- **Odpowiedź (200 OK):**
```json
{
  "message": "Status zgłoszenia został zaktualizowany.",
  "id": 1,
  "status": "zakończone"
}
```

---

### 8. Usunięcie zgłoszenia (Chroniony, Tylko Admin)
- **Metoda:** `DELETE`
- **Ścieżka:** `/api/zgloszenia/:id`
- **Headers:** `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia:** Tylko `admin` (middleware `requireAdmin`)
- **Odpowiedź (200 OK):**
```json
{
  "message": "Zgłoszenie zostało pomyślnie usunięte.",
  "id": 1
}
```
- **Błędy:** `400 Bad Request` (złe ID), `401 / 403` (brak tokenu, nieprawidłowy token lub rola inna niż admin), `404 Not Found` (zgłoszenie nie istnieje).

---

### 9. Tworzenie nowego konta użytkownika przez API (Chroniony, Tylko Admin)
- **Metoda:** `POST`
- **Ścieżka:** `/api/admin/users`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia:** Tylko `admin` (middleware `requireAdmin`)
- **Body:**
```json
{
  "username": "nowy_magazynier",
  "password": "HasloDoKonta123",
  "role": "magazynier"
}
```
*Dozwolone role:* `"admin"`, `"serwisant"`, `"pracownik"`, `"magazynier"` (domyślnie `"pracownik"`).
- **Odpowiedź (201 Created):**
```json
{
  "message": "Użytkownik został pomyślnie utworzony.",
  "id": 4,
  "username": "nowy_magazynier",
  "role": "magazynier"
}
```

---

### 10. Health Check
- **Metoda:** `GET`
- **Ścieżka:** `/api/health`
- **Odpowiedź (200 OK):**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-10-07T12:00:00.000Z"
}
```

---

## 8. Instrukcja uruchomienia i obsługi

### Wymagania wstępne:
1. Node.js (>= 18, zalecana wersja z `node:test`)
2. Uruchomiony serwer MySQL (np. XAMPP, MariaDB, Docker)

### Krok 1: Wgranie schematu bazy
```bash
npm run seed
```

### Krok 2: Utworzenie kont użytkowników w systemie
W projekcie dostępny jest skrypt `create-user.js` obsługujący 4 role:
```bash
# Administrator
node create-user.js admin TwojeHasloAdmina admin

# Serwisant
node create-user.js serwisant HasloSerwisanta serwisant

# Pracownik serwisu
node create-user.js marek HasloPracownika pracownik

# Magazynier
node create-user.js janusz HasloMagazyniera magazynier
```

### Krok 3: Uruchomienie aplikacji
Tryb produkcyjny:
```bash
npm start
```
Tryb deweloperski z przeładowaniem (`--watch`):
```bash
npm run dev
```
Domyślny adres: `http://localhost:3000`

### Krok 4: Uruchomienie testów integracyjnych
```bash
npm test
```
*Uruchamia `node --test` dla pliku `app.test.js`. Testy nie wymagają działającej bazy MySQL dzięki wstrzykiwanej puli mockowej.*

---

## 9. Wskazówki i konwencje dla Agentów AI

1. **Separation of Concerns (app.js vs index.js):**
   - Całą logikę tras, middleware i konfiguracji Express należy utrzymywać w `app.js`.
   - `index.js` służy wyłącznie jako punkt startowy serwera (`app.listen()`), wykonuje ewentualną weryfikację/dodanie brakujących kolumn i nie powinien zawierać definicji tras.
   - Nowe testy integracyjne powinny importować `app.js` i przekazywać instancję do `supertest(app)`.
   - W przypadku testów wymagających mockowania zapytań SQL należy korzystać z `app.setPool(mockPool)` oraz przywracać oryginalną pulę w `after()`.
2. **Struktura frontendu:**
   - Cały frontend mieści się w `public/index.html`.
   - Zasoby statyczne znajdują się w folderze `public/`.
   - Zapytania autoryzowane w panelu pracownika (`Dashboard`) muszą korzystać z `apiFetch`, aby token był pobierany dynamicznie z `localStorage.getItem('serwis_token')`, a błędy 401/403 automatycznie delegowane do `handleAuthError(response)`.
3. **Autoryzacja i role:**
   - W JWT zapisywane są: `id`, `username`, `role`.
   - Każdy chroniony endpoint wymaga `authenticateToken`.
   - Dostęp do przypisywania zleceń mają `admin` i `serwisant` (`requireAdminOrSerwisant`).
   - Operacje destrukcyjne (usuwanie `DELETE /api/zgloszenia/:id`) oraz administracyjne (`POST /api/admin/users`) wymagają dodatkowo `requireAdmin`.
4. **Baza danych:**
   - Wszystkie zapytania SQL używają zapytań parametryzowanych (`?`) za pośrednictwem puli połączeń `mysql2/promise`.
   - Nie dodawać twardo zakodowanych haseł ani sekretów JWT do kodu.

---

## 10. Backlog / Sugestie dalszego rozwoju

1. **Filtrowanie, wyszukiwanie i sortowanie:**
   - Rozbudowa `GET /api/zgloszenia` o query params (np. `?status=nowe&search=Kowalski`).
2. **Powiadomienia E-mail:**
   - Automatyczny e-mail do klienta po zarejestrowaniu zgłoszenia lub zmianie statusu / wysłaniu przesyłki z numerem listu (`nodemailer`).
3. **Publiczny podgląd statusu dla klienta:**
   - Publiczna wyszukiwarka zgłoszenia po ID i numerze telefonu lub unikalnym tokenie zgłoszenia (bez konieczności logowania), w tym podgląd numeru listu przewozowego.
4. **Załączniki / zdjęcia uszkodzeń:**
   - Obsługa wgrywania zdjęć usterek (`multer`) z limitem rozmiaru i bezpieczną walidacją typu pliku.
