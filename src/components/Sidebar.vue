<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePlayer } from '../composables/usePlayer';
import { useCustomSources } from '../composables/useCustomSources';

defineProps({
  navItems: { type: Array, required: true }
});

const route = useRoute();
const router = useRouter();
const { sourceStatus } = usePlayer();
const { sources: installedSources } = useCustomSources();

function go(name) {
  if (route.name !== name) router.push({ name });
}

// 把源 key 映射到已安装脚本中声明的展示名。
// 查不到就直接回显 key —— 名称来源完全由用户导入的脚本决定，播放器不内置任何映射。
const sourceNames = computed(() => {
  const map = {};
  for (const entry of installedSources.value) {
    for (const [key, meta] of Object.entries(entry.sources || {})) {
      if (!(key in map)) map[key] = meta?.name || key;
    }
  }
  return map;
});

const statusText = computed(() => {
  const s = sourceStatus.value;
  if (!s) return '';
  const name = sourceNames.value[s.source] || s.source;
  const verb = s.stage === 'search' ? '搜索' : '解析';
  const tag = s.phase === 'fallback' ? '兜底' : '请求';
  return `${tag}：${verb} ${name}`;
});
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-logo">♪</div>
      <div class="brand-name">远泽音乐</div>
    </div>

    <nav class="nav">
      <div
        v-for="item in navItems"
        :key="item.key"
        class="nav-item"
        :class="{ active: route.name === item.key }"
        @click="go(item.key)"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div
        class="sidebar-status"
        :class="{ active: !!sourceStatus, fallback: sourceStatus?.phase === 'fallback' }"
        :title="statusText"
      >
        <span class="status-dot" :class="{ active: !!sourceStatus }"></span>
        <span class="status-text">{{ statusText }}</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  background: linear-gradient(180deg, var(--bg-1) 0%, var(--bg-0) 100%);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 20px 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 22px 24px;
}
.brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  display: grid;
  place-items: center;
  font-size: 20px;
  color: white;
  box-shadow: 0 6px 20px rgba(123, 92, 255, 0.4);
}
.brand-name {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 12px;
  flex: 1;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  color: var(--text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}
.nav-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-1);
}
.nav-item.active {
  background: linear-gradient(90deg, rgba(123, 92, 255, 0.2), rgba(123, 92, 255, 0.05));
  color: var(--text-1);
  position: relative;
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background: var(--primary);
  border-radius: 0 3px 3px 0;
}
.nav-icon {
  width: 18px;
  text-align: center;
}

.sidebar-footer {
  padding: 16px 22px;
  min-height: 28px;
}
.sidebar-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-3);
  min-height: 16px;
}
.sidebar-status.active {
  color: var(--primary);
}
.sidebar-status.fallback {
  font-style: italic;
}
.status-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
  flex-shrink: 0;
  transition: background 0.2s;
}
/* 正在请求：同色脉冲圆点 */
.sidebar-status.active .status-dot {
  background: currentColor;
  box-shadow: 0 0 0 0 currentColor;
  animation: status-pulse 1.2s ease-out infinite;
}
@keyframes status-pulse {
  0% {
    box-shadow: 0 0 0 0 currentColor;
    opacity: 1;
  }
  70% {
    box-shadow: 0 0 0 6px rgba(255, 255, 255, 0);
    opacity: 0.9;
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
    opacity: 1;
  }
}
</style>
