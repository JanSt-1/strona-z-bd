# Kontekst Projektu: System Obsługi Zgłoszeń Serwisowych (Express.js + MySQL + JWT)

## 1. Przegląd i Cel Projektu
Projekt to pełny system backendowy i frontendowy do rejestracji i obsługi zgłoszeń serwisowych urządzeń.
Składa się z:
- Serwera **Express.js** łączącego się asynchronicznie z bazą **MySQL** za pomocą puli połączeń (`mysql2/promise`).
- Publicznego punktu przyjmowania zgłoszeń serwisowych (`POST /api/zgloszenia`).
- Modułu uwierzytelniania pracowników/administratorów opartego o nazwę użytkownika (`username`), haszowanie haseł **bcrypt** oraz **JWT** (`POST /api/login`).
- Chronionego punktu pobierania listy zgłoszeń (`GET /api/zgloszenia`) z middleware weryfikującym nagłówek `Authorization: Bearer <token>`.
- Gotowego, estetycznego interfejsu webowego (`index.html`) z formularzem dla klientów oraz panelem zarządzania dla pracowników serwisu.

---

## 2. Co zostało zrobione
- [x] Zainicjalizowano `package.json` ze skryptami (`start`, `dev`, `seed`).
- [x] Zainstalowano i skonfigurowano zależności produkcyjne: `express`, `mysql2`, `jsonwebtoken`, `bcrypt`, `dotenv`, `cors`.
- [x] Przygotowano pliki konfiguracyjne `.env` oraz szablon `.env.example`.
- [x] Utworzono i przetestowano skrypt inicjalizacyjny i seedujący `seed.js`:
  - Automatycznie aplikuje schemat `schemat.sql` do bazy MySQL (bez tworzenia domyślnych kont użytkowników).
- [x] Usunięto dane demonstracyjne z tabeli `zgloszenia` oraz usunięto automatyczne wstawianie przykładowych zgłoszeń z pliku `seed.js`.
- [x] Zaimplementowano kompletny serwer w `index.js`:
  - Połączenie z bazą MySQL z wykorzystaniem puli połączeń `mysql2/promise`.
  - Middleware parsujący JSON (`express.json()`).
  - Middleware `cors()` do obsługi zapytań z przeglądarki.
  - Serwowanie plików statycznych (`express.static`).
  - Middleware `authenticateToken` weryfikujący token JWT z nagłówka `Authorization`.
  - `POST /api/zgloszenia`: publiczny endpoint z walidacją pól.
  - `POST /api/login`: weryfikacja użytkownika w bazie MySQL, porównanie hashy bcrypt, wygenerowanie tokenu JWT ważnego 24h.
  - `GET /api/zgloszenia`: chroniony endpoint zwracający zgłoszenia posortowane chronologicznie.
  - `PATCH /api/zgloszenia/:id/status`: chroniony endpoint do aktualizacji statusu zgłoszenia (`nowe`, `w_realizacji`, `zakończone`).
  - `DELETE /api/zgloszenia/:id`: chroniony endpoint do trwałego usuwania zgłoszenia z bazy (walidacja ID, autoryzacja JWT, weryfikacja istnienia rekordu 404).
  - `GET /api/health`: endpoint sprawdzający stan serwera i bazy danych.
- [x] Utworzono mostek w `serwis-panel/backend/index.js`, umożliwiający uruchomienie serwera również bezpośrednio z tego podkatalogu.
- [x] Przepisano frontend w `index.html` na pełnoprawną aplikację **React 18**:
  - Reaktywne zarządzanie stanem za pomocą hooków (`useState`, `useEffect`).
  - Podział na komponenty: `App`, `Header`, `PublicTicketForm`, `LoginForm`, `Dashboard`, `StatusControl`, `Alert`.
  - Składanie zgłoszeń przez klientów z natychmiastowym feedbackiem w stanie Reacta.
  - Logowanie pracowników serwisu za pomocą JWT z zapisem do `localStorage` i reaktywną synchronizacją sesji.
  - Podgląd i odświeżanie tabeli zgłoszeń serwisowych ze statusami i datami.
  - Interaktywną zmianę statusu zgłoszenia: dedykowany przycisk akcji (np. `➔ W realizacji`, `✔ Zakończ`) oraz rozwijana lista wyboru ze wszystkimi dozwolonymi statusami.
  - Kontrolowane pole numeru telefonu w React z domyślnym prefiksem `+48 `, blokadą usuwania prefiksu, wymuszeniem wprowadzania wyłącznie cyfr oraz czytelnym formatowaniem (`+48 XXX XXX XXX`).
  - Dedykowany przycisk usunięcia zgłoszenia w panelu pracownika z potwierdzeniem (`window.confirm`), blokadą w trakcie usuwania (`Usuwanie...`), natychmiastową reaktywną aktualizacją tabeli oraz powiadomieniem alert.
