# Microsoft Rewards Script Control API

A small, dependency-free HTTP API that lets a dashboard or another local tool
control and observe the Microsoft Rewards Script.

The API can:

- start, stop, restart, and remotely shut down the bot process;
- run every configured account, one specific account, or all accounts except a
  selected set;
- expose live process status and point totals;
- stream structured logs over Server-Sent Events (SSE);
- return recent errors, in-memory run history, configured account summaries,
  and diagnostic captures;
- read `config.json` and, when explicitly enabled, validate and update it.

It uses only Node.js built-ins and follows the same ESM `.js` convention as the
other scripts in the project.

## Architecture and persistence

The API is designed as a stateless middleman between the bot and a dashboard.
It launches the normal bot command as a child process and parses its output.

```text
bot repository                               dashboard or other client
┌───────────────────────────────┐            ┌────────────────────────┐
│ node scripts/api/server.js    │            │ HTTP client             │
│   ├─ starts/stops the bot     │ ◀──HTTP──▶ │ CONTROL_API_URL         │
│   ├─ parses logs and points   │   + token  │ CONTROL_API_TOKEN       │
│   └─ keeps short-lived state  │            │ persistent dashboard DB │
└───────────────────────────────┘            └────────────────────────┘
```

The following data exists only in memory and is reset whenever the API process
restarts:

- buffered logs;
- live run state;
- parsed errors;
- completed run history;
- account statistics calculated from that history.

The API does not create its own database or data directory. The only supported
write operation is updating `config.json`, and that is disabled by default. When
config writing is enabled, the previous file is copied to `config.json.bak` on a
best-effort basis before the replacement is written.

Scheduling intentionally belongs to the dashboard or another external scheduler.
A scheduler can persist its own schedule and call `POST /start` when a run is due;
the control API itself does not create or store schedule files.

## Requirements

- Node.js 24 or newer;
- a built bot, normally with `dist/index.js` available;
- the API files located under `scripts/api/` in the bot repository.

The implementation is platform-independent. Process-tree termination uses
`taskkill` on Windows and process-group signals on Linux and macOS.

## Quick start

Build the bot once, then start the API:

```bash
npm run build
npm run api
```

The equivalent direct command is:

```bash
node scripts/api/server.js
```

The default address is:

```text
http://127.0.0.1:3010
```

Test it locally:

```bash
curl --request GET \
  --url http://127.0.0.1:3010/health
```

A successful response looks like:

```json
{
    "ok": true,
    "name": "microsoft-rewards-script",
    "version": "4.0.0",
    "state": "idle",
    "uptimeSec": 12,
    "authRequired": false
}
```

The exact package name and version are read from the repository's
`package.json`.

## Recommended `.env` setup

The API automatically loads the first available `.env` from the current working
directory, repository root, or `dist/` directory.

For local dashboard use:

```dotenv
API_HOST=127.0.0.1
API_PORT=3010
API_TOKEN=replace-with-a-long-random-token
API_CORS_ORIGIN=http://127.0.0.1:3000
```

Generate a strong token:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Give the dashboard the same value, normally as:

```dotenv
CONTROL_API_URL=http://127.0.0.1:3010
CONTROL_API_TOKEN=replace-with-the-same-token
```

## Authentication

When `API_TOKEN` is unset, every endpoint is open. This is acceptable only when
the API is bound to a trusted loopback interface.

When `API_TOKEN` is set, **every endpoint** requires the token, including `/`,
`/health`, diagnostic files, and the SSE stream.

The token can be supplied in one of three ways.

### Bearer token

```bash
curl --request GET \
  --url http://127.0.0.1:3010/status \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

### API key header

```bash
curl --request GET \
  --url http://127.0.0.1:3010/status \
  --header 'X-API-Key: YOUR_API_TOKEN'
```

### Query parameter

```text
http://127.0.0.1:3010/events?token=<API_TOKEN>
```

The query form is primarily intended for browser `EventSource`, which cannot
set custom authorization headers. Prefer a header for normal HTTP requests,
because URLs can be stored in browser history and proxy logs.

An invalid or missing token returns:

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
```

```json
{
    "error": "Unauthorized",
    "hint": "Provide the API token via Authorization: Bearer, X-API-Key, or ?token= ..."
}
```

## HTTP conventions

- The base URL is `http://<API_HOST>:<API_PORT>`.
- Request and response bodies are JSON unless the endpoint returns SSE or a
  diagnostic file.
