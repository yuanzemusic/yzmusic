<script setup>
import { ref, computed } from 'vue';
import { useAddToPlaylist } from '../composables/useAddToPlaylist';
import { usePlaylists } from '../composables/usePlaylists';
import { coverOf, defaultCover } from '../utils/format';

const { open, target, toast, close, showToast } = useAddToPlaylist();
const { useAllPlaylists, addTrackToPlaylist, createPlaylist } = usePlaylists();

const allPlaylists = useAllPlaylists();

const showCreate = ref(false);
const newName = ref('');

const trackTitle = computed(() => target.value?.title || '');
const trackArtist = computed(() => target.value?.artist || '');
const trackCover = computed(() => coverOf(target.value, defaultCover()));

function handleClose() {
  showCreate.value = false;
  newName.value = '';
  close();
}

function pick(pl) {
  if (!target.value) return;
  let r;
  try {
    r = addTrackToPlaylist(pl.id, target.value);
  } catch (e) {
    console.error('addTrackToPlaylist threw:', e);
    showToast('添加失败');
    handleClose();
    return;
  }
  if (r && r.ok) {
    showToast(`已加入"${pl.name}"`);
    handleClose();
  } else if (r && r.reason === 'duplicate') {
    showToast(`"${pl.name}"中已有该歌曲`);
  } else {
    showToast('添加失败');
  }
}

function confirmCreate() {
  const name = newName.value.trim();
  if (!name) return;
  let pl;
  try {
    pl = createPlaylist(name);
  } catch (e) {
    console.error('createPlaylist threw:', e);
    showToast('创建失败');
    handleClose();
    return;
  }
  if (pl && target.value) {
    try {
      addTrackToPlaylist(pl.id, target.value);
    } catch (e) {
      console.error('addTrackToPlaylist threw:', e);
    }
    showToast(`已创建"${pl.name}"并加入歌曲`);
    handleClose();
  }
}

function onBackdrop(e) {
  if (e.target === e.currentTarget) handleClose();
}
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="modal-backdrop" @click="onBackdrop">
      <div class="modal" @click.stop>
        <header class="modal-head">
          <div class="modal-title">添加到歌单</div>
          <button class="modal-x" @click="handleClose">×</button>
        </header>

        <div v-if="target" class="track-card">
          <img class="track-card-cover" :src="trackCover" />
          <div class="track-card-text">
            <div class="track-card-name" :title="trackTitle">{{ trackTitle }}</div>
            <div class="track-card-sub" :title="trackArtist">{{ trackArtist }}</div>
          </div>
        </div>

        <div class="pl-list">
          <div v-for="pl in allPlaylists" :key="pl.id" class="pl-item" @click="pick(pl)">
            <div class="pl-cover">
              <img v-if="pl.cover" :src="pl.cover" />
              <span v-else class="pl-icon">{{ pl.icon }}</span>
            </div>
            <div class="pl-meta">
              <div class="pl-name">{{ pl.name }}</div>
              <div class="pl-sub">
                <span v-if="pl.kind === 'system'" class="pl-tag">系统</span>
                <span>{{ pl.count }} 首</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!showCreate" class="modal-foot">
          <button class="btn primary" @click="showCreate = true">+ 新建歌单</button>
        </div>
        <div v-else class="modal-foot create-row">
          <input
            class="settings-input"
            v-model="newName"
            placeholder="输入歌单名称"
            maxlength="40"
            @keydown.enter="confirmCreate"
            ref="nameInput"
          />
          <button class="btn primary" :disabled="!newName.trim()" @click="confirmCreate">创建并添加</button>
          <button
            class="btn ghost"
            @click="
              showCreate = false;
              newName = '';
            "
          >
            取消
          </button>
        </div>
      </div>
    </div>

    <!-- 全局短消息 -->
    <transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}
.modal {
  width: 440px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 80px);
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
}
.modal-x {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-3);
  font-size: 22px;
  line-height: 1;
  border-radius: 50%;
}
.modal-x:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-1);
}

.track-card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
}
.track-card-cover {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--bg-3);
  flex-shrink: 0;
}
.track-card-text {
  min-width: 0;
  flex: 1;
}
.track-card-name {
  font-size: 13px;
  color: var(--text-1);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track-card-sub {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pl-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}
.pl-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
}
.pl-item:hover {
  background: var(--bg-2);
}
.pl-cover {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  background: linear-gradient(135deg, var(--bg-2), var(--bg-3));
  flex-shrink: 0;
  display: grid;
  place-items: center;
}
.pl-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pl-icon {
  font-size: 18px;
  color: var(--text-2);
}
.pl-meta {
  min-width: 0;
  flex: 1;
}
.pl-name {
  font-size: 13px;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pl-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}
.pl-tag {
  background: rgba(123, 92, 255, 0.18);
  color: var(--primary);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
}

.modal-foot {
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.create-row {
  gap: 8px;
  align-items: center;
}
.create-row .settings-input {
  flex: 1;
  min-width: 0;
}
.settings-input {
  background: var(--bg-2);
  border: 1px solid var(--border);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-1);
}
.settings-input:focus {
  border-color: var(--primary);
  outline: none;
}

/* Toast */
.toast {
  position: fixed;
  left: 50%;
  bottom: 110px;
  transform: translateX(-50%);
  background: rgba(20, 20, 28, 0.92);
  color: var(--text-1);
  padding: 10px 18px;
  border: 1px solid var(--border);
  border-radius: 22px;
  font-size: 13px;
  z-index: 110;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.18s;
}
</style>
