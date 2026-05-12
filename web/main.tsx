/**
 * Web 入口。和 src/main.tsx 大同小异，区别：
 *  1. 挂载 React 之前先 attachWebApi() 注入 window.api 的浏览器 polyfill
 *  2. 桌面版在 preload.cjs 里挂 window.api，web 上没有 preload，必须自己挂
 *
 * 安全性：ESM import 顺序保证 attachWebApi 在 React 组件渲染前执行；
 * 而 App.tsx 里所有 window.api.* 调用都在 useEffect / event handler 里，
 * 不会在模块 eval 阶段触发。
 */
import { createRoot } from 'react-dom/client';
import { attachWebApi } from '../src/platform/web-api';
import App from '../src/App';
import '../src/index.css';

attachWebApi();

const root = document.getElementById('root');
if (!root) throw new Error('Root container missing');
createRoot(root).render(<App />);

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById('splash');
    if (!splash) return;
    splash.classList.add('fading');
    setTimeout(() => splash.remove(), 480);
  });
});