- JSON requests should include `Content-Type: application/json`.
- An omitted or empty JSON body is treated as `{}`.
- The maximum accepted request body is 1,000,000 bytes.
- Unknown routes return `404` with a JSON error.
- CORS is enabled according to `API_CORS_ORIGIN`.
- `OPTIONS` preflight requests return `204 No Content`.

All examples below use these placeholders:

- `http://127.0.0.1:3010` is the API base URL;
- `YOUR_API_TOKEN` is the value configured as `API_TOKEN`.

The cURL examples are deliberately self-contained, similar to public API
reference documentation, so any individual request can be copied without first
defining shell variables.

## Axios setup

Install Axios in the dashboard or other client project:

```bash
npm install axios
```

Create one reusable client:

```js
import axios from 'axios'

export const api = axios.create({
    baseURL: 'http://127.0.0.1:3010',
    headers: {
        Authorization: 'Bearer YOUR_API_TOKEN'
    },
    timeout: 30_000
})
```

The Axios examples below assume this client is imported:

```js
import { api } from './apiClient.js'
```

Axios is required only by the consuming dashboard or client. The control API
server itself remains dependency-free.

## Endpoint overview

### Read endpoints

| Method | Path                            | Purpose                                                          |
| ------ | ------------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/`                             | API name, version, authentication state, and endpoint index.     |
| `GET`  | `/health`                       | Lightweight liveness and process-state check.                    |
| `GET`  | `/status`                       | Complete process and parsed run state.                           |
| `GET`  | `/points`                       | Simplified live point totals for dashboard polling.              |
| `GET`  | `/logs`                         | Buffered structured logs.                                        |
| `GET`  | `/errors`                       | Recent warning/error logs and per-account failures.              |
| `GET`  | `/history`                      | Completed runs retained by this API process.                     |
| `GET`  | `/accounts`                     | Safe summaries of configured accounts and recent run statistics. |
| `GET`  | `/diagnostics`                  | List available error-capture directories.                        |
| `GET`  | `/diagnostics/<capture>/<file>` | Download or view one diagnostic artifact.                        |
| `GET`  | `/config`                       | Read `config.json`, redacted by default.                         |
| `GET`  | `/events`                       | SSE stream containing live logs and status updates.              |

### Control and write endpoints

| Method  | Path        | Purpose                                               |
| ------- | ----------- | ----------------------------------------------------- |
| `POST`  | `/start`    | Start a bot run.                                      |
| `POST`  | `/stop`     | Request graceful or forced process termination.       |
| `POST`  | `/restart`  | Stop an active run, then start a new one.             |
| `POST`  | `/shutdown` | Stop the bot if needed and terminate the API process. |
| `PUT`   | `/config`   | Replace the complete config after validation.         |
| `PATCH` | `/config`   | Deep-merge a partial config after validation.         |

## Reading API state

### `GET /`

Returns a machine-readable endpoint index:

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/ \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/')
console.log(data)
```

```json
{
    "name": "microsoft-rewards-script",
    "version": "4.0.0",
    "message": "Control API",
    "authRequired": true,
    "stateless": true,
    "endpoints": ["GET /health", "GET /status", "GET /points", "POST /start"]
}
```

The actual `endpoints` array contains every supported route.

### `GET /health`

Use this for a simple liveness check. It does not include account or point
details.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/health \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/health')
console.log(data)
```

Important fields:

- `ok`: always `true` when the API can answer;
- `state`: `idle`, `starting`, `running`, or `stopping`;
- `uptimeSec`: API process uptime, not bot-run duration;
- `authRequired`: whether `API_TOKEN` is configured.

### `GET /status`

Returns the full controller and parsed run state:

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/status \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/status')
console.log(data)
```

Representative response:

```jsonc
{
    "name": "microsoft-rewards-script",
    "version": "4.0.0",
    "state": "running",
    "pid": 18420,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "command": "node /app/dist/index.js",
    "lastExit": null,
    "logCount": 418,
    "logBufferSize": 2000,
    "latestLogId": 418,
    "run": {
        "version": "4.0.0",
        "clusters": 1,
        "accountsTotal": 2,
        "accountsSeen": 1,
        "collected": 155,
        "totals": null,
        "finished": false,
        "live": {
            "currentAccount": "user@example.com",
            "currentBalance": 12480,
            "gained": 155,
            "updatedAt": "7/14/2026, 11:31:04 AM"
        },
        "accounts": [
            {
                "email": "user@example.com",
                "geoLocale": "NL",
                "initialPoints": 12325,
                "collectedPoints": null,
                "finalPoints": null,
                "earnable": { "mobile": 60, "browser": 90, "app": 30 },
                "searchSummary": { "mobile": 60, "desktop": 90, "bonus": 0, "total": 150 },
                "streakProtection": {
                    "enabled": true,
                    "remainingDays": 1,
                    "streakCounter": 9,
                    "updatedAt": "7/14/2026, 11:30:44 AM"
                },
                "durationSeconds": null,
                "success": null,
                "error": null,
                "live": {
                    "balance": 12480,
                    "gained": 155,
                    "bySource": { "search": 150, "checkIn": 5 },
                    "lastUpdateTs": "7/14/2026, 11:31:04 AM"
                }
            }
        ]
    }
}
```