- [x] Dodano automatyczny fallback dla hasła bazy danych w `index.js` i `seed.js` (jeśli hasło z `.env` zostanie odrzucone przez lokalny serwer MySQL, serwer automatycznie podejmuje próbę połączenia z domyślnym pustym hasłem, zapobiegając awarii aplikacji).
- [x] Zmiana logowania do panelu pracownika z adresu email na **nazwę użytkownika** (`username`):
  - Zaktualizowano schemat bazy w `schemat.sql` oraz zaaplikowano migrację tabeli `uzytkownicy` (dodano kolumnę `username VARCHAR(50) NOT NULL UNIQUE`, kolumnę `email` oznaczono jako opcjonalną).
  - Wdrożono auto-migrację przy uruchomieniu serwera w `index.js` oraz w skrypcie `seed.js` (automatyczne dodanie kolumny `username` i uzupełnienie dla istniejących kont).
  - Zaktualizowano endpoint `POST /api/login` (wymóg podania pola `username`, zwrot `username` w obiekcie użytkownika i tokenie JWT).
  - Zaktualizowano endpoint `POST /api/admin/users` oraz narzędzie CLI `create-user.js` do obsługi tworzenia kont z nazwą użytkownika.
  - Zaktualizowano formularz logowania `LoginForm` w `index.html` (etykieta i pole tekstowe „Nazwa użytkownika” z `placeholder="np. admin"`).
  - Zaktualizowano badge użytkownika w nagłówku panelu pracownika (`Dashboard`), wyświetlający `username`.
- [x] Przeprowadzono automatyczne testy integracyjne każdego endpointu (kod 201 dla POST, 401 dla nieautoryzowanego GET, 200 z tokenem dla POST /login, 200 dla autoryzowanego GET, 200 dla PATCH /api/zgloszenia/:id/status, 200 dla DELETE /api/zgloszenia/:id, 400 dla nieprawidłowego ID, 404 dla powtórnego usunięcia, test logowania nową nazwą użytkownika i tworzenia pracownika).

---

## 3. Struktura plików w projekcie

