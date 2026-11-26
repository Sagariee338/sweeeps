# LavishSweeps Django API

Django REST Framework backend with **PostgreSQL only**. The local demo keeps accounts, fake credits, game rounds, and transaction history in PostgreSQL. Its fake-money routes are mounted only when both `DJANGO_DEBUG=1` and `DEMO_MODE=1`.

For a feature-by-feature guide to the code, see [BACKEND_MAP.md](./BACKEND_MAP.md).

## Local startup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
docker-compose up -d postgres
DJANGO_DEBUG=1 DEMO_MODE=1 .venv/bin/python manage.py migrate
DJANGO_DEBUG=1 DEMO_MODE=1 .venv/bin/python manage.py seed_demo
DJANGO_DEBUG=1 DEMO_MODE=1 .venv/bin/python manage.py runserver 127.0.0.1:8001
```

The API is at `http://localhost:8001`; the frontend proxies `/api/v1` from `http://localhost:3000`. `DATABASE_URL` defaults to the development PostgreSQL container shown in `.env.example`. Set a unique `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, and production security settings before deployment. The `.env.example` file is a template; Django does not load it automatically.

Open **`http://localhost:8001/api/docs/`** for the interactive Swagger reference and `http://localhost:8001/api/schema/` for the OpenAPI document. These routes are available only when `DJANGO_DEBUG=1`; the fake-money routes appear only when demo mode is also enabled. The UI assets are served locally by WhiteNoise, so the docs page does not need a CDN. To call session-protected POST routes from a client, first obtain a CSRF cookie from `/api/v1/auth/csrf/`, then send that cookie with the `X-CSRFToken` header. The Swagger page documents requests and responses; it does not bypass session, CSRF, or staff permissions.

For the complete **local demo** in containers, run `docker-compose -f compose.yaml -f compose.demo.yaml up --build -d` from this directory. It exposes Next.js on port 3000, Django on port 8001, and PostgreSQL on port 5432. Redis runs inside the Compose network for shared API throttling and is not exposed on the host. The demo override includes development-only settings and must not be used as a production deployment configuration.

`REDIS_URL` configures Django's shared cache, used by DRF rate limits across API workers. It is required when `DJANGO_DEBUG=0`. Local CLI development without `REDIS_URL` uses an in-process cache. `/ready/` checks both PostgreSQL and the configured cache; a missing dependency returns HTTP 503.

## Core API

| Route | Purpose |
| --- | --- |
| `GET /health/` | Process health. |
| `GET /ready/` | PostgreSQL readiness; returns HTTP 503 when the database is unavailable. |
| `GET /api/v1/auth/csrf/` | Set CSRF cookie before browser POSTs. |
| `POST /api/v1/auth/register/` | Create email/password account; auto-verifies only in local demo mode. |
| `POST /api/v1/auth/login/`, `/logout/` | Session authentication. |
| `GET /api/v1/auth/me/` | Current user and staff flag. |
| `POST /api/v1/auth/profile/`, `/password/` | Update display name or change password after re-entering the current password. |
| `GET/POST /api/v1/auth/play-control/` | Read or start a 1, 7, or 30-day play pause. A pause cannot be shortened. |
| `POST /api/v1/auth/play-control/funding-limit/` | Set a daily fake-funding limit; increases or removal wait 24 hours. |
| `POST /api/v1/auth/verify-email/` | Verify a registered email with the one-time link token. |
| `POST /api/v1/auth/verify-email/resend/` | Resend a verification link without revealing whether an account exists. |
| `POST /api/v1/auth/password-reset/request/`, `/confirm/` | Request a reset email and set a new password with its one-time token. |
| `GET /api/v1/auth/notifications/` | Owner-scoped updates derived from demo orders and support tickets. |
| `GET /api/v1/games/`, `/games/{slug}/` | Catalog from PostgreSQL. |
| `GET /api/v1/platforms/`, `/platforms/{code}/titles/` | Platform availability, verified modes, and launchable titles. |
| `GET /api/v1/me/provider-accounts/` | Owner-scoped provider account states with masked IDs. |
| `POST /api/v1/platforms/{code}/accounts/` | Idempotent free-play provider account setup when explicitly approved. |
| `POST /api/v1/platforms/{code}/titles/{slug}/launch/` | Approved free-play vendor launch; returns a short-lived provider URL. |
| `POST /api/v1/me/provider-accounts/{id}/credentials/` | Owner-only provider username/password reveal after first-party password confirmation; audited and no-store. |
| `POST /api/v1/me/provider-accounts/{id}/sync-balance/` | Owner-only provider balance observation with timestamp; never posts to the operator wallet. |
| `GET /api/v1/ops/provider-accounts/` | Staff-only, masked provider account queue. |
| `POST /api/v1/ops/provider-accounts/{id}/reconcile/` | Superuser query of the same vendor ID after uncertain setup. |
| `GET /api/v1/wallet/`, `/wallet/transactions/` | Account balances and ledger history. |
| `GET /api/v1/ops/overview/` | Staff-only, read-only PostgreSQL summary of demo players and order queues. |
| `GET /api/v1/ops/reconciliation/` | Staff-only, read-only queue of outstanding DollarPay orders and FireKirin transfer intents. |
| `GET/POST /api/v1/support/tickets/` | Player-owned support tickets. |
| `POST /api/v1/ops/tickets/{id}/status/` | Staff-only ticket status change with an audit event. |