While idle, `pid` and `startedAt` are `null`. `lastExit` contains information
about the most recently finished child process.

### `GET /points`

This is the preferred polling endpoint for a live points widget. It presents a
smaller, point-focused view than `/status`.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/points \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/points')
console.log(data)
```

```jsonc
{
    "state": "running",
    "running": true,
    "live": true,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "currentAccount": "user@example.com",
    "balance": 12480,
    "collected": 155,
    "updatedAt": "7/14/2026, 11:31:04 AM",
    "finished": false,
    "totals": null,
    "accountsTotal": 2,
    "accountsSeen": 1,
    "accounts": [
        {
            "email": "user@example.com",
            "collected": 155,
            "balance": 12480,
            "initialPoints": 12325,
            "bySource": { "search": 150, "checkIn": 5 },
            "earnable": { "mobile": 60, "browser": 90, "app": 30 },
            "streakProtection": {
                "enabled": true,
                "remainingDays": 1,
                "streakCounter": 9,
                "updatedAt": "7/14/2026, 11:30:44 AM"
            },
            "done": false,
            "success": null,
            "error": null
        }
    ],
    "lastExit": null
}
```

The API updates point totals from stable machine-facing log fields such as
`pointsGained`, `currentBalance`, and `previousBalance`. When an account emits
its final `ACCOUNT-END` line, the live estimate is replaced by the bot's final
authoritative numbers.

### `GET /logs`

Returns structured logs from the in-memory ring buffer.

Query parameters:

| Parameter | Default | Behavior                                                                           |
| --------- | ------: | ---------------------------------------------------------------------------------- |
| `limit`   |   `200` | Number of most recent entries to return. Clamped between `1` and `API_LOG_BUFFER`. |
| `afterId` |   unset | Return entries whose numeric `id` is greater than this value. Useful for polling.  |
| `level`   |   unset | Minimum severity: `debug`, `info`, `warn`, or `error`.                             |

Examples:

**cURL — last 50 entries**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/logs?limit=50' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios — last 50 entries**

```js
const { data } = await api.get('/logs', {
    params: { limit: 50 }
})
console.log(data.logs)
```

Other useful Axios queries:

```js
// Warning and error entries only
const warnings = await api.get('/logs', {
    params: { level: 'warn', limit: 100 }
})

// Entries created after log ID 418
const newerLogs = await api.get('/logs', {
    params: { afterId: 418 }
})
```

Response:

```jsonc
{
    "logs": [
        {
            "id": 419,
            "receivedAt": "2026-07-14T09:31:05.000Z",
            "ts": "7/14/2026, 11:31:05 AM",
            "level": "info",
            "user": "user",
            "platform": "DESKTOP",
            "title": "SEARCH-BING",
            "message": "pointsGained=3 | currentBalance=12483",
            "source": "stdout",
            "parsed": true,
            "raw": "[7/14/2026, 11:31:05 AM] [...]"
        }
    ],
    "latestLogId": 419,
    "count": 1
}
```

When `afterId` is supplied, the API returns all newer entries still available in
the ring buffer instead of applying the normal tail behavior.

### `GET /errors`

Returns warning/error log entries and the current run's account failures.

Query parameters:

| Parameter  | Default | Behavior                                     |
| ---------- | ------: | -------------------------------------------- |
| `limit`    |   `100` | Maximum warning/error log entries to return. |
| `warnings` |  `true` | Use `warnings=false` to return errors only.  |

**cURL**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/errors?limit=50' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/errors', {
    params: {
        limit: 50,
        warnings: false
    }
})
console.log(data)
```

```jsonc
{
    "errors": [
        {
            "id": 510,
            "level": "error",
            "title": "ACCOUNT-ERROR",
            "message": "user@example.com: Page closed unexpectedly"
        }
    ],
    "accountErrors": [
        {
            "email": "user@example.com",
            "error": "Page closed unexpectedly"
        }
    ],
    "count": 1
}
```

### `GET /history`

Returns completed runs launched by the current API process, newest first.

Query parameter:

| Parameter |           Default | Behavior                                                            |
| --------- | ----------------: | ------------------------------------------------------------------- |
| `limit`   | `API_RUN_HISTORY` | Number of records to return, capped at the configured history size. |

**cURL**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/history?limit=10' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/history', {
    params: { limit: 10 }
})
console.log(data.runs)
```

```jsonc
{
    "runs": [
        {
            "startedAt": "2026-07-14T09:30:00.000Z",
            "endedAt": "2026-07-14T09:36:12.000Z",
            "exit": {
                "code": 0,
                "signal": null,
                "at": "2026-07-14T09:36:12.000Z"
            },
            "version": "4.0.0",
            "collected": 312,
            "accounts": [
                {
                    "email": "user@example.com",
                    "collected": 155,
                    "success": true,
                    "error": null,
                    "streakProtection": {
                        "enabled": true,
                        "remainingDays": 1,
                        "streakCounter": 9,
                        "updatedAt": "7/14/2026, 11:30:44 AM"
                    }
                }
            ]
        }
    ],
    "count": 1,
    "inMemoryOnly": true
}
```

This history is not durable. A dashboard that needs charts or long-term history
should store the returned completion data in its own database.

### `GET /accounts`

Returns account slots discovered from `ACCOUNT_<N>_EMAIL` variables in `.env`.
Email addresses are returned in full for the local dashboard. Passwords,
recovery addresses, TOTP secrets, and separate proxy username/password values
are not returned; the configured proxy URL and port are included in the summary.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/accounts \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/accounts')
console.log(data.accounts)
```

```jsonc
{
    "accounts": [
        {
            "index": 2,
            "email": "user@example.com",
            "geoLocale": "NL",
            "langCode": "nl",
            "hasRecoveryEmail": true,
            "hasTotp": true,
            "proxy": {
                "url": "http://proxy.example.com",
                "port": "8080",
                "hasCredentials": true
            },
            "runs": 3,
            "totalCollected": 921,
            "successStreak": 3,
            "lastRunAt": "2026-07-14T09:36:12.000Z",
            "lastCollected": 312,
            "lastSuccess": true,
            "lastError": null,
            "streakProtection": {
                "enabled": true,
                "remainingDays": 1,
                "streakCounter": 9,
                "updatedAt": "7/14/2026, 11:30:44 AM"
            }
        }
    ],
    "count": 1
}
```

The `runs`, `totalCollected`, `successStreak`, and `last*` fields are calculated
from this API process's in-memory history and therefore reset after an API
restart.

### `GET /diagnostics`

Lists diagnostic capture directories found under `API_DIAGNOSTICS_DIR`.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/diagnostics \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/diagnostics')
console.log(data.entries)
```

```jsonc
{
    "dir": "/app/diagnostics",
    "count": 1,
    "entries": [
        {
            "name": "error-2026-07-14T09:35:10.000Z",
            "createdAt": "2026-07-14T09:35:11.400Z",
            "hasScreenshot": true,
            "hasHtml": true,
            "hasError": true,
            "error": "Page closed unexpectedly\n..."
        }
    ]
}
```

Each capture can expose only these filenames:

- `screenshot.png`;
- `error.txt`;
- `dump.html`.

Examples:

**cURL — download a screenshot**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/diagnostics/error-2026-07-14T09:35:10.000Z/screenshot.png' \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --output screenshot.png
```

**Axios — download a screenshot in Node.js**

```js
import { writeFile } from 'node:fs/promises'

const response = await api.get('/diagnostics/error-2026-07-14T09:35:10.000Z/screenshot.png', {
    responseType: 'arraybuffer'
})

await writeFile('screenshot.png', response.data)
```

Use the same URL pattern with `error.txt` or `dump.html`. In a browser, request
binary files with `responseType: 'blob'` instead of `arraybuffer`.

`dump.html` is returned as a download rather than rendered inline.

## Starting and controlling runs

All control endpoints accept JSON. Always send `Content-Type: application/json`
for consistent behavior across clients and proxies.

### `POST /start`

Starts the bot and returns `202 Accepted` once the child process has been
created. The run may still briefly be in the `starting` state.

Supported body fields:

| Field                    | Type                   | Description                                                                            |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------- |
| `accountIndex`           | positive integer       | Run only one configured `ACCOUNT_<N>` slot.                                            |
| `excludedAccountIndexes` | positive integer array | Run every configured account except these slots.                                       |
| `args`                   | string array           | Replace the API's default child-process arguments for this run.                        |
| `env`                    | object                 | Add child-process-only environment overrides. Requires `API_ALLOW_ENV_OVERRIDES=true`. |

