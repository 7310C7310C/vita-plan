/* ============================================
   管理后台核心逻辑 - 复活计划乐队
   ============================================ */

// ==================== 常量配置 ====================
const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = '7310c7310c';
const REPO_NAME = 'vita-plan';
const BRANCH = 'main';

const ALLOWED_IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
const MAX_IMG_SIZE_KB = 300;
const TARGET_IMG_SIZE_KB = 290;
const ILLEGAL_CHARS = /[\\\/:*?"<>|]/;
const IS_LOCALHOST = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('192.168.');

// ==================== Offline manifest helpers ====================
// Keep this block self-contained: scripts/generate_offline_manifest.py mirrors it.
const OFFLINE_MANIFEST_PATH = 'data/offline-manifest.json';
const OFFLINE_SHELL_FILES = [
    'index.html', 'assets/css/style.css', 'assets/js/script.js', 'assets/js/offline.js',
    'data/songs.json', 'favicon.ico'
];

function isOfflineManifestPath(path) {
    if (typeof path !== 'string' || !path) return false;
    if (path.charAt(0) === '/' || path.indexOf('\\') !== -1) return false;
    if (path.split('/').indexOf('..') !== -1) return false;
    if (OFFLINE_SHELL_FILES.indexOf(path) !== -1) return true;
    return path.indexOf('img/') === 0 && path.length > 4;
}

function offlineImagePath(op) {
    if (!op) return '';
    if (op.type === 'delete' && op.oldPath) {
        return String(op.oldPath).replace(/^\/+/, '');
    }
    let filename = String(op.filename || '').replace(/^\/+/, '');
    if (!filename) return '';
    if (filename.indexOf('img/') === 0) return filename;
    if (filename.indexOf('/') !== -1) {
        filename = filename.split('/').pop();
    }
    const category = filename.split('_')[0];
    return 'img/' + category + '/' + filename;
}

async function buildTreeItemsForOps(ops, createBlobFn) {
    const items = [];
    for (const op of (ops || [])) {
        if (!op) continue;
        const path = offlineImagePath(op);
        if (!path) continue;
        if (op.type === 'delete') {
            // Git Data API: sha:null in a tree removes the path.
            items.push({ path, mode: '100644', type: 'blob', sha: null });
        } else if (op.type === 'add') {
            if (op.data) {
                const sha = await createBlobFn(op.data, 'base64');
                items.push({ path, mode: '100644', type: 'blob', sha });
            } else if (op.sha) {
                items.push({ path, mode: '100644', type: 'blob', sha: op.sha });
            }
        }
    }
    return items;
}

function offlineManifestPathCompare(a, b) {
    const enc = new TextEncoder();
    const aa = enc.encode(a);
    const bb = enc.encode(b);
    const len = Math.min(aa.length, bb.length);
    for (let i = 0; i < len; i++) {
        if (aa[i] !== bb[i]) return aa[i] - bb[i];
    }
    return aa.length - bb.length;
}

function offlineManifestVersion(files) {
    const paths = Object.keys(files).sort(offlineManifestPathCompare);
    let canonical = '';
    for (const path of paths) {
        canonical += path + '\t' + files[path].hash + '\t' + files[path].size + '\n';
    }
    if (!crypto || !crypto.subtle) {
        throw new Error('浏览器不支持 SHA-256，无法生成离线清单');
    }
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)).then((digest) => {
        return Array.prototype.map.call(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
            .join('').slice(0, 16);
    });
}

async function buildOfflineManifest(tree) {
    const files = {};
    (tree || []).forEach((entry) => {
        if (!entry || entry.type !== 'blob' || !isOfflineManifestPath(entry.path)) return;
        files[entry.path] = {
            hash: String(entry.sha || '').toLowerCase(),
            size: Number(entry.size) || 0
        };
    });
    const missing = OFFLINE_SHELL_FILES.filter((name) => !files[name]);
    if (missing.length) {
        throw new Error('离线清单缺少必要文件: ' + missing.join(', '));
    }
    const ordered = {};
    Object.keys(files).sort(offlineManifestPathCompare).forEach((path) => {
        ordered[path] = files[path];
    });
    const version = await offlineManifestVersion(ordered);
    return { version, files: ordered };
}
// ==================== End offline manifest helpers ====================

// UTF-8 安全解码 base64
function decodeBase64UTF8(base64) {
    const binary = atob(base64.replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
}

const DB_NAME = 'admin_db';
const DB_VERSION = 1;
const STORE_IMAGES = 'pending_images';
const STORE_STATE = 'app_state';

// ==================== 工具函数 ====================
function $(id) { return document.getElementById(id); }
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
function sanitize(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return map[m];
    });
}
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function nowTimestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function showToast(msg, type) {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast-message' + (type ? ' ' + type : '');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
}
function showModal(html) {
    $('modalOverlay').style.display = 'flex';
    $('modalBox').innerHTML = html;
}
function hideModal() {
    $('modalOverlay').style.display = 'none';
    $('modalBox').innerHTML = '';
}
function switchSubView(name) {
    document.querySelectorAll('.subview').forEach(v => v.classList.remove('active'));
    const target = $(name + 'View');
    if (target) target.classList.add('active');
}
function showMainView() {
    $('loginView').classList.remove('active');
    $('mainView').classList.add('active');
}

// ==================== IndexedDB 管理 ====================
const idb = {
    db: null,
    open() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_IMAGES)) {
                    db.createObjectStore(STORE_IMAGES, { keyPath: 'filename' });
                }
                if (!db.objectStoreNames.contains(STORE_STATE)) {
                    db.createObjectStore(STORE_STATE, { keyPath: 'key' });
                }
            };
            req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            req.onerror = () => reject(req.error);
        });
    },
    async putImage(filename, base64Data) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_IMAGES, 'readwrite');
            tx.objectStore(STORE_IMAGES).put({ filename, data: base64Data, timestamp: Date.now() });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    },
    async getImage(filename) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_IMAGES, 'readonly');
            const req = tx.objectStore(STORE_IMAGES).get(filename);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
    async getAllImages() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_IMAGES, 'readonly');
            const req = tx.objectStore(STORE_IMAGES).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    },
    async deleteImage(filename) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_IMAGES, 'readwrite');
            tx.objectStore(STORE_IMAGES).delete(filename);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    },
    async clearImages() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_IMAGES, 'readwrite');
            tx.objectStore(STORE_IMAGES).clear();
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    },
    async putState(key, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_STATE, 'readwrite');
            tx.objectStore(STORE_STATE).put({ key, value, timestamp: Date.now() });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    },
    async getState(key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_STATE, 'readonly');
            const req = tx.objectStore(STORE_STATE).get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : null);
            req.onerror = () => reject(req.error);
        });
    }
};

// ==================== Token 加密管理 ====================
const tokenManager = {
    _key: null,
    async getCryptoKey() {
        if (this._key) return this._key;
        const enc = new TextEncoder();
        const material = await crypto.subtle.importKey('raw', enc.encode('fhj-admin-salt-2026'), 'PBKDF2', false, ['deriveKey']);
        this._key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: enc.encode('fhj-admin-iv-salt'), iterations: 100000, hash: 'SHA-256' },
            material,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        return this._key;
    },
    async encrypt(plaintext) {
        const key = await this.getCryptoKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), iv.length);
        return btoa(String.fromCharCode(...combined));
    },
    async decrypt(cipherB64) {
        try {
            const key = await this.getCryptoKey();
            const combined = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
            return new TextDecoder().decode(decrypted);
        } catch (e) { return null; }
    },
    saveToken(token) {
        localStorage.setItem('fhj_admin_token_time', String(Date.now()));
        this.encrypt(token).then(enc => localStorage.setItem('fhj_admin_token_enc', enc));
    },
    async getToken() {
        const enc = localStorage.getItem('fhj_admin_token_enc');
        if (!enc) return null;
        return await this.decrypt(enc);
    },
    clearToken() {
        localStorage.removeItem('fhj_admin_token_enc');
        localStorage.removeItem('fhj_admin_token_time');
    }
};

