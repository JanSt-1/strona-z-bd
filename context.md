# Project Context: Service Ticket Management System

Full-stack service ticket management system (SPA + REST API) built with **Express.js (v5)**, **MySQL (`mysql2/promise`)**, and **React 19** (`frontend/` with **Vite** and **Tailwind CSS v4**, compiled to `frontend/dist/`).

---

## 1. Architecture & File Structure

```
strona_z_bd/
├── .env / .env.example      # Env vars: PORT, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, JWT_SECRET (.env in .gitignore)
├── .github/workflows/ci.yml # GitHub Actions CI: npm ci + npm run lint + npm run build + npm test
├── app.js                   # Express app: middleware, RBAC, validation, JWT, routes, DB pool, static serving of frontend/dist/
├── db.js                    # Centralized MySQL config (DB_PORT, createPool, createConnection)
├── index.js                 # Server entrypoint: .env & JWT_SECRET check, DB connection check, app.listen()
├── app.test.js              # Integration tests (node:test + supertest, 127 tests, mocked DB via app.setPool())
├── schemat.sql              # MySQL schema (tables: uzytkownicy, zgloszenia, historia_zgloszen)
├── seed.js                  # DB initialization & schema application (`npm run seed`)
├── config-testowy.js        # Local test setup (in .gitignore): seeds 4 accounts (pass: admin123) + 'nowe' tickets (`npm run config:testowy`)
├── create-user.js           # CLI user creator with bcrypt hashing (`node create-user.js <user> <pass> [role]`)
├── frontend/                # React + Vite + Tailwind CSS v4 SPA
│   ├── src/                 # App.jsx (with ErrorBoundary), main.jsx, components/, pages/, api.js, constants.js, index.css
│   ├── .oxlintrc.json       # oxlint config (`npm run lint`)
│   ├── public/              # Static assets (logo_mentor4.svg, favicon.svg)
│   ├── dist/                # Production build served by Express (`npm run build`)
│   └── vite.config.js       # Vite config: /api proxy to backend, outDir: dist, emptyOutDir: true
└── context.md               # Architectural, security, and business rules for developers and AI agents
```

- **Separation of Concerns:** `app.js` exports the Express instance and exposes `app.setPool(pool)` / `app.getPool()`. `index.js` validates `JWT_SECRET`, tests the DB connection, and starts the HTTP server (`app.listen()`).
- **HTTP Security & Payload Limits:** `helmet` sets security headers (`nosniff`, `SAMEORIGIN`, strict `Content-Security-Policy` with `script-src 'self'`, `object-src 'none'`, and Google Fonts allowlist). `express.json({ limit: '70kb' })` fits the max `opis_usterki` (65,535 chars + JSON overhead) and rejects larger payloads with `413 Payload Too Large`.
- **Database (`db.js`):** Exports `dbConfig`, `createPool()`, and `createConnection()` shared across `app.js`, `seed.js`, `config-testowy.js`, and `create-user.js`. All queries use parameterized `?` placeholders.

---

## 2. MySQL Database Schema (`schemat.sql`, DB: `serwis_db`)

### Table `uzytkownicy`
- Columns: `id` (INT PK AI), `username` (VARCHAR(50) UNIQUE NOT NULL), `password_hash` (VARCHAR(255) NOT NULL), `role` (VARCHAR(20) DEFAULT `'pracownik'`), `aktywny` (BOOLEAN NOT NULL DEFAULT TRUE), `created_at` (TIMESTAMP).
- **Allowed roles (`ALLOWED_ROLES`):** `admin`, `serwisant`, `pracownik`, `magazynier`.
- **Account blocking:** Users with `aktywny = FALSE` cannot log in (`403 Forbidden`) and are rejected in `authenticateToken` (`401 Unauthorized`). Admins toggle `aktywny` instead of deleting accounts linked to ticket history. Admins cannot block or demote themselves (`400`).

### Table `zgloszenia`
- Columns: `id` (INT PK AI), `imie` (VARCHAR(50)), `nazwisko` (VARCHAR(50)), `nazwa_firmy` (VARCHAR(100) NULL), `adres` (TEXT), `kod_pocztowy` (VARCHAR(6)), `miasto` (VARCHAR(100)), `numer_telefonu` (VARCHAR(20)), `telefon_stacjonarny` (VARCHAR(20) NULL), `email` (VARCHAR(100)), `opis_usterki` (TEXT), `numer_fv` (VARCHAR(50)), `nip` (VARCHAR(10)), `przedmiot_zgloszenia` (VARCHAR(100)), `numer_seryjny` (VARCHAR(100) NULL), `data_zakupu` (DATE), `zgoda_rodo_data` (DATETIME NULL), `status` (ENUM(`'nowe'`, `'w_realizacji'`, `'do_wysylki'`, `'zakończone'`) DEFAULT `'nowe'`), `created_at` (TIMESTAMP).
- **Workflow fields:** `przypisany_pracownik_id` (INT NULL FK -> `uzytkownicy.id` ON DELETE SET NULL), `opis_naprawy` (TEXT NULL), `opis_naprawy_data` (DATETIME NULL), `data_wyslania` (DATETIME NULL), `numer_listu` (VARCHAR(100) NULL).

