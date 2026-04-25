<script setup>
import TrackList from '../components/TrackList.vue';
import { useFavorites } from '../composables/useFavorites';
import { usePlayer } from '../composables/usePlayer';
import { useDownloads } from '../composables/useDownloads';

const { favorites, isFav, toggleFav } = useFavorites();
const { currentTrack, isPlaying, isLoading, playTrack } = usePlayer();
const { download } = useDownloads();
</script>

<template>
  <div class="view">
    <header class="view-topbar">
      <div class="page-title">我的收藏</div>
      <div class="topbar-actions">
        <span class="muted">共 {{ favorites.length }} 首</span>
      </div>
    </header>
    <div class="view-content">
      <div v-if="favorites.length === 0" class="empty">还没有收藏任何歌曲</div>
      <TrackList
        v-else
        :tracks="favorites"
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