`accountIndex` and `excludedAccountIndexes` are mutually exclusive.

#### Start all configured accounts

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

**Axios**

```js
const { data } = await api.post('/start', {})
console.log(data)
```

```jsonc
{
    "started": true,
    "selectedAccount": null,
    "excludedAccounts": [],
    "pid": 18420,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "command": "node",
    "args": ["/app/dist/index.js"]
}
```

#### Start only one account

The index refers to its original `.env` slot, not its position in the
`/accounts` response.

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"accountIndex":2}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    accountIndex: 2
})
console.log(data)
```

```jsonc
{
    "started": true,
    "selectedAccount": {
        "index": 2,
        "email": "user@example.com"
    },
    "excludedAccounts": [],
    "pid": 18420,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "command": "node",
    "args": ["/app/dist/index.js"]
}
```

Internally, the selected account's complete `ACCOUNT_2_*` environment is copied
to `ACCOUNT_1_*` only for the new child process. Credentials remain inside the
API process and are not included in the HTTP response.

#### Start all except selected accounts

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"excludedAccountIndexes":[2,4]}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    excludedAccountIndexes: [2, 4]
})
console.log(data)
```

Remaining accounts are densely remapped in the child environment. For example,
if slots 1, 2, and 3 exist and slot 2 is excluded, original slots 1 and 3 become
child slots 1 and 2. This prevents the bot from stopping account discovery at a
missing middle slot.

Unknown slots and attempts to exclude every configured account return
`400 Bad Request`.

#### Override launch arguments

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"args":["/app/dist/index.js","--example-flag"]}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    args: ['/app/dist/index.js', '--example-flag']
})
console.log(data)
```

The `args` array replaces the configured/default argument array; it is not
appended to it. Every element must be a string.

#### Add per-run environment variables

First enable the feature:

```dotenv
API_ALLOW_ENV_OVERRIDES=true
```

Then send an `env` object:

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"env":{"EXAMPLE_FLAG":"true","EXAMPLE_LIMIT":10}}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    env: {
        EXAMPLE_FLAG: 'true',
        EXAMPLE_LIMIT: 10
    }
})
console.log(data)
```

Values are converted to strings and exist only in the child process. The
following launch-hijacking keys are always discarded:

- `NODE_OPTIONS`;
- `NODE_PATH`;
- `LD_PRELOAD`;
- `DYLD_INSERT_LIBRARIES`;
- `ELECTRON_RUN_AS_NODE`.

Account selection also uses a child-only environment override and works even
when arbitrary `env` overrides are disabled.

#### Start errors

A second start request while a run is `starting`, `running`, or `stopping`
returns:

```http
HTTP/1.1 409 Conflict
```

```json
{
    "error": "Cannot start: a run is already running.",
    "code": "ALREADY_RUNNING"
}
```

### `POST /stop`

Requests termination of the active bot process.

Graceful stop:

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/stop \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

**Axios**

```js
const { data } = await api.post('/stop', {})
console.log(data)
```

Forced stop:

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/stop \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"force":true}'
```

**Axios**

```js
const { data } = await api.post('/stop', {
    force: true
})
console.log(data)
```

Response:

```json
{
    "stopping": true,
    "force": false
}
```

The endpoint returns `202 Accepted` immediately after requesting termination.
A normal stop sends `SIGTERM`; if the process is still alive after
`API_STOP_TIMEOUT_MS`, the API escalates to `SIGKILL`. On Windows,
`taskkill /T /F` terminates the process tree.

Stopping while idle returns `409 Conflict` with code `NOT_RUNNING`.

### `POST /restart`

Stops the current run if necessary and then starts a new run. It accepts the
same `accountIndex`, `excludedAccountIndexes`, `args`, and `env` fields as
`/start`, plus `force` for the stop phase.

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/restart \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"force":false,"accountIndex":2}'
```

**Axios**

```js
const { data } = await api.post('/restart', {
    force: false,
    accountIndex: 2
})
console.log(data)
```

```jsonc
{
    "restarted": true,
    "selectedAccount": {
        "index": 2,
        "email": "user@example.com"
    },
    "excludedAccounts": [],
    "pid": 19002,
    "startedAt": "2026-07-14T09:40:00.000Z",
    "command": "node",
    "args": ["/app/dist/index.js"]
}
```

When the API is already idle, `/restart` simply starts a new run.

### `POST /shutdown`

