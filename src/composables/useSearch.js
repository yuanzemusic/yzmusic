import { ref, computed } from 'vue';
import { searchMusic, listSearchSources } from '../sources/customSourceClient';

const PAGE_SIZE = 30;

// 全局共享状态（顶栏 + 搜索结果页共享）
const keyword = ref('');
const activeSource = ref('');
const searched = ref(false);

// 每个来源各自维护一份 list / loading / error / 分页状态
const resultsBySource = ref({});
const loadingBySource = ref({});
const errorBySource = ref({});
const pageBySource = ref({});
const hasMoreBySource = ref({});
const loadingMoreBySource = ref({});

function ensureSourceSlot(id) {
  if (!(id in resultsBySource.value)) resultsBySource.value[id] = [];
  if (!(id in loadingBySource.value)) loadingBySource.value[id] = false;
  if (!(id in errorBySource.value)) errorBySource.value[id] = '';
  if (!(id in pageBySource.value)) pageBySource.value[id] = 1;
  if (!(id in hasMoreBySource.value)) hasMoreBySource.value[id] = false;
  if (!(id in loadingMoreBySource.value)) loadingMoreBySource.value[id] = false;
}

// 搜索 tab 列表：来自所有已启用、声明了 musicSearch 的自定义源 source。
// 启动时为空，由 refreshSources() 异步从主进程拉取；用户尚未导入任何源时也保持为空。
const SOURCES = ref([]);

async function refreshSources() {
  const list = await listSearchSources();
  SOURCES.value = list;
  for (const s of list) ensureSourceSlot(s.id);
  // activeSource 指向一个已不存在的 tab 时重置
  if (list.length && !list.some((s) => s.id === activeSource.value)) {
    activeSource.value = list[0].id;
  }
}

// 兼容旧调用方（TopBar / HomeView）
const loading = computed(() => Object.values(loadingBySource.value).some(Boolean));
const results = computed(() => resultsBySource.value[activeSource.value] || []);

async function searchOne(srcId, q, { page = 1, append = false } = {}) {
  ensureSourceSlot(srcId);
  if (append) loadingMoreBySource.value[srcId] = true;
  else loadingBySource.value[srcId] = true;
  errorBySource.value[srcId] = '';
  try {
    const list = await searchMusic(srcId, { keyWord: q, page, limit: PAGE_SIZE });
    resultsBySource.value[srcId] = append ? [...(resultsBySource.value[srcId] || []), ...list] : list;
    pageBySource.value[srcId] = page;
    // 本页拉满 PAGE_SIZE 才认为可能还有后续；返回少于一页说明到底了
    hasMoreBySource.value[srcId] = list.length >= PAGE_SIZE;
  } catch (e) {
    if (!append) resultsBySource.value[srcId] = [];
    errorBySource.value[srcId] = e?.message || String(e);
    hasMoreBySource.value[srcId] = false;
  } finally {
    if (append) loadingMoreBySource.value[srcId] = false;
    else loadingBySource.value[srcId] = false;
  }
}

// 触发一次搜索：并行查询所有来源（重置分页）
async function doSearch(term) {
  const q = (term ?? keyword.value).trim();
  if (!q) return false;
  if (term !== undefined) keyword.value = term;

  // 每次都刷新源列表，以吸收刚启用/禁用的用户脚本
  await refreshSources();

  searched.value = true;
  for (const s of SOURCES.value) {
    resultsBySource.value[s.id] = [];
    pageBySource.value[s.id] = 1;
    hasMoreBySource.value[s.id] = false;
  }

  await Promise.all(SOURCES.value.map((s) => searchOne(s.id, q, { page: 1, append: false })));
  return true;
}

// 加载下一页：只针对指定来源（默认当前 tab）
async function loadMore(srcId = activeSource.value) {
  const q = keyword.value.trim();
  if (!q) return;
  if (loadingBySource.value[srcId] || loadingMoreBySource.value[srcId]) return;
  if (!hasMoreBySource.value[srcId]) return;
  if (!SOURCES.value.some((s) => s.id === srcId)) return;
  const nextPage = (pageBySource.value[srcId] || 1) + 1;
  await searchOne(srcId, q, { page: nextPage, append: true });
}

function setActiveSource(id) {
  if (SOURCES.value.some((s) => s.id === id)) activeSource.value = id;
}

function clearSearch() {
  keyword.value = '';
  resultsBySource.value = {};
  errorBySource.value = {};
  pageBySource.value = {};
  hasMoreBySource.value = {};
  loadingBySource.value = {};
  loadingMoreBySource.value = {};
  searched.value = false;
  for (const s of SOURCES.value) ensureSourceSlot(s.id);
}

// 启动时先尝试拉取一次 tab 列表（用户已安装的自定义源）
refreshSources();

export function useSearch() {
  return {
    SOURCES,
    keyword,
    searched,
    activeSource,
    setActiveSource,
    resultsBySource,
    loadingBySource,
    errorBySource,
    pageBySource,
    hasMoreBySource,
    loadingMoreBySource,
    // 兼容旧用法
    loading,
    results,
    doSearch,
    loadMore,
    clearSearch,
    refreshSources
  };
}
