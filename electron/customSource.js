// 自定义源管理：兼容 lxmusic 桌面端自定义源脚本（globalThis.lx API）
// 参考：https://lxmusic.toside.cn/desktop/custom-source
const vm = require('vm');
const crypto = require('crypto');
const zlib = require('zlib');
const https = require('https');
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;

// 在 Electron 主进程中运行时，用 electron.net（自动走系统代理、处理 HTTP/2）。
// 独立运行（如测试脚本）时回退到 https/http。
let electronNet = null;
try {
  electronNet = require('electron').net;
} catch {
  /* non-electron */
}

// 简易 HTTP 请求封装，自动跟随 3xx。resolve 结果含 { statusCode, headers, body:Buffer }
function httpRequest(url, opts = {}) {
  const method = String(opts.method || 'GET').toUpperCase();
  const headers = Object.assign({}, opts.headers || {});
  const body = opts.body || null;
  const timeout = opts.timeout || 30000;
  const maxRedirects = opts.maxRedirects ?? 5;

  return new Promise((resolve, reject) => {
    const run = (u, redirectsLeft) => {
      let req;
      const onResponse = (res) => {
        const status = res.statusCode;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
          res.resume?.();
          const next = new URL(res.headers.location, u).toString();
          run(next, redirectsLeft - 1);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () =>
          resolve({
            statusCode: status,
            headers: res.headers,
            body: Buffer.concat(chunks)
          })
        );
        res.on('error', reject);
      };

      if (electronNet) {
        req = electronNet.request({ method, url: u, redirect: 'manual' });
        Object.entries(headers).forEach(([k, v]) => req.setHeader(k, v));
        req.on('response', onResponse);
        req.on('error', reject);
        if (body) req.write(Buffer.isBuffer(body) ? body : Buffer.from(body));
        req.end();
        // electron.net 没有 setTimeout，用全局 timer
        const timer = setTimeout(() => {
          try {
            req.abort();
          } catch {}
          reject(new Error('请求超时'));
        }, timeout);
        req.on('response', () => clearTimeout(timer));
        req.on('error', () => clearTimeout(timer));
      } else {
        const parsed = new URL(u);
        const lib = parsed.protocol === 'https:' ? https : http;
        req = lib.request(u, { method, headers }, onResponse);
        req.on('error', reject);
        req.setTimeout(timeout, () => req.destroy(new Error('请求超时')));
        if (body) req.write(Buffer.isBuffer(body) ? body : Buffer.from(body));
        req.end();
      }
    };
    run(url, maxRedirects);
  });
}

// ---------- JSDoc 元信息解析 ----------
function parseScriptInfo(raw) {
  const info = { name: '', description: '', version: '', author: '', homepage: '', rawScript: raw };
  // 兼容 /** ... */（JSDoc）与 /*! ... */（banner 注释），取第一个包含 @ 标签的块注释
  const re = /\/\*[\s\S]*?\*\//g;
  let block = null;
  let m;
  while ((m = re.exec(raw)) !== null) {
    if (/@(name|version|author|description|homepage)\b/i.test(m[0])) {
      block = m[0];
      break;
    }
  }
  if (!block) return info;
  const pick = (tag) => {
    const re = new RegExp('@' + tag + '\\s+([^\\n\\r]+)', 'i');
    const mm = block.match(re);
    return mm ? mm[1].trim() : '';
  };
  info.name = pick('name');
  info.description = pick('description');
  info.version = pick('version');
  info.author = pick('author');
  info.homepage = pick('homepage');
  return info;
}

