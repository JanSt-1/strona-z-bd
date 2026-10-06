# Kontekst Projektu: System Obsługi Zgłoszeń Serwisowych (Express.js + MySQL + JWT)

## 1. Przegląd i Cel Projektu
Projekt to pełny system backendowy i frontendowy (SPA) do rejestracji i obsługi zgłoszeń serwisowych urządzeń.
Aplikacja składa się z:
- **Backendu w Express.js (v5)**:
  - Asynchroniczne połączenie z bazą **MySQL** z pulą połączeń (`mysql2/promise`).
  - Publiczny endpoint przyjmowania zgłoszeń serwisowych (`POST /api/zgloszenia`) z rygorystyczną walidacją pól.
  - Moduł uwierzytelniania pracowników/administratorów oparty o nazwę użytkownika (`username`), haszowanie haseł **bcrypt** oraz tokeny **JWT** (`POST /api/login`) zabezpieczony **rate limiterem** (10 prób / 15 min).
  - Kontrola uprawnień i ról (RBAC): role `admin` oraz `pracownik`.
  - Chronione endpointy zarządzania zgłoszeniami: pobieranie listy (`GET /api/zgloszenia`), aktualizacja statusu (`PATCH` / `PUT /api/zgloszenia/:id/status`) oraz usuwanie zgłoszeń (tylko rola `admin`: `DELETE /api/zgloszenia/:id`).
  - Chroniony endpoint administracyjny do tworzenia użytkowników (`POST /api/admin/users`, tylko `admin`).
  - Serwowanie plików statycznych (`public/`) bezpośrednio przez Express.
- **Narzędzia CLI**:
  - `create-user.js` do bezpiecznego tworzenia kont pracowników i administratorów w bazie z haszowaniem bcrypt.
  - `seed.js` do automatycznego wgrywania schematu bazy danych `schemat.sql`.
- **Frontend SPA (React 18)**:
  - Zlokalizowany w katalogu `public/index.html` (React + ReactDOM + Babel Standalone).
  - Publiczny formularz zgłoszeniowy z maskowaniem/walidacją numeru telefonu (`+48 ` i 9 cyfr).
  - Panel pracownika z logowaniem, tabelą zgłoszeń, zmianą statusu (interaktywny przycisk i select), usuwaniem (dla admina) oraz reaktywnym stanem.
  - Automatyczna obsługa wygaśnięcia lub sfałszowania sesji: funkcja `handleAuthError` i `apiFetch` dynamicznie pobierają token z `localStorage.getItem('serwis_token')`, natychmiast wylogowując użytkownika w przypadku otrzymania kodu `401` lub `403` (np. przy manualnej zmianie tokenu w DevTools Local Storage).

---

## 2. Co zostało zrobione i aktualny stan techniczny

- [x] **Backend & Baza Danych:**
  - Zainicjalizowano `package.json` ze skryptami (`start`, `dev`, `seed`).
  - Skonfigurowano zależności: `express` (v5), `mysql2`, `jsonwebtoken`, `bcrypt`, `dotenv`, `cors`, `express-rate-limit`.
  - Zapewniono bezpieczną obsługę `JWT_SECRET` (aplikacja zatrzymuje start, gdy klucz nie jest zdefiniowany w `.env`).
  - Przygotowano pliki `.env` oraz `.env.example`.
  - Utworzono `schemat.sql` oraz skrypt `seed.js` (aplikuje schemat bazy bez generowania zbędnych danych demo).
  - Utworzono skrypt CLI `create-user.js` do dodawania użytkowników z rolami `admin` i `pracownik`.
  - Zaimplementowano model ról (RBAC): middleware `authenticateToken` oraz `requireAdmin`.
  - Zaimplementowano `loginLimiter` (`express-rate-limit`) ograniczający brute-force na `POST /api/login` (10 prób / 15 min z 1 IP).
  - Zaimplementowano bezpieczne usuwanie zgłoszeń (`DELETE /api/zgloszenia/:id`) dostępne wyłącznie dla roli `admin`.
  - Zaimplementowano endpoint tworzenia użytkowników (`POST /api/admin/users`) dla roli `admin`.
  - Serwowanie katalogu `public/` przez Express (`app.use(express.static(path.join(__dirname, 'public')))`).

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
├── context.md               # [TEN PLIK] Pełny, aktualny kontekst dla deweloperów i agentów AI
├── create-user.js           # CLI: tworzenie kont użytkowników (admin / pracownik) z hashowaniem bcrypt
├── index.js                 # Główny serwer Express.js (routing API, middleware JWT, RBAC, rate-limiting)
├── package.json             # Zależności i skrypty npm
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
| `adres` | `TEXT NOT NULL` | Adres klienta / odbioru sprzętu |
| `numer_telefonu` | `VARCHAR(20) NOT NULL` | Telefon kontaktowy (+48 i 9 cyfr) |
| `email` | `VARCHAR(100) NOT NULL` | Email klienta |
| `opis_usterki` | `TEXT NOT NULL` | Treść zgłoszenia, opis usterki |
| `numer_fv` | `VARCHAR(50) NULL` | Opcjonalny numer faktury lub paragonu |
| `status` | `ENUM('nowe', 'w_realizacji', 'zakończone')` | Domyślnie `'nowe'` |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | Data i czas rejestracji |