// ==================== GitHub API 封装 ====================
const github = {
    token: null,
    setToken(t) { this.token = t; },
    async request(method, path, body) {
        const opts = {
            method,
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        };
        if (body) opts.body = JSON.stringify(body);
        const resp = await fetch(`${GITHUB_API}${path}`, opts);
        // 不再显示 API 剩余次数
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.message || `HTTP ${resp.status}`);
        }
        return data;
    },
    async getFile(path) {
        try {
            const data = await this.request('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`);
            if (data.content && data.encoding === 'base64') {
                return { content: decodeBase64UTF8(data.content), sha: data.sha };
            }
            if (Array.isArray(data)) {
                return data.map(f => ({ name: f.name, path: f.path, sha: f.sha, size: f.size }));
            }
            return null;
        } catch (e) {
            if (e.message.includes('404')) return null;
            throw e;
        }
    },
    async getFileList(dirPath) {
        try {
            return await this.request('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${dirPath}?ref=${BRANCH}`);
        } catch (e) {
            if (e.message.includes('404')) return [];
            throw e;
        }
    },
    async getRefSha() {
        const data = await this.request('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`);
        return { refSha: data.object.sha, treeSha: null };
    },
    async getCommitTree(commitSha) {
        const data = await this.request('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${commitSha}`);
        return data.tree.sha;
    },
    async getTreeRecursive(treeSha) {
        const data = await this.request('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${treeSha}?recursive=1`);
        if (data.truncated) {
            throw new Error('Git tree 过大，无法生成完整离线清单；请缩小仓库后重试');
        }
        return Array.isArray(data.tree) ? data.tree : [];
    },
    async createBlob(content, encoding) {
        const data = await this.request('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
            content, encoding
        });
        return data.sha;
    },
    async createTree(baseTreeSha, treeItems) {
        const data = await this.request('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`, {
            base_tree: baseTreeSha,
            tree: treeItems
        });
        return data.sha;
    },
    async createCommit(treeSha, parentSha, message) {
        const data = await this.request('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`, {
            message,
            tree: treeSha,
            parents: [parentSha]
        });
        return data.sha;
    },
    async updateRef(commitSha) {
        return await this.request('PATCH', `/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`, {
            sha: commitSha,
            force: false
        });
    },
    getRawFileUrl(path) {
        if (IS_LOCALHOST) {
            const segments = path.split('/');
            return '/' + segments.map(s => encodeURIComponent(s)).join('/');
        }
        return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${path}`;
    }
};

// ==================== 应用状态管理 ====================
const appState = {
    originalSongsData: null,      // GitHub 上的原始 data/songs.json
    workingSongsData: null,       // 工作副本
    originalScriptJs: null,       // GitHub 上的原始 assets/js/script.js
    workingScriptJs: null,
    originalScriptJsSha: null,
    originalIndexHtml: null,      // GitHub 上的原始 index.html
    workingIndexHtml: null,
    originalIndexHtmlSha: null,
    originalSongsJsonSha: null,
    pendingImageOps: [],          // { type: 'add'|'delete', filename, data (base64) }
    pendingChanges: [],           // 人类可读的变更描述
    lastCommitSha: null,
    lastCommitMessage: null,
    imageFileCache: null,         // GitHub 上 img/ 的文件列表缓存
    existingVersions: new Set(),  // 所有已知版本名
    currentEditSong: null,        // 当前正在编辑的歌曲 { category, id, data }
    currentViewCat: null,         // 当前查看的分类
    isNewSong: true,
};

function addPendingChange(type, description, details, dedupKey) {
    // 如果提供了 dedupKey，移除同一 key 的旧记录（合并同对象的多次编辑）
    if (dedupKey) {
        appState.pendingChanges = appState.pendingChanges.filter(c => c._dedupKey !== dedupKey);
    }
    const existing = appState.pendingChanges.find(c => c.description === description);
    if (!existing) {
        appState.pendingChanges.push({ type, description, details, time: Date.now(), _dedupKey: dedupKey });
    }
    updatePendingUI();
    idb.putState('pending_changes', appState.pendingChanges).catch(() => {});
    idb.putState('pending_image_ops', appState.pendingImageOps).catch(() => {});
}

async function clearPendingChanges() {
    // 恢复所有工作数据到原始状态
    if (appState.originalSongsData) {
        appState.workingSongsData = JSON.parse(JSON.stringify(appState.originalSongsData));
    }
    if (appState.originalScriptJs) {
        appState.workingScriptJs = appState.originalScriptJs;
    }
    if (appState.originalIndexHtml) {
        appState.workingIndexHtml = appState.originalIndexHtml;
        // 恢复主题状态
        appState.christmasTheme = appState.originalIndexHtml.includes('class="christmas-theme"') ||
                                  appState.originalIndexHtml.includes("class='christmas-theme'");
    }
    appState.pendingChanges = [];
    appState.pendingImageOps = [];
    appState._pendingTranslations = {};
    updatePendingUI();
    await idb.putState('pending_changes', []).catch(() => {});
    await idb.putState('pending_image_ops', []).catch(() => {});
    await idb.clearImages().catch(() => {});
    // 刷新仪表盘以恢复原有显示
    const dashView = $('dashboardView');
    if (dashView && dashView.classList.contains('active')) renderDashboard();
}

async function loadPendingFromIDB() {
    const changes = await idb.getState('pending_changes').catch(() => null);
    const imgOps = await idb.getState('pending_image_ops').catch(() => null);
    if (changes && Array.isArray(changes) && changes.length > 0) {
        appState.pendingChanges = changes;
    }
    if (imgOps && Array.isArray(imgOps) && imgOps.length > 0) {
        appState.pendingImageOps = imgOps;
    }
    updatePendingUI();
}

function updatePendingUI() {
    const list = $('pendingList');
    const count = $('pendingCount');
    const btn = $('publishBtn');
    const clearBtn = $('clearPendingBtn');
    const n = appState.pendingChanges.length;
    count.textContent = n + ' 项';
    btn.disabled = n === 0;
    if (clearBtn) clearBtn.style.display = n > 0 ? 'inline-block' : 'none';
    if (n === 0) {
        list.innerHTML = '<div class="empty-msg">暂无待发布的更改</div>';
    } else {
        list.innerHTML = appState.pendingChanges.map(c => {
            const icons = { add: '➕', modify: '✏️', delete: '🗑️', image: '🖼️', weekly: '📅', settings: '⚙️' };
            const types = { add: '新增', modify: '修改', delete: '删除', image: '图片', weekly: '本周', settings: '设置' };
            return `<div class="pending-item">
                <span class="pending-icon">${icons[c.type] || '📝'}</span>
                <span class="pending-desc">${escapeHTML(c.description)}</span>
                <span class="pending-type">${types[c.type] || c.type}</span>
            </div>`;
        }).join('');
    }
}

// ==================== 图片处理 ====================
const imageProcessor = {
    // 将任意图片文件转为 JPEG base64，超过阈值则压缩
    async processFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const img = await this.loadImage(e.target.result);
                    const result = await this.toJpegBlob(img);
                    const base64 = await this.blobToBase64(result.blob);
                    resolve({
                        base64,
                        blob: result.blob,
                        sizeKB: result.sizeKB,
                        wasCompressed: result.wasCompressed,
                        width: img.width,
                        height: img.height,
                        img
                    });
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    },
    async toJpegBlob(img, quality) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        if (!quality) quality = 0.92;
        let blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
        let sizeKB = blob.size / 1024;
        let wasCompressed = false;
        if (sizeKB > MAX_IMG_SIZE_KB) {
            wasCompressed = true;
            let lo = 0.05, hi = quality, bestBlob = blob, bestSize = sizeKB;
            for (let i = 0; i < 10; i++) {
                const mid = (lo + hi) / 2;
                const testBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', mid));
                const testSize = testBlob.size / 1024;
                if (testSize <= MAX_IMG_SIZE_KB && testSize > TARGET_IMG_SIZE_KB * 0.8) {
                    bestBlob = testBlob; bestSize = testSize; break;
                }
                if (testSize > MAX_IMG_SIZE_KB) { hi = mid; }
                else {
                    lo = mid;
                    if (testSize > bestSize && testSize <= MAX_IMG_SIZE_KB) { bestBlob = testBlob; bestSize = testSize; }
                }
            }
            // 如果仍然超过阈值，取最后一次小于阈值的尝试，或强制使用最低质量
            if (bestSize > MAX_IMG_SIZE_KB) {
                const finalBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.05));
                blob = finalBlob;
                sizeKB = finalBlob.size / 1024;
            } else {
                blob = bestBlob;
                sizeKB = bestSize;
            }
        }
        return { blob, sizeKB: Math.round(sizeKB * 10) / 10, wasCompressed };
    },
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },
    // 检测裁剪边界（左右空白）
    detectCropBounds(img) {
        const canvas = document.createElement('canvas');
        const maxDim = 600;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const w = canvas.width, h = canvas.height;
        const threshold = 240; // RGB 阈值，高于此视为空白
        // 左边界
        let left = 0;
        for (let x = 0; x < w; x++) {
            let isBlank = true;
            for (let y = 0; y < h; y++) {
                const idx = (y * w + x) * 4;
                if (pixels[idx] < threshold || pixels[idx+1] < threshold || pixels[idx+2] < threshold) {
                    isBlank = false; break;
                }
            }
            if (!isBlank) { left = x; break; }
        }
        // 右边界
        let right = w - 1;
        for (let x = w - 1; x >= 0; x--) {
            let isBlank = true;
            for (let y = 0; y < h; y++) {
                const idx = (y * w + x) * 4;
                if (pixels[idx] < threshold || pixels[idx+1] < threshold || pixels[idx+2] < threshold) {
                    isBlank = false; break;
                }
            }
            if (!isBlank) { right = x; break; }
        }
        // 上下边界
        let top = 0;
        for (let y = 0; y < h; y++) {
            let isBlank = true;
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                if (pixels[idx] < threshold || pixels[idx+1] < threshold || pixels[idx+2] < threshold) {
                    isBlank = false; break;
                }
            }
            if (!isBlank) { top = y; break; }
        }
        let bottom = h - 1;
        for (let y = h - 1; y >= 0; y--) {
            let isBlank = true;
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                if (pixels[idx] < threshold || pixels[idx+1] < threshold || pixels[idx+2] < threshold) {
                    isBlank = false; break;
                }
            }
            if (!isBlank) { bottom = y; break; }
        }
        // 加一点边距
        const margin = Math.round(5 / scale);
        left = Math.max(0, left - margin);
        right = Math.min(w - 1, right + margin);
        top = Math.max(0, top - margin);
        bottom = Math.min(h - 1, bottom + margin);
        return {
            left: Math.round(left / scale),
            top: Math.round(top / scale),
            right: Math.round(right / scale),
            bottom: Math.round(bottom / scale),
            origW: img.width,
            origH: img.height
        };
    },
    // 裁剪图片
    cropImage(img, bounds) {
        const canvas = document.createElement('canvas');
        canvas.width = bounds.right - bounds.left;
        canvas.height = bounds.bottom - bounds.top;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, bounds.left, bounds.top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        return canvas;
    },
    // 从 canvas 获取 dataURL
    canvasToDataURL(canvas) {
        return canvas.toDataURL('image/jpeg', 0.92);
    }
};

// ==================== 主加载流程 ====================
async function loadAllData() {
    try {
        showToast('正在从 GitHub 加载数据...', '');
        // 并行加载
        const [songsResult, scriptResult, indexResult, imgFilesRaw] = await Promise.all([
            github.getFile('data/songs.json'),
            github.getFile('assets/js/script.js'),
            github.getFile('index.html'),
            github.getFileList('img').catch(() => [])
        ]);
        if (!songsResult || !songsResult.content) throw new Error('无法加载 data/songs.json');
        if (!scriptResult || !scriptResult.content) throw new Error('无法加载 assets/js/script.js');
        if (!indexResult || !indexResult.content) throw new Error('无法加载 index.html');

        appState.originalSongsData = JSON.parse(songsResult.content);
        appState.workingSongsData = JSON.parse(songsResult.content); // 深拷贝
        appState.originalSongsJsonSha = songsResult.sha;

        appState.originalScriptJs = scriptResult.content;
        appState.workingScriptJs = scriptResult.content;
        appState.originalScriptJsSha = scriptResult.sha;

        appState.originalIndexHtml = indexResult.content;
        appState.workingIndexHtml = indexResult.content;
        appState.originalIndexHtmlSha = indexResult.sha;

        // 构建图片文件列表缓存
        appState.imageFileCache = new Map();
        appState.existingVersions = new Set(['原谱']);
        const imgDirs = Array.isArray(imgFilesRaw) ? imgFilesRaw : [];
        for (const dir of imgDirs) {
            if (dir.type === 'dir') {
                const files = await github.getFileList(dir.path).catch(() => []);
                for (const f of files) {
                    if (f.type === 'file' && /\.(jpe?g|png|webp|bmp)$/i.test(f.name)) {
                        appState.imageFileCache.set(f.name, { path: f.path, sha: f.sha });
                        // 从文件名提取版本名：必须有5段以上才算有版本
                        // 格式: 分类_编号_标题_页码 (4段, 无版本)
                        // 格式: 分类_编号_标题_版本_页码 (5段+, 有版本)
                        const nameNoExt = f.name.replace(/\.\w+$/, '');
                        const parts = nameNoExt.split('_');
                        if (parts.length >= 5) {
                            const lastPart = parts[parts.length - 1];
                            const secondLast = parts[parts.length - 2];
                            if (/^\d+$/.test(lastPart) && !/^\d+$/.test(secondLast) && secondLast !== '原谱') {
                                appState.existingVersions.add(secondLast);
                            }
                        }
                    }
                }
            }
        }

        // 检查圣诞主题状态
        appState.christmasTheme = appState.originalIndexHtml.includes('class="christmas-theme"') ||
                                  appState.originalIndexHtml.includes("class='christmas-theme'");

        // 获取上次发布信息
        const savedLastCommit = await idb.getState('last_commit');
        if (savedLastCommit) {
            appState.lastCommitSha = savedLastCommit.sha;
            appState.lastCommitMessage = savedLastCommit.message;
            appState.lastCommitTime = savedLastCommit.time || '';
        }

        showToast('数据加载完成', 'success');
        // 隐藏加载遮罩
        const overlay = document.getElementById('mainLoadingOverlay');
        if (overlay) overlay.style.display = 'none';
        // 恢复待发布更改
        await loadPendingFromIDB();
        renderDashboard();
    } catch (e) {
        console.error('加载数据失败:', e);
        showToast('加载数据失败: ' + e.message, 'error');
    }
}

// ==================== 仪表盘 ====================
function renderDashboard() {
    const data = appState.workingSongsData;
    // 本周歌曲信息
    const ws = data.weeklySongs;
    $('dashWeeklyInfo').textContent = `适用日期：${ws.updateDate}\n${ws.songs.length} 首歌曲`;

    // 歌曲管理信息
    let totalSongs = 0;
    const catNames = Object.keys(data.categories);
    catNames.forEach(c => { totalSongs += Object.keys(data.categories[c].songs).length; });
    $('dashSongsInfo').textContent = `${catNames.length} 个分类 · ${totalSongs} 首歌曲`;

    // 设置信息
    $('dashSettingsInfo').textContent = appState.christmasTheme ? '🎄 圣诞主题已开启' : '🎵 普通主题';

    updatePendingUI();
    // 发布信息：一行显示时间和内容
    if (appState.lastCommitTime && appState.lastCommitMessage) {
        $('dashPublishInfo').textContent = `🕐 ${appState.lastCommitTime}  📝 ${appState.lastCommitMessage}`;
    }
    switchSubView('dashboard');

    // 异步尝试从 GitHub API 获取最新提交（不阻塞 UI）
    fetchLastCommitFromAPI();
}

// ==================== 歌曲管理 - 分类列表 ====================
function renderCategoryList() {
    const data = appState.workingSongsData;
    const container = $('categoryList');
    const catNames = Object.keys(data.categories);
    container.innerHTML = catNames.map(name => {
        const cat = data.categories[name];
        const count = Object.keys(cat.songs).length;
        return `<div class="cat-item" data-cat="${escapeHTML(name)}">
            <div class="cat-item-main">
                <span class="drag-handle cat-drag-handle">≡</span>
                <span class="cat-item-name">📁 ${escapeHTML(name)}</span>
                <div class="cat-item-count">${count} 首歌曲</div>
            </div>
            <div class="cat-item-actions">
                <button class="cat-rename-btn" data-cat="${escapeHTML(name)}" title="修改名称">✏️</button>
                <button class="cat-delete-btn" data-cat="${escapeHTML(name)}" title="删除分类" ${count > 0 ? 'disabled style="opacity:0.3"' : ''}>🗑️</button>
            </div>
        </div>`;
    }).join('');

    // 分类点击 → 进入歌曲列表
    container.querySelectorAll('.cat-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const catName = item.dataset.cat;
            renderSongList(catName);
        });
    });

    // 重命名按钮
    container.querySelectorAll('.cat-rename-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const catName = btn.dataset.cat;
            showRenameCategoryModal(catName);
        });
    });

    // 删除按钮
    container.querySelectorAll('.cat-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (btn.disabled) return;
            const catName = btn.dataset.cat;
            showDeleteCategoryModal(catName);
        });
    });

    switchSubView('songs');

    // 分类拖拽排序
    if (window.Sortable && container.children.length > 1) {
        if (container._sortable) container._sortable.destroy();
        container._sortable = new Sortable(container, {
            animation: 150,
            handle: '.cat-drag-handle',
            ghostClass: 'sortable-ghost',
            onEnd: function(evt) {
                const keys = Object.keys(appState.workingSongsData.categories);
                const [moved] = keys.splice(evt.oldIndex, 1);
                keys.splice(evt.newIndex, 0, moved);
                // 重建 categories 保持新顺序
                const newCategories = {};
                keys.forEach(k => { newCategories[k] = appState.workingSongsData.categories[k]; });
                appState.workingSongsData.categories = newCategories;
                renderCategoryList();
                addPendingChange('modify', '调整分类排序', null, 'category:sort');
                // 净零检测
                const origKeys = Object.keys(appState.originalSongsData?.categories || {});
                const curKeys = Object.keys(appState.workingSongsData.categories);
                if (origKeys.length === curKeys.length && origKeys.every((k, i) => k === curKeys[i])) {
                    appState.pendingChanges = appState.pendingChanges.filter(c => c._dedupKey !== 'category:sort');
                    updatePendingUI();
                    idb.putState('pending_changes', appState.pendingChanges).catch(() => {});
                    showToast('分类排序与原始一致，无需发布', '');
                }
            }
        });
    }
}

function showRenameCategoryModal(oldName) {
    // 从 assets/js/script.js 或待发布翻译中提取现有英文翻译
    let existingEn = extractTranslationFromScript('categories', oldName);
    if (!existingEn && appState._pendingTranslations?.categories?.[oldName]) {
        existingEn = appState._pendingTranslations.categories[oldName];
    }
    showModal(`
        <h3>✏️ 修改分类名称</h3>
        <label>名称（中文）</label>
        <input class="form-input-inline" id="renameCatNewName" value="${escapeHTML(oldName)}" placeholder="输入新的分类名称">
        <label style="display:block;margin-top:10px;">名称（English）</label>
        <input class="form-input-inline" id="renameCatNewNameEn" value="${escapeHTML(existingEn || '')}" placeholder="用于前台双语显示">
        <div id="renameCatPreview" style="font-size:0.82rem;color:var(--text-light);margin-top:8px;min-height:20px;"></div>
        <p style="font-size:0.78rem;color:var(--warning);margin-top:8px;">⚠️ 改名后将自动重命名 img/ 下所有相关图片文件，并更新本周歌曲引用和前台翻译。</p>
        <div class="modal-actions">
            <button class="btn-cancel" id="modalCancel">取消</button>
            <button class="btn-save" id="modalConfirm" disabled>确认修改</button>
        </div>
    `);

    const nameInput = $('renameCatNewName');
    const enInput = $('renameCatNewNameEn');
    const confirmBtn = $('modalConfirm');
    const preview = $('renameCatPreview');

    function checkChange() {
        const changed = nameInput.value.trim() !== oldName || enInput.value.trim() !== (existingEn || '');
        confirmBtn.disabled = !changed || !nameInput.value.trim();
        if (changed && nameInput.value.trim() && nameInput.value.trim() !== oldName) {
            preview.innerHTML = `📝 将更名：<strong>${escapeHTML(oldName)}</strong> → <strong>${escapeHTML(nameInput.value.trim())}</strong>`;
        } else if (changed) {
            preview.innerHTML = `📝 仅更新英文翻译`;
        } else {
            preview.innerHTML = '';
        }
    }
    nameInput.addEventListener('input', checkChange);
    enInput.addEventListener('input', checkChange);
    checkChange();

    $('modalCancel').onclick = hideModal;
    $('modalConfirm').onclick = async () => {
        const newName = nameInput.value.trim();
        const newNameEn = enInput.value.trim();
        if (!newName) { showToast('名称不能为空', 'error'); return; }
        if (ILLEGAL_CHARS.test(newName)) { showToast('名称包含非法字符：\\ / : * ? " < > |', 'error'); return; }
        if (newName !== oldName && appState.workingSongsData.categories[newName]) { showToast('该分类名称已存在', 'error'); return; }

        // 二次确认
        hideModal();
        showModal(`
            <h3>确认修改分类名称</h3>
            <p>旧名称：<strong>${escapeHTML(oldName)}</strong></p>
            <p>新名称：<strong>${escapeHTML(newName)}</strong></p>
            ${newNameEn ? `<p>英文名称：<strong>${escapeHTML(newNameEn)}</strong></p>` : ''}
            <p style="font-size:0.82rem;color:var(--warning);">⚠️ img/ 下所有以「${escapeHTML(oldName)}_」开头的图片文件将被重命名为「${escapeHTML(newName)}_」开头。</p>
            <div class="modal-actions">
                <button class="btn-cancel" id="modalCancel2">取消</button>
                <button class="btn-save" id="modalConfirm2">确认修改</button>
            </div>
        `);
        $('modalCancel2').onclick = hideModal;
        $('modalConfirm2').onclick = () => {
            hideModal();
            executeRenameCategory(oldName, newName, newNameEn);
        };
    };
}

function extractTranslationFromScript(section, key) {
    try {
        const content = appState.workingScriptJs || '';
        // 找到 'en': 翻译区段的起始位置
        const enMatch = content.match(/'en':\s*\{/);
        if (!enMatch) return '';
        // 从 'en': { 之后截取足够长的内容（到文件末尾）
        const enStart = enMatch.index + enMatch[0].length;
        const enContent = content.substring(enStart);
        // 在英文区段中搜索
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`'${escapedKey}':\\s*'((?:[^'\\\\]|\\\\')*)'`);
        const match = enContent.match(regex);
        if (match) {
            return match[1].replace(/\\'/g, "'");
        }
        return '';
    } catch (e) { return ''; }
}

function executeRenameCategory(oldName, newName, newNameEn) {
    // 重命名分类——保持原有顺序
    const newCategories = {};
    for (const [k, v] of Object.entries(appState.workingSongsData.categories)) {
        if (k === oldName) {
            newCategories[newName] = v;
        } else {
            newCategories[k] = v;
        }
    }
    appState.workingSongsData.categories = newCategories;

    // 更新图片文件名（包括已在 GitHub 上的文件）
    const oldPrefix = oldName + '_';
    const newPrefix = newName + '_';
    const renames = [];
    appState.imageFileCache.forEach((info, filename) => {
        if (filename.startsWith(oldPrefix)) {
            const newFilename = newPrefix + filename.slice(oldPrefix.length);
            renames.push({ old: filename, new: newFilename, path: info.path, sha: info.sha });
        }
    });
    // 更新已有的 pendingImageOps
    appState.pendingImageOps = appState.pendingImageOps.map(op => {
        const match = renames.find(r => r.old === op.filename);
        if (match) return { ...op, filename: match.new, oldFilename: match.old };
        return op;
    });
    // 为已在 GitHub 上的文件生成删除+新增操作
    renames.forEach(r => {
        const alreadyInOps = appState.pendingImageOps.some(op => op.filename === r.new || op.oldFilename === r.old);
        if (!alreadyInOps) {
            appState.pendingImageOps.push({ type: 'delete', filename: r.old, oldPath: r.path });
            appState.pendingImageOps.push({ type: 'add', filename: r.new, sha: r.sha });
        }
        const info = appState.imageFileCache.get(r.old);
        if (info) {
            appState.imageFileCache.delete(r.old);
            appState.imageFileCache.set(r.new, { ...info, path: info.path.replace(r.old, r.new) });
        }
    });
    // 更新本周歌曲引用
    appState.workingSongsData.weeklySongs.songs.forEach(s => {
        if (s.category === oldName) s.category = newName;
    });

    // 记录英文翻译更新（将在发布时写入 assets/js/script.js）
    if (newNameEn) {
        appState._pendingTranslations = appState._pendingTranslations || {};
        appState._pendingTranslations.categories = appState._pendingTranslations.categories || {};
        appState._pendingTranslations.categories[newName] = newNameEn;
        if (oldName !== newName) {
            appState._pendingTranslations.categories['__remove__'] = appState._pendingTranslations.categories['__remove__'] || [];
            appState._pendingTranslations.categories['__remove__'].push(oldName);
        }
    }

    // dedupKey 用两个名字的排序对，确保 A→B 和 B→A 合并
    const names = [oldName, newName].sort();
    const renameDedupKey = `category:rename:${names[0]}:${names[1]}`;

    addPendingChange('modify', `分类改名：${oldName} → ${newName}`, `重命名 ${renames.length} 个图片文件`, renameDedupKey);

    // 净零检测：若最终名称等于原始名称，清除记录和图片操作
    if (newName !== oldName && appState.originalSongsData?.categories?.[newName]) {
        appState.pendingChanges = appState.pendingChanges.filter(c => c._dedupKey !== renameDedupKey);
        appState.pendingImageOps = appState.pendingImageOps.filter(
            op => !op.filename || (!op.filename.startsWith(oldName + '_') && !op.filename.startsWith(newName + '_'))
        );
        updatePendingUI();
        idb.putState('pending_changes', appState.pendingChanges).catch(() => {});
        idb.putState('pending_image_ops', appState.pendingImageOps).catch(() => {});
        showToast('分类名称已恢复为原始名称，无需发布', '');
    } else if (newName === oldName) {
        appState.pendingChanges = appState.pendingChanges.filter(c => c._dedupKey !== renameDedupKey);
        updatePendingUI();
        idb.putState('pending_changes', appState.pendingChanges).catch(() => {});
        showToast('分类名称未变更', '');
    } else {
        showToast('分类名称已修改（待发布）', 'success');
    }
    renderCategoryList();
}

function showDeleteCategoryModal(catName) {
    showModal(`
        <h3>🗑️ 确认删除分类</h3>
        <p>确定要删除分类「<strong>${escapeHTML(catName)}</strong>」吗？</p>
        <p style="font-size:0.85rem;color:var(--danger);">此操作将删除该分类下的所有图片文件，不可恢复。</p>
        <div class="modal-actions">
            <button class="btn-cancel" id="modalCancel">取消</button>
            <button class="btn-save" style="background:var(--danger)" id="modalConfirm">确认删除</button>
        </div>
    `);
    $('modalCancel').onclick = hideModal;
    $('modalConfirm').onclick = () => {
        const cat = appState.workingSongsData.categories[catName];
        const songCount = Object.keys(cat.songs).length;
        if (songCount > 0) {
            showToast('分类不为空，无法删除', 'error');
            hideModal();
            return;
        }
        delete appState.workingSongsData.categories[catName];
        // 标记删除图片
        const prefix = catName + '_';
        appState.imageFileCache.forEach((info, filename) => {
            if (filename.startsWith(prefix)) {
                appState.pendingImageOps.push({ type: 'delete', filename, oldPath: info.path });
            }
        });
        // 净零检测：若删除的分类是本次会话新增的（原始数据中不存在），直接取消
        const existedInOriginal = appState.originalSongsData?.categories?.[catName];
        if (!existedInOriginal) {
            delete appState.workingSongsData.categories[catName];
            appState.pendingChanges = appState.pendingChanges.filter(c => c._dedupKey !== `category:${catName}`);
            appState.pendingImageOps = appState.pendingImageOps.filter(op => !op.filename || !op.filename.startsWith(catName + '_'));
            updatePendingUI();
            idb.putState('pending_changes', appState.pendingChanges).catch(() => {});
            hideModal();
            renderCategoryList();
            showToast('分类未实际创建过，已直接移除', '');
        } else {
            delete appState.workingSongsData.categories[catName];
            addPendingChange('delete', `删除分类：${catName}`, null, `category:${catName}`);
            hideModal();
            renderCategoryList();
            showToast('分类已删除（待发布）', 'success');
        }
    };
}

// ==================== 歌曲管理 - 歌曲列表 ====================
function renderSongList(catName) {
    appState.currentViewCat = catName;
    const cat = appState.workingSongsData.categories[catName];
    if (!cat) return;
    const isDaChangYong = catName === '答唱咏（朱健仁）';

    $('catDetailTitle').textContent = catName;
    $('catDetailInfo').textContent = `${Object.keys(cat.songs).length} 首歌曲`;

    const songs = Object.entries(cat.songs).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));

    let html = '';
    if (isDaChangYong) {
        // 按子分类分组显示
        const groups = { '通用': [], '甲年': [], '乙年': [], '丙年': [] };
        songs.forEach(([id, song]) => {
            const prefix = detectYearPrefix(song.title);
            const group = prefix || '通用';
            if (!groups[group]) groups[group] = [];
            groups[group].push([id, song]);
        });
        for (const [subName, subSongs] of Object.entries(groups)) {
            if (subSongs.length === 0 && subName === '通用') continue;
            const subId = 'dcysub_' + subName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
            html += `<div class="dcysub-group">
                <div class="dcysub-header" data-sub-id="${subId}" style="display:flex;align-items:center;gap:6px;padding:8px 4px;font-weight:700;font-size:0.85rem;color:var(--primary);margin-top:4px;cursor:pointer;user-select:none;border-radius:4px;transition:background 0.15s;">
                    <span class="dcysub-arrow" style="display:inline-block;transition:transform 0.2s;font-size:0.7rem;">▶</span>
                    📂 ${escapeHTML(subName)} (${subSongs.length}首)
                </div>
                <div class="dcysub-body" data-sub-id="${subId}">`;
            subSongs.forEach(([id, song]) => {
                html += buildSongItemHTML(catName, id, song);
            });
            html += `</div></div>`;
        }
    } else {
        songs.forEach(([id, song]) => {
            html += buildSongItemHTML(catName, id, song);
        });
    }
    if (!html) html = '<div class="empty-msg">此分类暂无歌曲</div>';
    $('songList').innerHTML = html;

    // 绑定事件
    bindSongItemEvents(catName);

    // 答唱咏子分组折叠/展开（默认收合）
    if (isDaChangYong) {
        $('songList').querySelectorAll('.dcysub-header').forEach(header => {
            header.addEventListener('click', () => {
                const subId = header.dataset.subId;
                const body = $('songList').querySelector(`.dcysub-body[data-sub-id="${CSS.escape(subId)}"]`);
                const arrow = header.querySelector('.dcysub-arrow');
                if (!body) return;
                const isOpen = body.style.display !== 'none';
                if (isOpen) {
                    body.style.display = 'none';
                    arrow.style.transform = 'rotate(0deg)';
                    arrow.textContent = '▶';
                } else {
                    body.style.display = '';
                    arrow.style.transform = 'rotate(90deg)';
                    arrow.textContent = '▼';
                }
            });
            // 默认收合
            const body = $('songList').querySelector(`.dcysub-body[data-sub-id="${CSS.escape(header.dataset.subId)}"]`);
            if (body) body.style.display = 'none';
        });
    }

    switchSubView('categoryDetail');
}

function buildSongItemHTML(catName, id, song) {
    const versions = (song.versions && song.versions.length > 0) ? song.versions.join('、') : '';
    const meta = versions ? `${song.pages}页 · ${versions}` : `${song.pages}页`;
    return `<div class="song-item" data-id="${escapeHTML(id)}" data-cat="${escapeHTML(catName)}">
        <div class="song-item-num">#${escapeHTML(id)}</div>
        <div class="song-item-title">${escapeHTML(song.title)}</div>
        <div class="song-item-meta">${meta}</div>
        <div class="song-item-actions">
            <button class="preview-song-btn" data-id="${escapeHTML(id)}" data-cat="${escapeHTML(catName)}" title="预览乐谱">👁️</button>
            <button class="edit-song-btn" data-id="${escapeHTML(id)}" data-cat="${escapeHTML(catName)}" title="编辑">✏️</button>
            <button class="song-delete-btn" data-id="${escapeHTML(id)}" data-cat="${escapeHTML(catName)}" title="删除">🗑️</button>
        </div>
    </div>`;
}

function bindSongItemEvents(catName) {
    const list = $('songList');
    // 歌曲点击 → 编辑
    list.querySelectorAll('.song-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const id = item.dataset.id;
            openSongEditor(catName, id, false);
        });
    });
    // 预览按钮
    list.querySelectorAll('.preview-song-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            previewSong(btn.dataset.cat, id);
        });
    });
    // 编辑按钮
    list.querySelectorAll('.edit-song-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSongEditor(btn.dataset.cat, btn.dataset.id, false);
        });
    });
    // 删除按钮
    list.querySelectorAll('.song-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showDeleteSongModal(btn.dataset.cat, btn.dataset.id);
        });
    });
}

function detectYearPrefix(title) {
    if (title.startsWith('甲年')) return '甲年';
    if (title.startsWith('乙年')) return '乙年';
    if (title.startsWith('丙年')) return '丙年';
    return null;
}

// ==================== 歌曲预览 ====================
function previewSong(catName, songId) {
    const cat = appState.workingSongsData.categories[catName];
    const song = cat.songs[songId];
    if (!song) return;
    const base = `${catName}_${songId}_${song.title}`;
    const url = github.getRawFileUrl(`img/${catName}/${base}_1.jpeg`);
    const overlay = document.createElement('div');
    overlay.className = 'preview-modal';
    overlay.innerHTML = `
        <button class="preview-close">×</button>
        <img src="${url}" alt="乐谱预览" onerror="this.parentElement.querySelector('.preview-close').textContent='⚠️ 图片加载失败'; this.style.display='none';">
    `;
    overlay.querySelector('.preview-close').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

// ==================== 新增/编辑歌曲界面 ====================
function openSongEditor(catName, songId, isNew) {
    const prevId = appState.currentEditSong?._sessionId;
    const prevOriginal = appState.currentEditSong?._originalData;
    appState.currentEditSong = { category: catName, id: songId, isNew };
    appState.currentViewCat = catName;

    if (!isNew) {
        appState.currentEditSong._sessionId = prevId || ('song:' + Date.now() + ':' + Math.random().toString(36).slice(2, 6));
    }
    console.log('[DEBUG] openSongEditor', { catName, songId, isNew, sessionId: appState.currentEditSong._sessionId });

    // 保存原始歌曲数据（用于净零检测和 dedupKey）
    if (!isNew && appState.originalSongsData) {
        let origCat = null, origId = songId;
        const curSong = appState.workingSongsData.categories[catName]?.songs?.[songId];
        const curTitle = (curSong && curSong.title) ? curSong.title.trim() : '';
        // 1) 同分类+同编号+同标题
        if (curTitle && appState.originalSongsData.categories[catName]?.songs?.[songId]?.title?.trim() === curTitle) {
            origCat = catName;
        }
        // 2) 按标题搜索所有分类
        if (!origCat && curTitle) {
            for (const c of Object.keys(appState.originalSongsData.categories)) {
                for (const [sid, s] of Object.entries(appState.originalSongsData.categories[c].songs)) {
                    if (s.title && s.title.trim() === curTitle) { origCat = c; origId = sid; break; }
                }
                if (origCat) break;
            }
        }
        // 3) 若标题也改了导致查找失败，复用首次打开时保存的原始数据
        if (!origCat && prevOriginal) {
            origCat = prevOriginal.category;
            origId = prevOriginal.id;
            console.log('[DEBUG] _originalData reused from previous session');
        }
        // 4) 兜底：同分类+同编号
        if (!origCat && appState.originalSongsData.categories[catName]?.songs?.[songId]) {
            origCat = catName;
        }
        appState.currentEditSong._originalData = origCat
            ? { category: origCat, id: origId, ...(appState.originalSongsData.categories[origCat]?.songs?.[origId] || {}) }
            : null;
        appState.currentEditSong._originalCat = origCat || catName;
        console.log('[DEBUG] _originalData', { origCat, origId, found: !!origCat, title: appState.currentEditSong._originalData?.title });
    }

    const cat = appState.workingSongsData.categories[catName];
    const song = isNew ? null : cat.songs[songId];
    const isDaChangYong = catName === '答唱咏（朱健仁）';
    const existingPrefix = song ? detectYearPrefix(song.title) : null;

    $('songFormTitle').textContent = isNew ? '新增歌曲' : `编辑歌曲 #${songId}`;

    let html = `
    <div class="form-section">
        <div class="form-section-title">📋 基本信息</div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">所属分类 <span class="required">*</span></label>
                <select class="form-select" id="editSongCat">
                    ${Object.keys(appState.workingSongsData.categories).map(c =>
                        `<option value="${escapeHTML(c)}" ${c === catName ? 'selected' : ''}>${escapeHTML(c)}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">歌曲编号 <span class="required">*</span></label>
                <input class="form-input" id="editSongId" value="${escapeHTML(isNew ? getMinAvailableId(catName) : songId)}" placeholder="如 001">
            </div>
        </div>
        ${isDaChangYong ? `
        <div class="form-group">
            <label class="form-label">子分类 <span class="required">*</span></label>
            <select class="form-select" id="editSongSubCat">
                <option value="通用" ${existingPrefix === null && song ? 'selected' : ''}>通用</option>
                <option value="甲年" ${existingPrefix === '甲年' ? 'selected' : ''}>甲年</option>
                <option value="乙年" ${existingPrefix === '乙年' ? 'selected' : ''}>乙年</option>
                <option value="丙年" ${existingPrefix === '丙年' ? 'selected' : ''}>丙年</option>
            </select>
        </div>` : ''}
        <div class="form-group">
            <label class="form-label">歌曲标题 <span class="required">*</span></label>
            <input class="form-input" id="editSongTitle" value="${escapeHTML(song ? song.title : '')}" placeholder="输入歌曲标题">
            <div class="form-hint" id="editSongTitleHint"></div>
        </div>
    </div>

    <div class="form-section">
        <div class="form-section-title">🖼️ 乐谱图片上传</div>
        <div class="form-hint" style="margin-bottom:12px;">💡 原谱为必选。上传原谱后可通过下拉菜单添加不同版本的乐谱。歌曲总页数以原谱为准。</div>
        <div id="versionUploads"></div>
        <div id="addVersionArea" style="margin-top:12px;display:none;">
            <div style="display:flex;gap:8px;margin-bottom:8px;">
                <input type="text" id="customVersionInput" placeholder="输入自定义版本名称..." style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-xs);font-size:0.85rem;">
                <button id="addCustomVersionBtn" style="padding:8px 14px;background:var(--primary);color:#fff;border-radius:var(--radius-xs);font-size:0.85rem;white-space:nowrap;">添加</button>
            </div>
            <button id="addVersionDropdownBtn" style="padding:10px 16px;background:var(--primary);color:#fff;border-radius:var(--radius-xs);font-size:0.85rem;">+ 添加已知版本乐谱 ▼</button>
            <div id="versionDropdown" style="display:none;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-xs);margin-top:4px;box-shadow:var(--shadow);max-height:160px;overflow-y:auto;"></div>
        </div>
    </div>

    <div class="form-actions">
        <button class="btn-cancel" id="songFormCancel">取消</button>
        <button class="btn-save" id="songFormSave">💾 保存歌曲</button>
    </div>`;

    $('songFormContainer').innerHTML = html;

    // 初始化版本上传区域
    const existingVersions = song ? ['原谱', ...(song.versions || [])] : ['原谱'];
    window._songEditVersions = [...existingVersions];
    window._songEditImages = {};
    // 先添加原谱区域
    window._songEditImages['原谱'] = [];
    addVersionUploadBlock('原谱');
    // 如果有其他版本，也添加
    existingVersions.filter(v => v !== '原谱').forEach(v => {
        window._songEditImages[v] = [];
        addVersionUploadBlock(v);
    });
    // 如果是编辑模式，尝试从 IndexedDB 或远程加载已有图片
    if (song) {
        const editSongRef = appState.currentEditSong;
        window._songImagesLoaded = loadExistingImagesForEdit(catName, songId, song, existingVersions, editSongRef);
    }
    // 更新添加版本按钮状态
    updateAddVersionButton();

    // 自定义版本输入
    $('addCustomVersionBtn').onclick = () => {
        const input = $('customVersionInput');
        const vName = input.value.trim();
        if (!vName) { showToast('请输入版本名称', 'error'); return; }
        if (window._songEditVersions.includes(vName)) { showToast('该版本已存在', 'error'); return; }
        window._songEditVersions.push(vName);
        window._songEditImages[vName] = [];
        addVersionUploadBlock(vName);
        input.value = '';
        updateAddVersionButton();
    };
    $('customVersionInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); $('addCustomVersionBtn').click(); }
    });

    // 添加版本下拉按钮
    $('addVersionDropdownBtn').onclick = (e) => {
        e.stopPropagation();
        const dropdown = $('versionDropdown');
        const available = getAvailableVersionsToAdd();
        if (available.length === 0) {
            showToast('没有更多可用的版本', '');
            return;
        }
        dropdown.innerHTML = available.map(v => `
            <div class="version-dropdown-item" data-version="${escapeHTML(v)}" style="padding:10px 14px;cursor:pointer;font-size:0.85rem;border-bottom:1px solid var(--border);">
                + ${escapeHTML(v)}
            </div>
        `).join('');
        dropdown.style.display = 'block';
        dropdown.querySelectorAll('.version-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const vName = item.dataset.version;
                window._songEditVersions.push(vName);
                window._songEditImages[vName] = [];
                addVersionUploadBlock(vName);
                dropdown.style.display = 'none';
                updateAddVersionButton();
            });
        });
    };
    // 点击外部关闭下拉
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#addVersionArea')) {
            $('versionDropdown').style.display = 'none';
        }
    });

    // 子分类变化时检测标题前缀
    if (isDaChangYong) {
        const subCatSelect = $('editSongSubCat');
        const titleInput = $('editSongTitle');
        const hint = $('editSongTitleHint');
        const checkPrefix = () => {
            const sub = subCatSelect.value;
            const title = titleInput.value.trim();
            const prefix = detectYearPrefix(title);
            if (sub === '通用' && prefix) {
                hint.innerHTML = `<span style="color:var(--warning);">⚠️ 标题以「${prefix}」开头，但子分类选择了「通用」，请确认是否正确</span>`;
            } else if (sub !== '通用' && prefix && prefix !== sub) {
                hint.innerHTML = `<span style="color:var(--warning);">⚠️ 标题前缀「${prefix}」与子分类「${sub}」不匹配</span>`;
            } else if (sub !== '通用' && !prefix) {
                hint.innerHTML = `<span style="color:var(--info);">ℹ️ 标题将自动添加「${sub}」前缀</span>`;
            } else {
                hint.innerHTML = '';
            }
        };
        subCatSelect.addEventListener('change', checkPrefix);
        titleInput.addEventListener('input', checkPrefix);
        checkPrefix();
    }

    // 标题非法字符检测
    $('editSongTitle').addEventListener('input', () => {
        const title = $('editSongTitle').value;
        if (ILLEGAL_CHARS.test(title)) {
            $('editSongTitle').classList.add('error');
            $('editSongTitleHint').textContent = '❌ 标题包含非法字符：\\ / : * ? " < > |';
        } else {
            $('editSongTitle').classList.remove('error');
        }
    });

    // 分类切换时自动更新编号为目标分类最小可用编号
    $('editSongCat').addEventListener('change', () => {
        const newCat = $('editSongCat').value;
        const idInput = $('editSongId');
        const oldInfo = appState.currentEditSong;
        // 新增歌曲 或 编辑时切换了分类 → 自动生成新编号
        if (!oldInfo || oldInfo.isNew || oldInfo.category !== newCat) {
            idInput.value = getMinAvailableId(newCat);
        }
    });

    // 编号输入校验：非法时自动恢复为最小可用编号
    $('editSongId').addEventListener('input', () => {
        const idInput = $('editSongId');
        if (!/^\d{3}$/.test(idInput.value)) {
            idInput.classList.add('error');
        } else {
            idInput.classList.remove('error');
        }
    });
    $('editSongId').addEventListener('blur', () => {
        const idInput = $('editSongId');
        if (!/^\d{3}$/.test(idInput.value)) {
            const catName = $('editSongCat').value;
            idInput.value = getMinAvailableId(catName);
            idInput.classList.remove('error');
            showToast('编号格式不正确，已自动生成为最小可用编号', '');
        }
    });

    // 保存按钮
    $('songFormSave').onclick = () => saveSong();

    // 取消按钮
    $('songFormCancel').onclick = () => {
        if (appState.currentViewCat) renderSongList(appState.currentViewCat);
        else renderCategoryList();
    };

    switchSubView('songForm');
}

function getAvailableVersionsToAdd() {
    const allKnown = [...appState.existingVersions];
    const alreadyAdded = window._songEditVersions || [];
    return allKnown.filter(v => !alreadyAdded.includes(v));
}

function updateAddVersionButton() {
    const area = $('addVersionArea');
    const btn = $('addVersionDropdownBtn');
    const versions = window._songEditVersions || [];
    // 所有已添加的版本都必须有至少一张有效图片
    const allVersionsHaveImages = versions.every(v => {
        const imgs = (window._songEditImages[v] || []).filter(i => i !== null && i !== undefined);
        return imgs.length > 0;
    });
    const available = getAvailableVersionsToAdd();
    if (allVersionsHaveImages && available.length > 0) {
        area.style.display = 'block';
        btn.textContent = '+ 添加不同版本乐谱 ▼';
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.disabled = false;
    } else if (allVersionsHaveImages && available.length === 0) {
        area.style.display = 'block';
        btn.textContent = '✓ 所有已知版本已添加';
        btn.style.opacity = '0.5';
        btn.disabled = true;
    } else {
        area.style.display = 'none';
    }
}

function getMinAvailableId(catName) {
    const cat = appState.workingSongsData.categories[catName];
    const used = new Set(Object.keys(cat.songs));
    let id = 1;
    while (used.has(String(id).padStart(3, '0'))) id++;
    return String(id).padStart(3, '0');
}

let _fileInputIdCounter = 0;
function nextFileInputId() { return 'fi_' + (++_fileInputIdCounter) + '_' + Date.now(); }

function addVersionUploadBlock(versionName) {
    const container = $('versionUploads');
    const block = document.createElement('div');
    block.className = 'version-upload-block';
    block.dataset.version = versionName;
    const inputId = nextFileInputId();
    block.innerHTML = `
        <div class="version-header">
            <span class="version-name">📁 ${escapeHTML(versionName)}${versionName === '原谱' ? '（默认必选）' : ''}</span>
            ${versionName !== '原谱' ? `<button class="version-delete-btn" data-version="${escapeHTML(versionName)}">🗑️ 删除此版本</button>` : ''}
        </div>
        <div class="image-grid" data-version="${escapeHTML(versionName)}"></div>
        <span class="add-page-btn-wrap">
            <button class="add-page-btn">+ 上传图片</button>
            <input type="file" accept="image/*" class="file-input-hidden" data-version="${escapeHTML(versionName)}" multiple style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:0;">
        </span>
    `;
    container.appendChild(block);

    const fileInput = block.querySelector('.file-input-hidden');
    const uploadBtn = block.querySelector('.add-page-btn');

    uploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });

    // 文件选择
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
            if (!ALLOWED_IMG_TYPES.includes(file.type)) {
                showToast(`不支持的文件格式: ${file.type}，请上传 JPEG/PNG/WebP/BMP`, 'error');
                continue;
            }
            await addImageToVersion(versionName, file);
        }
        e.target.value = '';
    });
    // 删除版本按钮（带确认）
    const delBtn = block.querySelector('.version-delete-btn');
    if (delBtn) {
        delBtn.addEventListener('click', () => {
            showModal(`
                <h3>🗑️ 确认删除版本</h3>
                <p>确定要删除版本「<strong>${escapeHTML(versionName)}</strong>」及其所有图片吗？此操作不可撤销。</p>
                <div class="modal-actions">
                    <button class="btn-cancel" id="modalCancel">取消</button>
                    <button class="btn-save" style="background:var(--danger)" id="modalConfirm">确认删除</button>
                </div>
            `);
            $('modalCancel').onclick = hideModal;
            $('modalConfirm').onclick = () => {
                window._songEditVersions = window._songEditVersions.filter(v => v !== versionName);
                delete window._songEditImages[versionName];
                block.remove();
                updateAddVersionButton();
                hideModal();
                showToast(`版本「${versionName}」已删除`, 'success');
            };
        });
    }
}

async function addImageToVersion(versionName, file) {
    showToast('正在处理图片...', '');
    const result = await imageProcessor.processFile(file);
    if (result.wasCompressed) {
        showToast(`图片已从 ${formatSize(file.size)} 压缩至 ${result.sizeKB}KB`, '');
    }

    // 自动检测裁剪边界
    const bounds = imageProcessor.detectCropBounds(result.img);
    const needsCrop = bounds.left > 5 || bounds.top > 5 ||
                      (bounds.origW - bounds.right) > 5 || (bounds.origH - bounds.bottom) > 5;

    if (needsCrop) {
        // 弹出裁剪界面
        const croppedBase64 = await showCropModal(result.img, bounds);
        if (croppedBase64 === null) {
            // 用户跳过裁剪，使用原图
            storeImageToVersion(versionName, result.base64, result.blob, result.sizeKB);
        } else {
            // 用户确认裁剪，重新压缩
            const croppedImg = await imageProcessor.loadImage(croppedBase64);
            const compressed = await imageProcessor.toJpegBlob(croppedImg);
            const newBase64 = await imageProcessor.blobToBase64(compressed.blob);
            storeImageToVersion(versionName, newBase64, compressed.blob, compressed.sizeKB);
            showToast(`裁剪完成，图片 ${compressed.sizeKB}KB`, 'success');
        }
    } else {
        storeImageToVersion(versionName, result.base64, result.blob, result.sizeKB);
    }
}

function storeImageToVersion(versionName, base64, blob, sizeKB) {
    if (!window._songEditImages[versionName]) window._songEditImages[versionName] = [];
    window._songEditImages[versionName].push(base64);
    renderVersionImageGrid(versionName);
    // 更新添加版本按钮状态
    if (typeof updateAddVersionButton === 'function') updateAddVersionButton();
}

async function loadExistingImagesForEdit(catName, songId, song, versions, editSongRef) {
    const snapshotMap = {};
    for (const version of versions) {
        const images = [];
        const snapImages = [];
        for (let page = 1; page <= song.pages; page++) {
            const base = `${catName}_${songId}_${song.title}`;
            let filename;
            if (version === '原谱') {
                filename = `${base}_${page}.jpeg`;
            } else {
                filename = `${base}_${version}_${page}.jpeg`;
            }
            // 先获取 GitHub 上已发布的原图，作为净零检测的基准
            let remote = null;
            try {
                const url = github.getRawFileUrl(`img/${catName}/${filename}`);
                const resp = await fetch(url);
                if (resp.ok) {
                    const blob = await resp.blob();
                    remote = await imageProcessor.blobToBase64(blob);
                }
            } catch (e) { remote = null; }

            const cached = await idb.getImage(filename);
            if (cached) {
                // 显示本地缓存（可能含未发布的修改）
                images.push(cached.data);
                // 快照以 GitHub 已发布内容为准；远程不可用时回退到缓存
                snapImages.push(remote !== null ? remote : cached.data);
            } else if (remote !== null) {
                images.push(remote);
                snapImages.push(remote);
            } else {
                images.push(null);
                snapImages.push(null);
            }
        }
        window._songEditImages[version] = images;
        snapshotMap[version] = snapImages;
        renderVersionImageGrid(version);
    }
    // 原始快照以 GitHub 已发布图片为基准，避免 IndexedDB 中残留的未发布图片造成“伪无变更”
    const imgSnapshot = {};
    for (const version of versions) {
        imgSnapshot[version] = (snapshotMap[version] || []).slice();
    }
    if (editSongRef) {
        editSongRef._originalImages = imgSnapshot;
    }
    // 加载完成后更新添加版本按钮
    if (typeof updateAddVersionButton === 'function') updateAddVersionButton();
}

function renderVersionImageGrid(versionName) {
    const grid = document.querySelector(`.image-grid[data-version="${CSS.escape(versionName)}"]`);
    if (!grid) return;
    const images = window._songEditImages[versionName] || [];
    grid.innerHTML = images.map((img, idx) => `
        <div class="image-slot filled">
            ${img ? `<img src="data:image/jpeg;base64,${img}" alt="第${idx+1}页" class="uploaded-thumb" data-img="${img}" style="cursor:pointer;">` : '<span style="color:#999;font-size:0.7rem;">加载中...</span>'}
            <div class="slot-label">第${idx+1}页</div>
            <div class="slot-actions">
                <span style="position:relative;flex:1;">
                    <button class="slot-replace-btn" style="width:100%;">替换</button>
                    <input type="file" accept="image/*" class="slot-file-input" data-idx="${idx}" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:0;">
                </span>
                <button class="slot-delete-btn" data-idx="${idx}">删除</button>
            </div>
        </div>
    `).join('');

    // 点击缩略图看大图
    grid.querySelectorAll('.uploaded-thumb').forEach(thumb => {
        thumb.addEventListener('click', (e) => {
            e.stopPropagation();
            const base64 = thumb.dataset.img;
            const overlay = document.createElement('div');
            overlay.className = 'preview-modal';
            overlay.innerHTML = `<button class="preview-close">×</button><img src="data:image/jpeg;base64,${base64}" style="max-width:95vw;max-height:90vh;object-fit:contain;">`;
            overlay.querySelector('.preview-close').onclick = () => overlay.remove();
            overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
            document.body.appendChild(overlay);
        });
    });

    // 替换按钮显式触发对应的文件选择器
    grid.querySelectorAll('.slot-actions').forEach(action => {
        const replaceBtn = action.querySelector('.slot-replace-btn');
        const input = action.querySelector('.slot-file-input');
        if (replaceBtn && input) {
            replaceBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                input.click();
            });
        }
    });

    // 替换文件输入 change 事件
    grid.querySelectorAll('.slot-file-input').forEach(input => {
        input.addEventListener('change', async (ev) => {
            const file = ev.target.files[0];
            const idx = parseInt(input.dataset.idx, 10);
            if (!file || Number.isNaN(idx)) return;
            const result = await imageProcessor.processFile(file);
            if (result.wasCompressed) showToast(`已压缩至 ${result.sizeKB}KB`, '');
            const bounds = imageProcessor.detectCropBounds(result.img);
            const needsCrop = bounds.left > 5 || (bounds.origW - bounds.right) > 5;
            if (needsCrop) {
                const cropped = await showCropModal(result.img, bounds);
                if (cropped !== null) {
                    const cImg = await imageProcessor.loadImage(cropped);
                    const comp = await imageProcessor.toJpegBlob(cImg);
                    window._songEditImages[versionName][idx] = await imageProcessor.blobToBase64(comp.blob);
                } else {
                    window._songEditImages[versionName][idx] = result.base64;
                }
            } else {
                window._songEditImages[versionName][idx] = result.base64;
            }
            renderVersionImageGrid(versionName);
            input.value = '';
        });
    });
    // 删除按钮（带确认）
    grid.querySelectorAll('.slot-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            showModal(`
                <h3>🗑️ 确认删除图片</h3>
                <p>确定要删除「<strong>${escapeHTML(versionName)}</strong>」版本的第 <strong>${idx + 1}</strong> 页图片吗？</p>
                <div class="modal-actions">
                    <button class="btn-cancel" id="modalCancel">取消</button>
                    <button class="btn-save" style="background:var(--danger)" id="modalConfirm">确认删除</button>
                </div>
            `);
            $('modalCancel').onclick = hideModal;
            $('modalConfirm').onclick = () => {
                window._songEditImages[versionName].splice(idx, 1);
                renderVersionImageGrid(versionName);
                hideModal();
                showToast('图片已删除', 'success');
            };
        });
    });
}

// ==================== 图片裁剪弹窗 ====================
function showCropModal(img, autoBounds) {
    return new Promise((resolve) => {
        $('cropModal').style.display = 'flex';
        const canvas = $('cropCanvas');
        const wrapper = canvas.parentElement;
        // 显示尺寸限制
        const maxW = Math.min(window.innerWidth * 0.9, 800);
        const maxH = Math.min(window.innerHeight * 0.5, 500);
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 裁剪边界（在缩放后的坐标系中）
        let bounds = {
            left: Math.round(autoBounds.left * scale),
            top: Math.round(autoBounds.top * scale),
            right: Math.round(autoBounds.right * scale),
            bottom: Math.round(autoBounds.bottom * scale)
        };

        // 手柄定位更新
        function updateHandles() {
            const leftH = $('cropLeftHandle');
            const rightH = $('cropRightHandle');
            const topH = $('cropTopHandle');
            const bottomH = $('cropBottomHandle');
            leftH.style.left = bounds.left + 'px';
            rightH.style.left = bounds.right + 'px';
            topH.style.top = bounds.top + 'px';
            bottomH.style.top = bounds.bottom + 'px';
            $('cropInfo').textContent = `裁剪范围: ${Math.round(bounds.left/scale)}-${Math.round(bounds.right/scale)} × ${Math.round(bounds.top/scale)}-${Math.round(bounds.bottom/scale)} (原图: ${img.width}×${img.height})`;
        }
        updateHandles();

        // 拖拽处理
        function makeDraggable(handleEl, axis) {
            let dragging = false;
            handleEl.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
            handleEl.addEventListener('touchstart', (e) => { dragging = true; e.preventDefault(); });
            const move = (clientX, clientY) => {
                if (!dragging) return;
                const rect = canvas.getBoundingClientRect();
                const x = (clientX - rect.left) * (canvas.width / rect.width);
                const y = (clientY - rect.top) * (canvas.height / rect.height);
                if (axis === 'left') { bounds.left = Math.max(0, Math.min(bounds.right - 10, Math.round(x))); }
                if (axis === 'right') { bounds.right = Math.min(canvas.width, Math.max(bounds.left + 10, Math.round(x))); }
                if (axis === 'top') { bounds.top = Math.max(0, Math.min(bounds.bottom - 10, Math.round(y))); }
                if (axis === 'bottom') { bounds.bottom = Math.min(canvas.height, Math.max(bounds.top + 10, Math.round(y))); }
                updateHandles();
            };
            document.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
            document.addEventListener('touchmove', (e) => move(e.touches[0].clientX, e.touches[0].clientY), { passive: false });
            document.addEventListener('mouseup', () => { dragging = false; });
            document.addEventListener('touchend', () => { dragging = false; });
        }
        makeDraggable($('cropLeftHandle'), 'left');
        makeDraggable($('cropRightHandle'), 'right');
        makeDraggable($('cropTopHandle'), 'top');
        makeDraggable($('cropBottomHandle'), 'bottom');

        // 按钮事件
        $('cropConfirmBtn').onclick = () => {
            $('cropModal').style.display = 'none';
            const croppedCanvas = imageProcessor.cropImage(img, {
                left: Math.round(bounds.left / scale),
                top: Math.round(bounds.top / scale),
                right: Math.round(bounds.right / scale),
                bottom: Math.round(bounds.bottom / scale)
            });
            resolve(croppedCanvas.toDataURL('image/jpeg', 0.92));
        };
        $('cropSkipBtn').onclick = () => {
            $('cropModal').style.display = 'none';
            resolve(null);
        };
        $('cropClose').onclick = () => {
            $('cropModal').style.display = 'none';
            resolve(null);
        };
    });
}

// ==================== 保存歌曲 ====================
async function saveSong() {
    const catName = $('editSongCat').value;
    const songId = $('editSongId').value.trim();
    const rawTitle = $('editSongTitle').value.trim();
    const isDaChangYong = catName === '答唱咏（朱健仁）';

    // 校验
    if (!catName) { showToast('请选择分类', 'error'); return; }
    if (!songId || !/^\d{3}$/.test(songId)) { showToast('编号必须为三位数字（如 001）', 'error'); return; }
    const formattedId = songId;
    if (!rawTitle) { showToast('请输入歌曲标题', 'error'); return; }
    if (ILLEGAL_CHARS.test(rawTitle)) { showToast('标题包含非法字符：\\ / : * ? " < > |', 'error'); return; }

    // 处理答唱咏前缀
    let finalTitle = rawTitle;
    if (isDaChangYong) {
        const subCat = $('editSongSubCat').value;
        const existingPrefix = detectYearPrefix(rawTitle);
        if (subCat !== '通用' && !existingPrefix) {
            finalTitle = subCat + rawTitle;
        }
    }

    // 检查原谱图片
    const originalImages = window._songEditImages['原谱'] || [];
    if (originalImages.length === 0) { showToast('请至少上传原谱版本的图片', 'error'); return; }
    const totalPages = originalImages.length;

    // 检查每个版本都有图片
    for (const v of window._songEditVersions) {
        const imgs = (window._songEditImages[v] || []).filter(i => i !== null && i !== undefined);
        if (imgs.length === 0) {
            showToast(`版本「${v}」尚未上传任何图片，请上传或删除该版本`, 'error');
            return;
        }
        if (imgs.length !== totalPages) {
            showToast(`版本「${v}」的图片数量 (${imgs.length}) 与原谱 (${totalPages}) 不一致`, 'error');
            return;
        }
    }

    // 检查编号冲突
    const oldInfo = appState.currentEditSong;
    const cat = appState.workingSongsData.categories[catName];
    if (cat.songs[formattedId] && !(oldInfo.category === catName && oldInfo.id === formattedId)) {
        showToast(`编号 ${formattedId} 已被「${cat.songs[formattedId].title}」使用`, 'error');
        return;
    }

    // 生成歌曲数据
    const finalVersions = window._songEditVersions.filter(v => v !== '原谱');
    const songData = {
        title: finalTitle,
        pages: totalPages,
        versions: finalVersions.length > 0 ? finalVersions : undefined
    };

    // 如果是编辑且分类变了，从旧分类删除
    if (!appState.currentEditSong.isNew && oldInfo.category !== catName) {
        delete appState.workingSongsData.categories[oldInfo.category].songs[oldInfo.id];
        // 标记旧图片需删除
        const oldBase = `${oldInfo.category}_${oldInfo.id}_${appState.workingSongsData.categories[oldInfo.category]?.songs?.[oldInfo.id]?.title || ''}`;
        appState.imageFileCache.forEach((info, filename) => {
            if (filename.startsWith(oldBase)) {
                appState.pendingImageOps.push({ type: 'delete', filename, oldPath: info.path });
            }
        });
    }

    // 存储歌曲数据
    cat.songs[formattedId] = songData;

    // 如果是编辑且编号变了，删除旧编号
    if (!appState.currentEditSong.isNew && oldInfo.category === catName && oldInfo.id !== formattedId) {
        delete cat.songs[oldInfo.id];
    }

    // 存储图片到 IndexedDB
    const basePrefix = `${catName}_${formattedId}_${finalTitle}`;
    for (const version of window._songEditVersions) {
        const images = window._songEditImages[version] || [];
        for (let i = 0; i < images.length; i++) {
            if (images[i]) {
                let filename;
                if (version === '原谱') {
                    filename = `${basePrefix}_${i + 1}.jpeg`;
                } else {
                    filename = `${basePrefix}_${version}_${i + 1}.jpeg`;
                }
                await idb.putImage(filename, images[i]);
                const existingInfo = appState.imageFileCache.get(filename);
                if (!existingInfo) {
                    appState.pendingImageOps.push({ type: 'add', filename, data: images[i] });
                } else {
                    appState.pendingImageOps.push({ type: 'add', filename, data: images[i], sha: existingInfo.sha });
                }
            }
        }
    }

    // 更新本周歌曲引用（如果分类变了）
    if (!appState.currentEditSong.isNew && oldInfo.category !== catName) {
        appState.workingSongsData.weeklySongs.songs.forEach(s => {
            if (s.category === oldInfo.category && s.id === oldInfo.id) {
                s.category = catName;
                s.id = formattedId;
            }
        });
    }
    if (!appState.currentEditSong.isNew && oldInfo.category === catName && oldInfo.id !== formattedId) {
        appState.workingSongsData.weeklySongs.songs.forEach(s => {
            if (s.category === catName && s.id === oldInfo.id) {
                s.id = formattedId;
            }
        });
    }

    // 等待已有图片加载完成，确保原始图片快照已生成
    if (window._songImagesLoaded) {
        try { await window._songImagesLoaded; } catch (e) { /* 忽略加载错误 */ }
    }

    // 生成变更描述（含前后对比）
    const origData = appState.currentEditSong._originalData;
    const oldSongData = (!appState.currentEditSong.isNew && origData) ? origData : null;
    let changeDesc;
    if (appState.currentEditSong.isNew) {
        changeDesc = `新增歌曲：${catName} #${formattedId}「${finalTitle}」(${totalPages}页)`;
    } else {
        const parts = [];
        const oldCat = oldSongData?.category || oldInfo.category;
        const oldId = oldSongData?.id || oldInfo.id;
        const oldTitle = oldSongData?.title || '';
        const oldPages = oldSongData?.pages || 0;
        if (oldCat !== catName) parts.push(`分类: ${oldCat} → ${catName}`);
        if (oldId !== formattedId) parts.push(`编号: #${oldId} → #${formattedId}`);
        if (oldTitle !== finalTitle) parts.push(`歌名: 「${oldTitle}」 → 「${finalTitle}」`);
        if (oldPages !== totalPages) parts.push(`页数: ${oldPages} → ${totalPages}`);
        // 检测图片变更
        const imgChanges = [];
        for (const v of window._songEditVersions) {
            const newImgs = window._songEditImages[v] || [];
            const oldImgs = oldSongData?.versions?.includes(v) ? [] : []; // 新版本
            if (!oldSongData?.versions?.includes(v) && v !== '原谱') {
                imgChanges.push(`新增版本「${v}」(${newImgs.length}页)`);
            }
        }
        if (oldSongData?.versions) {
            for (const ov of oldSongData.versions) {
                if (!window._songEditVersions.includes(ov)) {
                    imgChanges.push(`删除版本「${ov}」`);
                }
            }
        }
        // 检测同版本同位置的图片替换
        const origImgSnapDesc = appState.currentEditSong._originalImages;
        if (origImgSnapDesc) {
            let replacedCount = 0;
            for (const v of Object.keys(origImgSnapDesc)) {
                const cur = (window._songEditImages[v] || []).filter(i => i !== null && i !== undefined);
                const orig = (origImgSnapDesc[v] || []).filter(i => i !== null && i !== undefined);
                const n = Math.max(cur.length, orig.length);
                for (let i = 0; i < n; i++) {
                    if (cur[i] !== orig[i]) replacedCount++;
                }
            }
            if (replacedCount > 0) imgChanges.push(`替换图片 ${replacedCount} 张`);
        }
        if (parts.length === 0 && imgChanges.length === 0) {
            parts.push('无实质性变更');
        }
        changeDesc = `编辑歌曲：${catName} #${formattedId}「${finalTitle}」` +
            (parts.length > 0 ? ` (${parts.join('; ')})` : '') +
            (imgChanges.length > 0 ? ` [图片: ${imgChanges.join(', ')}]` : '');
    }

    // 使用会话内稳定 ID 作为 dedupKey
    const songDedupKey = appState.currentEditSong._sessionId
        || `song:${catName}:${formattedId}`;

    console.log('[DEBUG] saveSong dedupKey', { songDedupKey, oldSongData: oldSongData?.category, catName, formattedId });

    addPendingChange(
        appState.currentEditSong.isNew ? 'add' : 'modify',
        changeDesc,
        null,
        songDedupKey
    );

    // 图片与原始快照对比（快照基于 GitHub 已发布原图）
    const origImgSnap = appState.currentEditSong._originalImages;
    let imagesIdentical = true;
    let imgDiffCount = 0;
    if (origImgSnap) {
        const allVersions = new Set([...window._songEditVersions, ...Object.keys(origImgSnap)]);
        for (const v of allVersions) {
            const cur = (window._songEditImages[v] || []).filter(i => i !== null && i !== undefined);
            const orig = (origImgSnap[v] || []).filter(i => i !== null && i !== undefined);
            const n = Math.max(cur.length, orig.length);
            let diff = Math.abs(cur.length - orig.length);
            for (let i = 0; i < n; i++) {
                if (cur[i] !== orig[i]) diff++;
            }
            if (diff > 0) imagesIdentical = false;
            imgDiffCount += diff;
        }
    } else {
        imagesIdentical = false;
        if (oldSongData) console.warn('[DEBUG] 原始图片快照缺失，按有变更处理');
    }

    // 净零检测：如果编辑后与原数据完全一致，移除待发布记录和图片操作
    console.log('[DEBUG] netZero check', {
        isNew: appState.currentEditSong.isNew,
        hasOldData: !!oldSongData,
        origCat: oldSongData?.category,
        origId: oldSongData?.id,
        catName, formattedId,
        origTitle: oldSongData?.title, finalTitle,
        origPages: oldSongData?.pages, totalPages,
        hasImgSnap: !!origImgSnap,
        imagesIdentical,
        imgDiffCount
    });
    if (!appState.currentEditSong.isNew && oldSongData) {
        const origCat = oldSongData.category;
        const origId = appState.currentEditSong.id;
        const newSong = cat.songs[formattedId];
        const isIdentical =
            origCat === catName &&
            origId === formattedId &&
            oldSongData.title === finalTitle &&
            oldSongData.pages === totalPages &&
            JSON.stringify((oldSongData.versions || []).sort()) === JSON.stringify((newSong.versions || []).sort()) &&
            imagesIdentical;
        if (isIdentical) {
            // 清除此歌曲的所有图片操作和待发布记录
            const imgPrefixes = [catName, oldInfo.category].filter(Boolean).map(c => `${c}_${formattedId}_`);
            appState.pendingImageOps = appState.pendingImageOps.filter(
                op => !op.filename || !imgPrefixes.some(p => op.filename.startsWith(p))
            );
            appState.pendingChanges = appState.pendingChanges.filter(c => c._dedupKey !== songDedupKey);
            updatePendingUI();
            idb.putState('pending_changes', appState.pendingChanges).catch(() => {});
            idb.putState('pending_image_ops', appState.pendingImageOps).catch(() => {});
            showToast('未检测到实际变更，已自动清除待发布记录', '');
            renderSongList(catName);
            return;
        }
    }

    showToast(`歌曲已${appState.currentEditSong.isNew ? '新增' : '保存'}（待发布）`, 'success');
    renderSongList(catName);
}