```
strona_z_bd/
├── .env                     # Zmienne środowiskowe (hasła, porty, klucze JWT) - ignorowane w git
├── .env.example             # Szablon zmiennych środowiskowych do repozytorium
├── .gitignore               # Ignorowanie node_modules, .env, plików logów
├── context.md               # [TEN PLIK] Pełny kontekst projektu, stan prac i dokumentacja, głównie dla agentów AI
├── index.html               # Frontend: formularz zgłoszeniowy + panel pracownika (SPA)
├── index.js                 # Główny serwer Express.js + routing API + middleware JWT
├── package.json             # Zależności npm i skrypty startowe
├── package-lock.json        # Zablokowane wersje pakietów npm
├── schemat.sql              # Struktura tabel MySQL (zgloszenia, uzytkownicy)
├── seed.js                  # Skrypt inicjalizujący schemat bazy danych
└── node_modules/            # Zależności backendu
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
| `imie` | `VARCHAR(50) NOT NULL` | Imię zgłaszającego |
| `nazwisko` | `VARCHAR(50) NOT NULL` | Nazwisko zgłaszającego |
| `adres` | `TEXT NOT NULL` | Adres klienta / odbioru sprzętu |
| `numer_telefonu` | `VARCHAR(20) NOT NULL` | Telefon kontaktowy |
| `email` | `VARCHAR(100) NOT NULL` | Email klienta |
| `opis_usterki` | `TEXT NOT NULL` | Treść zgłoszenia, opis awarii |
| `numer_fv` | `VARCHAR(50) NULL` | Opcjonalny numer faktury lub paragonu |
| `status` | `ENUM('nowe', 'w_realizacji', 'zakończone')` | Domyślnie `'nowe'` |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | Data i czas rejestracji |

### Tabela `uzytkownicy`:
| Kolumna | Typ | Opis |
| :--- | :--- | :--- |
| `id` | `INT AUTO_INCREMENT PRIMARY KEY` | Unikalny identyfikator użytkownika |
| `username` | `VARCHAR(50) NOT NULL UNIQUE` | Nazwa użytkownika (login do panelu) |
| `email` | `VARCHAR(100) NULL UNIQUE` | Opcjonalny adres email użytkownika |
| `password_hash` | `VARCHAR(255) NOT NULL` | Hash hasła (bcrypt) |
| `role` | `VARCHAR(20) DEFAULT 'admin'` | Rola uprawnień (`admin`, `pracownik`) |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | Data utworzenia konta |

---

## 6. Dokumentacja Endpointów API

### 1. Rejestracja nowego zgłoszenia (Publiczne)
- **Metoda:** `POST`
- **Ścieżka:** `/api/zgloszenia`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):**
```json
{
  "imie": "Jan",
  "nazwisko": "Kowalski",
  "adres": "ul. Kwiatowa 5, Warszawa",
  "numer_telefonu": "+48 600 700 800",
  "email": "jan.kowalski@example.com",
  "opis_usterki": "Ekran nie działa.",
  "numer_fv": "FV/2026/0123"
}
```
- **Odpowiedź sukcesu (201 Created):**
```json
{
  "message": "Zgłoszenie serwisowe zostało pomyślnie przyjęte.",
  "id": 1
}
```
- **Błędy:** `400 Bad Request` (brak wymaganych pól), `500 Internal Server Error`.

---

### 2. Logowanie pracownika / admina (Publiczne, generuje JWT)
- **Metoda:** `POST`
- **Ścieżka:** `/api/login`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):**
```json
{
  "username": "admin",
  "password": "admin123"
}
```
- **Odpowiedź sukcesu (200 OK):**
```json
{
  "message": "Zalogowano pomyślnie.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@serwis.pl",
    "role": "admin"
  }
}
```
- **Błędy:** `400 Bad Request` (brak nazwy użytkownika lub hasła), `401 Unauthorized` (błędna nazwa użytkownika lub hasło).

---

### 3. Pobieranie listy zgłoszeń (Chronione)
- **Metoda:** `GET`
- **Ścieżka:** `/api/zgloszenia`
- **Headers:** `Authorization: Bearer <TOKEN_JWT>`
- **Odpowiedź sukcesu (200 OK):**
```json
[
  {
    "id": 1,
    "imie": "Jan",
    "nazwisko": "Kowalski",
    "adres": "ul. Kwiatowa 5, Warszawa",
    "numer_telefonu": "+48 600 700 800",
    "email": "jan.kowalski@example.com",
    "opis_usterki": "Ekran nie działa.",
    "numer_fv": "FV/2026/0123",
    "status": "nowe",
    "created_at": "2026-10-05T08:04:13.000Z"
  }
]
```
- **Błędy autoryzacji:**
  - `401 Unauthorized`: brak nagłówka `Authorization` lub brak tokenu.
  - `403 Forbidden`: nieprawidłowy, zmodyfikowany lub wygasły token JWT.

---

### 4. Aktualizacja statusu zgłoszenia (Chronione)
- **Metoda:** `PATCH` (lub `PUT`)
- **Ścieżka:** `/api/zgloszenia/:id/status`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <TOKEN_JWT>`
- **Body (JSON):**
```json
{
  "status": "w_realizacji"
}
```
*Dozwolone wartości statusu:* `"nowe"`, `"w_realizacji"`, `"zakończone"`.
- **Odpowiedź sukcesu (200 OK):**
```json
{
  "message": "Status zgłoszenia został zaktualizowany.",
  "id": 1,
  "status": "w_realizacji"
}
```
- **Błędy:**
  - `400 Bad Request`: niedozwolony status (inny niż dozwolone).
  - `401 Unauthorized` / `403 Forbidden`: brak lub nieprawidłowy token JWT.
  - `404 Not Found`: brak zgłoszenia o podanym ID.

