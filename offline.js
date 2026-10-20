/* 離線歌譜管理器
 * - 首次由使用者按下載，將全部樂譜與頁面資源寫入 Cache Storage
 * - 之後由 Service Worker 直接從本機快取提供
 * - 手動檢查更新：以 offline-manifest.json 的 Git blob hash 逐檔比對，只下載有變更的檔案
 */
(function () {
    'use strict';

    const DB_NAME = 'vita_plan_offline';
    const DB_VERSION = 1;
    const STORE_NAME = 'meta';
    const STATE_KEY = 'state';
    const CACHE_PREFIX = 'vita-plan-assets-';
    const BYPASS_HEADER = 'X-VP-Offline-Bypass';
    const IMAGE_VERSION_KEY = 'vp_offline_version';
    const MANIFEST_PATH = 'offline-manifest.json';
    const STATE_SCHEMA = 2;
    const LOCK_NAME = 'vita-plan-offline-v1';
    const BROADCAST_NAME = 'vita-plan-offline';
    const REQUIRED_OFFLINE_FILES = [
        'index.html', 'style.css', 'script.js', 'offline.js', 'songs.json', 'favicon.ico'
    ];
    const GET_TIMEOUT = 60000;
    const SW_READY_TIMEOUT = 12000;
    const SW_CONTROL_TIMEOUT = 3000;
    const COMPACT_THRESHOLD = 4;
    const COMPACT_HEADROOM = 1.15;
    const COMPACT_MIN_FREE = 1024 * 1024;
    const SELF_SRC = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : new URL('offline.js', location.href).href;
    // 以 offline.js 所在目錄為站台根目錄，兼容 / 與 /vita-plan/ 兩種部署路徑
    const BASE_URL = new URL('.', SELF_SRC).href;

    function setImageVersion(version) {
        const value = typeof version === 'string' ? version : '';
        window.VP_IMAGE_VERSION = value;
        try {
            if (value) localStorage.setItem(IMAGE_VERSION_KEY, value);
            else localStorage.removeItem(IMAGE_VERSION_KEY);
        } catch (e) {
            // localStorage 不可用時仍保留本次頁面的版本
        }
    }

    // 同步設定，確保 script.js 的圖片 helper 在使用者互動前就有版本可用
    (function () {
        let stored = '';
        try { stored = localStorage.getItem(IMAGE_VERSION_KEY) || ''; } catch (e) { stored = ''; }
        window.VP_IMAGE_VERSION = stored;
    })();

    const I18N = {
        zh: {
            title: '离线歌谱',
            notDownloaded: '未下载',
            incomplete: '缓存不完整',
            working: '处理中……',
            downloadAll: '下载全部（约 36MB）',
            continue: '继续下载',
            checkUpdate: '检查更新',
            cachedStatus: '已缓存 {n}/{n} 张 · {date}',
            reading: '正在读取离线状态……',
            unavailableButton: '离线缓存不可用',
            swUnsupported: '此浏览器不支持离线缓存。',
            swRegisterFailed: '离线缓存初始化失败，请刷新页面重试。',
            swNotReady: '离线缓存尚未就绪，请稍后重试。',
            stateError: '读取离线状态失败，请刷新页面重试。',
            locksUnsupported: '此浏览器不支持离线下载（需要较新浏览器）。',
            manifestMissing: '离线清单缺失或无法读取，请刷新页面后重试。',
            manifestInvalid: '离线清单格式无效，请刷新页面后重试。',
            manifestChanged: '离线清单已被更新，请重新检查更新。',
            otherTabUpdated: '另一分页已更新离线缓存，请重新检查更新。',
            contentMismatch: '文件内容与离线清单不一致，已停止操作。',
            integrityUnsupported: '此浏览器不支持完整性校验。',
            incompleteManifest: '仍有 {n} 个文件缺失，缓存不完整。',
            storageInsufficient: '可用存储空间不足，无法完成离线缓存。',
            downloadTitle: '正在下载乐谱',
            downloadMsg: '首次下载全部乐谱，完成后可离线打开。请保持页面打开。',
            checkTitle: '正在检查更新',
            checkMsg: '正在比对页面与乐谱文件，请稍候。',
            updateTitle: '正在更新乐谱',
            updateMsg: '只下载有变更的文件，请保持页面打开。',
            progress: '已处理 {done}/{total}',
            progressBytes: '已处理 {done}/{total} · {size}',
            upToDate: '已是最新版本',
            confirmTitle: '发现新版本',
            confirmMsg: '共 {n} 个文件有更新，约 {size}。是否立即更新？',
            confirmNoSize: '共 {n} 个文件有更新，是否立即更新？',
            updateNow: '立即更新',
            cancel: '取消',
            doneTitle: '下载完成',
            updateDoneTitle: '更新完成',
            doneMsg: '已保存到此浏览器，刷新页面后生效。',
            refresh: '刷新页面',
            later: '稍后',
            errorTitle: '操作失败',
            errorMsg: '{msg}',
            retry: '重试',
            close: '关闭',
            offlineError: '目前离线，请联网后再试。',
            storageError: '存储空间不足，无法完成下载。',
            downloadFailed: '有 {n} 个文件下载失败，已下载的部分会保留，可重试续传。',
            updateFailed: '有 {n} 个文件更新失败，旧版本仍可继续使用。',
            checkFailed: '检查更新失败，请稍后重试。',
            checkTimeout: '检查更新超时，请检查网络后重试。',
            downloadTimeout: '有 {n} 个文件下载超时，已下载的部分会保留，可重试续传。',
            updateTimeout: '有 {n} 个文件更新超时，旧版本仍可继续使用。',
            requestFailed: '文件请求失败（HTTP {status}）。',
            timeout: '请求超时（{seconds} 秒），请检查网络后重试。'
        },
        en: {
            title: 'Offline Sheet Music',
            notDownloaded: 'Not downloaded',
            incomplete: 'Cache incomplete',
            working: 'Working...',
            downloadAll: 'Download all (about 36MB)',
            continue: 'Continue download',
            checkUpdate: 'Check for updates',
            cachedStatus: 'Cached {n}/{n} · {date}',
            reading: 'Reading offline status...',
            unavailableButton: 'Offline cache unavailable',
            swUnsupported: 'This browser does not support offline caching.',
            swRegisterFailed: 'Offline cache could not be initialized. Please refresh and try again.',
            swNotReady: 'Offline cache is not ready yet. Please try again.',
            stateError: 'Could not read offline state. Please refresh and try again.',
            locksUnsupported: 'This browser does not support offline downloads (a newer browser is required).',
            manifestMissing: 'The offline manifest is missing or unreadable. Please refresh and try again.',
            manifestInvalid: 'The offline manifest is invalid. Please refresh and try again.',
            manifestChanged: 'The offline manifest changed. Please check for updates again.',
            otherTabUpdated: 'Another tab updated the offline cache. Please check for updates again.',
            contentMismatch: 'A downloaded file did not match the offline manifest. The operation was stopped.',
            integrityUnsupported: 'This browser does not support integrity verification.',
            incompleteManifest: '{n} files are still missing; the cache is incomplete.',
            storageInsufficient: 'There is not enough storage to finish the offline cache.',
            downloadTitle: 'Downloading sheet music',
            downloadMsg: 'Download all sheet music once, then open them offline. Keep this page open.',
            checkTitle: 'Checking for updates',
            checkMsg: 'Comparing local files with the server. Please wait.',
            updateTitle: 'Updating sheet music',
            updateMsg: 'Only changed files will be downloaded. Keep this page open.',
            progress: '{done}/{total} processed',
            progressBytes: '{done}/{total} · {size}',
            upToDate: 'You are up to date',
            confirmTitle: 'Update available',
            confirmMsg: '{n} files have changed, about {size}. Update now?',
            confirmNoSize: '{n} files have changed. Update now?',
            updateNow: 'Update now',
            cancel: 'Cancel',
            doneTitle: 'Download complete',
            updateDoneTitle: 'Update complete',
            doneMsg: 'Saved in this browser. Refresh the page to apply.',
            refresh: 'Refresh page',
            later: 'Later',
            errorTitle: 'Something went wrong',
            errorMsg: '{msg}',
            retry: 'Retry',
            close: 'Close',
            offlineError: 'You are offline. Please reconnect and try again.',
            storageError: 'Not enough storage to finish the download.',
            downloadFailed: '{n} files failed to download. Downloaded files are kept for resume.',
            updateFailed: '{n} files failed to update. The previous version is still available.',
            checkFailed: 'Could not check for updates. Please try again.',
            checkTimeout: 'Checking for updates timed out. Please check your connection and retry.',
            downloadTimeout: '{n} files timed out while downloading. Downloaded files are kept for resume.',
            updateTimeout: '{n} files timed out while updating. The previous version is still available.',
            requestFailed: 'Request failed (HTTP {status}).',
            timeout: 'The request timed out after {seconds} seconds. Please check your connection and retry.'
        }
    };

    let state = null;
    let busy = false;
    let applying = false;
    let lastAction = 'download';
    let unloadHandler = null;
    let keydownHandler = null;
    let wheelHandler = null;
    let touchHandler = null;
    let inertedElements = [];
    let overlayOpen = false;
    let overlayInteractive = false;
    let focusReturnPending = false;
    let overlayEscape = null;
    let overlayKeydown = null;
    let lastFocusedElement = null;
    let swFailure = null;
    let compacting = false;
    let initialized = false;
    const locksSupported = !!(navigator.locks && typeof navigator.locks.request === 'function');
    let checking = false;
    let stateLoadFailed = false;
    const broadcastChannel = (typeof BroadcastChannel === 'function')
        ? new BroadcastChannel(BROADCAST_NAME)
        : null;

    function lang() {
        try {
            return localStorage.getItem('fhj_language') === 'en' ? 'en' : 'zh';
        } catch (e) {
            return 'zh';
        }
    }

    function tr(key, vars) {
        const dict = I18N[lang()] || I18N.zh;
        let text = dict[key] || key;
        if (vars) {
            Object.keys(vars).forEach(function (name) {
                text = text.split('{' + name + '}').join(String(vars[name]));
            });
        }
        return text;
    }

    function defaultState() {
        return {
            schema: STATE_SCHEMA,
            revision: 0,
            caches: [],
            files: {},
            complete: false,
            updatedAt: null,
            imageCount: 0,
            staging: null,
            stagingVersion: null,
            manifestVersion: null
        };
    }

    function openDB() {
        return new Promise(function (resolve, reject) {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function () {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function loadState() {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { reject(req.error); };
            });
        });
    }

    function saveState(snapshot) {
        snapshot = snapshot || state;
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(snapshot, STATE_KEY);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    async function loadLatestState() {
        const loaded = await loadState();
        if (!loaded) return defaultState();
        if (loaded.schema !== STATE_SCHEMA) {
            // 舊版 state 沒有 manifest/hash，保留 cache 但視為不完整，需重新下載
            const migrated = defaultState();
            migrated.caches = Array.isArray(loaded.caches) ? loaded.caches : [];
            migrated.updatedAt = loaded.updatedAt || null;
            migrated.imageCount = loaded.imageCount || 0;
            migrated.revision = Number(loaded.revision) || 0;
            return migrated;
        }
        const current = Object.assign(defaultState(), loaded);
        if (!Array.isArray(current.caches)) current.caches = [];
        if (!current.files || typeof current.files !== 'object') current.files = {};
        current.revision = Number(current.revision) || 0;
        current.schema = STATE_SCHEMA;
        return current;
    }

    async function withOfflineLock(task) {
        if (!locksSupported) {
            throw new Error(tr('locksUnsupported'));
        }
        return await navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, task);
    }

    function broadcastStateChanged() {
        if (!broadcastChannel) return;
        try {
            broadcastChannel.postMessage({ type: 'state-changed' });
        } catch (e) {
            // ignore
        }
    }

    function notifyStateChanged() {
        notifyServiceWorker();
        broadcastStateChanged();
    }

    function isAllowedManifestPath(path) {
        if (typeof path !== 'string' || !path) return false;
        if (path.charAt(0) === '/' || path.indexOf('\\') !== -1) return false;
        if (path.split('/').indexOf('..') !== -1) return false;
        if (REQUIRED_OFFLINE_FILES.indexOf(path) !== -1) return true;
        return path.indexOf('img/') === 0 && path.length > 4;
    }

    function manifestUrl() {
        return new URL(MANIFEST_PATH, BASE_URL).href;
    }

    function normalizeManifest(data) {
        if (!data || typeof data.version !== 'string' || !data.version
            || !data.files || typeof data.files !== 'object' || Array.isArray(data.files)) {
            throw new Error(tr('manifestInvalid'));
        }
        const files = {};
        const paths = Object.keys(data.files);
        for (let i = 0; i < paths.length; i++) {
            const path = paths[i];
            const entry = data.files[path];
            if (!isAllowedManifestPath(path) || !entry
                || typeof entry.hash !== 'string' || !/^[0-9a-f]{40}$/i.test(entry.hash)
                || typeof entry.size !== 'number' || !isFinite(entry.size) || entry.size < 0) {
                throw new Error(tr('manifestInvalid'));
            }
            files[path] = { hash: entry.hash.toLowerCase(), size: Math.floor(entry.size) };
        }
        for (let i = 0; i < REQUIRED_OFFLINE_FILES.length; i++) {
            if (!files[REQUIRED_OFFLINE_FILES[i]]) throw new Error(tr('manifestInvalid'));
        }
        return { version: data.version, files: files };
    }

    async function fetchManifest() {
        let res;
        try {
            res = await fetchWithTimeout(withBust(manifestUrl()), {
                cache: 'no-store',
                headers: { [BYPASS_HEADER]: '1' }
            }, GET_TIMEOUT);
        } catch (error) {
            if (error && error.name === 'TimeoutError') throw error;
            throw new Error(tr('manifestMissing'));
        }
        if (!res.ok) throw new Error(tr('manifestMissing'));
        let data;
        try {
            data = await res.json();
        } catch (e) {
            throw new Error(tr('manifestInvalid'));
        }
        return normalizeManifest(data);
    }

    function manifestEntries(manifest) {
        return Object.keys(manifest.files).sort().map(function (path) {
            const url = new URL(path, BASE_URL).href;
            return {
                path: path,
                url: url,
                key: pathOf(url),
                hash: manifest.files[path].hash,
                size: manifest.files[path].size,
                image: path.indexOf('img/') === 0
            };
        });
    }

    function filesFromManifest(manifest) {
        const files = {};
        Object.keys(manifest.files).forEach(function (path) {
            files[path] = {
                hash: manifest.files[path].hash,
                size: manifest.files[path].size
            };
        });
        return files;
    }

    function imageCountOf(manifest) {
        return Object.keys(manifest.files).filter(function (path) {
            return path.indexOf('img/') === 0;
        }).length;
    }

    function cacheKeyFor(path) {
        return pathOf(new URL(path, BASE_URL).href);
    }

    function diffManifest(files, manifest) {
        const changed = [];
        const removed = [];
        Object.keys(manifest.files).sort().forEach(function (path) {
            const old = files ? files[path] : null;
            if (!old || old.hash !== manifest.files[path].hash) {
                changed.push({
                    path: path,
                    url: new URL(path, BASE_URL).href,
                    key: cacheKeyFor(path),
                    hash: manifest.files[path].hash,
                    size: manifest.files[path].size,
                    image: path.indexOf('img/') === 0
                });
            }
        });
        Object.keys(files || {}).forEach(function (path) {
            if (!manifest.files[path]) removed.push(path);
        });
        return { changed: changed, removed: removed };
    }

    async function gitBlobHash(buffer) {
        if (!window.crypto || !window.crypto.subtle) {
            const error = new Error(tr('integrityUnsupported'));
            error.name = 'IntegrityError';
            throw error;
        }
        const header = new TextEncoder().encode('blob ' + buffer.byteLength + '\0');
        const bytes = new Uint8Array(header.length + buffer.byteLength);
        bytes.set(header, 0);
        bytes.set(new Uint8Array(buffer), header.length);
        const digest = await window.crypto.subtle.digest('SHA-1', bytes);
        return Array.prototype.map.call(new Uint8Array(digest), function (b) {
            return b.toString(16).padStart(2, '0');
        }).join('');
    }

    async function verifyDownloaded(response, entry) {
        const buffer = await response.clone().arrayBuffer();
        if (buffer.byteLength !== Number(entry.size)) {
            throw new Error(tr('contentMismatch'));
        }
        let hash;
        try {
            hash = await gitBlobHash(buffer);
        } catch (e) {
            if (e && e.name === 'IntegrityError') throw e;
            const error = new Error(tr('integrityUnsupported'));
            error.name = 'IntegrityError';
            throw error;
        }
        if (hash !== entry.hash) {
            throw new Error(tr('contentMismatch'));
        }
    }

    function isQuotaError(error) {
        return !!error && (error.name === 'QuotaExceededError'
            || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
            || error.name === 'StorageError');
    }

    function throwPoolError(errors, timeoutKey, genericKey) {
        const quota = (errors || []).filter(function (entry) {
            return entry && isQuotaError(entry.error);
        });
        if (quota.length) {
            const error = new Error(tr('storageError'));
            error.name = 'QuotaExceededError';
            throw error;
        }
        const integrity = (errors || []).filter(function (entry) {
            return entry && entry.error && entry.error.name === 'IntegrityError';
        });
        if (integrity.length) {
            throw new Error(integrity[0].error.message);
        }
        const timeouts = countTimeouts(errors);
        throw new Error(timeouts ? tr(timeoutKey, { n: timeouts }) : tr(genericKey, { n: errors.length }));
    }

    async function preflightStorage(bytes) {
        if (!bytes || bytes <= 0) return;
        if (!navigator.storage || typeof navigator.storage.estimate !== 'function') return;
        try {
            const estimate = await navigator.storage.estimate();
            if (!estimate || typeof estimate.quota !== 'number' || typeof estimate.usage !== 'number') return;
            const free = estimate.quota - estimate.usage;
            if (free < bytes * 1.1 + 1024 * 1024) {
                const error = new Error(tr('storageInsufficient'));
                error.name = 'StorageError';
                throw error;
            }
        } catch (error) {
            if (error && error.name === 'StorageError') throw error;
            // 其他 estimate 失敗不阻擋下載，寫入失敗時仍會顯示 storageError
        }
    }

    function requestPersistentStorage() {
        if (!navigator.storage || typeof navigator.storage.persist !== 'function') return;
        try {
            navigator.storage.persist().catch(function () {});
        } catch (e) {
            // ignore
        }
    }

    async function missingManifestFiles(cacheNames, manifest) {
        const missing = [];
        const paths = Object.keys(manifest.files);
        for (let i = 0; i < paths.length; i++) {
            const hit = await matchAnyIn(cacheNames, cacheKeyFor(paths[i]));
            if (!hit) missing.push(paths[i]);
        }
        return missing;
    }

    function notifyServiceWorker() {
        const sw = navigator.serviceWorker;
        if (!sw) return;
        const message = { type: 'vp-offline-state-changed' };
        try {
            if (sw.controller) sw.controller.postMessage(message);
        } catch (e) {
            // ignore
        }
        sw.ready.then(function (registration) {
            const worker = registration.active || registration.waiting || registration.installing;
            if (worker) worker.postMessage(message);
        }).catch(function () {});
    }

    function withTimeout(promise, timeoutMs, message) {
        return new Promise(function (resolve, reject) {
            const timer = setTimeout(function () {
                reject(new Error(message));
            }, timeoutMs);
            promise.then(function (value) {
                clearTimeout(timer);
                resolve(value);
            }, function (error) {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    function waitForController() {
        if (navigator.serviceWorker.controller) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            let timer = null;
            function cleanup() {
                if (timer) clearTimeout(timer);
                navigator.serviceWorker.removeEventListener('controllerchange', onChange);
            }
            function onChange() {
                if (navigator.serviceWorker.controller) {
                    cleanup();
                    resolve();
                }
            }
            timer = setTimeout(function () {
                cleanup();
                reject(new Error(tr('swNotReady')));
            }, SW_CONTROL_TIMEOUT);
            navigator.serviceWorker.addEventListener('controllerchange', onChange);
            if (navigator.serviceWorker.controller) {
                cleanup();
                resolve();
            }
        });
    }

    async function ensureServiceWorker() {
        if (!navigator.serviceWorker) {
            swFailure = tr('swUnsupported');
            throw new Error(swFailure);
        }
        let registration;
        try {
            registration = await withTimeout(
                navigator.serviceWorker.register(new URL('sw.js', SELF_SRC).href),
                SW_READY_TIMEOUT,
                tr('swNotReady')
            );
        } catch (e) {
            swFailure = tr('swRegisterFailed');
            throw new Error(swFailure);
        }
        try {
            await withTimeout(navigator.serviceWorker.ready, SW_READY_TIMEOUT, tr('swNotReady'));
            await waitForController();
        } catch (e) {
            swFailure = tr('swNotReady');
            throw new Error(swFailure);
        }
        swFailure = null;
        return registration;
    }

    async function fetchWithTimeout(url, options, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(function () {
            controller.abort();
        }, timeoutMs);
        try {
            return await fetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
        } catch (error) {
            if (error && error.name === 'AbortError') {
                const timeoutError = new Error(tr('timeout', { seconds: Math.round(timeoutMs / 1000) }));
                timeoutError.name = 'TimeoutError';
                throw timeoutError;
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    function countTimeouts(errors) {
        return (errors || []).filter(function (entry) {
            return entry && entry.error && entry.error.name === 'TimeoutError';
        }).length;
    }

    function showOfflineUnavailable(message) {
        const title = offlineTitleEl();
        const status = offlineStatusEl();
        const btn = offlineButtonEl();
        if (!title || !status || !btn) return;
        title.textContent = tr('title');
        status.textContent = message || tr('swRegisterFailed');
        btn.textContent = tr('unavailableButton');
        btn.disabled = true;
        btn.dataset.action = '';
    }

    function showLocksUnsupported() {
        showOfflineUnavailable(tr('locksUnsupported'));
    }

    function pathOf(url) {
        return new URL(url, BASE_URL).pathname;
    }

    function cacheRequest(path) {
        return new Request(new URL(path, location.origin).href);
    }

    function withBust(url) {
        const u = new URL(url, BASE_URL);
        u.searchParams.set('__vp', String(Date.now()));
        return u.href;
    }

    function formatSize(bytes) {
        if (!bytes || bytes <= 0) return '';
        if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    }

    function formatDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (isNaN(d.getTime())) return '';
        const pad = function (n) { return n < 10 ? '0' + n : String(n); };
        return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
    }

    function toast(message) {
        if (typeof window.showToast === 'function') {
            window.showToast(message);
        }
    }

    async function existingCacheNames(targetState) {
        const current = targetState || state;
        if (!current || !current.caches || !current.caches.length) return [];
        const names = await caches.keys();
        const existing = {};
        names.forEach(function (name) { existing[name] = true; });
        return current.caches.filter(function (name) { return existing[name]; });
    }

    async function matchAnyIn(names, path) {
        const req = cacheRequest(path);
        for (let i = 0; i < names.length; i++) {
            try {
                // 用 cacheName 查詢，不會像 caches.open 一樣在 cache 已被刪除時重建空 cache
                const hit = await caches.match(req, { cacheName: names[i] });
                if (hit) return hit;
            } catch (e) {
                // 某個 cache 被清掉時繼續找下一個
            }
        }
        return null;
    }

    async function matchAny(path) {
        return matchAnyIn(await existingCacheNames(), path);
    }

    /* 併發池：所有 worker 錯誤都會回傳，呼叫端必須檢查，避免靜默成功 */
    function runPool(items, limit, worker, onTick) {
        return new Promise(function (resolve) {
            const errors = [];
            if (!items.length) return resolve(errors);
            let index = 0;
            let active = 0;
            let finished = 0;
            let stopped = false;

            function next() {
                while (!stopped && active < limit && index < items.length) {
                    const item = items[index++];
                    active++;
                    Promise.resolve()
                        .then(function () { return worker(item); })
                        .catch(function (error) {
                            errors.push({ item: item, error: error });
                            // 超時/配額不足時停止再排隊，避免遮罩長時間鎖住或持續失敗
                            if (error && (error.name === 'TimeoutError'
                                || error.name === 'IntegrityError'
                                || isQuotaError(error))) {
                                stopped = true;
                            }
                        })
                        .then(function () {
                            active--;
                            finished++;
                            if (onTick) onTick(item, finished, items.length);
                            if (finished === items.length) resolve(errors);
                            else if (!stopped) next();
                            else if (active === 0) resolve(errors);
                        });
                }
            }
            next();
        });
    }

    async function cachedPathSet(targetState) {
        const names = await existingCacheNames(targetState);
        const paths = {};
        for (let i = 0; i < names.length; i++) {
            try {
                if (!(await caches.has(names[i]))) continue;
                const cache = await caches.open(names[i]);
                const requests = await cache.keys();
                requests.forEach(function (request) {
                    paths[new URL(request.url).pathname] = true;
                });
            } catch (e) {
                // 忽略被清掉的 cache
            }
        }
        return paths;
    }

    async function checkComplete(targetState) {
        const current = targetState || state;
        if (!current || !current.caches || !current.caches.length) return false;
        if (typeof current.manifestVersion !== 'string' || !current.manifestVersion) return false;
        const keys = Object.keys(current.files || {});
        if (!keys.length) return false;
        const names = await existingCacheNames(current);
        // 最新一代 cache 被單獨清掉時，即使舊 cache 仍有全部 key，也視為不完整，
        // 避免服務端已更新、本機卻一直從舊 cache 讀到舊版。
        if (!names.length || names[0] !== current.caches[0]) return false;
        if (!(await caches.has(names[0]))) return false;
        const newest = await caches.open(names[0]);
        if (!(await newest.keys()).length) return false;
        const paths = await cachedPathSet(current);
        for (let i = 0; i < keys.length; i++) {
            if (!paths[cacheKeyFor(keys[i])]) return false;
        }
        return true;
    }

    async function deleteCachesExcept(keep) {
        const names = await caches.keys();
        await Promise.all(names.map(function (name) {
            if (name.indexOf(CACHE_PREFIX) === 0 && keep.indexOf(name) === -1) {
                return caches.delete(name);
            }
            return Promise.resolve();
        }));
    }

    async function cleanupOrphanStaging(latest) {
        if (!latest || !latest.complete || !latest.staging) return false;
        await caches.delete(latest.staging).catch(function () {});
        latest.staging = null;
        latest.stagingVersion = null;
        await saveState(latest);
        return true;
    }

    async function cleanupCaches() {
        if (!locksSupported) return null;
        try {
            return await withOfflineLock(async function () {
                let latest;
                try {
                    latest = await loadLatestState();
                } catch (e) {
                    // 讀不到 state 時不刪任何 cache
                    return null;
                }
                await cleanupOrphanStaging(latest);
                const keep = (latest.caches || []).slice();
                if (latest.staging) keep.push(latest.staging);
                await deleteCachesExcept(keep);
                return latest;
            });
        } catch (e) {
            return null;
        }
    }

    function knownCacheBytes() {
        let needed = 0;
        const files = state && state.files ? state.files : {};
        Object.keys(files).forEach(function (key) {
            const size = Number(files[key] && files[key].size);
            if (size > 0) needed += size;
        });
        return needed;
    }

    async function hasSpaceForCompact(needed) {
        if (needed <= 0) return true;
        if (!navigator.storage || typeof navigator.storage.estimate !== 'function') return true;
        try {
            const estimate = await navigator.storage.estimate();
            if (!estimate || typeof estimate.quota !== 'number' || typeof estimate.usage !== 'number') {
                return true;
            }
            const free = estimate.quota - estimate.usage;
            return free > (needed * COMPACT_HEADROOM) + COMPACT_MIN_FREE;
        } catch (e) {
            // 拿不到估計值時仍可嘗試；複製失敗會回滾
            return true;
        }
    }

    async function nextCacheName(label) {
        let name = CACHE_PREFIX + label + '-' + Date.now();
        let suffix = 0;
        while (await caches.has(name)) {
            suffix++;
            name = CACHE_PREFIX + label + '-' + Date.now() + '-' + suffix;
        }
        return name;
    }

    async function maybeCompactCaches() {
        if (!locksSupported || compacting || busy || applying || swFailure) return;
        compacting = true;
        let compactName = null;
        try {
            await withOfflineLock(async function () {
                let latest;
                try {
                    latest = await loadLatestState();
                } catch (e) {
                    return;
                }
                state = latest;
                if (!latest.complete || latest.staging) return;
                if (!latest.caches || latest.caches.length <= COMPACT_THRESHOLD) return;
                const keys = Object.keys(latest.files || {});
                if (!keys.length) return;

                const snapshotCaches = latest.caches.slice();
                const snapshotRevision = latest.revision;
                const names = await existingCacheNames(latest);
                if (!names.length) return;

                const needed = knownCacheBytes();
                if (needed > 0 && !(await hasSpaceForCompact(needed))) return;

                compactName = await nextCacheName('compact');
                const compact = await caches.open(compactName);
                for (let i = 0; i < keys.length; i++) {
                    const key = cacheKeyFor(keys[i]);
                    const hit = await matchAnyIn(names, key);
                    if (!hit) throw new Error('compact source missing');
                    await compact.put(cacheRequest(key), hit.clone());
                }
                const copied = await compact.keys();
                if (copied.length !== keys.length) throw new Error('compact incomplete');

                const current = await loadLatestState();
                if (current.revision !== snapshotRevision
                    || current.caches.join('|') !== snapshotCaches.join('|')) {
                    throw new Error('compact aborted: state changed');
                }

                const next = Object.assign({}, current, {
                    caches: [compactName],
                    staging: null,
                    stagingVersion: null,
                    complete: true,
                    revision: current.revision + 1
                });
                await saveState(next);
                state = next;
                notifyStateChanged();
                await Promise.all(snapshotCaches.map(function (name) {
                    return caches.delete(name).catch(function () {});
                }));
            });
        } catch (e) {
            if (compactName) {
                await caches.delete(compactName).catch(function () {});
            }
        } finally {
            compacting = false;
        }
    }

    function offlineTitleEl() { return document.getElementById('offlineTitle'); }
    function offlineStatusEl() { return document.getElementById('offlineStatus'); }
    function offlineButtonEl() { return document.getElementById('offlineActionBtn'); }

    async function refreshUI() {
        const title = offlineTitleEl();
        const status = offlineStatusEl();
        const btn = offlineButtonEl();
        if (!title || !status || !btn) return;
        if (!locksSupported) {
            showLocksUnsupported();
            return;
        }
        if (!initialized && !busy) return;

        title.textContent = tr('title');
        if (busy) {
            status.textContent = tr('working');
            btn.textContent = tr('working');
            btn.disabled = true;
            return;
        }

        if (swFailure) {
            showOfflineUnavailable(swFailure);
            return;
        }
        if (stateLoadFailed) {
            showOfflineUnavailable(tr('stateError'));
            return;
        }

        const wasComplete = !!(state && state.complete);
        const complete = await checkComplete();
        if (state) state.complete = complete;

        if (!complete) {
            let hasStaging = false;
            if (state && state.staging) {
                try { hasStaging = await caches.has(state.staging); } catch (e) { hasStaging = false; }
            }
            const hadCache = wasComplete
                || !!(state && (state.updatedAt || Object.keys(state.files || {}).length));
            status.textContent = (hadCache || hasStaging) ? tr('incomplete') : tr('notDownloaded');
            btn.textContent = hasStaging ? tr('continue') : tr('downloadAll');
            btn.dataset.action = hasStaging ? 'resume' : 'download';
            btn.disabled = false;
            if (focusReturnPending && !overlayOpen && !busy) {
                focusReturnPending = false;
                btn.focus({ preventScroll: true });
            }
            return;
        }

        const count = state.imageCount || Object.keys(state.files || {}).length;
        status.textContent = tr('cachedStatus', {
            n: count,
            date: formatDate(state.updatedAt)
        });
        btn.textContent = tr('checkUpdate');
        btn.dataset.action = 'check';
        btn.disabled = false;
        if (focusReturnPending && !overlayOpen && !busy) {
            focusReturnPending = false;
            btn.focus({ preventScroll: true });
        }
    }

    /* ---------- 全螢幕進度層 ---------- */

    function ensureOverlay() {
        if (document.getElementById('vpOfflineOverlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'vpOfflineOverlay';
        overlay.className = 'vp-offline-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'vpOfflineTitle');
        overlay.setAttribute('aria-describedby', 'vpOfflineMsg');
        overlay.innerHTML =
            '<div class="vp-offline-modal" id="vpOfflineModal" tabindex="-1">' +
            '  <h2 id="vpOfflineTitle"></h2>' +
            '  <p id="vpOfflineMsg"></p>' +
            '  <div class="vp-offline-progress" id="vpOfflineProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
            '    <div class="vp-offline-progress-bar" id="vpOfflineBar"></div>' +
            '  </div>' +
            '  <p class="vp-offline-count" id="vpOfflineCount" aria-live="polite"></p>' +
            '  <div class="vp-offline-actions" id="vpOfflineActions"></div>' +
            '</div>';
        document.body.appendChild(overlay);
    }

    function blockKeys(event) {
        if (!busy) return;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'].indexOf(event.key) !== -1) {
            event.preventDefault();
            // 阻擋 script.js 在 document 上的翻頁/切歌監聽
            event.stopImmediatePropagation();
        }
    }

    function preventGesture(event) {
        if (!busy) return;
        if (event.cancelable) event.preventDefault();
    }

    function setPageInert(value) {
        if (!('inert' in HTMLElement.prototype)) return;
        if (value) {
            Array.prototype.forEach.call(document.body.children, function (element) {
                if (element.id === 'vpOfflineOverlay') return;
                if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return;
                if (!element.inert) {
                    element.inert = true;
                    inertedElements.push(element);
                }
            });
        } else {
            inertedElements.forEach(function (element) { element.inert = false; });
            inertedElements = [];
        }
    }

    function syncPageInert() {
        setPageInert(busy || overlayOpen);
    }

    function setBusy(value) {
        busy = !!value;
        document.body.classList.toggle('vp-offline-busy', busy);
        const overlay = document.getElementById('vpOfflineOverlay');
        if (overlay) overlay.classList.toggle('active', busy);
        syncPageInert();

        if (busy) {
            if (!unloadHandler) {
                unloadHandler = function (event) {
                    event.preventDefault();
                    event.returnValue = '';
                    return '';
                };
                window.addEventListener('beforeunload', unloadHandler);
            }
            if (!keydownHandler) {
                keydownHandler = blockKeys;
                document.addEventListener('keydown', keydownHandler, true);
            }
            if (!wheelHandler) {
                wheelHandler = preventGesture;
                window.addEventListener('wheel', wheelHandler, { passive: false });
            }
            if (!touchHandler) {
                touchHandler = preventGesture;
                window.addEventListener('touchmove', touchHandler, { passive: false });
            }
        } else {
            if (unloadHandler) {
                window.removeEventListener('beforeunload', unloadHandler);
                unloadHandler = null;
            }
            if (keydownHandler) {
                document.removeEventListener('keydown', keydownHandler, true);
                keydownHandler = null;
            }
            if (wheelHandler) {
                window.removeEventListener('wheel', wheelHandler, { passive: false });
                wheelHandler = null;
            }
            if (touchHandler) {
                window.removeEventListener('touchmove', touchHandler, { passive: false });
                touchHandler = null;
            }
        }
    }

    function overlayFocusables(overlay) {
        return Array.prototype.filter.call(
            overlay.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
            function (element) { return element.offsetParent !== null; }
        );
    }

    function handleOverlayKeydown(event) {
        if (!overlayOpen) return;
        const overlay = document.getElementById('vpOfflineOverlay');
        if (!overlay) return;
        if (event.key === 'Escape' && overlayInteractive) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const action = overlayEscape;
            if (action) action();
            return;
        }
        if (event.key === 'Tab' && overlayInteractive) {
            const focusables = overlayFocusables(overlay);
            const modal = document.getElementById('vpOfflineModal');
            if (!focusables.length) {
                event.preventDefault();
                if (modal) modal.focus();
                return;
            }
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;
            if (event.shiftKey) {
                if (active === first || !overlay.contains(active)) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (active === last || !overlay.contains(active)) {
                event.preventDefault();
                first.focus();
            }
        }
    }

    function showOverlay(title, message, options) {
        ensureOverlay();
        options = options || {};
        const overlay = document.getElementById('vpOfflineOverlay');
        if (!overlayOpen) lastFocusedElement = document.activeElement;
        overlayOpen = true;
        overlayInteractive = !!(options.actions && options.actions.length);
        overlayEscape = options.onCancel || hideOverlay;
        if (!overlayKeydown) {
            overlayKeydown = handleOverlayKeydown;
            document.addEventListener('keydown', overlayKeydown, true);
        }
        syncPageInert();
        document.getElementById('vpOfflineTitle').textContent = title;
        document.getElementById('vpOfflineMsg').textContent = message || '';
        const bar = document.getElementById('vpOfflineBar');
        bar.style.width = '0%';
        const progress = document.getElementById('vpOfflineProgress');
        if (progress) {
            progress.style.display = options.progress ? '' : 'none';
            progress.setAttribute('aria-valuenow', '0');
        }
        document.getElementById('vpOfflineCount').textContent = '';
        const actions = document.getElementById('vpOfflineActions');
        actions.innerHTML = '';
        (options.actions || []).forEach(function (item) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = item.label;
            button.className = item.primary ? 'vp-offline-btn primary' : 'vp-offline-btn';
            button.addEventListener('click', function (event) {
                event.preventDefault();
                item.onClick();
            });
            actions.appendChild(button);
        });
        overlay.style.display = 'flex';
        overlay.classList.toggle('active', busy);

        const modal = document.getElementById('vpOfflineModal');
        const primary = actions.querySelector('.vp-offline-btn.primary')
            || actions.querySelector('.vp-offline-btn');
        if (overlayInteractive && primary) {
            primary.focus({ preventScroll: true });
        } else if (modal) {
            modal.focus({ preventScroll: true });
        }
    }

    function hideOverlay() {
        const overlay = document.getElementById('vpOfflineOverlay');
        if (overlay) overlay.style.display = 'none';
        overlayOpen = false;
        overlayInteractive = false;
        if (overlayKeydown) {
            document.removeEventListener('keydown', overlayKeydown, true);
            overlayKeydown = null;
        }
        overlayEscape = null;
        syncPageInert();
        const preferred = lastFocusedElement;
        lastFocusedElement = null;
        focusReturnPending = true;
        let attempts = 0;
        function restoreFocus() {
            if (overlayOpen || busy) return;
            const button = offlineButtonEl();
            if (button && !button.disabled) {
                focusReturnPending = false;
                button.focus({ preventScroll: true });
                return;
            }
            if (!button && preferred && preferred !== document.body && preferred !== document.documentElement
                && typeof preferred.focus === 'function') {
                focusReturnPending = false;
                preferred.focus({ preventScroll: true });
                return;
            }
            // check/cancel 路徑會在 hide 後才由 refreshUI 重新啟用按鈕
            if (attempts++ < 20) {
                setTimeout(restoreFocus, 50);
            }
        }
        restoreFocus();
    }

    function updateProgress(done, total, bytes) {
        const bar = document.getElementById('vpOfflineBar');
        const count = document.getElementById('vpOfflineCount');
        const progress = document.getElementById('vpOfflineProgress');
        const percent = total ? Math.min(100, (done / total) * 100) : 0;
        if (bar) bar.style.width = percent + '%';
        if (progress) progress.setAttribute('aria-valuenow', String(Math.round(percent)));
        if (count) {
            const size = formatSize(bytes);
            count.textContent = size
                ? tr('progressBytes', { done: done, total: total, size: size })
                : tr('progress', { done: done, total: total });
        }
    }

    function errorMessage(error) {
        if (error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
            return tr('storageError');
        }
        return (error && error.message) ? error.message : String(error);
    }

    function showError(error) {
        setBusy(false);
        showOverlay(tr('errorTitle'), tr('errorMsg', { msg: errorMessage(error) }), {
            actions: [
                {
                    label: tr('retry'),
                    primary: true,
                    onClick: function () {
                        hideOverlay();
                        if (lastAction === 'update') checkForUpdates();
                        else startDownload();
                    }
                },
                { label: tr('close'), onClick: hideOverlay }
            ]
        });
    }

    function showDone(isUpdate) {
        setBusy(false);
        showOverlay(
            isUpdate ? tr('updateDoneTitle') : tr('doneTitle'),
            tr('doneMsg'),
            {
                actions: [
                    { label: tr('refresh'), primary: true, onClick: function () { location.reload(); } },
                    { label: tr('later'), onClick: hideOverlay }
                ]
            }
        );
    }

    /* ---------- 首次全量下載 ---------- */

    async function startDownload() {
        if (busy || checking) return;
        if (!locksSupported) {
            showError(new Error(tr('locksUnsupported')));
            return;
        }
        lastAction = 'download';
        if (!navigator.onLine) {
            showError(new Error(tr('offlineError')));
            return;
        }

        setBusy(true);
        showOverlay(tr('downloadTitle'), tr('downloadMsg'), { progress: true });

        try {
            await ensureServiceWorker();
        } catch (error) {
            showError(error);
            refreshUI();
            return;
        }

        let result = 'done';
        try {
            result = await withOfflineLock(async function () {
                let latest;
                try {
                    latest = await loadLatestState();
                } catch (e) {
                    stateLoadFailed = true;
                    throw new Error(tr('stateError'));
                }
                state = latest;
                stateLoadFailed = false;
                if (latest.manifestVersion) setImageVersion(latest.manifestVersion);
                if (latest.complete && latest.staging) {
                    await cleanupOrphanStaging(latest);
                }

                const alreadyComplete = await checkComplete(latest);
                latest.complete = alreadyComplete;
                if (alreadyComplete) return 'complete';

                const manifest = await fetchManifest();
                const entries = manifestEntries(manifest);
                let stagingName = null;

                try {
                    let canResume = !!(latest.staging
                        && latest.stagingVersion === manifest.version);
                    if (canResume) {
                        try { canResume = await caches.has(latest.staging); } catch (e) { canResume = false; }
                    }
                    if (!canResume && latest.staging) {
                        await caches.delete(latest.staging).catch(function () {});
                    }
                    stagingName = canResume ? latest.staging : await nextCacheName('stage');
                    const cache = await caches.open(stagingName);

                    latest.staging = stagingName;
                    latest.stagingVersion = manifest.version;
                    latest.complete = false;
                    latest.schema = STATE_SCHEMA;
                    await saveState(latest);
                    state = latest;
                    notifyStateChanged();

                    const pending = [];
                    let done = 0;
                    for (let i = 0; i < entries.length; i++) {
                        if (await cache.match(cacheRequest(entries[i].key))) {
                            done++;
                        } else {
                            pending.push(entries[i]);
                        }
                    }

                    const needed = pending.reduce(function (sum, item) {
                        return sum + Number(item.size || 0);
                    }, 0);
                    if (needed > 0) await preflightStorage(needed);

                    let bytes = 0;
                    updateProgress(done, entries.length, 0);
                    const errors = await runPool(pending, 5, async function (file) {
                        const res = await fetchWithTimeout(withBust(file.url), {
                            cache: 'no-store',
                            headers: { [BYPASS_HEADER]: '1' }
                        }, GET_TIMEOUT);
                        if (!res.ok) throw new Error(tr('requestFailed', { status: res.status }));
                        await verifyDownloaded(res, file);
                        await cache.put(cacheRequest(file.key), res);
                        bytes += file.size;
                        done++;
                        updateProgress(done, entries.length, bytes);
                    });
                    if (errors.length) {
                        throwPoolError(errors, 'downloadTimeout', 'downloadFailed');
                    }

                    await ensureServiceWorker();

                    // 提交前重抓 manifest：若期間清單已變，丟棄 staging，不留下半套完成狀態
                    const latestManifest = await fetchManifest();
                    if (latestManifest.version !== manifest.version) {
                        await caches.delete(stagingName).catch(function () {});
                        stagingName = null;
                        latest.staging = null;
                        latest.stagingVersion = null;
                        latest.complete = false;
                        await saveState(latest);
                        state = latest;
                        notifyStateChanged();
                        throw new Error(tr('manifestChanged'));
                    }

                    const missing = await missingManifestFiles([stagingName], latestManifest);
                    if (missing.length) {
                        throw new Error(tr('incompleteManifest', { n: missing.length }));
                    }

                    latest.files = filesFromManifest(latestManifest);
                    latest.manifestVersion = latestManifest.version;
                    latest.caches = [stagingName];
                    latest.complete = true;
                    latest.updatedAt = new Date().toISOString();
                    latest.imageCount = imageCountOf(latestManifest);
                    latest.staging = null;
                    latest.stagingVersion = null;
                    latest.schema = STATE_SCHEMA;
                    latest.revision = Number(latest.revision || 0) + 1;
                    await saveState(latest);
                    state = latest;
                    setImageVersion(latest.manifestVersion);
                    notifyStateChanged();
                    await deleteCachesExcept([stagingName]).catch(function () {});
                    return 'done';
                } catch (error) {
                    if (stagingName) {
                        let current;
                        try {
                            current = await loadLatestState();
                        } catch (e) {
                            current = latest;
                        }
                        current.staging = stagingName;
                        current.stagingVersion = manifest.version;
                        current.complete = false;
                        current.schema = STATE_SCHEMA;
                        await saveState(current).catch(function () {});
                        state = current;
                        notifyStateChanged();
                    }
                    throw error;
                }
            });
        } catch (error) {
            showError(error);
            refreshUI();
            return;
        }

        if (result === 'complete') {
            setBusy(false);
            hideOverlay();
            await refreshUI();
            checkForUpdates();
            return;
        }

        requestPersistentStorage();
        showDone(false);
        refreshUI();
        maybeCompactCaches();
    }


    /* ---------- 手動檢查更新 ---------- */

    function cancelUpdateCheck() {
        setBusy(false);
        hideOverlay();
        refreshUI();
    }

    async function commitManifestState(latest, manifest, cacheNames) {
        const next = Object.assign({}, latest, {
            files: filesFromManifest(manifest),
            manifestVersion: manifest.version,
            caches: cacheNames,
            complete: true,
            updatedAt: new Date().toISOString(),
            imageCount: imageCountOf(manifest),
            staging: null,
            stagingVersion: null,
            schema: STATE_SCHEMA,
            revision: Number(latest.revision || 0) + 1
        });
        await saveState(next);
        state = next;
        setImageVersion(next.manifestVersion);
        notifyStateChanged();
        return next;
    }

    async function checkForUpdates() {
        if (busy || checking) return;
        if (!locksSupported) {
            showError(new Error(tr('locksUnsupported')));
            return;
        }
        checking = true;
        lastAction = 'update';
        const btn = offlineButtonEl();
        if (btn) btn.disabled = true;

        try {
            if (!navigator.onLine) {
                showError(new Error(tr('offlineError')));
                return;
            }
            await ensureServiceWorker();

            let latest;
            try {
                latest = await withOfflineLock(async function () {
                    const current = await loadLatestState();
                    if (current.complete && current.staging) {
                        await cleanupOrphanStaging(current);
                    }
                    state = current;
                    return current;
                });
            } catch (e) {
                stateLoadFailed = true;
                showError(new Error(tr('stateError')));
                return;
            }
            stateLoadFailed = false;
            state = latest;
            if (latest.manifestVersion) setImageVersion(latest.manifestVersion);

            if (!(await checkComplete(latest))) {
                refreshUI();
                return;
            }

            setBusy(true);
            showOverlay(tr('checkTitle'), tr('checkMsg'), { progress: true });

            const manifest = await fetchManifest();
            const diff = diffManifest(latest.files, manifest);
            if (!diff.changed.length && !diff.removed.length) {
                setBusy(false);
                hideOverlay();
                toast(tr('upToDate'));
                refreshUI();
                return;
            }

            const totalSize = diff.changed.reduce(function (sum, item) {
                return sum + Number(item.size || 0);
            }, 0);
            const count = diff.changed.length + diff.removed.length;
            const sizeText = formatSize(totalSize);
            showOverlay(
                tr('confirmTitle'),
                sizeText
                    ? tr('confirmMsg', { n: count, size: sizeText })
                    : tr('confirmNoSize', { n: count }),
                {
                    onCancel: cancelUpdateCheck,
                    actions: [
                        { label: tr('cancel'), onClick: cancelUpdateCheck },
                        {
                            label: tr('updateNow'),
                            primary: true,
                            onClick: function () { applyUpdate(manifest, latest.revision); }
                        }
                    ]
                }
            );
        } catch (error) {
            showError(error);
            refreshUI();
        } finally {
            checking = false;
            if (!busy) refreshUI();
        }
    }

    async function applyUpdate(confirmedManifest, checkedRevision) {
        if (applying) return;
        applying = true;
        let success = false;
        setBusy(true);
        showOverlay(tr('updateTitle'), tr('updateMsg'), { progress: true });

        try {
            await ensureServiceWorker();
            const result = await withOfflineLock(async function () {
                let latest;
                try {
                    latest = await loadLatestState();
                } catch (e) {
                    stateLoadFailed = true;
                    throw new Error(tr('stateError'));
                }
                state = latest;
                stateLoadFailed = false;
                if (latest.manifestVersion) setImageVersion(latest.manifestVersion);
                if (latest.complete && latest.staging) {
                    await cleanupOrphanStaging(latest);
                }

                if (Number(latest.revision || 0) !== Number(checkedRevision || 0)) {
                    throw new Error(tr('otherTabUpdated'));
                }

                const manifest = await fetchManifest();
                if (manifest.version !== confirmedManifest.version) {
                    throw new Error(tr('manifestChanged'));
                }
                const diff = diffManifest(latest.files, manifest);
                if (!diff.changed.length && !diff.removed.length) return 'upToDate';

                const needed = diff.changed.reduce(function (sum, item) {
                    return sum + Number(item.size || 0);
                }, 0);
                if (needed > 0) await preflightStorage(needed);

                if (!diff.changed.length) {
                    // 只有刪除檔案的更新：不需要新 cache，但提交前仍要確認清單沒再變
                    const freshState = await loadLatestState();
                    if (Number(freshState.revision || 0) !== Number(latest.revision || 0)) {
                        throw new Error(tr('otherTabUpdated'));
                    }
                    const latestManifest = await fetchManifest();
                    if (latestManifest.version !== manifest.version) {
                        throw new Error(tr('manifestChanged'));
                    }
                    const missing = await missingManifestFiles(latest.caches, manifest);
                    if (missing.length) {
                        throw new Error(tr('incompleteManifest', { n: missing.length }));
                    }
                    await commitManifestState(latest, manifest, latest.caches);
                    success = true;
                    return 'done';
                }

                const stagingName = await nextCacheName('stage');
                const cache = await caches.open(stagingName);
                latest.staging = stagingName;
                latest.stagingVersion = manifest.version;
                await saveState(latest);
                state = latest;
                notifyStateChanged();

                try {
                    let done = 0;
                    let bytes = 0;
                    updateProgress(done, diff.changed.length, bytes);
                    const errors = await runPool(diff.changed, 4, async function (file) {
                        const res = await fetchWithTimeout(withBust(file.url), {
                            cache: 'no-store',
                            headers: { [BYPASS_HEADER]: '1' }
                        }, GET_TIMEOUT);
                        if (!res.ok) throw new Error(tr('requestFailed', { status: res.status }));
                        await verifyDownloaded(res, file);
                        await cache.put(cacheRequest(file.key), res);
                        bytes += file.size;
                        done++;
                        updateProgress(done, diff.changed.length, bytes);
                    });
                    if (errors.length) {
                        throwPoolError(errors, 'updateTimeout', 'updateFailed');
                    }

                    await ensureServiceWorker();

                    const fresh = await loadLatestState();
                    if (Number(fresh.revision || 0) !== Number(latest.revision || 0)) {
                        throw new Error(tr('otherTabUpdated'));
                    }
                    const latestManifest = await fetchManifest();
                    if (latestManifest.version !== manifest.version) {
                        throw new Error(tr('manifestChanged'));
                    }
                    const cacheNames = [stagingName].concat(latest.caches || []);
                    const missing = await missingManifestFiles(cacheNames, manifest);
                    if (missing.length) {
                        throw new Error(tr('incompleteManifest', { n: missing.length }));
                    }
                    await commitManifestState(latest, manifest, cacheNames);
                    success = true;
                    return 'done';
                } catch (error) {
                    await caches.delete(stagingName).catch(function () {});
                    let current;
                    try {
                        current = await loadLatestState();
                    } catch (e) {
                        current = latest;
                    }
                    current.staging = null;
                    current.stagingVersion = null;
                    await saveState(current).catch(function () {});
                    state = current;
                    notifyStateChanged();
                    throw error;
                }
            });

            if (result === 'upToDate') {
                setBusy(false);
                hideOverlay();
                toast(tr('upToDate'));
                refreshUI();
                return;
            }
            requestPersistentStorage();
            showDone(true);
            refreshUI();
        } catch (error) {
            showError(error);
            refreshUI();
        } finally {
            applying = false;
            if (success) maybeCompactCaches();
        }
    }

    function bindUI() {
        const btn = offlineButtonEl();
        if (btn) {
            btn.addEventListener('click', function () {
                if (busy || checking) return;
                const action = btn.dataset.action;
                if (action === 'check') checkForUpdates();
                else startDownload();
            });
        }
        document.addEventListener('languagechange', function () { refreshUI(); });
    }

    async function reloadFromBroadcast() {
        if (!locksSupported || busy || applying || compacting || checking) return;
        try {
            await withOfflineLock(async function () {
                const latest = await loadLatestState();
                if (latest.complete && latest.staging) {
                    await cleanupOrphanStaging(latest);
                }
                state = latest;
                stateLoadFailed = false;
                if (latest.manifestVersion) setImageVersion(latest.manifestVersion);
            });
            await refreshUI();
        } catch (e) {
            // 讀取失敗時保留目前畫面
        }
    }

    async function init() {
        if (!document.getElementById('offlineSection')) return;
        if (!('caches' in window) || !('indexedDB' in window)) {
            const section = document.getElementById('offlineSection');
            if (section) section.style.display = 'none';
            return;
        }
        const initialBtn = offlineButtonEl();
        const initialStatus = offlineStatusEl();
        if (initialBtn) {
            initialBtn.textContent = tr('reading');
            initialBtn.disabled = true;
        }
        if (initialStatus) initialStatus.textContent = tr('reading');

        ensureOverlay();
        bindUI();

        if (!locksSupported) {
            try {
                await ensureServiceWorker();
            } catch (e) {
                // 既有 cache 仍可能由已註冊的 SW 提供；這裡只負責顯示能力不足
            }
            initialized = true;
            showLocksUnsupported();
            return;
        }

        try {
            state = await loadLatestState();
        } catch (e) {
            stateLoadFailed = true;
            initialized = true;
            showOfflineUnavailable(tr('stateError'));
            return;
        }
        if (!state) state = defaultState();
        if (state.manifestVersion) setImageVersion(state.manifestVersion);

        if (broadcastChannel) {
            broadcastChannel.addEventListener('message', function (event) {
                if (event.data && event.data.type === 'state-changed') {
                    reloadFromBroadcast();
                }
            });
        }

        const latest = await cleanupCaches();
        if (latest) state = latest;

        try {
            await ensureServiceWorker();
        } catch (error) {
            initialized = true;
            showOfflineUnavailable(error.message);
            return;
        }

        initialized = true;
        await refreshUI();
        maybeCompactCaches();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
