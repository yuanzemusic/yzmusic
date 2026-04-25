<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCustomSources } from '../composables/useCustomSources';
import { resolveMusicUrl } from '../sources/customSourceClient';
import { parseLrc } from '../utils/lrc';

const router = useRouter();
const { sources, refresh } = useCustomSources();

// 刷新一次以便进入页面时拿到最新的脚本列表
refresh();

// 把 (脚本 → sources) 拍平成 {scriptId, scriptName, sourceKey, sourceName, actions}
// 同一个 sourceKey 可能出现在多个脚本里；这里逐个展示，方便各自测试。
const sourceItems = computed(() => {
  const out = [];
  for (const entry of sources.value) {
    if (!entry.enabled) continue;
    for (const [key, meta] of Object.entries(entry.sources || {})) {
      out.push({
        scriptId: entry.id,
        scriptName: entry.name,
        sourceKey: key,
        sourceName: meta?.name || key,
        actions: Array.isArray(meta?.actions) ? meta.actions : []
      });
    }
  }
  return out;
});

const keyword = ref('王菲');

// 每个源的测试结果：results[sourceKey][action] = { running, ok, ms, message, data, expanded }
const results = ref({});
// 每个源的上下文（来自首条搜索结果），用于后续 action 的测试
const ctx = ref({}); // { [sourceKey]: { songInfo, songId, albumId, artistId } }

function rec(sourceKey, action, patch) {
  const bySource = results.value[sourceKey] || {};
  bySource[action] = { ...(bySource[action] || {}), ...patch };
  results.value = { ...results.value, [sourceKey]: { ...bySource } };
}

function resultOf(sourceKey, action) {
  return results.value[sourceKey]?.[action];
}

async function dispatch(sourceKey, action, info) {
  if (!window.musicAPI?.customSourceDispatch) {
    throw new Error('当前环境不支持自定义源 IPC');
  }
  const r = await window.musicAPI.customSourceDispatch({
    sourceKey,
    action,
    info
  });
  if (!r?.ok) throw new Error(r?.error || `${action} 失败`);
  return r.data;
}

function pickFirst(list) {
  if (Array.isArray(list)) return list[0];
  if (list && Array.isArray(list.list)) return list.list[0];
  return null;
}

function extractArtistId(song) {
  if (!song) return '';
  if (Array.isArray(song.artists) && song.artists.length) {
    return song.artists[0].id || song.artists[0].artistId || '';
  }
  return song.artistId || song.singerId || '';
}

// 运行一次 musicSearch，把首条结果写进 ctx；已经有 ctx 则跳过。
// 允许被测试面板上非 search 的 action（如 musicUrl）自动补跑搜索。
async function ensureSongContext(sourceKey) {
  if (ctx.value[sourceKey]?.songInfo) return;
  await runMusicSearch(sourceKey);
  if (!ctx.value[sourceKey]?.songInfo) {
    throw new Error('无法通过 musicSearch 获取歌曲（该源可能不支持搜索或搜索失败）');
  }
}

async function runMusicSearch(sourceKey) {
  const t0 = Date.now();
  rec(sourceKey, 'musicSearch', {
    running: true,
    ok: null,
    message: '',
    data: null
  });
  try {
    const data = await dispatch(sourceKey, 'musicSearch', {
      keyWord: keyword.value,
      page: 1,
      limit: 10
    });
    const list = Array.isArray(data) ? data : data?.list || [];
    const first = pickFirst(list);
    if (first) {
      ctx.value = {
        ...ctx.value,
        [sourceKey]: {
          songInfo: first,
          songId: String(first.copyrightId || first.songId || first.id || ''),
          albumId: first.albumId || first.album?.id || '',
          artistId: extractArtistId(first)
        }
      };
    }
    const preview = list.slice(0, 3).map((x) => ({
      title: x.title,
      artist: x.artist,
      songId: x.songId,
      albumId: x.albumId
    }));
    rec(sourceKey, 'musicSearch', {
      running: false,
      ok: true,
      ms: Date.now() - t0,
      message: `${list.length} 条`,
      data: { total: list.length, preview }
    });
  } catch (e) {
    rec(sourceKey, 'musicSearch', {
      running: false,
      ok: false,
      ms: Date.now() - t0,
      message: e?.message || String(e),
      data: null
    });
  }
}

