import { ref } from 'vue';

const localFolder = ref('');
const localTracks = ref([]);
const scanning = ref(false);
let initialized = false;

async function init() {
  if (initialized) return;
  initialized = true;
  try {
    const saved = await window.musicAPI.storeGet('localFolder');
    if (saved) localFolder.value = saved;
  } catch (e) {
    /* ignore */
  }
}

async function chooseLocalFolder() {
  const dir = await window.musicAPI.selectFolder();
  if (!dir) return;
  localFolder.value = dir;
  await window.musicAPI.storeSet('localFolder', dir);
  await rescan();
}

async function rescan() {
  if (!localFolder.value) return;
  scanning.value = true;
  localTracks.value = [];
  try {
    localTracks.value = await window.musicAPI.scanFolder(localFolder.value);
  } finally {
    scanning.value = false;
  }
}

export function useLocalMusic() {
  init();
  return { localFolder, localTracks, scanning, chooseLocalFolder, rescan };
}
