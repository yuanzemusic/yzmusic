// 跨源兜底：当某首歌在自己源上拿不到可播放 URL 时，
// 去其他源的搜索接口里按歌名 + 艺术家查找一首“同一首歌”，借其地址播放。
import { searchMusic, listSearchSources, resolveMusicUrl } from '../sources/customSourceClient';

// 归一化：大小写、空白、常见中英标点去除后再比较
function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[【】\[\]（）()『』「」《》<>!！?？.。,，、:：;；"'“”‘’·・~～\-—_/／\\|]/g, '')
    .trim();
}

// 艺术家拆分：中英常见分隔符 + feat / ft / and / vs / x
const ARTIST_SPLIT_RE = /[,，、&/／\\+]|(?:\s+(?:and|feat\.?|ft\.?|vs\.?|x)\s+)/i;
function artistSet(str) {
  return new Set(
    String(str ?? '')
      .split(ARTIST_SPLIT_RE)
      .map(normalize)
      .filter(Boolean)
  );
}

// 歌名完全一致 + 艺术家至少一人重合视作同一首歌；
// 任一侧没有艺术家信息时放宽为仅比歌名。
function isSameSong(orig, candidate) {
  const t1 = normalize(orig.title);
  const t2 = normalize(candidate.title);
  if (!t1 || !t2 || t1 !== t2) return false;
  const a1 = artistSet(orig.artist);
  const a2 = artistSet(candidate.artist);
  if (a1.size === 0 || a2.size === 0) return true;
  for (const a of a2) if (a1.has(a)) return true;
  return false;
}

// 从除本源外的其他源找一个可播放的 URL。
// onProgress({ source, stage: 'search'|'resolve' }) 让外层可以展示当前在请求哪个源。
// 成功返回 { url, from: 候选源的 track }；失败返回 null。
export async function findFallbackUrl(track, onProgress) {
  if (!track || !track.title) return null;
  const origSource = track.source || '';
  const keyword = [track.title, track.artist].filter(Boolean).join(' ').trim();
  if (!keyword) return null;

  let sources = [];
  try {
    sources = await listSearchSources();
  } catch {
    sources = [];
  }

  for (const src of sources) {
    if (src.id === origSource) continue;
    let candidates;
    try {
      onProgress?.({ source: src.id, stage: 'search' });
      candidates = await searchMusic(src.id, { keyWord: keyword, page: 1, limit: 10 });
    } catch (e) {
      continue;
    }
    if (!Array.isArray(candidates) || candidates.length === 0) continue;
    const hit = candidates.find((c) => isSameSong(track, c));
    if (!hit) continue;
    try {
      onProgress?.({ source: src.id, stage: 'resolve' });
      const url = await resolveMusicUrl(hit);
      if (url) return { url, from: hit };
    } catch (e) {
      continue;
    }
  }
  return null;
}
