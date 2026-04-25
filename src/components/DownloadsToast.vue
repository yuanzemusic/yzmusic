<script setup>
import { ref, computed, watch } from 'vue';
import { useDownloads } from '../composables/useDownloads';

const { downloads, activeCount, removeDownload, clearFinished, showInFolder } = useDownloads();

const expanded = ref(false);
const visible = computed(() => downloads.value.length > 0);

// 当有新任务进来时，自动展开
watch(activeCount, (n, old) => {
  if (n > old) expanded.value = true;
});

function pct(d) {
  if (!d.total) return d.status === 'done' ? 100 : 0;
  return Math.min(100, Math.round((d.received / d.total) * 100));
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}
</script>

<template>
  <div v-if="visible" class="dl-toast" :class="{ collapsed: !expanded }">
    <header class="dl-head" @click="expanded = !expanded">
      <span class="dl-title">
        <span class="dl-icon">⬇</span>
        下载
        <span v-if="activeCount > 0" class="dl-badge">{{ activeCount }}</span>
        <span v-else class="dl-badge done">{{ downloads.length }}</span>
      </span>
      <span class="dl-actions" @click.stop>
        <button
          v-if="downloads.some((d) => d.status !== 'downloading')"
          class="dl-mini-btn"
          @click="clearFinished"
          title="清除已完成"
        >
          清除
        </button>
        <button class="dl-mini-btn" @click="expanded = !expanded" :title="expanded ? '收起' : '展开'">
          {{ expanded ? '▾' : '▴' }}
        </button>
      </span>
    </header>

    <div v-if="expanded" class="dl-list">
      <div v-for="d in downloads" :key="d.id" class="dl-item">
        <div class="dl-item-row">
          <div class="dl-item-name" :title="d.name">{{ d.name }}</div>
          <button class="dl-mini-btn ghost" @click="removeDownload(d.id)" title="移除">×</button>
        </div>

        <div v-if="d.status === 'downloading'" class="dl-bar">
          <div class="dl-bar-fill" :style="{ width: pct(d) + '%' }"></div>
        </div>

        <div class="dl-item-meta">
          <template v-if="d.status === 'downloading'">
            <span>{{ pct(d) }}%</span>
            <span class="dot">·</span>
            <span>
              {{ fmtSize(d.received) }}
              <span v-if="d.total">/ {{ fmtSize(d.total) }}</span>
            </span>
          </template>
          <template v-else-if="d.status === 'done'">
            <span class="ok">✓ 已完成</span>
            <span class="dot">·</span>
            <span>{{ fmtSize(d.received || d.total) }}</span>
            <span class="dot">·</span>
            <a class="link" @click="showInFolder(d.path)">在文件夹中显示</a>
          </template>
          <template v-else-if="d.status === 'error'">
            <span class="err">✗ 失败</span>
            <span class="dot">·</span>
            <span class="err-msg">{{ d.error }}</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dl-toast {
  position: fixed;
  right: 16px;
  bottom: 104px; /* 高于 88px 的 PlayerBar */
  width: 320px;
  max-height: 50vh;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  z-index: 30; /* 高于 PlayerBar (z 20) */
  display: flex;
  flex-direction: column;
}

.dl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
}
.dl-toast.collapsed .dl-head {
  border-bottom: none;
}

.dl-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}
.dl-icon {
  color: var(--primary);
  font-size: 14px;
}
.dl-badge {
  background: var(--primary);
  color: white;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}
.dl-badge.done {
  background: var(--bg-3);
  color: var(--text-3);
}

.dl-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}
.dl-mini-btn {
  background: none;
  border: none;
  color: var(--text-3);
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.dl-mini-btn:hover {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.06);
}
.dl-mini-btn.ghost {
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
}

.dl-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 4px 8px 0;
}
.dl-item {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.dl-item:last-child {
  border-bottom: none;
}

.dl-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.dl-item-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dl-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}
.dl-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--primary-2));
  transition: width 0.2s linear;
}

.dl-item-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 11px;
  color: var(--text-3);
}
.dl-item-meta .dot {
  color: var(--text-3);
  opacity: 0.5;
}
.dl-item-meta .ok {
  color: var(--accent);
}
.dl-item-meta .err {
  color: var(--danger);
}
.dl-item-meta .err-msg {
  color: var(--text-3);
}
.dl-item-meta .link {
  color: var(--primary);
  cursor: pointer;
  text-decoration: none;
}
.dl-item-meta .link:hover {
  text-decoration: underline;
}
</style>
