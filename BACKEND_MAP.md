# Backend code map

The Django project is organized by business feature. Start at `config/urls.py` to see which app owns a route, then open that app's `urls.py` to find its view. Views validate requests and return responses; service modules perform business operations; models define persisted state.

Local API reference: `http://localhost:8001/api/docs/` (Swagger) and `/api/schema/` (OpenAPI). Explicit response shapes for dictionary-based API views are in `config/api_schemas.py`.

| Feature | App | Main locations |
| --- | --- | --- |
| Registration, sessions, profile, email recovery | `identity` | `views/auth.py`, `views/account.py`, `email_flows.py`, `serializers.py` |
| Play pauses and funding limits | `identity` | `views/controls.py`, `services.py`, `models.py` |
| Account notifications | `identity` | `views/notifications.py` |
| Game catalog | `catalog` | `views.py`, `models.py`, `management/commands/` |
| Provider connections, player IDs, and launch sessions | `provider_accounts` | `models.py`, `services.py`, `views.py`, `admin.py` |
| Ledger and wallet history | `wallet` | `services.py`, `views.py`, `models.py` |
| Local fake-money game and payment flows | `demo` | `views/`, `services/`, `serializers.py`, `models.py` |
| Game vendor clients and shared gateway | `integrations` | `game_clients/`, `models/game.py` |
| DollarPay payment gateway | `integrations` | `dollarpay/`, `models/payment.py` |
| Staff reporting and ticket actions | `ops` | `views.py` |
| Player support tickets | `support` | `views.py`, `models.py` |

## Local demo internals

`demo/views/` has one file each for status, wallet/transfers, payments, games, and redemptions. These are HTTP adapters. `demo/services/` uses the same feature split:

- `common.py`: shared account locking, play/funding checks, and request fingerprints.
- `wallets.py`: ledger-derived wallet and per-game balances.
- `payments.py`: fake pay-in creation and status transitions.
- `games.py`: transfers, sessions, rounds, and game outcomes.
- `redemptions.py`: fake payout creation and status transitions.

Money-moving services use PostgreSQL transactions and the balanced ledger in `wallet/services.py`. Demo routes are mounted only when both `DJANGO_DEBUG=1` and `DEMO_MODE=1`. Provider adapters are separate and are not connected to these fake-money routes.

The demo API tests mirror these features in `demo/tests/`: `test_games.py`, `test_wallets.py`, `test_payments.py`, and the complete flow in `test_flows.py`. Their shared PostgreSQL fixture is in `tests/base.py`.

## Vendor integrations

`integrations/game_clients/` contains one package per game vendor: `firekirin/`, `orion/`, `fastapi/`, `gamevault/`, `juwa2/`, and `gameroom/`. Keep each vendor's signing, HTTP format, response parsing, and undocumented capability limits in its package. `common/` contains shared HTTPS and amount validation, credential encryption, and a base error type. `gateway.py` maps documented vendor operations to account creation, lookup, balance, credential display, and launch; it does not own user authorization or database state transitions.

`provider_accounts/services.py` owns player checks, durable provisioning states, uncertain-outcome handling, and balance snapshots. `provider_accounts/views.py` owns HTTP permissions and response shaping. `integrations/dollarpay/` stays separate because it is a payment gateway, with its own signing, transport, and notification journal.

Integration models are split between `integrations/models/game.py` and `integrations/models/payment.py`; `integrations.models` remains the stable import path. The inactive FireKirin catalog import command is `integrations/management/commands/sync_firekirin_catalog.py`. Vendor contract tests remain in `integrations/tests/`. Game clients are not connected to player-facing real-money routes.

`provider_accounts/` adds the normalized connection, per-player account, and launch-session records. Its free-play FireKirin setup and launch routes require an enabled, mode-verified connection and approved active titles. The existing `integrations.FireKirinAccount` transfer-intent model is legacy and is not silently migrated or mixed with the new player accounts. Value-bearing provider play and provider money movement remain disabled.

Superusers manage platform and title visibility in Django admin under `catalog`, and provider connections under `provider_accounts`. Player accounts and launch sessions are read-only there. The deployment setting `PROVIDER_FREE_PLAY_ENABLED` is an additional activation gate. The opt-in Juwa2 local simulator uses it alongside DEBUG, DEMO_MODE and JUWA2_MOCK; real Juwa2 free-play isolation remains disabled.

## Change guide

1. Find the route in `config/urls.py` and the feature app's `urls.py`.
2. Change request validation in the app's serializer, HTTP behavior in its view, and business rules in its service.
3. Add a migration for model changes. Keep provider secrets and server calls in `integrations/game_clients/` or `integrations/dollarpay/`, never in React.
4. Run `DJANGO_DEBUG=1 DEMO_MODE=1 .venv/bin/python manage.py test` and `manage.py check` from `backend/`.

See [README.md](./README.md) for startup commands and API routes.

Juwa2 uses seconds and lowercase MD5 signing. Its local transport simulator is in `integrations/game_clients/juwa2/mock.py`, with persistent PostgreSQL mock accounts and orders. `provider_accounts/free_credits.py` owns mock-only credit intents, duplicate prevention, allowance limits, and evidence-based reconciliation. These records never post to the wallet ledger. See [the Juwa2 integration guide](../docs/JUWA2_INTEGRATION.md) for current capabilities and limits.


The current non-demo profile uses `catalog/platforms.py` for the selected real game set and `integrations/juwa2_configuration.py` for paid/free player identity connections. `ProviderPlayerAccount.identity_scope` plus the database uniqueness constraint prevents aliasing the same vendor ID across modes. Paired setup and owner-scoped bulk balance reads are in `provider_accounts/views.py`. Account provisioning, currency isolation, launch, and money movement have separate gates; two player accounts can share an operator agent without sharing identity or asserting different currencies. See [the current account guide](../docs/REAL_GAME_ACCOUNTS.md).

DollarPay development orders live in `integrations/models/development_payments.py`; their signed simulator, lifecycle and settlement service is `integrations/dollarpay/development.py`. HTTP boundaries live in `dev_views.py` and `dev_urls.py`. These records and TST ledger accounts never settle live merchant orders or appear in USD wallet history.
