# Kontekst Projektu: System Obsługi Zgłoszeń Serwisowych (Express.js + MySQL + JWT)

## 1. Przegląd i Cel Projektu
Projekt to pełny system backendowy i frontendowy (SPA) do rejestracji i obsługi zgłoszeń serwisowych.
Aplikacja składa się z:
- **Backendu w Express.js (v5) z architekturą Separation of Concerns**:
  - **`app.js`**: Wyodrębniona instancja aplikacji Express – konfiguracja middleware (CORS, JSON, pliki statyczne), autoryzacji JWT, kontroli dostępu RBAC, rate-limitera oraz tras API. Udostępnia metody `app.setPool()` i `app.getPool()` ułatwiające testowanie i zarządzanie pulą połączeń. Nie wywołuje `app.listen()`.
  - **`index.js`**: Punkt wejściowy uruchamiający serwer – odpowiada za wczytanie `.env`, weryfikację połączenia z bazą MySQL oraz nasłuchiwanie na wybranym porcie (`app.listen()`).
  - Asynchroniczne połączenie z bazą **MySQL** z pulą połączeń (`mysql2/promise`).
  - Publiczny endpoint przyjmowania zgłoszeń serwisowych (`POST /api/zgloszenia`) z rygorystyczną walidacją pól.
  - Moduł uwierzytelniania pracowników/administratorów oparty o nazwę użytkownika (`username`), haszowanie haseł **bcrypt** oraz tokeny **JWT** (`POST /api/login`) zabezpieczony **rate limiterem** (10 prób / 15 min, wyłączonym w środowisku testowym).
  - Kontrola uprawnień i ról (RBAC): role `admin` oraz `pracownik`.
  - Chronione endpointy zarządzania zgłoszeniami: pobieranie listy (`GET /api/zgloszenia`), aktualizacja statusu (`PATCH` / `PUT /api/zgloszenia/:id/status`) oraz usuwanie zgłoszeń (tylko rola `admin`: `DELETE /api/zgloszenia/:id`).
  - Chroniony endpoint administracyjny do tworzenia użytkowników (`POST /api/admin/users`, tylko `admin`).
  - Serwowanie plików statycznych (`public/`) bezpośrednio przez Express.
- **Zestawu Testów Integracyjnych**:
  - Plik `app.test.js` oparty o natywny runner Node.js (`node:test`) oraz bibliotekę `supertest`.
  - Izolacja testów poprzez mockowanie zapytań SQL (`app.setPool()`), co pozwala na uruchamianie testów bez aktywnej bazy danych MySQL (np. w środowisku CI/CD).
- **Narzędzi CLI**:
  - `create-user.js` do bezpiecznego tworzenia kont pracowników i administratorów w bazie z haszowaniem bcrypt.
  - `seed.js` do automatycznego wgrywania schematu bazy danych `schemat.sql`.
- **Frontendu SPA (React 18)**:
  - Zlokalizowany w katalogu `public/index.html` (React + ReactDOM + Babel Standalone).
  - Publiczny formularz zgłoszeniowy z maskowaniem/walidacją numeru telefonu (`+48 ` i 9 cyfr).
  - Panel pracownika z logowaniem, tabelą zgłoszeń, zmianą statusu (interaktywny przycisk i select), usuwaniem (dla admina) oraz reaktywnym stanem.
  - Automatyczna obsługa wygaśnięcia lub sfałszowania sesji: funkcja `handleAuthError` i `apiFetch` dynamicznie pobierają token z `localStorage.getItem('serwis_token')`, natychmiast wylogowując użytkownika w przypadku otrzymania kodu `401` lub `403` (np. przy manualnej zmianie tokenu w DevTools Local Storage).

---

## 2. Co zostało zrobione i aktualny stan techniczny

