import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, dialog, safeStorage, session, shell } from "electron";
import { LOCAL_APP_ORIGIN, isLocalAppUrl, isTrustedExternalUrl } from "./security";
import type { startServer as StartServerFunction } from "../server/index";

type LocalServer = ReturnType<typeof StartServerFunction>;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow: BrowserWindow | null = null;
let localServer: LocalServer | null = null;

if (!hasSingleInstanceLock) app.quit();

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function openTrustedExternal(url: string) {
  if (isTrustedExternalUrl(url)) await shell.openExternal(url);
}

async function createWindow() {
  const icon = app.isPackaged
    ? path.join(process.resourcesPath, "cycling-analytics-icon-512.png")
    : path.join(app.getAppPath(), "public", "cycling-analytics-icon-512.png");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    icon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openTrustedExternal(url);
    return { action: "deny" };
  });
  const guardNavigation = (event: Electron.Event, url: string) => {
    if (isLocalAppUrl(url)) return;
    event.preventDefault();
    void openTrustedExternal(url);
  };
  mainWindow.webContents.on("will-navigate", guardNavigation);
  mainWindow.webContents.on("will-redirect", guardNavigation);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  await mainWindow.loadURL(LOCAL_APP_ORIGIN);
}

async function startDesktopApp() {
  process.env.CYCLING_DATA_DIR ||= app.getPath("userData");
  process.env.CYCLING_STANDALONE = "electron";
  process.env.CYCLING_WEB_DIR = app.isPackaged
    ? path.join(process.resourcesPath, "dist")
    : path.join(app.getAppPath(), "dist");
  process.env.CYCLING_MIGRATIONS_DIR = app.isPackaged
    ? path.join(process.resourcesPath, "drizzle")
    : path.join(app.getAppPath(), "drizzle");

  const [{ startServer }, { setSecretStore }, { SafeStorageSecretStore }] = await Promise.all([
    import("../server/index"),
    import("../server/platform/secret-store"),
    import("../server/platform/safe-storage-secret-store"),
  ]);
  setSecretStore(new SafeStorageSecretStore(safeStorage));
  const server = startServer(8722);
  localServer = server;
  await once(server, "listening");

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  await createWindow();
}

if (hasSingleInstanceLock) {
  app.setAppUserModelId("com.twozach.cycling-analytics");
  app.on("second-instance", focusMainWindow);
  app.whenReady().then(startDesktopApp).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    const startupDirectory = process.env.CYCLING_DATA_DIR || app.getPath("userData");
    void mkdir(startupDirectory, { recursive: true })
      .then(() => writeFile(path.join(startupDirectory, "startup-error.log"), `${detail}\n`, "utf8"))
      .catch(() => undefined);
    console.error("Cycling Analytics startup failed:", error);
    dialog.showErrorBox("Cycling Analytics could not start", detail.includes("EADDRINUSE")
      ? "Port 8722 is already in use. Close the other Cycling Analytics process and try again."
      : detail);
    app.quit();
  });
}

app.on("before-quit", () => {
  localServer?.close();
  localServer = null;
  void import("../server/platform/db").then(({ closeDb }) => closeDb());
});

app.on("window-all-closed", () => app.quit());