// ---------- lx.request：走 Electron net，绕过 CORS + 自动应用系统代理 ----------
// 记录每个脚本最近一次响应，resolveMusicUrl 失败时可以回溯打印
function makeLxRequest(scriptName, recorder) {
  const tag = `[custom-source:${scriptName || 'unknown'}]`;
  return function lxRequest(url, options, callback) {
    const opts = options || {};
    const method = String(opts.method || 'GET').toUpperCase();
    const headers = Object.assign({}, opts.headers || {});
    let body = opts.body;
    if (opts.form && typeof opts.form === 'object') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
      body = Object.entries(opts.form)
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
        .join('&');
    }
    if (body && typeof body === 'object' && !(body instanceof Buffer)) {
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    const t0 = Date.now();
    console.log(`${tag} → ${method} ${url}`);
    // 请求头
    const reqHeaderKeys = Object.keys(headers);
    if (reqHeaderKeys.length) {
      for (const k of reqHeaderKeys) {
        console.log(`${tag}   req-header: ${k}: ${headers[k]}`);
      }
    }
    // 请求体
    if (body) {
      const reqBodyText = Buffer.isBuffer(body) ? `<binary ${body.length}B>` : String(body);
      const reqPreview = reqBodyText.length > 1024 ? reqBodyText.slice(0, 1024) + '…(截断)' : reqBodyText;
      console.log(`${tag}   req-body: ${reqPreview}`);
    }

    httpRequest(url, {
      method,
      headers,
      body,
      timeout: opts.timeout || 15000
    }).then(
      (res) => {
        const ms = Date.now() - t0;
        const len = res.body ? res.body.length : 0;
        console.log(`${tag} ← ${res.statusCode} ${method} ${url} (${len}B, ${ms}ms)`);
        // 响应头
        if (res.headers && typeof res.headers === 'object') {
          for (const [k, v] of Object.entries(res.headers)) {
            const val = Array.isArray(v) ? v.join(', ') : String(v);
            console.log(`${tag}   resp-header: ${k}: ${val}`);
          }
        }

        const ct = String(res.headers['content-type'] || '').toLowerCase();
        const text = res.body.toString('utf-8');
        let parsed;
        // 很多脚本后端不设 content-type，这里先按 JSON 尝试，失败再按 content-type 分类
        const trimmed = text.trim();
        if (trimmed && (trimmed[0] === '{' || trimmed[0] === '[')) {
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            /* not JSON */
          }
        }
        if (parsed === undefined) {
          if (ct.includes('application/json')) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = text;
            }
          } else if (ct.includes('text') || ct.includes('xml') || ct.includes('javascript')) {
            parsed = text;
          } else {
            parsed = res.body;
          }
        }
        // 响应 body 预览（非 2xx 完整打 1KB，2xx 打 512B 摘要）
        const isText = typeof parsed === 'string' || (parsed && typeof parsed === 'object' && !Buffer.isBuffer(parsed));
        if (isText) {
          const show = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          const isErr = res.statusCode < 200 || res.statusCode >= 300;
          const limit = isErr ? 1024 : 512;
          const preview = show.length > limit ? show.slice(0, limit) + '…(截断)' : show;
          (isErr ? console.warn : console.log)(`${tag}   resp-body: ${preview}`);
        } else if (Buffer.isBuffer(parsed)) {
          console.log(`${tag}   resp-body: <binary ${parsed.length}B>`);
        }
        if (recorder) recorder({ url, method, statusCode: res.statusCode, body: text });
        // 酷我解析接口即便拿不到可播 URL，也会返回 200 + { code:0, msg:"无法获取播放链接！", url:"…" }，
        // 这里的 url 通常是过期/失效地址，脚本如果直接取会产出一个无法播放的链接。显式当作失败。
        if (
          parsed &&
          typeof parsed === 'object' &&
          !Buffer.isBuffer(parsed) &&
          typeof parsed.msg === 'string' &&
          parsed.msg.includes('无法获取播放链接')
        ) {
          const err = new Error(parsed.msg);
          console.warn(`${tag}   resp 判定为失败：${parsed.msg}`);
          try {
            callback(err);
          } catch {
            /* ignore handler error */
          }
          return;
        }
        // 兼容两种回调约定：
        //   (err, resp, body)            —— resp = { statusCode, headers, body }
        //   (err, { body, statusCode })  —— 脚本从 resp 里取 body
        const respObj = { statusCode: res.statusCode, headers: res.headers, body: parsed };
        try {
          callback(null, respObj, parsed);
        } catch {
          /* ignore handler error */
        }
      },
      (err) => {
        const ms = Date.now() - t0;
        console.warn(`${tag} ✗ ${method} ${url} (${ms}ms) → ${err.message || err}`);
        try {
          callback(err);
        } catch {}
      }
    );
  };
}