// ==================== 删除歌曲 ====================
function showDeleteSongModal(catName, songId) {
    const cat = appState.workingSongsData.categories[catName];
    const song = cat.songs[songId];
    showModal(`
        <h3>🗑️ 确认删除歌曲</h3>
        <p>确定要删除「<strong>${escapeHTML(catName)} #${escapeHTML(songId)} ${escapeHTML(song.title)}</strong>」吗？</p>
        <p style="font-size:0.85rem;color:var(--danger);">此操作将删除该歌曲的所有版本图片文件，不可恢复。</p>
        <div class="modal-actions">
            <button class="btn-cancel" id="modalCancel">取消</button>
            <button class="btn-save" style="background:var(--danger)" id="modalConfirm">确认删除</button>
        </div>
    `);
    $('modalCancel').onclick = hideModal;
    $('modalConfirm').onclick = () => {
        delete cat.songs[songId];
        // 标记删除图片
        const basePrefix = `${catName}_${songId}_${song.title}`;
        appState.imageFileCache.forEach((info, filename) => {
            if (filename.startsWith(basePrefix) || filename.startsWith(catName + '_' + songId + '_')) {
                appState.pendingImageOps.push({ type: 'delete', filename, oldPath: info.path });
            }
        });
        // 从本周歌曲中移除
        appState.workingSongsData.weeklySongs.songs = appState.workingSongsData.weeklySongs.songs.filter(
            s => !(s.category === catName && s.id === songId)
        );
        // 净零检测：若删除的歌曲是本次会话新增的，直接取消
        const origSong = appState.originalSongsData?.categories?.[catName]?.songs?.[songId];
        if (!origSong) {
            delete appState.workingSongsData.categories[catName].songs[songId];
            appState.pendingChanges = appState.pendingChanges.filter(c => c._dedupKey !== `song:delete:${catName}:${songId}`);
            updatePendingUI();
            idb.putState('pending_changes', appState.pendingChanges).catch(() => {});
            hideModal();
            renderSongList(catName);
            showToast('歌曲未实际创建过，已直接移除', '');
        } else {
            delete appState.workingSongsData.categories[catName].songs[songId];
            addPendingChange('delete', `删除歌曲：${catName} #${songId}「${song.title}」`, null, `song:delete:${catName}:${songId}`);
            hideModal();
            renderSongList(catName);
            showToast('歌曲已删除（待发布）', 'success');
        }
    };
}