Unsafe requests require `X-CSRFToken`; all player routes require a session. Passwords use Django's secure password hashers. The game catalog is seeded with **local demo titles** only by `seed_demo` and is never presented as FireKirin content.

In local development, account emails print in the Django terminal. Production requires a configured SMTP service (`DJANGO_EMAIL_HOST`, `DJANGO_EMAIL_PORT`, `DJANGO_EMAIL_USER`, `DJANGO_EMAIL_PASSWORD`, `DJANGO_EMAIL_USE_TLS`, `DJANGO_FROM_EMAIL`) and a public `FRONTEND_URL`. Verification and reset tokens expire after 24 hours. Demo registration auto-verifies to keep the local test flow quick.

## Fake-money test API

These endpoints are available only with `DEMO_MODE=1` and `DJANGO_DEBUG=1`. Each POST requires an authenticated session and CSRF token. `client_key` is a unique idempotency key per user and operation. Amounts are integer **cents** unless noted otherwise.

| Route | Behavior |
| --- | --- |
| `GET /api/v1/demo/status/` | Confirms `money_is_real: false`, `provider_is_real: false`, and PostgreSQL. |
| `POST /api/v1/demo/payments/` | Fake pay-in with allowed fixed amounts `499`, `999`, `1999`, `4999`, `9999`; methods `cash_app`, `apple_pay`, `google_pay`, `card`; `simulate` can be `succeeded`, `pending`, or `failed`. |
| `GET /api/v1/demo/payments/` | Your fake payment orders. |
| `POST /api/v1/demo/payments/{id}/resolve/` | Resolve pending to success/failure, or refund a successful order when credits are available. |
| `POST /api/v1/demo/transfers/` | Transfer fake whole-dollar credits to/from a game. `direction` is `to_game` or `from_game`; include `game_slug`, `amount_cents`, `client_key`. |
| `GET /api/v1/demo/game-balances/` | Owner-scoped per-game fake balances, including disabled titles with credits that can be transferred back to the wallet. |
| `POST /api/v1/demo/games/{slug}/launch/` | Create local test game session. |
| `GET /api/v1/demo/rounds/` | Latest 50 game rounds owned by the signed-in player, including free rounds. Read-only; never posts to the wallet ledger. |
| `POST /api/v1/demo/games/{slug}/spin/` | Play a server-generated local round with `session_id`, `client_key`, and `stake_cents` of `0` (free), `100`, `200`, or `500`. Fish, arcade, and table games also require `choice`; slots use three reels. |
| `POST /api/v1/demo/redemptions/` | Fake payout with `cash_app`, `paypal`, or `chime`; `simulate` can be `paid`, `pending`, or `failed`. |
| `GET /api/v1/demo/redemptions/` | Your fake redemption requests. |
| `POST /api/v1/demo/redemptions/{id}/resolve/` | Resolve a pending fake redemption to `paid` or `failed`. |

