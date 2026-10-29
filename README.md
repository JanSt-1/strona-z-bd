# System Obsługi Zgłoszeń Serwisowych

To pełna aplikacja webowa (SPA) umożliwiająca klientom szybkie rejestrowanie usterek urządzeń poprzez formularz publiczny. Pracownicy serwisu, serwisanci, magazynierzy oraz administratorzy mają do dyspozycji chroniony tokenem JWT panel zarządzania, w którym monitorują zgłoszenia, modyfikują ich statusy, przypisują zadania, sporządzają raporty napraw oraz rejestrują wysyłki paczek z numerem listu przewozowego. Rozwiązanie łączy backend w technologii Express.js i MySQL z nowoczesnym, responsywnym frontendem napisanym w React 19.

---

## Architektura i Separation of Concerns

Aplikacja jest rozdzielona zgodnie z zasadą separacji odpowiedzialności:
- **`app.js`**: Wyodrębniona instancja aplikacji Express – konfiguracja middleware (nagłówki bezpieczeństwa helmet, limit rozmiaru JSON, serwowanie plików statycznych z `frontend/dist/`), autoryzacji JWT, kontroli dostępu RBAC, transakcji bazodanowych i ochrony przed wyścigami (CAS / `409 Conflict`), bezpiecznego logowania bez danych osobowych (`logError`), rate-limitera oraz tras API. Udostępnia metody `app.setPool()` i `app.getPool()` do zarządzania pulą bazy danych. **Nie wywołuje `app.listen()`**, co pozwala na łatwy import w testach integracyjnych.
- **`db.js`**: Centralny moduł konfiguracji bazy danych MySQL uwzględniający `DB_PORT`, `DB_HOST`, `DB_USER`, `DB_PASSWORD` oraz `DB_NAME`. Udostępnia metody `createPool()` oraz `createConnection()`, z których korzystają `app.js`, `migrate.js`, `seed.js` oraz `create-user.js`.
- **`migrate.js` & `migrations/`**: Lekki, bez-ORM system migracji SQL. Skrypt `npm run migrate` aplikuje oczekujące migracje po kolei w transakcjach, zapisując stan w tabeli `schema_migrations`. Zapewnia pełną idempotencję i kompatybilność z MariaDB oraz MySQL 8 (bezpieczne dodawanie kolumn i indeksów).
- **`index.js`**: Główny punkt wejściowy serwera produkcyjnego. Odpowiada za wczytanie konfiguracji `.env`, weryfikację obecności `JWT_SECRET`, test połączenia z bazą MySQL, **sprawdzenie czy wszystkie migracje zostały wykonane** oraz uruchomienie nasłuchiwania HTTP (`app.listen()`).
- **`frontend/`**: Źródła interfejsu użytkownika SPA napisane w React 19 z bundlerem Vite i nowoczesnym stylem Tailwind CSS v4 opartym na zmiennych CSS. Kod został podzielony modularnie na komponenty (`components/`), strony (`pages/`), scentralizowaną warstwę API (`api.js`) oraz stałe biznesowe (`constants.js`). Aplikacja zabezpieczona jest komponentem `ErrorBoundary`. Wynik kompilacji trafia do katalogu `frontend/dist/`.
- **`frontend/dist/`**: Katalog dystrybucyjny serwowany przez Express. Zawiera skompilowany, zoptymalizowany pakiet produkcyjny wygenerowany poleceniem `npm run build` (`index.html`, zhaszowane `assets/index-*.js`, `assets/index-*.css`, `favicon.svg` oraz `logo_mentor4.svg`).
- **`app.test.js`**: Zestaw testów jednostkowych i integracyjnych API oraz reguł RBAC bazujący na runnerze `node:test` i mocku bazy.
- **`integration.test.js`**: Zestaw testów na prawdziwej bazie danych MySQL/MariaDB (pełny cykl życia, polskie znaki utf8mb4, równoległe zapytania, migracja starych schematów, wykorzystanie indeksów).

---

## Wymagania wstępne

Przed uruchomieniem projektu upewnij się, że masz zainstalowane:
- **Node.js** w wersji 20.19+ lub 22.12+ (wymaganie Vite 8; backend z Express 5 działa od Node 18) oraz menedżer pakietów **npm**
- **MySQL** lub **MariaDB** (np. zainstalowany lokalnie serwer MySQL, pakiet XAMPP, Laragon lub kontener Docker)

---

## Uruchomienie krok po kroku

### Krok 1: Instalacja zależności
Dzięki konfiguracji npm workspaces, jedno polecenie w głównym katalogu instaluje zależności zarówno backendu, jak i frontendu:
```bash
npm install
```

### Krok 2: Konfiguracja zmiennych środowiskowych (`.env`)
Utwórz plik `.env` w katalogu głównym (lub skopiuj z przygotowanego szablonu `.env.example`):
```bash
cp .env.example .env
```
Wypełnij plik danymi dostępowymi do lokalnej bazy MySQL oraz własnym kluczem JWT:
```ini
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=serwis_db
DB_PORT=3306
JWT_SECRET=twoj_klucz_jtw
```
`NODE_ENV=production` zapewnia ukrywanie szczegółów technicznych błędów, uniemożliwia wyciek stack trace'a w odpowiedziach HTTP oraz włącza optymalizacje wydajnościowe Express.js.
`HOST` domyślnie przyjmuje `127.0.0.1` (aplikacja nasłuchuje wyłącznie na pętli zwrotnej za Reverse Proxy, chroniąc przed wystawieniem niezaszyfrowanego portu HTTP do sieci). Aby świadomie udostępnić aplikację w sieci lokalnej (np. podczas testów bez proxy), ustaw `HOST=0.0.0.0`.
`JWT_SECRET` jest wymagany (brak domyślnej wartości – serwer się nie uruchomi). Wygeneruj silny klucz:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Krok 3: Inicjalizacja i migracje bazy danych
Uruchom migracje bazy danych, które utworzą bazę (zgodnie z `DB_NAME` w `.env`) oraz zaaplikują wszystkie migracje z katalogu `migrations/` (w tym bezpieczne dodanie kolumn takich jak `telefon_stacjonarny`, indeksu na `historia_zgloszen` oraz rozszerzenie kolumny `szczegoly` w `historia_zgloszen` do `MEDIUMTEXT`):
```bash
npm run migrate
```
*(Alternatywnie polecenie `npm run seed` również wykonuje migracje i przygotowuje tabele na nowe zgłoszenia).*


### Krok 3a: Konfiguracja środowiska testowego (konta + 200 nowych zgłoszeń)
Aby utworzyć 4 konta testowe (`admin`, `pracownik`, `serwisant`, `magazynier` z hasłem `admin123`) oraz wypełnić bazę 200 zgłoszeniami serwisowymi ze statusem `"nowe"`, uruchom skrypt testowy (`config-testowy.js`, tylko do środowiska lokalnego – nie uruchamiaj go na produkcji):
```bash
npm run config:testowy
# lub bezpośrednio:
node config-testowy.js
```
Opcjonalnie:
- `node config-testowy.js 50` – wygenerowanie innej liczby zgłoszeń (np. 50)
- `node config-testowy.js --clean` – wyczyszczenie tabel `zgloszenia` i `historia_zgloszen` przed wygenerowaniem nowych rekordów


