<script setup>
import { useLocalMusic } from '../composables/useLocalMusic';
import { useFavorites } from '../composables/useFavorites';
import { usePlayer } from '../composables/usePlayer';
import { useDownloads } from '../composables/useDownloads';
import { useCustomSources } from '../composables/useCustomSources';
import { useRouter } from 'vue-router';

const router = useRouter();
const { localFolder, localTracks, chooseLocalFolder, rescan } = useLocalMusic();
const { favorites, clearFavorites } = useFavorites();
const { playQueue, clearQueue } = usePlayer();
const { downloadDir, chooseDownloadDir } = useDownloads();
const {
  sources: customSources,
  urlDraft: customUrlDraft,
  busy: customBusy,
  message: customMessage,
  messageStatus: customMessageStatus,
  importFromFile: customImportFile,
  importFromUrl: customImportUrl,
  removeSource: customRemove,
  toggleEnabled: customToggle,
  formatSourceKeys: customKeys
} = useCustomSources();
</script>

<template>
  <div class="view">
    <header class="view-topbar">
      <div class="page-title">设置</div>
    </header>
    <div class="view-content settings-wrap">
      <section class="settings-section">
        <div class="settings-title">本地音乐</div>
        <div class="settings-desc">指定本地音乐文件夹，应用启动后会自动加载。</div>
        <div class="settings-field">
          <label class="settings-label">当前文件夹</label>
          <div class="settings-input-row">
            <input class="settings-input" :value="localFolder || '未选择'" readonly />
            <button class="btn primary" @click="chooseLocalFolder">选择</button>
            <button class="btn ghost" @click="rescan" :disabled="!localFolder">重新扫描</button>
          </div>
          <div class="settings-hint">已扫描歌曲：{{ localTracks.length }} 首</div>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-title">下载</div>
        <div class="settings-desc">
          在线歌曲点击
          <code>⬇</code>
          按钮即可下载到指定文件夹，下载进度会显示在右下角。
          <br />
          默认目录为系统下载文件夹下的
          <code>YZMusic</code>
          子目录。
        </div>
        <div class="settings-field">
          <label class="settings-label">默认下载位置</label>
          <div class="settings-input-row">
            <input class="settings-input" :value="downloadDir || '使用系统默认下载目录'" readonly />
            <button class="btn primary" @click="chooseDownloadDir">选择</button>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-title">自定义源</div>
        <div class="settings-desc">
          兼容
          <a href="https://lxmusic.toside.cn/desktop/custom-source" target="_blank" rel="noopener">
            lxmusic 桌面端自定义源
          </a>
          脚本格式。
          <br />
          脚本运行在主进程沙箱内，可调用 Node 网络请求绕过 CORS。
          <strong style="color: var(--danger)">仅导入信任的脚本。</strong>
        </div>

        <div class="settings-field">
          <label class="settings-label">远程导入</label>
          <div class="settings-input-row">
            <input
              class="settings-input"
              v-model="customUrlDraft"
              placeholder="https://example.com/source.js"
              :disabled="customBusy"
            />
            <button class="btn primary" @click="customImportUrl" :disabled="customBusy">
              {{ customBusy ? '处理中…' : '导入' }}
            </button>
            <button class="btn ghost" @click="customImportFile" :disabled="customBusy">本地导入</button>
          </div>
          <div class="settings-hint" :class="customMessageStatus">{{ customMessage || ' ' }}</div>
        </div>

        <div class="settings-field" v-if="customSources.length">
          <label class="settings-label">接口测试</label>
          <div class="settings-input-row">
            <div class="settings-hint" style="flex: 1; margin: 0">
              加载完所有自定义源后，可进入测试页逐项检查 musicSearch / musicUrl / lyric / album / artistInfo 等接口。
            </div>
            <button class="btn ghost" @click="router.push({ name: 'sourceTest' })">打开测试页</button>
          </div>
        </div>

        <div class="settings-field" v-if="customSources.length">
          <label class="settings-label">已安装</label>
          <ul class="cs-list">
            <li v-for="s in customSources" :key="s.id" class="cs-item">
              <div class="cs-main">
                <div class="cs-name">
                  {{ s.name }}
                  <span v-if="s.version" class="cs-ver">v{{ s.version }}</span>
                </div>
                <div class="cs-meta">
                  支持：{{ customKeys(s) }}
                  <span v-if="s.author">· {{ s.author }}</span>
                </div>
                <div class="cs-desc" v-if="s.description">{{ s.description }}</div>
              </div>
              <div class="cs-actions">
                <label class="switch" :title="s.enabled ? '已启用' : '已禁用'">
                  <input type="checkbox" :checked="s.enabled" @change="customToggle(s)" />
                  <span class="switch-slider"></span>
                </label>
                <button class="btn ghost small" @click="customRemove(s.id)">删除</button>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-title">数据管理</div>
        <div class="settings-desc">收藏、下载目录、音量等数据保存在本地配置中。</div>
        <div class="settings-field">
          <div class="settings-input-row">
            <button class="btn ghost" @click="clearFavorites" :disabled="favorites.length === 0">
              清空收藏 ({{ favorites.length }})
            </button>
            <button class="btn ghost" @click="clearQueue" :disabled="playQueue.length === 0">
              清空正在播放 ({{ playQueue.length }})
            </button>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-title">关于</div>
        <div class="settings-desc">
          远泽音乐播放器 (YZMusic) · Electron + Vue 3 (Vite)
          <br />
          开源项目，仅供学习与个人使用
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-wrap {
  padding: 24px 32px 40px;
}

.settings-section {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 16px;
  max-width: 720px;
}
.settings-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 6px;
}
.settings-desc {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.6;
  margin-bottom: 16px;
}
.settings-desc code {
  background: var(--bg-3);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--accent);
}
.settings-field {
  margin-top: 12px;
}
.settings-label {
  display: block;
  font-size: 11px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 6px;
}
.settings-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.settings-input {
  flex: 1;
  background: var(--bg-2);
  border: 1px solid var(--border);
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-1);
  transition: border-color 0.15s;
}
.settings-input:focus {
  border-color: var(--primary);
  outline: none;
}
.settings-input[readonly] {
  color: var(--text-2);
  cursor: default;
}
.settings-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-3);
}
.settings-hint.ok {
  color: var(--accent);
}
.settings-hint.err {
  color: var(--danger);
}

.cs-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cs-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}
.cs-main {
  flex: 1;
  min-width: 0;
}
.cs-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.cs-ver {
  font-size: 11px;
  color: var(--text-3);
  font-weight: 400;
}
.cs-meta {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}
.cs-desc {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.btn.small {
  padding: 4px 10px;
  font-size: 12px;
}

.switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  cursor: pointer;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.switch-slider {
  position: absolute;
  inset: 0;
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 999px;
  transition:
    background 0.2s,
    border-color 0.2s;
}
.switch-slider::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-2);
  transition:
    transform 0.2s,
    background 0.2s;
}
.switch input:checked + .switch-slider {
  background: var(--primary);
  border-color: var(--primary);
}
.switch input:checked + .switch-slider::before {
  transform: translateX(16px);
  background: #fff;
}
.switch input:focus-visible + .switch-slider {
  box-shadow: 0 0 0 2px rgba(123, 92, 255, 0.4);
}
</style>
