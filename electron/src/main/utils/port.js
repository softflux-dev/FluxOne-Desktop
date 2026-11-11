const net = require('node:net')

/**
 * True when nothing is listening on host:port (brief bind probe).
 */
function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, host)
  })
}

/**
 * Find the next free TCP port starting at `startPort`.
 * Operators can pin a port with FLUXONE_API_PORT / PORT — we still skip busy ones.
 */
async function findAvailablePort(startPort, { maxTries = 40 } = {}) {
  const start = Number(startPort)
  if (!Number.isFinite(start) || start < 1) {
    throw new Error(`Invalid start port: ${startPort}`)
  }

  for (let i = 0; i < maxTries; i += 1) {
    const port = start + i
    if (port > 65535) break
    // Skip well-known Vite default so we never collide with a live Vite UI
    if (port === 5173) continue
    if (await isPortFree(port)) return port
  }

  throw new Error(
    `No free port found from ${start} after ${maxTries} attempts. Set FLUXONE_API_PORT to a free port.`,
  )
}

module.exports = { isPortFree, findAvailablePort }