### Krok 4: Utworzenie pierwszych kont użytkowników
Skorzystaj z wbudowanego narzędzia CLI `create-user.js`:
```bash
# Konto administratora
node create-user.js nazwa_admina HasloAdmina admin

# Konto serwisanta
node create-user.js nazwa_serwisanta HasloSerwisanta serwisant

# Konto pracownika
node create-user.js nazwa_pracownika HasloPracownika pracownik

# Konto magazyniera
node create-user.js nazwa_magazyniera HasloMagazyniera magazynier
```

### Krok 5: Zbudowanie frontendu i uruchomienie serwera

Najpierw skompiluj aplikację React za pomocą Vite (wygeneruje zoptymalizowane pliki w katalogu `frontend/dist/` serwowanym bezpośrednio przez Express):
```bash
npm run build
```

Następnie uruchom aplikację w trybie produkcyjnym:
```bash
npm start
```
Lub w trybie deweloperskim z automatycznym restartem backendu:
```bash
npm run dev
```

#### Praca nad frontendem (Live HMR)
Jeśli rozwijasz interfejs użytkownika, możesz uruchomić niezależny serwer deweloperski Vite z natychmiastowym odświeżaniem HMR na porcie 5173:
```bash
npm run dev:frontend
```
*Vite posiada skonfigurowany w `vite.config.js` proxy (`server.proxy`), który automatycznie przekierowuje zapytania do `/api` na adres `http://localhost:3000` uruchomionego backendu Express.*

#### Favicon i identyfikacja wizualna
Aplikacja posiada dedykowany favicon (`favicon.svg`) wygenerowany na bazie sygnetu logo Mentor, serwowany bezpośrednio w nagłówku strony i w pasku zakładek przeglądarki.

#### Jakość kodu i linter frontendu
Do weryfikacji i statycznej analizy kodu frontendu skonfigurowany jest linter **oxlint**:
```bash
npm --prefix frontend run lint
```

Po uruchomieniu aplikacja produkcyjna dostępna jest pod adresem:
👉 **http://localhost:3000** (lub dev serwer frontendu pod **http://localhost:5173**)

---

## Aktualizacja wersji

W przypadku wdrażania nowej wersji aplikacji na serwerze produkcyjnym wykonaj następującą procedurę:

```bash
# 1. Pobierz najnowszy kod z repozytorium
git pull

# 2. Zainstaluj nowe lub zaktualizowane zależności w trybie ci
npm ci

# 3. Zbuduj zoptymalizowane pliki produkcyjne frontendu
npm run build

# 4. Zastosuj nowe migracje bazy danych
npm run migrate

# 5. Zrestartuj proces aplikacji (np. pm2, systemd, docker)
pm2 restart serwis-app
```

> [!IMPORTANT]
> Przy starcie serwera (`index.js`) aplikacja automatycznie weryfikuje w tabeli `schema_migrations`, czy wszystkie migracje z katalogu `migrations/` zostały zaaplikowane. W przypadku wykrycia brakujących migracji serwer odmawia uruchomienia i wyświetla czytelny komunikat: `❌ Wykryto niezastosowane migracje bazy danych (...). Uruchom: npm run migrate`.

---

## Testy automatyczne

Projekt posiada dwa zestawy testów:

1. **Testy jednostkowe API i reguł RBAC (szybkie, z mockiem bazy)**:
   ```bash
   npm test
   ```
   Weryfikują wszystkie endpointy REST API, logikę biznesową, autoryzację ról (admin, pracownik, serwisant, magazynier) oraz nagłówki bezpieczeństwa bez konieczności uruchamiania bazy danych. `npm test` (`node --test`) uruchamia wszystkie pliki `*.test.js`, więc również `integration.test.js` – jego testy są pomijane, gdy baza nie jest osiągalna. Same testy z mockiem: `node --test app.test.js`.

2. **Testy integracyjne z prawdziwą bazą danych (MySQL / MariaDB)**:
   ```bash
   # Uruchomienie na dedykowanej bazie testowej (nigdy na produkcyjnej!)
   npm run test:db
   ```
   *Uwaga: Testy integracyjne używają bazy określonej w zmiennej `DB_NAME` (domyślnie `serwis_db_test`). Ze względów bezpieczeństwa skrypt blokuje uruchomienie testów na bazie o nazwie produkcyjnej (`serwis_db`). Testy te są również automatycznie wykonywane w potoku CI (GitHub Actions) z kontenerem MariaDB.*

---

## Interfejs użytkownika (UI/UX) i responsywność

Frontend aplikacji został zaprojektowany z dbałością o estetykę, czytelność oraz responsywność:
- **Trwały ekran potwierdzenia przyjęcia zgłoszenia (`PublicTicketForm`)**:
  - Po pomyślnym przesłaniu formularza przez klienta zamiast znikającego po kilku sekundach alertu pojawia się dedykowany, estetyczny ekran potwierdzenia, który **nie znika samoczynnie**.
  - Zawiera wyróżniony nagłówek **„Zgłoszenie nr {id} przyjęte”** z ikoną sukcesu,
  - Zawiera sekcję **„Co dalej?”** z placeholderem czasu reakcji (**„skontaktujemy się w ciągu [X] dni roboczych”**) oraz czytelnym opisem kolejnych kroków weryfikacji i kontaktu,
  - Prezentuje podsumowanie przesłanych danych (klient, sprzęt, email, telefon, data przyjęcia),
  - Stan potwierdzenia jest zachowywany w `sessionStorage` (zapobiega utracie widoku przy przypadkowym odświeżeniu strony F5),
  - Udostępnia przycisk: **„Powrót na stronę główną”** (czyszczący stan potwierdzenia i przywracający widok główny formularza).
- **Spójny system tokenów i zmiennych CSS**: Wszystkie kolory oraz odstępy zdefiniowane są w bloku `:root` w `frontend/src/index.css` (`--bg-page`, `--bg-card`, `--text-main`, `--text-muted`, `--text-white`, `--primary`, `--danger`, `--border`, 4 statusy). Karty posiadają pełny, nieprzezroczysty kolor tła (`#ffffff`), co eliminuje artefakty graficzne i zapewnia wysoki współczynnik kontrastu tekstu (>4.5:1, a dla głównych elementów >6:1).
- **Trzy ujednolicone warianty przycisków**:
  - `.btn-primary` – pełna zieleń (akcje główne: wysłanie zgłoszenia, zapisanie naprawy, logowanie),
  - `.btn-secondary` – eleganckie obramowanie (akcje pomocnicze, m.in. „Odśwież”, „Wyloguj”, „Wyczyść filtry”, „Zamknij panel”),
  - `.btn-danger` – czerwony (akcje niebezpieczne / usuwanie).
