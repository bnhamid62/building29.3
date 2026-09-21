# Building 29 — PHP REST API (AppServ / MySQL)

Backend for the Building 29 residential management PWA. Plain PHP 8, PDO/MySQL,
JWT access tokens + rotating refresh cookie, role-based authorization, audited and
transactional financial operations.

## Install in AppServ (local development)

1. Copy this `backend` folder to `C:\AppServ\www\building29`.
2. In `php.ini` make sure `extension=pdo_mysql` is enabled, and `mod_rewrite` is on in Apache.
3. Copy `config/config.sample.php` to `config/config.php` and set your MySQL root password
   and a long random `jwt_secret`.
4. In phpMyAdmin import, in this order:
   - `sql/schema.sql`
   - `sql/seed_demo.sql`  (demo data only — every row has `is_demo = 1`)
5. Set the demo passwords: `php tools/init_demo.php`
6. Test: open `http://localhost/building29/api/health` — you should get `{"data":{"status":"ok"...}}`.

Demo accounts: manager `manager` / `Manager@2026`, resident `res02` / `Resident@2026`
(every demo account is forced to change its password at first login).

## Point the frontend at it

The frontend calls `http://localhost/building29/api` by default, so no configuration is
needed for a standard AppServ install. To use a different URL, copy `.env.example` to
`.env` in the project root and set `VITE_API_BASE_URL`.

CORS: the API answers only the origins listed in `cors_origins` in `config/config.php`
(no wildcard). The sample file allows `http://localhost:8080` and `http://localhost:5173`
— add the port your frontend actually runs on. Because the browser sends the refresh
cookie, `Access-Control-Allow-Credentials` is on and the origin must match exactly.

There is no demo/mock fallback any more: when the API cannot be reached the app shows a
connection error. The in-browser demo dataset only runs with `VITE_DEMO_MODE=true`.


## Endpoints

| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/login` | public (rate limited) |
| POST | `/auth/refresh`, `/auth/logout` | cookie |
| GET | `/auth/me` | any signed-in user |
| POST | `/auth/change-password` | any signed-in user |
| GET | `/dashboard`, `/settings` | any signed-in user |
| GET | `/apartments`, `/apartments/{id}` | any signed-in user |
| GET/POST/PATCH | `/residents`, `/residents/{id}`, `/residents/{id}/reset-password` | manager |
| GET | `/projects`, `/projects/{id}` | any signed-in user |
| POST/PATCH | `/projects`, `/projects/{id}` | manager |
| GET | `/payments`, `/payments/mine`, `/receipts/{no}` | any signed-in user (receipt limited to own apartment) |
| POST | `/payments`, `/payments/{id}/reverse` | manager |
| GET | `/projects/{id}/contributions` | any signed-in user |
| PATCH | `/projects/{id}/contributions/{apartmentId}` | manager |
| PATCH | `/settings` | manager |
| GET | `/notifications`, `/notifications/unread-count` | any signed-in user (own only) |
| POST | `/notifications`, `/notifications/read-all`, `/notifications/{id}/read` | broadcast = manager, read = owner |
| GET | `/audit-logs` (filters: `entity`, `action`, `actor_id`, `from`, `to`, `limit`) | manager |
| GET | `/files` | any signed-in user (residents see `all_residents` docs only) |
| POST | `/files` (multipart: `file`, `title`, `category`, `visibility`) | manager |
| GET | `/files/{id}/download` | manager, or resident if `all_residents` |
| DELETE | `/files/{id}` | manager |
| GET | `/reports/financial` | manager (all totals computed in SQL) |
| GET | `/health` | public |

Uploads are stored under `backend/storage/uploads` (outside the web root) with random
file names; the MIME type is detected server-side with `finfo` and limited to
JPEG/PNG/WebP/PDF, max 8 MB. Downloads are streamed by id — filesystem paths are never
exposed. Audit entries redact passwords, tokens and idempotency keys.

Success: `{ "data": ..., "meta": {} }` — failure: `{ "error": { "code", "message", "fields" } }`.

Verified locally against MySQL/MariaDB: schema + seed import cleanly, login/refresh, all endpoints
above return 200, duplicate payments return `409 duplicate_payment`, reversals write counter-records,
and resident accounts get `403` on manager routes and on other apartments' receipts.


## Financial safety

- Payments are written inside one transaction; the receipt counter row is locked with
  `SELECT ... FOR UPDATE`, so receipt numbers are unique and sequential.
- Every payment carries a unique `idempotency_key`; a repeated submit returns `409 duplicate_payment`.
- Payments are never deleted — `/payments/{id}/reverse` writes a negative counter-record.
- All totals are SQL aggregates over payment rows; client totals are ignored.
- Create / update / reverse / account actions all write to `audit_logs`.

## Security migration (additive, idempotent, no re-import needed)

The hardening released with the security audit ships as a single additive migration.
It only adds columns, one table and triggers — it never touches your existing rows.
It is **idempotent**: running it more than once by accident changes nothing.

Applying it to an existing AppServ / MySQL installation (Windows, from a command
prompt in the folder that contains `backend`):

```
C:\AppServ\MySQL\bin\mysql.exe -u root -p building29 < backend\sql\migrations\2026_09_08_financial_immutability.sql
C:\AppServ\php8\php.exe backend\tools\verify_security.php
```

Linux/macOS equivalent:

```
mysql -u root -p building29 < backend/sql/migrations/2026_09_08_financial_immutability.sql
php backend/tools/verify_security.php
```

You can also import the `.sql` file through phpMyAdmin (Import tab) — it handles the
`DELIMITER` blocks. Do **not** re-import `schema.sql` or `seed_demo.sql`.

`verify_security.php` checks the structure and then actively tries to tamper with your
real rows (update/delete a payment, a receipt, an audit entry, a locked contribution,
and un-locking a project). Every attempt runs inside a transaction that is always rolled
back, so the script never changes your data; it prints `OK` for each rejection and exits
with code 0 when all protections are active.

What it enforces inside MySQL itself (so no API bug, no manager, and no direct SQL
client can rewrite history):

- `payments` and `receipts` reject every UPDATE and DELETE — corrections must be a reversal row.
- `audit_logs` is append-only.
- `projects.financial_locked_at` freezes a project: once approved, its required amount and
  every apartment contribution can no longer be changed, and the lock itself cannot be removed.
- `users.token_version` invalidates issued access tokens after a password reset or a status change.
- `rate_limits` backs the login/payment throttling (previously file-based).

## Production deployment checklist

- PHP 8.1+ with `pdo_mysql`, MySQL 8, `mod_rewrite`, HTTPS certificate (required).
- Document root points at `backend/public`.
- `config/config.php`: real credentials, long random `jwt_secret`, `debug => false`,
  `secure_cookies => true`, `cors_origins` = your published frontend URL only.
- Keep `storage/uploads` outside the web root and writable.
- Cron for scheduled notifications/reports; daily database backups with a tested restore.