- [x] **Backend & Baza Danych:**
  - Zainicjalizowano `package.json` ze skryptami (`start`, `dev`, `seed`, `test`).
  - Skonfigurowano zależności: `express` (v5), `mysql2`, `jsonwebtoken`, `bcrypt`, `dotenv`, `cors`, `express-rate-limit`, a w devDependencies: `supertest`.
  - Przeprowadzono refaktoryzację pod kątem **Separation of Concerns**:
    - `app.js` definiuje i eksportuje samą aplikację Express bez `app.listen()`.
    - `index.js` importuje `app.js`, weryfikuje łączność z bazą i uruchamia serwer HTTP.
    - Dodano metody `app.setPool()` oraz `app.getPool()` do dynamicznej podmiany puli bazy danych.
  - Zapewniono bezpieczną obsługę `JWT_SECRET` (aplikacja zatrzymuje start serwera, gdy klucz nie jest zdefiniowany w `.env`).
  - Przygotowano pliki `.env` oraz `.env.example`.
  - Utworzono `schemat.sql` oraz skrypt `seed.js` (aplikuje schemat bazy bez generowania zbędnych danych demo).
  - Utworzono skrypt CLI `create-user.js` do dodawania użytkowników z rolami `admin` i `pracownik`.
  - Zaimplementowano model ról (RBAC): middleware `authenticateToken` oraz `requireAdmin`.
  - Zaimplementowano `loginLimiter` (`express-rate-limit`) ograniczający brute-force na `POST /api/login` (10 prób / 15 min z 1 IP, pomijany przy `NODE_ENV === 'test'`).
  - Zaimplementowano bezpieczne usuwanie zgłoszeń (`DELETE /api/zgloszenia/:id`) dostępne wyłącznie dla roli `admin`.
  - Zaimplementowano endpoint tworzenia użytkowników (`POST /api/admin/users`) dla roli `admin`.
  - Serwowanie katalogu `public/` przez Express (`app.use(express.static(path.join(__dirname, 'public')))`).

- [x] **Testy Integracyjne:**
  - Utworzono plik `app.test.js` wykorzystujący wbudowany moduł `node:test` oraz `supertest`.
  - Skonfigurowano skrypt `"test": "node --test"` w `package.json`.
  - Pokryto testami kluczowe wymagania integracyjne:
    - `POST /api/zgloszenia` bez przesłanych pól w body zwraca kod `400`.
    - `GET /api/zgloszenia` bez podanego nagłówka autoryzacyjnego zwraca kod `401`.
    - `GET /api/zgloszenia` z niepoprawnym tokenem JWT zwraca kod `403`.
    - `POST /api/login` ze złym hasłem dla istniejącego użytkownika zwraca kod `401`.

- [x] **Frontend (React 18 w `public/index.html`):**
  - Reaktywne komponenty: `App`, `Header`, `PublicTicketForm`, `LoginForm`, `Dashboard`, `StatusControl`, `Alert`.
  - Formularz publiczny z formatowaniem numeru telefonu (`+48 XXX XXX XXX`, blokada kasowania prefiksu, filtr nie-cyfr).
  - Logowanie z zapisem do `localStorage` (`serwis_token`, `serwis_user`) i natychmiastową reakcją interfejsu.
  - Wyświetlanie etykiety roli zalogowanego użytkownika (badge `admin` / `pracownik`).
  - Przycisk usuwania zgłoszeń widoczny i aktywny wyłącznie dla użytkowników z rolą `admin`.
  - Interaktywna zmiana statusu: przycisk przejścia w kolejny krok cyklu (`nowe` -> `w_realizacji` -> `zakończone`) oraz lista rozwijana `<select>`.
  - **Dynamiczne sprawdzanie tokenu i obsługa 401/403:**
    - Wydzielona funkcja `handleAuthError(response)` wywołująca `onLogout()`.
    - Pomocnik `apiFetch(endpoint, options)` pobierający `localStorage.getItem('serwis_token')` w locie przed każdym zapytaniem.
    - Testowane zachowanie: manualna modyfikacja lub usunięcie klucza `serwis_token` w DevTools Local Storage skutkuje natychmiastowym wylogowaniem i powrotem do formularza logowania przy próbie wykonania operacji (np. zmiany statusu w `handleUpdateStatus`, pobrania w `fetchTickets` czy usunięcia w `handleDeleteTicket`).

---

## 3. Struktura plików w projekcie

