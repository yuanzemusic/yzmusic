import { ref } from 'vue';

/*
 * 全局浮层：把歌曲加入歌单
 *   open    — 是否显示
 *   target  — 待加入的 track（或多个 track）
 *   toast   — 短暂提示文字
 */

const open = ref(false);
const target = ref(null); // track | track[]
const toast = ref(''); // 简单提示
let toastTimer = null;

function openFor(track) {
  if (!track) return;
  target.value = track;
  open.value = true;
}

function close() {
  open.value = false;
  target.value = null;
}

function showToast(msg) {
  toast.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 2000);
}

export function useAddToPlaylist() {
  return { open, target, toast, openFor, close, showToast };
}
