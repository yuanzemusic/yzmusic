<script setup>
import Sidebar from './components/Sidebar.vue';
import TopBar from './components/TopBar.vue';
import PlayerBar from './components/PlayerBar.vue';
import LyricsOverlay from './components/LyricsOverlay.vue';
import DownloadsToast from './components/DownloadsToast.vue';
import AddToPlaylistModal from './components/AddToPlaylistModal.vue';

// 侧边栏菜单项 —— 不含"在线搜索"，搜索由常驻顶栏触发
const navItems = [
  { key: 'home', label: '首页', icon: '🏠' },
  { key: 'playlists', label: '歌单', icon: '📀' },
  { key: 'favorites', label: '我的收藏', icon: '♥' },
  { key: 'queue', label: '正在播放', icon: '☰' },
  { key: 'local', label: '本地音乐', icon: '💾' },
  { key: 'downloads', label: '我的下载', icon: '⬇' },
  { key: 'settings', label: '设置', icon: '⚙' }
];
</script>

<template>
  <Sidebar :nav-items="navItems" />
  <main class="main">
    <TopBar />
    <section class="content">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </section>
    <PlayerBar />
    <DownloadsToast />
    <AddToPlaylistModal />
  </main>
  <LyricsOverlay />
</template>
