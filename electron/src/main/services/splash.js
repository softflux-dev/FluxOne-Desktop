const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { BrowserWindow } = require('electron')
const { electronRoot, repoRoot } = require('../utils/paths')

let splashWindow = null

function resolveSplashLogoPath() {
  const candidates = [
    path.join(electronRoot(), 'assets', 'icon.png'),
    path.join(repoRoot(), 'client', 'public', 'assets', 'company-logo.png'),
    path.join(process.resourcesPath || '', 'client-dist', 'assets', 'company-logo.png'),
  ]
  for (const file of candidates) {
    if (file && fs.existsSync(file)) return file
  }
  return ''
}

async function showSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow
  }

  splashWindow = new BrowserWindow({
    width: 440,
    height: 340,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    frame: false,
    show: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1014',
    title: 'FluxOne',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Splash has no DevTools need
      devTools: false,
    },
  })

  const logo = resolveSplashLogoPath()
  const htmlPath = path.join(__dirname, '../ui/splash.html')
  await splashWindow.loadFile(
    htmlPath,
    logo ? { query: { logo: pathToFileURL(logo).href } } : undefined,
  )
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show()
  })
  if (!splashWindow.isVisible()) splashWindow.show()

  return splashWindow
}

async function updateSplash({ percent, message } = {}) {
  if (!splashWindow || splashWindow.isDestroyed()) return
  const payload = JSON.stringify({
    percent: Number(percent) || 0,
    message: message || '',
  })
  try {
    await splashWindow.webContents.executeJavaScript(
      `window.__splashUpdate && window.__splashUpdate(${payload})`,
      true,
    )
  } catch {
    // Splash may have closed mid-update
  }
}

function closeSplash() {
  if (!splashWindow || splashWindow.isDestroyed()) {
    splashWindow = null
    return
  }
  try {
    splashWindow.close()
  } catch {
    /* ignore */
  }
  splashWindow = null
}

module.exports = { showSplash, updateSplash, closeSplash }
