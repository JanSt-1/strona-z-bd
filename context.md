# Kontekst Projektu: System Obsługi Zgłoszeń Serwisowych

Kompleksowy system zgłoszeń serwisowych (SPA + REST API) w technologii **Express.js (v5)**, **MySQL** oraz **React 18** (bez bundlera, osadzony w `public/index.html`).

---

## 1. Architektura i Struktura Plików

```
strona_z_bd/
├── .env / .env.example      # Zmienne: PORT, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, JWT_SECRET
├── app.js                   # Instancja Express: middleware, RBAC, walidacja, JWT, routing, pula DB (bez app.listen())
├── index.js                 # Entrypoint serwera: weryfikacja .env i JWT_SECRET, test DB, app.listen()
├── app.test.js              # Testy integracyjne API (node:test + supertest, 38 testów, mock DB przez app.setPool())
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

## 3. Role Użytkowników i Przejścia Statusów (RBAC)

### Mapa przejść statusów i funkcja `czyMoznaZmienic(rola, zStatusu, naStatus)`
```javascript
const PRZEJSCIA = {
    nowe:         { w_realizacji: ['admin', 'serwisant'] },
    w_realizacji: { do_wysylki: ['admin', 'serwisant', 'pracownik'] },
    do_wysylki:   { 'zakończone': ['admin', 'magazynier'] }
};
```
Wszystkie endpointy modyfikujące status zgłoszenia (`PATCH/PUT /api/zgloszenia/:id/status`, `PATCH /api/zgloszenia/:id/naprawione`, `PATCH /api/zgloszenia/:id/przypisz`) korzystają ze wspólnej funkcji walidacji:
`czyMoznaZmienic(rola, zStatusu, naStatus)`:
- **409 Conflict:** gdy przejście jest niedozwolone w cyklu życia (np. pomijanie etapów: `nowe` → `zakończone`, `w_realizacji` → `zakończone`) – komunikat: `Nie można zmienić statusu z »${zStatusu}« na »${naStatus}«.`.
- **403 Forbidden:** gdy dane przejście istnieje w procesie lub jest cofnięciem, lecz rola użytkownika nie ma uprawnień (np. cofanie przez nie-admina, pracownik próbujący `nowe` → `w_realizacji`).

### Reguły przejść statusów:
| Z → Na | Kto | Warunki i zachowanie |
| :--- | :--- | :--- |
| `nowe` → `w_realizacji` | automatycznie przy przypisaniu (`admin`, `serwisant`) | W `PATCH /api/zgloszenia/:id/przypisz` przypisanie pracownika automatycznie zmienia status z `nowe` na `w_realizacji`. Dostępne także przez endpoint statusu. |
| `w_realizacji` → `do_wysylki` | przypisany pracownik, serwisant, admin | **Wyłącznie przez `PATCH /api/zgloszenia/:id/naprawione`** (z wymaganym `opis_naprawy`). Automatycznie zapisuje `opis_naprawy_data = NOW()`. W `/status` zmiana na `do_wysylki` jest zablokowana (400). |
| `do_wysylki` → `zakończone` | magazynier, admin | Oznaczenie jako wysłane. Magazynier ma obowiązek podać `numer_listu` (zapisywane `data_wyslania = NOW()`). |
| **Cofanie statusu** | **tylko admin** | Zmiana statusu wstecz wg kolejności `['nowe', 'w_realizacji', 'do_wysylki', 'zakończone']` jest dozwolona wyłącznie dla `admin` (dla pozostałych ról: 403 Forbidden). |
| **Niedozwolony skok** | **nikt** | Przejścia niezdefiniowane w `PRZEJSCIA` (np. `nowe` → `zakończone`) zwracają **409 Conflict**. |

### Widoczność i uprawnienia ról:
| Rola | Widoczność zgłoszeń | Przypisywanie pracownika | Zmiana statusu / Naprawa | Inne uprawnienia |
| :--- | :--- | :--- | :--- | :--- |
| **`admin`** | Wszystkie | Tak | Pełne przejścia w przód oraz **wyłączne prawo do cofania statusów** | Usuwanie (`DELETE`), tworzenie kont (`POST /api/admin/users`) |
| **`serwisant`** | Wszystkie | Tak (auto: `nowe` → `w_realizacji`) | Może oznaczyć `w_realizacji` → `do_wysylki` (przez `/naprawione`) | — |
| **`pracownik`** | **Tylko przypisane do siebie** | Nie | Może oznaczyć `w_realizacji` → `do_wysylki` (przez `/naprawione` dla własnych zadań) | — |
| **`magazynier`** | **Tylko `do_wysylki` i `zakończone`** | Nie | Wyłącznie `do_wysylki` → `zakończone` (wymagany `numer_listu`) | — |

---

## 4. Specyfikacja API REST

Format odpowiedzi błędów: `{ error: string }`.

| Metoda | Endpoint | Dostęp / Rola | Opis i Walidacja |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/zgloszenia` | Publiczny | Rejestracja zgłoszenia. Rygorystyczna walidacja: imię/nazwisko (bez cyfr, litery), NIP (10 cyfr), kod (`XX-XXX`), województwo (z listy 16), telefon (`+48` + 9 cyfr), przedmiot (z listy dozwolonych), data zakupu (`RRRR-MM-DD`). `numer_seryjny` obowiązkowy wyłącznie dla monitorów i tablic interaktywnych (bez akcesoriów). Zwraca 201 `{ message, id }`. |
| `POST` | `/api/login` | Publiczny | Logowanie (`username`, `password`). Rate limit: 10 prób / 15 min z IP (pomijany w `NODE_ENV === 'test'`). Weryfikacja hasła przez bcrypt. Zwraca 200 `{ token, user: { id, username, role } }`. |
| `GET` | `/api/pracownicy` | JWT (`admin`, `serwisant`) | Pobiera listę pracowników do przypisania (`pracownik`, `serwisant`). |
| `GET` | `/api/zgloszenia` | JWT (dowolna rola) | Lista zgłoszeń filtrowana wg roli użytkownika (pracownik: przypisane; magazynier: `do_wysylki`, `zakończone`; admin/serwisant: wszystkie). |
| `PATCH` | `/api/zgloszenia/:id/przypisz` | JWT (`admin`, `serwisant`) | Przypisanie pracownika (`{ pracownik_id }` lub `null`). Wybrany użytkownik musi mieć rolę mogącą naprawiać (`pracownik` lub `serwisant`, błąd 400 dla innych). Jeśli status to `nowe` i przypisywany jest pracownik, status automatycznie przechodzi na `w_realizacji`. |
| `PATCH` | `/api/zgloszenia/:id/naprawione` | JWT (`pracownik`, `serwisant`, `admin`) | **Jedyna droga do statusu `do_wysylki`**. Zatwierdzenie naprawy (`{ opis_naprawy }`). Ustawia status `do_wysylki` oraz `opis_naprawy_data = NOW()`. Dla pracownika dotyczy wyłącznie przypisanego zadania. Magazynier otrzymuje 403. |
| `PATCH/PUT`| `/api/zgloszenia/:id/status` | JWT (zgodnie z RBAC) | Zmiana statusu wg mapy `PRZEJSCIA` z wyłączeniem `do_wysylki` (blokada 400 – wymagane użycie `/naprawione`). Cofanie statusu dozwolone wyłącznie dla `admin`. Przy `zakończone` magazynier musi podać `numer_listu` (`data_wyslania = NOW()`). |
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
npm test                  # Uruchomienie 38 testów integracyjnych (node --test app.test.js)
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