### Tabela `uzytkownicy`:
| Kolumna | Typ | Opis |
| :--- | :--- | :--- |
| `id` | `INT AUTO_INCREMENT PRIMARY KEY` | Unikalny identyfikator użytkownika |
| `username` | `VARCHAR(50) NOT NULL UNIQUE` | Nazwa użytkownika (login do panelu) |
| `password_hash` | `VARCHAR(255) NOT NULL` | Hash hasła (bcrypt) |
| `role` | `VARCHAR(20) DEFAULT 'pracownik'` | Rola: `'admin'` lub `'pracownik'` |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | Data utworzenia konta |

---

## 6. Dokumentacja Endpointów API

### 1. Rejestracja nowego zgłoszenia (Publiczny)
- **Metoda:** `POST`
- **Ścieżka:** `/api/zgloszenia`
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{
  "imie": "Jan",
  "nazwisko": "Kowalski",
  "adres": "ul. Kwiatowa 5, Warszawa",
  "numer_telefonu": "+48 600 700 800",
  "email": "jan.kowalski@example.com",
  "opis_usterki": "Urządzenie nie włącza się po burzy.",
  "numer_fv": "FV/2026/0123"
}
```
- **Odpowiedź (201 Created):**
```json
{
  "message": "Zgłoszenie serwisowe zostało pomyślnie przyjęte.",
  "id": 1
}
```
- **Błędy:** `400 Bad Request` (brak wymaganych pól, zły format telefonu/emaila, przekroczenie limitu znaków), `500 Internal Server Error`.

---

### 2. Logowanie do panelu (Publiczny, Rate-Limited)
- **Metoda:** `POST`
- **Ścieżka:** `/api/login`
- **Ograniczenie:** `10 prób / 15 minut` na dany adres IP (`loginLimiter`).
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
- **Błędy:** `400 Bad Request` (brak username/hasła), `401 Unauthorized` (błędne dane), `429 Too Many Requests` (przekroczony limit prób).

---

### 3. Pobieranie listy zgłoszeń (Chroniony)
- **Metoda:** `GET`
- **Ścieżka:** `/api/zgloszenia`
- **Headers:** `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia:** `admin`, `pracownik`
- **Odpowiedź (200 OK):** Tablica obiektów zgłoszeń posortowana od najnowszego (`ORDER BY created_at DESC`).
- **Błędy:** `401 Unauthorized` (brak tokenu), `403 Forbidden` (nieprawidłowy lub wygasły token).

---

### 4. Aktualizacja statusu zgłoszenia (Chroniony)
- **Metoda:** `PATCH` lub `PUT`
- **Ścieżka:** `/api/zgloszenia/:id/status`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <TOKEN_JWT>`
- **Uprawnienia:** `admin`, `pracownik`
- **Body:**
```json
{
  "status": "w_realizacji"
}
```
*Dozwolone statusy:* `"nowe"`, `"w_realizacji"`, `"zakończone"`.
- **Odpowiedź (200 OK):**
```json
{
  "message": "Status zgłoszenia został zaktualizowany.",
  "id": 1,
  "status": "w_realizacji"
}
```
- **Błędy:** `400 Bad Request` (niedozwolony status lub złe ID), `401 / 403` (brak/zły token), `404 Not Found` (brak zgłoszenia).

---

### 5. Usunięcie zgłoszenia (Chroniony, Tylko Admin)
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
1. Node.js (>= 18)
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

---

## 8. Wskazówki i konwencje dla Agentów AI

1. **Struktura frontendu:**
   - Cały frontend mieści się w `public/index.html`.
   - Zasoby statyczne znajdują się w folderze `public/`.
   - Zapytania autoryzowane w panelu pracownika (`Dashboard`) muszą korzystać z `apiFetch`, aby token był pobierany dynamicznie z `localStorage.getItem('serwis_token')`, a błędy 401/403 automatycznie delegowane do `handleAuthError(response)`.
2. **Autoryzacja i role:**
   - W JWT zapisywane są: `id`, `username`, `role`.
   - Każdy chroniony endpoint wymaga `authenticateToken`.
   - Operacje destrukcyjne (usuwanie `DELETE /api/zgloszenia/:id`) oraz administracyjne (`POST /api/admin/users`) wymagają dodatkowo `requireAdmin`.
3. **Baza danych:**
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
