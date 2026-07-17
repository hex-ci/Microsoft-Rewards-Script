/**
 * Triggers a run via the local API server and waits for it to finish.
 *
 * Called by scripts/docker/run_daily.sh when API_MODE=true so that cron
 * delegates to the API server rather than running npm start directly.  The
 * API server has full visibility over every run, scheduled or
 * manually triggered, and the dashboard can stream logs, stop a run, or
 * inspect history regardless of how it was started.
 *
 */

import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getProjectRoot } from './lib.js'
import { readSchedule } from './scheduleStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = getProjectRoot(__dirname)

const PORT = Number(process.env.API_PORT) || 3010
const TOKEN = process.env.API_TOKEN || ''
const TIMEOUT_MS = (Number(process.env.STUCK_PROCESS_TIMEOUT_HOURS) || 8) * 60 * 60 * 1000
const POLL_MS = 15_000
const STARTUP_ATTEMPTS = 30
const STARTUP_DELAY_MS = 2_000

function request(method, path, body = {}) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body ?? {})
        const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`
        const req = http.request({ host: '127.0.0.1', port: PORT, path, method, headers }, res => {
            let raw = ''
            res.on('data', c => (raw += c))
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(raw) })
                } catch {
                    resolve({ status: res.statusCode, body: raw })
                }
            })
        })
        req.on('error', reject)
        req.end(payload)
    })
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
}

// Scheduled runs (cron -> run_daily.sh -> here) honor whichever accounts are
// currently excluded in config/schedule.json, if the dashboard (or a manual
// PUT /schedule call) has ever saved one. RUN_ON_START's initial kickoff goes
// through this same path, so it respects exclusions too rather than always
// running every account regardless of the saved schedule.
function buildStartBody() {
    try {
        const schedule = readSchedule(projectRoot)
        if (schedule.excludedAccountIndexes?.length) {
            return { excludedAccountIndexes: schedule.excludedAccountIndexes }
        }
    } catch (err) {
        console.warn(`[trigger] Could not read schedule.json, running with all accounts: ${err.message}`)
    }
    return {}
}

// Wait for the API server to be ready.  Handles the RUN_ON_START race where
// trigger.js is launched in the background before the API server has started.
let ready = false
for (let i = 0; i < STARTUP_ATTEMPTS; i++) {
    try {
        const { status } = await request('GET', '/health')
        if (status === 200) {
            ready = true
            break
        }
    } catch {
        /* server not up yet */
    }
    if (i < STARTUP_ATTEMPTS - 1) {
        console.log(`[trigger] Waiting for API server (attempt ${i + 1}/${STARTUP_ATTEMPTS})…`)
        await sleep(STARTUP_DELAY_MS)
    }
}

if (!ready) {
    console.error(`[trigger] API server did not respond after ${STARTUP_ATTEMPTS} attempts. Is API_MODE=true?`)
    process.exit(1)
}

// Trigger the run.
const { status, body } = await request('POST', '/start', buildStartBody())

if (status === 409) {
    // A run is already in progress - the dashboard or a previous cron invocation
    // beat us to it.  Exit cleanly so the lockfile is released.
    console.log('[trigger] A run is already in progress (409 Conflict). Skipping.')
    process.exit(0)
}

if (status !== 202) {
    console.error(`[trigger] POST /start failed (HTTP ${status}):`, JSON.stringify(body))
    process.exit(1)
}

console.log('[trigger] Run started. Waiting for completion…')

// Poll /status until the run finishes or the timeout is reached.
const deadline = Date.now() + TIMEOUT_MS
while (Date.now() < deadline) {
    await sleep(POLL_MS)
    try {
        const { body: s } = await request('GET', '/status')
        if (s?.state === 'idle') {
            console.log('[trigger] Run completed.')
            process.exit(0)
        }
    } catch {
        /* momentary blip - keep polling */
    }
}

console.error(`[trigger] Timed out after ${process.env.STUCK_PROCESS_TIMEOUT_HOURS || 8}h waiting for run to finish.`)
process.exit(1)
