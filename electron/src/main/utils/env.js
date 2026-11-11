const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')
const { electronRoot } = require('./paths')

/**
 * Load KEY=VALUE pairs from electron/.env into process.env (does not override
 * variables already set in the shell). Operators may also set env vars at launch.
 */
function loadElectronEnv() {
  const candidates = [
    path.join(electronRoot(), '.env'),
    app.isPackaged ? path.join(process.resourcesPath, '.env') : '',
  ].filter(Boolean)

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    try {
      applyEnvFile(file)
      console.log(`[fluxone] loaded env → ${file}`)
    } catch (err) {
      console.warn(`[fluxone] could not read ${file}:`, err.message)
    }
  }
}

function applyEnvFile(file) {
  const text = fs.readFileSync(file, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // Shell / system env wins over .env file
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

/** YES / Y / 1 / TRUE → true; NO / N / 0 / FALSE → false */
function parseYesNo(raw, fallback) {
  if (raw == null || String(raw).trim() === '') return fallback
  const v = String(raw).trim().toUpperCase()
  if (v === 'YES' || v === 'Y' || v === '1' || v === 'TRUE') return true
  if (v === 'NO' || v === 'N' || v === '0' || v === 'FALSE') return false
  return fallback
}

/**
 * FLUXONE_DISABLE_DEVTOOLS from .env / process.env.
 * YES = DevTools off (deterrence only — not real security).
 * NO  = DevTools on (local debugging / logs).
 * Default: packaged → YES, unpackaged → NO.
 */
function isDevToolsDisabled() {
  const fallback = Boolean(app.isPackaged)
  return parseYesNo(process.env.FLUXONE_DISABLE_DEVTOOLS, fallback)
}

module.exports = {
  loadElectronEnv,
  parseYesNo,
  isDevToolsDisabled,
}
