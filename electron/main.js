const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const zlib = require('zlib');
const url = require('url');
const https = require('https');
const http = require('http');
const { CustomSourceManager, httpRequest } = require('./customSource.js');

// 若 shell 有设置 HTTPS_PROXY/HTTP_PROXY，转成 Chromium 的 --proxy-server 开关，
// 让 electron.net 及渲染进程的 fetch 都走同一个代理
(function applyEnvProxy() {
  const p = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!p) return;
  try {
    const u = new URL(p);
    const host = u.host;
    app.commandLine.appendSwitch('proxy-server', host);
    const bypass = process.env.NO_PROXY || process.env.no_proxy;
    if (bypass) app.commandLine.appendSwitch('proxy-bypass-list', bypass.split(',').join(';'));
  } catch {
    /* 忽略非法代理 URL */
  }
})();

let mainWindow;
let tray = null;
let isQuitting = false;
// 托盘用到的播放状态（由渲染进程同步过来）
let trayState = {
  title: '',
  artist: '',
  isPlaying: false,
  playMode: 'order'
};

const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac', '.opus', '.wma'];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0d0d12',
    title: '远泽音乐播放器',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  // Vite dev: 加载 dev server；生产: 加载打包好的静态文件
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // 关闭时隐藏到托盘（真正退出走 app.quit()/isQuitting）
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  // 显示/隐藏时刷新托盘菜单里的切换项
  mainWindow.on('show', rebuildTrayMenu);
  mainWindow.on('hide', rebuildTrayMenu);
}

// ---------------- 托盘 ----------------
// 生成 16x16 的应用 logo 像素化 PNG（模板图标，macOS 菜单栏自动适配深浅色）
// 图案：左/右 两条对称 path（外角斜下接竖段）+ 中央独立 stem，三元素之间各空 1px —— 对应 logo 主体几何
function buildTrayIconImage() {
  const size = 16;
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA 8-bit

  // 左 path：上半斜段 (2,2)→(4,6) 后接竖段 (4..5, 6..12)，2px 粗
  const onLeftPath = (x, y) => {
    if (y === 2 || y === 3) return x === 2 || x === 3;
    if (y === 4 || y === 5) return x === 3 || x === 4;
    if (y >= 6 && y <= 12) return x === 4 || x === 5;
    return false;
  };
  // 右 path：左 path 沿 x=7.5 镜像
  const onRightPath = (x, y) => onLeftPath(15 - x, y);
  // 中央独立 stem，2px × 5 行（短于左右 path，与 logo 比例一致）
  const onStem = (x, y) => (x === 7 || x === 8) && y >= 6 && y <= 10;

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // 无滤波
    for (let x = 0; x < size; x++) {
      const on = onLeftPath(x, y) || onRightPath(x, y) || onStem(x, y);
      const off = 1 + x * 4;
      row[off] = 255;
      row[off + 1] = 255;
      row[off + 2] = 255;
      row[off + 3] = on ? 255 : 0;
    }
    rows.push(row);
  }
  const idat = zlib.deflateSync(Buffer.concat(rows));
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  const img = nativeImage.createFromBuffer(png);
  if (process.platform === 'darwin') img.setTemplateImage(true);
  return img;
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function playModeLabel(mode) {
  return mode === 'single' ? '单曲循环' : mode === 'random' ? '随机播放' : '列表循环';
}

function rebuildTrayMenu() {
  if (!tray) return;
  const hasTrack = !!trayState.title;
  const nowPlayingLabel = hasTrack
    ? `${trayState.title}${trayState.artist ? ' — ' + trayState.artist : ''}`
    : '当前没有播放';

  const template = [
    { label: nowPlayingLabel, enabled: false },
    { type: 'separator' },
    {
      label: trayState.isPlaying ? '暂停' : '播放',
      click: () => sendToRenderer('tray:cmd', 'toggle')
    },
    { label: '上一首', click: () => sendToRenderer('tray:cmd', 'prev') },
    { label: '下一首', click: () => sendToRenderer('tray:cmd', 'next') },
    { type: 'separator' },
    {
      label: `播放模式：${playModeLabel(trayState.playMode)}`,
      click: () => sendToRenderer('tray:cmd', 'cycleMode')
    },
    { type: 'separator' },
    {
      label: mainWindow && mainWindow.isVisible() ? '隐藏主窗口' : '显示主窗口',
      click: () => {
        if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
        else showMainWindow();
      }
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));

  const tip = hasTrack ? `远泽音乐播放器 · ${nowPlayingLabel}` : '远泽音乐播放器';
  tray.setToolTip(tip);
}

function createTray() {
  if (tray) return;
  tray = new Tray(buildTrayIconImage());
  tray.setToolTip('远泽音乐播放器');
  // 左键点击：显示/隐藏窗口（macOS 下会弹菜单，这里仅对 Windows/Linux 生效）
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }
    if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide();
    else showMainWindow();
  });
  rebuildTrayMenu();
}

