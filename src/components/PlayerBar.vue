<script setup>
import { useRouter } from 'vue-router';
import { usePlayer } from '../composables/usePlayer';
import { useFavorites } from '../composables/useFavorites';
import { useDownloads } from '../composables/useDownloads';
import { formatTime } from '../utils/format';

const {
  currentTrack,
  isPlaying,
  isLoading,
  currentTime,
  duration,
  volume,
  modeIcon,
  modeTitle,
  coverUrl,
  progressPct,
  showLyrics,
  togglePlay,
  next,
  prev,
  cyclePlayMode,
  seekTo
} = usePlayer();

const { isFav, toggleFav } = useFavorites();
const { download } = useDownloads();

const router = useRouter();
function gotoArtist(t, artistId) {
  if (!artistId) return;
  const source = t?.source || '';
  router.push({
    name: 'artist',
    params: { id: artistId },
    query: source ? { source } : {}
  });
}
function gotoAlbum(t) {
  if (!t?.albumId) return;
  const source = t.source || '';
  router.push({
    name: 'album',
    params: { id: t.albumId },
    query: source ? { source } : {}
  });
}

function onSeek(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  seekTo(pct * duration.value);
}

function toggleLyrics() {
  if (currentTrack.value) showLyrics.value = !showLyrics.value;
}
</script>

<template>
  <footer class="player-bar">
    <div class="now-playing">
      <div class="cover-wrap" @click="toggleLyrics">
        <img class="cover" :src="coverUrl" />
        <div v-if="isLoading" class="cover-loading"><span class="spinner"></span></div>
      </div>
      <div class="np-info">
        <div class="np-title" @click="toggleLyrics">{{ currentTrack ? currentTrack.title : '没有歌曲在播放' }}</div>
        <div class="np-artist">
          <template v-if="currentTrack && currentTrack.artists && currentTrack.artists.length">
            <template v-for="(a, ai) in currentTrack.artists" :key="a.id || a.name + ai">
              <span class="np-link" :class="{ disabled: !a.id }" @click.stop="gotoArtist(currentTrack, a.id)">
                {{ a.name }}
              </span>
              <span v-if="ai < currentTrack.artists.length - 1" class="sep">,</span>
            </template>
            <template v-if="currentTrack.albumId">
              <span class="sep">·</span>
              <span class="np-link" @click.stop="gotoAlbum(currentTrack)">{{ currentTrack.album }}</span>
            </template>
          </template>
          <span v-else>{{ currentTrack ? currentTrack.artist : '' }}</span>
        </div>
      </div>
      <button
        class="np-fav"
        :class="{ faved: currentTrack && isFav(currentTrack) }"
        :disabled="!currentTrack"
        :title="currentTrack && isFav(currentTrack) ? '取消收藏' : '收藏'"
        @click.stop="currentTrack && toggleFav(currentTrack)"
      >
        {{ currentTrack && isFav(currentTrack) ? '♥' : '♡' }}
      </button>
      <button
        class="np-dl"
        :disabled="!currentTrack || currentTrack.type !== 'online'"
        :title="
          !currentTrack ? '没有播放中的歌曲' : currentTrack.type !== 'online' ? '本地歌曲已在磁盘上' : '下载到本地'
        "
        @click.stop="currentTrack && download(currentTrack)"
      >
        ⬇
      </button>
    </div>

    <div class="controls">
      <div class="ctrl-buttons">
        <button class="ctrl-btn" :title="modeTitle" @click="cyclePlayMode">{{ modeIcon }}</button>
        <button class="ctrl-btn" @click="prev" title="上一首">⏮</button>
        <button
          class="ctrl-btn play"
          @click="togglePlay()"
          :disabled="isLoading"
          :title="isLoading ? '加载中…' : isPlaying ? '暂停' : '播放'"
        >
          <span v-if="isLoading" class="spinner dark"></span>
          <span v-else>{{ isPlaying ? '❚❚' : '▶' }}</span>
        </button>
        <button class="ctrl-btn" @click="next" title="下一首">⏭</button>
        <button class="ctrl-btn" @click="showLyrics = !showLyrics" title="歌词">词</button>
      </div>
      <div class="progress">
        <span class="time">{{ formatTime(currentTime) }}</span>
        <div class="progress-bar" @click="onSeek">
          <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
          <div class="progress-thumb" :style="{ left: progressPct + '%' }"></div>
        </div>
        <span class="time">{{ formatTime(duration) }}</span>
      </div>
    </div>

    <div class="extra">
      <span class="vol-icon">🔊</span>
      <input type="range" min="0" max="100" v-model.number="volume" class="vol-slider" />
    </div>
  </footer>
</template>

<style scoped>
.player-bar {
  background: linear-gradient(180deg, var(--bg-1), var(--bg-0));
  border-top: 1px solid var(--border);
  display: grid;
  grid-template-columns: 280px 1fr 200px;
  align-items: center;
  padding: 0 20px;
  gap: 24px;
  position: relative;
  z-index: 20;
  flex-shrink: 0;
}

.now-playing {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.cover-wrap {
  position: relative;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  cursor: pointer;
}
.cover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--bg-3);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  display: block;
}
.cover-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
}
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
.spinner.dark {
  border-color: rgba(0, 0, 0, 0.25);
  border-top-color: var(--bg-0);
  width: 14px;
  height: 14px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.np-info {
  min-width: 0;
  flex: 1;
}
.np-title {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s;
  cursor: pointer;
}
.np-info:hover .np-title {
  color: var(--primary);
}
.np-artist {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.np-artist .np-link {
  cursor: pointer;
  transition: color 0.15s;
}
.np-artist .np-link:hover {
  color: var(--text-1);
  text-decoration: underline;
}
.np-artist .np-link.disabled {
  cursor: default;
}
.np-artist .np-link.disabled:hover {
  color: var(--text-3);
  text-decoration: none;
}
.np-artist .sep {
  color: var(--text-3);
}

.np-fav {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 18px;
  color: var(--text-3);
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}
.np-fav:hover:not(:disabled) {
  color: var(--danger);
  background: rgba(255, 77, 109, 0.1);
  transform: scale(1.08);
}
.np-fav.faved {
  color: var(--danger);
  text-shadow: 0 0 12px rgba(255, 77, 109, 0.6);
}
.np-fav.faved:hover {
  background: rgba(255, 77, 109, 0.15);
}
.np-fav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.np-dl {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 14px;
  color: var(--text-3);
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}
.np-dl:hover:not(:disabled) {
  color: var(--primary);
  background: rgba(123, 92, 255, 0.12);
  transform: translateY(1px);
}
.np-dl:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.ctrl-buttons {
  display: flex;
  align-items: center;
  gap: 16px;
}
.ctrl-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--text-2);
  font-size: 14px;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.ctrl-btn:hover {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.06);
}
.ctrl-btn.play {
  width: 38px;
  height: 38px;
  background: var(--text-1);
  color: var(--bg-0);
  font-size: 13px;
}
.ctrl-btn.play:hover {
  transform: scale(1.06);
  background: white;
}

.progress {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 600px;
}
.time {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  width: 38px;
  text-align: center;
}
.progress-bar {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  position: relative;
  cursor: pointer;
}
.progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, var(--primary), var(--primary-2));
  border-radius: 2px;
  transition: width 0.1s linear;
}
.progress-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.progress-bar:hover .progress-thumb {
  opacity: 1;
}

.extra {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.vol-icon {
  color: var(--text-3);
  font-size: 14px;
}
.vol-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100px;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  cursor: pointer;
}
.vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
}
</style>
