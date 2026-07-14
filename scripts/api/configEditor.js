import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function resolveConfigPath(projectRoot) {
    const candidates = [
        path.join(projectRoot, 'config.json'),
        path.join(projectRoot, 'dist', 'config.json'),
        path.join(projectRoot, 'src', 'config.json'),
        path.resolve(process.cwd(), 'config.json')
    ]
    return candidates.find(p => fs.existsSync(p)) ?? path.join(projectRoot, 'config.json')
}

async function loadBotValidator(projectRoot, override) {
    const modPath = override || path.join(projectRoot, 'dist', 'util', 'Validator.js')
    if (!override && !fs.existsSync(modPath)) return null
    try {
        const mod = await import(pathToFileURL(path.resolve(modPath)).href)
        const m = mod.default && !mod.validateConfig ? mod.default : mod
        if (typeof m.validateConfig === 'function') {
            return { via: 'bot-validateConfig', run: cfg => m.validateConfig(cfg) }
        }
        if (m.ConfigSchema && typeof m.ConfigSchema.parse === 'function') {
            return { via: 'bot-ConfigSchema', run: cfg => m.ConfigSchema.parse(cfg) }
        }
        throw new Error('module has no validateConfig function or ConfigSchema')
    } catch (error) {
        throw new Error(
            `Could not load bot config validator at ${modPath}: ${error instanceof Error ? error.message : String(error)}`
        )
    }
}

const BOOL_KEYS = ['headless', 'errorDiagnostics', 'ensureStreakProtection', 'autoClaimPunchcardRewards']

function structuralValidate(cfg) {
    const errors = []
    if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
        return { ok: false, errors: ['config must be a JSON object'] }
    }
    if (typeof cfg.sessionPath !== 'string') errors.push('sessionPath must be a string')
    if (!Number.isInteger(cfg.clusters) || cfg.clusters < 0) errors.push('clusters must be a non-negative integer')
    for (const k of BOOL_KEYS) {
        if (k in cfg && typeof cfg[k] !== 'boolean') errors.push(`${k} must be a boolean`)
    }
    if ('workers' in cfg) {
        if (typeof cfg.workers !== 'object' || cfg.workers === null) errors.push('workers must be an object')
        else {
            for (const [k, v] of Object.entries(cfg.workers)) {
                if (typeof v !== 'boolean') errors.push(`workers.${k} must be a boolean`)
            }
        }
    }
    return { ok: errors.length === 0, errors }
}

export async function validateConfig(cfg, { projectRoot, validatorModule } = {}) {
    let validator
    try {
        validator = await loadBotValidator(projectRoot, validatorModule)
    } catch (error) {
        return {
            ok: false,
            errors: [error instanceof Error ? error.message : String(error)],
            via: 'bot-validator-load'
        }
    }
    if (validator) {
        try {
            const value = validator.run(cfg)
            return { ok: true, value: value ?? cfg, via: validator.via }
        } catch (err) {
            const issues = err?.issues
            const errors = Array.isArray(issues)
                ? issues.map(i => `${(i.path || []).join('.') || '(root)'}: ${i.message}`)
                : [err instanceof Error ? err.message : String(err)]
            return { ok: false, errors, via: validator.via }
        }
    }
    const res = structuralValidate(cfg)
    return { ...res, value: cfg, via: 'structural-fallback' }
}

export function deepMerge(base, patch) {
    if (Array.isArray(patch)) return patch // arrays replace wholesale
    if (typeof patch !== 'object' || patch === null) return patch
    const out = { ...(typeof base === 'object' && base !== null ? base : {}) }
    for (const [k, v] of Object.entries(patch)) {
        out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k], v) : v
    }
    return out
}

export function readConfig(projectRoot) {
    const p = resolveConfigPath(projectRoot)
    return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) }
}

export function writeConfigAtomic(projectRoot, cfg) {
    const target = resolveConfigPath(projectRoot)
    if (fs.existsSync(target)) {
        try {
            fs.copyFileSync(target, `${target}.bak`)
        } catch {
            // best-effort backup
        }
    }
    const tmp = `${target}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2))
    fs.renameSync(tmp, target)
    return target
}
