# Auth Testing Playbook — PASTRY QUIN

Note: `/api/auth/register` is intentionally NOT public (admin-only app). Staff accounts are created via `POST /api/auth/staff` with an authenticated owner/admin session. Test credentials live in `/app/memory/test_credentials.md`.

## Step 1: MongoDB Verification
```
mongosh
use test_database
db.users.find({role: "owner"}).pretty()
db.users.findOne({role: "owner"}, {password_hash: 1})
```
Verify: bcrypt hash starts with `$2b$`; indexes exist on users.email (unique), login_attempts.identifier, login_attempts.email, password_reset_tokens.token_hash (unique), password_reset_requests.email, orders.order_number (unique).

## Step 2: API Testing
```
curl -c cookies.txt -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"email":"quinpastry@gmail.com","password":"PastryQuin@2026"}'
cat cookies.txt
curl -b cookies.txt http://localhost:8001/api/auth/me
```
Login returns the user object and sets `access_token` + `refresh_token` cookies. `/me` returns the same user.

## Step 3: Password Reset
Set `FRONTEND_URL="http://localhost:3000"` in `/app/backend/.env` and `sudo supervisorctl restart backend` FIRST so the reset link is written to the backend log (the only way to obtain a test token). Restore the real https origin and restart when done.

1. Create a test staff account (authenticated):
```
curl -b cookies.txt -X POST http://localhost:8001/api/auth/staff -H "Content-Type: application/json" -d '{"email":"resettest@example.org","password":"Reset123!","name":"Reset Test","role":"staff"}'
```
2. Enumeration parity — registered vs unregistered forgot-password calls must return byte-identical generic 200 responses; only the registered one creates a `password_reset_tokens` doc holding a 64-char `token_hash` (raw token never stored).
3. Complete the reset using the link from the backend log: new password logs in, old one fails, reused link fails.
4. Throttle: six forgot-password requests for a fresh address → only first five create token docs; all six responses identical.
5. Lockout clearance: fail login 5 times (15-min lockout), complete reset, log in immediately with new password — must succeed.

## Verifying a real send
Requires the preview app (https FRONTEND_URL + provisioned EMERGENT_EMAIL_KEY). The account must be registered first. Use a real inbox or `delivered@resend.dev` — never the seeded admin address on a reserved domain.