- **Zasada „Jedna akcja = jeden przycisk w jednym miejscu”**:
  - Zamiast przeładowanych list rozwijanych statusów i ciasnych formularzy w komórkach tabeli, interfejs udostępnia dokładnie jeden, intuicyjny przycisk głównej akcji dla danego etapu zlecenia:
    - **„Przypisz”** (etap `nowe`) oraz **„Zmień przypisanie”** (etap `w_realizacji` dla administratora i serwisanta) – otwiera modal przypisania pracownika (`AssignWorkerModal`), a wybór pracownika na zleceniu `nowe` automatycznie zmienia status na `w_realizacji` (na etapie `w_realizacji` pozwala przepiąć zlecenie np. w razie choroby lub blokady konta pracownika),
    - **„Oznacz jako naprawione”** (etap `w_realizacji`) – otwiera modal raportu naprawy (`RepairModal`), w którym wprowadza się opis wykonanych prac (dla serwisanta automatycznie przypisuje zlecenie do niego),
    - **„Oznacz jako wysłane”** (etap `do_wysylki`) – otwiera dedykowany modal wysyłki (`ShipModal`) z polem na numer listu przewozowego i podsumowaniem adresu odbiorcy,
    - **„Cofnij status”** – osobny przycisk dostępny wyłącznie dla administratora na etapach zaawansowanych, otwierający modal potwierdzenia (`RollbackStatusModal`) z wyborem docelowego statusu i czytelnym ostrzeżeniem o wyczyszczeniu danych późniejszych etapów (np. numeru listu czy archiwizacji opisu naprawy).
- **Pasek kontrolny nad listą, filtry i synchronizacja z adresem URL**:
  - Nad tabelą znajduje się kompleksowy pasek sterujący zawierający:
    - **Pole wyszukiwania** (`szukaj`) przeszukujące treść zgłoszeń, z dedykowanym przyciskiem `Szukaj` oraz szybkim czyszczeniem `✕`,
    - **Filtr statusu** (`status` – *Wszystkie statusy*, *Nowe*, *W realizacji*, *Do wysyłki*, *Zakończone*),
    - **Filtr przypisanego pracownika** (`pracownik` – *Wszyscy*, *Nieprzypisane*, lista pracowników z rolami),
    - **Sortowanie po dacie** (`sort` – *od najnowszych* / *od najstarszych*),
    - **Przycisk „Wyczyść filtry”** resetujący wszystkie kryteria wyszukiwania,
    - **Kompaktowe stronicowanie w pasku** (`Strona X z Y` oraz przyciski `«` `»`), umożliwiające natychmiastową nawigację między stronami bez konieczności przewijania na sam dół listy.
  - **Pełna synchronizacja stanu filtrów z adresem URL (Query Params)**:
    - Wszystkie aktywne filtry oraz aktualna strona są na bieżąco utrwalane w adresie URL przeglądarki (np. `?status=do_wysylki&strona=2&szukaj=laptop`).
    - Po odświeżeniu strony (`F5`) lub przesłaniu linku innemu pracownikowi filtry i strona nie znikają i zostają automatycznie załadowane z adresu.
    - Obsługiwana jest również pełna nawigacja historii przeglądarki (przyciski *Wstecz* / *Dalej* przez zdarzenie `popstate`).
- **Tabela desktopowa (`md+`) i podgląd usterki**:
  - Zwięzła tabela o 6 kolumnach (*Nr*, *Klient*, *Produkt / Usterka*, *Przypisany*, *Status*, *Data*).
  - Kolumna *Produkt / Usterka* zawiera 2-linijkowy skrót zgłoszenia (`.ticket-excerpt` z atrybutem `title`), co pozwala natychmiast rozróżnić zlecenia od tego samego klienta przy zachowaniu równej, stabilnej wysokości wierszy.
  - Kolumna *Przypisany* prezentuje czytelny tekst pracownika (lub informację *— Nieprzypisane —*), bez dodatkowych przycisków – zgodnie z zasadą jednej akcji całe sterowanie etapem zlecenia skupione jest w kolumnie *Status*.
  - Cały wiersz tabeli jest klikalny i otwiera panel boczny ze szczegółami (zastąpiono osobny przycisk „Szczegóły”).
  - Tabela bez problemu mieści się na ekranach laptopów (1366 px) bez konieczności przewijania w bok.
- **Karty mobilne (wąskie ekrany / telefon 375 px)**:
  - Na telefonach zamiast poziomej tabeli wyświetlane są estetyczne karty zgłoszeń jedna pod drugą, mieszczące wszystkie kluczowe informacje, skrót usterki oraz pojedyncze przyciski akcji bez przewijania poziomego.
  - Każda karta jest w całości klikalna i wysuwa panel boczny ze szczegółami.
  - Zakładki w nagłówku układają się elastycznie pod logo na pełną szerokość.
- **Wysuwany panel boczny szczegółów zgłoszenia (`TicketDetailsDrawer`)**:
  - Kliknięcie w dowolne zgłoszenie (wiersz na desktopie lub kartę na telefonie) wysuwa estetyczny panel boczny z animacją slajdu.
  - Panel zawiera: pełne dane klienta i rozliczenia (NIP, faktura/paragon, adres wysyłki, telefon komórkowy oraz opcjonalny telefon stacjonarny, email), pełne dane urządzenia i numer seryjny, kompletny opis usterki, sekcję realizacji z raportem prac naprawczych i datą zatwierdzenia, sekcję wysyłki z numerem listu przewozowego (z przyciskiem „✏ Edytuj” widocznym wg `dozwolone_akcje`: admin na etapach `do_wysylki` i `zakończone`, magazynier na `zakończone`) oraz **graficzną pionową oś czasu zdarzeń (historię audytową)** z dedykowanymi ikonami pobieraną z `GET /api/zgloszenia/:id`.
  - Posiada zintegrowany górny pasek akcji z pojedynczym przyciskiem etapu („Przypisz” / „Zmień przypisanie”, „Oznacz jako naprawione”, „Oznacz jako wysłane”, a dla admina „Cofnij status”), co pozwala przeprowadzić operację bezpośrednio podczas analizy szczegółów zlecenia.
- **Puste stany i elegancki szkielet ładowania (Skeletons & Spinners)**:
  - W przypadku braku wyników dla wybranych kryteriów filtrowania lub wyszukiwania, użytkownik widzi estetyczny komunikat **„Brak zgłoszeń dla wybranych filtrów”** wraz z przyciskiem **„Wyczyść filtry”**, który natychmiast przywraca pełną listę.
  - Podczas pobierania danych z serwera (`loading`) tabela oraz karty zastępowane są płynnym szkieletem animowanym (`TableSkeleton` / `CardsSkeleton` z `animate-pulse`) oraz wskaźnikiem ładowania (`animate-spin`), eliminując migotanie i przesunięcia układu (CLS).
- **Opcjonalny telefon stacjonarny (`telefon_stacjonarny`)**:
  - Zarówno w formularzu publicznym, jak i w panelu szczegółów zgłoszenia uwzględniono obsługę telefonu stacjonarnego (z listą 49 polskich stref numeracyjnych).
  - Pole jest w 100% opcjonalne (nie każdy klient posiada telefon stacjonarny), a po podaniu jest ściśle walidowane i zapisywane w formacie E.164 (`+48XXXXXXXXX`).
- **Ochrona przed awariami (`ErrorBoundary`)**:
  - Główny widok aplikacji w `App.jsx` objęty jest komponentem `ErrorBoundary`, który w przypadku nieprzewidzianego błędu w drzewie komponentów wyświetla bezpieczną kartę awaryjną z przyciskami przeładowania i zresetowania sesji zamiast pustego białego ekranu.

---

## Testy integracyjne

