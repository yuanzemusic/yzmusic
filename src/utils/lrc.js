// 解析 LRC 歌词文本。返回 [{ time, text, segments? }]
//   - time     行起始秒数
//   - text     去除时间标签后的纯文本（用于无逐字数据时的整行渲染）
//   - segments 逐字高亮分段：{ text, offset, duration }，offset/duration 单位毫秒，
//              offset 相对该行 time。仅当源歌词带有 `<offset,duration>` 标记
//              （酷我 lrcx=1 风格）时才存在；否则为 null。
export function parseLrc(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const out = [];
  const tagRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  const wordRe = /<(-?\d+),(-?\d+)(?:,-?\d+)?>/g;

  for (const rawLine of lines) {
    const tags = [...rawLine.matchAll(tagRe)];
    if (tags.length === 0) continue;
    const body = rawLine.replace(tagRe, '');

    const segments = [];
    let plain = '';
    let cursor = 0;
    let pending = null;
    wordRe.lastIndex = 0;
    let m;
    while ((m = wordRe.exec(body)) !== null) {
      const between = body.slice(cursor, m.index);
      if (pending) {
        if (between.length > 0) {
          segments.push({ text: between, offset: pending.offset, duration: pending.duration });
          plain += between;
        }
      } else if (between.length > 0) {
        // 标记前的零散文本：保留到纯文本，但不作为 segment（无时间信息）
        plain += between;
      }
      pending = { offset: parseInt(m[1], 10), duration: parseInt(m[2], 10) };
      cursor = m.index + m[0].length;
    }
    if (pending) {
      const tail = body.slice(cursor);
      if (tail.length > 0) {
        segments.push({ text: tail, offset: pending.offset, duration: pending.duration });
        plain += tail;
      }
    } else {
      plain = body;
    }

    if (!plain.trim()) continue;
    const lyricText = plain.trim();

    for (const t of tags) {
      const min = parseInt(t[1], 10);
      const sec = parseInt(t[2], 10);
      const ms = t[3] ? parseInt(t[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      out.push({
        time: min * 60 + sec + ms / 1000,
        text: lyricText,
        segments: segments.length > 0 ? segments : null
      });
    }
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}
