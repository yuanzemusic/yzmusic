import { createRouter, createWebHashHistory } from 'vue-router';

import HomeView from '../views/HomeView.vue';
import SearchView from '../views/SearchView.vue';
import LocalView from '../views/LocalView.vue';
import FavoritesView from '../views/FavoritesView.vue';
import QueueView from '../views/QueueView.vue';
import SettingsView from '../views/SettingsView.vue';
import ArtistView from '../views/ArtistView.vue';
import AlbumView from '../views/AlbumView.vue';
import DownloadsView from '../views/DownloadsView.vue';
import PlaylistsView from '../views/PlaylistsView.vue';
import PlaylistView from '../views/PlaylistView.vue';
import SourceTestView from '../views/SourceTestView.vue';

const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { title: '首页' } },
  { path: '/search', name: 'search', component: SearchView, meta: { title: '在线搜索' } },
  { path: '/local', name: 'local', component: LocalView, meta: { title: '本地音乐' } },
  { path: '/favorites', name: 'favorites', component: FavoritesView, meta: { title: '我的收藏' } },
  { path: '/queue', name: 'queue', component: QueueView, meta: { title: '正在播放' } },
  { path: '/playlists', name: 'playlists', component: PlaylistsView, meta: { title: '歌单' } },
  { path: '/playlist/:id', name: 'playlist', component: PlaylistView, meta: { title: '歌单' }, props: true },
  { path: '/downloads', name: 'downloads', component: DownloadsView, meta: { title: '我的下载' } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { title: '设置' } },
  { path: '/source-test', name: 'sourceTest', component: SourceTestView, meta: { title: '源接口测试' } },
  {
    path: '/artist/:id',
    name: 'artist',
    component: ArtistView,
    meta: { title: '艺术家' },
    props: (route) => ({ id: route.params.id, source: route.query.source || '' })
  },
  {
    path: '/album/:id',
    name: 'album',
    component: AlbumView,
    meta: { title: '专辑' },
    props: (route) => ({ id: route.params.id, source: route.query.source || '' })
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes
});