Projekt posiada rozbudowany zestaw testów integracyjnych weryfikujących poprawność działania kluczowych endpointów API (walidacja pól, autoryzacja JWT, mechanizm logowania, uprawnienia tras RBAC, blokowanie kont, ochrona ról admina oraz zarządzanie hasłami).

Uruchomienie testów:
```bash
npm test
```
*Skrypt wykonuje polecenie `node --test` z użyciem `supertest`. Dzięki wbudowanemu mockowaniu puli bazy danych w `app.test.js`, testy wykonują się błyskawicznie i nie wymagają aktywnego serwera MySQL (testy z `integration.test.js` są wtedy pomijane).*

Główne grupy przypadków testowych (łącznie **179 testów** w 22 suitach):
1. **Uwierzytelnianie, logowanie, ochrona Honeypot, klauzula RODO i walidacja zgłoszeń**: walidacja pól obowiązkowych, obsługa opcjonalnego telefonu stacjonarnego (`telefon_stacjonarny` – zapis z prefiksem `+48` po podaniu 9 cyfr, dopuszczenie `null` gdy brak, błąd 400 przy niepoprawnym formacie), obowiązkowy checkbox zgody RODO (odrzucenie 400 przy braku lub false, utrwalenie znacznika czasu w `zgoda_rodo_data` przy akceptacji), ochrona antyspamowa Honeypot (wypełnione pole `website` zwraca 201 bez zapisu do bazy), brak tokenu (401), błędne dane logowania (401), poprawny token JWT (200), blokada nieprawidłowych formatów i dat z przyszłości (400).
2. **Przejście `nowe` → `w_realizacji`**: automatyczne przypisanie zlecenia, uprawnienia serwisanta i admina (200), blokada pracownika i magazyniera (403).
3. **Przejście `w_realizacji` → `do_wysylki`**: wyłączność dedykowanego endpointu `/naprawione`, wymóg opisu prac, uprawnienia przypisanego pracownika/serwisanta/admina (200; zatwierdzenie naprawy przez serwisanta automatycznie przypisuje do niego to zlecenie), blokada magazyniera (403) oraz blokada przejścia ze statusu `nowe` (409 Conflict).
4. **Przejście `do_wysylki` → `zakończone`**: uprawnienia magazyniera i admina, wymóg numeru listu przewozowego (`numer_listu`), walidacja długości (max 100 znaków). Edycja numeru listu wyłącznie przez `PATCH /api/zgloszenia/:id/numer-listu`, który nigdy nie zmienia statusu (admin: `do_wysylki` i `zakończone`, magazynier: tylko `zakończone`, pracownik i serwisant: 403); `/status` odrzuca `numer_listu` poza wysyłką (400).
5. **Cofanie statusu (Rollback)**: wyłączne prawo administratora do cofania statusu wstecz (200); blokada dla pozostałych ról (403).
6. **Niedozwolone skoki w przód**: blokowanie pomijania kroków w procesie (409 Conflict) nawet dla administratora.
7. **Uprawnienia do dedykowanych endpointów (RBAC) oraz parametry listy**: `/przypisz`, `/pracownicy`, `DELETE /api/zgloszenia/:id`, filtrowanie listy zgłoszeń zgodnie z rolą oraz obsługa parametrów query (`?szukaj=`, `?status=`, `?pracownik=`, `?strona=`, `?limit=`, `?sort=`) wyłącznie przez placeholdery `?` w SQL wraz ze zwracaniem metadanych paginacji (`total`, `page`, `limit`, `totalPages`).
8. **Jednostkowa weryfikacja funkcji `czyMoznaZmienic`**: precyzyjna kontrola macierzy przejść i kodów błędów 409 vs 403.
9. **Panel administratora – zarządzanie użytkownikami**:
   - `GET /api/admin/users`: lista kont bez pola `password_hash` (403 dla nie-admina, 200 dla admina).
   - `POST /api/admin/users`: tworzenie kont przez admina (wymóg hasła min. 8 znaków, login max 50 znaków).
   - `PATCH /api/admin/users/:id`: zmiana roli (zabezpieczenie: admin nie może odebrać roli admina samemu sobie – 400).
   - `PATCH /api/admin/users/:id/haslo`: ustawienie nowego hasła przez admina (wymóg min. 8 znaków).
   - `PATCH /api/admin/users/:id/status` (oraz `/aktywny`): przełączanie blokady konta (zabezpieczenie: admin nie może zablokować samego siebie – 400).
   - Blokada logowania dla nieaktywnych kont (`aktywny = FALSE` -> 403).
   - `authenticateToken`: pobieranie aktualnej roli z bazy danych (unieważnia spreparowaną rolę w tokenie) oraz odrzucanie nieistniejących lub zablokowanych użytkowników (401).
10. **Zmiana własnego hasła użytkownika (`PATCH /api/profil/haslo`)**:
    - Dostępne dla każdego zalogowanego użytkownika.
    - Wymaga podania dotychczasowego hasła (weryfikacja `bcrypt`) oraz nowego hasła o długości min. 8 znaków.
    - Zwraca 400 przy błędnym haśle lub zbyt krótkim nowym haśle; 200 po udanej zmianie.
11. **Historia zgłoszeń (`historia_zgloszen` i endpoint `GET /api/zgloszenia/:id/historia`)**:
    - Tabela audytowa przechowująca pełną historię zmian (`zgloszenie_id`, `uzytkownik_id`, `akcja`, `z_statusu`, `na_status`, `szczegoly`, `created_at`).
    - Automatyczne wywoływanie funkcji pomocniczej `dodajWpisHistorii` przy każdej akcji: utworzenie zgłoszenia (`utworzenie`), przypisanie pracownika (`przypisanie`), zatwierdzenie naprawy (`naprawa`), wysyłka (`wysyłka`), aktualizacja numeru listu (`zmiana_numeru_listu`), zmiana / cofnięcie statusu (`zmiana_statusu`).
    - Usunięcie zgłoszenia (`DELETE /api/zgloszenia/:id`) trwale zapisuje wpis `usunięcie` z informacją o usuwającym (np. `Wpis usunięty przez admin`), a brak kaskadowego usuwania na kluczu obcym w `historia_zgloszen` gwarantuje zachowanie pełnej historii po usunięciu zgłoszenia.
12. **Szczegóły zgłoszenia (`GET /api/zgloszenia/:id`) oraz czyszczenie etapów przy cofaniu statusu**:
    - Pobieranie pełnych danych zgłoszenia wraz z powiązaną historią audytową. Egzekwowanie uprawnień RBAC (pracownik widzi tylko swoje, magazynier tylko `do_wysylki` i `zakończone`, admin/serwisant wszystkie).
    - Przy cofaniu statusu wstecz (przez administratora) automatyczne czyszczenie danych późniejszych etapów:
      - cofnięcie przed `zakończone` resetuje `data_wyslania = NULL` oraz `numer_listu = NULL`,
      - cofnięcie przed `do_wysylki` resetuje `opis_naprawy = NULL` oraz `opis_naprawy_data = NULL`, a poprzednia treść naprawy jest bezpiecznie utrwalana w historii zdarzeń,
      - cofnięcie do `nowe` resetuje `przypisany_pracownik_id = NULL`, a poprzednio przypisany pracownik jest zapisywany w historii zdarzeń.
