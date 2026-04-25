import { ref } from 'vue';

const sources = ref([]);
const urlDraft = ref('');
const busy = ref(false);
const message = ref('');
const messageStatus = ref(''); // '' | 'ok' | 'err'

let initialized = false;

async function refresh() {
  if (!window.musicAPI?.customSourceList) return;
  try {
    sources.value = await window.musicAPI.customSourceList();
  } catch (e) {
    sources.value = [];
  }
}

async function init() {
  if (initialized) return;
  initialized = true;
  await refresh();
}

function setMessage(status, text) {
  messageStatus.value = status;
  message.value = text;
}

async function importFromFile() {
  if (!window.musicAPI?.customSourceImportFile) return;
  busy.value = true;
  setMessage('', '正在导入…');
  try {
    const r = await window.musicAPI.customSourceImportFile();
    if (r?.canceled) {
      setMessage('', '');
    } else if (r?.ok) {
      setMessage('ok', `导入成功：${r.entry.name}`);
      await refresh();
    } else {
      setMessage('err', '导入失败：' + (r?.error || '未知错误'));
    }
  } catch (e) {
    setMessage('err', '导入失败：' + e.message);
  } finally {
    busy.value = false;
  }
}

async function importFromUrl() {
  const v = (urlDraft.value || '').trim();
  if (!v) {
    setMessage('err', '请输入远程源地址');
    return;
  }
  busy.value = true;
  setMessage('', '正在下载并解析脚本…');
  try {
    const r = await window.musicAPI.customSourceImportUrl(v);
    if (r?.ok) {
      setMessage('ok', `导入成功：${r.entry.name}`);
      urlDraft.value = '';
      await refresh();
    } else {
      setMessage('err', '导入失败：' + (r?.error || '未知错误'));
    }
  } catch (e) {
    setMessage('err', '导入失败：' + e.message);
  } finally {
    busy.value = false;
  }
}

async function removeSource(id) {
  if (!confirm(`删除自定义源「${id}」？`)) return;
  await window.musicAPI.customSourceRemove(id);
  await refresh();
  setMessage('ok', `已删除：${id}`);
}

async function reloadSource(entry) {
  if (!window.musicAPI?.customSourceReload) return;
  const id = entry?.id;
  if (!id) return;
  busy.value = true;
  setMessage('', `正在重新加载：${id}…`);
  try {
    const r = await window.musicAPI.customSourceReload(id);
    if (r?.ok) {
      const where = r.source === 'url' ? '远程地址' : r.source === 'file' ? '本地文件' : '本地缓存';
      setMessage('ok', `已从${where}重新加载：${r.entry?.name || id}`);
      await refresh();
    } else {
      setMessage('err', '重新加载失败：' + (r?.error || '未知错误'));
    }
  } catch (e) {
    setMessage('err', '重新加载失败：' + e.message);
  } finally {
    busy.value = false;
  }
}

async function toggleEnabled(entry) {
  await window.musicAPI.customSourceSetEnabled(entry.id, !entry.enabled);
  await refresh();
}

function formatSourceKeys(entry) {
  const keys = Object.keys(entry.sources || {});
  return keys.length ? keys.join(', ') : '—';
}

export function useCustomSources() {
  init();
  return {
    sources,
    urlDraft,
    busy,
    message,
    messageStatus,
    importFromFile,
    importFromUrl,
    removeSource,
    reloadSource,
    toggleEnabled,
    refresh,
    formatSourceKeys
  };
}
