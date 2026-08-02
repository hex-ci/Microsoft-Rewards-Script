# Packaging – Portable Windows Distribution Builder

This directory contains the tooling to produce a self-contained, portable
Windows distribution of **Microsoft Rewards Script** as a double-click `.exe`.

## What it produces

```
Microsoft-Rewards-Portable-vX.Y.Z.zip
└── Microsoft-Rewards-Portable/
    ├── microsoft-rewards.exe   ← launcher (double-click to run)
    ├── node.exe                ← bundled Node.js 24 runtime
    ├── dist/                   ← compiled application
    │   ├── config.json         ← edit before first run
    │   ├── accounts.json       ← edit before first run
    │   └── functions/
    │       ├── search-queries.json
    │       └── bing-search-activity-queries.json
    ├── node_modules/           ← production runtime dependencies
    ├── browsers/               ← Chromium (auto-downloaded on first run)
    ├── diagnostics/            ← runtime diagnostic output
    └── README.txt
```

## Requirements (build machine)

| Tool            | Notes                                                            |
| --------------- | ---------------------------------------------------------------- |
| Node.js ≥ 18    | Already required by the project                                  |
| npm             | Bundled with Node.js                                             |
| `unzip` + `zip` | Pre-installed on macOS; `brew install zip` if missing            |
| Internet access | Downloads Node.js for Windows (~30 MB, cached after first build) |

> **No Go, no Rust, no Visual Studio required.**

## How to build

```bash
# From the project root:
node packaging/build-win.js

# Or from inside packaging/:
cd packaging
npm run build:win
```

The first run downloads and caches `node-v24.x.x-win-x64.zip` in
`packaging/.cache/`. Subsequent builds skip the download.

Output zip: `packaging/output/Microsoft-Rewards-Portable-vX.Y.Z.zip`

## Architecture

```
packaging/
├── build-win.js        Main build pipeline (pure Node.js)
├── package.json        Declares caxa as build dependency
├── launcher/
│   ├── main.js         Launcher entry point (bundled into .exe by caxa)
│   └── package.json
├── .cache/             Downloaded Node.js zip (git-ignored)
├── output/             Build output (git-ignored)
└── README.md           This file
```

### Launcher (`launcher/main.js`)

The launcher is a small Node.js script that `caxa` bundles together with its
own embedded Node.js runtime into `microsoft-rewards.exe`.

At runtime it:

1. Resolves the portable package root from `process.execPath`
2. Sets `PLAYWRIGHT_BROWSERS_PATH` to `<pkgRoot>/browsers/`
3. Downloads Chromium on first run (via `patchright cli install`)
4. Spawns `<pkgRoot>/node.exe <pkgRoot>/dist/index.js` with all env vars and
   CLI arguments forwarded

### Why this approach?

| Concern                        | How it is addressed                                                 |
| ------------------------------ | ------------------------------------------------------------------- |
| Chromium can't be embedded     | Downloaded once on first run; lives in `browsers/`                  |
| `__dirname` paths              | `dist/` layout is identical to local dev – no code changes needed   |
| `cluster.fork()` multi-process | Works natively; child processes use the bundled `node.exe`          |
| Native addon (`fsevents`)      | macOS-only optional dep; removed from the Windows package           |
| Cross-platform build           | Node.js for Windows downloaded from nodejs.org; no Go/Rust required |

## Distributing an update

1. Bump the version in the root `package.json`
2. Run `node packaging/build-win.js` again
3. Share the new zip
4. Users copy their `config.json` / `accounts.json` into the new folder

## Troubleshooting

**Build fails at "Compiling TypeScript"**  
Run `npm install` in the project root first, then retry.

**caxa install fails**  
Check your npm registry access: `npm install --save-dev caxa@3 --prefix packaging/`

**node.exe download is slow**  
The zip is cached in `packaging/.cache/`. Once downloaded, subsequent builds
are instant. You can also pre-place the zip there manually.
