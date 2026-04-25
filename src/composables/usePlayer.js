import { ref, computed, watch } from 'vue';
import { fetchLyric, resolveMusicUrl } from '../sources/customSourceClient';
import { findFallbackUrl } from '../api/fallback';
import { coverOf, defaultCover } from '../utils/format';

// ---- 单例 audio 元素 ----
const audioEl = typeof Audio !== 'undefined' ? new Audio() : null;

// ---- 全局状态 ----
const currentTrack = ref(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const volume = ref(80);
const playQueue = ref([]);
const currentIndex = ref(-1);
const playMode = ref('order'); // order | single | random
const lyricsLines = ref([]);
const activeLyricIndex = ref(-1);
const showLyrics = ref(false);
const isLoading = ref(false);
// 当前正在请求的源：{ source: <用户脚本里声明的 sourceKey>, phase: 'primary'|'fallback', stage?: 'search'|'resolve' }
// null 表示没有进行中的源请求。
const sourceStatus = ref(null);

let initialized = false;
let playToken = 0;

function bindAudioEvents() {
  if (!audioEl) return;
  audioEl.addEventListener('timeupdate', () => {
    currentTime.value = audioEl.currentTime || 0;
    if (lyricsLines.value.length > 0) {
      let idx = -1;
      for (let i = 0; i < lyricsLines.value.length; i++) {
        if (lyricsLines.value[i].time <= currentTime.value) idx = i;
        else break;
      }
      if (idx !== activeLyricIndex.value) activeLyricIndex.value = idx;
    }
  });
  audioEl.addEventListener('loadedmetadata', () => {
    duration.value = audioEl.duration || currentTrack.value?.duration || 0;
  });
  audioEl.addEventListener('play', () => {
    isPlaying.value = true;
  });
  audioEl.addEventListener('pause', () => {
    isPlaying.value = false;
  });
  audioEl.addEventListener('ended', () => onEnded());
  audioEl.addEventListener('error', () => onAudioError());

  watch(volume, (v) => {
    audioEl.volume = v / 100;
    window.musicAPI?.storeSet('volume', v);
  });
}

function onEnded() {
  if (playMode.value === 'single') {
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
  } else {
    next();
  }
}

// 播放中 URL 失效（403/404/解码失败等）时，尝试一次跨源兜底。
async function onAudioError() {
  const err = audioEl.error;
  console.warn('audio error', err);
  // code 1 = MEDIA_ERR_ABORTED，通常是主动切歌引起的，不处理
  if (!err || err.code === 1) return;
  const track = currentTrack.value;
  if (!track || track.type !== 'online' || !track.url) return;
  if (track._fallbackAttempted) return;
  track._fallbackAttempted = true;

  const token = playToken;
  isLoading.value = true;
  let fb = null;
  try {
    fb = await findFallbackUrl(track, ({ source, stage }) => {
      if (token !== playToken) return;
      sourceStatus.value = { source, phase: 'fallback', stage };
    });
  } catch (e) {
    fb = null;
  }
  if (token !== playToken) return;
  sourceStatus.value = null;
  isLoading.value = false;
  if (!fb) return;

  track.url = fb.url;
  track._fallbackFromSource = fb.from?.source || null;
  const t2 = playQueue.value[currentIndex.value];
  if (t2) {
    t2.url = fb.url;
  }
  audioEl.src = fb.url;
  audioEl.play().catch((e) => console.warn('兜底源仍无法播放', e));
}

async function playTrack(track, list) {
  if (!track) return;

  // 同曲再次点击：切换暂停/继续
  if (currentTrack.value && currentTrack.value.id === track.id) {
    if (isPlaying.value) audioEl.pause();
    else audioEl.play().catch(() => {});
    return;
  }

  // 队列处理
  if (list && Array.isArray(list)) {
    playQueue.value = list.slice();
    currentIndex.value = list.findIndex((t) => t.id === track.id);
  } else {
    const idx = playQueue.value.findIndex((t) => t.id === track.id);
    if (idx >= 0) currentIndex.value = idx;
    else {
      playQueue.value.push(track);
      currentIndex.value = playQueue.value.length - 1;
    }
  }

  // 立即更新 UI：显示歌曲信息 + loading 状态；停止当前播放
  const token = ++playToken;
  currentTrack.value = { ...track };
  lyricsLines.value = [];
  activeLyricIndex.value = -1;
  currentTime.value = 0;
  duration.value = track.duration || 0;
  audioEl.pause();
  audioEl.removeAttribute('src');
  audioEl.load();
  isLoading.value = true;

  // 在线 URL 解析
  if (track.type === 'online' && !track.url) {
    let url = null;
    const primarySrc = track.source || '';
    sourceStatus.value = { source: primarySrc, phase: 'primary', stage: 'resolve' };
    try {
      url = await resolveMusicUrl(track);
    } catch (e) {
      if (token !== playToken) return; // 已切到其他歌
      // 本源失败，尝试用其他源的同名同艺术家歌曲兜底
      const fb = await findFallbackUrl(track, ({ source, stage }) => {
        if (token !== playToken) return;
        sourceStatus.value = { source, phase: 'fallback', stage };
      });
      if (token !== playToken) return;
      if (fb) {
        url = fb.url;
        track._fallbackAttempted = true;
        track._fallbackFromSource = fb.from?.source || null;
      } else {
        sourceStatus.value = null;
        isLoading.value = false;
        alert(e.message);
        return;
      }
    }
    if (token !== playToken) return;
    sourceStatus.value = null;
    track.url = url;
    const t2 = playQueue.value[currentIndex.value];
    if (t2) t2.url = url;
    if (currentTrack.value) currentTrack.value.url = url;
  }

  if (token !== playToken) return;
  audioEl.src = track.url;
  audioEl.volume = volume.value / 100;
  audioEl.play().catch((err) => console.warn('播放失败', err));
  isLoading.value = false;

  // 歌词通过自定义源 dispatch（脚本内部按 source 选择实现）
  if (track.type === 'online' && track.songId && track.source) {
    const lyrics = await fetchLyric(track.source, track.songId, track[track.source] || null);
    if (token !== playToken) return;
    lyricsLines.value = lyrics;
  }
}

function togglePlay(fallbackList) {
  if (!currentTrack.value) {
    if (fallbackList && fallbackList.length) playTrack(fallbackList[0], fallbackList);
    return;
  }
  if (isPlaying.value) audioEl.pause();
  else audioEl.play().catch(() => {});
}

function pickIndex(step) {
  const len = playQueue.value.length;
  if (playMode.value === 'random') return Math.floor(Math.random() * len);
  return (currentIndex.value + step + len) % len;
}

function next() {
  if (playQueue.value.length === 0) return;
  playTrack(playQueue.value[pickIndex(1)], playQueue.value);
}

function prev() {
  if (playQueue.value.length === 0) return;
  playTrack(playQueue.value[pickIndex(-1)], playQueue.value);
}

const PLAY_MODES = ['order', 'single', 'random'];
function cyclePlayMode() {
  const i = PLAY_MODES.indexOf(playMode.value);
  playMode.value = PLAY_MODES[(i + 1) % PLAY_MODES.length];
  window.musicAPI?.storeSet('playMode', playMode.value);
}

function clearQueue() {
  if (playQueue.value.length === 0) return;
  if (!confirm('清空正在播放（不会停止当前播放）')) return;
  playQueue.value = [];
  currentIndex.value = -1;
}

function seekTo(time) {
  if (!duration.value || !audioEl) return;
  audioEl.currentTime = Math.max(0, Math.min(duration.value, time));
}

const coverUrl = computed(() => coverOf(currentTrack.value, defaultCover()));

const progressPct = computed(() => {
  if (!duration.value) return 0;
  return Math.min(100, (currentTime.value / duration.value) * 100);
});

const modeIcon = computed(
  () =>
    ({
      order: '🔁',
      single: '🔂',
      random: '🔀'
    })[playMode.value]
);

const modeTitle = computed(
  () =>
    ({
      order: '列表循环',
      single: '单曲循环',
      random: '随机播放'
    })[playMode.value]
);

function pushTrayState() {
  if (!window.musicAPI?.trayUpdateState) return;
  const t = currentTrack.value;
  window.musicAPI.trayUpdateState({
    title: t?.title || '',
    artist: t?.artist || '',
    isPlaying: isPlaying.value,
    playMode: playMode.value
  });
}

function bindTray() {
  if (!window.musicAPI) return;
  // 状态 → 托盘
  watch([currentTrack, isPlaying, playMode], () => pushTrayState(), { immediate: true });
  // 托盘命令 → 本地
  window.musicAPI.onTrayCommand?.((cmd) => {
    if (cmd === 'toggle') togglePlay();
    else if (cmd === 'next') next();
    else if (cmd === 'prev') prev();
    else if (cmd === 'cycleMode') cyclePlayMode();
  });
}

async function init() {
  if (initialized) return;
  initialized = true;
  bindAudioEvents();
  try {
    const saved = await window.musicAPI?.storeGet();
    if (saved) {
      if (saved.volume) volume.value = saved.volume;
      if (saved.playMode) playMode.value = saved.playMode;
    }
  } catch (e) {
    /* ignore */
  }
  bindTray();
}

export function usePlayer() {
  init();
  return {
    // state
    currentTrack,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    volume,
    playQueue,
    currentIndex,
    playMode,
    lyricsLines,
    activeLyricIndex,
    showLyrics,
    sourceStatus,
    // computed
    coverUrl,
    progressPct,
    modeIcon,
    modeTitle,
    // actions
    playTrack,
    togglePlay,
    next,
    prev,
    cyclePlayMode,
    clearQueue,
    seekTo
  };
}
