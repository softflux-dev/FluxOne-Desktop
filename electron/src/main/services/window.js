const { BrowserWindow, shell, Menu, app } = require('electron')
const path = require('node:path')
const { resolveUiUrl, apiUiUrl, viteUiUrl } = require('../utils/paths')

let mainWindow = null

/**
 * Client-side DevTools / menu / selection deterrence.
 * Not real security — server auth remains the source of truth.
 * Controlled by FLUXONE_DISABLE_DEVTOOLS (YES = off, NO = on).
 */
function applyDevToolsPolicy(win, disableDevTools) {
  if (!disableDevTools) {
    // Keep a normal menu in development so logs / Inspect stay available
    return
  }

  // Strip Window → Toggle Developer Tools etc.
  Menu.setApplicationMenu(null)

  win.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toUpperCase()
    const ctrl = input.control || input.meta
    const shift = input.shift
    // Deterrence only — block common inspect shortcuts
    if (key === 'F12') {
      event.preventDefault()
      return
    }
    if (ctrl && shift && (key === 'I' || key === 'J' || key === 'C')) {
      event.preventDefault()
      return
    }
    if (ctrl && key === 'U') {
      event.preventDefault()
    }
  })

  win.webContents.on('devtools-opened', () => {
    try {
      win.webContents.closeDevTools()
    } catch {
      /* ignore */
    }
  })
}

function injectKioskSelectionCss(win) {
  // Labels hard to select; inputs / textareas / contenteditable stay usable
  const css = `
    body { user-select: none; -webkit-user-select: none; }
    input, textarea, [contenteditable="true"], [contenteditable=""],
    .receipt-slip, .print-area {
      user-select: text !important;
      -webkit-user-select: text !important;
    }
  `
  win.webContents.insertCSS(css).catch(() => {})
}

async function createMainWindow({ disableDevTools = false } = {}) {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    backgroundColor: '#f8f6fb',
    title: 'POS Cashier — Software Flux Solution',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // Deterrence when FLUXONE_DISABLE_DEVTOOLS=YES — not real security
      devTools: !disableDevTools,
      // Preload cannot reliably read main process.env mutations — pass explicitly
      additionalArguments: [
        `--fluxone-disable-devtools=${disableDevTools ? '1' : '0'}`,
      ],
    },
  })

  applyDevToolsPolicy(mainWindow, disableDevTools)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Barcode scanners (HID keyboard wedge) need a focused document
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.focus()
    if (disableDevTools) {
      injectKioskSelectionCss(mainWindow)
    }
  })

  let target = await resolveUiUrl()
  const usingVite = target === viteUiUrl()
  console.log(
    usingVite
      ? `[fluxone] UI → ${target}  (LIVE client — Vite)`
      : `[fluxone] UI → ${target}  (client/dist snapshot — run "cd client && npm run build" after UI changes, or start Vite for live UI)`,
  )

  mainWindow.webContents.on(
    'did-fail-load',
    async (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || !mainWindow || mainWindow.isDestroyed()) return
      console.error(`[fluxone] load failed ${code} ${desc} @ ${url}`)

      const fallbacks = [apiUiUrl(), viteUiUrl()].filter((u) => u !== target)
      for (const next of fallbacks) {
        console.log(`[fluxone] trying fallback UI → ${next}`)
        target = next
        try {
          await mainWindow.loadURL(next)
          return
        } catch (err) {
          console.error(`[fluxone] fallback failed`, err.message)
        }
      }

      if (!disableDevTools && !app.isPackaged) {
        mainWindow.webContents.openDevTools({ mode: 'detach' })
      }
      await mainWindow.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(`<!doctype html><html><body style="font-family:sans-serif;padding:2rem">
          <h1>POS UI failed to load</h1>
          <p>${desc || 'Connection refused'}</p>
          <p>Rebuild the client (<code>cd client && npm run build</code>) and restart POS Cashier.</p>
        </body></html>`),
      )
    },
  )

  await mainWindow.loadURL(target)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

function getMainWindow() {
  return mainWindow
}

module.exports = { createMainWindow, getMainWindow }
