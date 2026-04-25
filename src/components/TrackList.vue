<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { formatTime } from '../utils/format';
import { useAddToPlaylist } from '../composables/useAddToPlaylist';

defineProps({
  tracks: { type: Array, required: true },
  currentId: { type: String, default: null },
  playing: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  isFav: { type: Function, required: true },
  // 在"我的下载"等本地清单页里展示删除按钮（type='local' 才生效）
  showDelete: { type: Boolean, default: false },
  // 我的歌单页：用下拉菜单承载"从歌单中移除"，避免误触
  showRemoveFromPlaylist: { type: Boolean, default: false }
});
const emit = defineEmits(['play', 'fav', 'download', 'delete', 'remove-from-playlist']);

const router = useRouter();
const { openFor: openAddToPlaylist } = useAddToPlaylist();

const openMenuId = ref(null);
function toggleMenu(id) {
  openMenuId.value = openMenuId.value === id ? null : id;
}
function closeMenu() {
  openMenuId.value = null;
}

function onMenuDownload(t) {
  closeMenu();
  emit('download', t);
}
function onMenuRemove(t) {
  closeMenu();
  emit('remove-from-playlist', t);
}

function onDocClick(e) {
  if (!e.target.closest('.row-menu')) closeMenu();
}
function onKeyDown(e) {
  if (e.key === 'Escape') closeMenu();
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKeyDown);
});

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
</script>

<template>
  <div class="track-list">
    <div class="track-row track-row-head">
      <div class="col col-idx">#</div>
      <div class="col col-title">标题</div>
      <div class="col col-artist">艺术家</div>
      <div class="col col-album">专辑</div>
      <div class="col col-dur">时长</div>
      <div class="col col-act"></div>
      <div class="col col-act"></div>
      <div class="col col-act"></div>
    </div>

    <div
      v-for="(t, i) in tracks"
      :key="t.id"
      class="track-row"
      :class="{ active: t.id === currentId }"
      @dblclick="emit('play', t, tracks)"
    >
      <div class="col col-idx">
        <span v-if="t.id === currentId && loading" class="row-spinner"></span>
        <span v-else-if="t.id === currentId && playing" class="playing-indicator">♪</span>
        <span v-else class="row-index">{{ i + 1 }}</span>
      </div>
      <div class="col col-title">
        <div class="cover-cell" @click="emit('play', t, tracks)">
          <img v-if="t.picture || t.cover" class="row-cover" :src="t.picture || t.cover" />
          <div v-else class="row-cover placeholder">♪</div>
          <div class="cover-overlay">
            <span v-if="t.id === currentId && loading" class="row-spinner light"></span>
            <span v-else class="cover-icon">{{ t.id === currentId && playing ? '❚❚' : '▶' }}</span>
          </div>
        </div>
        <div class="title-text">
          <div class="t1">{{ t.title }}</div>
          <div class="t2" v-if="t.type === 'online'">在线</div>
        </div>
      </div>
      <div class="col col-artist">
        <template v-if="t.artists && t.artists.length">
          <template v-for="(a, ai) in t.artists" :key="a.id || a.name + ai">
            <span class="link" :class="{ disabled: !a.id }" @click.stop="gotoArtist(t, a.id)">{{ a.name }}</span>
            <span v-if="ai < t.artists.length - 1" class="sep">,</span>
          </template>
        </template>
        <span v-else>{{ t.artist }}</span>
      </div>
      <div class="col col-album">
        <span v-if="t.albumId" class="link" @click.stop="gotoAlbum(t)">{{ t.album }}</span>
        <span v-else>{{ t.album }}</span>
      </div>
      <div class="col col-dur">{{ formatTime(t.duration) }}</div>
      <div class="col col-act">
        <template v-if="showRemoveFromPlaylist">
          <div class="row-menu">
            <button
              class="icon-btn"
              :class="{ active: openMenuId === t.id }"
              title="更多"
              @click.stop="toggleMenu(t.id)"
            >
              ⋯
            </button>
            <div v-if="openMenuId === t.id" class="menu-panel" @click.stop>
              <button v-if="t.type === 'online'" class="menu-item" @click="onMenuDownload(t)">
                <span class="menu-icon">⬇</span>
                下载
              </button>
              <button class="menu-item danger" @click="onMenuRemove(t)">
                <span class="menu-icon">🗑</span>
                从歌单中移除
              </button>
            </div>
          </div>
        </template>
        <template v-else>
          <button v-if="t.type === 'online'" class="icon-btn" title="下载" @click="emit('download', t)">⬇</button>
          <button
            v-else-if="showDelete && t.type === 'local'"
            class="icon-btn danger"
            title="移到回收站"
            @click="emit('delete', t)"
          >
            🗑
          </button>
        </template>
      </div>
      <div class="col col-act">
        <button class="icon-btn" title="添加到歌单" @click="openAddToPlaylist(t)">+</button>
      </div>
      <div class="col col-act">
        <button class="icon-btn" :class="{ faved: isFav(t) }" @click="emit('fav', t)">
          {{ isFav(t) ? '♥' : '♡' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.track-list {
  display: flex;
  flex-direction: column;
}

.track-row {
  display: grid;
  grid-template-columns: 40px 2fr 1fr 1fr 60px 36px 36px 36px;
  gap: 12px;
  align-items: center;
  padding: 6px 12px;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 13px;
  cursor: default;
  transition: background 0.12s;
}
.track-row:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-1);
}
.track-row.active {
  background: rgba(123, 92, 255, 0.12);
  color: var(--text-1);
}
.track-row.active .col-title .t1 {
  color: var(--primary);
}

