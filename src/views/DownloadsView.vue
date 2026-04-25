<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import TrackList from '../components/TrackList.vue';
import { useDownloads } from '../composables/useDownloads';
import { usePlayer } from '../composables/usePlayer';
import { useFavorites } from '../composables/useFavorites';
import { formatTime } from '../utils/format';

const { downloads, downloadDir, activeCount, showInFolder, chooseDownloadDir, removeDownload, clearFinished } =
  useDownloads();
const { currentTrack, isPlaying, isLoading, playTrack } = usePlayer();
const { isFav, toggleFav } = useFavorites();

const tracks = ref([]); // 已下载文件扫描结果
const scanning = ref(false);
const lastError = ref('');

// 把"下载中"和"已完成但已扫到的"分开展示
const inflight = computed(() => downloads.value.filter((d) => d.status === 'downloading' || d.status === 'error'));
const recentDone = computed(() => downloads.value.filter((d) => d.status === 'done').slice(0, 5));

async function rescan() {
  if (!downloadDir.value) {
    // 还没拿到，让 useDownloads init() 先跑完
    if (window.musicAPI?.getDownloadDir) {
      try {
        downloadDir.value = await window.musicAPI.getDownloadDir();
      } catch {}
    }
  }
  if (!window.musicAPI?.scanFolder || !downloadDir.value) {
    tracks.value = [];
    return;
  }
  scanning.value = true;
  lastError.value = '';
  try {
    tracks.value = await window.musicAPI.scanFolder(downloadDir.value);
  } catch (e) {
    lastError.value = e.message || String(e);
    tracks.value = [];
  } finally {
    scanning.value = false;
  }
}

async function changeDir() {
  await chooseDownloadDir();
  await rescan();
}

async function openDownloadDir() {
  if (!downloadDir.value) return;
  if (window.musicAPI?.openPath) {
    await window.musicAPI.openPath(downloadDir.value);
  }
}

async function deleteTrack(t) {
  if (!t?.filePath) return;
  if (!confirm(`将"${t.title}"移到回收站？`)) return;
  if (!window.musicAPI?.trashFile) {
    alert('当前环境不支持删除文件');
    return;
  }
  const r = await window.musicAPI.trashFile(t.filePath);
  if (r?.ok) {
    tracks.value = tracks.value.filter((x) => x.id !== t.id);
  } else {
    alert('删除失败：' + (r?.error || '未知错误'));
  }
}

function pct(d) {
  if (!d.total) return 0;
  return Math.min(100, Math.round((d.received / d.total) * 100));
}

function fmtSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? mb.toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
}

function totalDuration() {
  return tracks.value.reduce((s, t) => s + (t.duration || 0), 0);
}

// 当下载完成时自动重扫一次（让新下载的文件立刻出现在列表里）
watch(activeCount, (cur, prev) => {
  if (prev > 0 && cur === 0) rescan();
});

onMounted(rescan);
</script>

<template>
  <div class="view">
    <header class="view-topbar">
      <div class="page-title">我的下载</div>
      <div class="topbar-actions">
        <span v-if="tracks.length > 0" class="muted">{{ tracks.length }} 首 · {{ formatTime(totalDuration()) }}</span>
        <button class="btn ghost" @click="rescan" :disabled="scanning">
          {{ scanning ? '扫描中…' : '刷新' }}
        </button>
        <button class="btn ghost" :disabled="!downloadDir" @click="openDownloadDir">打开文件夹</button>
        <button class="btn" @click="changeDir">更换目录</button>
      </div>
    </header>

    <div class="view-content dl-wrap">
      <!-- 当前目录 -->
      <div class="dl-dir">
        <span class="dir-label">当前下载目录：</span>
        <span class="dir-path" :title="downloadDir || '使用系统默认下载目录'">
          {{ downloadDir || '使用系统默认下载目录' }}
        </span>
      </div>

      <!-- 下载中 -->
      <section v-if="inflight.length > 0" class="block">
        <div class="block-title">
          下载中
          <span class="block-tag">{{ inflight.length }}</span>
        </div>
        <div class="dl-list">
          <div v-for="d in inflight" :key="d.id" class="dl-item" :class="d.status">
            <div class="dl-row">
              <div class="dl-name" :title="d.name">{{ d.name }}</div>
              <button class="dl-x" @click="removeDownload(d.id)" title="从列表移除">×</button>
            </div>
            <div class="dl-bar">
              <div
                class="dl-bar-fill"
                :class="d.status"
                :style="{ width: (d.status === 'error' ? 100 : pct(d)) + '%' }"
              ></div>
            </div>
            <div class="dl-meta">
              <span v-if="d.status === 'downloading'">
                {{ pct(d) }}% · {{ fmtSize(d.received) }}
                <span v-if="d.total">/ {{ fmtSize(d.total) }}</span>
              </span>
              <span v-else-if="d.status === 'error'" class="err">✗ {{ d.error || '下载失败' }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 最近完成（提示性） -->
      <section v-if="recentDone.length > 0 && !scanning" class="block">
        <div class="block-title">
          最近完成
          <span class="block-link" @click="clearFinished">清除记录</span>
        </div>
        <div class="recent-list">
          <div v-for="d in recentDone" :key="d.id" class="recent-item">
            <span class="recent-name" :title="d.path">✓ {{ d.name }}</span>
            <button class="recent-link" @click="showInFolder(d.path)" title="在文件夹中显示">📂</button>
          </div>
        </div>
      </section>

      <!-- 已下载 -->
      <section class="block">
        <div class="block-title">已下载</div>
        <div v-if="scanning && tracks.length === 0" class="empty">扫描中…</div>
        <div v-else-if="lastError" class="empty">扫描失败：{{ lastError }}</div>
        <div v-else-if="tracks.length === 0" class="empty">
          下载目录里还没有歌曲。在搜索 / 收藏 / 播放栏点 ⬇ 按钮即可下载。
        </div>
        <TrackList
          v-else
          :tracks="tracks"
          :current-id="currentTrack?.id"
          :playing="isPlaying"
          :loading="isLoading"
          :is-fav="isFav"
          :show-delete="true"
          @play="(t) => playTrack(t, tracks)"
          @fav="toggleFav"
          @delete="deleteTrack"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.dl-wrap {
  padding: 20px 32px 40px;
}
.muted {
  color: var(--text-3);
  font-size: 13px;
}

.dl-dir {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 24px;
  padding: 10px 14px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.dir-label {
  color: var(--text-3);
  flex-shrink: 0;
}
.dir-path {
  color: var(--text-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.block {
  margin-bottom: 28px;
}
.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 12px;
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
.block-link {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-3);
  cursor: pointer;
}
.block-link:hover {
  color: var(--primary);
}

.dl-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dl-item {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
}
.dl-item.error {
  border-color: rgba(255, 77, 109, 0.4);
}
.dl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.dl-name {
  flex: 1;
  min-width: 0;
  color: var(--text-1);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dl-x {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-3);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 16px;
  display: grid;
  place-items: center;
}
.dl-x:hover {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.06);
}

.dl-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}
.dl-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--primary-2));
  transition: width 0.15s linear;
}
.dl-bar-fill.error {
  background: var(--danger);
}

.dl-meta {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.dl-meta .err {
  color: var(--danger);
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-2);
}
.recent-item:hover {
  background: var(--bg-2);
}
.recent-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.recent-link {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-3);
}
.recent-link:hover {
  color: var(--primary);
}
</style>