// ---------- lx.utils ----------
const lxUtils = {
  buffer: {
    from: (...args) => Buffer.from(...args),
    bufToString: (buf, format) => Buffer.from(buf).toString(format || 'utf8')
  },
  crypto: {
    md5: (data) =>
      crypto
        .createHash('md5')
        .update(typeof data === 'string' ? data : Buffer.from(data))
        .digest('hex'),
    randomBytes: (size) => crypto.randomBytes(size),
    aesEncrypt: (buffer, mode, key, iv) => {
      const cipher = crypto.createCipheriv(mode, key, iv || null);
      return Buffer.concat([cipher.update(buffer), cipher.final()]);
    },
    rsaEncrypt: (buffer, publicKey) => {
      return crypto.publicEncrypt(
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
      );
    }
  },
  zlib: {
    inflate: (buf) =>
      new Promise((resolve, reject) => {
        zlib.inflate(buf, (err, result) => (err ? reject(err) : resolve(result)));
      }),
    deflate: (buf) =>
      new Promise((resolve, reject) => {
        zlib.deflate(buf, (err, result) => (err ? reject(err) : resolve(result)));
      })
  }
};

// ---------- 单个脚本运行时 ----------
class LoadedSource {
  constructor(script) {
    this.script = script;
    this.info = parseScriptInfo(script);
    this.listeners = {};
    this.sources = {};
    this.inited = false;
    this.sandbox = null;
    this.lastResponse = null;
  }

  async load() {
    const self = this;
    const EVENT_NAMES = {
      inited: 'inited',
      request: 'request',
      updateAlert: 'updateAlert'
    };
    const lx = {
      version: '2.0.0',
      env: 'desktop',
      currentScriptInfo: Object.assign({}, this.info),
      EVENT_NAMES,
      on(event, handler) {
        self.listeners[event] = handler;
      },
      send(event, data) {
        if (event === EVENT_NAMES.inited) {
          self.sources = (data && data.sources) || {};
          self.inited = true;
        }
      },
      request: makeLxRequest(this.info.name || 'unknown', (r) => {
        self.lastResponse = r;
      }),
      utils: lxUtils
    };

    // 一些脚本通过 process.versions.electron 等字段判断运行环境，
    // 这里暴露最小子集，避免它们判失败后走奇怪分支
    const fakeProcess = {
      platform: process.platform,
      versions: Object.assign({}, process.versions),
      env: {},
      nextTick: (fn, ...args) => process.nextTick(fn, ...args)
    };

    const csTag = '[custom-source:' + (this.info.name || 'unknown') + ']';
    const sandbox = {
      console: {
        log: (...a) => console.log(csTag, ...a),
        warn: (...a) => console.warn(csTag, ...a),
        error: (...a) => console.error(csTag, ...a),
        info: (...a) => console.info(csTag, ...a),
        debug: (...a) => console.debug(csTag, ...a),
        trace: (...a) => console.log(csTag, ...a),
        dir: (...a) => console.log(csTag, ...a),
        table: (...a) => console.log(csTag, ...a),
        group: (...a) => console.log(csTag, ...a),
        groupCollapsed: (...a) => console.log(csTag, ...a),
        groupEnd: () => {},
        time: () => {},
        timeEnd: () => {},
        timeLog: () => {},
        count: () => {},
        countReset: () => {},
        assert: () => {},
        clear: () => {}
      },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      setImmediate,
      clearImmediate,
      queueMicrotask,
      Promise,
      Buffer,
      URL,
      URLSearchParams,
      TextDecoder,
      TextEncoder,
      process: fakeProcess,
      lx
    };
    sandbox.globalThis = sandbox;
    sandbox.global = sandbox;
    // 捕获脚本内未处理的异步异常，抛给调用方
    let asyncError = null;
    sandbox.__onAsyncError = (e) => {
      asyncError = e;
    };
    vm.createContext(sandbox);
    this.sandbox = sandbox;

    // 捕获脚本异步路径里的未处理异常（通常是脚本自己的完整性 / 响应解析失败）
    const onUnhandled = (reason) => {
      if (!asyncError) asyncError = reason;
    };
    const onUncaught = (err) => {
      if (!asyncError) asyncError = err;
    };
    process.on('unhandledRejection', onUnhandled);
    process.on('uncaughtException', onUncaught);

    try {
      try {
        vm.runInContext(this.script, sandbox, {
          filename: (this.info.name || 'custom-source') + '.js',
          timeout: 10000
        });
      } catch (e) {
        throw new Error('脚本执行出错：' + (e.message || String(e)));
      }

      // 等待 inited 事件（最多 10s）
      const start = Date.now();
      while (!this.inited && !asyncError && Date.now() - start < 10000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (asyncError) {
        const msg = asyncError.message || String(asyncError);
        throw new Error('脚本执行出错：' + msg);
      }
      if (!this.inited) {
        throw new Error('脚本未在 10 秒内触发 inited 事件（可能与本播放器环境不兼容或远程 API 不通）');
      }
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
      process.removeListener('uncaughtException', onUncaught);
    }
  }

  async handleRequest(action, sourceKey, info) {
    const handler = this.listeners.request;
    if (typeof handler !== 'function') {
      throw new Error('脚本未注册 request 处理器');
    }
    const result = await Promise.resolve(
      handler({
        source: sourceKey,
        action,
        info
      })
    );
    return result;
  }
}

function dumpLastResponse(tag, lastResp) {
  if (!lastResp) return;
  const body = lastResp.body || '';
  const preview = body.length > 1024 ? body.slice(0, 1024) + '…(截断)' : body;
  console.warn(`${tag}   最后一次远端响应: ${lastResp.method} ${lastResp.url} → ${lastResp.statusCode}`);
  console.warn(`${tag}   body: ${preview}`);
}

// ---------- 管理器（持久化 + 生命周期） ----------
class CustomSourceManager {
  constructor({ readStore, writeStore }) {
    this.readStore = readStore;
    this.writeStore = writeStore;
    this.runtime = new Map(); // id -> LoadedSource
  }