Terminates the API itself after sending a `202 Accepted` response. If the bot is
running, the API stops it first.

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/shutdown \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"force":false}'
```

**Axios**

```js
const { data } = await api.post('/shutdown', {
    force: false
})
console.log(data)
```

```json
{
    "shuttingDown": true,
    "stoppingBot": true
}
```

Use this carefully: after the response, the API port becomes unavailable until
the service is started again by the terminal, PM2, systemd, Docker, or another
supervisor.

## Live event stream with SSE

### `GET /events`

The endpoint returns `text/event-stream` and emits three named event types:

- `hello`: one complete `/status` snapshot immediately after connection;
- `log`: one structured log entry, including a numeric SSE `id`;
- `status`: a complete status snapshot after process-state changes and parsed
  run milestones.

A comment-only keep-alive frame is sent every 15 seconds.

Query parameters:

| Parameter | Default | Behavior                                                                                           |
| --------- | ------: | -------------------------------------------------------------------------------------------------- |
| `replay`  |   `100` | Number of recent log entries replayed on a fresh connection. Clamped from `0` to `API_LOG_BUFFER`. |
| `token`   |   unset | Token for clients such as browser `EventSource` that cannot send headers.                          |

### Terminal stream

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/events?replay=50' \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --no-buffer
```

Example frames:

```text
event: hello
data: {"state":"running",...}

id: 419
event: log
data: {"id":419,"level":"info","message":"pointsGained=3 ..."}

event: status
data: {"reason":"points","state":"running",...}
```

### Node.js stream with Axios

Axios can expose the raw SSE connection as a Node.js readable stream:

```js
const response = await api.get('/events', {
    params: { replay: 50 },
    responseType: 'stream',
    timeout: 0
})

response.data.setEncoding('utf8')
response.data.on('data', chunk => {
    process.stdout.write(chunk)
})

response.data.on('error', error => {
    console.error('SSE stream failed:', error)
})
```

This exposes the raw SSE frames. Use an SSE parser when the client needs named
events, event IDs, or automatic reconnection behavior.

### Browser `EventSource`

```js
const baseUrl = 'http://127.0.0.1:3010'
const token = encodeURIComponent('replace-with-your-token')
const events = new EventSource(`${baseUrl}/events?replay=100&token=${token}`)

events.addEventListener('hello', event => {
    const status = JSON.parse(event.data)
    console.log('Connected:', status.state)
})

events.addEventListener('log', event => {
    const entry = JSON.parse(event.data)
    console.log(`[${entry.level}] ${entry.message}`)
})

events.addEventListener('status', event => {
    const status = JSON.parse(event.data)
    console.log('Status update:', status)
})

events.onerror = error => {
    console.error('SSE connection error:', error)
}
```

Browsers automatically send `Last-Event-ID` when reconnecting after receiving
an event with an `id`. The API then replays only newer buffered log entries. If
the requested entries have already fallen out of the ring buffer, they cannot
be recovered from this stateless API.

## Reading and editing configuration

### `GET /config`

Reads the first available `config.json` from the supported repository paths.
Webhook URLs, tokens, and chat identifiers handled by the redactor are replaced
with `***REDACTED***` by default.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/config \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/config')
console.log(data.config)
```

```jsonc
{
    "path": "/app/config.json",
    "redacted": true,
    "config": {
        "headless": true,
        "workers": {
            "doMobileSearch": true,
            "doDesktopSearch": true
        },
        "webhook": {
            "discord": {
                "url": "***REDACTED***"
            }
        }
    }
}
```

To permit an unredacted response, all of these conditions must be true:

1. `API_ALLOW_CONFIG_REVEAL=true`;
2. `API_TOKEN` is configured;
3. the request is authenticated;
4. the request includes `?reveal=1`.

**cURL**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/config?reveal=1' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/config', {
    params: { reveal: 1 }
})
console.log(data.config)
```

Do not expose this endpoint over an untrusted network merely because token auth
is enabled. Treat an unredacted config response as secret material.

### `PATCH /config`

Enable writes first:

```dotenv
API_ALLOW_CONFIG_WRITE=true
```

A patch is recursively merged into the existing config. Nested objects are
merged; arrays replace the existing array as a whole.

**cURL**

```bash
curl --request PATCH \
  --url http://127.0.0.1:3010/config \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"workers":{"doMobileSearch":false}}'
```

**Axios**

```js
const { data } = await api.patch('/config', {
    workers: {
        doMobileSearch: false
    }
})
console.log(data)
```

Successful response:

```json
{
    "ok": true,
    "path": "/app/config.json",
    "via": "bot-validateConfig",
    "appliesOnNextRun": true
}
```

The changed config is used by the next bot run. It does not mutate a child
process that is already running.

### `PUT /config`