// ==================== 重整编号 ====================
function renumberCategory(catName) {
    const cat = appState.workingSongsData.categories[catName];
    const entries = Object.entries(cat.songs).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    const newSongs = {};
    const renames = [];
    entries.forEach(([oldId, song], idx) => {
        const newId = String(idx + 1).padStart(3, '0');
        newSongs[newId] = song;
        if (oldId !== newId) {
            renames.push({ oldId, newId, title: song.title });
        }
    });
    if (renames.length === 0) { showToast('编号已是连续的，无需重整', ''); return; }

    showModal(`
        <h3>重整编号</h3>
        <p>将对「<strong>${escapeHTML(catName)}</strong>」下的歌曲重新编号：</p>
        <div class="modal-detail">${renames.map(r => `#${r.oldId} → #${r.newId}「${escapeHTML(r.title)}」`).join('<br>')}</div>
        <p style="font-size:0.82rem;color:var(--warning);">⚠️ 将重命名所有相关图片文件并更新本周歌曲引用</p>
        <div class="modal-actions">
            <button class="btn-cancel" id="modalCancel">取消</button>
            <button class="btn-save" id="modalConfirm">确认重整</button>
        </div>
    `);
    $('modalCancel').onclick = hideModal;
    $('modalConfirm').onclick = async () => {
        cat.songs = newSongs;
        // 更新本周歌曲引用
        const idMap = {};
        renames.forEach(r => { idMap[r.oldId] = r.newId; });
        appState.workingSongsData.weeklySongs.songs.forEach(s => {
            if (s.category === catName && idMap[s.id]) s.id = idMap[s.id];
        });
        addPendingChange('modify', `重整编号：${catName}`, `重排 ${renames.length} 首歌曲编号`, `renumber:${catName}`);
        // 净零检测：对比重整后是否与原始编号一致
        const origSongs = appState.originalSongsData?.categories?.[catName]?.songs || {};
        const curSongs2 = appState.workingSongsData.categories[catName].songs;
        const origIds = Object.keys(origSongs).sort();
        const curIds = Object.keys(curSongs2).sort();
        const sameIds = origIds.length === curIds.length && origIds.every((id, i) => id === curIds[i]);
        let sameTitles = true;
        if (sameIds) {
            for (const id of origIds) {
                if (origSongs[id]?.title !== curSongs2[id]?.title) { sameTitles = false; break; }
            }
        }
        if (sameIds && sameTitles) {
            appState.pendingChanges = appState.pendingChanges.filter(c => c._dedupKey !== `renumber:${catName}`);
            updatePendingUI();
            idb.putState('pending_changes', appState.pendingChanges).catch(() => {});
            showToast('编号与原始一致，无需发布', '');
        } else {
            showToast('编号重整完成（待发布）', 'success');
        }
        hideModal();
        renderSongList(catName);
    };
}

// ==================== 本周歌曲编辑 ====================
function renderWeeklyEditor() {
    const ws = appState.workingSongsData.weeklySongs;
    window._weeklySnapshot = JSON.stringify(ws);
    $('weeklyContainer').innerHTML = `
        <div style="margin-bottom:16px;">
            <button class="btn-save" id="weeklySave" style="width:100%;padding:12px;border-radius:8px;font-size:0.95rem;" disabled>💾 保存修改</button>
        </div>
        <div class="weekly-date-row">
            <label>📅 适用日期</label>
            <div style="flex:1;display:flex;align-items:center;">
                <input type="text" id="weeklyDate" value="${ws.updateDate}" placeholder="2026/08/09" pattern="\\d{4}/\\d{2}/\\d{2}" style="flex:1;cursor:pointer;" title="点击选择日期" readonly>
                <input type="date" id="weeklyDateHidden" style="position:absolute;width:0;height:0;opacity:0;pointer-events:none;" tabindex="-1">
            </div>
        </div>
        <div class="weekly-section-title" id="weeklySongCountTitle">📋 已选歌曲（${ws.songs.length}首，拖拽排序）</div>
        <div class="selected-songs" id="selectedSongsList"></div>
        <div class="weekly-section-title">➕ 添加歌曲</div>
        <input class="song-selector-search" id="weeklySearch" placeholder="🔍 搜索歌曲...">
        <div id="weeklySongSelector"></div>
    `;

    renderSelectedSongs();
    renderWeeklySongSelector('');

    const weeklySaveBtn2 = $('weeklySave');
    const weeklyDateEl2 = $('weeklyDate');

    // 初始化完成后重取快照
    window._weeklySnapshot = JSON.stringify(appState.workingSongsData.weeklySongs);

    // 变更检测
    window._checkWeeklyChanged = () => {
        const cur = JSON.stringify(appState.workingSongsData.weeklySongs);
        const dateChg = weeklyDateEl2.value !== ws.updateDate;
        weeklySaveBtn2.disabled = !(cur !== window._weeklySnapshot || dateChg);
    };
    window._checkWeeklyChanged();

    // 离开确认（取消按钮 + 顶部返回按钮共用）
    const confirmLeaveWeekly = () => {
        if (weeklySaveBtn2.disabled) { switchSubView('dashboard'); renderDashboard(); return; }
        showModal(`
            <h3>⚠️ 未保存的更改</h3>
            <p>本周歌曲有未保存的修改，是否放弃？</p>
            <div class="modal-actions">
                <button class="btn-cancel" id="modalWeeklyStay">继续编辑</button>
                <button class="btn-save" style="background:var(--danger)" id="modalWeeklyDiscard">放弃更改</button>
            </div>
        `);
        $('modalWeeklyStay').onclick = hideModal;
        $('modalWeeklyDiscard').onclick = () => {
            appState.workingSongsData.weeklySongs = JSON.parse(window._weeklySnapshot);
            hideModal();
            switchSubView('dashboard');
            renderDashboard();
        };
    };

    $('weeklySearch').addEventListener('input', (e) => {
        // 搜索时取消替换模式
        if (cancelReplaceMode()) showToast('已取消替换模式', '');
        renderWeeklySongSelector(e.target.value.trim().toLowerCase());
    });
    $('weeklySearch').addEventListener('focus', () => {
        if (cancelReplaceMode()) { showToast('已取消替换模式', ''); renderWeeklySongSelector(''); }
    });
    // 顶部返回按钮也拦截
    const weeklyBackBtn = document.getElementById('weeklyBackBtn');
    if (weeklyBackBtn) weeklyBackBtn.onclick = (e) => { e.preventDefault(); confirmLeaveWeekly(); };
    $('weeklySave').onclick = saveWeeklySongs;

    // 日期选择器：点击文本框弹出日期选择器
    const dateHidden = $('weeklyDateHidden');
    const dateText = $('weeklyDate');
    if (dateHidden && dateText) {
        dateText.addEventListener('click', () => {
            if (cancelReplaceMode()) { showToast('已取消替换模式', ''); renderWeeklySongSelector(''); }
            if (dateText.value && /^\d{4}\/\d{2}\/\d{2}$/.test(dateText.value)) {
                dateHidden.value = dateText.value.replace(/\//g, '-');
            }
            if (dateHidden.showPicker) {
                dateHidden.showPicker();
            } else {
                dateHidden.focus();
                dateHidden.click();
            }
        });
        dateHidden.addEventListener('change', () => {
            if (dateHidden.value) {
                dateText.value = dateHidden.value.replace(/-/g, '/');
                if (window._checkWeeklyChanged) window._checkWeeklyChanged();
            }
        });
    }

    switchSubView('weekly');
}

function renderSelectedSongs() {
    const ws = appState.workingSongsData.weeklySongs;
    const list = $('selectedSongsList');
    // 同步标题中的歌曲数量
    const countTitle = $('weeklySongCountTitle');
    if (countTitle) countTitle.textContent = `📋 已选歌曲（${ws.songs.length}首，拖拽排序）`;
    list.innerHTML = ws.songs.map((s, idx) => {
        const cat = appState.workingSongsData.categories[s.category];
        const song = cat ? cat.songs[s.id] : null;
        const title = song ? song.title : '(歌曲不存在)';
        return `<div class="selected-song-item" data-index="${idx}">
            <span class="drag-handle">≡</span>
            <div class="song-info">
                <div class="song-cat">${escapeHTML(s.category)} #${escapeHTML(s.id)}</div>
                <div class="song-name">${escapeHTML(title)}</div>
            </div>
            <div class="song-actions">
                <button class="preview-btn" data-cat="${escapeHTML(s.category)}" data-id="${escapeHTML(s.id)}">👁️</button>
                <button class="replace-btn" data-index="${idx}" data-cat="${escapeHTML(s.category)}" title="更换歌曲">🔄</button>
                <button class="remove-btn" data-index="${idx}">✕</button>
            </div>
        </div>`;
    }).join('');
    if (ws.songs.length === 0) {
        list.innerHTML = '<div class="empty-msg">尚未添加歌曲</div>';
    }

    // 预览按钮
    list.querySelectorAll('.preview-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (cancelReplaceMode()) { showToast('已取消替换模式', ''); renderWeeklySongSelector(''); }
            previewSong(btn.dataset.cat, btn.dataset.id);
        });
    });
    // 移除按钮
    list.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (cancelReplaceMode()) showToast('已取消替换模式', '');
            const idx = parseInt(btn.dataset.index);
            appState.workingSongsData.weeklySongs.songs.splice(idx, 1);
            renderSelectedSongs();
            renderWeeklySongSelector($('weeklySearch').value.trim().toLowerCase());
            if (window._checkWeeklyChanged) window._checkWeeklyChanged();
        });
    });
    // 更换按钮：滚动到指定分类并高亮
    list.querySelectorAll('.replace-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            const targetCat = btn.dataset.cat;
            const targetId = appState.workingSongsData.weeklySongs.songs[idx].id;
            // 清空搜索框
            const searchInput = $('weeklySearch');
            searchInput.value = '';
            // 存储替换目标
            window._replaceTargetIndex = idx;
            window._replaceTargetCat = targetCat;
            window._replaceTargetId = targetId;
            // 重新渲染选择器
            renderWeeklySongSelector('', targetCat, targetId);
            // 滚动到对应分类（减去导航高度避免被遮挡）
            setTimeout(() => {
                const catHeaders = $('weeklySongSelector').querySelectorAll('.song-selector-cat-header');
                for (const header of catHeaders) {
                    if (header.textContent.includes(targetCat)) {
                        const body = header.nextElementSibling;
                        const arrow = header.querySelector('.arrow');
                        if (body && !body.classList.contains('open')) {
                            body.classList.add('open');
                            if (arrow) arrow.classList.add('open');
                        }
                        const top = header.getBoundingClientRect().top + window.pageYOffset - 120;
                        window.scrollTo({ top, behavior: 'smooth' });
                        header.style.background = '#fef9e7';
                        header.style.transition = 'background 0.3s';
                        setTimeout(() => { header.style.background = ''; }, 1500);
                        break;
                    }
                }
                showToast(`请从「${targetCat}」中选择替换歌曲，点击 🔄 即可替换`, '');
            }, 100);
        });
    });

    // 拖拽排序（SortableJS）
    if (window.Sortable && list.children.length > 0) {
        if (list._sortable) list._sortable.destroy();
        list._sortable = new Sortable(list, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            onStart: function() {
                if (cancelReplaceMode()) { showToast('已取消替换模式', ''); renderWeeklySongSelector(''); }
            },
            onEnd: function(evt) {
                const songs = appState.workingSongsData.weeklySongs.songs;
                const [moved] = songs.splice(evt.oldIndex, 1);
                songs.splice(evt.newIndex, 0, moved);
                renderSelectedSongs();
                if (window._checkWeeklyChanged) window._checkWeeklyChanged();
            }
        });
    }
}

function cancelReplaceMode() {
    if (window._replaceTargetIndex !== undefined) {
        delete window._replaceTargetIndex;
        delete window._replaceTargetCat;
        delete window._replaceTargetId;
        return true;
    }
    return false;
}

function renderWeeklySongSelector(query, replaceCat, replaceTargetId) {
    const container = $('weeklySongSelector');
    const data = appState.workingSongsData;
    const ws = data.weeklySongs;
    const catNames = Object.keys(data.categories);
    let html = '';
    catNames.forEach(catName => {
        const cat = data.categories[catName];
        const songs = Object.entries(cat.songs);
        const filteredSongs = query ? songs.filter(([id, song]) =>
            song.title.toLowerCase().includes(query) ||
            id.includes(query) ||
            catName.toLowerCase().includes(query)
        ) : songs;
        if (filteredSongs.length === 0) return;
        const isDaChangYong = catName === '答唱咏（朱健仁）';
        html += `<div class="song-selector-cat">
            <div class="song-selector-cat-header" data-cat="${escapeHTML(catName)}">
                <span>📁 ${escapeHTML(catName)} (${filteredSongs.length})</span>
                <span class="arrow">▶</span>
            </div>
            <div class="song-selector-cat-body">`;
        if (isDaChangYong) {
            const groups = { '通用': [], '甲年': [], '乙年': [], '丙年': [] };
            filteredSongs.forEach(([id, song]) => {
                const prefix = detectYearPrefix(song.title);
                const group = prefix || '通用';
                if (groups[group]) groups[group].push([id, song]);
            });
            for (const [subName, subSongs] of Object.entries(groups)) {
                if (subSongs.length === 0) continue;
                html += `<div class="song-selector-cat" style="margin-left:12px;">
                    <div class="song-selector-cat-header" style="font-size:0.82rem;background:#fdf8f0;" data-cat="${escapeHTML(catName)}" data-sub="${escapeHTML(subName)}">
                        <span>📂 ${escapeHTML(subName)} (${subSongs.length})</span>
                        <span class="arrow">▶</span>
                    </div>
                    <div class="song-selector-cat-body">`;
                subSongs.forEach(([id, song]) => {
                    const isReplaceTarget = (replaceCat === catName) && (id === replaceTargetId);
                    const isAdded = !isReplaceTarget && (replaceCat !== catName) && ws.songs.some(s => s.category === catName && s.id === id);
                    html += `<div class="song-selector-song">
                        <span>#${escapeHTML(id)} ${escapeHTML(song.title)}</span>
                        <span style="display:flex;gap:8px;">
                            <button class="small-btn preview-btn" data-cat="${escapeHTML(catName)}" data-id="${escapeHTML(id)}">👁️</button>
                            ${isReplaceTarget || isAdded ? '<span style="color:var(--success);font-weight:700;padding:4px 8px;">✓</span>' : (replaceCat === catName) ? `<button class="add-icon add-to-weekly replace-mode-btn" data-cat="${escapeHTML(catName)}" data-id="${escapeHTML(id)}" title="点击替换">🔄</button>` : `<button class="add-icon add-to-weekly" data-cat="${escapeHTML(catName)}" data-id="${escapeHTML(id)}">＋</button>`}
                        </span>
                    </div>`;
                });
                html += `</div></div>`;
            }
        } else {
            filteredSongs.forEach(([id, song]) => {
                const isReplaceTarget = (replaceCat === catName) && (id === replaceTargetId);
                const isAdded = !isReplaceTarget && (replaceCat !== catName) && ws.songs.some(s => s.category === catName && s.id === id);
                html += `<div class="song-selector-song">
                    <span>#${escapeHTML(id)} ${escapeHTML(song.title)}</span>
                    <span style="display:flex;gap:8px;">
                        <button class="small-btn preview-btn" data-cat="${escapeHTML(catName)}" data-id="${escapeHTML(id)}">👁️</button>
                        ${isReplaceTarget || isAdded ? '<span style="color:var(--success);font-weight:700;padding:4px 8px;">✓</span>' : (replaceCat === catName) ? `<button class="add-icon add-to-weekly replace-mode-btn" data-cat="${escapeHTML(catName)}" data-id="${escapeHTML(id)}" title="点击替换">🔄</button>` : `<button class="add-icon add-to-weekly" data-cat="${escapeHTML(catName)}" data-id="${escapeHTML(id)}">＋</button>`}
                    </span>
                </div>`;
            });
        }
        html += `</div></div>`;
    });
    container.innerHTML = html || '<div class="empty-msg">没有匹配的歌曲</div>';

    // 折叠展开（点击任意分类头时取消替换模式）
    container.querySelectorAll('.song-selector-cat-header').forEach(header => {
        header.addEventListener('click', () => {
            // 如果处于替换模式，就地取消替换（不整页重渲染，避免跳动）
            if (cancelReplaceMode()) {
                const ws = appState.workingSongsData.weeklySongs;
                // 🔄 按钮就地还原：已在列表的显示 ✓，否则显示 ＋
                container.querySelectorAll('.replace-mode-btn').forEach(b => {
                    const inList = ws.songs.some(s => s.category === b.dataset.cat && s.id === b.dataset.id);
                    b.classList.remove('replace-mode-btn');
                    if (inList) {
                        b.outerHTML = '<span style="color:var(--success);font-weight:700;padding:4px 8px;">✓</span>';
                    } else {
                        b.textContent = '＋';
                        b.removeAttribute('title');
                    }
                });
                showToast('已取消替换模式', '');
            }
            // 正常折叠展开（与普通模式一致，不会跳动）
            const body = header.nextElementSibling;
            const arrow = header.querySelector('.arrow');
            body.classList.toggle('open');
            arrow.classList.toggle('open');
        });
    });
    // 添加到本周（或替换）
    container.querySelectorAll('.add-to-weekly').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cat = btn.dataset.cat;
            const id = btn.dataset.id;
            const ws = appState.workingSongsData.weeklySongs;
            // 如果是替换模式
            if (window._replaceTargetIndex !== undefined && window._replaceTargetCat === cat) {
                const catSong = appState.workingSongsData.categories[cat];
                const songTitle = catSong && catSong.songs[id] ? catSong.songs[id].title : '';
                const oldSong = ws.songs[window._replaceTargetIndex];
                if (oldSong && oldSong.id === id) {
                    showToast('未更换：选择了同一首歌曲', '');
                    return;
                }
                ws.songs[window._replaceTargetIndex] = { category: cat, id };
                delete window._replaceTargetIndex;
                delete window._replaceTargetCat;
                delete window._replaceTargetId;
                renderSelectedSongs();
                renderWeeklySongSelector($('weeklySearch').value.trim().toLowerCase());
                showToast(`已替换为：${cat} #${id}「${songTitle}」`, 'success');
                if (window._checkWeeklyChanged) window._checkWeeklyChanged();
                // 滚动回页面顶部
                setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 100);
                return;
            }
            // 正常添加模式
            if (ws.songs.some(s => s.category === cat && s.id === id)) {
                showToast('该歌曲已在列表中', '');
                return;
            }
            const catSong = appState.workingSongsData.categories[cat];
            const songTitle = catSong && catSong.songs[id] ? catSong.songs[id].title : '';
            ws.songs.push({ category: cat, id });
            renderSelectedSongs();
            renderWeeklySongSelector($('weeklySearch').value.trim().toLowerCase());
            showToast(`已添加：${cat} #${id}「${songTitle}」`, 'success');
            if (window._checkWeeklyChanged) window._checkWeeklyChanged();
        });
    });
    // 预览
    container.querySelectorAll('.preview-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            previewSong(btn.dataset.cat, btn.dataset.id);
        });
    });
}

