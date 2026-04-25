export function formatTime(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

export function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

export function coverOf(track, fallback = '') {
  return track?.picture || track?.cover || fallback;
}

export function defaultCover() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
    <stop offset='0' stop-color='%237b5cff'/><stop offset='1' stop-color='%23ff5cb4'/>
    </linearGradient></defs>
    <rect width='100' height='100' fill='url(%23g)'/>
    <text x='50' y='62' text-anchor='middle' font-size='42' fill='white' font-family='sans-serif'>♪</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + svg.replace(/\n\s*/g, '');
}
