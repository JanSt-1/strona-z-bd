# Kontekst Projektu: System Obsługi Zgłoszeń Serwisowych

Kompleksowy system zgłoszeń serwisowych (SPA + REST API) w technologii **Express.js (v5)**, **MySQL** oraz **React 18** (bez bundlera, osadzony w `public/index.html`).

---

## 1. Architektura i Struktura Plików

```
strona_z_bd/
├── .env / .env.example      # Zmienne: PORT, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, JWT_SECRET
├── app.js                   # Instancja Express: middleware, RBAC, walidacja, JWT, routing, pula DB (bez app.listen())
├── index.js                 # Entrypoint serwera: weryfikacja .env i JWT_SECRET, test DB, app.listen()
├── app.test.js              # Testy integracyjne API (node:test + supertest, 9 testów, mock DB przez app.setPool())
├── schemat.sql              # Schemat MySQL (tabele: uzytkownicy, zgloszenia)
├── seed.js                  # Inicjalizacja bazy i aplikowanie schemat.sql (`npm run seed`)
├── create-user.js           # CLI: tworzenie kont z haszowaniem bcrypt (`node create-user.js <user> <pass> [rola]`)
├── public/
│   ├── index.html           # SPA w React 18: formularz zgłoszeniowy klienta + panel pracownika z RBAC
│   └── logo_mentor4.svg     # Logo systemu w nagłówku
└── context.md               # [TEN PLIK] Wytyczne architektoniczne i biznesowe dla deweloperów i agentów AI
```

- **Separation of Concerns:** `app.js` eksportuje aplikację Express i udostępnia `app.setPool(pool)` / `app.getPool()`. `index.js` wyłącznie uruchamia serwer HTTP (`app.listen()`).
- **Pula połączeń:** `mysql2/promise` z parametryzowanymi zapytaniami (`?`).

---

## 2. Baza Danych MySQL (`schemat.sql`, baza: `serwis_db`)

### Tabela `uzytkownicy`
- `id` (INT PK AI), `username` (VARCHAR(50) UNIQUE NOT NULL), `password_hash` (VARCHAR(255) NOT NULL), `role` (VARCHAR(20) DEFAULT 'pracownik'), `created_at` (TIMESTAMP).
- **Dozwolone role:** `admin`, `serwisant`, `pracownik`, `magazynier`.

### Tabela `zgloszenia`
- `id` (INT PK AI), `imie` (VARCHAR(50)), `nazwisko` (VARCHAR(50)), `nazwa_firmy` (VARCHAR(100) NULL), `adres` (TEXT), `kod_pocztowy` (VARCHAR(6)), `miasto` (VARCHAR(100)), `wojewodztwo` (VARCHAR(50)), `numer_telefonu` (VARCHAR(20)), `email` (VARCHAR(100)), `opis_usterki` (TEXT), `numer_fv` (VARCHAR(50)), `nip` (VARCHAR(10)), `przedmiot_zgloszenia` (VARCHAR(100)), `numer_seryjny` (VARCHAR(100) NULL), `data_zakupu` (DATE), `status` (ENUM('nowe', 'w_realizacji', 'do_wysylki', 'zakończone') DEFAULT 'nowe'), `created_at` (TIMESTAMP).
- **Pola przepływu serwisowego:**
  - `przypisany_pracownik_id` (INT NULL FK do `uzytkownicy.id` ON DELETE SET NULL)
  - `opis_naprawy` (TEXT NULL), `opis_naprawy_data` (DATETIME NULL)
  - `data_wyslania` (DATETIME NULL), `numer_listu` (VARCHAR(100) NULL)

---

## 3. Role Użytkowników i Cykl Życia Zgłoszenia (RBAC)

```
[Klient: formularz publiczny] ──► status: 'nowe'
         │
         ▼
[Admin / Serwisant] ─────────────► Przypisuje pracownika (status nadal: 'nowe')
                                         │
                                         ▼
                                   [Pracownik: widzi tylko swoje zgłoszenia]
                                   - Klika "Rozpocznij realizację" ──► status: 'w_realizacji'
                                   - Wykonuje naprawę i wypełnia raport w modalu ──► status: 'do_wysylki'
                                         │ (opis_naprawy_data = NOW())
                                         ▼
                                   [Magazynier: widzi tylko 'do_wysylki' i 'zakończone']
                                   - Wpisuje numer_listu i klika "Oznacz jako wysłane" ──► status: 'zakończone'
                                           (data_wyslania = NOW())
```

### Uprawnienia ról:
| Rola | Widoczność zgłoszeń | Przypisywanie pracownika | Zmiana statusu / Naprawa | Inne uprawnienia |
| :--- | :--- | :--- | :--- | :--- |
| **`admin`** | Wszystkie | Tak | Pełna zmiana statusów, edycja | Usuwanie zgłoszeń (`DELETE`), tworzenie kont (`POST /api/admin/users`) |
| **`serwisant`** | Wszystkie | Tak | **Brak** (blokada 403 w API, brak kontrolek w UI) | — |
| **`pracownik`** | **Tylko przypisane do siebie** | Nie | Tylko własne: `w_realizacji` oraz `do_wysylki` (z opisem naprawy) | — |
| **`magazynier`** | **Tylko `do_wysylki` i `zakończone`** | Nie | Wyłącznie na `zakończone` (wymagany `numer_listu`) | — |

---

## 4. Specyfikacja API REST

Format odpowiedzi błędów: `{ error: string }`.