function saveWeeklySongs() {
    const dateVal = $('weeklyDate').value.trim();
    if (!dateVal) { showToast('请输入适用日期', 'error'); return; }
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dateVal)) { showToast('日期格式错误，应为 yyyy/mm/dd，如 2026/08/09', 'error'); return; }
    appState.workingSongsData.weeklySongs.updateDate = dateVal;
    window._weeklySnapshot = JSON.stringify(appState.workingSongsData.weeklySongs);
    const saveBtn = $('weeklySave');
    if (saveBtn) saveBtn.disabled = true;

    // 净零检测：与原始数据一致则自动清除
    const origWeekly = appState.originalSongsData?.weeklySongs;
    const curWeekly = appState.workingSongsData.weeklySongs;
    const isIdentical = origWeekly &&
        origWeekly.updateDate === curWeekly.updateDate &&
        origWeekly.songs.length === curWeekly.songs.length &&
        origWeekly.songs.every((s, i) =>
            s.category === curWeekly.songs[i].category && s.id === curWeekly.songs[i].id
        );

    addPendingChange('weekly', `修改本周歌曲（${dateVal}，${curWeekly.songs.length}首）`, null, 'weekly');

    if (isIdentical) {
        appState.pendingChanges = appState.pendingChanges.filter(c => c._dedupKey !== 'weekly');
        updatePendingUI();
        idb.putState('pending_changes', appState.pendingChanges).catch(() => {});
        showToast('本周歌曲与原始一致，无需发布', '');
    } else {
        showToast('本周歌曲已保存（待发布）', 'success');
    }
}