The React frontend exposes these flows through the account, wallet, and test game screens. Play pauses block new fake funding, transfers into games, game launches, and spins while allowing wallet history and redemption. Daily funding limits are enforced on immediate payment success and on pending-order settlement. No real card, payout, or provider call is made from these routes.
All 12 original local titles can now be played with `stake_cents: 0` without funding or a transfer. Free rounds are saved in PostgreSQL, generate no ledger entry or payout, and retain server-generated outcomes. Fish games choose an ocean zone, arcade games choose a vault, table games call red or black, and slot games spin three reels. Optional fake-credit stakes still use the balanced ledger.
Game sessions are scoped to their owner and game, reused while active, and expire after 30 minutes of inactivity. Every round rechecks the play pause and catalog availability; disabling a game stops existing sessions. The frontend starts a new session automatically after expiry without reloading the page.
Fake credits transferred into a game belong to that specific game. The API derives its balance from immutable PostgreSQL ledger entries; a stake or transfer out of another game cannot spend those credits. Game launch, round, and transfer responses include `wallet.game_balance_cents` for the selected title, while `wallet.provider_balance` remains the combined demo game balance.
Exact retries of completed fake payments, transfers, rounds, and redemptions return the existing result even after a play pause or game shutdown. Changed payment and redemption parameters under the same client key are rejected; their request fingerprints are HMAC values, so payout recipient details are not stored in the idempotency record. Transfers out of a disabled demo game remain available.
When demo mode is off, local demo games and fake ledger entries are excluded from the public catalog and wallet responses even if records exist in the database.

## Tests

```bash
DJANGO_DEBUG=1 DEMO_MODE=1 .venv/bin/python manage.py test
DJANGO_DEBUG=1 DEMO_MODE=1 .venv/bin/python manage.py check
```

Tests use PostgreSQL, including a separate temporary test database. There is no SQLite fallback.

## External provider status

### Configure vendor credentials

Copy `.env.example` to `backend/.env` and replace the blank provider fields. The demo Compose API service reads this file on startup; it is ignored by Git. For a local `manage.py` process, export the same variables in its shell. Check which fields are present without printing secrets:

```bash
docker-compose -f compose.yaml -f compose.demo.yaml exec api python manage.py check_provider_config
docker-compose -f compose.yaml -f compose.demo.yaml exec api python manage.py check_provider_config --provider gamevault --strict
docker-compose -f compose.yaml -f compose.demo.yaml exec api python manage.py probe_provider --provider gamevault
```

`probe_provider` makes one read-only vendor request after credentials are installed. Orion and FastAPI require `--account` for an existing sandbox player. A configured environment and a successful probe are separate checks: the first detects missing fields and invalid key or URL formats, while the second confirms the vendor accepted a real request.

On startup, `bootstrap_provider_connections` creates environment-managed FireKirin, Orion, FastAPI, and GameVault free-play connections when their required fields are present. They start disabled. After the vendor confirms an isolated, nonredeemable environment, explicitly set `PROVIDER_FREE_PLAY_ENABLED=1` and that provider's `*_FREE_PLAY_ISOLATED=1`, then restart the API. FireKirin and Orion launches additionally require `*_LAUNCH_APPROVED=1` and an allowlisted HTTPS launch host. The flags represent an operator approval; replacing a secret alone does not prove free-play isolation. Existing connections cannot silently change agent identity once player accounts exist.

FastAPI and GameVault account creation, exact-account recovery, and balance sync now run through the player API for approved connections. FastAPI accepts an app ID/secret from the environment; GameVault accepts its agent ID/secret and base URL. Their transfer methods are server-only because wallet reservation and settlement are not yet connected. Their documents do not specify a game launch API, so credentials alone cannot make their titles playable. GameRoom has an environment-backed client for login, account creation, balance and transfers, but its create response lacks the numeric player ID needed by `getScore`; it remains outside the player account routes pending a vendor lookup contract. Orion uses a separate agent state namespace and its v1.2.6 `queryInfo` web login URL; its catalog must be supplied and approved manually because no catalog endpoint is documented.

The raw vendor documents are not committed because their examples include password-like values and a token. See [`docs/NEW_PROVIDER_API_REVIEW.md`](../docs/NEW_PROVIDER_API_REVIEW.md) for the exact contract gaps.

The additional FireKirin, Orion Stars, FastAPI, GameVault and GameRoom documents are assessed in [`docs/NEW_PROVIDER_API_REVIEW.md`](../docs/NEW_PROVIDER_API_REVIEW.md). No active vendor credentials or isolated free-play contract have been verified in this environment.