### Table `historia_zgloszen`
- Columns: `id` (INT PK AI), `zgloszenie_id` (INT NOT NULL), `uzytkownik_id` (INT NULL FK -> `uzytkownicy.id` ON DELETE SET NULL), `akcja` (VARCHAR(100) NOT NULL), `z_statusu` (VARCHAR(50) NULL), `na_status` (VARCHAR(50) NULL), `szczegoly` (TEXT NULL), `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Audit persistence:** Records every ticket event (`utworzenie`, `przypisanie`, `naprawa`, `zmiana_statusu`, `zmiana_numeru_listu`, `wysyłka`, `usunięcie`) via `dodajWpisHistorii(...)`.
- **No `ON DELETE CASCADE` on `zgloszenie_id`:** Intentionally omitted so that when an admin deletes a ticket (`DELETE /api/zgloszenia/:id`), its audit trail and the final `usunięcie` entry remain in `historia_zgloszen`.

---

## 3. Role-Based Access Control (RBAC) & Status Lifecycle

### Status Transitions (`PRZEJSCIA` & `czyMoznaZmienic(rola, zStatusu, naStatus)`)
```javascript
const STATUS_ORDER = ['nowe', 'w_realizacji', 'do_wysylki', 'zakończone'];
const PRZEJSCIA = {
    nowe:         { w_realizacji: ['admin', 'serwisant'] },
    w_realizacji: { do_wysylki: ['admin', 'serwisant', 'pracownik'] },
    do_wysylki:   { 'zakończone': ['admin', 'magazynier'] }
};
```
- **409 Conflict:** Invalid lifecycle jump (e.g., `nowe` → `zakończone`) — returns `Nie można zmienić statusu z »${zStatusu}« na »${naStatus}«.`.
- **403 Forbidden:** Valid lifecycle transition or rollback, but the user's role lacks permission.

| Transition | Allowed Roles | Rules & Side Effects |
| :--- | :--- | :--- |
| `nowe` → `w_realizacji` | `admin`, `serwisant` | Triggered automatically when assigning a worker (`PATCH /api/zgloszenia/:id/przypisz`) or via `/status`. |
| `w_realizacji` → `do_wysylki` | Assigned `pracownik`, `serwisant`, `admin` | **Exclusively via `PATCH /api/zgloszenia/:id/naprawione`** (requires `opis_naprawy`, sets `opis_naprawy_data = NOW()`). Blocked (`400`) on `/status`. **`serwisant` cannot describe a ticket assigned to another worker (`403`)**; describing an unassigned ticket auto-assigns it to that `serwisant`. |
| `do_wysylki` → `zakończone` | `magazynier`, `admin` | Marks ticket as shipped (`data_wyslania = NOW()`). `magazynier` must provide `numer_listu`. |
| **Rollback (backward)** | **`admin` only** | Other roles get `403`. Rolling back before `zakończone` clears `data_wyslania` and `numer_listu` to `NULL`; rolling back before `do_wysylki` clears `opis_naprawy` and `opis_naprawy_data` to `NULL` and appends the previous repair description to `historia_zgloszen.szczegoly`. |

### Role Permissions Matrix
| Role | Ticket Visibility (`canViewTicket`) | Assign Worker | Status / Repair Actions | Other Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **`admin`** | All tickets | Yes (`pracownik`, `serwisant`, `admin`) | All forward transitions + **exclusive rollback rights** + edit `numer_listu` on any status | `DELETE /api/zgloszenia/:id`, full user management (`/api/admin/users*`) |
| **`serwisant`** | All tickets | Yes (`pracownik`, `serwisant`; auto `nowe` → `w_realizacji`) | `w_realizacji` → `do_wysylki` via `/naprawione` **only for own or unassigned tickets** (`403` if assigned to someone else) | — |
| **`pracownik`** | **Only assigned to self** | No | `w_realizacji` → `do_wysylki` via `/naprawione` (own tickets only) | — |
| **`magazynier`** | **Only `do_wysylki` & `zakończone`** | No | `do_wysylki` → `zakończone` (requires `numer_listu`) + edit `numer_listu` on `zakończone` | — |

---

## 4. REST API Specification

All errors return `{ error: string }`. Polish error messages are strictly tested in `app.test.js` — do not alter their wording.

| Method | Endpoint | Access / Role | Description & Validation |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/zgloszenia` | Public | Create ticket. Honeypot (`website` field -> returns fake `201` with `id: 0` without DB write). Requires `zgoda_rodo` (`zgoda_rodo_data = NOW()`). Rate limit: 5/1h per IP (skipped in `NODE_ENV === 'test'`). Validates: `imie`/`nazwisko` (letters only, no digits), `nip` (10 digits), `kod_pocztowy` (`XX-XXX`), `numer_telefonu` (`+48` + 9 digits), optional `telefon_stacjonarny` (9 digits, saved with `+48`), `przedmiot_zgloszenia` (from `ALLOWED_PRZEDMIOTY`), `data_zakupu` (`YYYY-MM-DD`, real calendar date, not in future), `numer_seryjny` (required only for interactive monitors/boards, max 100 chars). |
| `POST` | `/api/login` | Public | Login (`username`, `password` verified as strings). Rate limit: 10/15m per IP. Bcrypt check. Blocked accounts (`!isUserActive`) get `403`. Returns `{ message, token, user }`. |
| `GET` | `/api/pracownicy` | JWT (`admin`, `serwisant`) | Active repair staff (`role IN ('pracownik', 'serwisant')`). |
| `GET` | `/api/zgloszenia` | JWT (any role) | Paginated ticket list. Query params: `?szukaj=` (parameterized `LIKE ?` across 14 columns), `?status=`, `?pracownik=` (ID or `nieprzypisane`), `?strona=` (default 1), `?limit=` (default 25, max 100), `?sort=` (`asc`/`desc` on `created_at`). Enforces RBAC visibility (`AND`). Each row includes `dozwolone_akcje` computed by `wyznaczDozwoloneAkcje(req.user, t)`. Returns `{ total, page, limit, totalPages, data, zgloszenia }`. |
| `GET` | `/api/zgloszenia/:id` | JWT (any role) | Ticket details + `historia` + `dozwolone_akcje`. Protected by `canViewTicket(req.user, ticket)` (`404` if missing, `403` if unauthorized). |
| `GET` | `/api/zgloszenia/:id/historia` | JWT (any role) | Chronological audit history for ticket `:id`. Protected by `canViewTicket(req.user, ticket)` (`404` / `403`). |
| `PATCH` | `/api/zgloszenia/:id/przypisz` | JWT (`admin`, `serwisant`) | Assign/unassign worker (`{ pracownik_id }`). Target must be active `pracownik`/`serwisant` (or `admin` if caller is `admin`). Auto-transitions `nowe` → `w_realizacji`. |
| `PATCH` | `/api/zgloszenia/:id/naprawione` | JWT (`pracownik`, `serwisant`, `admin`) | **Only forward path to `do_wysylki`**. Requires non-empty `opis_naprawy` (max 65,535 chars). Blocks `pracownik` on others' tickets (`403`) and `serwisant` on tickets assigned to another worker (`403`). |
| `PATCH/PUT` | `/api/zgloszenia/:id/status` | JWT (RBAC) | Status change per `czyMoznaZmienic` (blocks forward `do_wysylki` with `400`). Handles admin rollbacks (with stage data cleanup) and `numer_listu` updates (max 100 chars). |
| `DELETE` | `/api/zgloszenia/:id` | JWT (`admin`) | Logs `usunięcie` to `historia_zgloszen` and deletes ticket. |
| `GET` | `/api/admin/users` | JWT (`admin`) | Lists users (`id, username, role, aktywny, created_at`) **without `password_hash`**. |
| `POST` | `/api/admin/users` | JWT (`admin`) | Create user (`username` max 50, `password` 8–72 chars after `.trim()`, `role` in `ALLOWED_ROLES`). Bcrypt salt 10. `409` on duplicate username. |
| `PATCH` | `/api/admin/users/:id` | JWT (`admin`) | Change role (`{ role }`). Admin cannot demote self (`400`). |
| `PATCH` | `/api/admin/users/:id/haslo` | JWT (`admin`) | Reset user password (`password`/`haslo` 8–72 chars after `.trim()`). |
| `PATCH` | `/api/admin/users/:id/status` | JWT (`admin`) | Toggle/set `aktywny` via `isUserActive` (alias: `/aktywny`). Admin cannot block self (`400`). |
| `PATCH` | `/api/profil/haslo` | JWT (any role) | Self-service password change (`currentPassword`, `newPassword` 8–72 chars after `.trim()`). Verifies old password via bcrypt. |
| `GET` | `/api/health` | Public | DB health check: `200 { status: 'ok' }` or `500 { status: 'error' }` (never leaks `err.message`). |

