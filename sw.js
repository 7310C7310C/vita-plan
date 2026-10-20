/* 離線歌譜 Service Worker
 * 只在頁面已建立離線緩存（state.files）後才介入；未下載時完全走網絡。
 * 快取 key 一律使用不含 query 的路徑，讓 ?v= 版本號不會造成重複下載。
 */
const META_DB = 'vita_plan_offline';
const META_STORE = 'meta';
const META_KEY = 'state';
const BYPASS_HEADER = 'x-vp-offline-bypass';

let cachedState = null;
let cachedStateAt = 0;

function openMetaDB() {
    return new Promise(function (resolve, reject) {
        const req = indexedDB.open(META_DB, 1);
        req.onupgradeneeded = function () {
            const db = req.result;
            if (!db.objectStoreNames.contains(META_STORE)) {
                db.createObjectStore(META_STORE);
            }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
    });
}

function readState() {
    return openMetaDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            const tx = db.transaction(META_STORE, 'readonly');
            const req = tx.objectStore(META_STORE).get(META_KEY);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { reject(req.error); };
        });
    });
}

async function getState() {
    if (cachedState !== null && Date.now() - cachedStateAt < 1000) {
        return cachedState;
    }
    try {
        cachedState = await readState();
    } catch (e) {
        cachedState = null;
    }
    cachedStateAt = Date.now();
    return cachedState;
}

function requestForPath(pathname) {
    return new Request(new URL(pathname, self.location.origin).href);
}

async function matchAny(cacheNames, key) {
    for (let i = 0; i < cacheNames.length; i++) {
        const name = cacheNames[i];
        try {
            // cacheName 查詢不會在 cache 被刪除後重建空 cache
            const hit = await caches.match(key, { cacheName: name });
            if (hit) return hit;
        } catch (e) {
            // 忽略單一 cache 的錯誤，繼續找下一個
        }
    }
    return null;
}

function offlineResponse() {
    return new Response('', { status: 504, statusText: 'Offline' });
}

async function fetchSongs(request) {
    // songs.json 只能由離線清單的手動下載/更新寫入；SW 不寫 active cache，
    // 避免部分 cache 缺失時把新目錄混進舊快照。
    return await fetch(request, { cache: 'no-store' });
}

async function handleFetch(event) {
    const req = event.request;
    const url = new URL(req.url);
    const scopePath = new URL(self.registration.scope).pathname;
    const scopeRoot = scopePath.replace(/\/$/, '');

    let keyPath = url.pathname;
    if (req.mode === 'navigate') {
        if (keyPath === scopePath || (scopeRoot && keyPath === scopeRoot)) {
            keyPath = scopePath + 'index.html';
        } else if (keyPath.charAt(keyPath.length - 1) === '/') {
            keyPath += 'index.html';
        }
    }

    const state = await getState();
    if (!state || !state.caches || !state.caches.length || !state.files) {
        return fetch(req);
    }

    const isIndex = keyPath === scopePath + 'index.html';
    const isSongs = keyPath === scopePath + 'songs.json';
    let relativeKey = keyPath;
    if (relativeKey.indexOf(scopePath) === 0) {
        relativeKey = relativeKey.slice(scopePath.length);
    }
    try {
        relativeKey = decodeURIComponent(relativeKey);
    } catch (e) {
        // keep the encoded path if it is malformed
    }
    const known = isIndex || isSongs
        || Object.prototype.hasOwnProperty.call(state.files, relativeKey);
    if (!known) {
        return fetch(req);
    }

    const key = requestForPath(keyPath);
    const found = await matchAny(state.caches, key);

    if (isSongs) {
        // 與其他資源一致：cache-first。不在背景更新 active cache，
        // 讓離線快照（songs.json + 圖片）保持原子性；新目錄只在手動更新時整體切換。
        if (found) return found;
        try {
            return await fetchSongs(req);
        } catch (e) {
            return offlineResponse();
        }
    }

    if (found) return found;

    try {
        return await fetch(req);
    } catch (e) {
        return offlineResponse();
    }
}

function isAdminPath(pathname) {
    const scopePath = new URL(self.registration.scope).pathname;
    let relative = pathname;
    if (pathname.indexOf(scopePath) === 0) {
        relative = pathname.slice(scopePath.length);
    }
    return relative === 'admin' || relative.indexOf('admin/') === 0;
}

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', function (event) {
    const data = event.data;
    if (data && data.type === 'vp-offline-state-changed') {
        cachedState = null;
        cachedStateAt = 0;
    }
});

self.addEventListener('fetch', function (event) {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (req.headers.has('range')) return;
    if (req.headers.has('authorization')) return;
    if (req.headers.has(BYPASS_HEADER)) return;
    if (isAdminPath(url.pathname)) return;
    const scopePath = new URL(self.registration.scope).pathname;
    if (url.pathname === scopePath + 'offline-manifest.json') return;

    event.respondWith(handleFetch(event).catch(function () {
        return fetch(req).catch(function () {
            return offlineResponse();
        });
    }));
});
