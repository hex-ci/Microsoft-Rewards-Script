#!/usr/bin/env node
/**
 * build-win.js  –  Portable Windows package builder
 *
 * Builds a self-contained Windows distribution of Microsoft Rewards Script.
 * Run from the project root OR from the packaging/ directory:
 *
 *   node packaging/build-win.js
 *
 * Requirements (on the build machine):
 *   • Node.js ≥ 18  (already required by the project)
 *   • npm            (bundled with Node.js)
 *   • Internet access (downloads Node.js for Windows + optional Chromium)
 *
 * Output:
 *   packaging/output/Microsoft-Rewards-Portable-vX.Y.Z.zip
 *
 * The zip, once extracted, has this layout:
 *
 *   Microsoft-Rewards-Portable/
 *   ├── microsoft-rewards.exe   ← double-click to run
 *   ├── node.exe                ← bundled Node.js 24 runtime
 *   ├── dist/                   ← compiled application
 *   │   ├── index.js
 *   │   ├── config.example.json  ← configuration template
 *   │   ├── accounts.example.json← accounts template
 *   │   ├── config.json         ← auto-created on first run (EDIT THIS)
 *   │   ├── accounts.json       ← auto-created on first run (EDIT THIS)
 *   │   └── functions/
 *   │       ├── search-queries.json
 *   │       └── bing-search-activity-queries.json
 *   ├── node_modules/           ← production runtime dependencies
 *   ├── browsers/               ← Chromium (downloaded on first run)
 *   ├── diagnostics/            ← runtime diagnostic output
 *   └── README.txt
 */

'use strict'

// ─── Imports ──────────────────────────────────────────────────────────────────
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { execSync, spawnSync } = require('child_process')
const { createWriteStream, mkdirSync, rmSync, copyFileSync, cpSync } = require('fs')
const os = require('os')

// ─── Paths ────────────────────────────────────────────────────────────────────
const PACKAGING_DIR = path.resolve(__dirname) // …/packaging/
const PROJECT_ROOT = path.resolve(PACKAGING_DIR, '..') // …/Microsoft-Rewards-Script/
const OUTPUT_DIR = path.join(PACKAGING_DIR, 'output')
const CACHE_DIR = path.join(PACKAGING_DIR, '.cache')
const LAUNCHER_DIR = path.join(PACKAGING_DIR, 'launcher')
// Isolated staging dir – npm ci runs here so the project's node_modules is NEVER touched
const STAGING_DIR = path.join(PACKAGING_DIR, '.staging')

// ─── Project metadata ─────────────────────────────────────────────────────────
const pkgJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'))
const APP_VERSION = pkgJson.version // e.g. "3.1.6"
const PACKAGE_NAME = `Microsoft-Rewards-Portable`
const VERSIONED_NAME = `${PACKAGE_NAME}-v${APP_VERSION}`
const PACKAGE_DIR = path.join(OUTPUT_DIR, PACKAGE_NAME)
const ZIP_PATH = path.join(OUTPUT_DIR, `${VERSIONED_NAME}.zip`)

