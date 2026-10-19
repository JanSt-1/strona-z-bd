# Kontekst Projektu: System Obsługi Zgłoszeń Serwisowych

Kompleksowy system zgłoszeń serwisowych (SPA + REST API) w technologii **Express.js (v5)**, **MySQL** oraz **React** (modularny frontend w `frontend/` z bundlerem **Vite** i **Tailwind CSS**, kompilowany do katalogu produkcyjnego `frontend/dist/`).

---

## 1. Architektura i Struktura Plików

```
strona_z_bd/
├── .env / .env.example      # Zmienne: PORT, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, JWT_SECRET (.env jest w .gitignore)
├── .github/workflows/ci.yml # CI (GitHub Actions): npm ci + testy
├── README.md                # Instrukcja uruchomienia i opis projektu
├── app.js                   # Instancja Express: middleware, RBAC, walidacja, JWT, routing, pula DB, serwowanie frontend/dist/
├── db.js                    # Centralna konfiguracja połączenia MySQL (DB_PORT, createPool, createConnection)
├── index.js                 # Entrypoint serwera: weryfikacja .env i JWT_SECRET, test DB, app.listen()
├── app.test.js              # Testy integracyjne API (node:test + supertest, 124 testy, mock DB przez app.setPool())
├── schemat.sql              # Schemat MySQL (tabele: uzytkownicy, zgloszenia, historia_zgloszen)
├── seed.js                  # Inicjalizacja bazy i aplikowanie schemat.sql (`npm run seed`)
├── seed-zgloszenia.js       # Generator 200 realistycznych zgłoszeń z historią zdarzeń (`npm run seed:zgloszenia`)
├── create-user.js           # CLI: tworzenie kont z haszowaniem bcrypt (`node create-user.js <user> <pass> [rola]`)
├── frontend/                # Źródła aplikacji SPA (React + Vite + Tailwind CSS v4)
│   ├── src/                 # App.jsx (z ErrorBoundary), main.jsx, components/, pages/, api.js, constants.js, index.css
│   ├── .oxlintrc.json       # Konfiguracja lintera oxlint (`npm --prefix frontend run lint`)
│   ├── index.html           # Punkt wejścia Vite
│   ├── public/              # Statyczne zasoby źródłowe frontendu (logo_mentor4.svg, favicon.svg)
│   ├── dist/                # Katalog dystrybucyjny serwowany przez Express (wynik npm run build)
│   ├── package.json         # Zależności frontendu (React, Tailwind, Vite)
│   └── vite.config.js       # Konfiguracja Vite: proxy do backendu /api, outDir: dist, emptyOutDir: true
└── context.md               # [TEN PLIK] Wytyczne architektoniczne i biznesowe dla deweloperów i agentów AI
```

