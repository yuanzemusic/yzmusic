import { ref } from 'vue';

const favorites = ref([]);
let initialized = false;

async function init() {
  if (initialized) return;
  initialized = true;
  try {
    const saved = await window.musicAPI.storeGet('favorites');
    if (saved) favorites.value = saved;
  } catch (e) {
    /* ignore */
  }
}

function isFav(t) {
  return favorites.value.some((f) => f.id === t.id);
}

function toggleFav(t) {
  const idx = favorites.value.findIndex((f) => f.id === t.id);
  if (idx >= 0) favorites.value.splice(idx, 1);
  else favorites.value.push({ ...t });
  window.musicAPI.storeSet('favorites', favorites.value);
}

function clearFavorites() {
  if (favorites.value.length === 0) return;
  if (!confirm('确定清空所有收藏吗？')) return;
  favorites.value = [];
  window.musicAPI.storeSet('favorites', []);
}

export function useFavorites() {
  init();
  return { favorites, isFav, toggleFav, clearFavorites };
}
