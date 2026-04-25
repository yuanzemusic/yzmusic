<script setup>
import TrackList from '../components/TrackList.vue';
import { usePlayer } from '../composables/usePlayer';
import { useFavorites } from '../composables/useFavorites';
import { useSearch } from '../composables/useSearch';
import { useDownloads } from '../composables/useDownloads';
import { computed } from 'vue';

const {
  SOURCES,
  keyword,
  searched,
  activeSource,
  setActiveSource,
  resultsBySource,
  loadingBySource,
  errorBySource,
  hasMoreBySource,
  loadingMoreBySource,
  loadMore
} = useSearch();
const { currentTrack, isPlaying, isLoading, playTrack } = usePlayer();
const { isFav, toggleFav } = useFavorites();
const { download } = useDownloads();

// 当前 tab 对应的状态
const activeList = computed(() => resultsBySource.value[activeSource.value] || []);
const activeLoading = computed(() => !!loadingBySource.value[activeSource.value]);
const activeError = computed(() => errorBySource.value[activeSource.value] || '');
const activeHasMore = computed(() => !!hasMoreBySource.value[activeSource.value]);
const activeLoadingMore = computed(() => !!loadingMoreBySource.value[activeSource.value]);

function onPlay(track) {
  playTrack(track);
}
function onLoadMore() {
  loadMore(activeSource.value);
}
</script>

<template>
  <div class="view">
    <header class="view-topbar">
      <div class="page-title">
        在线搜索
        <span v-if="searched && keyword" class="keyword-echo">· "{{ keyword }}"</span>
      </div>
      <div class="topbar-actions">
        <span v-if="searched && activeList.length > 0" class="muted">{{ activeList.length }} 条结果</span>
      </div>
    </header>

    <div class="source-tabs">
      <button
        v-for="s in SOURCES"
        :key="s.id"
        class="source-tab"
        :class="{ active: activeSource === s.id }"
        @click="setActiveSource(s.id)"
      >
        <span>{{ s.name }}</span>
        <span v-if="loadingBySource[s.id]" class="tab-spinner">⏳</span>
        <span v-else-if="searched" class="tab-count" :class="{ zero: !resultsBySource[s.id].length }">
          {{ resultsBySource[s.id].length }}
        </span>
      </button>
    </div>

    <div class="view-content">
      <div v-if="!searched" class="empty">在顶部搜索栏输入关键字开始搜索</div>
      <div v-else-if="activeLoading" class="empty">搜索中…</div>
      <div v-else-if="activeError" class="empty err">{{ activeError }}</div>
      <div v-else-if="activeList.length === 0" class="empty">没有找到结果</div>
      <template v-else>
        <TrackList
          :tracks="activeList"
          :current-id="currentTrack?.id"
          :playing="isPlaying"
          :loading="isLoading"
          :is-fav="isFav"
          @play="onPlay"
          @fav="toggleFav"
          @download="download"
        />
        <div class="load-more-wrap">
          <button v-if="activeHasMore" class="load-more-btn" :disabled="activeLoadingMore" @click="onLoadMore">
            <span v-if="activeLoadingMore" class="btn-spinner"></span>
            {{ activeLoadingMore ? '加载中…' : '加载更多' }}
          </button>
          <div v-else class="no-more">没有更多结果</div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* SearchView 比通用 .view 多一行 source-tabs，覆盖全局的 grid 模板 */
.view {
  grid-template-rows: 56px auto minmax(0, 1fr);
}

.muted {
  color: var(--text-3);
  font-size: 13px;
}
.keyword-echo {
  color: var(--text-3);
  font-weight: 400;
}

.source-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 24px 0;
  background: var(--bg-0);
  border-bottom: 1px solid var(--border);
}
.source-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--text-3);
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s,
    border-color 0.15s;
  margin-bottom: -1px;
}
.source-tab:hover {
  color: var(--text-1);
}
.source-tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}
.tab-count {
  font-size: 11px;
  background: var(--bg-3);
  color: var(--text-3);
  padding: 1px 7px;
  border-radius: 10px;
  font-variant-numeric: tabular-nums;
}
.source-tab.active .tab-count {
  background: rgba(123, 92, 255, 0.18);
  color: var(--primary);
}
.tab-count.zero {
  opacity: 0.55;
}
.tab-spinner {
  font-size: 11px;
  opacity: 0.7;
}

.empty.err {
  color: var(--danger);
}

.load-more-wrap {
  display: flex;
  justify-content: center;
  padding: 16px 0 24px;
}
.load-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-2);
  color: var(--text-1);
  border: 1px solid var(--border);
  padding: 8px 20px;
  border-radius: 18px;
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.load-more-btn:hover:not(:disabled) {
  background: rgba(123, 92, 255, 0.12);
  border-color: var(--primary);
  color: var(--primary);
}
.load-more-btn:disabled {
  cursor: default;
  opacity: 0.7;
}
.btn-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(123, 92, 255, 0.25);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: btn-spin 0.8s linear infinite;
}
@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}
.no-more {
  color: var(--text-3);
  font-size: 12px;
}
</style>
