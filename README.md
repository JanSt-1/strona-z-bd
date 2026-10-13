# System Obsługi Zgłoszeń Serwisowych

To pełna aplikacja webowa (SPA) umożliwiająca klientom szybkie rejestrowanie usterek urządzeń poprzez formularz publiczny. Pracownicy serwisu, serwisanci, magazynierzy oraz administratorzy mają do dyspozycji chroniony tokenem JWT panel zarządzania, w którym monitorują zgłoszenia, modyfikują ich statusy, przypisują zadania, sporządzają raporty napraw oraz rejestrują wysyłki paczek z numerem listu przewozowego. Rozwiązanie łączy backend w technologii Express.js i MySQL z nowoczesnym, responsywnym frontendem napisanym w React 18.

---

## Architektura i Separation of Concerns

Aplikacja backendowa jest rozdzielona zgodnie z zasadą separacji odpowiedzialności:
- **`app.js`**: Wyodrębniona instancja aplikacji Express – konfiguracja middleware (CORS, JSON, pliki statyczne), autoryzacji JWT, kontroli dostępu RBAC, rate-limitera oraz tras API. Udostępnia metody `app.setPool()` i `app.getPool()` do zarządzania pulą bazy danych. **Nie wywołuje `app.listen()`**, co pozwala na łatwy import w testach integracyjnych.
- **`db.js`**: Centralny moduł konfiguracji bazy danych MySQL uwzględniający `DB_PORT`, `DB_HOST`, `DB_USER`, `DB_PASSWORD` oraz `DB_NAME`. Udostępnia metody `createPool()` oraz `createConnection()`, z których korzystają `app.js`, `seed.js` oraz `create-user.js`.
- **`index.js`**: Główny punkt wejściowy serwera produkcyjnego. Odpowiada za wczytanie konfiguracji `.env`, weryfikację obecności `JWT_SECRET`, test połączenia z bazą MySQL oraz uruchomienie nasłuchiwania HTTP (`app.listen()`).
- **`app.test.js`**: Zestaw testów integracyjnych API bazujący na natywnym runnerze `node:test` oraz bibliotece `supertest`.

---

## Wymagania wstępne

Przed uruchomieniem projektu upewnij się, że masz zainstalowane:
- **Node.js** (wersja 18 lub nowsza, zalecana 20+ z obsługą `node:test`) oraz menedżer pakietów **npm**
- **MySQL** lub **MariaDB** (np. zainstalowany lokalnie serwer MySQL, pakiet XAMPP, Laragon lub kontener Docker)

---

## Uruchomienie krok po kroku