```
strona_z_bd/
├── .env                     # Zmienne środowiskowe (ignorowane w git)
├── .env.example             # Szablon konfiguracji zmiennych środowiskowych
├── .gitignore               # Wykluczenia gita: node_modules, .env
├── README.md                # Dokumentacja projektu i instrukcja wdrożenia
├── app.js                   # Instancja Express.js (konfiguracja middleware, routingu, walidacji, JWT i puli DB bez app.listen())
├── app.test.js              # Testy integracyjne API (node:test + supertest)
├── context.md               # [TEN PLIK] Pełny, aktualny kontekst dla deweloperów i agentów AI
├── create-user.js           # CLI: tworzenie kont użytkowników (admin / pracownik) z hashowaniem bcrypt
├── index.js                 # Punkt wejściowy serwera: importuje app.js, sprawdza bazę i wywołuje app.listen()
├── package.json             # Zależności i skrypty npm (start, dev, seed, test)
├── package-lock.json        # Zablokowane wersje pakietów npm
├── schemat.sql              # Schemat bazy MySQL (tabele: zgloszenia, uzytkownicy)
├── seed.js                  # Skrypt inicjalizujący schemat bazy MySQL
├── public/                  # Katalog serwowany statycznie przez Express
│   ├── index.html           # Główny interfejs SPA (React 18 + Babel, formularz klienta + panel pracownika)
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
JWT_SECRET=super_tajny_klucz_jwt_zmien_w_produkcji
```

---

## 5. Baza Danych MySQL (`schemat.sql`)

Baza danych: `serwis_db` (kodowanie `utf8mb4_unicode_ci`).

### Tabela `zgloszenia`:
| Kolumna | Typ | Opis |
| :--- | :--- | :--- |
| `id` | `INT AUTO_INCREMENT PRIMARY KEY` | Unikalny identyfikator zgłoszenia |
| `imie` | `VARCHAR(50) NOT NULL` | Imię zgłaszającego |
| `nazwisko` | `VARCHAR(50) NOT NULL` | Nazwisko zgłaszającego |
| `nazwa_firmy` | `VARCHAR(100) NULL` | Opcjonalna nazwa firmy |
| `adres` | `TEXT NOT NULL` | Ulica i numer lokalu / odbioru sprzętu |
| `kod_pocztowy` | `VARCHAR(6) NOT NULL` | Kod pocztowy w formacie `XX-XXX` |
| `miasto` | `VARCHAR(100) NOT NULL` | Miasto klienta |
| `wojewodztwo` | `VARCHAR(50) NOT NULL` | Województwo (z listy 16 polskich województw) |
| `numer_telefonu` | `VARCHAR(20) NOT NULL` | Telefon kontaktowy (+48 i 9 cyfr) |
| `email` | `VARCHAR(100) NOT NULL` | Email klienta |
| `przedmiot_zgloszenia` | `VARCHAR(100) NOT NULL` | Kategoria urządzenia wyselekcjonowana z listy |
| `numer_seryjny` | `VARCHAR(100) NULL` | Numer seryjny (dostępny wyłącznie dla monitorów i tablic interaktywnych) |
| `data_zakupu` | `DATE NOT NULL` | Data zakupu sprzętu (RRRR-MM-DD) |
| `opis_usterki` | `TEXT NOT NULL` | Treść zgłoszenia, opis usterki |
| `numer_fv` | `VARCHAR(50) NOT NULL` | Wymagany numer faktury lub paragonu |
| `nip` | `VARCHAR(10) NOT NULL` | Wymagany NIP (10 cyfr, bez myślników) |
| `przypisany_pracownik_id` | `INT NULL` | ID użytkownika z tabeli `uzytkownicy`, któremu przypisano zlecenie |
| `opis_naprawy` | `TEXT NULL` | Opis wykonanych prac naprawczych wprowadzony przez pracownika |
| `opis_naprawy_data` | `DATETIME NULL` | Automatyczna data i czas zatwierdzenia raportu z naprawy |
| `status` | `ENUM/VARCHAR('nowe', 'w_realizacji', 'do_wysylki', 'zakończone')` | Domyślnie `'nowe'` |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | Data i czas rejestracji |

### Tabela `uzytkownicy`:
| Kolumna | Typ | Opis |
| :--- | :--- | :--- |
| `id` | `INT AUTO_INCREMENT PRIMARY KEY` | Unikalny identyfikator użytkownika |
| `username` | `VARCHAR(50) NOT NULL UNIQUE` | Nazwa użytkownika (login do panelu) |
| `password_hash` | `VARCHAR(255) NOT NULL` | Hash hasła (bcrypt) |
| `role` | `VARCHAR(20) DEFAULT 'pracownik'` | Rola: `'admin'`, `'pracownik'`, `'serwisant'`, `'magazynier'` |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | Data utworzenia konta |

---

## 6. Role użytkowników i przepływ zleceń

