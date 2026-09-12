/**
 * Windows kabuğu: pencere, tepsi simgesi ve arka plan bildirim zamanlayıcısı.
 *
 * Pencere kapatıldığında uygulama çıkmaz, tepside çalışmaya devam eder —
 * hatırlatmaların düşmesi buna bağlı.
 */
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  shell,
  Tray,
} from 'electron';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { read, update, write, type Database } from './store';

/**
 * Paketlenmiş sürümde konsol görünmediği için günlük dosyaya yazılır:
 * %APPDATA%/timeless/timeless.log
 */
function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}
`;
  try {
    appendFileSync(join(app.getPath('userData'), 'timeless.log'), line);
  } catch {
    /* günlük yazılamadıysa sessiz geç */
  }
  if (!app.isPackaged) console.log(message.trim());
}

/** Renderer'dan gelen, gösterilmeyi bekleyen hatırlatma. */
interface Reminder {
  id: string;
  kind: string;
  date: string;
  time: string;
  title: string;
  body: string;
}

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

/** Bekleyen hatırlatmalar ve daha önce gösterilenler. */
let reminders: Reminder[] = [];
const shown = new Set<string>();

function reminderTime(reminder: Reminder): number {
  const [year, month, day] = reminder.date.split('-').map(Number);
  const [hour, minute] = reminder.time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function showNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  if (isDev) console.log(`[timeless] bildirim: ${title}`);
  const notification = new Notification({ title, body, silent: false });
  notification.on('click', () => showWindow());
  notification.show();
}

/**
 * Her yarım dakikada bir zamanı gelenleri gösterir.
 * setTimeout yerine tarama kullanılıyor: uzun beklemelerde (25 günü aşan
 * setTimeout sınırı) ve bilgisayar uykudan döndüğünde güvenilir olan bu.
 */
function tick(): void {
  const now = Date.now();
  for (const reminder of reminders) {
    if (shown.has(reminder.id)) continue;
    const at = reminderTime(reminder);
    // Çok eskiyse (ör. bilgisayar kapalıydı) rahatsız etme, sadece işaretle
    if (at > now) continue;
    shown.add(reminder.id);
    if (now - at < 6 * 60 * 60 * 1000) showNotification(reminder.title, reminder.body);
  }
  updateTray();
}

function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function updateTray(): void {
  if (!tray) return;
  const today = todayISO();
  const todayCount = reminders.filter((r) => r.date === today && !shown.has(r.id)).length;
  tray.setToolTip(
    todayCount > 0
      ? `Timeless — bugün ${todayCount} hatırlatma bekliyor`
      : 'Timeless — ödeme asistanı',
  );
}

function showWindow(): void {
  if (!win) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray(): void {
  // Simge dosyası paketlemede eklenecek; yoksa boş simgeyle devam
  const icon = nativeImage.createFromPath(join(__dirname, 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Timeless’ı aç', click: showWindow },
      { type: 'separator' },
      {
        label: 'Windows ile birlikte başlat',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        // --hidden: açılışta pencere değil, doğrudan tepside başlasın
        click: (item) =>
          app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] }),
      },
      { type: 'separator' },
      {
        label: 'Çıkış',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showWindow);
  updateTray();
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    // Windows'un beyaz başlık çubuğu yerine uygulamanın kendi çubuğu
    frame: false,
    title: 'Timeless — Ödeme Asistanı',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const indexPath = join(__dirname, '../dist/index.html');
  log(`pencere kuruldu — ${isDev ? DEV_URL : indexPath}`);

  win.webContents.on('did-fail-load', (_e, code, description, url) => {
    log(`YÜKLENEMEDİ (${code}) ${description} — ${url}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    log(`RENDERER ÇÖKTÜ: ${details.reason}`);
  });
  win.once('ready-to-show', () => {
    log('pencere gösterilmeye hazır');
    win?.show();
  });

  if (isDev) void win.loadURL(DEV_URL).catch((error) => log(`loadURL hatası: ${String(error)}`));
  else void win.loadFile(indexPath).catch((error) => log(`loadFile hatası: ${String(error)}`));

  // Pencereyi kapatmak uygulamayı kapatmaz — zamanlayıcı tepside sürer
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win?.hide();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* ----------------------------- IPC ----------------------------- */

function registerIpc(): void {
  ipcMain.handle('db:read', () => read());
  ipcMain.handle('db:write', (_event, data: Database) => {
    write(data);
    return true;
  });
  ipcMain.handle('db:patch', (_event, patch: Partial<Database>) => {
    return update((data) => Object.assign(data, patch));
  });

  ipcMain.handle('notify:schedule', (_event, list: Reminder[]) => {
    // Önce mevcut listeyi işle: yeni liste geçmiş hatırlatmaları içermediği
    // için, tam o anda zamanı gelmiş bir bildirim aradan kaybolabilirdi.
    tick();
    reminders = Array.isArray(list) ? list : [];
    if (isDev) console.log(`[timeless] ${reminders.length} hatırlatma zamanlandı`);
    // `shown` bilerek temizlenmiyor: aynı bildirim yeniden zamanlansa bile
    // ikinci kez çıkmamalı.
    tick();
    return true;
  });
  ipcMain.handle('notify:cancel', () => {
    reminders = [];
    updateTray();
    return true;
  });
  ipcMain.handle('notify:now', (_event, title: string, body: string) => {
    showNotification(title, body);
    return true;
  });
  // Kendi başlık çubuğumuzun düğmeleri
  ipcMain.handle('win:minimize', () => {
    win?.minimize();
    return true;
  });
  ipcMain.handle('win:toggleMaximize', () => {
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('win:close', () => {
    // Kapatmak uygulamayı sonlandırmaz; tepside çalışmaya devam eder
    win?.hide();
    return true;
  });
  ipcMain.handle('win:isMaximized', () => win?.isMaximized() ?? false);

  ipcMain.handle('app:openPath', (_event, path: string) => shell.openPath(path));
  ipcMain.handle('app:showItemInFolder', (_event, path: string) => {
    shell.showItemInFolder(path);
    return true;
  });
}

/* ---------------------------- Yaşam döngüsü ---------------------------- */

const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  process.on('uncaughtException', (error) => log(`YAKALANMAYAN HATA: ${String(error)}`));

  void app.whenReady().then(() => {
    log(`uygulama hazır — paketli: ${app.isPackaged}`);
    app.setAppUserModelId('com.timeless.app');
    registerIpc();
    createWindow();
    createTray();
    setInterval(tick, 30_000);
  });

  app.on('window-all-closed', () => {
    // Tepside kalmaya devam: bildirimler pencere kapalıyken de çıkmalı
  });

  app.on('activate', showWindow);
  app.on('before-quit', () => {
    quitting = true;
  });
}