---

### 5. Usunięcie zgłoszenia serwisowego (Chronione)
- **Metoda:** `DELETE`
- **Ścieżka:** `/api/zgloszenia/:id`
- **Headers:**
  - `Authorization: Bearer <TOKEN_JWT>`
- **Parametry URL:** `id` (liczba całkowita - identyfikator usuwanego zgłoszenia)
- **Odpowiedź sukcesu (200 OK):**
```json
{
  "message": "Zgłoszenie zostało pomyślnie usunięte.",
  "id": 1
}
```
- **Błędy:**
  - `400 Bad Request`: nieprawidłowe ID (nie będące liczbą całkowitą).
  - `401 Unauthorized` / `403 Forbidden`: brak lub nieprawidłowy token JWT.
  - `404 Not Found`: brak zgłoszenia o podanym ID w bazie.
  - `500 Internal Server Error`: błąd serwera/bazy danych podczas usuwania.

---

### 6. Health-Check
- **Metoda:** `GET`
- **Ścieżka:** `/api/health`
- **Odpowiedź (200 OK):**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-10-05T08:05:00.000Z"
}
```

---

## 7. Instrukcja uruchomienia i testowania

### Wymagania wstępne:
1. Zainstalowany Node.js (wersja >= 18).
2. Działający serwer MySQL (np. XAMPP, Laragon, MariaDB, Docker lub lokalna usługa MySQL na porcie 3306).

### Krok 1: Inicjalizacja bazy i seed danych
```bash
npm run seed
```

### Krok 2: Uruchomienie serwera
Standardowy start:
```bash
npm start
```
Tryb deweloperski z auto-restartem (`node --watch`):
```bash
npm run dev
```

Serwer domyślnie nasłuchuje na `http://localhost:3000`.

### Krok 3: Otwarcie aplikacji w przeglądarce
Otwórz w przeglądarce:
```
http://localhost:3000
```
- Zakładka **"Nowe zgłoszenie"**: pozwala przetestować `POST /api/zgloszenia`.
- Zakładka **"Panel pracownika"**: pozwala przetestować `POST /api/login` oraz chroniony `GET /api/zgloszenia`.

---

## 8. Stan prac: Co jest aktualnie w toku (In Progress)
- Weryfikacja działania w środowisku lokalnym użytkownika oraz testy panelu pracownika (logowanie nazwą użytkownika, usuwanie zgłoszeń, aktualizacja statusu).

---

## 9. Stan prac: Co jest do zrobienia (Backlog / Sugestie rozwoju)
1. **[ZREALIZOWANE] Logowanie nazwą użytkownika zamiast emaila:**
   - Zmiana schematu bazy danych, endpointu `POST /api/login` i formularza React na wymaganie nazwy użytkownika (`username`).
2. **[ZREALIZOWANE] Zmiana statusu zgłoszenia:**
   - Dodano endpoint `PATCH /api/zgloszenia/:id/status` oraz przycisk i listę wyboru w panelu pracownika.
3. **[ZREALIZOWANE] Usuwanie zgłoszeń z poziomu panelu pracownika:**
   - Dodano chroniony endpoint `DELETE /api/zgloszenia/:id` oraz przycisk `Usuń` z potwierdzeniem dialogowym w tabeli panelu pracownika.
4. **Filtrowanie i wyszukiwanie zgłoszeń:**
   - Filtry w `GET /api/zgloszenia?status=nowe&search=Kowalski`.
5. **Powiadomienia E-mail:**
   - Wysyłka potwierdzenia przyjęcia zgłoszenia na adres e-mail klienta (np. za pomocą `nodemailer`).
6. **Wyszukiwarka statusu zgłoszenia dla klienta:**
   - Publiczny endpoint `GET /api/zgloszenia/status/:id` lub po numerze telefonu i ID, aby klient mógł śledzić postęp bez konieczności logowania się do panelu pracownika.
7. **Obsługa załączników (np. zdjęcia usterki):**
   - Dodanie pakietu `multer` i zapis zdjęć uszkodzeń sprzętu.