// ─── Node.js for Windows ──────────────────────────────────────────────────────
// Pin the major version to match the project's engines field (>=24)
const NODE_VERSION = '24.2.0'
const NODE_ZIP_NAME = `node-v${NODE_VERSION}-win-x64.zip`
const NODE_ZIP_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ZIP_NAME}`
const NODE_ZIP_CACHE = path.join(CACHE_DIR, NODE_ZIP_NAME)

// ─── Helpers ──────────────────────────────────────────────────────────────────
const BOLD = s => `\x1b[1m${s}\x1b[0m`
const GREEN = s => `\x1b[32m${s}\x1b[0m`
const CYAN = s => `\x1b[36m${s}\x1b[0m`
const RED = s => `\x1b[31m${s}\x1b[0m`
const DIM = s => `\x1b[2m${s}\x1b[0m`

let step = 0
function log(msg) {
    console.log(`${CYAN(`[${++step}]`)} ${msg}`)
}
function ok(msg) {
    console.log(`    ${GREEN('✓')} ${msg}`)
}
function info(msg) {
    console.log(`    ${DIM(msg)}`)
}
function die(msg) {
    console.error(`\n${RED('ERROR:')} ${msg}\n`)
    process.exit(1)
}

function run(cmd, opts = {}) {
    const result = spawnSync(cmd, {
        shell: true,
        stdio: 'inherit',
        cwd: PROJECT_ROOT,
        ...opts
    })
    if (result.status !== 0) die(`Command failed: ${cmd}`)
}

function copyDir(src, dest) {
    cpSync(src, dest, { recursive: true })
}

function ensureDir(p) {
    mkdirSync(p, { recursive: true })
}

/**
 * Download a URL to a local file path, following redirects.
 * Shows a simple progress indicator.
 */
function download(url, destPath) {
    return new Promise((resolve, reject) => {
        ensureDir(path.dirname(destPath))
        const file = createWriteStream(destPath + '.tmp')

        const request = u => {
            const mod = u.startsWith('https') ? https : http
            mod.get(u, res => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    file.close()
                    return request(res.headers.location)
                }
                if (res.statusCode !== 200) {
                    file.close()
                    fs.unlinkSync(destPath + '.tmp')
                    return reject(new Error(`HTTP ${res.statusCode} for ${u}`))
                }

                const total = parseInt(res.headers['content-length'] || '0', 10)
                let received = 0
                let lastPct = -1

                res.on('data', chunk => {
                    received += chunk.length
                    if (total) {
                        const pct = Math.floor((received / total) * 100)
                        if (pct !== lastPct && pct % 5 === 0) {
                            process.stdout.write(
                                `\r    ${DIM(`${pct}%  (${(received / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB)`)}  `
                            )
                            lastPct = pct
                        }
                    }
                })

                res.pipe(file)
                res.on('end', () => {
                    process.stdout.write('\r' + ' '.repeat(60) + '\r')
                    file.close(() => {
                        fs.renameSync(destPath + '.tmp', destPath)
                        resolve()
                    })
                })
                res.on('error', reject)
            }).on('error', reject)
        }
        request(url)
    })
}

// ─── Main build pipeline ──────────────────────────────────────────────────────
;(async () => {
    console.log()
    console.log(BOLD('╔══════════════════════════════════════════════════════╗'))
    console.log(BOLD(`║  Microsoft Rewards Script – Windows Package Builder  ║`))
    console.log(BOLD(`║  App v${APP_VERSION}  •  Bundling Node.js v${NODE_VERSION}              ║`))
    console.log(BOLD('╚══════════════════════════════════════════════════════╝'))
    console.log()

    // ── 1. Prerequisites ─────────────────────────────────────────────────────
    log('Checking prerequisites...')
    try {
        execSync('npm --version', { stdio: 'ignore' })
    } catch {
        die('npm not found in PATH')
    }
    try {
        execSync('node --version', { stdio: 'ignore' })
    } catch {
        die('node not found in PATH')
    }
    try {
        execSync('go version', { stdio: 'ignore' })
    } catch {
        die('Go not found in PATH. Install it: brew install go')
    }
    // Check for zip / unzip (macOS/Linux)
    if (os.platform() !== 'win32') {
        try {
            execSync('zip --version', { stdio: 'ignore' })
        } catch {
            die('zip utility not found. Install it (e.g. brew install zip)')
        }
        try {
            execSync('unzip -v', { stdio: 'ignore' })
        } catch {
            die('unzip utility not found.')
        }
    }
    // Print Go version so it's visible in build log
    const goVer = execSync('go version', { encoding: 'utf8' }).trim()
    ok(`All prerequisites satisfied  (${goVer})`)

    // ── 3. Compile TypeScript ─────────────────────────────────────────────────
    log('Compiling TypeScript...')
    run('npm run build')
    ok('TypeScript compiled → dist/')

    // ── 4. Verify / copy JSON data assets ────────────────────────────────────
    log('Verifying JSON data assets in dist/...')
    const assets = [
        ['src/config.json', 'dist/config.json', 'src/config.example.json'],
        ['src/accounts.json', 'dist/accounts.json', 'src/accounts.example.json'],
        ['src/functions/search-queries.json', 'dist/functions/search-queries.json', null],
        ['src/functions/bing-search-activity-queries.json', 'dist/functions/bing-search-activity-queries.json', null]
    ]
    for (const [src, dest, fallback] of assets) {
        const absSrc = path.join(PROJECT_ROOT, src)
        const absDest = path.join(PROJECT_ROOT, dest)
        const absFallback = fallback ? path.join(PROJECT_ROOT, fallback) : null

        if (fs.existsSync(absDest)) {
            ok(`${path.basename(dest)} already in dist/ (tsc copied it)`)
            continue
        }
        if (fs.existsSync(absSrc)) {
            copyFileSync(absSrc, absDest)
            ok(`Copied ${path.basename(src)} → ${dest}`)
        } else if (absFallback && fs.existsSync(absFallback)) {
            copyFileSync(absFallback, absDest)
            info(`Using example file as ${path.basename(dest)} (edit before use)`)
        } else {
            die(`Cannot find ${src} or its fallback. Run \`npm run build\` first.`)
        }
    }

    // ── 5. Install production node_modules (isolated – never touches project root) ──
    log('Installing production dependencies (isolated staging)...')
    // Copy only the manifests needed for npm ci into the staging dir
    ensureDir(STAGING_DIR)
    copyFileSync(path.join(PROJECT_ROOT, 'package.json'), path.join(STAGING_DIR, 'package.json'))
    copyFileSync(path.join(PROJECT_ROOT, 'package-lock.json'), path.join(STAGING_DIR, 'package-lock.json'))
    // Run npm ci inside staging – the project root's node_modules is untouched
    run('npm ci --omit=dev --ignore-scripts', { cwd: STAGING_DIR })
    ok('node_modules (production only) ready in .staging/')

    // ── 6. Download Node.js for Windows ──────────────────────────────────────
    log(`Downloading Node.js v${NODE_VERSION} for Windows x64...`)
    ensureDir(CACHE_DIR)
    if (fs.existsSync(NODE_ZIP_CACHE)) {
        info(`Using cached ${NODE_ZIP_NAME}`)
    } else {
        info(`Fetching ${NODE_ZIP_URL}`)
        await download(NODE_ZIP_URL, NODE_ZIP_CACHE)
    }
    ok(`${NODE_ZIP_NAME} ready`)

    // Extract node.exe
    log('Extracting node.exe...')
    const NODE_EXTRACT_DIR = path.join(CACHE_DIR, 'node-extract')
    ensureDir(NODE_EXTRACT_DIR)
    run(`unzip -o "${NODE_ZIP_CACHE}" "node-v${NODE_VERSION}-win-x64/node.exe" -d "${NODE_EXTRACT_DIR}"`, {
        cwd: CACHE_DIR
    })
    const extractedNodeExe = path.join(NODE_EXTRACT_DIR, `node-v${NODE_VERSION}-win-x64`, 'node.exe')
    if (!fs.existsSync(extractedNodeExe)) die('Failed to extract node.exe from zip.')
    ok('node.exe extracted')

    // ── 7. Clean and prepare output directory ─────────────────────────────────
    log('Preparing output directory...')
    if (fs.existsSync(PACKAGE_DIR)) rmSync(PACKAGE_DIR, { recursive: true, force: true })
    ensureDir(PACKAGE_DIR)
    ok(`${PACKAGE_DIR}`)

    // ── 8. Copy application files ─────────────────────────────────────────────
    log('Copying application files...')
    copyDir(path.join(PROJECT_ROOT, 'dist'), path.join(PACKAGE_DIR, 'dist'))

    // Exclude sensitive user configurations from the build output
    const sensitiveConfigs = ['config.json', 'accounts.json']
    for (const file of sensitiveConfigs) {
        const p = path.join(PACKAGE_DIR, 'dist', file)
        if (fs.existsSync(p)) {
            fs.unlinkSync(p)
        }
    }
    // Ship only the clean example templates
    copyFileSync(
        path.join(PROJECT_ROOT, 'src', 'config.example.json'),
        path.join(PACKAGE_DIR, 'dist', 'config.example.json')
    )
    copyFileSync(
        path.join(PROJECT_ROOT, 'src', 'accounts.example.json'),
        path.join(PACKAGE_DIR, 'dist', 'accounts.example.json')
    )
    ok('Clean configuration templates placed in dist/ (user configs excluded)')

    // node_modules comes from STAGING_DIR, not from the project root
    copyDir(path.join(STAGING_DIR, 'node_modules'), path.join(PACKAGE_DIR, 'node_modules'))
    copyFileSync(path.join(STAGING_DIR, 'package.json'), path.join(PACKAGE_DIR, 'package.json'))
    copyFileSync(path.join(STAGING_DIR, 'package-lock.json'), path.join(PACKAGE_DIR, 'package-lock.json'))

    // Remove macOS-only native addon (fsevents) to keep the package clean
    const fseDir = path.join(PACKAGE_DIR, 'node_modules', 'fsevents')
    if (fs.existsSync(fseDir)) {
        rmSync(fseDir, { recursive: true, force: true })
        info('Removed fsevents (macOS-only, not needed on Windows)')
    }

    // Copy node.exe
    copyFileSync(extractedNodeExe, path.join(PACKAGE_DIR, 'node.exe'))
    ok('node.exe placed')

    // Create empty runtime directories
    // NOTE: browsers/ is intentionally NOT pre-created here.
    //       The launcher checks for its absence to trigger first-run Chromium download.
    ensureDir(path.join(PACKAGE_DIR, 'diagnostics'))
    ok('Runtime directories created')

    // ── 9. Cross-compile launcher → true Windows PE x64 .exe via Go ──────────
    log('Building microsoft-rewards.exe (Go cross-compile → Windows x64)...')
    if (!fs.existsSync(LAUNCHER_DIR)) die(`Go launcher source not found at ${LAUNCHER_DIR}`)

    const caxaOut = path.join(PACKAGE_DIR, 'microsoft-rewards.exe')
    // GOOS=windows GOARCH=amd64 produces a genuine Windows PE x64 binary.
    // -s -w strips debug symbols (reduces size).
    // CGO_ENABLED=0 ensures a fully static binary with no external DLL dependencies.
    run(
        `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
         go build -ldflags="-s -w" -o "${caxaOut}" .`,
        { cwd: LAUNCHER_DIR }
    )

    // Verify it really is a Windows PE binary
    const fileOut = execSync(`file "${caxaOut}"`, { encoding: 'utf8' }).trim()
    if (!fileOut.includes('PE32+') && !fileOut.includes('PE32')) {
        die(`Built .exe does not appear to be a Windows PE binary:\n  ${fileOut}`)
    }
    ok(`microsoft-rewards.exe built (${formatBytes(fs.statSync(caxaOut).size)})`)
    info(fileOut)

    // ── 10. Write README ──────────────────────────────────────────────────────
    log('Writing README.txt...')
    fs.writeFileSync(path.join(PACKAGE_DIR, 'README.txt'), README_TEXT(APP_VERSION))
    ok('README.txt written')

    // ── 11. Create zip archive ────────────────────────────────────────────────
    log(`Creating ${path.basename(ZIP_PATH)}...`)
    if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH)
    run(`zip -r "${ZIP_PATH}" "${PACKAGE_NAME}/"`, { cwd: OUTPUT_DIR })
    ok(`Zip created  (${formatBytes(fs.statSync(ZIP_PATH).size)})`)

    // ── Done ──────────────────────────────────────────────────────────────────
    console.log()
    console.log(GREEN(BOLD('✓ Build complete!')))
    console.log()
    console.log(`  ${BOLD('Zip:')}  ${ZIP_PATH}`)
    console.log(`  ${BOLD('Dir:')}  ${PACKAGE_DIR}`)
    console.log()
    console.log('  Distribute the zip. Users extract it and double-click')
    console.log(`  ${BOLD('microsoft-rewards.exe')} to run.`)
    console.log()
})().catch(err => {
    console.error(`\n${RED('FATAL:')} ${err.message}`)
    process.exit(1)
})

// ─── README template ──────────────────────────────────────────────────────────
function README_TEXT(version) {
    return `\
Microsoft Rewards Script – Portable Edition  v${version}
=======================================================

QUICK START
-----------
1. Double-click microsoft-rewards.exe. On the very first run, it will:
   a) Automatically create config.json and accounts.json in the dist/ folder.
   b) Download the Chromium browser (~200 MB).
2. After the launcher finishes initializing, close it.
3. Open dist\\config.json and configure your preferences.
4. Open dist\\accounts.json and add your Microsoft account(s).
5. Double-click microsoft-rewards.exe again to run the script.

DIRECTORY LAYOUT
----------------
microsoft-rewards.exe         Double-click to run
node.exe                      Bundled Node.js runtime (do not delete)
dist\\
  index.js                    Application entry point
  config.example.json         Configuration template
  accounts.example.json       Accounts template
  config.json                 Your configuration file (auto-created on first run)
  accounts.json               Your accounts file (auto-created on first run)
  browser\\sessions\\          Login sessions (auto-generated)
  functions\\                 Search query data
node_modules\\                Runtime dependencies (do not delete)
browsers\\                    Chromium binary (auto-downloaded on first run)
diagnostics\\                 Diagnostic output

CONFIGURATION
-------------
Edit dist\\config.json and dist\\accounts.json before running.
Refer to the project README for all available options:
  https://github.com/Netsky09/Microsoft-Rewards-Script

SESSIONS
--------
Login sessions are saved in dist\\browser\\sessions\\<email>\\
Delete a session folder to force a fresh login for that account.

UPDATING
--------
To update to a newer version:
  1. Download the new zip and extract to a NEW folder.
  2. Copy your dist\\config.json and dist\\accounts.json into the new folder.
  3. (Optional) Copy dist\\browser\\sessions\\ to keep your saved sessions.
  4. Delete the old folder.

TROUBLESHOOTING
---------------
- If the first-run Chromium download fails, check your internet connection
  and try again. Delete the browsers\\ directory (if it was partially created)
  and re-run microsoft-rewards.exe.
- If you get a missing-DLL or Node.js error, ensure the package was extracted
  fully and that no anti-virus quarantined any files.
- For further help: https://github.com/Netsky09/Microsoft-Rewards-Script/issues

LICENSE
-------
This project is licensed under the GNU GPL v3 or later.
`
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
}