async function testAction(sourceKey, action) {
  const t0 = Date.now();
  rec(sourceKey, action, { running: true, ok: null, message: '', data: null });
  try {
    if (action === 'musicSearch') {
      await runMusicSearch(sourceKey);
      return;
    }
    // 所有依赖 ctx 的 action：若 ctx 为空则自动补跑一次 musicSearch
    await ensureSongContext(sourceKey);
    const c = ctx.value[sourceKey] || {};
    if (action === 'lyric') {
      if (!c.songId) throw new Error('首条搜索结果缺少 songId，无法测试');
      const raw = await dispatch(sourceKey, 'lyric', { songId: c.songId });
      const text = typeof raw === 'string' ? raw : raw && typeof raw.lyric === 'string' ? raw.lyric : '';
      const lines = parseLrc(text);
      rec(sourceKey, action, {
        running: false,
        ok: true,
        ms: Date.now() - t0,
        message: `${lines.length} 行歌词`,
        data: { chars: text.length, preview: text.slice(0, 240) }
      });
      return;
    }
    if (action === 'album') {
      if (!c.albumId) throw new Error('首条搜索结果缺少 albumId，无法测试');
      const data = await dispatch(sourceKey, 'album', { albumId: c.albumId });
      rec(sourceKey, action, {
        running: false,
        ok: true,
        ms: Date.now() - t0,
        message: data?.title ? `专辑：${data.title}` : '成功',
        data
      });
      return;
    }
    if (action === 'artistInfo') {
      if (!c.artistId) throw new Error('首条搜索结果缺少 artistId，无法测试');
      const data = await dispatch(sourceKey, 'artistInfo', {
        artistId: c.artistId
      });
      rec(sourceKey, action, {
        running: false,
        ok: true,
        ms: Date.now() - t0,
        message: data?.name ? `艺术家：${data.name}` : '成功',
        data
      });
      return;
    }
    if (action === 'artistAlbums') {
      if (!c.artistId) throw new Error('首条搜索结果缺少 artistId，无法测试');
      const data = await dispatch(sourceKey, 'artistAlbums', {
        artistId: c.artistId
      });
      const list = Array.isArray(data) ? data : data?.list || [];
      rec(sourceKey, action, {
        running: false,
        ok: true,
        ms: Date.now() - t0,
        message: `${list.length} 张专辑`,
        data
      });
      return;
    }
    if (action === 'musicUrl') {
      if (!c.songInfo) throw new Error('首条搜索结果缺失，无法测试');
      const url = await resolveMusicUrl({ ...c.songInfo, source: sourceKey });
      rec(sourceKey, action, {
        running: false,
        ok: true,
        ms: Date.now() - t0,
        message: '解析成功',
        data: { url }
      });
      return;
    }
    // 其他未知 action：不带参数直接打
    const data = await dispatch(sourceKey, action, {});
    rec(sourceKey, action, {
      running: false,
      ok: true,
      ms: Date.now() - t0,
      message: '成功',
      data
    });
  } catch (e) {
    rec(sourceKey, action, {
      running: false,
      ok: false,
      ms: Date.now() - t0,
      message: e?.message || String(e),
      data: null
    });
  }
}

// musicSearch 优先跑，以便为其他 action 填充 ctx
function orderedActions(actions) {
  const sorted = actions.slice().sort((a, b) => {
    if (a === 'musicSearch') return -1;
    if (b === 'musicSearch') return 1;
    return 0;
  });
  return sorted;
}

async function testAllForSource(item) {
  for (const action of orderedActions(item.actions)) {
    await testAction(item.sourceKey, action);
  }
}

async function testAll() {
  for (const item of sourceItems.value) {
    await testAllForSource(item);
  }
}

function statusBadge(r) {
  if (!r) return { cls: 'idle', text: '未测试' };
  if (r.running) return { cls: 'running', text: '运行中' };
  if (r.ok) return { cls: 'ok', text: '✓ 通过' };
  return { cls: 'err', text: '✗ 失败' };
}

function toggleExpand(sourceKey, action) {
  const r = results.value[sourceKey]?.[action];
  if (!r) return;
  rec(sourceKey, action, { expanded: !r.expanded });
}

