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

// ---------- 纯 JS 3DES-ECB (LDDC / QQMusic QRC 变体) ----------
// 不是 NIST 标准 DES：QQMusic 的 QRC 用了一套定制 S-box 以及把每个
// 32-bit 字内字节顺序反过来的 bit 编址（参考 LDDC、SPlayer、ikun-music
// 的实现）。OpenSSL 的 'des-ede3-ecb' 对它无效；标准 3DES 也对不上号。
//
// 这里直接 1:1 移植 LDDC 的 tripledes（TS 版来自 SPlayer 的 qqmusic 模块）：
//   - sbox 表略偏离 FIPS 46-3（位置 [1][23] / [3][52] 等），照搬即可
//   - bitnum 用 (b/32)*4 + 3 - (b%32)/8 的字节索引取值，等价于把每个
//     8 字节块按两组 4 字节小端拼接后再做位提取
//   - 三轮 EDE：解密时顺序 D_K3 → E_K2 → D_K1
// 加上 NIST 标准的 DES 兜底（命名 standardDesEcbDecrypt 已让 OpenSSL 处理），
// 这里只暴露 QRC 版本作为 desDecrypt 的 fallback 入口。
const tripleDesEcbDecrypt = (() => {
  const ENCRYPT = 1;
  const DECRYPT = 0;

  // S-box 表（LDDC 自带的 QQMusic 定制版本，注意与 FIPS 标准略异）
  const sbox = [
    [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
    [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
    [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
    [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
    [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
    [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
    [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
    [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11]
  ];

  function bitnum(a, b, c) {
    const byteIndex = Math.floor(b / 32) * 4 + 3 - Math.floor((b % 32) / 8);
    return ((a[byteIndex] >> (7 - (b % 8))) & 1) << c;
  }
  function bitnumIntr(a, b, c) {
    return ((a >>> (31 - b)) & 1) << c;
  }
  function bitnumIntl(a, b, c) {
    return (((a << b) & 0x80000000) >>> c) >>> 0;
  }
  function sboxBit(a) {
    return (a & 32) | ((a & 31) >> 1) | ((a & 1) << 4);
  }

  function initialPermutation(inputData) {
    const s0 = (
      bitnum(inputData, 57, 31) | bitnum(inputData, 49, 30) | bitnum(inputData, 41, 29) | bitnum(inputData, 33, 28) |
      bitnum(inputData, 25, 27) | bitnum(inputData, 17, 26) | bitnum(inputData,  9, 25) | bitnum(inputData,  1, 24) |
      bitnum(inputData, 59, 23) | bitnum(inputData, 51, 22) | bitnum(inputData, 43, 21) | bitnum(inputData, 35, 20) |
      bitnum(inputData, 27, 19) | bitnum(inputData, 19, 18) | bitnum(inputData, 11, 17) | bitnum(inputData,  3, 16) |
      bitnum(inputData, 61, 15) | bitnum(inputData, 53, 14) | bitnum(inputData, 45, 13) | bitnum(inputData, 37, 12) |
      bitnum(inputData, 29, 11) | bitnum(inputData, 21, 10) | bitnum(inputData, 13,  9) | bitnum(inputData,  5,  8) |
      bitnum(inputData, 63,  7) | bitnum(inputData, 55,  6) | bitnum(inputData, 47,  5) | bitnum(inputData, 39,  4) |
      bitnum(inputData, 31,  3) | bitnum(inputData, 23,  2) | bitnum(inputData, 15,  1) | bitnum(inputData,  7,  0)
    ) >>> 0;
    const s1 = (
      bitnum(inputData, 56, 31) | bitnum(inputData, 48, 30) | bitnum(inputData, 40, 29) | bitnum(inputData, 32, 28) |
      bitnum(inputData, 24, 27) | bitnum(inputData, 16, 26) | bitnum(inputData,  8, 25) | bitnum(inputData,  0, 24) |
      bitnum(inputData, 58, 23) | bitnum(inputData, 50, 22) | bitnum(inputData, 42, 21) | bitnum(inputData, 34, 20) |
      bitnum(inputData, 26, 19) | bitnum(inputData, 18, 18) | bitnum(inputData, 10, 17) | bitnum(inputData,  2, 16) |
      bitnum(inputData, 60, 15) | bitnum(inputData, 52, 14) | bitnum(inputData, 44, 13) | bitnum(inputData, 36, 12) |
      bitnum(inputData, 28, 11) | bitnum(inputData, 20, 10) | bitnum(inputData, 12,  9) | bitnum(inputData,  4,  8) |
      bitnum(inputData, 62,  7) | bitnum(inputData, 54,  6) | bitnum(inputData, 46,  5) | bitnum(inputData, 38,  4) |
      bitnum(inputData, 30,  3) | bitnum(inputData, 22,  2) | bitnum(inputData, 14,  1) | bitnum(inputData,  6,  0)
    ) >>> 0;
    return [s0, s1];
  }

  function inversePermutation(s0, s1) {
    const data = new Uint8Array(8);
    data[3] = bitnumIntr(s1,7,7)|bitnumIntr(s0,7,6)|bitnumIntr(s1,15,5)|bitnumIntr(s0,15,4)|bitnumIntr(s1,23,3)|bitnumIntr(s0,23,2)|bitnumIntr(s1,31,1)|bitnumIntr(s0,31,0);
    data[2] = bitnumIntr(s1,6,7)|bitnumIntr(s0,6,6)|bitnumIntr(s1,14,5)|bitnumIntr(s0,14,4)|bitnumIntr(s1,22,3)|bitnumIntr(s0,22,2)|bitnumIntr(s1,30,1)|bitnumIntr(s0,30,0);
    data[1] = bitnumIntr(s1,5,7)|bitnumIntr(s0,5,6)|bitnumIntr(s1,13,5)|bitnumIntr(s0,13,4)|bitnumIntr(s1,21,3)|bitnumIntr(s0,21,2)|bitnumIntr(s1,29,1)|bitnumIntr(s0,29,0);
    data[0] = bitnumIntr(s1,4,7)|bitnumIntr(s0,4,6)|bitnumIntr(s1,12,5)|bitnumIntr(s0,12,4)|bitnumIntr(s1,20,3)|bitnumIntr(s0,20,2)|bitnumIntr(s1,28,1)|bitnumIntr(s0,28,0);
    data[7] = bitnumIntr(s1,3,7)|bitnumIntr(s0,3,6)|bitnumIntr(s1,11,5)|bitnumIntr(s0,11,4)|bitnumIntr(s1,19,3)|bitnumIntr(s0,19,2)|bitnumIntr(s1,27,1)|bitnumIntr(s0,27,0);
    data[6] = bitnumIntr(s1,2,7)|bitnumIntr(s0,2,6)|bitnumIntr(s1,10,5)|bitnumIntr(s0,10,4)|bitnumIntr(s1,18,3)|bitnumIntr(s0,18,2)|bitnumIntr(s1,26,1)|bitnumIntr(s0,26,0);
    data[5] = bitnumIntr(s1,1,7)|bitnumIntr(s0,1,6)|bitnumIntr(s1, 9,5)|bitnumIntr(s0, 9,4)|bitnumIntr(s1,17,3)|bitnumIntr(s0,17,2)|bitnumIntr(s1,25,1)|bitnumIntr(s0,25,0);
    data[4] = bitnumIntr(s1,0,7)|bitnumIntr(s0,0,6)|bitnumIntr(s1, 8,5)|bitnumIntr(s0, 8,4)|bitnumIntr(s1,16,3)|bitnumIntr(s0,16,2)|bitnumIntr(s1,24,1)|bitnumIntr(s0,24,0);
    return data;
  }

  function f(state, key) {
    const t1 = (
      bitnumIntl(state,31,0) | ((state & 0xf0000000) >>> 1) | bitnumIntl(state,4,5) | bitnumIntl(state,3,6) |
      ((state & 0x0f000000) >>> 3) | bitnumIntl(state,8,11) | bitnumIntl(state,7,12) |
      ((state & 0x00f00000) >>> 5) | bitnumIntl(state,12,17) | bitnumIntl(state,11,18) |
      ((state & 0x000f0000) >>> 7) | bitnumIntl(state,16,23)
    ) >>> 0;
    const t2 = (
      bitnumIntl(state,15,0) | ((state & 0x0000f000) << 15) | bitnumIntl(state,20,5) | bitnumIntl(state,19,6) |
      ((state & 0x00000f00) << 13) | bitnumIntl(state,24,11) | bitnumIntl(state,23,12) |
      ((state & 0x000000f0) << 11) | bitnumIntl(state,28,17) | bitnumIntl(state,27,18) |
      ((state & 0x0000000f) << 9) | bitnumIntl(state,0,23)
    ) >>> 0;
    const lrgstate = [
      ((t1 >>> 24) & 0xff) ^ key[0],
      ((t1 >>> 16) & 0xff) ^ key[1],
      ((t1 >>> 8) & 0xff) ^ key[2],
      ((t2 >>> 24) & 0xff) ^ key[3],
      ((t2 >>> 16) & 0xff) ^ key[4],
      ((t2 >>> 8) & 0xff) ^ key[5]
    ];
    let st = (
      (sbox[0][sboxBit(lrgstate[0] >>> 2)] << 28) |
      (sbox[1][sboxBit(((lrgstate[0] & 0x03) << 4) | (lrgstate[1] >>> 4))] << 24) |
      (sbox[2][sboxBit(((lrgstate[1] & 0x0f) << 2) | (lrgstate[2] >>> 6))] << 20) |
      (sbox[3][sboxBit(lrgstate[2] & 0x3f)] << 16) |
      (sbox[4][sboxBit(lrgstate[3] >>> 2)] << 12) |
      (sbox[5][sboxBit(((lrgstate[3] & 0x03) << 4) | (lrgstate[4] >>> 4))] << 8) |
      (sbox[6][sboxBit(((lrgstate[4] & 0x0f) << 2) | (lrgstate[5] >>> 6))] << 4) |
      sbox[7][sboxBit(lrgstate[5] & 0x3f)]
    ) >>> 0;
    return (
      bitnumIntl(st,15,0)|bitnumIntl(st,6,1)|bitnumIntl(st,19,2)|bitnumIntl(st,20,3)|
      bitnumIntl(st,28,4)|bitnumIntl(st,11,5)|bitnumIntl(st,27,6)|bitnumIntl(st,16,7)|
      bitnumIntl(st,0,8)|bitnumIntl(st,14,9)|bitnumIntl(st,22,10)|bitnumIntl(st,25,11)|
      bitnumIntl(st,4,12)|bitnumIntl(st,17,13)|bitnumIntl(st,30,14)|bitnumIntl(st,9,15)|
      bitnumIntl(st,1,16)|bitnumIntl(st,7,17)|bitnumIntl(st,23,18)|bitnumIntl(st,13,19)|
      bitnumIntl(st,31,20)|bitnumIntl(st,26,21)|bitnumIntl(st,2,22)|bitnumIntl(st,8,23)|
      bitnumIntl(st,18,24)|bitnumIntl(st,12,25)|bitnumIntl(st,29,26)|bitnumIntl(st,5,27)|
      bitnumIntl(st,21,28)|bitnumIntl(st,10,29)|bitnumIntl(st,3,30)|bitnumIntl(st,24,31)
    ) >>> 0;
  }

  function crypt(inputData, key) {
    let [s0, s1] = initialPermutation(inputData);
    for (let idx = 0; idx < 15; idx++) {
      const prev = s1;
      s1 = (f(s1, key[idx]) ^ s0) >>> 0;
      s0 = prev;
    }
    s0 = (f(s1, key[15]) ^ s0) >>> 0;
    return inversePermutation(s0, s1);
  }

  function keySchedule(key, mode) {
    const schedule = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0, 0]);
    const keyRndShift = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
    const keyPermC = [56,48,40,32,24,16,8,0,57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35];
    const keyPermD = [62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,60,52,44,36,28,20,12,4,27,19,11,3];
    const keyCompression = [13,16,10,23,0,4,2,27,14,5,20,9,22,18,11,3,25,7,15,6,26,19,12,1,40,51,30,36,46,54,29,39,50,44,32,47,43,48,38,55,33,52,45,41,49,35,28,31];
    let c = 0, d = 0;
    for (let i = 0; i < 28; i++) {
      c |= bitnum(key, keyPermC[i], 31 - i);
      d |= bitnum(key, keyPermD[i], 31 - i);
    }
    c >>>= 0; d >>>= 0;
    for (let i = 0; i < 16; i++) {
      c = (((c << keyRndShift[i]) | (c >>> (28 - keyRndShift[i]))) & 0xfffffff0) >>> 0;
      d = (((d << keyRndShift[i]) | (d >>> (28 - keyRndShift[i]))) & 0xfffffff0) >>> 0;
      const togen = mode === DECRYPT ? 15 - i : i;
      schedule[togen][0] = schedule[togen][1] = schedule[togen][2] = 0;
      schedule[togen][3] = schedule[togen][4] = schedule[togen][5] = 0;
      for (let j = 0; j < 24; j++) {
        schedule[togen][Math.floor(j / 8)] |= bitnumIntr(c, keyCompression[j], 7 - (j % 8));
      }
      for (let j = 24; j < 48; j++) {
        schedule[togen][Math.floor(j / 8)] |= bitnumIntr(d, keyCompression[j] - 27, 7 - (j % 8));
      }
    }
    return schedule;
  }

  function tripleDesKeySetup(key, mode) {
    if (mode === ENCRYPT) {
      return [keySchedule(key, ENCRYPT), keySchedule(key.slice(8), DECRYPT), keySchedule(key.slice(16), ENCRYPT)];
    }
    return [keySchedule(key.slice(16), DECRYPT), keySchedule(key.slice(8), ENCRYPT), keySchedule(key, DECRYPT)];
  }

  function tripleDesCrypt(data, key) {
    let r = data;
    for (let i = 0; i < 3; i++) r = crypt(r, key[i]);
    return r;
  }

  return function tripleDesEcbDecrypt(key24, ciphertext) {
    const keyArr = key24 instanceof Uint8Array ? key24 : new Uint8Array(Buffer.from(key24));
    const ctArr = ciphertext instanceof Uint8Array ? ciphertext : new Uint8Array(Buffer.from(ciphertext));
    if (keyArr.length !== 24) throw new Error('3DES key must be 24 bytes, got ' + keyArr.length);
    if (ctArr.length === 0 || ctArr.length % 8 !== 0) {
      throw new Error('3DES ciphertext length must be a positive multiple of 8, got ' + ctArr.length);
    }
    const sched = tripleDesKeySetup(keyArr, DECRYPT);
    const out = Buffer.alloc(ctArr.length);
    for (let i = 0; i < ctArr.length; i += 8) {
      const block = ctArr.slice(i, i + 8);
      const dec = tripleDesCrypt(block, sched);
      Buffer.from(dec).copy(out, i);
    }
    return out;
  };
})();


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
    aesDecrypt: (buffer, mode, key, iv) => {
      const decipher = crypto.createDecipheriv(mode, key, iv || null);
      return Buffer.concat([decipher.update(buffer), decipher.final()]);
    },
    // 标准 3DES / DES 解密（OpenSSL）。QRC 等密文为 8 字节块整倍数、
    // 自带零填充而非 PKCS7，关闭自动去填充避免 final() 抛错。
    desDecrypt: (buffer, mode, key, iv) => {
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key);
      const decipher = crypto.createDecipheriv(mode, keyBuf, iv || null);
      decipher.setAutoPadding(false);
      return Buffer.concat([decipher.update(buf), decipher.final()]);
    },
    // QQMusic QRC 专用 3DES-ECB 解密（LDDC 变体，**与标准 DES 不同**：
    // 自带 S-box 偏差 + 32-bit 字内字节顺序反转）。和 OpenSSL 的
    // 'des-ede3-ecb' 不兼容，必须走纯 JS 实现。
    qrcDesDecrypt: (buffer, key) => {
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key);
      return tripleDesEcbDecrypt(keyBuf, buf);
    },
    rsaEncrypt: (buffer, publicKey) => {
      return crypto.publicEncrypt(
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
      );
    }
  },
  zlib: {
    // 标准 zlib（带 0x78 头）
    inflate: (buf) =>
      new Promise((resolve, reject) => {
        zlib.inflate(buf, (err, result) => (err ? reject(err) : resolve(result)));
      }),
    // raw deflate（无 zlib 头）：QQMusic 新版 QRC 即此格式
    inflateRaw: (buf) =>
      new Promise((resolve, reject) => {
        zlib.inflateRaw(buf, (err, result) => (err ? reject(err) : resolve(result)));
      }),
    // gzip
    gunzip: (buf) =>
      new Promise((resolve, reject) => {
        zlib.gunzip(buf, (err, result) => (err ? reject(err) : resolve(result)));
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

  // 根据已安装条目的 origin，从远端 URL 或本地磁盘重新拉取脚本并替换。
  // - origin 为 http(s) URL：重新下载
  // - origin 为本地存在的文件路径：重新读取
  // - 其他（'local' 或源已不可达）：用持久化的 script 重启沙箱
  // 返回 { entry, source: 'url'|'file'|'cache' }
  async reload(id) {
    const list = this._readAll();
    const existing = list.find((e) => e.id === id);
    if (!existing) throw new Error('未找到自定义源：' + id);

    const origin = existing.origin || 'local';
    const isUrl = /^https?:\/\//i.test(origin);
    let script;
    let sourceKind;
    if (isUrl) {
      const res = await httpRequest(origin, { method: 'GET', timeout: 30000 });
      if (res.statusCode !== 200) throw new Error('HTTP ' + res.statusCode);
      script = res.body.toString('utf-8');
      sourceKind = 'url';
    } else if (origin && origin !== 'local' && fs.existsSync(origin)) {
      script = await fsp.readFile(origin, 'utf-8');
      sourceKind = 'file';
    } else {
      if (!existing.script) throw new Error('无可用的重新加载来源');
      script = existing.script;
      sourceKind = 'cache';
    }

    const info = parseScriptInfo(script);
    if (!info.name) throw new Error('脚本缺少 @name 元信息');

    const loaded = new LoadedSource(script);
    await loaded.load();

    // 替换现有条目，保留 enabled / installedAt / origin / id；用 info.name 作为新 name 但保持原 id 不变
    const updated = {
      ...existing,
      name: info.name || existing.name,
      description: info.description,
      version: info.version,
      author: info.author,
      homepage: info.homepage,
      sources: loaded.sources,
      script,
      reloadedAt: Date.now()
    };

    const next = list.map((e) => (e.id === id ? updated : e));
    this._writeAll(next);

    // 替换运行时缓存
    this.runtime.set(id, loaded);

    const { script: _drop, ...safe } = updated;
    return { entry: safe, source: sourceKind };
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