// ==================== 网站设置 ====================
function renderSettings() {
    $('settingsContainer').innerHTML = `
        <div class="setting-item">
            <div class="setting-item-left">
                <div class="setting-item-label">🎄 圣诞主题</div>
                <div class="setting-item-desc">开启后网站显示雪花、圣诞树等装饰元素</div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="christmasToggle" ${appState.christmasTheme ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div class="setting-item">
            <div class="setting-item-left">
                <div class="setting-item-label">🔙 发布回滚</div>
                <div class="setting-item-desc" id="rollbackInfo">回滚到上一次发布的版本</div>
            </div>
            <button class="small-btn" id="rollbackBtn" style="background:var(--danger);color:#fff;">回滚</button>
        </div>
    `;

    $('christmasToggle').addEventListener('change', () => {
        appState.christmasTheme = $('christmasToggle').checked;
        const dedupKey = 'settings:christmas';
        addPendingChange('settings', appState.christmasTheme ? '开启圣诞主题' : '关闭圣诞主题', null, dedupKey);
        // 净零检测：若与原始状态一致则自动清除
        const origTheme = appState.originalIndexHtml.includes('class="christmas-theme"') ||
                          appState.originalIndexHtml.includes("class='christmas-theme'");
        if (appState.christmasTheme === origTheme) {
            appState.pendingChanges = appState.pendingChanges.filter(c => c._dedupKey !== dedupKey);
            updatePendingUI();
            idb.putState('pending_changes', appState.pendingChanges).catch(() => {});
            showToast('主题与原始设置一致，无需发布', '');
        } else {
            showToast('设置已保存（待发布）', 'success');
        }
    });

    $('rollbackBtn').addEventListener('click', showRollbackModal);

    switchSubView('settings');
}

