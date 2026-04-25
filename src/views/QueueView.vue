<script setup>
import TrackList from '../components/TrackList.vue';
import { usePlayer } from '../composables/usePlayer';
import { useFavorites } from '../composables/useFavorites';
import { useDownloads } from '../composables/useDownloads';

const { playQueue, currentTrack, isPlaying, isLoading, playTrack, clearQueue } = usePlayer();
const { isFav, toggleFav } = useFavorites();
const { download } = useDownloads();
</script>

<template>
  <div class="view">
    <header class="view-topbar">
      <div class="page-title">正在播放</div>
      <div class="topbar-actions">
        <span class="muted">共 {{ playQueue.length }} 首</span>
        <button class="btn ghost" :disabled="playQueue.length === 0" @click="clearQueue">清空</button>
      </div>
    </header>
    <div class="view-content">
      <div v-if="playQueue.length === 0" class="empty">暂无正在播放的歌曲</div>
      <TrackList
        v-else
        :tracks="playQueue"
        :current-id="currentTrack?.id"
        :playing="isPlaying"
        :loading="isLoading"
        :is-fav="isFav"
        @play="playTrack"
        @fav="toggleFav"
        @download="download"
      />
    </div>
  </div>
</template>

<style scoped>
.muted {
  color: var(--text-3);
  font-size: 13px;
}
</style>
