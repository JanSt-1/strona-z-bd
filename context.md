# Kontekst Projektu: System Obsługi Zgłoszeń Serwisowych

Kompleksowy system zgłoszeń serwisowych (SPA + REST API) w technologii **Express.js (v5)**, **MySQL** oraz **React 18** (bez bundlera, osadzony w `public/index.html`).

---

## 1. Architektura i Struktura Plików

```
strona_z_bd/
├── .env / .env.example      # Zmienne: PORT, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, JWT_SECRET
├── app.js                   # Instancja Express: middleware, RBAC, walidacja, JWT, routing, pula DB (bez app.listen())
├── db.js                    # Centralna konfiguracja połączenia MySQL (DB_PORT, createPool, createConnection)
├── index.js                 # Entrypoint serwera: weryfikacja .env i JWT_SECRET, test DB, app.listen()
├── app.test.js              # Testy integracyjne API (node:test + supertest, 82 testy, mock DB przez app.setPool())
├── schemat.sql              # Schemat MySQL (tabele: uzytkownicy, zgloszenia, historia_zgloszen)
├── seed.js                  # Inicjalizacja bazy i aplikowanie schemat.sql (`npm run seed`)
├── create-user.js           # CLI: tworzenie kont z haszowaniem bcrypt (`node create-user.js <user> <pass> [rola]`)
├── public/
│   ├── index.html           # SPA w React 18: formularz zgłoszeniowy klienta + panel pracownika z RBAC
│   └── logo_mentor4.svg     # Logo systemu w nagłówku
└── context.md               # [TEN PLIK] Wytyczne architektoniczne i biznesowe dla deweloperów i agentów AI
```

