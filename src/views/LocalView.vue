<script setup>
import TrackList from '../components/TrackList.vue';
import { useLocalMusic } from '../composables/useLocalMusic';
import { usePlayer } from '../composables/usePlayer';
import { useFavorites } from '../composables/useFavorites';

const { localFolder, localTracks, scanning, chooseLocalFolder, rescan } = useLocalMusic();
const { currentTrack, isPlaying, isLoading, playTrack } = usePlayer();
const { isFav, toggleFav } = useFavorites();
</script>

<template>
  <div class="view">
    <header class="view-topbar">
      <div class="page-title">本地音乐</div>
      <div class="topbar-actions">
        <button class="btn" @click="chooseLocalFolder">选择文件夹</button>
        <button v-if="localFolder" class="btn ghost" @click="rescan">重新扫描</button>
      </div>
    </header>
    <div class="view-content">
      <div v-if="!localFolder" class="empty">
        <div>还没有添加本地音乐文件夹</div>
        <button class="btn primary" style="margin-top: 16px" @click="chooseLocalFolder">选择文件夹</button>
      </div>
      <div v-else-if="scanning" class="empty">扫描中… 已找到 {{ localTracks.length }} 首</div>
      <div v-else-if="localTracks.length === 0" class="empty">该文件夹下没有支持的音频文件</div>
      <TrackList
        v-else
        :tracks="localTracks"
        :current-id="currentTrack?.id"
        :playing="isPlaying"
        :loading="isLoading"
        :is-fav="isFav"
        @play="playTrack"
        @fav="toggleFav"
      />
    </div>
  </div>
</template>
