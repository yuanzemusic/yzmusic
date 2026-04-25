<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayer } from '../composables/usePlayer';
import { useFavorites } from '../composables/useFavorites';
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
  lyricsLines,
  activeLyricIndex,
  showLyrics,
  togglePlay,
  next,
  prev,
  cyclePlayMode,
  seekTo
} = usePlayer();

const { isFav, toggleFav } = useFavorites();
const router = useRouter();

const bodyRef = ref(null);
const innerRef = ref(null);
const translateY = ref(0);

function recenterActive() {
  if (!bodyRef.value || !innerRef.value) return;
  const idx = activeLyricIndex.value;
  if (idx < 0) {
    translateY.value = 0;
    return;
  }
  const el = innerRef.value.querySelector(`[data-index="${idx}"]`);
  if (!el) return;
  const targetY = bodyRef.value.clientHeight * 0.3;
  const elCenter = el.offsetTop + el.clientHeight / 2;
  translateY.value = targetY - elCenter;
}

watch([activeLyricIndex, lyricsLines], async () => {
  if (!showLyrics.value) return;
  await nextTick();
  recenterActive();
});

watch(showLyrics, async (v) => {
  if (!v) return;
  await nextTick();
  recenterActive();
});

onMounted(() => {
  window.addEventListener('resize', recenterActive);
});
onUnmounted(() => {
  window.removeEventListener('resize', recenterActive);
});

function onSeek(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  seekTo(pct * duration.value);
}

function gotoQueue() {
  showLyrics.value = false;
  router.push({ name: 'queue' });
}

function onKey(e) {
  if (!showLyrics.value) return;
  if (e.key === 'Escape') showLyrics.value = false;
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <transition name="fade">
    <div v-if="showLyrics" class="lf-root">
      <div class="lf-bg" :style="{ backgroundImage: `url(${coverUrl})` }"></div>
      <div class="lf-bg-overlay"></div>

      <div class="lf-stage">
        <div class="lf-cover-col">
          <div class="lf-cover-wrap">
            <img class="lf-cover" :src="coverUrl" />
            <div v-if="isLoading" class="lf-cover-loading"><span class="lf-spinner"></span></div>
          </div>
        </div>

        <div class="lf-meta">
          <div class="lf-title">{{ currentTrack ? currentTrack.title : '——' }}</div>
          <div class="lf-artist">{{ currentTrack ? currentTrack.artist : '' }}</div>
        </div>

        <div class="lf-lyrics-col">
          <div class="lf-lines" ref="bodyRef">
            <div v-if="lyricsLines.length === 0" class="lf-empty">暂无歌词</div>
            <div
              v-else
              class="lf-lines-inner"
              ref="innerRef"
              :style="{ transform: `translateY(${translateY}px)` }"
            >
              <div
                v-for="(line, i) in lyricsLines"
                :key="i"
                :class="['lf-line', { active: i === activeLyricIndex }]"
                :data-index="i"
                @click="seekTo(line.time)"
              >
                {{ line.text || ' ' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="lf-footer">
        <div class="lf-foot-left">
          <button class="lf-icon-btn lf-collapse" title="收起" @click="showLyrics = false">⇲</button>
          <div class="lf-foot-track">
            <div class="lf-foot-title">
              {{ currentTrack ? currentTrack.title : '' }}
              <span v-if="currentTrack" class="lf-sep">—</span>
              <span v-if="currentTrack" class="lf-foot-artist">{{ currentTrack.artist }}</span>
            </div>
            <div class="lf-foot-actions">
              <button
                class="lf-icon-btn"
                :class="{ faved: currentTrack && isFav(currentTrack) }"
                :disabled="!currentTrack"
                :title="currentTrack && isFav(currentTrack) ? '取消收藏' : '收藏'"
                @click="currentTrack && toggleFav(currentTrack)"
              >
                {{ currentTrack && isFav(currentTrack) ? '♥' : '♡' }}
              </button>
            </div>
          </div>
        </div>

        <div class="lf-foot-center">
          <div class="lf-controls">
            <button class="lf-ctrl" :title="modeTitle" @click="cyclePlayMode">{{ modeIcon }}</button>
            <button class="lf-ctrl" title="上一首" @click="prev">⏮</button>
            <button
              class="lf-ctrl lf-play"
              :disabled="isLoading"
              :title="isLoading ? '加载中…' : isPlaying ? '暂停' : '播放'"
              @click="togglePlay()"
            >
              <span v-if="isLoading" class="lf-spinner dark"></span>
              <span v-else>{{ isPlaying ? '❚❚' : '▶' }}</span>
            </button>
            <button class="lf-ctrl" title="下一首" @click="next">⏭</button>
            <div class="lf-volume">
              <span class="lf-vol-icon">🔊</span>
              <input type="range" min="0" max="100" v-model.number="volume" class="lf-vol-slider" />
            </div>
          </div>
          <div class="lf-progress">
            <span class="lf-time">{{ formatTime(currentTime) }}</span>
            <div class="lf-bar" @click="onSeek">
              <div class="lf-bar-fill" :style="{ width: progressPct + '%' }"></div>
              <div class="lf-bar-thumb" :style="{ left: progressPct + '%' }"></div>
            </div>
            <span class="lf-time">{{ formatTime(duration) }}</span>
          </div>
        </div>

        <div class="lf-foot-right">
          <button class="lf-icon-btn" title="正在播放" @click="gotoQueue">☰</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.lf-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  color: var(--text-1);
  overflow: hidden;
  background: var(--bg-0);
}

.lf-bg {
  position: absolute;
  inset: -10%;
  background-size: cover;
  background-position: center;
  filter: blur(80px) brightness(0.55) saturate(1.1);
  transform: scale(1.2);
  transition: background-image 0.4s ease;
}
.lf-bg-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(13, 14, 18, 0.45) 0%, rgba(13, 14, 18, 0.85) 100%);
}

