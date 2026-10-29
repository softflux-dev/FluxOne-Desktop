const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')
const {
  serverRoot,
  clientDistPath,
  sqlitePath,
  preferredApiPort,
  apiPort,
  setApiPort,
  healthUrl,
  bundledNodePath,
  probeFluxOneHealth,
} = require('../utils/paths')
const { findAvailablePort } = require('../utils/port')

let child = null
let reusedExisting = false

function waitForFluxOneHealth(url, { timeoutMs = 45000, intervalMs = 250 } = {}) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await probeFluxOneHealth(url)) {
        resolve()
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`API health check timed out: ${url}`))
        return
      }
      setTimeout(tick, intervalMs)
    }
    tick()
  })
}

function resolveNodeBinary() {
  const bundled = bundledNodePath()
  if (bundled && fs.existsSync(bundled)) {
    return bundled
  }
  return process.platform === 'win32' ? 'node.exe' : 'node'
}

function buildServerEnv(port, dbPath, dist) {
  return {
    ...process.env,
    PORT: String(port),
    FLUXONE_API_PORT: String(port),
    SQLITE_PATH: dbPath,
    NODE_ENV: app.isPackaged ? 'production' : process.env.NODE_ENV || 'development',
    FLUXONE_DESKTOP: '1',
    FLUXONE_AUTO_SEED: '0',
    CLIENT_DIST_PATH: dist || '',
    JWT_SECRET:
      process.env.JWT_SECRET ||
      (app.isPackaged ? 'fluxone-desktop-local-jwt' : 'dev-only-change-me'),
    CORS_ORIGINS: [
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ].join(','),
  }
}

function spawnApiProcess({ port, dbPath, dist, root, entry, nodeBin }) {
  const env = buildServerEnv(port, dbPath, dist)
  console.log(`[api] spawning ${nodeBin}`)
  console.log(`[api] entry ${entry}`)
  console.log(`[api] ui dist ${dist}`)
  console.log(`[api] port ${port}`)

  const proc = spawn(nodeBin, [entry], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let spawnError = null
  proc.stdout.on('data', (buf) => {
    console.log(`[api] ${String(buf).trimEnd()}`)
  })
  proc.stderr.on('data', (buf) => {
    const text = String(buf).trimEnd()
    console.error(`[api] ${text}`)
    if (/EADDRINUSE|address already in use/i.test(text)) {
      spawnError = new Error(`EADDRINUSE:${port}`)
    }
  })
  proc.on('exit', (code, signal) => {
    console.log(`[api] exited code=${code} signal=${signal}`)
    if (child === proc) child = null
  })
  proc.on('error', (err) => {
    spawnError = err
    console.error('[api] failed to start', err.message)
  })

  return {
    proc,
    getError: () => spawnError,
  }
}

function killProc(proc) {
  if (!proc || proc.killed) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], {
        windowsHide: true,
        stdio: 'ignore',
      })
    } else {
      proc.kill('SIGTERM')
    }
  } catch {
    try {
      proc.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }
}

/** Reject quickly when stderr already reported EADDRINUSE. */
function watchSpawnBusy(getError, timeoutMs) {
  const started = Date.now()
  return new Promise((_, reject) => {
    const tick = () => {
      const err = getError()
      if (err && /EADDRINUSE/i.test(String(err.message || ''))) {
        reject(err)
        return
      }
      if (Date.now() - started > timeoutMs) {
        // No busy signal — let health wait continue (do not reject)
        return
      }
      setTimeout(tick, 150)
    }
    tick()
  })
}

/**
 * Start Express as a child Node process on a free port.
 * Never attaches to a foreign localhost:3000 website.
 * Dev may reuse an already-running FluxOne API (identity-checked).
 *
 * @param {{ onProgress?: (p:{percent:number,message:string}) => void }} [opts]
 */
async function startServer(opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {}

  onProgress({ percent: 12, message: 'Looking for a free API port…' })

  const preferred = preferredApiPort()
  // Prefer env port when free; otherwise walk upward (skip busy Vite / other apps)
  const port = await findAvailablePort(preferred)
  setApiPort(port)

  if (port !== preferred) {
    console.log(
      `[api] preferred port ${preferred} busy — using free port ${port}. Set FLUXONE_API_PORT to pin a port.`,
    )
  }

  const url = healthUrl(port)

  // Dev only: reuse our own FluxOne if already healthy on this port
  if (!app.isPackaged && (await probeFluxOneHealth(url))) {
    reusedExisting = true
    onProgress({ percent: 90, message: `Connected to FluxOne on port ${port}` })
    console.log(`[api] reusing existing FluxOne server on port ${port}`)
    return null
  }

  if (child) return child

  reusedExisting = false
  const dbPath = sqlitePath()
  const root = serverRoot()
  const dist = clientDistPath()
  const entry = path.join(root, 'index.js')
  const nodeBin = resolveNodeBinary()

  if (!fs.existsSync(entry)) {
    throw new Error(`Server entry not found: ${entry}`)
  }
  if (!dist || !fs.existsSync(path.join(dist, 'index.html'))) {
    if (app.isPackaged) {
      throw new Error(
        `Client UI build not found at ${dist || '(empty)'}. Run: cd client && npm run build`,
      )
    }
    console.warn(
      '[api] no client/dist yet — start Vite for live UI: cd client && npm run dev',
    )
  }

  onProgress({ percent: 35, message: `Starting POS API on port ${port}…` })

  // Retry a few ports if bind races after the free-port probe
  let lastError = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const tryPort = attempt === 0 ? port : await findAvailablePort(port + attempt)
    setApiPort(tryPort)
    const tryUrl = healthUrl(tryPort)

    onProgress({
      percent: 40 + attempt * 8,
      message: `Binding API on port ${tryPort}…`,
    })

    const { proc, getError } = spawnApiProcess({
      port: tryPort,
      dbPath,
      dist,
      root,
      entry,
      nodeBin,
    })
    child = proc

    try {
      onProgress({ percent: 70, message: 'Waiting for FluxOne health…' })
      // Abort early if child reports EADDRINUSE instead of waiting full health timeout
      await Promise.race([
        waitForFluxOneHealth(tryUrl),
        watchSpawnBusy(getError, 8000),
      ])
      onProgress({ percent: 92, message: `API ready on port ${tryPort}` })
      console.log(`[api] ready on port ${tryPort} · db ${dbPath}`)
      return child
    } catch (err) {
      const spawnError = getError()
      lastError = spawnError || err
      killProc(proc)
      child = null

      const busy = /EADDRINUSE/i.test(String(lastError?.message || ''))
      if (!busy && attempt >= 2) {
        throw lastError
      }
      console.warn(`[api] port ${tryPort} failed (${lastError.message}) — trying next`)
    }
  }

  throw (
    lastError ||
    new Error(
      `Could not start API. Prefer a free port via FLUXONE_API_PORT (tried from ${preferred}).`,
    )
  )
}

function stopServer() {
  if (reusedExisting || !child || child.killed) {
    child = null
    return Promise.resolve()
  }
  const proc = child
  child = null
  return new Promise((resolve) => {
    const done = () => resolve()
    proc.once('exit', done)
    killProc(proc)
    setTimeout(done, 4000)
  })
}

module.exports = { startServer, stopServer, apiPort }