- **Separation of Concerns:** `app.js` eksportuje aplikację Express i udostępnia `app.setPool(pool)` / `app.getPool()`. `index.js` wyłącznie uruchamia serwer HTTP (`app.listen()`).
- **Moduł bazy danych (`db.js`):** Centralizuje odczyt konfiguracji MySQL z `.env` (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`) i eksportuje pomocniki `createPool()` oraz `createConnection()`, wykorzystywane wspólnie przez `app.js`, `seed.js` i `create-user.js`.
- **Pula połączeń:** `mysql2/promise` z parametryzowanymi zapytaniami (`?`).

---

## 2. Baza Danych MySQL (`schemat.sql`, baza: `serwis_db`)

### Tabela `uzytkownicy`
- `id` (INT PK AI), `username` (VARCHAR(50) UNIQUE NOT NULL), `password_hash` (VARCHAR(255) NOT NULL), `role` (VARCHAR(20) DEFAULT 'pracownik'), `aktywny` (BOOLEAN NOT NULL DEFAULT TRUE), `created_at` (TIMESTAMP).
- **Dozwolone role:** `admin`, `serwisant`, `pracownik`, `magazynier`.
- **Blokowanie kont:** Użytkownicy z `aktywny = FALSE` nie mogą się zalogować (403 Forbidden). Zamiast usuwać powiązane z historią zgłoszeń konta, administrator zarządza flagą aktywności. Administrator nie może zablokować ani odebrać roli samemu sobie.

### Tabela `zgloszenia`
- `id` (INT PK AI), `imie` (VARCHAR(50)), `nazwisko` (VARCHAR(50)), `nazwa_firmy` (VARCHAR(100) NULL), `adres` (TEXT), `kod_pocztowy` (VARCHAR(6)), `miasto` (VARCHAR(100)), `numer_telefonu` (VARCHAR(20)), `email` (VARCHAR(100)), `opis_usterki` (TEXT), `numer_fv` (VARCHAR(50)), `nip` (VARCHAR(10)), `przedmiot_zgloszenia` (VARCHAR(100)), `numer_seryjny` (VARCHAR(100) NULL), `data_zakupu` (DATE), `status` (ENUM('nowe', 'w_realizacji', 'do_wysylki', 'zakończone') DEFAULT 'nowe'), `created_at` (TIMESTAMP).
- **Pola przepływu serwisowego:**
  - `przypisany_pracownik_id` (INT NULL FK do `uzytkownicy.id` ON DELETE SET NULL)
  - `opis_naprawy` (TEXT NULL), `opis_naprawy_data` (DATETIME NULL)
  - `data_wyslania` (DATETIME NULL), `numer_listu` (VARCHAR(100) NULL)

### Tabela `historia_zgloszen`
- `id` (INT PK AI), `zgloszenie_id` (INT NOT NULL), `uzytkownik_id` (INT NULL FK do `uzytkownicy.id` ON DELETE SET NULL), `akcja` (VARCHAR(100) NOT NULL), `z_statusu` (VARCHAR(50) NULL), `na_status` (VARCHAR(50) NULL), `szczegoly` (TEXT NULL), `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Cel i zasada trwałości:** Zapisuje audyt każdej zmiany w zgłoszeniu: utworzenie (`utworzenie`), przypisanie lub odpięcie pracownika (`przypisanie`), zatwierdzenie naprawy (`naprawa`), zmiana statusu (`zmiana_statusu`), aktualizacja numeru listu (`zmiana_numeru_listu`), wysyłka (`wysyłka`) oraz usunięcie (`usunięcie`).
- **Zachowanie historii przy usuwaniu zgłoszenia:** Kolumna `zgloszenie_id` **celowo nie posiada klucza obcego z `ON DELETE CASCADE`** do tabeli `zgloszenia`. Dzięki temu, gdy administrator usunie zgłoszenie (`DELETE /api/zgloszenia/:id`), cała dotychczasowa historia pozostaje w bazie, a przed usunięciem zgłoszenia rejestrowany jest wpis o usunięciu (np. `Wpis usunięty przez admin`).
- **Funkcja pomocnicza:** `dodajWpisHistorii(zgloszenieId, uzytkownikId, akcja, zStatusu, naStatus, szczegoly)` wywoływana asynchronicznie z każdego endpointu modyfikującego zgłoszenie.

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
| **Cofanie statusu** | **tylko admin** | Zmiana statusu wstecz wg kolejności `['nowe', 'w_realizacji', 'do_wysylki', 'zakończone']` jest dozwolona wyłącznie dla `admin` (dla pozostałych ról: 403 Forbidden). **Czyszczenie danych późniejszych etapów:** cofnięcie przed `zakończone` czyści `data_wyslania` i `numer_listu` na `NULL`; cofnięcie przed `do_wysylki` czyści `opis_naprawy` i `opis_naprawy_data` na `NULL`, przenosząc treść opisu naprawy do wpisu w `historia_zgloszen`. |
| **Niedozwolony skok** | **nikt** | Przejścia niezdefiniowane w `PRZEJSCIA` (np. `nowe` → `zakończone`) zwracają **409 Conflict**. |

### Widoczność i uprawnienia ról:
| Rola | Widoczność zgłoszeń | Przypisywanie pracownika | Zmiana statusu / Naprawa | Inne uprawnienia |
| :--- | :--- | :--- | :--- | :--- |
| **`admin`** | Wszystkie | Tak | Pełne przejścia w przód oraz **wyłączne prawo do cofania statusów** | Usuwanie (`DELETE`), pełne zarządzanie kontami (`/api/admin/users*` - lista bez hashy, role, hasła, blokady; bez możliwości blokady/odebrania roli sobie) |
| **`serwisant`** | Wszystkie | Tak (auto: `nowe` → `w_realizacji`) | Może oznaczyć `w_realizacji` → `do_wysylki` (przez `/naprawione`) | — |
| **`pracownik`** | **Tylko przypisane do siebie** | Nie | Może oznaczyć `w_realizacji` → `do_wysylki` (przez `/naprawione` dla własnych zadań) | — |
| **`magazynier`** | **Tylko `do_wysylki` i `zakończone`** | Nie | Wyłącznie `do_wysylki` → `zakończone` (wymagany `numer_listu`) | — |

---

## 4. Specyfikacja API REST

Format odpowiedzi błędów: `{ error: string }`.

| Metoda | Endpoint | Dostęp / Rola | Opis i Walidacja |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/zgloszenia` | Publiczny | Rejestracja zgłoszenia. Rygorystyczna walidacja: imię/nazwisko (bez cyfr, litery), NIP (10 cyfr), kod (`XX-XXX`), telefon (`+48` + 9 cyfr), przedmiot (z listy dozwolonych), data zakupu (`RRRR-MM-DD`, istniejąca w kalendarzu, nie z przyszłości; w przeciwnym razie 400). Limity długości zgodne z kolumnami (np. `numer_seryjny` max 100). `numer_seryjny` obowiązkowy wyłącznie dla monitorów i tablic interaktywnych (bez akcesoriów). Zwraca 201 `{ message, id }`. |
| `POST` | `/api/login` | Publiczny | Logowanie (`username`, `password`). Rate limit: 10 prób / 15 min z IP (pomijany w `NODE_ENV === 'test'`). Weryfikacja hasła przez bcrypt. Blokada logowania dla kont z `aktywny = FALSE` (403). Zwraca 200 `{ token, user: { id, username, role } }`. |
| `GET` | `/api/pracownicy` | JWT (`admin`, `serwisant`) | Pobiera listę aktywnych pracowników do przypisania (`pracownik`, `serwisant`, `magazynier`). |
| `GET` | `/api/zgloszenia` | JWT (dowolna rola) | Lista zgłoszeń z obsługą paginacji, filtrów i wyszukiwania. Parametry query: `?szukaj=` (wyszukiwanie tekstowe LIKE we wszystkich polach, wyłącznie przez placeholdery `?`), `?status=` (filtr statusu), `?pracownik=` (filtr ID pracownika lub `nieprzypisane`), `?strona=` (numer strony, domyślnie 1, limit 25), `?limit=` (wielkość strony, max 100), `?sort=` (`asc` lub `desc` po dacie `created_at`). Zwraca obiekt `{ total, page, limit, totalPages, data, zgloszenia }`. Reguły ról RBAC (`pracownik` widzi tylko swoje, `magazynier` tylko `do_wysylki` i `zakończone`) są ściśle łączone (`AND`) z filtrami użytkownika. |
| `GET` | `/api/zgloszenia/:id` | JWT (dowolna rola) | Pobranie pełnych szczegółów pojedynczego zgłoszenia wraz z historią zdarzeń (`historia: Array`). Ochrona RBAC: `pracownik` może podejrzeć tylko własne, `magazynier` tylko `do_wysylki` i `zakończone`, `admin` i `serwisant` dowolne (403 przy braku uprawnień, 404 dla nieistniejącego ID). Zwraca `{ ...ticket, historia, zgloszenie }`. |
| `PATCH` | `/api/zgloszenia/:id/przypisz` | JWT (`admin`, `serwisant`) | Przypisanie pracownika (`{ pracownik_id }` lub `null`). Serwisant może przypisać pracownika, serwisanta lub magazyniera; administrator może przypisać dowolnego aktywnego użytkownika (w tym magazyniera po naprawie). Jeśli status to `nowe` i przypisywany jest pracownik/serwisant, status automatycznie przechodzi na `w_realizacji`. |
| `PATCH` | `/api/zgloszenia/:id/naprawione` | JWT (`pracownik`, `serwisant`, `admin`) | **Jedyna droga do statusu `do_wysylki`**. Zatwierdzenie naprawy (`{ opis_naprawy }`). Ustawia status `do_wysylki` oraz `opis_naprawy_data = NOW()`. Dla pracownika dotyczy wyłącznie przypisanego zadania. Magazynier otrzymuje 403. |
| `PATCH/PUT`| `/api/zgloszenia/:id/status` | JWT (zgodnie z RBAC) | Zmiana statusu wg mapy `PRZEJSCIA` z wyłączeniem `do_wysylki` w przód (blokada 400 – wymagane użycie `/naprawione`). Cofanie statusu dozwolone wyłącznie dla `admin`. **Czyszczenie etapów przy cofaniu:** cofnięcie przed `zakończone` resetuje `data_wyslania` i `numer_listu` na `NULL`; cofnięcie przed `do_wysylki` resetuje `opis_naprawy` i `opis_naprawy_data` na `NULL` oraz przenosi wycofany opis do wpisu historii (`szczegoly`). Walidacja `numer_listu`: max 100 znaków (VARCHAR(100)). Przy `zakończone` magazynier musi podać `numer_listu` (`data_wyslania = NOW()`). Magazynier może zaktualizować `numer_listu` dla zlecenia zakończonego, a **administrator może dodać lub zaktualizować `numer_listu` na dowolnym statusie zlecenia w dowolnym momencie**. |
| `DELETE`| `/api/zgloszenia/:id` | JWT (`admin`) | Usunięcie zgłoszenia z bazy danych. Przed usunięciem w `historia_zgloszen` zapisywany jest wpis o akcji `usunięcie` z informacją o administratorze usuwającym rekord (historia powiązana z `zgloszenie_id` pozostaje trwale w bazie). |
| `GET` | `/api/zgloszenia/:id/historia` | JWT (dowolna rola) | Pobranie chronologicznej historii zmian wybranego zgłoszenia (`id, zgloszenie_id, uzytkownik_id, username, akcja, z_statusu, na_status, szczegoly, created_at`). |
| `GET` | `/api/admin/users` | JWT (`admin`) | Pobranie listy wszystkich kont użytkowników (`id, username, role, aktywny, created_at`) **bez pola `password_hash`!** |
| `POST` | `/api/admin/users` | JWT (`admin`) | Utworzenie nowego użytkownika (`username` max 50 znaków, `password` min. 8 znaków, `role`). Haszowanie bcrypt (salt 10). |
| `PATCH` | `/api/admin/users/:id` | JWT (`admin`) | Zmiana roli użytkownika (`{ role }`). Zabezpieczenie: admin nie może odebrać roli admina samemu sobie (400). |
| `PATCH` | `/api/admin/users/:id/haslo` | JWT (`admin`) | Ustawienie nowego hasła dla użytkownika (`{ password }` min. 8 znaków). Haszowanie bcrypt. |
| `PATCH` | `/api/admin/users/:id/status` | JWT (`admin`) | Zmiana/przełączenie statusu blokady konta (`{ aktywny }` lub toggle). Zabezpieczenie: admin nie może zablokować samego siebie (400). |
| `PATCH` | `/api/profil/haslo` | JWT (każdy zalogowany) | Zmiana własnego hasła użytkownika (`{ currentPassword, newPassword }`). Weryfikuje stare hasło przez bcrypt, nowe hasło min. 8 znaków (400 przy błędzie). |
| `GET` | `/api/health` | Publiczny | Health check bazy MySQL: `{ status: 'ok', database: 'connected' }`. |

---

## 5. Frontend SPA (`public/index.html`)

- Czysty **React 18 + Babel Standalone** serwowany statycznie przez Express.
- Dwa niezależne widoki: formularz publiczny klienta (`PublicTicketForm`) oraz panel pracownika (`Dashboard` z logowaniem `LoginForm`).
- **Bezpieczeństwo sesji i obsługa błędów:** token JWT przechowywany w `localStorage` (`serwis_token`). Pomocnik `apiFetch` pobiera token dynamicznie przed każdym żądaniem.
  - **401 Unauthorized:** brakujący, nieprawidłowy lub wygasły token JWT. `handleAuthError` natychmiast czyści stan i wylogowuje użytkownika.
  - **403 Forbidden:** brak uprawnień do danej akcji (reguły ról RBAC, edycja zlecenia przypisanego do kogoś innego itp.). Frontend **nie wylogowuje** użytkownika, lecz wyświetla komunikat błędu z serwera w alercie (`showAlert(err.message, 'error')`).
- Pomocnik `apiJson(endpoint, options, fallbackError)` obsługuje ujednolicone zapytania API i wyłapuje błędy backendu.
- **Paginacja, wyszukiwanie i filtry listy zgłoszeń:**
  - Pasek wyszukiwania tekstowego, filtry statusu, przypisanego pracownika oraz sortowania po dacie utworzenia.
  - Paginacja (poprzednia/następna strona, informacja o łącznej liczbie wyników i stron).
- **Zarządzanie hasłami:**
  - Administrator ma dedykowaną zakładkę „Użytkownicy” z tabelą kont, zmianą roli, blokowaniem/odblokowywaniem, dodawaniem użytkowników oraz modalem „Zmień hasło” dla każdego konta.
  - Każdy zalogowany użytkownik (niezależnie od roli) ma w nagłówku panelu przycisk „Zmień hasło” otwierający modal weryfikujący dotychczasowe hasło i wymuszający min. 8 znaków dla nowego hasła.

---

## 6. Uruchomienie i Testy

```bash
npm install               # Instalacja zależności
npm run seed              # Wgranie schematu bazy danych (schemat.sql)
npm run seed:zgloszenia   # Wygenerowanie 200 realistycznych zgłoszeń z historią zdarzeń
node create-user.js admin Haslo123 admin   # Utworzenie pierwszego konta (hasło min. 8 znaków)
npm start                 # Start serwera (port 3000)
npm run dev               # Start serwera w trybie watch
npm test                  # Uruchomienie 93 testów integracyjnych (node --test app.test.js)
```

---

## 7. Kluczowe Zasady i Wytyczne dla Agentów AI

1. **Separation of Concerns:**
   - Całość logiki tras, middleware, JWT i walidacji musi znajdować się w `app.js`.
   - `index.js` służy wyłącznie jako punkt wejściowy (`app.listen()`), weryfikuje obecność `JWT_SECRET` oraz sprawdza połączenie z bazą. Nigdy nie definiować tras w `index.js`.
   - Testy integracyjne importują `app.js` i mockują bazę przez `app.setPool(mockPool)`. Oryginalna pula musi być przywracana w `after()`.
2. **BEZWZGLĘDNY ZAKAZ TWORZENIA FURTEK I DZIUR W WALIDACJI (SECURITY INTEGRITY):**
   - **Brak domyślnych sekretów:** Nigdy nie dodawać do kodu aplikacji produkcyjnej domyślnych/fallbackowych sekretów (np. `const JWT_SECRET = process.env.JWT_SECRET || 'sekret_testowy'`). W `app.js` brak `process.env.JWT_SECRET` musi natychmiast rzucać błąd `throw new Error(...)`.
   - **Izolacja testów:** Zmienne testowe wolno konfigurować wyłącznie w plikach testowych (`app.test.js`) przed załadowaniem aplikacji (jeśli brak `JWT_SECRET`, test generuje losowy klucz przez `crypto.randomBytes(32)` – bez statycznych sekretów w repozytorium). Nigdy nie obniżać poziomu bezpieczeństwa kodu produkcyjnego na potrzeby testów.
   - **Zakaz osłabiania walidacji:** Żaden agent nie ma prawa usuwać, omijać ani rozluźniać walidacji wejściowych (NIP, kod, regexy, role RBAC, bcrypt) pod pretekstem testów. Testy muszą spełniać produkcyjne wymagania walidacji.
   - **Polityka haseł:** Wymóg minimum 8 znaków dla hasła przy tworzeniu użytkownika (`POST /api/admin/users`, `create-user.js`) oraz przy zmianie hasła (`PATCH /api/admin/users/:id/haslo`). Hasło krótsze niż 8 znaków zwraca błąd 400 (`Hasło musi mieć co najmniej 8 znaków.`).
   - **Algorytm JWT:** Wymuszać jawnie algorytm `HS256` zarówno przy generowaniu (`jwt.sign`), jak i weryfikacji (`jwt.verify({ algorithms: ['HS256'] })`), chroniąc przed podatnościami Algorithm Confusion / `alg: none`.
   - **Weryfikacja tożsamości i roli w bazie (`authenticateToken`):** Po sprawdzeniu podpisu JWT middleware `authenticateToken` każdorazowo odpytuje bazę danych o aktualny rekord użytkownika (`SELECT id, username, role, aktywny FROM uzytkownicy WHERE id = ?`). Jeśli użytkownik nie istnieje lub jest nieaktywny (`aktywny = FALSE`), żądanie jest natychmiast odrzucane z kodem `401 Unauthorized`. Rola użytkownika (`req.user.role`) jest pobierana bezpośrednio z bazy danych, a nie z payloadu tokenu, co uniemożliwia eskalację uprawnień poprzez sfałszowanie roli w tokenie.
3. **Baza danych:** Zawsze stosować zapytania parametryzowane (`?`) w puli `mysql2/promise`. Nie wprowadzać twardo kodowanych poświadczeń do repozytorium.
4. **Rozdział 401 vs 403:**
   - Kod **401 Unauthorized**: zarezerwowany dla problemów z uwierzytelnieniem (brakujący, nieprawidłowy lub wygasły token JWT, błędne hasło, brak użytkownika w bazie lub zablokowane konto w `authenticateToken`). Frontend wylogowuje użytkownika wyłącznie przy 401.
   - Kod **403 Forbidden**: zarezerwowany dla braku uprawnień (rola nie ma dostępu do endpointu, pracownik próbuje modyfikować cudze zlecenie, brak uprawnień do danego przejścia w RBAC, logowanie zablokowanego konta). Frontend nie wylogowuje, lecz wyświetla komunikat z serwera.
5. **Walidacja daty (`data_zakupu`):**
   - Wymaga formatu `RRRR-MM-DD`.
   - Bezwzględna weryfikacja kalendarzowa: sprawdzanie czy po sparsowaniu `year`, `month`, `day` zgadzają się dokładnie z wartościami wejściowymi (eliminuje przelewanie np. 31 lutego na 3 marca).
   - Zakaz dat z przyszłości: data zakupu nie może być późniejsza niż bieżący dzień.