---

## 5. Frontend SPA (`frontend/src/`)

- **Single Source of Truth for Actions:** Backend computes `ticket.dozwolone_akcje` via `wyznaczDozwoloneAkcje`. `StatusControl.jsx` (used both in `Dashboard.jsx` and `TicketDetailsDrawer.jsx`) and `constants.js` (`getTicketActionState`) render only buttons present in `dozwolone_akcje`.
- **Key Components (`frontend/src/components/`):**
  - `Modal.jsx`: Shared portal modal base (`createPortal`, `Escape` key, scroll lock, header & error banner).
  - `PasswordModal.jsx`: Unified modal for own password change (`userToEdit = null`) and admin password reset (`userToEdit = user`).
  - `ShipModal.jsx`: Unified modal for shipping (`mode="ship"`) and tracking number editing (`mode="edit"`).
  - `AssignWorkerModal.jsx`, `RepairModal.jsx`, `RollbackStatusModal.jsx`: Stage-specific workflow modals.
  - `StatusControl.jsx`, `StatusBadge.jsx`, `TicketDetailsDrawer.jsx`, `AdminUsersPanel.jsx`, `Header.jsx`, `Alert.jsx`.
- **Pages (`frontend/src/pages/`):** `PublicTicketForm.jsx` (3-step form, honeypot, RODO, `sessionStorage` confirmation view with `← Powrót na stronę główną` button), `LoginForm.jsx`, `Dashboard.jsx` (URL query sync, stable `fetchTickets` via `filtersRef` so searches fire only on form submit / filter change without duplicate requests, desktop table `hidden md:block` + mobile cards `block md:hidden`, skeleton loaders).
- **Strict Visual System & Accessibility (`frontend/src/index.css`):**
  - **Colors exclusively from `:root` CSS variables:** `--bg-page`, `--bg-card`, `--text-main`, `--text-muted`, `--text-white`, `--primary`, `--primary-dark`, `--danger`, `--border`, `--status-nowe|w-realizacji|do-wysylki|zakonczone`.
  - **Zero raw hex/RGB outside `:root`:** `grep -E "#[0-9a-fA-F]{3,6}|rgb" -r frontend/src` must match only `:root` in `index.css`. Use semantic classes (`text-ink`, `text-muted`, `text-primary-dark`, `bg-page`, `bg-card`, `border-line`, `text-danger`, `.btn-primary`, `.btn-secondary`, `.btn-danger`) — never default Tailwind palettes (`slate-*`, `red-*`) or inline `style={{}}`.
  - **WCAG AA, Responsiveness & Linter Cleanliness:** Contrast ratio $\ge 4.5:1$ for all text/badges (use `text-primary-dark` for green text on light backgrounds, `text-muted` without opacity modifiers). No horizontal scroll at `375px` (iPhone SE — both `Dashboard.jsx` and `AdminUsersPanel.jsx` switch to mobile card layouts below `md`) or `1366px` desktop. `npm run lint` (`oxlint`) must report **0 warnings and 0 errors** (no synchronous `setState` in `useEffect`, no ref writes during render).

