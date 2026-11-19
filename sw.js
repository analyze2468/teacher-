/**
 * Service Worker：核心静态资源预缓存 + 基础离线访问
 *
 * 设计要点
 * 1. 只处理同源 GET 请求；跨域（B 站播放器 iframe、AI 接口）与 Range 请求（音视频分段）直接放行，
 *    因此不会影响 AI 评分、录音回放等既有功能。
 * 2. 页面（导航请求）：network-first，超时或断网回落到缓存；带查询参数（?id=S001 / ?type=self）
 *    也能命中已缓存的同名页面（ignoreSearch）。
 * 3. 静态资源（css / js / 图片）：stale-while-revalidate，先给缓存再后台更新，二次打开更快。
 * 4. data/*.json：network-first，题库改动能及时生效，断网时用缓存兜底。
 * 5. 升级方式：修改 CACHE_VERSION，旧缓存会在 activate 阶段被清理。
 *
 * 路径全部使用相对于本文件的 './'，部署到 GitHub Pages 子目录（/repo/）时同样可用。
 */

const CACHE_VERSION = 'v1';
const PRECACHE = `jzms-precache-${CACHE_VERSION}`;
const RUNTIME = `jzms-runtime-${CACHE_VERSION}`;
/** 离线兜底页：页面自身没缓存时返回首页 */
const OFFLINE_PAGE = './index.html';
/** 页面/数据的网络超时（毫秒），超时改用缓存，避免弱网一直转圈 */
const NETWORK_TIMEOUT = 3500;

/** 预缓存清单：安装成功后即具备离线能力 */
const CORE_ASSETS = [
  './',
  './index.html',
  './structured-hub.html',
  './structured-template.html',
  './structured-list.html',
  './structured.html',
  './select.html',
  './math.html',
  './records.html',
  './videos.html',
  './manifest.json',

  './app.css',
  './tailwind-play.js',

  './favicon.ico',
  './favicon-32.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',

  './pwa.js',
  './tailwind-config.js',
  './utils.js',
  './storage.js',
  './data-loader.js',
  './timer.js',
  './picker.js',
  './recorder.js',
  './template-store.js',
  './llm.js',
  './settings.js',
  './scoring.js',
  './structured-nav.js',
  './home.js',
  './select-page.js',
  './math-page.js',
  './structured-hub-page.js',
  './structured-template-page.js',
  './structured-list-page.js',
  './structured-page.js',
  './records-page.js',
  './videos-page.js',

  './structured-questions.json',
  './structured-templates.json',
  './math-questions.json',
  './math-outline.json',
  './videos.json'
];

/* --------------------------------- 安装 / 激活 --------------------------------- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // cache: 'reload' 绕过 HTTP 缓存，保证拿到的是最新副本
      await cache.addAll(CORE_ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PRECACHE, RUNTIME]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

/** 由 pwa.js 在页面隐藏时调用，用于切换新版本；不会强制刷新页面 */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ----------------------------------- 请求拦截 ----------------------------------- */

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  // 跨域资源（视频 iframe、AI 接口等）不接管，保持原有网络行为
  if (url.origin !== self.location.origin) return;
  // 音视频分段请求交给浏览器，避免缓存出问题导致回放卡住
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

/* ------------------------------------ 策略实现 ------------------------------------ */

/** 页面导航：先网络（带超时），失败回落缓存，再回落首页 */
async function handleNavigation(request) {
  try {
    const response = await fetchWithTimeout(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached =
      (await caches.match(request)) ||
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match(OFFLINE_PAGE, { ignoreSearch: true }));
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>离线</title>' +
        '<body style="font:16px/1.7 -apple-system,Segoe UI,Microsoft YaHei,sans-serif;padding:40px;color:#1e293b">' +
        '<h1 style="font-size:18px">当前处于离线状态</h1>' +
        '<p>这个页面还没有缓存。联网后再打开一次，就可以离线使用了。</p></body>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

/** 网络优先（data/*.json 用），断网回落缓存 */
async function networkFirst(request) {
  try {
    const response = await fetchWithTimeout(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    throw error;
  }
}

/** 缓存优先 + 后台更新（css / js / 图片等静态资源） */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  // 预缓存与运行时缓存都查一遍
  const cached = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }));

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    network.catch(() => {});
    return cached;
  }
  const fresh = await network;
  if (fresh) return fresh;
  return new Response('', { status: 504, statusText: 'Offline' });
}

/** 带超时的 fetch：超时抛错，交给缓存兜底 */
function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network-timeout')), NETWORK_TIMEOUT);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
