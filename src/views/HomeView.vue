<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useFavorites } from '../composables/useFavorites';
import { useLocalMusic } from '../composables/useLocalMusic';
import { usePlayer } from '../composables/usePlayer';
import { useSearch } from '../composables/useSearch';
import { coverOf, defaultCover } from '../utils/format';

const router = useRouter();
const { favorites } = useFavorites();
const { localTracks } = useLocalMusic();
const { playQueue, currentTrack, isPlaying, playTrack } = usePlayer();
const { keyword, doSearch } = useSearch();

// 最近收藏（数组末尾是最新加入）
const recent = computed(() => favorites.value.slice(-10).reverse());

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

const quickKeywords = ['周杰伦', '陈奕迅', '林俊杰', '邓紫棋', '张学友', '王菲', 'Taylor Swift'];

function go(name) {
  router.push({ name });
}

async function quickSearch(term) {
  keyword.value = term;
  router.push({ name: 'search' });
  await doSearch(term);
}

const fallbackCover = defaultCover();
</script>

<template>
  <div class="view">
    <header class="view-topbar">
      <div class="page-title">首页</div>
    </header>

    <div class="view-content home-wrap">
      <!-- Hero -->
      <section class="hero">
        <h1 class="hero-title">{{ greeting }}，欢迎回来 👋</h1>
        <p class="hero-subtitle">播放本地音乐、通过自定义源在线搜索、收藏你喜欢的歌曲</p>
      </section>

      <!-- Stats -->
      <section class="stats">
        <div class="stat-card" @click="go('favorites')">
          <div class="stat-icon">♥</div>
          <div class="stat-num">{{ favorites.length }}</div>
          <div class="stat-label">收藏歌曲</div>
        </div>
        <div class="stat-card" @click="go('local')">
          <div class="stat-icon">💾</div>
          <div class="stat-num">{{ localTracks.length }}</div>
          <div class="stat-label">本地歌曲</div>
        </div>
        <div class="stat-card" @click="go('queue')">
          <div class="stat-icon">☰</div>
          <div class="stat-num">{{ playQueue.length }}</div>
          <div class="stat-label">播放队列</div>
        </div>
      </section>

      <!-- Quick search -->
      <section class="block">
        <div class="block-title">热门搜索</div>
        <div class="chip-row">
          <button v-for="k in quickKeywords" :key="k" class="chip" @click="quickSearch(k)">{{ k }}</button>
        </div>
      </section>

      <!-- Recent favorites -->
      <section class="block">
        <div class="block-title">
          最近收藏
          <span v-if="favorites.length > 0" class="block-link" @click="go('favorites')">查看全部</span>
        </div>
        <div v-if="recent.length === 0" class="empty-card">还没有收藏任何歌曲，去搜索或本地音乐里找找吧 🎶</div>
        <div v-else class="card-grid">
          <div v-for="t in recent" :key="t.id" class="track-card" @click="playTrack(t)">
            <div class="track-card-cover">
              <img :src="coverOf(t, fallbackCover)" />
              <div class="track-card-overlay">
                <span v-if="currentTrack?.id === t.id && isPlaying">❚❚</span>
                <span v-else>▶</span>
              </div>
            </div>
            <div class="track-card-title" :title="t.title">{{ t.title }}</div>
            <div class="track-card-artist" :title="t.artist">{{ t.artist }}</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.home-wrap {
  padding: 28px 32px 40px;
}

.hero {
  margin-bottom: 28px;
  padding: 28px 28px;
  background: linear-gradient(135deg, rgba(123, 92, 255, 0.2), rgba(177, 92, 255, 0.05));
  border: 1px solid var(--border);
  border-radius: 14px;
}
.hero-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-1);
}
.hero-subtitle {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 32px;
  max-width: 720px;
}
.stat-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 20px;
  cursor: pointer;
  transition:
    transform 0.12s,
    border-color 0.15s,
    background 0.15s;
}
.stat-card:hover {
  transform: translateY(-2px);
  border-color: rgba(123, 92, 255, 0.4);
  background: var(--bg-2);
}
.stat-icon {
  font-size: 22px;
  color: var(--primary);
  margin-bottom: 8px;
}
.stat-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-1);
}
.stat-label {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
}

.block {
  margin-bottom: 32px;
}
.block-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 14px;
  letter-spacing: 0.3px;
}
.block-link {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.15s;
}
.block-link:hover {
  color: var(--primary);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  height: 30px;
  padding: 0 14px;
  border-radius: 15px;
  border: 1px solid var(--border);
  background: var(--bg-2);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.chip:hover {
  background: rgba(123, 92, 255, 0.15);
  border-color: var(--primary);
  color: var(--text-1);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}
.track-card {
  cursor: pointer;
  padding: 8px;
  border-radius: 10px;
  transition: background 0.15s;
}
.track-card:hover {
  background: var(--bg-2);
}
.track-card:hover .track-card-overlay {
  opacity: 1;
}
.track-card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
  background: var(--bg-3);
}
.track-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.track-card-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 26px;
  opacity: 0;
  transition: opacity 0.15s;
}
.track-card-title {
  font-size: 13px;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track-card-artist {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.empty-card {
  padding: 40px;
  text-align: center;
  background: var(--bg-1);
  border: 1px dashed var(--border);
  border-radius: 12px;
  color: var(--text-3);
  font-size: 13px;
}
</style>