The supplied FireKirin and DollarPay documents provide protocol rules and signing examples. Server-only adapters in `integrations/game_clients/firekirin/client.py` and `integrations/dollarpay/client.py` sign requests, validate responses, and have mocked transport tests. DollarPay's adapter covers pay-in creation/query, Cash App/PayPal/Chime payout creation/query, payout cancellation, balance query, and notification signature verification. Game provider keys and player credentials are encrypted at rest using `PROVIDER_CREDENTIAL_KEY` (or the legacy `FIREKIRIN_STATE_KEY` fallback); FireKirin timestamps and rate slots are coordinated in PostgreSQL. Keep the same encryption key across restarts and deployments. The sample DollarPay merchant key is used only by a signature test and a read-only balance probe. Provider account setup and free-play launch endpoints refuse to call a vendor until a superuser has configured and verified the connection, mode, and titles. No real-money provider transfer or payment route is exposed. Production accounts still require configured email delivery and further eligibility controls before activation.

Each provider connection has an `agent_name` and an optional `agent_password_env` pointing to that agent's secret environment variable. If the latter is blank, the connection must match its provider's default agent name and secret pair. This lets separate vendor agents serve separate approved modes without storing their secrets in PostgreSQL. `PROVIDER_CREDENTIAL_KEY` encrypts player credentials; `FIREKIRIN_STATE_KEY` remains a legacy fallback. The `mode_verified` flag must be set only after the vendor confirms a separate, nonredeemable free-play environment and the isolation test passes. All flags default off. Setup generates a unique vendor account name, registers it once, and preserves uncertain results for an operator query of the same name. The legacy `FireKirinAccount` transfer model is separate; an existing legacy account blocks new setup until a reviewed migration is performed.

`PROVIDER_FREE_PLAY_ENABLED=1` is a separate deployment gate for vendor setup, launch, and playable catalog listings. It defaults off, including in the local Compose demo. Set it only after provider credentials, free-play isolation, game rights, and player eligibility controls have been approved and tested. This setting does not enable value-bearing play.

An enabled agent name is unique per provider, so FireKirin's single-balance agent cannot be reused for two modes. Once a player account exists, the connection's provider, environment, mode, adapter, and agent name cannot be edited. Superusers can query an uncertain account through the operations API; each query writes an audit event.

`integrations/dollarpay/notifications.py` journals verified notifications against registered merchant orders with PostgreSQL row locks and deduplication. It checks merchant, signature, order, amount, provider reference, and state transitions; unexpected events enter review. This journal intentionally makes **no ledger posting** and has no public webhook route yet. It is a protocol and audit foundation, not live settlement.

`integrations/game_clients/firekirin/transfers.py` records idempotent transfer intents in PostgreSQL. A sent transfer with an uncertain outcome blocks further transfers for that FireKirin account until evidence-backed resolution. The intent service does not call the provider or move wallet funds; live transfers require reservation, reconciliation, and active sandbox verification before wiring it to player routes.

Once valid FireKirin credentials are configured, `manage.py sync_firekirin_catalog` fetches its game metadata into PostgreSQL. Imported provider and game records stay inactive, so an unverified game cannot appear as playable. The documented example FireKirin credentials have not produced a successful live API response in this environment. A read-only DollarPay balance request using its documented test merchant returned status `90003` (merchant ID disabled) on 2026-11-19; a new active test merchant is required for live integration testing.


### Juwa2 and local free-credit testing

See [JUWA2_INTEGRATION.md](../docs/JUWA2_INTEGRATION.md) for configuration, API routes, simulator startup, idempotent credit testing, and live activation limits. The real Juwa2 agent is configured through ignored server environment variables and has passed a read-only authentication check. Its credits are not confirmed to be test-only. The player-facing add/return test-credit endpoints work only with the explicit PostgreSQL-backed local simulator, never the real agent or money ledger.


### Active non-demo game directory

Use `compose.yaml` plus `compose.app.yaml` for the current development app. This profile disables the demo catalog and simulator connections, seeds only the operator-selected 16 real games, and exposes actual Juwa2 paid/free identity setup and balance sync. These game account categories can share an operator agent while retaining distinct vendor player IDs and passwords. No wallet movement or free-currency approval is inferred. See [REAL_GAME_ACCOUNTS.md](../docs/REAL_GAME_ACCOUNTS.md). `compose.production.yaml` is a separate, undeployed HTTPS template requiring real deployment infrastructure and email configuration.


### DollarPay development payments

The non-demo development app can opt into `DOLLARPAY_DEV_MODE=1` for signed fake checkout/callback/withdrawal testing. This uses separate TST ledger accounts and a network-free gateway; real merchant credentials are never used for order creation. See [DOLLARPAY_DEVELOPMENT.md](../docs/DOLLARPAY_DEVELOPMENT.md). Public production explicitly disables this feature.
