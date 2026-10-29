const { app, dialog } = require('electron')
const { enforceSingleInstance } = require('./main/utils/single-instance')
const { loadElectronEnv, isDevToolsDisabled } = require('./main/utils/env')
const { startServer, stopServer } = require('./main/services/server-bootstrap')
const { createMainWindow } = require('./main/services/window')
const { showSplash, updateSplash, closeSplash } = require('./main/services/splash')
const { startBackgroundSync, stopBackgroundSync } = require('./main/services/background-sync')
const { registerPrintIpc } = require('./print/print')
const { registerQuitGuard } = require('./main/ipc/quit-guard')
const { sqlitePath, bundledSqlitePath, apiPort } = require('./main/utils/paths')

// Load electron/.env before reading feature flags
loadElectronEnv()

// YES = DevTools off; NO = DevTools on (from FLUXONE_DISABLE_DEVTOOLS)
const DISABLE_DEVTOOLS = isDevToolsDisabled()

if (!enforceSingleInstance()) {
  // second instance — quit already requested
}

registerPrintIpc()
registerQuitGuard()

app.whenReady().then(async () => {
  let splashReady = false
  try {
    console.log(`[fluxone] packaged=${app.isPackaged}`)
    console.log(`[fluxone] DISABLE_DEVTOOLS=${DISABLE_DEVTOOLS ? 'YES' : 'NO'}`)
    if (app.isPackaged) {
      console.log(`[fluxone] bundled snapshot → ${bundledSqlitePath()}`)
    }
    console.log(`[fluxone] db → ${sqlitePath()}`)

    await showSplash()
    splashReady = true
    await updateSplash({ percent: 8, message: 'Starting POS Cashier…' })

    await startServer({
      onProgress: (p) => updateSplash(p),
    })

    await updateSplash({ percent: 96, message: 'Opening cashier…' })
    console.log(`[fluxone] API port → ${apiPort()}`)

    await createMainWindow({ disableDevTools: DISABLE_DEVTOOLS })
    startBackgroundSync()

    closeSplash()
  } catch (err) {
    console.error('[fluxone] startup failed', err)
    stopBackgroundSync()
    if (splashReady) closeSplash()
    dialog.showErrorBox(
      'POS Cashier failed to start',
      `${err.message}\n\nTip: set FLUXONE_API_PORT to a free port if another app is using the default. Packaged builds include Node + Express + SQLite under this app.`,
    )
    await stopServer()
    app.exit(1)
  }

  app.on('activate', () => {
    const { BrowserWindow } = require('electron')
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({ disableDevTools: DISABLE_DEVTOOLS })
    }
  })
})

app.on('window-all-closed', () => {
  stopBackgroundSync()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