- **Separation of Concerns:** `app.js` eksportuje aplikację Express i udostępnia `app.setPool(pool)` / `app.getPool()`. `index.js` wyłącznie uruchamia serwer HTTP (`app.listen()`).
- **Nagłówki bezpieczeństwa HTTP:** `app.use(helmet({ contentSecurityPolicy: false }))` zabezpiecza aplikację nagłówkami ochronnymi (m.in. `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`, `Referrer-Policy`). Frontend korzysta z bundlera Vite (brak Babel Standalone w przeglądarce).
- **Parsowanie JSON i limit payloadu:** `app.use(express.json({ limit: '70kb' }))` jawnie ogranicza rozmiar ciała żądania, mieszcząc najdłuższy dopuszczalny opis usterki (65535 znaków) z narzutem struktury JSON, a odrzucając większe żądania kodem 413 Payload Too Large.
- **Moduł bazy danych (`db.js`):** Centralizuje odczyt konfiguracji MySQL z `.env` (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`) i eksportuje pomocniki `createPool()` oraz `createConnection()`, wykorzystywane wspólnie przez `app.js`, `seed.js` i `create-user.js`.
- **Pula połączeń:** `mysql2/promise` z parametryzowanymi zapytaniami (`?`).

---

## 2. Baza Danych MySQL (`schemat.sql`, baza: `serwis_db`)

### Tabela `uzytkownicy`
- `id` (INT PK AI), `username` (VARCHAR(50) UNIQUE NOT NULL), `password_hash` (VARCHAR(255) NOT NULL), `role` (VARCHAR(20) DEFAULT 'pracownik'), `aktywny` (BOOLEAN NOT NULL DEFAULT TRUE), `created_at` (TIMESTAMP).
- **Dozwolone role:** `admin`, `serwisant`, `pracownik`, `magazynier`.
- **Blokowanie kont:** Użytkownicy z `aktywny = FALSE` nie mogą się zalogować (403 Forbidden). Zamiast usuwać powiązane z historią zgłoszeń konta, administrator zarządza flagą aktywności. Administrator nie może zablokować ani odebrać roli samemu sobie.

### Tabela `zgloszenia`
- `id` (INT PK AI), `imie` (VARCHAR(50)), `nazwisko` (VARCHAR(50)), `nazwa_firmy` (VARCHAR(100) NULL), `adres` (TEXT), `kod_pocztowy` (VARCHAR(6)), `miasto` (VARCHAR(100)), `numer_telefonu` (VARCHAR(20)), `telefon_stacjonarny` (VARCHAR(20) NULL), `email` (VARCHAR(100)), `opis_usterki` (TEXT), `numer_fv` (VARCHAR(50)), `nip` (VARCHAR(10)), `przedmiot_zgloszenia` (VARCHAR(100)), `numer_seryjny` (VARCHAR(100) NULL), `data_zakupu` (DATE), `zgoda_rodo_data` (DATETIME NULL), `status` (ENUM('nowe', 'w_realizacji', 'do_wysylki', 'zakończone') DEFAULT 'nowe'), `created_at` (TIMESTAMP).
- **Pola przepływu serwisowego:**
  - `przypisany_pracownik_id` (INT NULL FK do `uzytkownicy.id` ON DELETE SET NULL)
  - `opis_naprawy` (TEXT NULL), `opis_naprawy_data` (DATETIME NULL)
  - `data_wyslania` (DATETIME NULL), `numer_listu` (VARCHAR(100) NULL)
  - `zgoda_rodo_data` (DATETIME NULL - data i godzina potwierdzenia zapoznania się z informacją o przetwarzaniu danych osobowych przy wysyłce formularza)

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
| **`serwisant`** | Wszystkie | Tak (auto: `nowe` → `w_realizacji`) | Może oznaczyć `w_realizacji` → `do_wysylki` (przez `/naprawione` – zatwierdzenie naprawy przez serwisanta automatycznie przypisuje do niego to zlecenie) | — |
| **`pracownik`** | **Tylko przypisane do siebie** | Nie | Może oznaczyć `w_realizacji` → `do_wysylki` (przez `/naprawione` dla własnych zadań) | — |
| **`magazynier`** | **Tylko `do_wysylki` i `zakończone`** | Nie | Wyłącznie `do_wysylki` → `zakończone` (wymagany `numer_listu`) | — |

---

## 4. Specyfikacja API REST

Format odpowiedzi błędów: `{ error: string }`.

| Metoda | Endpoint | Dostęp / Rola | Opis i Walidacja |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/zgloszenia` | Publiczny | Rejestracja zgłoszenia. Ochrona Honeypot (ukryte pole `website` – boty wypełniające pole otrzymują 201, lecz rekord nie jest zapisywany w bazie). Obowiązkowa zgoda RODO (`zgoda_rodo`: boolean/1; zapisuje `zgoda_rodo_data = NOW()`, błąd 400 w przypadku braku akceptacji). Rate limit: 5 zgłoszeń / 1 h z IP (pomijany w `NODE_ENV === 'test'`). Rygorystyczna walidacja: imię/nazwisko (bez cyfr, litery), NIP (10 cyfr), kod (`XX-XXX`), telefon (`+48` + 9 cyfr), opcjonalny telefon stacjonarny (`telefon_stacjonarny` – 9 cyfr stacjonarnych z prefiksem `+48`), przedmiot (z listy dozwolonych), data zakupu (`RRRR-MM-DD`, istniejąca w kalendarzu, nie z przyszłości; w przeciwnym razie 400). Limity długości zgodne z kolumnami (np. `numer_seryjny` max 100). `numer_seryjny` obowiązkowy wyłącznie dla monitorów i tablic interaktywnych (bez akcesoriów). Zwraca 201 `{ message, id }`. |
| `POST` | `/api/login` | Publiczny | Logowanie (`username`, `password`). Rate limit: 10 prób / 15 min z IP (pomijany w `NODE_ENV === 'test'`). Weryfikacja hasła przez bcrypt. Blokada logowania dla kont z `aktywny = FALSE` (403). Zwraca 200 `{ token, user: { id, username, role } }`. |
| `GET` | `/api/pracownicy` | JWT (`admin`, `serwisant`) | Pobiera listę aktywnych pracowników do realizacji naprawy (`pracownik`, `serwisant`; magazynier nie wykonuje naprawy i nie jest przypisywany). |
| `GET` | `/api/zgloszenia` | JWT (dowolna rola) | Lista zgłoszeń z obsługą paginacji, filtrów i wyszukiwania. Parametry query: `?szukaj=` (wyszukiwanie tekstowe LIKE we wszystkich polach, wyłącznie przez placeholdery `?`), `?status=` (filtr statusu), `?pracownik=` (filtr ID pracownika lub `nieprzypisane`), `?strona=` (numer strony, domyślnie 1, limit 25), `?limit=` (wielkość strony, max 100), `?sort=` (`asc` lub `desc` po dacie `created_at`). Zwraca obiekt `{ total, page, limit, totalPages, data, zgloszenia }`. Każdy element zgłoszenia zawiera tablicę `dozwolone_akcje` wyliczoną na backendzie z pojedynczego źródła prawdy (`wyznaczDozwoloneAkcje`, `czyMoznaZmienic`, `PRZEJSCIA`). Reguły ról RBAC (`pracownik` widzi tylko swoje, `magazynier` tylko `do_wysylki` i `zakończone`) są ściśle łączone (`AND`) z filtrami użytkownika. |
| `GET` | `/api/zgloszenia/:id` | JWT (dowolna rola) | Pobranie pełnych szczegółów pojedynczego zgłoszenia wraz z historią zdarzeń (`historia: Array`) oraz tablicą `dozwolone_akcje`. Ochrona RBAC: `pracownik` może podejrzeć tylko własne, `magazynier` tylko `do_wysylki` i `zakończone`, `admin` i `serwisant` dowolne (403 przy braku uprawnień, 404 dla nieistniejącego ID). Zwraca `{ ...ticket, dozwolone_akcje, historia, zgloszenie }`. |
| `PATCH` | `/api/zgloszenia/:id/przypisz` | JWT (`admin`, `serwisant`) | Przypisanie pracownika (`{ pracownik_id }` lub `null`). Zlecenie można przypisać wyłącznie do wykonawców naprawy (`pracownik`, `serwisant`, `admin`). Magazynier nie jest przypisywany do zlecenia – otrzymuje dostęp automatycznie po przejściu zlecenia w status `do_wysylki`. Jeśli status to `nowe` i przypisywany jest pracownik/serwisant, status automatycznie przechodzi na `w_realizacji`. Zwraca aktualne `dozwolone_akcje`. |
| `PATCH` | `/api/zgloszenia/:id/naprawione` | JWT (`pracownik`, `serwisant`, `admin`) | **Jedyna droga do statusu `do_wysylki`**. Zatwierdzenie naprawy (`{ opis_naprawy }`). Ustawia status `do_wysylki` oraz `opis_naprawy_data = NOW()`. Dla pracownika dotyczy wyłącznie przypisanego zadania; dla serwisanta zatwierdzenie naprawy automatycznie przypisuje do niego to zlecenie (`przypisany_pracownik_id = user.id`); administrator może zatwierdzić dowolne zlecenie. Magazynier otrzymuje 403. Zwraca aktualne `dozwolone_akcje`. |
| `PATCH/PUT`| `/api/zgloszenia/:id/status` | JWT (zgodnie z RBAC) | Zmiana statusu wg mapy `PRZEJSCIA` z wyłączeniem `do_wysylki` w przód (blokada 400 – wymagane użycie `/naprawione`). Cofanie statusu dozwolone wyłącznie dla `admin`. **Czyszczenie etapów przy cofaniu:** cofnięcie przed `zakończone` resetuje `data_wyslania` i `numer_listu` na `NULL`; cofnięcie przed `do_wysylki` resetuje `opis_naprawy` i `opis_naprawy_data` na `NULL` oraz przenosi wycofany opis do wpisu historii (`szczegoly`). Walidacja `numer_listu`: max 100 znaków (VARCHAR(100)). Przy `zakończone` magazynier musi podać `numer_listu` (`data_wyslania = NOW()`). Magazynier może zaktualizować `numer_listu` dla zlecenia zakończonego, a **administrator może dodać lub zaktualizować `numer_listu` na dowolnym statusie zlecenia w dowolnym momencie**. Zwraca aktualne `dozwolone_akcje`. |
| `DELETE`| `/api/zgloszenia/:id` | JWT (`admin`) | Usunięcie zgłoszenia z bazy danych. Przed usunięciem w `historia_zgloszen` zapisywany jest wpis o akcji `usunięcie` z informacją o administratorze usuwającym rekord (historia powiązana z `zgloszenie_id` pozostaje trwale w bazie). |
| `GET` | `/api/zgloszenia/:id/historia` | JWT (dowolna rola) | Pobranie chronologicznej historii zmian wybranego zgłoszenia (`id, zgloszenie_id, uzytkownik_id, username, akcja, z_statusu, na_status, szczegoly, created_at`). |
| `GET` | `/api/admin/users` | JWT (`admin`) | Pobranie listy wszystkich kont użytkowników (`id, username, role, aktywny, created_at`) **bez pola `password_hash`!** |
| `POST` | `/api/admin/users` | JWT (`admin`) | Utworzenie nowego użytkownika (`username` max 50 znaków, `password` min. 8 znaków, `role`). Haszowanie bcrypt (salt 10). |
| `PATCH` | `/api/admin/users/:id` | JWT (`admin`) | Zmiana roli użytkownika (`{ role }`). Zabezpieczenie: admin nie może odebrać roli admina samemu sobie (400). |
| `PATCH` | `/api/admin/users/:id/haslo` | JWT (`admin`) | Ustawienie nowego hasła dla użytkownika (`{ password }` min. 8 znaków). Haszowanie bcrypt. |
| `PATCH` | `/api/admin/users/:id/status` | JWT (`admin`) | Zmiana/przełączenie statusu blokady konta (`{ aktywny }` lub toggle). Zabezpieczenie: admin nie może zablokować samego siebie (400). |
| `PATCH` | `/api/profil/haslo` | JWT (każdy zalogowany) | Zmiana własnego hasła użytkownika (`{ currentPassword, newPassword }`). Weryfikuje stare hasło przez bcrypt, nowe hasło min. 8 znaków (400 przy błędzie). |
| `GET` | `/api/health` | Publiczny | Health check serwera i bazy danych: `{ status: 'ok' }` (przy błędzie bazy: 500 `{ status: 'error' }` bez ujawniania `err.message` na zewnątrz; szczegóły błędu trafiają wyłącznie do `console.error`). |

---

## 5. Frontend SPA (`frontend/` -> `frontend/dist/`)

- Nowoczesna modularna architektura **React + Vite** z ostylowaniem w **Tailwind CSS v4** opartym na zmiennych CSS (patrz „System wizualny” poniżej).
- `App.jsx` zawiera `ErrorBoundary` owijający widok główny: błąd renderowania pokazuje komunikat z przyciskami „Odśwież stronę” i „Wyczyść sesję i zresetuj” zamiast białego ekranu.
- **Akcje z jednego źródła (Single Source of Truth):**
  - Backend zwraca przy każdym zgłoszeniu pole `dozwolone_akcje: Array<{ akcja, na_status, etykieta, typ }>` wyliczone przez `wyznaczDozwoloneAkcje` z `czyMoznaZmienic` i `PRZEJSCIA`.
  - Frontend (`StatusControl.jsx` oraz `TicketDetailsDrawer.jsx`) nie duplikuje reguł przejść – renderuje wyłącznie przyciski i opcje cofania obecne w `ticket.dozwolone_akcje`. Panel pracownika/magazyniera/admina nigdy nie proponuje niedozwolonych kroków kończących się 403 lub 409.
- **Struktura katalogu `frontend/src/`:**
  - `components/`:
    - `Header.jsx`: Nagłówek z logo firmy, nawigacją i przełączaniem zakładek (na wąskim ekranie zakładki układają się pod logo, pełna szerokość).
    - `Alert.jsx`: Komponent powiadomień sukcesu i błędów z animacją wejścia.
    - `StatusBadge.jsx`: Pigułka statusu z kolorystyką ze zmiennych `--status-*` (nowe, w realizacji, do wysyłki, zakończone).
    - `StatusControl.jsx`: Kontrolka pojedynczej akcji sterowana w 100% z `ticket.dozwolone_akcje` („Jedna akcja = jeden przycisk w jednym miejscu”):
      - Na etapie `nowe`: przycisk **„Przypisz”** (otwiera `AssignWorkerModal`),
      - Na etapie `w_realizacji`: przycisk **„Oznacz jako naprawione”** (otwiera `RepairModal`),
      - Na etapie `do_wysylki`: przycisk **„Oznacz jako wysłane”** (otwiera `ShipModal`),
      - Na etapie `zakończone`: informacja o zakończeniu (plus edycja numeru listu),
      - Dla administratora na każdym zaawansowanym etapie: osobny przycisk **„Cofnij status”** otwierający modal z potwierdzeniem i ostrzeżeniem.
    - `AssignWorkerModal.jsx`: Modal przypisywania/odpinania pracownika do zgłoszenia.
    - `ShipModal.jsx`: Dedykowany modal wysyłki zamówienia z numerem listu przewozowego (`numer_listu`), walidacją i podsumowaniem adresu.
    - `RollbackStatusModal.jsx`: Dedykowany modal potwierdzenia cofnięcia statusu dla administratora, z wyborem statusu docelowego i ostrzeżeniami o wyczyszczeniu danych (np. numeru listu czy archiwizacji opisu naprawy).
    - `RepairModal.jsx`: Modal raportu naprawy z zatwierdzeniem i automatycznym datowaniem.
    - `TrackingNumberModal.jsx`: Modal wprowadzania/edycji numeru listu przewozowego na zakończonym zleceniu.
    - `ChangeOwnPasswordModal.jsx`: Modal zmiany własnego hasła (min. 8 znaków, weryfikacja dotychczasowego hasła).
    - `AdminPasswordModal.jsx`: Modal resetowania hasła użytkownika przez administratora.
    - `AdminUsersPanel.jsx`: Kompletny panel zarządzania kontami, rolami, blokadami i dodawaniem użytkowników.
    - `TicketDetailsDrawer.jsx`: Wysuwany boczny panel szczegółów zgłoszenia (dane klienta, rozliczenie/NIP/FV, adres, urządzenie i S/N, pełna treść usterki, raport naprawy z datą, sekcja wysyłki, oś czasu zdarzeń z historii audytowej oraz zintegrowane przyciski akcji).
  - `pages/`:
    - `PublicTicketForm.jsx`: Publiczny formularz zgłoszeniowy (Honeypot, 3 sekcje, kalendarz, NIP, warunkowy S/N, RODO) oraz trwały ekran potwierdzenia przyjęcia zgłoszenia („Zgłoszenie nr {id} przyjęte”, sekcja „Co dalej?” ze „skontaktujemy się w ciągu [X] dni roboczych”, podsumowanie zgłoszenia, utrwalenie w `sessionStorage`, akcja złożenia kolejnego zgłoszenia).
    - `LoginForm.jsx`: Karta logowania pracownika z obsługą JWT i błędów.
    - `Dashboard.jsx`: Główny widok pracownika/serwisanta/magazyniera/admina z paskiem wyszukiwania, filtrami (status, pracownik, sortowanie), stronicowaniem oraz pełną synchronizacją stanu z adresem URL (`?status=do_wysylki&strona=2&szukaj=...`). Lista zgłoszeń: na desktopie (`md+`) przejrzysta tabela o 6 kolumnach (nr, klient, produkt/usterka, przypisany pracownik, status i dedykowana akcja etapu, data i przycisk „Usuń” dla admina), na telefonie responsywne karty jedna pod drugą. Puste stany i ładowanie: przy braku wyników nałożonych filtrów/wyszukiwania wyświetla komunikat **„Brak zgłoszeń dla wybranych filtrów”** wraz z przyciskiem **„Wyczyść filtry”**; w stanie ładowania danych renderuje elegancki szkielet (`TableSkeleton` / `CardsSkeleton`) z animacją `animate-pulse` oraz spinnerem `animate-spin` zamiast pustej tabeli lub surowego tekstu. Kompaktowe stronicowanie w pasku nad listą i na dole. Kliknięcie w wiersz lub kartę bezpośrednio otwiera panel boczny `TicketDetailsDrawer` (zastąpiono osobny przycisk „Szczegóły”). Eliminacja przeładowanych list rozwijanych na rzecz przejrzystych przycisków akcji z jednego źródła (`dozwolone_akcje`).
  - `api.js`: Scentralizowany klient API (`apiFetch`, `apiJson`, `apiPost`, `apiPatch`, `ticketApi`, `authApi`, `workerApi`, `userApi`, nasłuchiwacz 401 `onUnauthorized`).
  - `constants.js`: Lista produktów (`PRZEDMIOTY_LISTA`), 49 stref kierunkowych (`NUMERY_KIERUNKOWE`), etykiety statusów (`STATUS_LABELS`), pusty stan formularza (`EMPTY_TICKET_FORM`), zunifikowane wyznaczanie akcji pojedynczego przycisku (`getTicketActionState`), walidatory daty zakupu (`validatePurchaseDate`) i numeru seryjnego (`isSerialNumberAllowed`).
  - `index.css`: Jedyne miejsce definicji kolorów i odstępów (zmienne w `:root`), mapowanie na klasy Tailwinda (`@theme inline`), klasy komponentowe (przyciski, karty, pola, tabela, statusy, modale), bez statycznych inline `style={{}}`.
- **System wizualny (obowiązujące zasady):**
  - **Kolory wyłącznie ze zmiennych** w `:root` (`index.css`): `--bg-page`, `--bg-card` (pełny kolor, bez przezroczystości), `--text-main`, `--text-muted`, `--text-white`, `--primary` (zieleń z logo), `--primary-dark`, `--danger`, `--border`, 4 statusy `--status-nowe|w-realizacji|do-wysylki|zakonczone`. Weryfikacja: `grep -E "#[0-9a-fA-F]{3,6}|rgb" -r frontend/src` ma trafiać tylko w blok `:root`. Tinty i cienie przez `color-mix()` ze zmiennych. W `.jsx` używać klas `text-ink`, `text-muted`, `bg-page`, `bg-card`, `border-line`, `text-danger`, `bg-primary/10` itd. – nie klas palety Tailwinda (`slate-*`, `red-*`…) ani wartości `[#hex]`.
  - **Odstępy** jako zmienne `--space-4/8/16/24/32`.
  - **Przyciski w 3 wariantach:** `.btn-primary` (pełna zieleń), `.btn-secondary` (obramowanie; także „Odśwież”, „Wyloguj”), `.btn-danger` (czerwony).
  - **Dostępność:** kontrast WCAG AA (min. 4,5:1) dla tekstu i przycisków; wąski ekran (375 px) bez przewijania w bok, formularz w jednej kolumnie; przy 1366 px tabela mieści się bez przewijania w bok.
- **Budowanie i assety produkcyjne:** `npm run build` (lub `npm run build:frontend`) kompiluje aplikację Vite do `frontend/dist/` z hashowanymi assetami `assets/index-*.js` i `assets/index-*.css`, spełniając reguły 1-rocznego `Cache-Control: immutable`. Plik `index.html` serwowany jest z nagłówkiem `Cache-Control: no-store`.
- **Ochrona antyspamowa Honeypot:** Ukryte pole formularza `website`. Zwykli użytkownicy go nie widzą ani nie wypełniają. Boty wypełniające pole otrzymują 201 Created, lecz zgłoszenie nie trafia do bazy danych.
- **Klauzula informacyjna RODO i zgoda:** Rozwijana sekcja `<details>`/`<summary>` z klauzulą oraz obowiązkowy checkbox („Zapoznałem/am się z informacją o przetwarzaniu danych osobowych”).
- **Bezpieczeństwo sesji i obsługa błędów:**
  - Token JWT przechowywany w `localStorage` (`serwis_token`).
  - **401 Unauthorized:** wygaśnięcie lub brak sesji. Automatyczne wylogowanie i powrót do ekranu logowania.
  - **403 Forbidden:** brak uprawnień RBAC. Frontend nie wylogowuje, lecz wyświetla komunikat błędu z backendu w alercie.

---

## 6. Uruchomienie i Testy

```bash
npm install                     # Instalacja zależności całego projektu (backend + frontend przez npm workspaces)
npm run build                   # Zbudowanie frontendu Vite do katalogu frontend/dist/
npm run seed                    # Wgranie schematu bazy danych (schemat.sql)
npm run seed:zgloszenia         # Wygenerowanie 200 realistycznych zgłoszeń z historią zdarzeń
node create-user.js admin Haslo123 admin   # Utworzenie pierwszego konta (hasło min. 8 znaków)
npm start                       # Start serwera produkcyjnego (port 3000, serwuje API oraz frontend/dist/)
npm run dev                     # Start serwera backendowego w trybie watch
npm run dev:front               # Start deweloperskiego serwera Vite (port 5173 z proxy do backendu :3000)
npm test                        # Uruchomienie 124 testów integracyjnych (node --test app.test.js)
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