// 注册自定义协议，方便加载本地音频文件 (避免 file:// 中文/空格问题)
app.whenReady().then(() => {
  // Windows/Linux 下默认会带一栏 File/Edit/View 菜单，本应用不需要
  Menu.setApplicationMenu(null);
  protocol.registerFileProtocol('localfile', (request, callback) => {
    try {
      const u = decodeURIComponent(request.url.replace('localfile://', ''));
      callback({ path: u });
    } catch (e) {
      callback({ error: -2 /* net::FAILED */ });
    }
  });
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // 有托盘驻留时，即便窗口全部关闭也保持应用存活
  if (process.platform !== 'darwin' && !tray) app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showMainWindow();
});

// ---------------- 托盘相关 IPC ----------------
ipcMain.handle('tray:updateState', (_e, state) => {
  if (state && typeof state === 'object') {
    trayState = {
      title: state.title || '',
      artist: state.artist || '',
      isPlaying: !!state.isPlaying,
      playMode: state.playMode || 'order'
    };
    rebuildTrayMenu();
  }
  return true;
});

// ---------------- 文件夹选择 ----------------
ipcMain.handle('app:selectFolder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择音乐文件夹'
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
});

// ---------------- 递归扫描文件 ----------------
async function walk(dir, depth = 0) {
  if (depth > 8) return [];
  const out = [];
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const sub = await walk(full, depth + 1);
      out.push(...sub);
    } else if (AUDIO_EXTS.includes(path.extname(ent.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

ipcMain.handle('app:scanFolder', async (_e, dir) => {
  if (!dir) return [];
  const files = await walk(dir);

  // 动态加载 music-metadata（ESM 模块）
  let mm = null;
  try {
    mm = await import('music-metadata');
  } catch (e) {
    console.warn('music-metadata 未安装或加载失败:', e.message);
  }

  const tracks = [];
  for (const file of files) {
    const base = path.basename(file, path.extname(file));
    let title = base;
    let artist = '未知艺术家';
    let album = '';
    let duration = 0;
    let picture = null;

    if (mm) {
      try {
        const meta = await mm.parseFile(file, { duration: true });
        title = (meta.common.title || base).trim();
        artist =
          (Array.isArray(meta.common.artists) && meta.common.artists.length
            ? meta.common.artists.join(', ')
            : meta.common.artist) || '未知艺术家';
        album = meta.common.album || '';
        duration = Math.floor(meta.format.duration || 0);
        if (meta.common.picture && meta.common.picture[0]) {
          const pic = meta.common.picture[0];
          picture = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`;
        }
      } catch (e) {
        /* ignore */
      }
    }

    tracks.push({
      id: 'local::' + Buffer.from(file).toString('base64').slice(0, 32) + '::' + base,
      type: 'local',
      title,
      artist,
      album,
      duration,
      picture,
      filePath: file,
      url: 'localfile://' + encodeURIComponent(file)
    });
  }
  return tracks;
});

// ---------------- 简易持久化 (避免引入 electron-store 依赖问题，用 JSON 文件) ----------------
const storeFile = path.join(app.getPath('userData'), 'player-store.json');

function readStore() {
  try {
    if (!fs.existsSync(storeFile)) return {};
    return JSON.parse(fs.readFileSync(storeFile, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function writeStore(data) {
  try {
    fs.writeFileSync(storeFile, JSON.stringify(data, null, 2));
  } catch (e) {}
}

ipcMain.handle('store:get', (_e, key) => {
  const s = readStore();
  return key ? s[key] : s;
});

ipcMain.handle('store:set', (_e, key, value) => {
  const s = readStore();
  s[key] = value;
  writeStore(s);
  return true;
});

// ---------------- 自定义源 ----------------
// 所有源（含搜索/解析）都通过 install*From* 接口由用户手动导入；
// 样例脚本见仓库根目录 sample-sources/。
const customSourceManager = new CustomSourceManager({ readStore, writeStore });

ipcMain.handle('customSource:list', () => customSourceManager.list());

ipcMain.handle('customSource:importFile', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: '选择自定义源脚本',
    filters: [{ name: 'JavaScript', extensions: ['js', 'txt'] }]
  });
  if (r.canceled || r.filePaths.length === 0) return { ok: false, canceled: true };
  try {
    const entry = await customSourceManager.installFromFile(r.filePaths[0]);
    return { ok: true, entry };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('customSource:importUrl', async (_e, url) => {
  if (!url || typeof url !== 'string') return { ok: false, error: '缺少 URL' };
  try {
    const entry = await customSourceManager.installFromUrl(url);
    return { ok: true, entry };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('customSource:remove', (_e, id) => {
  return customSourceManager.remove(id);
});

ipcMain.handle('customSource:reload', async (_e, id) => {
  if (!id || typeof id !== 'string') return { ok: false, error: '缺少 id' };
  try {
    const r = await customSourceManager.reload(id);
    return { ok: true, entry: r.entry, source: r.source };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('customSource:setEnabled', (_e, id, enabled) => {
  return customSourceManager.setEnabled(id, enabled);
});

ipcMain.handle('customSource:resolveMusicUrl', (_e, payload) => {
  return customSourceManager.resolveMusicUrl(payload || {});
});

ipcMain.handle('customSource:dispatch', (_e, payload) => {
  return customSourceManager.dispatch(payload || {});
});

// ---------------- 通用 HTTP 请求（给渲染进程绕过 CORS / 混合内容） ----------------
// 业务逻辑（URL 拼装、解析）放在渲染侧；主进程只提供透明代理。
ipcMain.handle('app:httpRequest', async (_e, opts = {}) => {
  const { url: reqUrl, method, headers, body, timeout, responseType } = opts;
  if (!reqUrl || typeof reqUrl !== 'string') {
    return { ok: false, error: '缺少 url' };
  }
  try {
    const res = await httpRequest(reqUrl, { method, headers, body, timeout });
    // responseType='base64' 用于拿二进制响应（如加密歌词）；默认按 utf-8 文本返回
    const bodyOut = responseType === 'base64' ? res.body.toString('base64') : res.body.toString('utf-8');
    return { ok: true, statusCode: res.statusCode, headers: res.headers, body: bodyOut };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// ---------------- 下载 ----------------
function sanitizeFilename(name) {
  return (
    String(name || 'untitled')
      .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'untitled'
  );
}

function getExtFromUrl(u) {
  try {
    const p = new URL(u).pathname;
    const ext = path.extname(p).toLowerCase();
    if (AUDIO_EXTS.includes(ext)) return ext;
  } catch (e) {
    /* ignore */
  }
  return '.mp3';
}

function downloadStream(reqUrl, savePath, onProgress, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = reqUrl.startsWith('https://') ? https : http;
    const req = lib.get(reqUrl, (res) => {
      // 跟随 3xx 跳转
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        if (redirectsLeft <= 0) {
          res.resume();
          return reject(new Error('Too many redirects'));
        }
        const next = res.headers.location;
        if (!next) {
          res.resume();
          return reject(new Error('Redirect with no location'));
        }
        res.resume();
        downloadStream(next, savePath, onProgress, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }

      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      let lastReport = 0;

      const file = fs.createWriteStream(savePath);
      res.on('data', (chunk) => {
        received += chunk.length;
        const now = Date.now();
        if (onProgress && now - lastReport > 150) {
          lastReport = now;
          onProgress(received, total);
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        if (onProgress) onProgress(received, total);
        file.close((err) => (err ? reject(err) : resolve()));
      });
      file.on('error', (err) => {
        try {
          fs.unlinkSync(savePath);
        } catch (e) {}
        reject(err);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error('Request timeout'));
    });
  });
}

function getDownloadDir() {
  const s = readStore();
  return s.downloadDir || path.join(app.getPath('downloads'), 'YZMusic');
}

ipcMain.handle('app:getDownloadDir', () => getDownloadDir());

ipcMain.handle('app:chooseDownloadDir', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择默认下载文件夹'
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  const dir = r.filePaths[0];
  const s = readStore();
  s.downloadDir = dir;
  writeStore(s);
  return dir;
});

ipcMain.handle('app:download', async (_e, { id, url: srcUrl, suggestedName }) => {
  if (!srcUrl) return { ok: false, error: '缺少下载地址' };
  try {
    const dir = getDownloadDir();
    await fsp.mkdir(dir, { recursive: true });

    const ext = getExtFromUrl(srcUrl);
    let base = sanitizeFilename(suggestedName || 'untitled');
    if (!base.toLowerCase().endsWith(ext)) base += ext;

    // 同名时自动加 (n)
    let savePath = path.join(dir, base);
    let n = 1;
    while (fs.existsSync(savePath)) {
      const stem = base.slice(0, -ext.length);
      savePath = path.join(dir, `${stem} (${n})${ext}`);
      n++;
      if (n > 999) break;
    }

    await downloadStream(srcUrl, savePath, (received, total) => {
      mainWindow?.webContents.send('download:progress', { id, received, total });
    });
    return { ok: true, path: savePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('app:showInFolder', (_e, p) => {
  if (p && fs.existsSync(p)) {
    shell.showItemInFolder(p);
    return true;
  }
  return false;
});

// 把文件移到系统回收站（比直接 unlink 更安全，可恢复）
ipcMain.handle('app:trashFile', async (_e, p) => {
  if (!p) return { ok: false, error: '路径为空' };
  try {
    if (!fs.existsSync(p)) return { ok: false, error: '文件不存在' };
    await shell.trashItem(p);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// 在系统资源管理器中打开文件夹
ipcMain.handle('app:openPath', async (_e, p) => {
  if (!p) return false;
  try {
    if (!fs.existsSync(p)) {
      // 不存在时创建（下载目录尚未真正用到时常发生）
      await fsp.mkdir(p, { recursive: true });
    }
    const res = await shell.openPath(p);
    return res === '';
  } catch (e) {
    return false;
  }
});
