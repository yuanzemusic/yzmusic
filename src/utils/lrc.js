// 解析 LRC 歌词文本，返回 [{ time: seconds, text: string }]
export function parseLrc(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const out = [];
  const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const line of lines) {
    const matches = [...line.matchAll(re)];
    if (matches.length === 0) continue;
    const lyricText = line.replace(re, '').trim();
    if (!lyricText) continue;
    for (const m of matches) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      out.push({ time: min * 60 + sec + ms / 1000, text: lyricText });
    }
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}
