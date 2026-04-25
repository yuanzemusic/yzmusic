<script setup>
import { ref, computed, watch, toRef } from 'vue';
import { useRouter } from 'vue-router';
import TrackList from '../components/TrackList.vue';
import { usePlaylists } from '../composables/usePlaylists';
import { usePlayer } from '../composables/usePlayer';
import { useFavorites } from '../composables/useFavorites';
import { useDownloads } from '../composables/useDownloads';
import { coverOf, defaultCover, formatTime } from '../utils/format';

const props = defineProps({
  id: { type: String, required: true }
});

const router = useRouter();
const { usePlaylistById, renamePlaylist, deletePlaylist, removeTrackFromCustom, clearCustom } = usePlaylists();
const { currentTrack, isPlaying, isLoading, playTrack, clearQueue, playQueue } = usePlayer();
const { isFav, toggleFav, clearFavorites } = useFavorites();
const { download } = useDownloads();

const playlist = usePlaylistById(toRef(props, 'id'));

const editing = ref(false);
const editName = ref('');

const tracks = computed(() => playlist.value?.tracks || []);
const totalDuration = computed(() => tracks.value.reduce((s, t) => s + (t.duration || 0), 0));
const cover = computed(() => coverOf(tracks.value[0], defaultCover()));

function playAll() {
  if (tracks.value.length === 0) return;
  playTrack(tracks.value[0], tracks.value);
}

function startRename() {
  if (!playlist.value || playlist.value.builtin) return;
  editName.value = playlist.value.name;
  editing.value = true;
}
function commitRename() {
  if (!editing.value) return;
  const ok = renamePlaylist(playlist.value.id, editName.value);
  if (ok) editing.value = false;
}
function cancelRename() {
  editing.value = false;
  editName.value = '';
}

function onDeletePlaylist() {
  if (!playlist.value || playlist.value.builtin) return;
  if (!confirm(`删除歌单"${playlist.value.name}"？歌单内的歌曲不会被删除。`)) return;
  const id = playlist.value.id;
  deletePlaylist(id);
  router.replace({ name: 'playlists' });
}

function onClear() {
  if (!playlist.value) return;
  if (playlist.value.id === 'favorites') {
    clearFavorites();
  } else if (playlist.value.id === 'queue') {
    clearQueue();
  } else {
    if (!confirm('清空该歌单的所有歌曲？')) return;
    clearCustom(playlist.value.id);
  }
}

function onRemoveTrack(t) {
  if (!playlist.value) return;
  const id = playlist.value.id;
  if (id === 'favorites') {
    toggleFav(t); // 收藏列表里 fav 即"取消收藏"
  } else if (id === 'queue') {
    const i = playQueue.value.findIndex((x) => x.id === t.id);
    if (i >= 0) playQueue.value.splice(i, 1);
  } else {
    removeTrackFromCustom(id, t.id);
  }
}

// 当 id 切换或歌单被删除时复位编辑态
watch(
  () => props.id,
  () => {
    editing.value = false;
  }
);
watch(
  () => playlist.value,
  (v) => {
    if (!v) editing.value = false;
  }
);
</script>

<template>
  <div class="view">
    <header class="view-topbar">
      <div class="page-title">
        {{ playlist?.builtin ? playlist.name : '歌单' }}
      </div>
      <div class="topbar-actions">
        <span v-if="playlist" class="muted">
          {{ tracks.length }} 首
          <span v-if="totalDuration">· {{ formatTime(totalDuration) }}</span>
        </span>
      </div>
    </header>

    <div class="view-content pl-wrap">
      <div v-if="!playlist" class="empty">歌单不存在</div>
      <template v-else>
        <!-- Hero -->
        <section class="hero">
          <div class="hero-cover" :class="{ system: playlist.builtin }">
            <img v-if="cover && tracks.length > 0" :src="cover" />
            <span v-else class="hero-icon">{{ playlist.icon }}</span>
          </div>
          <div class="hero-info">
            <div class="hero-kind">
              {{ playlist.builtin ? '系统歌单' : '我的歌单' }}
            </div>

            <div v-if="!editing" class="hero-name-row">
              <h1 class="hero-name">{{ playlist.name }}</h1>
              <button v-if="!playlist.builtin" class="hero-edit-btn" title="重命名" @click="startRename">✎</button>
            </div>
            <div v-else class="hero-name-row">
              <input
                class="hero-name-input"
                v-model="editName"
                maxlength="40"
                @keydown.enter="commitRename"
                @keydown.esc="cancelRename"
              />
              <button class="btn primary" @click="commitRename">保存</button>
              <button class="btn ghost" @click="cancelRename">取消</button>
            </div>

            <div class="hero-meta">
              <span>{{ tracks.length }} 首</span>
              <template v-if="totalDuration">
                <span class="dot">·</span>
                <span>{{ formatTime(totalDuration) }}</span>
              </template>
            </div>

            <div class="hero-actions">
              <button class="btn primary" :disabled="tracks.length === 0" @click="playAll">▶ 播放全部</button>
              <button class="btn ghost" :disabled="tracks.length === 0" @click="onClear">清空</button>
              <button v-if="!playlist.builtin" class="btn ghost danger" @click="onDeletePlaylist">删除歌单</button>
            </div>
          </div>
        </section>

        <!-- Tracks -->
        <div v-if="tracks.length === 0" class="empty">
          歌单为空。在搜索 / 本地音乐 / 收藏页里点歌曲右侧的 + 即可加入。
        </div>
        <TrackList
          v-else
          :tracks="tracks"
          :current-id="currentTrack?.id"
          :playing="isPlaying"
          :loading="isLoading"
          :is-fav="isFav"
          :show-delete="playlist.builtin"
          :show-remove-from-playlist="!playlist.builtin"
          @play="(t) => playTrack(t, tracks)"
          @fav="toggleFav"
          @download="download"
          @delete="onRemoveTrack"
          @remove-from-playlist="onRemoveTrack"
        />
        <!-- 我的歌单：每行右侧 ⋯ 下拉菜单中可"从歌单中移除"（包含在线/本地），
             下拉面板提供二次确认，避免误触。 -->
      </template>
    </div>
  </div>
</template>

<style scoped>
.pl-wrap {
  padding: 24px 32px 40px;
}
.muted {
  color: var(--text-3);
  font-size: 13px;
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
  overflow: hidden;
  background: linear-gradient(135deg, var(--bg-2), var(--bg-3));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  flex-shrink: 0;
  display: grid;
  place-items: center;
}
.hero-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.hero-cover.system {
  background: linear-gradient(135deg, rgba(123, 92, 255, 0.5), rgba(255, 92, 180, 0.4));
}
.hero-icon {
  font-size: 64px;
  color: white;
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
.hero-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.hero-name {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: var(--text-1);
}
.hero-edit-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-3);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 14px;
}
.hero-edit-btn:hover {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.06);
}
.hero-name-input {
  flex: 1;
  min-width: 0;
  background: var(--bg-2);
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-1);
}
.hero-name-input:focus {
  border-color: var(--primary);
  outline: none;
}

.hero-meta {
  font-size: 12px;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
}
.hero-meta .dot {
  color: var(--text-3);
}

.hero-actions {
  margin-top: auto;
  display: flex;
  gap: 10px;
  align-items: center;
}
.btn.danger {
  color: var(--danger);
}
.btn.danger:hover {
  color: var(--danger);
  border-color: var(--danger);
}
</style>