`PUT` replaces the complete config, so the body must contain every required
field:

**cURL**

```bash
curl --request PUT \
  --url http://127.0.0.1:3010/config \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data-binary @config.json
```

**Axios — Node.js**

```js
import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile('./config.json', 'utf8'))

const { data } = await api.put('/config', config)
console.log(data)
```

The API prefers the bot's compiled validator from
`dist/util/Validator.js`. `API_VALIDATOR_MODULE` can point to another compiled
module. If no bot validator is available, a limited structural fallback checks
core field types.

Validation failures return `422 Unprocessable Entity`:

```jsonc
{
    "error": "Config validation failed",
    "via": "bot-validateConfig",
    "errors": ["workers.doMobileSearch: Expected boolean, received string"]
}
```

When writes are disabled, `PUT` and `PATCH` return `403 Forbidden`.

## Axios response and error handling

Axios places a successful JSON response in `response.data`:

```js
const response = await api.get('/points')

console.log(response.status) // 200
console.log(response.data) // parsed JSON response
```

For API errors, inspect `error.response.status` and `error.response.data`:

```js
import axios from 'axios'

try {
    const { data } = await api.post('/start', {
        accountIndex: 2
    })

    console.log(data)
} catch (error) {
    if (axios.isAxiosError(error) && error.response) {
        console.error('HTTP status:', error.response.status)
        console.error('API error:', error.response.data)
    } else {
        console.error('Request failed:', error)
    }
}
```

Do not use a normal Axios JSON request for browser SSE. Use `EventSource` for
`/events`. For diagnostic files, set `responseType` to `blob` in browsers or
`arraybuffer` in Node.js.

## PowerShell examples

PowerShell's `Invoke-RestMethod` is convenient on Windows:

```powershell
$BaseUrl = 'http://127.0.0.1:3010'
$Headers = @{ Authorization = "Bearer $env:API_TOKEN" }

# Health
Invoke-RestMethod -Uri "$BaseUrl/health" -Headers $Headers

# Start only ACCOUNT_2
$Body = @{ accountIndex = 2 } | ConvertTo-Json
Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/start" `
    -Headers $Headers `
    -ContentType 'application/json' `
    -Body $Body

# Exclude ACCOUNT_2 and ACCOUNT_4
$Body = @{ excludedAccountIndexes = @(2, 4) } | ConvertTo-Json
Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/start" `
    -Headers $Headers `
    -ContentType 'application/json' `
    -Body $Body

# Stop gracefully
Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/stop" `
    -Headers $Headers `
    -ContentType 'application/json' `
    -Body '{}'
```

For raw SSE output in a Windows terminal, use `curl.exe` rather than PowerShell's
`curl` alias:

```powershell
curl.exe -sN `
  -H "Authorization: Bearer $env:API_TOKEN" `
  "http://127.0.0.1:3010/events?replay=50"
```

## HTTP status codes

|                      Status | Meaning in this API                                                                                     |
| --------------------------: | ------------------------------------------------------------------------------------------------------- |
|                    `200 OK` | Successful read or config update.                                                                       |
|              `202 Accepted` | Start, stop, restart, or shutdown request accepted.                                                     |
|            `204 No Content` | Successful CORS preflight.                                                                              |
|           `400 Bad Request` | Invalid JSON, invalid account selection, invalid arguments, oversized body, or invalid diagnostic path. |
|          `401 Unauthorized` | Token required and missing or incorrect.                                                                |
|             `403 Forbidden` | Config writes or arbitrary environment overrides are disabled.                                          |
|             `404 Not Found` | Unknown endpoint, missing config, capture, or artifact.                                                 |
|              `409 Conflict` | Start requested while active, or stop requested while idle.                                             |
|  `422 Unprocessable Entity` | Proposed config failed validation.                                                                      |
| `500 Internal Server Error` | Unexpected process, file, validator, or request-handling failure.                                       |

Most errors use this shape:

```json
{
    "error": "Human-readable explanation",
    "code": "OPTIONAL_MACHINE_CODE"
}
```

## Environment variables

All variables are optional.

| Variable                  | Default              | Purpose                                                                                     |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| `API_HOST`                | `127.0.0.1`          | Interface to bind. Use `0.0.0.0` only when remote/container access is required.             |
| `API_PORT`                | `3010`               | HTTP listen port.                                                                           |
| `API_TOKEN`               | unset                | Shared token required by every endpoint when configured.                                    |
| `API_CORS_ORIGIN`         | `*`                  | Value returned in `Access-Control-Allow-Origin`.                                            |
| `API_LOG_BUFFER`          | `2000`               | Maximum structured log entries kept in memory.                                              |
| `API_RUN_HISTORY`         | `20`                 | Maximum completed runs kept in memory.                                                      |
| `API_STOP_TIMEOUT_MS`     | `15000`              | Graceful-stop window before forced termination.                                             |
| `API_RUN_COMMAND`         | auto                 | Override the executable used to launch the bot.                                             |
| `API_RUN_ARGS`            | none                 | Default arguments for `API_RUN_COMMAND`; accepts whitespace-separated text or a JSON array. |
| `API_DIAGNOSTICS_DIR`     | `<repo>/diagnostics` | Read-only diagnostics directory.                                                            |
| `API_ALLOW_CONFIG_WRITE`  | `false`              | Permit `PUT` and `PATCH /config`.                                                           |
| `API_ALLOW_ENV_OVERRIDES` | `false`              | Permit arbitrary `env` fields in `/start` and `/restart`.                                   |
| `API_ALLOW_CONFIG_REVEAL` | `false`              | Permit authenticated `GET /config?reveal=1`.                                                |
| `API_VALIDATOR_MODULE`    | auto                 | Path to a compiled module exporting `validateConfig` or `ConfigSchema`.                     |

CLI flags can override host, port, and token:

```bash
node scripts/api/server.js \
  -host 0.0.0.0 \
  -port 3010 \
  -token "$API_TOKEN"
