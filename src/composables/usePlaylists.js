import { ref, computed } from 'vue';
import { useFavorites } from './useFavorites';
import { usePlayer } from './usePlayer';
import { coverOf, genId } from '../utils/format';

/*
 * 歌单（自建）数据：
 *   { id: 'pl_xxx', name, tracks: [...], createdAt, updatedAt }
 *
 * 把"我的收藏"和"正在播放"包装成 system 歌单，统一在歌单列表里显示。
 */

const customPlaylists = ref([]);
let initialized = false;

async function init() {
  if (initialized) return;
  initialized = true;
  if (typeof window === 'undefined' || !window.musicAPI?.storeGet) return;
  try {
    const saved = await window.musicAPI.storeGet('playlists');
    if (Array.isArray(saved)) customPlaylists.value = saved;
  } catch (e) {
    /* ignore */
  }
}

function persist() {
  if (typeof window === 'undefined' || !window.musicAPI?.storeSet) return;
  try {
    // 深拷贝一下，避免把 Vue 响应式 Proxy 直接丢进 IPC structured clone 报错
    const plain = JSON.parse(JSON.stringify(customPlaylists.value));
    window.musicAPI.storeSet('playlists', plain);
  } catch (e) {
    console.warn('persist playlists failed:', e);
  }
}

function createPlaylist(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const pl = {
    id: genId('pl'),
    name: trimmed,
    tracks: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  customPlaylists.value.unshift(pl);
  persist();
  return pl;
}

function renamePlaylist(id, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return false;
  const pl = customPlaylists.value.find((p) => p.id === id);
  if (!pl) return false;
  pl.name = trimmed;
  pl.updatedAt = Date.now();
  persist();
  return true;
}

function deletePlaylist(id) {
  const i = customPlaylists.value.findIndex((p) => p.id === id);
  if (i < 0) return false;
  customPlaylists.value.splice(i, 1);
  persist();
  return true;
}

function getCustomPlaylist(id) {
  return customPlaylists.value.find((p) => p.id === id) || null;
}

function addTrackToCustom(id, track) {
  const pl = getCustomPlaylist(id);
  if (!pl) return { ok: false, reason: 'not_found' };
  if (pl.tracks.some((t) => t.id === track.id)) {
    return { ok: false, reason: 'duplicate' };
  }
  pl.tracks.push({ ...track });
  pl.updatedAt = Date.now();
  persist();
  return { ok: true };
}

function removeTrackFromCustom(id, trackId) {
  const pl = getCustomPlaylist(id);
  if (!pl) return false;
  const i = pl.tracks.findIndex((t) => t.id === trackId);
  if (i < 0) return false;
  pl.tracks.splice(i, 1);
  pl.updatedAt = Date.now();
  persist();
  return true;
}

function clearCustom(id) {
  const pl = getCustomPlaylist(id);
  if (!pl) return false;
  if (pl.tracks.length === 0) return false;
  pl.tracks = [];
  pl.updatedAt = Date.now();
  persist();
  return true;
}

/**
 * 统一接口：把任意歌单（system + custom）添加歌曲。
 * 返回 { ok, reason? }，reason 可能是 'duplicate' / 'not_found'
 */
function addTrackToPlaylist(playlistId, track) {
  if (!track) return { ok: false, reason: 'no_track' };

  if (playlistId === 'favorites') {
    const { favorites, toggleFav, isFav } = useFavorites();
    if (isFav(track)) return { ok: false, reason: 'duplicate' };
    toggleFav(track);
    return { ok: true };
  }

  if (playlistId === 'queue') {
    const { playQueue } = usePlayer();
    if (playQueue.value.some((t) => t.id === track.id)) {
      return { ok: false, reason: 'duplicate' };
    }
    playQueue.value.push({ ...track });
    return { ok: true };
  }

  return addTrackToCustom(playlistId, track);
}

/**
 * 取出展示用的歌单（合并 system + custom）。
 * 返回 [{ id, name, kind, icon?, count, cover, tracks, builtin }]
 */
function useAllPlaylists() {
  const { favorites } = useFavorites();
  const { playQueue } = usePlayer();

  const list = computed(() => {
    const sys = [
      {
        id: 'favorites',
        name: '我的收藏',
        kind: 'system',
        builtin: true,
        icon: '♥',
        tracks: favorites.value,
        count: favorites.value.length,
        cover: coverOf(favorites.value[0])
      },
      {
        id: 'queue',
        name: '正在播放',
        kind: 'system',
        builtin: true,
        icon: '☰',
        tracks: playQueue.value,
        count: playQueue.value.length,
        cover: coverOf(playQueue.value[0])
      }
    ];
    const custom = customPlaylists.value.map((p) => ({
      id: p.id,
      name: p.name,
      kind: 'custom',
      builtin: false,
      icon: '🎵',
      tracks: p.tracks,
      count: p.tracks.length,
      cover: coverOf(p.tracks[0]),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));
    return [...sys, ...custom];
  });

  return list;
}

/**
 * 按 id 取一个统一接口的歌单视图（含 tracks 和操作能力）。
 * 返回 reactive computed，找不到时为 null。
 */
function usePlaylistById(idRef) {
  const { favorites } = useFavorites();
  const { playQueue } = usePlayer();

  return computed(() => {
    const id = typeof idRef === 'function' ? idRef() : idRef.value;
    if (!id) return null;
    if (id === 'favorites') {
      return {
        id,
        name: '我的收藏',
        kind: 'system',
        builtin: true,
        icon: '♥',
        tracks: favorites.value
      };
    }
    if (id === 'queue') {
      return {
        id,
        name: '正在播放',
        kind: 'system',
        builtin: true,
        icon: '☰',
        tracks: playQueue.value
      };
    }
    const pl = getCustomPlaylist(id);
    if (!pl) return null;
    return {
      id: pl.id,
      name: pl.name,
      kind: 'custom',
      builtin: false,
      icon: '🎵',
      tracks: pl.tracks,
      createdAt: pl.createdAt,
      updatedAt: pl.updatedAt
    };
  });
}

export function usePlaylists() {
  init();
  return {
    customPlaylists,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    getCustomPlaylist,
    addTrackToPlaylist,
    addTrackToCustom,
    removeTrackFromCustom,
    clearCustom,
    useAllPlaylists,
    usePlaylistById
  };
}
