<script setup>
import { useRouter } from 'vue-router';
import { useSearch } from '../composables/useSearch';
import { useNavHistory, navBack, navForward } from '../router/history';

const router = useRouter();
const { keyword, doSearch, loading } = useSearch();
const { canBack, canForward } = useNavHistory();

async function go() {
  if (!keyword.value.trim()) return;
  if (router.currentRoute.value.name !== 'search') {
    router.push({ name: 'search' });
  }
  await doSearch();
}

function onClear() {
  keyword.value = '';
}
</script>

<template>
  <header class="topbar">
    <!-- 前进/后退 -->
    <div class="nav-btns">
      <button
        class="nav-btn"
        :disabled="!canBack"
        :title="canBack ? '后退' : '没有可后退的页面'"
        @click="navBack(router)"
      >
        ‹
      </button>
      <button
        class="nav-btn"
        :disabled="!canForward"
        :title="canForward ? '前进' : '没有可前进的页面'"
        @click="navForward(router)"
      >
        ›
      </button>
    </div>

    <!-- 搜索框 -->
    <div class="topbar-search">
      <span class="topbar-search-icon">🔍</span>
      <input
        class="topbar-search-input"
        v-model="keyword"
        @keyup.enter="go"
        :placeholder="loading ? '搜索中…' : '搜索歌曲、歌手、专辑…'"
      />
      <button v-if="keyword" class="topbar-search-clear" @click="onClear" title="清空">×</button>
      <button class="topbar-search-btn" :disabled="!keyword.trim() || loading" @click="go">搜索</button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  padding: 0 16px 0 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-0);
  gap: 12px;
}

/* ---- 前进/后退 ---- */
.nav-btns {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.nav-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 50%;
  color: var(--text-2);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s,
    transform 0.1s;
}
.nav-btn:hover:not(:disabled) {
  background: var(--bg-3);
  color: var(--text-1);
  border-color: rgba(255, 255, 255, 0.12);
}
.nav-btn:active:not(:disabled) {
  transform: scale(0.94);
}
.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ---- 搜索框 ---- */
.topbar-search {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 520px;
}
.topbar-search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-3);
  font-size: 13px;
  pointer-events: none;
}
.topbar-search-input {
  flex: 1;
  height: 32px;
  padding: 0 96px 0 32px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 16px;
  color: var(--text-1);
  font-size: 13px;
  outline: none;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.topbar-search-input::placeholder {
  color: var(--text-3);
}
.topbar-search-input:focus {
  border-color: var(--primary);
  background: var(--bg-1);
}
.topbar-search-clear {
  position: absolute;
  right: 70px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  background: none;
  border: none;
  color: var(--text-3);
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}
.topbar-search-clear:hover {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.06);
}
.topbar-search-btn {
  position: absolute;
  right: 4px;
  height: 26px;
  padding: 0 14px;
  border: none;
  border-radius: 13px;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    transform 0.1s,
    opacity 0.15s;
}
.topbar-search-btn:hover:not(:disabled) {
  transform: scale(1.03);
}
.topbar-search-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
