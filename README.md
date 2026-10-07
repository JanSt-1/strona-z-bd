# System Obsługi Zgłoszeń Serwisowych

To pełna aplikacja webowa (SPA) umożliwiająca klientom szybkie rejestrowanie usterek urządzeń poprzez formularz publiczny. Pracownicy serwisu oraz administratorzy mają do dyspozycji chroniony panelem JWT panel zarządzania, w którym mogą monitorować zgłoszenia, modyfikować ich statusy oraz zarządzać bazą danych. Rozwiązanie łączy backend w technologii Express.js i MySQL z nowoczesnym, responsywnym frontendem napisanym w React 18.

---

## Architektura i Separation of Concerns

Aplikacja backendowa jest rozdzielona zgodnie z zasadą separacji odpowiedzialności:
- **`app.js`**: Wyodrębniona instancja aplikacji Express – konfiguracja middleware (CORS, JSON, pliki statyczne), autoryzacji JWT, kontroli dostępu RBAC, rate-limitera oraz tras API. Udostępnia metody `app.setPool()` i `app.getPool()` do zarządzania pulą bazy danych. **Nie wywołuje `app.listen()`**, co pozwala na łatwy import w testach integracyjnych.
- **`index.js`**: Główny punkt wejściowy serwera produkcyjnego. Odpowiada za wczytanie konfiguracji `.env`, weryfikację połączenia z bazą MySQL oraz uruchomienie nasłuchiwania (`app.listen()`).
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
JWT_SECRET=klucz_jwt
```

### Krok 3: Inicjalizacja bazy danych (Seed)
Uruchom skrypt tworzący bazę `serwis_db` oraz tabele na podstawie schematu `schemat.sql`:
```bash
npm run seed
```

### Krok 4: Utworzenie pierwszego konta administratora
Skorzystaj z wbudowanego narzędzia CLI `create-user.js`:
```bash
node create-user.js nazwa_uzytkownika haslo admin
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

Projekt posiada zestaw testów integracyjnych weryfikujących poprawność działania kluczowych endpointów API (walidacja, autoryzacja, mechanizm logowania).

Uruchomienie testów:
```bash
npm test
```
*Skrypt wykonuje polecenie `node --test` z użyciem `supertest`. Dzięki wbudowanemu mockowaniu puli bazy danych w `app.test.js`, testy wykonują się błyskawicznie i nie wymagają aktywnego serwera MySQL.*

Pokryte przypadki testowe:
1. `POST /api/zgloszenia` bez wymaganych pól w body -> **400 Bad Request**.
2. `GET /api/zgloszenia` bez nagłówka Authorization -> **401 Unauthorized**.
3. `GET /api/zgloszenia` z nieprawidłowym tokenem JWT -> **403 Forbidden**.
4. `POST /api/login` z błędnym hasłem -> **401 Unauthorized**.

---

## Jak założyć pierwsze konto administratora

W projekcie dostępny jest skrypt `create-user.js`, który bezpiecznie haszuje hasło za pomocą **bcrypt** i zapisuje konto w tabeli `uzytkownicy`.

### Składnia:
```bash
node create-user.js <nazwa_uzytkownika> <haslo> [rola]
```
- Dostępne role: `admin` lub `pracownik` (domyślnie: `pracownik`).

Po utworzeniu konta przejdź w przeglądarce do zakładki **„Panel pracownika”** i zaloguj się podaną nazwą użytkownika oraz hasłem.