13. **Rate limiting (`POST /api/zgloszenia` oraz `POST /api/login`)**:
    - Pomijany w środowisku testowym (`skip: () => process.env.NODE_ENV === 'test'`).
    - Ograniczenie do 5 zgłoszeń na godzinę z jednego IP na `POST /api/zgloszenia` (oraz 10 prób / 15 min na `POST /api/login`).
    - Blokowanie nadmiarowych zapytań z kodem HTTP 429 Too Many Requests i czytelnym komunikatem błędu w języku polskim.
14. **Limit rozmiaru ciała żądania JSON (`express.json limit: 70kb`)**:
    - Jawnie skonfigurowany limit `express.json({ limit: '70kb' })` chroniący przed zbyt dużym payloadem oraz limity znaków dla pól tekstowych (`opis_usterki` i `opis_naprawy` do 5000 znaków, `adres` do 500 znaków), gwarantujące brak przekroczenia 65 535 bajtów kolumny `TEXT` przy wielobajtowych znakach UTF-8 (`utf8mb4`).
    - Zgłoszenie z maksymalnym dozwolonym opisem (5000 znaków) mieści się w limicie i zwraca 201 Created.
    - Żądania przekraczające limit (np. 80KB) zwracają status 413 Payload Too Large z czytelnym komunikatem JSON.
    - Błędnie sformatowane JSON-y zwracają status 400 Bad Request.
