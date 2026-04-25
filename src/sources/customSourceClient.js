// 渲染层 → 主进程 CustomSourceManager 的薄封装。
//
// 所有"在线源"接口（搜索 / 歌词 / 专辑 / 艺术家 …）都走这里，最终调用用户
// 通过自定义源面板手动导入的 lx-music 风格脚本（样例见仓库 sample-sources/）。
// 没有渲染层兜底实现：用户没装脚本时直接抛出友好错误。

import { parseLrc } from '../utils/lrc';

// ---------- 源/动作发现 ----------
async function listSources() {
  if (!window.musicAPI?.customSourceList) return [];
  try {
    return await window.musicAPI.customSourceList();
  } catch {
    return [];
  }
}

// 列出某个 action 在所有已启用脚本中支持的 source key（去重，保留首次出现）
async function listSourcesForAction(action) {
  const out = [];
  const seen = new Set();
  const list = await listSources();
  for (const entry of list) {
    if (!entry.enabled) continue;
    for (const [key, meta] of Object.entries(entry.sources || {})) {
      if (seen.has(key)) continue;
      if ((meta?.actions || []).includes(action)) {
        out.push({ id: key, name: meta.name || key });
        seen.add(key);
      }
    }
  }
  return out;
}

export const listSearchSources = () => listSourcesForAction('musicSearch');

// ---------- 通用派发 ----------
async function dispatch({ sourceKey, action, info }) {
  if (!window.musicAPI?.customSourceDispatch) {
    throw new Error('当前环境不支持自定义源 IPC');
  }
  const r = await window.musicAPI.customSourceDispatch({ sourceKey, action, info });
  if (r?.ok) return r.data;
  if (r?.error === 'no-source') {
    throw new Error(`没有支持 ${sourceKey}/${action} 的自定义源`);
  }
  throw new Error(r?.error || `${action} 失败`);
}

// ---------- 搜索 ----------
// 脚本可能返回数组或 { list: [...] }；统一拍平成数组。
export async function searchMusic(sourceKey, { keyWord, page = 1, limit = 30 }) {
  const data = await dispatch({
    sourceKey,
    action: 'musicSearch',
    info: { keyWord, page, limit }
  });
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.list)) return data.list;
  return [];
}

// ---------- 歌词 ----------
// 脚本可返回 string 或 { lyric: string, tlyric?: string }；统一交给 parseLrc。
// extra 透传 track 上对应源的子对象（如 track.tx），用于脚本拿到 innerSongId 等
// 在主键 songId 之外的辅助字段。track 多半来自 reactive ref（playQueue/
// currentTrack），其嵌套对象是 Proxy，Electron 结构化克隆会抛
// "An object could not be cloned"——所以这里走一次 JSON round-trip。
// 任何错误都吞成空数组，呼叫方 (usePlayer) 不希望因歌词失败影响播放。
export async function fetchLyric(sourceKey, songId, extra) {
  try {
    const safeExtra = extra ? JSON.parse(JSON.stringify(extra)) : null;
    const raw = await dispatch({
      sourceKey,
      action: 'lyric',
      info: { songId, extra: safeExtra }
    });
    const text = typeof raw === 'string' ? raw : raw && typeof raw.lyric === 'string' ? raw.lyric : '';
    return parseLrc(text);
  } catch (e) {
    console.warn('[lyric]', sourceKey, songId, e.message || e);
    return [];
  }
}

// ---------- 专辑 ----------
export function fetchAlbum(sourceKey, albumId) {
  return dispatch({
    sourceKey,
    action: 'album',
    info: { albumId }
  });
}

// ---------- 艺术家 ----------
export function fetchArtistDetail(sourceKey, artistId) {
  return dispatch({
    sourceKey,
    action: 'artistInfo',
    info: { artistId }
  });
}

export function fetchArtistAlbums(sourceKey, artistId) {
  return dispatch({
    sourceKey,
    action: 'artistAlbums',
    info: { artistId }
  });
}

// ---------- 歌曲 URL ----------
// lx-music 脚本通过 musicInfo 读取 songmid / meta.songId 等字段。
// 这里按脚本约定的形状构造，再交给主进程 CustomSourceManager.resolveMusicUrl。
function fmtInterval(sec) {
  if (!sec || !Number.isFinite(sec)) return null;
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function buildMusicInfo(track) {
  const source = track?.source || '';
  // copyrightId 是某些源声明的别名主键，优先使用，缺失则回落到 songId
  const sid = String(track?.copyrightId || track?.songId || '');
  const singer = track?.artist || (Array.isArray(track?.artists) ? track.artists.map((a) => a.name).join('、') : '');
  const perSource = source ? track?.[source] : null;
  return {
    id: `${source}_${sid}_${track?.albumId ?? ''}`,
    name: track?.title || '',
    singer,
    source,
    interval: fmtInterval(track?.duration) || perSource?.interval || null,
    meta: {
      songId: sid,
      albumName: track?.album || '',
      picUrl: track?.cover || null,
      albumId: track?.albumId ?? null,
      duration: track?.duration ?? null,
      qualitys: perSource?.types || [],
      _qualitys: perSource?._types || {}
    },
    songmid: sid
  };
}

// IPC 不允许传 Vue reactive Proxy / 函数等，做一次 JSON round-trip 转成纯对象
function toPlain(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export async function resolveMusicUrl(track) {
  if (!track || typeof track !== 'object') {
    throw new Error('resolveMusicUrl: 需要 track 对象');
  }
  if (!window.musicAPI?.customSourceResolveMusicUrl) {
    throw new Error('当前环境不支持自定义源 IPC');
  }
  const sourceKey = track.source;
  if (!sourceKey) throw new Error('track 缺少 source，无法解析 URL');
  const r = await window.musicAPI.customSourceResolveMusicUrl(
    toPlain({
      sourceKey,
      quality: '320k',
      musicInfo: buildMusicInfo(track)
    })
  );
  if (r?.ok && r.url) return r.url;
  if (r?.error === 'no-source') {
    throw new Error(`没有启用支持 ${sourceKey} 源的自定义脚本`);
  }
  throw new Error(r?.error || '解析失败');
}