### Krok 1: Instalacja zależności
W głównym katalogu projektu zainstaluj niezbędne biblioteki:
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
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=serwis_db
DB_PORT=3306
JWT_SECRET=twoj_klucz_jtw
```
`JWT_SECRET` jest wymagany (brak domyślnej wartości – serwer się nie uruchomi). Wygeneruj silny klucz:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Krok 3: Inicjalizacja bazy danych (Seed)
Uruchom skrypt tworzący bazę `serwis_db` oraz tabele na podstawie schematu `schemat.sql`:
```bash
npm run seed
```
*(Skrypt ten aplikuje pełną strukturę tabel `uzytkownicy` i `zgloszenia` z pliku `schemat.sql`, w tym pola `numer_listu`, `data_wyslania`, `opis_naprawy` itp.).*

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

### Krok 5: Uruchomienie serwera
Uruchom aplikację w trybie produkcyjnym:
```bash
npm start
```
Lub w trybie deweloperskim z automatycznym restartem po zmianach w kodzie:
```bash
npm run dev
```

Po uruchomieniu aplikacja dostępna jest pod adresem:
👉 **http://localhost:3000**

---

## Testy integracyjne

Projekt posiada rozbudowany zestaw testów integracyjnych weryfikujących poprawność działania kluczowych endpointów API (walidacja pól, autoryzacja JWT, mechanizm logowania, uprawnienia tras RBAC, blokowanie kont, ochrona ról admina oraz zarządzanie hasłami).

Uruchomienie testów:
```bash
npm test
```
*Skrypt wykonuje polecenie `node --test` z użyciem `supertest`. Dzięki wbudowanemu mockowaniu puli bazy danych w `app.test.js`, testy wykonują się błyskawicznie i nie wymagają aktywnego serwera MySQL.*

Główne grupy przypadków testowych (łącznie **72 testy** w 11 suitach):
1. **Uwierzytelnianie, logowanie i walidacja zgłoszeń**: walidacja pól obowiązkowych, brak tokenu (401), błędne dane logowania (401), poprawny token JWT (200), blokada nieprawidłowych formatów i dat z przyszłości (400).
2. **Przejście `nowe` → `w_realizacji`**: automatyczne przypisanie zlecenia, uprawnienia serwisanta i admina (200), blokada pracownika i magazyniera (403).
3. **Przejście `w_realizacji` → `do_wysylki`**: wyłączność dedykowanego endpointu `/naprawione`, wymóg opisu prac, uprawnienia przypisanego pracownika/serwisanta/admina (200), blokada magazyniera (403) oraz blokada przejścia ze statusu `nowe` (409 Conflict).
4. **Przejście `do_wysylki` → `zakończone`**: uprawnienia magazyniera i admina, wymóg numeru listu przewozowego (`numer_listu`), walidacja długości (max 100 znaków), możliwość aktualizacji numeru listu na zakończonym zleceniu.
5. **Cofanie statusu (Rollback)**: wyłączne prawo administratora do cofania statusu wstecz (200); blokada dla pozostałych ról (403).
6. **Niedozwolone skoki w przód**: blokowanie pomijania kroków w procesie (409 Conflict) nawet dla administratora.
7. **Uprawnienia do dedykowanych endpointów (RBAC)**: `/przypisz`, `/pracownicy`, `DELETE /api/zgloszenia/:id`, filtrowanie listy zgłoszeń zgodnie z rolą.
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

---

## Role użytkowników i przejścia statusów

W systemie zaimplementowano role oraz ścisłą mapę przejść statusów (`PRZEJSCIA`):
- **`admin`**: Pełny wgląd we wszystkie zlecenia, przypisywanie zadań, zmiana statusów, wyłączne uprawnienie do cofania statusów wstecz, usuwanie zgłoszeń (`DELETE`), zakładka **„Użytkownicy”** do pełnego zarządzania kontami (tworzenie, zmiana roli, zmiana hasła, blokowanie/odblokowywanie kont).
- **`serwisant`**: Przegląd wszystkich zleceń i przypisywanie ich pracownikom (przypisanie zlecenia o statusie "nowe" automatycznie zmienia status na "w realizacji"). Może również oznaczyć zlecenie jako naprawione ("w realizacji" -> "do wysyłki") z opisem naprawy.
- **`pracownik`**: Domyślnie widzi wyłącznie zlecenia przypisane do siebie. Może oznaczyć zlecenie jako naprawione ("w realizacji" -> "do wysyłki") ze sporządzeniem wymaganego opisu prac.
- **`magazynier`**: Widzi zlecenia gotowe do wysyłki ("do wysyłki") oraz zakończone. Może oznaczyć zlecenie jako wysłane ("do wysyłki" -> "zakończone") podając numer listu przewozowego (`numer_listu`).

Każdy zalogowany użytkownik ma dodatkowo możliwość zmiany swojego hasła w nagłówku panelu po podaniu dotychczasowego hasła.

---

## Jak założyć konto użytkownika

W projekcie dostępny jest skrypt `create-user.js`, który bezpiecznie haszuje hasło za pomocą **bcrypt** i zapisuje konto w tabeli `uzytkownicy`.

### Składnia:
```bash
node create-user.js <nazwa_uzytkownika> <haslo> [rola]
```
- Dostępne role: `admin`, `serwisant`, `pracownik`, `magazynier` (domyślnie: `pracownik`).
- **Wymagania dla hasła**: minimum 8 znaków (hasła krótsze zostaną odrzucone).
- Przykłady:
  ```bash
  node create-user.js admin HasloAdmina123 admin
  node create-user.js tomasz HasloSerwisanta123 serwisant
  node create-user.js marek HasloPracownika123 pracownik
  node create-user.js janusz HasloMagazyniera123 magazynier
  ```
  
Po utworzeniu konta przejdź w przeglądarce do zakładki **„Panel pracownika”** i zaloguj się podaną nazwą użytkownika oraz hasłem.
Administrator po zalogowaniu może tworzyć kolejne konta bezpośrednio z poziomu interfejsu webowego (zakładka „Użytkownicy”).