.lf-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: calc(50% - min(160px, 14vw) + 20px) 1fr;
  column-gap: 40px;
  padding: 40px 80px 20px;
}

.lf-cover-col {
  grid-column: 1;
  grid-row: 1 / 3;
  align-self: center;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
.lf-cover-wrap {
  position: relative;

  width: min(380px, 35vw);

  aspect-ratio: 1;
}
.lf-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
}
.lf-cover-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 16px;
}

.lf-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: lf-spin 0.8s linear infinite;
  display: inline-block;
}
.lf-spinner.dark {
  width: 16px;
  height: 16px;
  border-color: rgba(0, 0, 0, 0.25);
  border-top-color: #fff;
}
@keyframes lf-spin {
  to {
    transform: rotate(360deg);
  }
}

.lf-lyrics-col {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 620px;
  width: 100%;
  padding: 0;
  text-align: center;
  justify-self: center;
}
.lf-meta {
  grid-column: 2;
  grid-row: 1;
  align-self: end;
  justify-self: center;
  max-width: 620px;
  width: 100%;
  padding: 0 0 18px;
  text-align: center;
}
.lf-title {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.lf-artist {
  font-size: 15px;
  color: var(--text-3);
  margin-top: 10px;
}

.lf-lines {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, black 20%, black 80%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0%, black 20%, black 80%, transparent 100%);
}
.lf-lines-inner {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  will-change: transform;
  transition: transform 0.55s cubic-bezier(0.33, 1, 0.68, 1);
}

.lf-line {
  font-size: 18px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.32);
  padding: 12px 0;
  cursor: pointer;
  text-align: center;
  transition:
    color 0.3s,
    font-size 0.3s,
    font-weight 0.3s,
    transform 0.3s;
  transform-origin: center center;
}
.lf-line:hover {
  color: rgba(255, 255, 255, 0.65);
}
.lf-line.active {
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  transform: scale(1.02);
}
.lf-empty {
  color: var(--text-3);
  font-size: 14px;
  text-align: center;
  padding: 60px 0;
}

/* Footer */
.lf-footer {
  position: relative;
  display: grid;
  grid-template-columns: 1fr minmax(auto, 640px) 1fr;
  align-items: center;
  gap: 24px;
  padding: 16px 28px 22px;
}

.lf-foot-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.lf-collapse {
  font-size: 18px;
}
.lf-foot-track {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lf-foot-title {
  font-size: 13px;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lf-sep {
  color: var(--text-3);
  margin: 0 4px;
}
.lf-foot-artist {
  color: var(--text-3);
}
.lf-foot-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.lf-foot-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.lf-controls {
  display: flex;
  align-items: center;
  gap: 18px;
}
.lf-ctrl {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--text-2);
  font-size: 16px;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.lf-ctrl:hover:not(:disabled) {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}
.lf-ctrl.lf-play {
  width: 52px;
  height: 52px;
  background: var(--danger);
  color: #fff;
  font-size: 18px;
  box-shadow: 0 8px 24px rgba(255, 77, 109, 0.45);
}
.lf-ctrl.lf-play:hover:not(:disabled) {
  transform: scale(1.06);
  background: #ff6680;
}
.lf-ctrl.lf-play:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.lf-volume {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}
.lf-vol-icon {
  color: var(--text-3);
  font-size: 13px;
}
.lf-vol-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 90px;
  height: 4px;
  background: rgba(255, 255, 255, 0.14);
  border-radius: 2px;
  cursor: pointer;
}
.lf-vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
}

.lf-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.lf-time {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  width: 40px;
  text-align: center;
}
.lf-bar {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.14);
  border-radius: 2px;
  position: relative;
  cursor: pointer;
}
.lf-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--danger);
  border-radius: 2px;
  transition: width 0.1s linear;
}
.lf-bar-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.lf-bar:hover .lf-bar-thumb {
  opacity: 1;
}

.lf-foot-right {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}
.lf-icon-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  background: none;
  border: none;
  border-radius: 50%;
  color: var(--text-2);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
}
.lf-icon-btn:hover:not(:disabled) {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}
.lf-icon-btn.faved {
  color: var(--danger);
  text-shadow: 0 0 12px rgba(255, 77, 109, 0.6);
}
.lf-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Narrower screens: stack cover above lyrics */
@media (max-width: 900px) {
  .lf-stage {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr;
    padding: 40px 32px 16px;
    column-gap: 0;
    row-gap: 16px;
  }
  .lf-cover-col {
    grid-column: 1;
    grid-row: 1;
    justify-content: center;
  }
  .lf-cover-wrap {
    width: min(220px, 55vw);
  }
  .lf-meta {
    grid-column: 1;
    grid-row: 2;
    align-self: start;
    max-width: none;
    padding-bottom: 0;
  }
  .lf-lyrics-col {
    grid-column: 1;
    grid-row: 3;
    padding: 0;
    max-width: none;
  }
}
</style>