15. **Nagłówki bezpieczeństwa HTTP (`helmet`)**:
    - Zabezpieczenie serwera Express za pomocą biblioteki `helmet` z własną polityką `contentSecurityPolicy` (`default-src 'self'`, skrypty wyłącznie z `'self'`, style i fonty dodatkowo z Google Fonts, `object-src 'none'`, `frame-ancestors 'self'`). Frontend kompilowany jest z wyprzedzeniem przez Vite (brak Babel Standalone w przeglądarce).
    - Aktywne nagłówki ochronne: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`, `X-Download-Options: noopen`, `X-Permitted-Cross-Domain-Policies: none`.
16. **Endpoint `/api/health` (bezpieczny health check)**:
    - Weryfikacja działania bazy danych (`SELECT 1`).
    - Sukces zwraca kod HTTP 200 oraz ciało `{ status: "ok" }`.
    - Awaria bazy danych zwraca kod HTTP 500 oraz ciało `{ status: "error" }` bez ujawniania `err.message` i konfiguracji na zewnątrz.
    - Pełne szczegóły błędu logowane są wewnętrznie do `console.error`.
17. **Cache-Control dla plików statycznych (`express.static`)**:
    - `index.html`: nagłówek `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`, `Pragma: no-cache`, `Expires: 0` – wymusza pobieranie zawsze świeżego punktu wejścia SPA przy każdym wejściu użytkownika.
    - Pliki z buildu z hashem w nazwie (np. `bundle.a1b2c3d4.js`, `style-D7x2v_4z.css`): długie cache'owanie `Cache-Control: public, max-age=31536000, immutable` (1 rok), eliminujące ponowne pobieranie niezmienionych assetów produkcyjnych.
    - Pozostałe pliki statyczne bez hasha (np. `logo_mentor4.svg`): standardowe cache'owanie (`public, max-age=86400`) bez flagi `no-store`.
18. **Konfiguracja adresu nasłuchiwania (`HOST`)**:
    - Domyślne bindowanie serwera wyłącznie do `127.0.0.1` (bezpieczne uruchomienie za Reverse Proxy), z możliwością jawnego ustawienia `HOST=0.0.0.0`.
19. **Walidacja bezpieczeństwa sekretu JWT (`JWT_SECRET`)**:
    - Blokada startu serwera w przypadku braku `JWT_SECRET`, użycia wartości szablonowych (`wygeneruj_wlasny`, `twoj_klucz_jtw`) lub klucza krótszego niż 32 znaki.
20. **Bezpieczne logowanie błędów bez danych osobowych (RODO/GDPR)**:
    - Funkcja `logError` loguje wyłącznie `err.code` oraz `err.message`, nigdy nie wypisując `err.sql` ani `err.sqlMessage` zawierających dane osobowe klientów.
21. **Transakcje bazodanowe, ochrona przed wyścigami (CAS / `409 Conflict`), pełna historia (`MEDIUMTEXT`) oraz ścisłe reguły `/przypisz` i `/naprawione`**:
    - Atomowe transakcje (`beginTransaction` -> `commit` / `rollback`) dla każdej zmiany zlecenia i wpisu w `historia_zgloszen` (błąd zapisu historii wycofuje zmianę zlecenia i zwraca `500`).
    - Warunkowe zapytania `UPDATE ... WHERE id = ? AND status = ?` (Compare-And-Swap) zwracające `409 Conflict` przy równoległej modyfikacji zlecenia (np. ochrona przed podwójną wysyłką).
    - Kolumna `historia_zgloszen.szczegoly` (`MEDIUMTEXT`) mieści pełny opis naprawy (limit 5000 znaków w `/naprawione`) wraz z prefiksem oraz dłuższą treść zapisaną wcześniej w `zgloszenia.opis_naprawy` (do 65 000 znaków) przy cofaniu statusu – bez obcinania i bez cichego gubienia wpisów historii.
    - Weryfikacja `canViewTicket` jako pierwszego kroku w `/status`, `/naprawione` i `/przypisz` (brak wycieku statusu cudzych zleceń).
    - Ograniczenie `/naprawione` wyłącznie do statusu `w_realizacji` (`409` na innych statusach) i ról `admin`, `serwisant`, `pracownik` (`403` dla magazyniera) oraz `/przypisz` wyłącznie do statusów `nowe` i `w_realizacji` (`409` na późniejszych etapach).

---

## Role użytkowników i przejścia statusów (Single Source of Truth)

W systemie reguły cyklu życia zgłoszeń znajdują się w jednym miejscu na backendzie (`czyMoznaZmienic` i `PRZEJSCIA`). Przy każdym zgłoszeniu zwracana jest dynamicznie obliczona tablica `dozwolone_akcje` (z uwzględnieniem roli użytkownika, statusu oraz przypisania). Dzięki temu frontend (`StatusControl.jsx` i `TicketDetailsDrawer.jsx`) nie powiela reguł i wyświetla wyłącznie legalne przyciski/akcje, eliminując ryzyko wywołania błędów `403 Forbidden` czy `409 Conflict`:

- **`admin`**: Pełny wgląd we wszystkie zlecenia, przypisywanie zadań aktywnym pracownikom i serwisantom (na etapach `nowe` oraz `w_realizacji`), zmiana i cofanie statusów (w panelu pojawia się wyłącznie lista dozwolonych statusów cofnięcia; cofnięcie do `nowe` czyści przypisanego pracownika), dodawanie/edycja numeru listu przewozowego na etapach `do_wysylki` i `zakończone` (osobny endpoint `/numer-listu`, który nie zmienia statusu), wysyłka paczek, usuwanie zgłoszeń (`DELETE`), zakładka **„Użytkownicy”** do pełnego zarządzania kontami (tworzenie, zmiana roli, zmiana hasła, blokowanie/odblokowywanie kont). Admin może przeprowadzić każdą poprawną operację w cyklu życia zgłoszenia.
- **`serwisant`**: Przegląd wszystkich zleceń i przypisywanie ich aktywnym pracownikom lub serwisantom na etapach `nowe` oraz `w_realizacji` (przypisanie zlecenia o statusie `nowe` automatycznie zmienia status na `w_realizacji`). Może przepiąć zlecenie innego pracownika na innego pracownika/serwisanta (np. podczas L4 lub po zablokowaniu konta), ale nie może przepisać cudzego zlecenia na siebie ani go odpiąć (`403`), co blokuje obejście zakazu opisywania cudzej naprawy przez `/przypisz` + `/naprawione`. Próba przypisania na kolejnych etapach (`do_wysylki`, `zakończone`) zwraca błąd `409 Conflict`. Może oznaczyć jako naprawione (`w_realizacji` -> `do_wysylki`) zlecenie przypisane do siebie lub nieprzypisane.
- **`pracownik`**: Domyślnie widzi wyłącznie zlecenia przypisane do siebie. Gdy zadanie jest w statusie "w realizacji" i jest przypisane do danego pracownika, otrzymuje przycisk "Oznacz jako naprawione" ze sporządzeniem wymaganego opisu prac. Panel nigdy nie wyświetla pracownikowi nielegalnych przycisków startu czy cofania.
- **`magazynier`**: Widzi zlecenia gotowe do wysyłki ("do wysyłki") oraz zakończone. Dla zleceń do wysyłki otrzymuje przycisk „Oznacz jako wysłane” (`ShipModal`), umożliwiający oznaczenie jako wysłane z podaniem numeru listu przewozowego (`numer_listu`). Na zleceniach zakończonych może poprawić numer listu (przycisk „✏ Edytuj” w szczegółach).

Każdy zalogowany użytkownik ma dodatkowo możliwość zmiany swojego hasła w nagłówku panelu po podaniu dotychczasowego hasła.

---

## Jak założyć konto użytkownika

W projekcie dostępny jest skrypt `create-user.js`, który bezpiecznie haszuje hasło za pomocą **bcrypt** i zapisuje konto w tabeli `uzytkownicy`.

### Składnia:
```bash
node create-user.js <nazwa_uzytkownika> <haslo> [rola]
```
- Dostępne role: `admin`, `serwisant`, `pracownik`, `magazynier` (domyślnie: `pracownik`).
- **Wymagania dla hasła**: minimum 8 znaków, maksymalnie 72 bajty (limit bcrypt).
- Przykłady:
  ```bash
  node create-user.js admin HasloAdmina123 admin
  node create-user.js tomasz HasloSerwisanta123 serwisant
  node create-user.js marek HasloPracownika123 pracownik
  node create-user.js janusz HasloMagazyniera123 magazynier
  ```
  
Po utworzeniu konta przejdź w przeglądarce do zakładki **„Panel pracownika”** i zaloguj się podaną nazwą użytkownika oraz hasłem.
Administrator po zalogowaniu może tworzyć kolejne konta bezpośrednio z poziomu interfejsu webowego (zakładka „Użytkownicy”).

---

## Wdrożenie produkcyjne

Niniejsza instrukcja krok po kroku opisuje uruchomienie aplikacji na zewnętrznym serwerze produkcyjnym (VPS / serwer dedykowany z systemem Linux, np. Ubuntu 22.04 / 24.04 LTS lub Debian 12).

```
   [ Użytkownik / Przeglądarka ]
                 │  HTTPS (port 443) / HTTP (port 80)
                 ▼
     ┌───────────────────────┐
     │  Reverse Proxy        │  (Nginx / Caddy + certyfikat Let's Encrypt)
     │  Terminacja SSL/TLS   │
     └───────────┬───────────┘
                 │  HTTP (localhost:3000)
                 ▼
     ┌───────────────────────┐
     │  Aplikacja Node.js    │  (Zarządzana przez PM2 lub usługa systemd)
     │  NODE_ENV=production  │
     └───────────┬───────────┘
                 │  TCP (localhost:3306)
                 ▼
     ┌───────────────────────┐
     │  Baza MySQL / MariaDB │  (Automatyczny backup mysqldump z crona)
     └───────────────────────┘
```

---

### 1. Wymagania serwera

- **System operacyjny:** Linux (zalecany Ubuntu 22.04 LTS / 24.04 LTS lub Debian 12).
- **Zasoby sprzętowe:** min. 1 vCPU, 1–2 GB RAM, dysk SSD (wielkość zależna od liczby zgłoszeń i retencji kopii zapasowych).
- **Środowisko uruchomieniowe:** Node.js (wersja 20 LTS lub 22 LTS) oraz menedżer pakietów `npm`.
- **Baza danych:** MySQL 8.0+ lub MariaDB 10.6+ zainstalowana lokalnie na serwerze.
- **Oprogramowanie pomocnicze:**
  - Menedżer procesów: `pm2` lub wbudowany `systemd`.
  - Serwer WWW / Reverse Proxy: `nginx` lub `caddy`.
  - Narzędzia bazodanowe i systemowe: `mysql-client` (`mysqldump`), `cron`, `gzip`, `git`, `certbot`.
- **Zapora sieciowa (UFW):**
  - Otwarte porty publiczne: `22` (SSH), `80` (HTTP), `443` (HTTPS).
  - Porty `3000` (aplikacja Node.js) oraz `3306` (MySQL) **muszą być zablokowane dla ruchu z zewnątrz** i dostępne wyłącznie z pętli lokalnej (`127.0.0.1`).

Konfiguracja zapory UFW na serwerze:
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

### 2. Przygotowanie środowiska i konfiguracja produkcyjna (`NODE_ENV=production`)

Zaleca się uruchamianie aplikacji z poziomu dedykowanego użytkownika systemowego bez uprawnień roota (np. `serwis`):

```bash
# Utworzenie użytkownika systemowego z katalogiem domowym
sudo adduser --system --group --shell /bin/bash serwis

# Utworzenie katalogu na aplikację i nadanie uprawnień
sudo mkdir -p /var/www/serwis
sudo chown -R serwis:serwis /var/www/serwis
```

Zaloguj się na użytkownika `serwis` i pobierz kod aplikacji:
```bash
sudo -u serwis -i
cd /var/www/serwis
git clone <URL_TWOJEGO_REPOZYTORIUM> .
```

#### Instalacja zależności i zbudowanie frontendu
Na serwerze instalujemy zależności projektu, budujemy produkcyjny pakiet frontendu do `frontend/dist/` i opcjonalnie usuwamy zbędne pakiety deweloperskie:
```bash
npm ci
npm run build
npm prune --omit=dev
```

#### Konfiguracja bazy danych i dedykowanego użytkownika MySQL
Zaloguj się do konsoli MySQL jako root:
```bash
sudo mysql
```
Wykonaj polecenia tworzące bazę oraz użytkownika z ograniczonymi prawami wyłącznie do bazy `serwis_db`:
```sql
CREATE DATABASE IF NOT EXISTS serwis_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'serwis_user'@'localhost' IDENTIFIED BY 'wlasne_haslo';
GRANT ALL PRIVILEGES ON serwis_db.* TO 'serwis_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### Przygotowanie pliku produkcyjnego `.env`
Skopiuj plik wzorcowy:
```bash
cp .env.example .env
chmod 600 .env  # Ochrona pliku przed odczytem przez innych użytkowników systemu
```

Wypełnij plik `/var/www/serwis/.env` wartościami produkcyjnymi:
```ini
NODE_ENV=production
PORT=3000

# Konfiguracja MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=serwis_db
DB_USER=serwis_user
DB_PASSWORD=wlasne_haslo

# Sekret do podpisywania tokenów JWT (wygenerowany losowy ciąg min. 64 znaki)
JWT_SECRET=wygeneruj_wlasny
```

Wygenerowanie bezpiecznego klucza `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

#### Inicjalizacja schematu bazy danych i pierwsze konto administratora
```bash
# Utworzenie bazy i tabel (seed uruchamia migracje z katalogu migrations/)
npm run seed

# Utworzenie głównego konta administratora
node create-user.js nazwa_admina haslo_admina admin
```

---

### 3. Uruchamianie na stałe (Process Manager)

Aby aplikacja działała nieprzerwanie w tle, restartowała się samoczynnie w przypadku awarii oraz uruchamiała automatycznie po restarcie serwera, należy użyć menedżera procesów. Do wyboru są dwie metody: **PM2** lub **usługa systemowa systemd**.

#### Opcja A: PM2

1. Zainstaluj PM2 globalnie:
   ```bash
   sudo npm install -g pm2
   ```

2. Utwórz w katalogu `/var/www/serwis` plik konfiguracyjny `ecosystem.config.cjs`:
   ```javascript
   module.exports = {
     apps: [{
       name: 'serwis-app',
       script: 'index.js',
       cwd: '/var/www/serwis',
       instances: 1,
       autorestart: true,
       watch: false,
       max_memory_restart: '300M',
       env: {
         NODE_ENV: 'production',
         PORT: 3000
       }
     }]
   };
   ```

3. Uruchom aplikację i utrwal listę procesów:
   ```bash
   sudo -u serwis pm2 start /var/www/serwis/ecosystem.config.cjs
   sudo -u serwis pm2 save
   ```

4. Skonfiguruj autostart PM2 przy starcie systemu:
   ```bash
   # Wygeneruj komendę systemd dla użytkownika serwis:
   sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u serwis --hp /home/serwis
   # (wykonaj polecenie, które wypisze PM2)
   ```

5. Przydatne komendy zarządzania:
   ```bash
   sudo -u serwis pm2 status              # Status procesu
   sudo -u serwis pm2 logs serwis-app     # Podgląd logów w czasie rzeczywistym
   sudo -u serwis pm2 restart serwis-app  # Restart aplikacji (np. po aktualizacji kodu)
   sudo -u serwis pm2 reload serwis-app   # Przeładowanie bez przestoju (graceful reload)
   ```

---

#### Opcja B: Usługa systemowa systemd (Alternatywa bez PM2)

Jeśli wolisz natywne mechanizmy Linuksa bez dodatkowych pakietów npm:

1. Utwórz plik jednostki systemowej:
   ```bash
   sudo nano /etc/systemd/system/serwis.service
   ```

2. Wklej następującą definicję:
   ```ini
   [Unit]
   Description=System Obslugi Zgloszen Serwisowych (Express.js)
   After=network.target mysql.service

   [Service]
   Type=simple
   User=serwis
   Group=serwis
   WorkingDirectory=/var/www/serwis
   EnvironmentFile=/var/www/serwis/.env
   ExecStart=/usr/bin/node /var/www/serwis/index.js
   Restart=always
   RestartSec=5
   StandardOutput=journal
   StandardError=journal
   SyslogIdentifier=serwis-app

   # Ograniczenia bezpieczeństwa systemd
   ProtectSystem=full
   NoNewPrivileges=true

   [Install]
   WantedBy=multi-user.target
   ```

3. Przeładuj konfigurację systemd i włącz usługę:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now serwis.service
   ```

4. Zarządzanie usługą:
   ```bash
   sudo systemctl status serwis           # Status usługi
   sudo systemctl restart serwis          # Restart aplikacji
   sudo journalctl -u serwis -f           # Śledzenie logów aplikacji
   ```

---

### 4. HTTPS przez Reverse Proxy (Nginx lub Caddy)

Serwer Node.js nasłuchuje lokalnie na porcie `3000` (`http://127.0.0.1:3000`). Publiczny dostęp do aplikacji oraz szyfrowanie SSL/TLS realizuje Reverse Proxy.

Wybierz **Nginx** (klasyczny standard branżowy) lub **Caddy** (najprostszy, automatyczny certyfikat SSL bez Certbota).

#### Wariant 1: Nginx + Let's Encrypt (Certbot)

1. Zainstaluj Nginx oraz Certbota:
   ```bash
   sudo apt update
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

2. Utwórz plik wirtualnego hosta:
   ```bash
   sudo nano /etc/nginx/sites-available/serwis.conf
   ```

3. Wklej poniższą konfigurację (podmień `twoja-domena.pl` na własną domenę skierowaną na IP Twojego serwera):
   ```nginx
   server {
       listen 80;
       listen [::]:80;
       server_name twoja-domena.pl www.twoja-domena.pl;

       # Zabezpieczenie przed zbyt dużymi żądaniami
       client_max_body_size 5M;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;

           # Przekazywanie nagłówków WebSocket / Upgrade (jeśli wymagane)
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';

           # Przekazanie rzeczywistych danych klienta (niezbędne dla rate-limitera)
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;

           proxy_cache_bypass $http_upgrade;
           proxy_read_timeout 60s;
           proxy_connect_timeout 60s;
       }
   }
   ```

4. Aktywuj konfigurację i sprawdź poprawność składni:
   ```bash
   sudo ln -s /etc/nginx/sites-available/serwis.conf /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