function showRollbackModal() {
    if (!appState.lastCommitSha) {
        showToast('没有可回滚的发布记录', 'error');
        return;
    }
    showModal(`
        <h3>🔙 回滚确认</h3>
        <p>确定要回滚到上一个版本吗？</p>
        <p style="font-size:0.85rem;">上次发布: ${escapeHTML(appState.lastCommitMessage || '未知')}</p>
        <p style="color:var(--danger);font-size:0.85rem;">⚠️ 此操作将撤销最近一次发布的所有更改</p>
        <div class="modal-actions">
            <button class="btn-cancel" id="modalCancel">取消</button>
            <button class="btn-save" style="background:var(--danger)" id="modalConfirm">确认回滚</button>
        </div>
    `);
    $('modalCancel').onclick = hideModal;
    $('modalConfirm').onclick = async () => {
        try {
            showToast('正在回滚...', '');
            // 安全检查：确认要回滚的提交确实是当前分支 HEAD
            const branchData = await github.request('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`);
            const headSha = branchData && branchData.object ? branchData.object.sha : '';
            if (headSha && headSha !== appState.lastCommitSha) {
                // 本地记录不是远程 HEAD，说明期间有其他提交，禁止误删
                await idb.putState('last_commit', {
                    sha: headSha,
                    message: '远程最新版本',
                    time: new Date().toLocaleString()
                }).catch(() => {});
                appState.lastCommitSha = headSha;
                appState.lastCommitMessage = '远程最新版本';
                appState.lastCommitTime = new Date().toLocaleString('zh-CN', { hour12: false });
                hideModal();
                showToast('检测到远程有新提交，已同步记录，请刷新后重试', 'error');
                return;
            }
            // 获取上一个 commit
            const commitData = await github.request('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${appState.lastCommitSha}`);
            const parentSha = commitData.parents[0]?.sha;
            if (!parentSha) { showToast('没有更早的版本可回滚', 'error'); hideModal(); return; }
            // 强制更新 ref 到 parent commit
            await github.request('PATCH', `/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`, {
                sha: parentSha,
                force: true
            });
            await idb.putState('last_commit', { sha: parentSha, message: '回滚操作', time: new Date().toLocaleString() });
            clearPendingChanges();
            appState.lastCommitSha = parentSha;
            appState.lastCommitMessage = '回滚操作';
            appState.lastCommitTime = new Date().toLocaleString('zh-CN', { hour12: false });
            hideModal();
            showToast('回滚成功，请刷新页面重新加载数据', 'success');
            setTimeout(() => location.reload(), 1500);
        } catch (e) {
            showToast('回滚失败: ' + e.message, 'error');
            hideModal();
        }
    };
}

// ==================== 一键发布 ====================
async function doPublish() {
    if (appState.pendingChanges.length === 0) {
        showToast('没有待发布的更改', '');
        return;
    }

    const newVersion = nowTimestamp();

    // 自动生成 commit 信息
    const changeLines = appState.pendingChanges.map(c => `• [${c.type}] ${c.description}`).join('\n');
    const imgAdds = appState.pendingImageOps.filter(op => op.type === 'add').length;
    const imgDels = appState.pendingImageOps.filter(op => op.type === 'delete').length;
    const imgFiles = appState.pendingImageOps.map(op => {
        const prefix = op.type === 'add' ? '[新增]' : '[删除]';
        return `  ${prefix} img/${op.filename}`;
    }).filter(Boolean);
    const hasImgChanges = imgAdds > 0 || imgDels > 0;
    const autoCommitMsg = [
        `数据变更 (${newVersion})`,
        changeLines || '  无',
        hasImgChanges ? `图片: ${imgAdds}新增/${imgDels}删除` : null,
        `涉及文件:`,
        `  [修改] data/songs.json`,
        `  [修改] assets/js/script.js`,
        `  [修改] index.html`,
        ...imgFiles
    ].filter(Boolean).join('\n');

    showModal(`
        <h3>🚀 确认发布</h3>
        <div class="modal-detail" style="max-height:200px;overflow-y:auto;white-space:pre-wrap;font-size:0.8rem;background:#f8f8f8;padding:10px;border-radius:6px;margin-bottom:12px;">${escapeHTML(autoCommitMsg)}</div>
        <label>备注（选填）</label>
        <input class="form-input-inline" id="publishCommitMsg" value="" placeholder="附加说明会添加到 commit 信息开头">
        <p style="font-size:0.78rem;color:var(--warning);margin-top:8px;">⚠️ 发布后网站将在约 2 分钟内自动更新</p>
        <div class="modal-actions">
            <button class="btn-cancel" id="modalCancel">取消</button>
            <button class="btn-save" id="modalConfirm" style="background:var(--success)">🚀 确认发布</button>
        </div>
    `);
    $('modalCancel').onclick = hideModal;
    $('modalConfirm').onclick = async () => {
        const note = $('publishCommitMsg').value.trim();
        const commitMsg = note ? `${note}\n\n${autoCommitMsg}` : autoCommitMsg;
        hideModal();
        await executePublish(commitMsg, newVersion);
    };
}

async function executePublish(commitMsg, newVersion) {
    showToast('正在发布...', '');
    $('publishBtn').disabled = true;
    try {
        // 1. 检测冲突：重新拉取 GitHub 上的 data/songs.json
        const latestSongs = await github.getFile('data/songs.json');
        if (latestSongs && latestSongs.content) {
            const latestData = JSON.parse(latestSongs.content);
            const origStr = JSON.stringify(appState.originalSongsData);
            const latestStr = JSON.stringify(latestData);
            if (origStr !== latestStr) {
                // GitHub 上的数据已发生变化
                showModal(`
                    <h3>⚠️ 检测到冲突</h3>
                    <p>自您上次加载数据以来，GitHub 上的 data/songs.json 已被修改。</p>
                    <p style="font-size:0.85rem;">这可能是因为您在另一台设备上进行了发布。</p>
                    <p style="color:var(--warning);">选择「强制覆盖」将用您的更改覆盖远程版本。</p>
                    <div class="modal-actions">
                        <button class="btn-cancel" id="modalConflictCancel">取消发布</button>
                        <button class="btn-save" style="background:var(--danger)" id="modalConflictForce">强制覆盖</button>
                    </div>
                `);
                $('modalConflictCancel').onclick = () => { hideModal(); $('publishBtn').disabled = false; };
                $('modalConflictForce').onclick = async () => {
                    hideModal();
                    await doActualPublish(commitMsg, newVersion, latestSongs.sha);
                };
                return;
            }
        }

        await doActualPublish(commitMsg, newVersion, appState.originalSongsJsonSha);
    } catch (e) {
        showToast('发布失败: ' + e.message, 'error');
        $('publishBtn').disabled = false;
    }
}

async function doActualPublish(commitMsg, newVersion, latestSha) {
    try {
        // 1. 更新 assets/js/script.js 中的版本号
        let scriptContent = appState.workingScriptJs;
        scriptContent = scriptContent.replace(/const jsonVersion = '[^']*'/, `const jsonVersion = '${newVersion}'`);

        // 2. 更新 assets/js/script.js 中的 translations（同步分类和版本翻译）
        // 从 workingSongsData 提取所有分类名和版本名，确保 translations 中有它们
        scriptContent = syncTranslations(scriptContent);

        // 3. 更新 index.html 中的版本号
        let indexContent = appState.workingIndexHtml;
        indexContent = indexContent.replace(/assets\/js\/script\.js\?v=[^"]*/, `assets/js/script.js?v=${newVersion}`);
        indexContent = indexContent.replace(/assets\/css\/style\.css\?v=[^"]*/, `assets/css/style.css?v=${newVersion}`);
        indexContent = indexContent.replace(/assets\/js\/offline\.js\?v=[^"]*/, `assets/js/offline.js?v=${newVersion}`);

        // 4. 更新 index.html 圣诞主题
        if (appState.christmasTheme) {
            if (!indexContent.includes('christmas-theme')) {
                indexContent = indexContent.replace('<body', '<body class="christmas-theme"');
            }
        } else {
            indexContent = indexContent.replace(/class="christmas-theme"/g, '');
            indexContent = indexContent.replace(/class='christmas-theme'/g, '');
        }

        // 5. 序列化 data/songs.json
        const songsContent = JSON.stringify(appState.workingSongsData, null, 2);

        // 6. 获取当前 ref 和 tree
        const { refSha } = await github.getRefSha();
        const treeSha = await github.getCommitTree(refSha);

        // 7. 创建 blobs
        const blobs = [
            { path: 'data/songs.json', content: songsContent, encoding: 'utf-8' },
            { path: 'assets/js/script.js', content: scriptContent, encoding: 'utf-8' },
            { path: 'index.html', content: indexContent, encoding: 'utf-8' }
        ];

        // 8. 创建文本 blobs，并把图片 delete/rename/add/update 转成 tree items
        const treeItems = [];
        for (const b of blobs) {
            const sha = await github.createBlob(b.content, b.encoding);
            treeItems.push({ path: b.path, mode: '100644', type: 'blob', sha });
        }
        const imageTreeItems = await buildTreeItemsForOps(
            appState.pendingImageOps,
            (content, encoding) => github.createBlob(content, encoding)
        );
        treeItems.push.apply(treeItems, imageTreeItems);

        // 9. 创建新 tree
        const newTreeSha = await github.createTree(treeSha, treeItems);

        // 10. 基于最终 tree 的递归清单生成离线 manifest，再加入 final tree
        const recursiveTree = await github.getTreeRecursive(newTreeSha);
        const offlineManifest = await buildOfflineManifest(recursiveTree);
        const manifestContent = JSON.stringify(offlineManifest, null, 2) + '\n';
        const manifestBlobSha = await github.createBlob(manifestContent, 'utf-8');
        const finalTreeSha = await github.createTree(newTreeSha, [{
            path: OFFLINE_MANIFEST_PATH,
            mode: '100644',
            type: 'blob',
            sha: manifestBlobSha
        }]);

        // 11. 创建 commit
        const newCommitSha = await github.createCommit(finalTreeSha, refSha, commitMsg);

        // 12. 更新 ref
        await github.updateRef(newCommitSha);

        // 13. 保存发布记录
        appState.lastCommitSha = newCommitSha;
        appState.lastCommitMessage = commitMsg;
        await idb.putState('last_commit', {
            sha: newCommitSha,
            message: commitMsg,
            time: new Date().toLocaleString()
        });
        appState.lastCommitTime = new Date().toLocaleString('zh-CN', { hour12: false });

        // 14. 更新本地原始数据
        appState.originalSongsData = JSON.parse(songsContent);
        appState.originalScriptJs = scriptContent;
        appState.originalIndexHtml = indexContent;
        appState.originalSongsJsonSha = latestSha;
        appState.workingScriptJs = scriptContent;
        appState.workingIndexHtml = indexContent;

        // 15. 清除待发布
        clearPendingChanges();
        await idb.clearImages();

        showToast('🎉 发布成功！网站将在约 2 分钟内更新', 'success');
        renderDashboard();
    } catch (e) {
        throw e;
    } finally {
        $('publishBtn').disabled = false;
    }
}

function syncTranslations(scriptContent) {
    // 确保所有分类名和版本名在 translations 中有对应的英文翻译
    // 这里我们不做复杂的 AST 解析，而是确保已有的翻译被保留
    // 新增的分类/版本如果没有对应翻译，在 assets/js/script.js 中会被 fallback 到原名
    // 我们可以在发布时提示用户需要补充翻译
    const catNames = Object.keys(appState.workingSongsData.categories);
    const allVersions = [...appState.existingVersions];

    // 检查是否有缺失的翻译
    const missingCatTranslations = [];
    const missingVerTranslations = [];

    // 简单检查：在 scriptContent 中搜索 translations 的 categories 部分
    catNames.forEach(name => {
        if (!scriptContent.includes(`'${name}':`)) {
            missingCatTranslations.push(name);
        }
    });
    allVersions.forEach(name => {
        if (name !== '原谱' && !scriptContent.includes(`'${name}':`)) {
            missingVerTranslations.push(name);
        }
    });

    if (missingCatTranslations.length > 0 || missingVerTranslations.length > 0) {
        // 尝试自动注入缺失的翻译条目
        // 在 translations 的 categories 对象中插入
        missingCatTranslations.forEach(name => {
            const placeholder = `'${name}': '${name}',`;
            // 在 categories 对象末尾插入
            scriptContent = scriptContent.replace(
                /('其他':\s*'[^']*')/,
                `$1,\n            ${placeholder}`
            );
        });
        missingVerTranslations.forEach(name => {
            const placeholder = `'${name}': '${name}',`;
            scriptContent = scriptContent.replace(
                /('备选':\s*'[^']*')/,
                `$1,\n            ${placeholder}`
            );
        });
    }

    return scriptContent;
}

// ==================== 登录 ====================
async function doLogin() {
    const token = $('tokenInput').value.trim();
    if (!token) { $('loginError').textContent = '请输入 GitHub Token'; return; }
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
        $('loginError').textContent = 'Token 格式不正确，应以 ghp_ 或 github_pat_ 开头';
        return;
    }

    $('loginBtn').disabled = true;
    $('loginError').textContent = '';
    try {
        github.setToken(token);
        // 验证 token 是否有效
        const user = await github.request('GET', '/user');
        const username = user.login;
        if (username.toLowerCase() !== REPO_OWNER.toLowerCase()) {
            $('loginError').textContent = `Token 对应的用户是 ${username}，但仓库属于 ${REPO_OWNER}。请使用正确的 Token。`;
            $('loginBtn').disabled = false;
            return;
        }
        // 验证仓库访问权限
        await github.request('GET', `/repos/${REPO_OWNER}/${REPO_NAME}`);
        // 登录成功
        if ($('rememberToken').checked) {
            tokenManager.saveToken(token);
        }
        $('topbarUser').textContent = username;
        showMainView();
        await idb.open();
        await loadAllData();
    } catch (e) {
        $('loginError').textContent = '登录失败: ' + e.message;
        $('loginBtn').disabled = false;
    }
}

async function tryAutoLogin() {
    const token = await tokenManager.getToken();
    if (token) {
        github.setToken(token);
        try {
            const user = await github.request('GET', '/user');
            if (user.login.toLowerCase() === REPO_OWNER.toLowerCase()) {
                $('tokenInput').value = token;
                $('topbarUser').textContent = user.login;
                showMainView();
                await idb.open();
                await loadAllData();
                return;
            }
        } catch (e) {
            tokenManager.clearToken();
        }
    }
    $('loginView').classList.add('active');
}

// ==================== 事件绑定 ====================
function bindGlobalEvents() {
    // 登录
    $('loginBtn').addEventListener('click', doLogin);
    $('tokenInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    // 退出
    $('logoutBtn').addEventListener('click', () => {
        tokenManager.clearToken();
        github.setToken(null);
        location.reload();
    });
    // 仪表盘卡片
    $('dashWeekly').addEventListener('click', renderWeeklyEditor);
    $('dashSongs').addEventListener('click', renderCategoryList);
    $('dashSettings').addEventListener('click', renderSettings);
    $('dashHistory').addEventListener('click', renderCommitHistory);
    // 发布按钮
    $('publishBtn').addEventListener('click', doPublish);
    // 清除待发布按钮
    $('clearPendingBtn').addEventListener('click', () => {
        if (appState.pendingChanges.length === 0) return;
        showModal(`
            <h3>🗑️ 清除待发布更改</h3>
            <p>确定要清除所有 ${appState.pendingChanges.length} 项待发布的更改吗？</p>
            <p style="font-size:0.82rem;color:var(--danger);">⚠️ 此操作不可恢复，所有未发布的修改将丢失。</p>
            <div class="modal-actions">
                <button class="btn-cancel" id="modalCancel">取消</button>
                <button class="btn-save" style="background:var(--danger)" id="modalConfirm">确认清除</button>
            </div>
        `);
        $('modalCancel').onclick = hideModal;
        $('modalConfirm').onclick = async () => {
            clearPendingChanges();
            await idb.clearImages();
            hideModal();
            showToast('待发布更改已清除', 'success');
        };
    });
    // 返回按钮
    $('songsBackBtn').addEventListener('click', () => { switchSubView('dashboard'); renderDashboard(); });
    $('catDetailBackBtn').addEventListener('click', renderCategoryList);
    $('songFormBackBtn').addEventListener('click', () => {
        if (appState.currentViewCat) renderSongList(appState.currentViewCat);
        else renderCategoryList();
    });
    $('weeklyBackBtn').addEventListener('click', () => {
        // 交给 renderWeeklyEditor 中的 confirmLeaveWeekly 处理
    });
    $('settingsBackBtn').addEventListener('click', () => { switchSubView('dashboard'); renderDashboard(); });
    $('historyBackBtn').addEventListener('click', () => { switchSubView('dashboard'); renderDashboard(); });
    // 新增分类按钮
    $('addCategoryBtn').addEventListener('click', showAddCategoryModal);
    // 新增歌曲按钮
    $('addSongBtn').addEventListener('click', () => {
        if (appState.currentViewCat) openSongEditor(appState.currentViewCat, null, true);
    });
    // 重整编号按钮
    $('renumberBtn').addEventListener('click', () => {
        if (appState.currentViewCat) renumberCategory(appState.currentViewCat);
    });
    // 弹窗关闭
    $('modalOverlay').addEventListener('click', (e) => {
        if (e.target === $('modalOverlay')) hideModal();
    });
    // 通用 ESC 关闭弹窗
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if ($('cropModal').style.display === 'flex') {
                $('cropModal').style.display = 'none';
            } else if ($('modalOverlay').style.display === 'flex') {
                hideModal();
            }
        }
    });
}

function showAddCategoryModal() {
    showModal(`
        <h3>➕ 新增分类</h3>
        <label>分类名称（中文）<span style="color:var(--danger)">*</span></label>
        <input class="form-input-inline" id="newCatName" placeholder="输入分类名称">
        <label style="display:block;margin-top:10px;">分类名称（English）</label>
        <input class="form-input-inline" id="newCatNameEn" placeholder="用于前台双语显示">
        <div class="modal-actions">
            <button class="btn-cancel" id="modalCancel">取消</button>
            <button class="btn-save" id="modalConfirm">确认新增</button>
        </div>
    `);
    $('modalCancel').onclick = hideModal;
    $('modalConfirm').onclick = () => {
        const name = $('newCatName').value.trim();
        if (!name) { showToast('请输入分类名称', 'error'); return; }
        if (ILLEGAL_CHARS.test(name)) { showToast('分类名称包含非法字符', 'error'); return; }
        if (appState.workingSongsData.categories[name]) { showToast('该分类已存在', 'error'); return; }
        appState.workingSongsData.categories[name] = { songs: {} };
        addPendingChange('add', `新增分类：${name}`, null, `category:${name}`);
        hideModal();
        renderCategoryList();
        showToast('分类已新增（待发布）', 'success');
    };
}

// ==================== 提交历史 ====================
async function renderCommitHistory() {
    $('historyContainer').innerHTML = '<div class="loading-spinner"></div><div style="text-align:center;color:var(--text-light);margin-top:8px;">正在从 GitHub 加载提交历史...</div>';
    switchSubView('history');

    try {
        const commits = await github.request('GET',
            `/repos/${REPO_OWNER}/${REPO_NAME}/commits?per_page=30&sha=${BRANCH}`);
        if (!Array.isArray(commits) || commits.length === 0) {
            $('historyContainer').innerHTML = '<div class="empty-msg">暂无提交记录</div>';
            return;
        }

        let html = '<div style="max-width:800px;margin:0 auto;">';
        html += '<div style="font-size:0.85rem;color:var(--text-light);margin-bottom:12px;">最近 30 条提交记录 · 分支: ' + escapeHTML(BRANCH) + '</div>';

        commits.forEach((commit, i) => {
            const shaShort = commit.sha.substring(0, 7);
            const date = new Date(commit.commit.author.date);
            const dateStr = date.toLocaleString('zh-CN', { hour12: false });
            const message = commit.commit.message.split('\n')[0]; // 只显示第一行
            const author = commit.commit.author.name;
            const avatarUrl = commit.author ? commit.author.avatar_url : '';
            const htmlUrl = commit.html_url;

            html += `
            <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;transition:box-shadow 0.15s;">
                ${avatarUrl ? `<img src="${avatarUrl}&s=36" style="width:36px;height:36px;border-radius:50%;flex-shrink:0;margin-top:2px;" alt="">` : '<div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:0.8rem;">📋</div>'}
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <a href="${htmlUrl}" target="_blank" rel="noopener" style="font-weight:700;font-size:0.9rem;color:var(--primary);text-decoration:none;word-break:break-word;">${escapeHTML(message)}</a>
                        ${i === 0 ? '<span style="background:#d4edda;color:#155724;font-size:0.65rem;padding:2px 6px;border-radius:3px;font-weight:700;">LATEST</span>' : ''}
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-light);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;">
                        <span>👤 ${escapeHTML(author)}</span>
                        <span>🕐 ${dateStr}</span>
                        <span style="font-family:monospace;">🔗 ${shaShort}</span>
                    </div>
                </div>
            </div>`;
        });

        html += '</div>';
        $('historyContainer').innerHTML = html;
    } catch (e) {
        $('historyContainer').innerHTML = `<div class="empty-msg" style="color:var(--danger);">加载失败: ${escapeHTML(e.message)}<br><small>请确认 Token 有读取仓库的权限</small></div>`;
    }
}

async function fetchLastCommitFromAPI() {
    try {
        const commits = await github.request('GET',
            `/repos/${REPO_OWNER}/${REPO_NAME}/commits?per_page=1&sha=${BRANCH}`);
        if (Array.isArray(commits) && commits.length > 0) {
            const c = commits[0];
            const time = new Date(c.commit.author.date).toLocaleString('zh-CN', { hour12: false });
            const msg = c.commit.message.split('\n')[0];
            appState.lastCommitSha = c.sha;
            appState.lastCommitMessage = msg;
            appState.lastCommitTime = time;
            // 同步到本地缓存
            await idb.putState('last_commit', { sha: c.sha, message: msg, time }).catch(() => {});
            return true;
        }
    } catch (e) {
        // 静默失败，使用本地缓存
    }
    return false;
}

// ==================== CSS.escape polyfill ====================
if (!CSS.escape) {
    CSS.escape = function(value) {
        return String(value).replace(/([^\w-])/g, '\\$1');
    };
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    bindGlobalEvents();
    await idb.open();
    tryAutoLogin();
});