| Metoda | Endpoint | Dostęp / Rola | Opis i Walidacja |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/zgloszenia` | Publiczny | Rejestracja zgłoszenia. Rygorystyczna walidacja: imię/nazwisko (bez cyfr, litery), NIP (10 cyfr), kod (`XX-XXX`), województwo (z listy 16), telefon (`+48` + 9 cyfr), przedmiot (z listy dozwolonych), data zakupu (`RRRR-MM-DD`). `numer_seryjny` obowiązkowy wyłącznie dla monitorów i tablic interaktywnych (bez akcesoriów). Zwraca 201 `{ message, id }`. |
| `POST` | `/api/login` | Publiczny | Logowanie (`username`, `password`). Rate limit: 10 prób / 15 min z IP (pomijany w `NODE_ENV === 'test'`). Weryfikacja hasła przez bcrypt. Zwraca 200 `{ token, user: { id, username, role } }`. |
| `GET` | `/api/pracownicy` | JWT (`admin`, `serwisant`) | Pobiera listę pracowników do przypisania (`pracownik`, `serwisant`). |
| `GET` | `/api/zgloszenia` | JWT (dowolna rola) | Lista zgłoszeń filtrowana wg roli użytkownika (pracownik: przypisane; magazynier: `do_wysylki`, `zakończone`; admin/serwisant: wszystkie). |
| `PATCH` | `/api/zgloszenia/:id/przypisz` | JWT (`admin`, `serwisant`) | Przypisanie pracownika (`{ pracownik_id }` lub `null`). Nie zmienia statusu. |
| `PATCH` | `/api/zgloszenia/:id/naprawione` | JWT (`pracownik`, `admin`) | Zatwierdzenie naprawy (`{ opis_naprawy }`). Ustawia status `do_wysylki` oraz `opis_naprawy_data = NOW()`. Serwisant i magazynier otrzymują 403. |
| `PATCH/PUT`| `/api/zgloszenia/:id/status` | JWT (`admin`, `pracownik`, `magazynier`) | Zmiana statusu wg reguł RBAC. Przy `do_wysylki` wymagany opis naprawy. Przy `zakończone` magazynier musi podać `numer_listu` (`data_wyslania = NOW()`). Serwisant otrzymuje 403. |
| `DELETE`| `/api/zgloszenia/:id` | JWT (`admin`) | Usunięcie zgłoszenia z bazy danych. |
| `POST` | `/api/admin/users` | JWT (`admin`) | Utworzenie nowego użytkownika (`username`, `password`, `role`). Haszowanie bcrypt (salt 10). |
| `GET` | `/api/health` | Publiczny | Health check bazy MySQL: `{ status: 'ok', database: 'connected' }`. |

---

## 5. Frontend SPA (`public/index.html`)

- Czysty **React 18 + Babel Standalone** serwowany statycznie przez Express.
- Dwa niezależne widoki: formularz publiczny klienta (`PublicTicketForm`) oraz panel pracownika (`Dashboard` z logowaniem `LoginForm`).
- **Bezpieczeństwo sesji:** token JWT przechowywany w `localStorage` (`serwis_token`). Pomocnik `apiFetch` pobiera token dynamicznie przed każdym żądaniem. Błędy 401/403 (`handleAuthError`) natychmiast czyszczą stan i wylogowują użytkownika.
- Pomocnik `apiJson(endpoint, options, fallbackError)` obsługuje ujednolicone zapytania API i wyłapuje błędy backendu.

---

## 6. Uruchomienie i Testy

```bash
npm install               # Instalacja zależności
npm run seed              # Wgranie schematu bazy danych (schemat.sql)
node create-user.js admin Haslo123 admin   # Utworzenie pierwszego konta
npm start                 # Start serwera (port 3000)
npm run dev               # Start serwera w trybie watch
npm test                  # Uruchomienie 9 testów integracyjnych (node --test app.test.js)
```

---

## 7. Kluczowe Zasady i Wytyczne dla Agentów AI

1. **Separation of Concerns:**
   - Całość logiki tras, middleware, JWT i walidacji musi znajdować się w `app.js`.
   - `index.js` służy wyłącznie jako punkt wejściowy (`app.listen()`), weryfikuje obecność `JWT_SECRET` oraz sprawdza połączenie z bazą. Nigdy nie definiować tras w `index.js`.
   - Testy integracyjne importują `app.js` i mockują bazę przez `app.setPool(mockPool)`. Oryginalna pula musi być przywracana w `after()`.
2. **BEZWZGLĘDNY ZAKAZ TWORZENIA FURTEK I DZIUR W WALIDACJI (SECURITY INTEGRITY):**
   - **Brak domyślnych sekretów:** Nigdy nie dodawać do kodu aplikacji produkcyjnej domyślnych/fallbackowych sekretów (np. `const JWT_SECRET = process.env.JWT_SECRET || 'sekret_testowy'`). W `app.js` brak `process.env.JWT_SECRET` musi natychmiast rzucać błąd `throw new Error(...)`.
   - **Izolacja testów:** Zmienne testowe wolno konfigurować wyłącznie w plikach testowych (`app.test.js`) przed załadowaniem aplikacji. Nigdy nie obniżać poziomu bezpieczeństwa kodu produkcyjnego na potrzeby testów.
   - **Zakaz osłabiania walidacji:** Żaden agent nie ma prawa usuwać, omijać ani rozluźniać walidacji wejściowych (NIP, kod, regexy, role RBAC, bcrypt) pod pretekstem testów. Testy muszą spełniać produkcyjne wymagania walidacji.
   - **Algorytm JWT:** Wymuszać jawnie algorytm `HS256` zarówno przy generowaniu (`jwt.sign`), jak i weryfikacji (`jwt.verify({ algorithms: ['HS256'] })`), chroniąc przed podatnościami Algorithm Confusion / `alg: none`.
3. **Baza danych:** Zawsze stosować zapytania parametryzowane (`?`) w puli `mysql2/promise`. Nie wprowadzać twardo kodowanych poświadczeń do repozytorium.