1. **`admin`**:
   - Pełne uprawnienia do podglądu wszystkich zgłoszeń.
   - Może przypisywać zlecenia pracownikom.
   - Może zmieniać dowolny status, usuwać zgłoszenia (`DELETE /api/zgloszenia/:id`) oraz zakładać konta użytkowników (`POST /api/admin/users`).
2. **`serwisant`**:
   - Widzi wszystkie zlecenia.
   - Może przypisywać zlecenia pracownikom (`PATCH /api/zgloszenia/:id/przypisz`).
   - Może opisywać naprawy i aktualizować statusy.
3. **`pracownik`**:
   - **Domyślnie NIE widzi zleceń** w bazie – widzi wyłącznie zlecenia przypisane do niego przez serwisanta lub administratora.
   - Przed oznaczeniem zlecenia jako naprawione **musi sporządzić opis wykonanych prac** (`PATCH /api/zgloszenia/:id/naprawione`).
   - Wpis z opisem naprawy jest **automatycznie datowany (data i czas: `NOW()`)**.
   - Po zatwierdzeniu naprawy zlecenie otrzymuje status **`do_wysylki`** i zostaje przekazane do magazynu.
4. **`magazynier`**:
   - **Domyślnie NIE widzi zleceń** nowych ani w toku naprawy.
   - Zlecenie pojawia się u magazynierów **dopiero gdy pracownik zakończy i opisze naprawę** – ma wtedy status **`do_wysylki`**.
   - Magazynier widzi dane wysyłkowe klienta, opis usterki, opis naprawy pracownika z datą i godziną, oraz ma przycisk do oznaczenia przesyłki jako wysłana / zakończona (`zakończone`).

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
- **Odpowiedź (200 OK):** Lista użytkowników z rolą `pracownik` i `serwisant` do wyboru w selektorze przypisywania.

---

### 4. Pobieranie listy zgłoszeń (Chroniony, Zależny od roli)
- **Metoda:** `GET`
- **Ścieżka:** `/api/zgloszenia`
- **Headers:** `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia i widoczność:**
  - `admin`, `serwisant`: widzą wszystkie zgłoszenia w systemie.
  - `pracownik`: widzi wyłącznie zgłoszenia przypisane do niego (`WHERE przypisany_pracownik_id = req.user.id`). Domyślnie pusto.
  - `magazynier`: widzi wyłącznie zgłoszenia gotowe do wysyłki (`WHERE status IN ('do_wysylki', 'zakończone')`). Domyślnie pusto.
- **Odpowiedź (200 OK):** Tablica obiektów zgłoszeń posortowana od najnowszego.

---

### 5. Przypisanie zgłoszenia pracownikowi (Chroniony, Admin i Serwisant)
- **Metoda:** `PATCH`
- **Ścieżka:** `/api/zgloszenia/:id/przypisz`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia:** `admin`, `serwisant`
- **Body:**
```json
{
  "pracownik_id": 2
}
```
*(lub `null` w celu cofnięcia przypisania)*
- **Odpowiedź (200 OK):** Potwierdzenie przypisania i automatyczna zmiana statusu z `nowe` na `w_realizacji`.

---

### 6. Opisanie naprawy i przekazanie do wysyłki (Chroniony)
- **Metoda:** `PATCH`
- **Ścieżka:** `/api/zgloszenia/:id/naprawione`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia:** `pracownik` (własne przypisane zlecenie), `serwisant`, `admin`.
- **Body:**
```json
{
  "opis_naprawy": "Wymieniono płytę główną zasilacza, przetestowano matrycę dotykową."
}
```
- **Działanie:** Zapisuje treść opisu, ustawia `opis_naprawy_data = NOW()`, zmienia status na `do_wysylki`. Zlecenie natychmiast pojawia się u magazynierów.
- **Odpowiedź (200 OK):**
```json
{
  "message": "Zlecenie zostało opisane i przekazane do magazynu ze statusem \"Do wysyłki\".",
  "id": 1,
  "status": "do_wysylki",
  "opis_naprawy": "..."
}
```

---

### 7. Aktualizacja statusu zgłoszenia (Chroniony)
- **Metoda:** `PATCH` lub `PUT`
- **Ścieżka:** `/api/zgloszenia/:id/status`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <TOKEN_JWT>`
- **Dozwolone statusy:** `"nowe"`, `"w_realizacji"`, `"do_wysylki"`, `"zakończone"`. Magazynier może wyłącznie oznaczyć zlecenie jako `zakończone` (wysłane).

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