  _readAll() {
    const s = this.readStore();
    return Array.isArray(s.customSources) ? s.customSources : [];
  }

  _writeAll(list) {
    const s = this.readStore();
    s.customSources = list;
    this.writeStore(s);
  }

  list() {
    return this._readAll().map(({ script, ...rest }) => rest);
  }

  async install(script, origin = 'local') {
    if (typeof script !== 'string' || !script.trim()) {
      throw new Error('脚本内容为空');
    }
    const info = parseScriptInfo(script);
    if (!info.name) throw new Error('脚本缺少 @name 元信息');

    const loaded = new LoadedSource(script);
    await loaded.load();

    const id = info.name;
    const entry = {
      id,
      name: info.name,
      description: info.description,
      version: info.version,
      author: info.author,
      homepage: info.homepage,
      origin,
      enabled: true,
      sources: loaded.sources,
      installedAt: Date.now(),
      script
    };

    const list = this._readAll().filter((e) => e.id !== id);
    list.push(entry);
    this._writeAll(list);

    this.runtime.set(id, loaded);
    const { script: _drop, ...safe } = entry;
    return safe;
  }

  async installFromUrl(url) {
    const res = await httpRequest(url, { method: 'GET', timeout: 30000 });
    if (res.statusCode !== 200) throw new Error('HTTP ' + res.statusCode);
    const script = res.body.toString('utf-8');
    return this.install(script, url);
  }

  async installFromFile(filePath) {
    const script = await fsp.readFile(filePath, 'utf-8');
    return this.install(script, filePath);
  }

  remove(id) {
    const list = this._readAll().filter((e) => e.id !== id);
    this._writeAll(list);
    this.runtime.delete(id);
    return true;
  }

  setEnabled(id, enabled) {
    const list = this._readAll();
    const entry = list.find((e) => e.id === id);
    if (!entry) return false;
    entry.enabled = !!enabled;
    this._writeAll(list);
    if (!enabled) this.runtime.delete(id);
    return true;
  }

