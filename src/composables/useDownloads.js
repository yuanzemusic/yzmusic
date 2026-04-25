import { ref, computed } from 'vue';
import { resolveMusicUrl } from '../sources/customSourceClient';
import { genId } from '../utils/format';

/*
 * 下载管理（单例）
 *   downloads: 数组，每项 { id, name, status, received, total, path?, error? }
 *     status: 'pending' | 'downloading' | 'done' | 'error'
 *   downloadDir: 当前默认下载目录
 *
 * 主进程通过 'download:progress' 事件推送字节数，根据 id 找到对应项更新。
 */

const downloads = ref([]);
const downloadDir = ref('');

let initialized = false;

async function init() {
  if (initialized) return;
  initialized = true;

  if (typeof window === 'undefined' || !window.musicAPI) return;

  // 进度订阅 —— 全局只挂一次
  if (window.musicAPI.onDownloadProgress) {
    window.musicAPI.onDownloadProgress(({ id, received, total }) => {
      const d = downloads.value.find((x) => x.id === id);
      if (d) {
        d.received = received;
        if (total) d.total = total;
      }
    });
  }

  // 读取默认下载目录
  if (window.musicAPI.getDownloadDir) {
    try {
      downloadDir.value = await window.musicAPI.getDownloadDir();
    } catch (e) {
      /* ignore */
    }
  }
}

async function download(track) {
  if (!track) return;
  if (typeof window === 'undefined' || !window.musicAPI?.download) {
    alert('当前环境不支持下载');
    return;
  }
  if (track.type === 'local') {
    alert('该歌曲已在本地，无需下载');
    return;
  }

  // 在线歌曲若没有 url，先解析
  let srcUrl = track.url;
  if (track.type === 'online' && !srcUrl) {
    try {
      srcUrl = await resolveMusicUrl(track);
      track.url = srcUrl;
    } catch (e) {
      alert(e.message);
      return;
    }
  }
  if (!srcUrl) {
    alert('暂无可下载资源');
    return;
  }

  const id = genId('dl');
  const name = `${track.title || '未知'} - ${track.artist || '未知'}`;
  const item = {
    id,
    name,
    status: 'downloading',
    received: 0,
    total: 0,
    path: null,
    error: null,
    createdAt: Date.now()
  };
  downloads.value.unshift(item);

  try {
    const result = await window.musicAPI.download({ id, url: srcUrl, suggestedName: name });
    if (result?.ok) {
      item.status = 'done';
      item.path = result.path;
      if (item.total === 0) item.total = item.received; // 服务器没给 content-length 时
    } else {
      item.status = 'error';
      item.error = result?.error || '下载失败';
    }
  } catch (e) {
    item.status = 'error';
    item.error = e.message || String(e);
  }
}

function removeDownload(id) {
  const i = downloads.value.findIndex((x) => x.id === id);
  if (i >= 0) downloads.value.splice(i, 1);
}

function clearFinished() {
  downloads.value = downloads.value.filter((x) => x.status === 'downloading');
}

async function showInFolder(p) {
  if (window.musicAPI?.showInFolder) {
    await window.musicAPI.showInFolder(p);
  }
}

async function chooseDownloadDir() {
  if (!window.musicAPI?.chooseDownloadDir) return;
  const dir = await window.musicAPI.chooseDownloadDir();
  if (dir) downloadDir.value = dir;
}

const activeCount = computed(() => downloads.value.filter((d) => d.status === 'downloading').length);

export function useDownloads() {
  init();
  return {
    downloads,
    downloadDir,
    activeCount,
    download,
    removeDownload,
    clearFinished,
    showInFolder,
    chooseDownloadDir
  };
}