```

The API normally launches `dist/index.js` with the current Node executable. If
that file is missing, it falls back to the local `ts-node` CLI and
`src/index.ts`.

An explicit `API_RUN_COMMAND=npm.cmd` is redirected through npm's JavaScript CLI
to avoid Windows `spawn EINVAL` problems. Other `.cmd` and `.bat` overrides are
rejected because the API intentionally does not use an injection-prone shell.

## Security guidance

This service can start and stop processes, read logs containing account-related
information, and potentially reveal or update configuration. Treat it as an
administrative API.

- Keep `API_HOST=127.0.0.1` when only local applications need access.
- Always set `API_TOKEN` before binding to `0.0.0.0` or another non-loopback
  address.
- Use a reverse proxy such as Caddy, nginx, or Traefik for TLS when traffic can
  leave the machine.
- Restrict `API_CORS_ORIGIN` to the actual dashboard origin instead of `*` when
  a browser accesses the API directly.
- Leave config writes, config reveal, and arbitrary environment overrides
  disabled unless they are required.
- Avoid putting the API token in URLs except where browser SSE requires it.
- Do not expose the port directly to the public internet.

The token is compared using a constant-time comparison after verifying equal
length.

## Keeping the API running

Run it under a process supervisor for long-lived use.

### Development terminal

```bash
npm run api
```

### PM2

```bash
pm2 start scripts/api/server.js --name mrs-api
pm2 save
```

### systemd

Example service commands:

```ini
WorkingDirectory=/opt/microsoft-rewards-script
EnvironmentFile=/opt/microsoft-rewards-script/.env
ExecStart=/usr/bin/node /opt/microsoft-rewards-script/scripts/api/server.js
Restart=on-failure
```

### Docker

The API must bind to all container interfaces to be reachable through a
published port:

```dotenv
API_HOST=0.0.0.0
API_PORT=3010
API_TOKEN=replace-with-a-long-random-token
```

Publish port `3010` and ensure the bot's compiled files, `.env`, config, sessions,
and diagnostics are mounted or copied where the bot expects them.

## Startup readiness

After the HTTP server begins listening, it writes one machine-readable line to
stdout:

```text
__API_READY__ {"host":"127.0.0.1","port":3010,"pid":1234,"name":"microsoft-rewards-script","version":"4.0.0","auth":true}
```

A launcher can wait for this line rather than relying on a fixed startup delay.
If the port is already occupied, the API exits with an error instead of silently
starting a second unusable instance.

## File layout

| File                | Responsibility                                                                       |
| ------------------- | ------------------------------------------------------------------------------------ |
| `server.js`         | HTTP routing, authentication, CORS, SSE, diagnostics, and config endpoints.          |
| `processManager.js` | Child-process lifecycle, process-tree termination, log buffering, and status events. |
| `logParser.js`      | Structured log parsing and live run/point accumulation.                              |
| `accounts.js`       | Safe account summaries and child-only account selection/remapping.                   |
| `configEditor.js`   | Config loading, validation, deep merge, backup, and atomic replacement.              |
| `runCommand.js`     | Cross-platform resolution of the command used to launch the bot.                     |
| `lib.js`            | Environment, project-root, logging, config-redaction, and argument helpers.          |