---

## 6. Commands & Mandatory Security Rules

```bash
npm install                                # Install root + frontend workspace dependencies
npm run build                              # Build Vite SPA into frontend/dist/
npm run lint                               # Run oxlint on frontend/src/
npm test                                   # Run 127 integration tests (node --test app.test.js)
npm run seed && npm run config:testowy     # Initialize schema, 4 test accounts (pass: admin123) & 200 'nowe' tickets
node create-user.js admin Haslo123 admin   # Create admin account (password min 8 chars after .trim())
npm start                                  # Start production server on PORT (default 3000)
```

1. **No Fallback Secrets:** Never add a fallback `JWT_SECRET` in `app.js` (missing `process.env.JWT_SECRET` must immediately `throw new Error(...)`). Random test secrets belong only in `app.test.js` prior to importing `app.js`.
2. **JWT & DB Auth (`authenticateToken`):** Explicitly enforce `algorithms: ['HS256']` in `jwt.sign` and `jwt.verify`. On every request, `authenticateToken` queries `SELECT id, username, role, aktywny FROM uzytkownicy WHERE id = ?` — rejecting inactive/missing users with `401` and taking `req.user.role` strictly from the DB.
3. **401 vs 403 Separation:** `401` = authentication failure (triggers auto-logout on frontend via `onUnauthorized`). `403` = insufficient RBAC permissions or blocked account on login (displays alert without logging out).
4. **Strict Validation & Type Safety:** Keep all regexes, field length checks, calendar date validation (`validatePurchaseDate`), strict integer ID parsing (`parsePositiveInt` requiring `/^\d+$/`), boolean coercion guard (`isUserActive` rejecting `0`/`false`/`'0'`/`'false'`), and password `.trim()` before length checks intact.