  async _ensureRuntime(entry) {
    if (this.runtime.has(entry.id)) return this.runtime.get(entry.id);
    if (!entry.script) throw new Error('脚本尚未加载：' + entry.id);
    const loaded = new LoadedSource(entry.script);
    await loaded.load();
    this.runtime.set(entry.id, loaded);
    return loaded;
  }

  // 返回所有声明了 sourceKey/action 的已启用脚本，顺序与用户 store 中的安装顺序一致。
  // 调用方按顺序尝试，失败则降级到下一个。
  _findEntriesForAction(sourceKey, action) {
    return this._readAll().filter((e) => {
      if (!e.enabled) return false;
      const s = e.sources && e.sources[sourceKey];
      return s && Array.isArray(s.actions) && s.actions.includes(action);
    });
  }

  // 通用 action 派发：用于 musicSearch / lyric / album / artistInfo / artistAlbums 等。
  // resolveMusicUrl 因为有 action-特定的成功判定（脚本必须返回非空 URL 才算成功），独立保留。
  async dispatch({ sourceKey, action, info }) {
    const entries = this._findEntriesForAction(sourceKey, action);
    if (!entries.length) {
      console.log(`[custom-source] ${action} ${sourceKey} → 无启用的源`);
      return { ok: false, error: 'no-source' };
    }
    const errors = [];
    for (const entry of entries) {
      const tag = `[custom-source:${entry.name}]`;
      const t0 = Date.now();
      console.log(`${tag} ${action} ${sourceKey} 开始…`);
      try {
        const loaded = await this._ensureRuntime(entry);
        loaded.lastResponse = null;
        const data = await loaded.handleRequest(action, sourceKey, info || {});
        console.log(`${tag} ${action} ${sourceKey} ✓ (${Date.now() - t0}ms)`);
        return { ok: true, data };
      } catch (e) {
        console.warn(`${tag} ${action} ${sourceKey} ✗ (${Date.now() - t0}ms) → ${e.message || e}`);
        dumpLastResponse(tag, this.runtime.get(entry.id)?.lastResponse);
        errors.push(`${entry.name}: ${e.message || e}`);
      }
    }
    return { ok: false, error: errors.join('; ') || 'all-failed' };
  }

  async resolveMusicUrl({ sourceKey, quality, musicInfo }) {
    const q = quality || '320k';
    const songId = musicInfo?.songmid || musicInfo?.id || musicInfo?.hash || '?';
    const entries = this._findEntriesForAction(sourceKey, 'musicUrl');
    if (!entries.length) {
      console.log(`[custom-source] musicUrl ${sourceKey}/${q} id=${songId} → 无启用的源`);
      return { ok: false, error: 'no-source' };
    }
    const errors = [];
    for (const entry of entries) {
      const tag = `[custom-source:${entry.name}]`;
      const t0 = Date.now();
      console.log(`${tag} musicUrl ${sourceKey}/${q} id=${songId} 开始解析…`);
      try {
        const loaded = await this._ensureRuntime(entry);
        loaded.lastResponse = null;
        const url = await loaded.handleRequest('musicUrl', sourceKey, {
          type: q,
          musicInfo
        });
        const ms = Date.now() - t0;
        if (typeof url !== 'string' || !url) {
          console.warn(`${tag} musicUrl ${sourceKey}/${q} id=${songId} ✗ 脚本未返回有效 URL (${ms}ms)`);
          dumpLastResponse(tag, loaded.lastResponse);
          errors.push(`${entry.name}: 脚本未返回有效的 URL`);
          continue;
        }
        console.log(`${tag} musicUrl ${sourceKey}/${q} id=${songId} ✓ (${ms}ms) → ${url}`);
        return { ok: true, url };
      } catch (e) {
        const ms = Date.now() - t0;
        console.warn(`${tag} musicUrl ${sourceKey}/${q} id=${songId} ✗ (${ms}ms) → ${e.message || e}`);
        dumpLastResponse(tag, this.runtime.get(entry.id)?.lastResponse);
        errors.push(`${entry.name}: ${e.message || e}`);
      }
    }
    return { ok: false, error: errors.join('; ') || 'all-failed' };
  }
}

module.exports = { CustomSourceManager, httpRequest };
