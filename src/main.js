import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { installNavHistory } from './router/history';
import './style.css';

installNavHistory(router);
createApp(App).use(router).mount('#app');
