<script setup>
import { ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import TrackList from '../components/TrackList.vue';
import { fetchArtistDetail, fetchArtistAlbums } from '../sources/customSourceClient';
import { usePlayer } from '../composables/usePlayer';
import { useFavorites } from '../composables/useFavorites';
import { useDownloads } from '../composables/useDownloads';
import { defaultCover } from '../utils/format';

const props = defineProps({
  id: { type: [String, Number], required: true },
  source: { type: String, default: '' }
});

const router = useRouter();
const { currentTrack, isPlaying, isLoading, playTrack } = usePlayer();
const { isFav, toggleFav } = useFavorites();
const { download } = useDownloads();

const loading = ref(false);
const error = ref('');
const artist = ref(null); // { id, name, picUrl, briefDesc, alias, musicSize, albumSize, hotSongs }
const albums = ref([]); // [{ id, name, picUrl, publishTime, size }]
const albumsLoading = ref(false);
const tab = ref('songs'); // 'songs' | 'albums'

const cover = computed(() => artist.value?.picUrl || defaultCover());

async function load(id, source) {
  loading.value = true;
  error.value = '';
  artist.value = null;
  albums.value = [];
  try {
    if (!source) throw new Error('缺少 source，无法加载艺术家');
    artist.value = await fetchArtistDetail(source, id);
  } catch (e) {
    error.value = e.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadAlbums() {
  if (!artist.value || albums.value.length > 0 || albumsLoading.value) return;
  albumsLoading.value = true;
  try {
    if (!props.source) return;
    albums.value = await fetchArtistAlbums(props.source, artist.value.id);
  } catch (e) {
    // 静默失败：tab 切回去就行
  } finally {
    albumsLoading.value = false;
  }
}

function switchTab(t) {
  tab.value = t;
  if (t === 'albums') loadAlbums();
}

function gotoAlbum(al) {
  const source = al.source || props.source || '';
  router.push({
    name: 'album',
    params: { id: al.id },
    query: source ? { source } : {}
  });
}

function playAll() {
  const songs = artist.value?.hotSongs || [];
  if (songs.length === 0) return;
  // 把热门歌曲作为整个播放列表，从第一首开始
  playTrack(songs[0], songs);
}

function fmtYear(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).getFullYear();
  } catch {
    return '';
  }
}

watch(
  () => [props.id, props.source],
  ([id, source]) => {
    if (id) load(id, source);
  },
  { immediate: true }
);
</script>

<template>
  <div class="view">
    <header class="view-topbar">
      <div class="page-title">艺术家</div>
    </header>

    <div class="view-content artist-wrap">
      <div v-if="loading" class="empty">加载中…</div>
      <div v-else-if="error" class="empty">加载失败：{{ error }}</div>
      <template v-else-if="artist">
        <!-- Hero -->
        <section class="hero">
          <img class="hero-cover" :src="cover" />
          <div class="hero-info">
            <div class="hero-kind">艺术家</div>
            <h1 class="hero-name">{{ artist.name }}</h1>
            <div v-if="artist.alias.length" class="hero-alias">{{ artist.alias.join(' / ') }}</div>
            <div class="hero-meta">
              <span>{{ artist.musicSize }} 首歌曲</span>
              <span class="dot">·</span>
              <span>{{ artist.albumSize }} 张专辑</span>
            </div>
            <p v-if="artist.briefDesc" class="hero-desc">{{ artist.briefDesc }}</p>
            <div class="hero-actions">
              <button class="btn primary" :disabled="!artist.hotSongs.length" @click="playAll">▶ 播放热门</button>
            </div>
          </div>
        </section>

        <!-- Tabs -->
        <div class="tabs">
          <button class="tab" :class="{ active: tab === 'songs' }" @click="switchTab('songs')">热门歌曲</button>
          <button class="tab" :class="{ active: tab === 'albums' }" @click="switchTab('albums')">专辑</button>
        </div>

        <!-- Songs tab -->
        <div v-show="tab === 'songs'">
          <div v-if="!artist.hotSongs.length" class="empty">暂无热门歌曲</div>
          <TrackList
            v-else
            :tracks="artist.hotSongs"
            :current-id="currentTrack?.id"
            :playing="isPlaying"
            :loading="isLoading"
            :is-fav="isFav"
            @play="playTrack"
            @fav="toggleFav"
            @download="download"
          />
        </div>

        <!-- Albums tab -->
        <div v-show="tab === 'albums'">
          <div v-if="albumsLoading" class="empty">加载中…</div>
          <div v-else-if="albums.length === 0" class="empty">暂无专辑</div>
          <div v-else class="album-grid">
            <div v-for="al in albums" :key="al.id" class="album-card" @click="gotoAlbum(al)">
              <div class="album-card-cover">
                <img :src="al.picUrl || defaultCover()" />
              </div>
              <div class="album-card-name" :title="al.name">{{ al.name }}</div>
              <div class="album-card-sub">
                <span v-if="fmtYear(al.publishTime)">{{ fmtYear(al.publishTime) }}</span>
                <span v-if="al.size">· {{ al.size }} 首</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.artist-wrap {
  padding: 24px 32px 40px;
}

.hero {
  display: flex;
  gap: 28px;
  margin-bottom: 28px;
  padding: 24px;
  background: linear-gradient(135deg, rgba(123, 92, 255, 0.18), rgba(177, 92, 255, 0.04));
  border: 1px solid var(--border);
  border-radius: 14px;
}
.hero-cover {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg-3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  flex-shrink: 0;
}
.hero-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.hero-kind {
  font-size: 11px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 4px;
}
.hero-name {
  margin: 0 0 6px;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-1);
}
.hero-alias {
  font-size: 13px;
  color: var(--text-3);
  margin-bottom: 10px;
}
.hero-meta {
  font-size: 12px;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.hero-meta .dot {
  color: var(--text-3);
}
.hero-desc {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.6;
  margin: 0 0 16px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
.hero-actions {
  margin-top: auto;
  display: flex;
  gap: 10px;
}

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}
.tab {
  padding: 10px 16px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-3);
  font-size: 13px;
  position: relative;
  transition: color 0.15s;
}
.tab:hover {
  color: var(--text-1);
}
.tab.active {
  color: var(--text-1);
  font-weight: 600;
}
.tab.active::after {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: -1px;
  height: 2px;
  background: var(--primary);
  border-radius: 1px;
}

.album-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 18px;
}
.album-card {
  cursor: pointer;
  padding: 8px;
  border-radius: 10px;
  transition: background 0.15s;
}
.album-card:hover {
  background: var(--bg-2);
}
.album-card-cover {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
  background: var(--bg-3);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}
.album-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.album-card-name {
  font-size: 13px;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.album-card-sub {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}
</style>