.track-row-head {
  position: sticky;
  top: 0;
  background: var(--bg-0);
  color: var(--text-3);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 12px;
  border-bottom: 1px solid var(--border);
  z-index: 1;
}
.track-row-head:hover {
  background: var(--bg-0);
  color: var(--text-3);
}

.col-idx {
  text-align: center;
}
.col-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.title-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.title-text .t1 {
  color: var(--text-1);
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.title-text .t2 {
  font-size: 10px;
  color: var(--text-3);
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 6px;
  border-radius: 3px;
  width: fit-content;
  margin-top: 2px;
}
.col-artist,
.col-album {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.col-artist .link,
.col-album .link {
  cursor: pointer;
  transition: color 0.15s;
}
.col-artist .link:hover,
.col-album .link:hover {
  color: var(--primary);
  text-decoration: underline;
}
.col-artist .link.disabled {
  cursor: default;
  text-decoration: none;
}
.col-artist .link.disabled:hover {
  color: inherit;
  text-decoration: none;
}
.col-artist .sep {
  color: var(--text-3);
}
.col-dur {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.col-act {
  display: flex;
  justify-content: center;
  align-items: center;
}

.cover-cell {
  position: relative;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
}
.row-cover {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  object-fit: cover;
  background: var(--bg-3);
  display: block;
}
.row-cover.placeholder {
  display: grid;
  place-items: center;
  color: var(--text-3);
  background: linear-gradient(135deg, var(--bg-2), var(--bg-3));
}
.cover-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  color: white;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}
.track-row:hover .cover-overlay,
.track-row.active .cover-overlay {
  opacity: 1;
}
.cover-cell:hover .cover-overlay {
  background: rgba(123, 92, 255, 0.7);
}

.icon-btn {
  font-size: 16px;
  color: var(--text-3);
  padding: 4px 6px;
  border-radius: 4px;
  transition: color 0.15s;
  background: none;
  border: none;
  cursor: pointer;
}
.icon-btn:hover {
  color: var(--text-1);
}
.icon-btn.faved {
  color: var(--danger);
}
.icon-btn.danger:hover {
  color: var(--danger);
}
.icon-btn.active {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.08);
}

.row-menu {
  position: relative;
  display: inline-flex;
}
.menu-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 160px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  padding: 6px;
  z-index: 30;
  display: flex;
  flex-direction: column;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-1);
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 6px;
  text-align: left;
  white-space: nowrap;
}
.menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
.menu-item.danger {
  color: var(--danger);
}
.menu-item.danger:hover {
  background: rgba(220, 60, 60, 0.14);
}
.menu-icon {
  font-size: 14px;
  width: 16px;
  display: inline-flex;
  justify-content: center;
}

.playing-indicator {
  color: var(--primary);
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.row-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(123, 92, 255, 0.25);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: row-spin 0.8s linear infinite;
}
.row-spinner.light {
  border-color: rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
}
@keyframes row-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
