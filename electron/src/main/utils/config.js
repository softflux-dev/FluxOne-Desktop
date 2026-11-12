const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

/**
 * Build-time bake: prepare-dist.mjs copies
 * config/env.${NODE_ENV}.json → config/env.active.json before packaging.
 * Packaged app prefers env.active.json (guaranteed to match the build target),
 * falls back to env.<NODE_ENV>.json, then {} with a warning.
 *
 * Dev/unpackaged resolves config/<NODE_ENV>.json via electronRoot()
 * and honours process.env.NODE_ENV (default: staging).
 */

const CONFIG_FILES = {
  production: 'env.production.json',
  staging: 'env.staging.json',
}

function envName() {
  const env = String(process.env.NODE_ENV || 'production').toLowerCase()
  return env === 'production' ? 'production' : 'staging'
}

function configDir() {
  const { electronRoot } = require('./paths')
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'config')
  }
  return path.join(electronRoot(), 'config')
}

function resolveConfigFile(env) {
  const name = CONFIG_FILES[env] || CONFIG_FILES.staging
  return path.join(configDir(), name)
}

function readConfigFile(file) {
  try {
    if (!fs.existsSync(file)) return null
    const text = fs.readFileSync(file, 'utf8')
    return JSON.parse(text)
  } catch (err) {
    console.warn(`[fluxone] could not read config ${file}:`, err.message)
    return null
  }
}

/**
 * Load the runtime app config (apiBaseUrl etc.) for the current environment.
 * Never throws — returns {} with a console warning when no config is found.
 */
function loadAppConfig() {
  const env = envName()

  // Packaged: prefer the build-baked env.active.json.
  if (app.isPackaged) {
    const baked = path.join(configDir(), 'env.active.json')
    const cfg = readConfigFile(baked)
    if (cfg) {
      console.log(`[fluxone] config → ${baked} (env=${env})`)
      return cfg
    }
    // Fallback: env.<NODE_ENV>.json shipped alongside resources.
    const fallback = resolveConfigFile(env)
    const cfg2 = readConfigFile(fallback)
    if (cfg2) {
      console.log(`[fluxone] config → ${fallback} (env=${env})`)
      return cfg2
    }
    console.warn(`[fluxone] no environment config found; using defaults`)
    return {}
  }

  // Dev / unpackaged: pick env.<NODE_ENV>.json from electron/config/.
  const file = resolveConfigFile(env)
  const cfg = readConfigFile(file)
  if (cfg) {
    console.log(`[fluxone] config → ${file} (env=${env})`)
    return cfg
  }
  console.warn(`[fluxone] config file not found: ${file}; using defaults`)
  return {}
}

/**
 * Determine the active environment.
 * Packaged: reads the env field from the build-baked env.active.json
 * (so Staging and Production .exe each resolve their own DB file).
 * Dev/unpackaged: honors process.env.NODE_ENV.
 */
function getActiveEnvironment() {
  if (app.isPackaged) {
    const configPath = path.join(process.resourcesPath, 'config', 'env.active.json')
    const cfg = readConfigFile(configPath)
    if (cfg && cfg.env) {
      console.log(`[fluxone] active environment from config → ${cfg.env}`)
      return cfg.env
    }
    console.warn('[fluxone] no env field in env.active.json; defaulting to production')
    return 'production'
  }
  const env = String(process.env.NODE_ENV || 'production').toLowerCase()
  if (env === 'staging') return 'staging'
  if (env === 'development') return 'development'
  return 'production'
}
/**
 * Trimmed apiBaseUrl from config, or '' when not configured.
 */
function apiBaseUrl() {
  const cfg = loadAppConfig()
  return String(cfg.apiBaseUrl || '').replace(/\/+$/, '')
}

module.exports = {
  loadAppConfig,
  apiBaseUrl,
  envName,
  configDir,
  getActiveEnvironment,
}
