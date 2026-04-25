<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlaylists } from '../composables/usePlaylists';
import { defaultCover } from '../utils/format';

const router = useRouter();
const { useAllPlaylists, createPlaylist, deletePlaylist } = usePlaylists();
const allPlaylists = useAllPlaylists();

const showCreate = ref(false);
const newName = ref('');

const systemList = computed(() => allPlaylists.value.filter((p) => p.kind === 'system'));
const customList = computed(() => allPlaylists.value.filter((p) => p.kind === 'custom'));

function open(pl) {
  router.push({ name: 'playlist', params: { id: pl.id } });
}

function confirmCreate() {
  const name = newName.value.trim();
  if (!name) return;
  const pl = createPlaylist(name);
  newName.value = '';
  showCreate.value = false;
  if (pl) router.push({ name: 'playlist', params: { id: pl.id } });
}

function cancelCreate() {
  showCreate.value = false;
  newName.value = '';
}

function onDelete(pl, e) {
  e.stopPropagation();
  if (!confirm(`删除歌单"${pl.name}"？歌单内的歌曲不会被删除。`)) return;
  deletePlaylist(pl.id);
}

function fmtDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return (
      d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0')
    );
  } catch {
    return '';
  }
}
</script>

<template>
  <div class="view">
    <header class="view-topbar">
      <div class="page-title">歌单</div>
      <div class="topbar-actions">
        <button class="btn primary" @click="showCreate = true">+ 新建歌单</button>
      </div>
    </header>

    <div class="view-content pl-wrap">
      <!-- 新建歌单输入栏 -->
      <div v-if="showCreate" class="create-bar">
        <input
          class="settings-input"
          v-model="newName"
          placeholder="输入歌单名称"
          maxlength="40"
          @keydown.enter="confirmCreate"
          @keydown.esc="cancelCreate"
        />
        <button class="btn primary" :disabled="!newName.trim()" @click="confirmCreate">创建</button>
        <button class="btn ghost" @click="cancelCreate">取消</button>
      </div>

      <!-- 系统歌单 -->
      <section class="block">
        <div class="block-title">系统歌单</div>
        <div class="card-grid">
          <div v-for="pl in systemList" :key="pl.id" class="pl-card system" @click="open(pl)">
            <div class="pl-cover">
              <img v-if="pl.cover" :src="pl.cover" />
              <span v-else class="pl-icon">{{ pl.icon }}</span>
              <div class="pl-cover-overlay">▶</div>
            </div>
            <div class="pl-name">{{ pl.name }}</div>
            <div class="pl-sub">{{ pl.count }} 首</div>
          </div>
        </div>
      </section>

      <!-- 我的歌单 -->
      <section class="block">
        <div class="block-title">
          我的歌单
          <span class="block-tag">{{ customList.length }}</span>
        </div>
        <div v-if="customList.length === 0" class="empty-card">
          还没有我的歌单。点右上角"新建歌单"，或在任意歌曲上点 + 加入新歌单。
        </div>
        <div v-else class="card-grid">
          <div v-for="pl in customList" :key="pl.id" class="pl-card" @click="open(pl)">
            <div class="pl-cover">
              <img v-if="pl.cover" :src="pl.cover" />
              <span v-else class="pl-icon">{{ pl.icon }}</span>
              <div class="pl-cover-overlay">▶</div>
              <!-- <button class="pl-del" title="删除歌单" @click="onDelete(pl, $event)">×</button> -->
            </div>
            <div class="pl-name" :title="pl.name">{{ pl.name }}</div>
            <div class="pl-sub">
              {{ pl.count }} 首
              <span v-if="pl.updatedAt" class="dim">· {{ fmtDate(pl.updatedAt) }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.pl-wrap {
  padding: 24px 32px 40px;
}

.create-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 24px;
  padding: 12px 16px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.create-bar .settings-input {
  flex: 1;
  min-width: 0;
  background: var(--bg-2);
  border: 1px solid var(--border);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-1);
}
.create-bar .settings-input:focus {
  border-color: var(--primary);
  outline: none;
}

.block {
  margin-bottom: 32px;
}
.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 14px;
  letter-spacing: 0.3px;
}
.block-tag {
  font-size: 11px;
  font-weight: 500;
  color: var(--primary);
  background: rgba(123, 92, 255, 0.15);
  padding: 1px 8px;
  border-radius: 10px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 18px;
}

.pl-card {
  cursor: pointer;
  padding: 8px;
  border-radius: 10px;
  transition: background 0.15s;
}
.pl-card:hover {
  background: var(--bg-2);
}
.pl-card:hover .pl-cover-overlay {
  opacity: 1;
}
.pl-card:hover .pl-del {
  opacity: 1;
}

.pl-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
  background: linear-gradient(135deg, var(--bg-2), var(--bg-3));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
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
  font-size: 36px;
  color: var(--text-2);
}

.pl-cover-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 28px;
  opacity: 0;
  transition: opacity 0.15s;
}

.pl-del {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  color: white;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: grid;
  place-items: center;
  opacity: 0;
  transition:
    opacity 0.15s,
    background 0.15s;
}
.pl-del:hover {
  background: var(--danger);
}

.pl-card.system .pl-cover {
  background: linear-gradient(135deg, rgba(123, 92, 255, 0.4), rgba(255, 92, 180, 0.3));
}
.pl-card.system .pl-icon {
  color: white;
}

.pl-name {
  font-size: 13px;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pl-sub {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}
.pl-sub .dim {
  opacity: 0.6;
}

.empty-card {
  padding: 36px;
  text-align: center;
  background: var(--bg-1);
  border: 1px dashed var(--border);
  border-radius: 12px;
  color: var(--text-3);
  font-size: 13px;
}
</style>
