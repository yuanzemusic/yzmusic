<script setup>
import { ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import TrackList from '../components/TrackList.vue';
import { fetchAlbum } from '../sources/customSourceClient';
import { usePlayer } from '../composables/usePlayer';
import { useFavorites } from '../composables/useFavorites';
import { useDownloads } from '../composables/useDownloads';
import { defaultCover, formatTime } from '../utils/format';

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
const album = ref(null); // { id, name, picUrl, publishTime, description, artist, company, size, songs }

const cover = computed(() => album.value?.picUrl || defaultCover());

const totalDuration = computed(() => {
  if (!album.value) return 0;
  return (album.value.songs || []).reduce((s, t) => s + (t.duration || 0), 0);
});

async function load(id, source) {
  loading.value = true;
  error.value = '';
  album.value = null;
  try {
    if (!source) throw new Error('缺少 source，无法加载专辑');
    album.value = await fetchAlbum(source, id);
  } catch (e) {
    error.value = e.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

function playAll() {
  const songs = album.value?.songs || [];
  if (songs.length === 0) return;
  playTrack(songs[0], songs);
}

function gotoArtist() {
  if (album.value?.artist?.id) {
    router.push({ name: 'artist', params: { id: album.value.artist.id } });
  }
}

function fmtDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return (
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    );
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
      <div class="page-title">专辑</div>
    </header>

    <div class="view-content album-wrap">
      <div v-if="loading" class="empty">加载中…</div>
      <div v-else-if="error" class="empty">加载失败：{{ error }}</div>
      <template v-else-if="album">
        <!-- Hero -->
        <section class="hero">
          <img class="hero-cover" :src="cover" />
          <div class="hero-info">
            <div class="hero-kind">专辑</div>
            <h1 class="hero-name">{{ album.name }}</h1>
            <div class="hero-meta">
              <span v-if="album.artist" :class="{ 'artist-link': !!album.artist.id }" @click="gotoArtist">
                {{ album.artist.name }}
              </span>
              <template v-if="album.publishTime">
                <span class="dot">·</span>
                <span>{{ fmtDate(album.publishTime) }}</span>
              </template>
              <span class="dot">·</span>
              <span>{{ album.size }} 首</span>
              <template v-if="totalDuration">
                <span class="dot">·</span>
                <span>{{ formatTime(totalDuration) }}</span>
              </template>
            </div>
            <p v-if="album.description" class="hero-desc">{{ album.description }}</p>
            <div v-if="album.company" class="hero-company">发行公司：{{ album.company }}</div>
            <div class="hero-actions">
              <button class="btn primary" :disabled="!album.songs.length" @click="playAll">▶ 播放全部</button>
            </div>
          </div>
        </section>

        <!-- Songs -->
        <div v-if="!album.songs.length" class="empty">该专辑暂无歌曲</div>
        <TrackList
          v-else
          :tracks="album.songs"
          :current-id="currentTrack?.id"
          :playing="isPlaying"
          :loading="isLoading"
          :is-fav="isFav"
          @play="(t) => playTrack(t, album.songs)"
          @fav="toggleFav"
          @download="download"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.album-wrap {
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
  width: 200px;
  height: 200px;
  border-radius: 10px;
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
  margin: 0 0 10px;
  font-size: 26px;
  font-weight: 700;
  color: var(--text-1);
}
.hero-meta {
  font-size: 12px;
  color: var(--text-2);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.hero-meta .dot {
  color: var(--text-3);
}
.artist-link {
  color: var(--text-1);
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s;
}
.artist-link:hover {
  color: var(--primary);
}
.hero-desc {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.6;
  margin: 0 0 8px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
  white-space: pre-line;
}
.hero-company {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 12px;
}
.hero-actions {
  margin-top: auto;
  display: flex;
  gap: 10px;
}
</style>
