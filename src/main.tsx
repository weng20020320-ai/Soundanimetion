import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// 注意：本 app 重度依赖 WebGL/Audio 等原生句柄（GPU 上下文、ScriptProcessorNode 等），
// 这些资源跟 React.StrictMode 的 dev 双挂载不兼容（卸载后 native 回调仍然在跑会刷错误日志），
// 因此故意不包 StrictMode。
const root = document.getElementById('root');
if (!root) throw new Error('Root container missing');
createRoot(root).render(<App />);

/* ------------------------------------------------------------------ */
/* Splash 淡出
 *
 * 双 requestAnimationFrame 的用意：
 *   第 1 帧：浏览器 schedule React 的 commit
 *   第 2 帧：React 已 commit 到 DOM，浏览器完成首帧 paint
 *   此时再触发 fade，用户看到的是"splash 淡出 + UI 露出"的平滑过渡，
 *   而不是"splash 突然消失但 UI 还没准备好"的闪烁。
 *
 * setTimeout 等 transition (420ms) 跑完再 remove，避免 fade 中途被 GC。
 * ------------------------------------------------------------------ */
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById('splash');
    if (!splash) return;
    splash.classList.add('fading');
    setTimeout(() => splash.remove(), 480);
  });
});