function formatData(data) {
  if (data == null) return '';
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function goSettings() {
  router.push({ name: 'settings' });
}
</script>

<template>
  <div class="view">
    <header class="view-topbar">
      <div class="page-title">源接口测试</div>
      <div class="topbar-actions">
        <button class="btn ghost" @click="goSettings">返回设置</button>
      </div>
    </header>

    <div class="view-content test-wrap">
      <section class="test-section">
        <div class="test-title">测试说明</div>
        <div class="test-desc">
          遍历已启用的自定义源，逐个调用其声明支持的 action。
          <br />
          流程：先执行
          <code>musicSearch</code>
          ，再复用首条结果的
          <code>songId</code>
          /
          <code>albumId</code>
          /
          <code>artistId</code>
          作为后续
          <code>musicUrl</code>
          、
          <code>lyric</code>
          、
          <code>album</code>
          、
          <code>artistInfo</code>
          、
          <code>artistAlbums</code>
          的测试参数。 未在脚本中声明的 action 不会出现在测试列表中。
        </div>
        <div class="test-row">
          <label class="test-label">搜索关键字</label>
          <input class="test-input" v-model="keyword" placeholder="王菲" />
          <button class="btn primary" @click="testAll" :disabled="!sourceItems.length">测试全部</button>
        </div>
      </section>

      <section v-if="!sourceItems.length" class="test-section">
        <div class="test-empty">
          当前没有启用的自定义源，请先在
          <a href="#" @click.prevent="goSettings">设置页</a>
          导入并启用源。
        </div>
      </section>

      <section v-for="item in sourceItems" :key="item.scriptId + '::' + item.sourceKey" class="test-section">
        <div class="test-header">
          <div>
            <div class="test-title">
              {{ item.sourceName }}
              <span class="dim">({{ item.sourceKey }})</span>
            </div>
            <div class="test-desc">
              来自脚本：{{ item.scriptName }}
              <br />
              支持 action：{{ item.actions.length ? item.actions.join(', ') : '（无）' }}
            </div>
          </div>
          <button class="btn ghost" :disabled="!item.actions.length" @click="testAllForSource(item)">一键测试</button>
        </div>

        <ul v-if="item.actions.length" class="action-list">
          <li v-for="action in orderedActions(item.actions)" :key="action" class="action-row">
            <div class="action-head">
              <span class="action-name">{{ action }}</span>
              <span class="badge" :class="statusBadge(resultOf(item.sourceKey, action)).cls">
                {{ statusBadge(resultOf(item.sourceKey, action)).text }}
              </span>
              <span v-if="resultOf(item.sourceKey, action)?.ms != null" class="ms">
                {{ resultOf(item.sourceKey, action).ms }}ms
              </span>
              <span class="spacer"></span>
              <button
                v-if="resultOf(item.sourceKey, action)?.data != null"
                class="btn ghost small"
                @click="toggleExpand(item.sourceKey, action)"
              >
                {{ resultOf(item.sourceKey, action)?.expanded ? '收起' : '详情' }}
              </button>
              <button
                class="btn ghost small"
                :disabled="resultOf(item.sourceKey, action)?.running"
                @click="testAction(item.sourceKey, action)"
              >
                {{ resultOf(item.sourceKey, action)?.running ? '运行中…' : '测试' }}
              </button>
            </div>
            <div
              v-if="resultOf(item.sourceKey, action)?.message"
              class="action-msg"
              :class="{ err: resultOf(item.sourceKey, action)?.ok === false }"
            >
              {{ resultOf(item.sourceKey, action).message }}
            </div>
            <pre
              v-if="resultOf(item.sourceKey, action)?.expanded && resultOf(item.sourceKey, action)?.data != null"
              class="action-data"
              >{{ formatData(resultOf(item.sourceKey, action).data) }}</pre
            >
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.test-wrap {
  padding: 24px 32px 40px;
}

.test-section {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 16px;
  max-width: 960px;
}
.test-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 6px;
}
.test-title .dim {
  color: var(--text-3);
  font-weight: 400;
  font-size: 12px;
}
.test-desc {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.6;
  margin-bottom: 12px;
}
.test-desc code {
  background: var(--bg-3);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--accent);
}
.test-empty {
  font-size: 13px;
  color: var(--text-3);
}

.test-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.test-label {
  font-size: 11px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 1px;
  flex-shrink: 0;
}
.test-input {
  flex: 1;
  background: var(--bg-2);
  border: 1px solid var(--border);
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-1);
}
.test-input:focus {
  border-color: var(--primary);
  outline: none;
}

.test-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}

.action-list {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.action-row {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}
.action-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.action-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: var(--text-1);
  font-weight: 600;
  min-width: 110px;
}
.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-3);
  background: var(--bg-3);
}
.badge.ok {
  color: var(--accent);
  border-color: var(--accent);
}
.badge.err {
  color: var(--danger);
  border-color: var(--danger);
}
.badge.running {
  color: var(--primary);
  border-color: var(--primary);
}
.ms {
  font-size: 11px;
  color: var(--text-3);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.spacer {
  flex: 1;
}
.btn.small {
  padding: 4px 10px;
  font-size: 12px;
}

.action-msg {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 6px;
  word-break: break-all;
}
.action-msg.err {
  color: var(--danger);
}
.action-data {
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--bg-3);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-2);
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