5. Wygeneruj bezpłatny certyfikat SSL za pomocą Certbota:
   ```bash
   sudo certbot --nginx -d twoja-domena.pl -d www.twoja-domena.pl
   ```
   *Certbot automatycznie doda konfigurację SSL w bloku Nginx, przekieruje cały ruch HTTP na HTTPS oraz skonfiguruje timer systemowy do automatycznego odnawiania certyfikatu co 90 dni.*

---

#### Wariant 2: Caddy (Alternatywa z automatycznym HTTPS)

Caddy automatycznie pobiera certyfikat SSL z Let's Encrypt / ZeroSSL i sam dba o jego przedłużanie, bez konieczności instalowania Certbota.

1. Zainstaluj Caddy zgodnie z oficjalną dokumentacją:
   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update
   sudo apt install -y caddy
   ```

2. Zredaguj plik `/etc/caddy/Caddyfile`:
   ```caddy
   twoja-domena.pl {
       reverse_proxy 127.0.0.1:3000 {
           header_up X-Real-IP {remote_host}
           header_up X-Forwarded-For {remote_host}
           header_up X-Forwarded-Proto {scheme}
       }

       encode gzip zstd
   }
   ```

3. Zastosuj zmiany w Caddy:
   ```bash
   sudo systemctl reload caddy
   ```

---

### 5. Kopie zapasowe bazy danych (mysqldump z crona) i procedura przywracania

System serwisowy przechowuje kluczowe dane biznesowe (zgłoszenia, dane klientów, historię audytową). Regularny backup bazy danych chroni przed utratą danych wskutek awarii sprzętowej lub błędów ludzkich.

#### Bezpieczna autoryzacja bez podawania hasła w parametrach CLI
Nigdy nie wpisuj hasła wprost w poleceniach `mysqldump` w cronie (jest ono wtedy widoczne w tablicy procesów `ps aux`). Zamiast tego utwórz bezpieczny plik konfiguracyjny dla użytkownika wykonującego kopię (np. root lub dedykowany użytkownik `backup`):

Utwórz plik `/root/.my.cnf` (lub `~/.my.cnf`):
```ini
[client]
user=serwis_user
password="wlasne_haslo"
host=127.0.0.1
```
Zabezpiecz uprawnienia do pliku:
```bash
chmod 600 /root/.my.cnf
```

#### Skrypt tworzący kopię zapasową z kompresją i retencją
Utwórz skrypt `/opt/scripts/backup-db.sh`:
```bash
sudo mkdir -p /opt/scripts /var/backups/mysql
sudo nano /opt/scripts/backup-db.sh
```

Wklej zawartość skryptu:
```bash
#!/usr/bin/env bash
set -eo pipefail