### 6. Tworzenie nowego konta użytkownika przez API (Chroniony, Tylko Admin)
- **Metoda:** `POST`
- **Ścieżka:** `/api/admin/users`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia:** Tylko `admin` (middleware `requireAdmin`)
- **Body:**
```json
{
  "username": "nowy_serwisant",
  "password": "HasloDoKonta123",
  "role": "pracownik"
}
```
*Dozwolone role:* `"admin"`, `"pracownik"` (domyślnie `"pracownik"`).
- **Odpowiedź (201 Created):**
```json
{
  "message": "Użytkownik został pomyślnie utworzony.",
  "id": 2,
  "username": "nowy_serwisant",
  "role": "pracownik"
}
```
- **Błędy:** `400 Bad Request`, `401 / 403` (brak uprawnień admina), `409 Conflict` (użytkownik już istnieje).

---

### 7. Health Check
- **Metoda:** `GET`
- **Ścieżka:** `/api/health`
- **Odpowiedź (200 OK):**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-10-06T12:00:00.000Z"
}
```

---

## 7. Instrukcja uruchomienia i obsługi

### Wymagania wstępne:
1. Node.js (>= 18, zalecana wersja z `node:test`)
2. Uruchomiony serwer MySQL (np. XAMPP, MariaDB, Docker)

### Krok 1: Wgranie schematu bazy
```bash
npm run seed
```

### Krok 2: Utworzenie pierwszego konta administratora
```bash
node create-user.js admin TwojeBezpieczneHaslo admin
```
Opcjonalnie utworzenie zwykłego pracownika:
```bash
node create-user.js serwisant HasloPracownika pracownik
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

## 8. Wskazówki i konwencje dla Agentów AI

1. **Separation of Concerns (app.js vs index.js):**
   - Całą logikę tras, middleware i konfiguracji Express należy utrzymywać w `app.js`.
   - `index.js` służy wyłącznie jako punkt startowy serwera (`app.listen()`) i nie powinien zawierać definicji tras.
   - Nowe testy integracyjne powinny importować `app.js` i przekazywać instancję do `supertest(app)`.
   - W przypadku testów wymagających mockowania zapytań SQL należy korzystać z `app.setPool(mockPool)` oraz przywracać oryginalną pulę w `after()`.
2. **Struktura frontendu:**
   - Cały frontend mieści się w `public/index.html`.
   - Zasoby statyczne znajdują się w folderze `public/`.
   - Zapytania autoryzowane w panelu pracownika (`Dashboard`) muszą korzystać z `apiFetch`, aby token był pobierany dynamicznie z `localStorage.getItem('serwis_token')`, a błędy 401/403 automatycznie delegowane do `handleAuthError(response)`.
3. **Autoryzacja i role:**
   - W JWT zapisywane są: `id`, `username`, `role`.
   - Każdy chroniony endpoint wymaga `authenticateToken`.
   - Operacje destrukcyjne (usuwanie `DELETE /api/zgloszenia/:id`) oraz administracyjne (`POST /api/admin/users`) wymagają dodatkowo `requireAdmin`.
4. **Baza danych:**
   - Wszystkie zapytania SQL używają zapytań parametryzowanych (`?`) za pośrednictwem puli połączeń `mysql2/promise`.
   - Nie dodawać twardo zakodowanych haseł ani sekretów JWT do kodu.

---

## 9. Backlog / Sugestie dalszego rozwoju

1. **Filtrowanie, wyszukiwanie i sortowanie:**
   - Rozbudowa `GET /api/zgloszenia` o query params (np. `?status=nowe&search=Kowalski`).
2. **Powiadomienia E-mail:**
   - Automatyczny e-mail do klienta po zarejestrowaniu zgłoszenia lub zmianie statusu (`nodemailer`).
3. **Publiczny podgląd statusu dla klienta:**
   - Publiczna wyszukiwarka zgłoszenia po ID i numerze telefonu lub unikalnym tokenie zgłoszenia (bez konieczności logowania).
4. **Załączniki / zdjęcia uszkodzeń:**
   - Obsługa wgrywania zdjęć usterek (`multer`) z limitem rozmiaru i bezpieczną walidacją typu pliku.