# Konfiguracja
DB_NAME="serwis_db"
BACKUP_DIR="/var/backups/mysql"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=14 # Liczba dni przechowywania kopii

mkdir -p "${BACKUP_DIR}"

# Wykonanie zrzutu bazy z kompresją gzip
# Opcje:
# --single-transaction : gwarantuje spójność bez blokowania tabel InnoDB
# --quick               : buforowanie wiersz po wierszu (dla dużych tabel)
# --routines --triggers : uwzględnienie procedur i wyzwalaczy
mysqldump --defaults-extra-file=/root/.my.cnf \
          --single-transaction \
          --quick \
          --routines \
          --triggers \
          "${DB_NAME}" | gzip -9 > "${FILENAME}"

# Sprawdzenie czy plik powstał i nie jest pusty
if [ -s "${FILENAME}" ]; then
    echo "[$(date)] Kopia zapasowa bazy ${DB_NAME} wykonana pomyślnie: ${FILENAME} ($(du -h "${FILENAME}" | cut -f1))"
else
    echo "[$(date)] BŁĄD: Kopia zapasowa bazy ${DB_NAME} jest pusta lub nie powiodła się!" >&2
    exit 1
fi

# Rotacja: usunięcie kopii starszych niż RETENTION_DAYS dni
find "${BACKUP_DIR}" -type f -name "${DB_NAME}_*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete
```

Nadaj uprawnienia do wykonywania:
```bash
sudo chmod +x /opt/scripts/backup-db.sh
```

Przetestuj działanie skryptu ręcznie:
```bash
sudo /opt/scripts/backup-db.sh
ls -lh /var/backups/mysql/
```

#### Harmonogramowanie w `cron`
Otwórz tabelę zadań crona administratora:
```bash
sudo crontab -e
```

Dodaj wpis uruchamiający backup codziennie o **02:30 w nocy**:
```cron
# Codzienna kopia zapasowa bazy danych MySQL o 02:30
30 2 * * * /opt/scripts/backup-db.sh >> /var/log/mysql-backup.log 2>&1
```

---

#### Procedura przywracania bazy danych (Disaster Recovery)

W przypadku awarii, uszkodzenia danych lub migracji na nowy serwer wykonaj poniższe kroki, aby odtworzyć bazę z wybranej kopii zapasowej.

1. **Zidentyfikuj plik kopii zapasowej do przywrócenia:**
   ```bash
   ls -lt /var/backups/mysql/
   # Przykładowy plik: /var/backups/mysql/serwis_db_20261014_023000.sql.gz
   ```

2. **Zatrzymaj aplikację na czas przywracania bazy** (aby zapobiec zapisywaniu nowych danych w trakcie importu):
   ```bash
   # Jeśli używasz PM2:
   sudo -u serwis pm2 stop serwis-app

   # Lub jeśli używasz systemd:
   sudo systemctl stop serwis
   ```

3. **(Opcjonalnie) Wykonaj awaryjny zrzut aktualnego stanu przed nadpisaniem:**
   ```bash
   mysqldump --defaults-extra-file=/root/.my.cnf --single-transaction serwis_db | gzip > /var/backups/mysql/serwis_db_przed_przywroceniem.sql.gz
   ```

4. **Odtwórz bazę z pliku skompresowanego `.sql.gz`:**
   ```bash
   BACKUP_FILE="/var/backups/mysql/serwis_db_20261014_023000.sql.gz"

   gunzip < "${BACKUP_FILE}" | mysql --defaults-extra-file=/root/.my.cnf serwis_db
   ```

   *Uwaga:* Jeśli baza `serwis_db` została usunięta lub przywracasz stan na nowo postawionym serwerze, utwórz najpierw pustą bazę:
   ```bash
   mysql --defaults-extra-file=/root/.my.cnf -e "CREATE DATABASE IF NOT EXISTS serwis_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   gunzip < "${BACKUP_FILE}" | mysql --defaults-extra-file=/root/.my.cnf serwis_db
   ```

5. **Zweryfikuj spójność danych po imporcie:**
   ```bash
   mysql --defaults-extra-file=/root/.my.cnf -e "SELECT COUNT(*) AS liczba_uzytkownikow FROM serwis_db.uzytkownicy;"
   mysql --defaults-extra-file=/root/.my.cnf -e "SELECT COUNT(*) AS liczba_zgloszen FROM serwis_db.zgloszenia;"
   mysql --defaults-extra-file=/root/.my.cnf -e "SELECT COUNT(*) AS liczba_historii FROM serwis_db.historia_zgloszen;"
   ```

6. **Uruchom ponownie aplikację i zweryfikuj działanie:**
   ```bash
   # Jeśli używasz PM2:
   sudo -u serwis pm2 start serwis-app

   # Lub jeśli używasz systemd:
   sudo systemctl start serwis
   ```

7. **Sprawdź logi aplikacji i health check:**
   ```bash
   # Test endpointu health check
   curl -I http://127.0.0.1:3000/api/health
   # Oczekiwany wynik: HTTP/1.1 200 OK {"status":"ok"}
   ```

---

### Podsumowanie checklisty wdrożeniowej

- [ ] Zainstalowano Node.js (v20+), MySQL 8+ oraz Nginx/Caddy.
- [ ] Utworzono użytkownika systemowego `serwis` i pobrano aplikację do `/var/www/serwis`.
- [ ] Zainstalowano zależności projektu (`npm ci`) oraz zbudowano zoptymalizowany frontend do `frontend/dist/` (`npm run build`).
- [ ] Utworzono plik `.env` z `NODE_ENV=production` oraz bezpiecznym `JWT_SECRET`.
- [ ] Zainicjalizowano strukturę bazy (`npm run seed`) i utworzono konto administratora (`create-user.js`).
- [ ] Skonfigurowano automatyczny start aplikacji za pomocą PM2 lub systemd.
- [ ] Skonfigurowano Reverse Proxy (Nginx + Certbot lub Caddy) z certyfikatem SSL/HTTPS.
- [ ] Zamknięto w zaporze porty 3000 i 3306 przed dostępem publicznym.
- [ ] Skonfigurowano skrypt backupowy `mysqldump` w harmonogramie `cron` i przetestowano procedurę odzyskiwania danych.