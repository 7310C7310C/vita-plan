// 在文件开头定义版本号和变量
const jsonVersion = '20261020150136';
let songsData = {};

// 離線更新後讓瀏覽器 HTTP/memory cache 失效；SW 的 cache key 會忽略 query。
function versionedImageUrl(path) {
    const version = window.VP_IMAGE_VERSION;
    if (!version) return path;
    return path + (path.indexOf('?') === -1 ? '?' : '&') + 'v=' + encodeURIComponent(version);
}

// 加载数据的函数
function loadSongsData() {
    fetch(`data/songs.json?v=${jsonVersion}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('网络响应错误');
            }
            return response.json();
        })
        .then(data => {
            songsData = data;
            // 数据加载完成后，调用所有初始化函数
            initApp();
        })
        .catch(error => {
            console.error('加载歌曲数据失败:', error);
            document.body.innerHTML = '<p>无法加载歌曲数据，请刷新页面重试。</p>';
        });
}

// 语言配置
const translations = {
    'zh': {
        // 标题和导航
        'mainTitle': '复活计划乐队',
        'weeklyButton': '♪ 本周歌曲',
        'backButton': '返回',
        'searchPlaceholder': '搜索歌曲……',
        'preferredVersion': '优先显示：',
        'updateDate': '适用日期：',
        'clearSearch': '×',
        
        // 乐谱查看器
        'loadingText': '加载中……',
        'versionText': '版本',
        'sheetMusic': '乐谱',
        'prevSong': '上一首',
        'nextSong': '下一首',
        
        // 历史和收藏
        'historyPanelTitle': '历史与收藏',
        'recentTab': '最近查看',
        'favoritesTab': '收藏',
        'clearButton': '清空',
        'noRecords': '暂无记录',
        'noFavorites': '暂无收藏',
        
        // 搜索结果
        'searchResults': '搜索结果',
        'noMatchingSongs': '没有找到匹配的歌曲',
        
        // 确认消息
        'confirmClearHistory': '确定要清空最近查看记录吗？',
        
        // 分类名称
        'categories': {
            '进堂咏': '进堂咏',
            '垂怜曲': '垂怜曲',
            '光荣颂': '光荣颂',
            '答唱咏（朱健仁）': '答唱咏（朱健仁）',
            '福音前欢呼': '福音前欢呼',
            '奉献咏': '奉献咏',
            '天主经': '天主经',
            '领主咏': '领主咏',
            '礼成咏': '礼成咏',
            '圣诞': '圣诞',
            '圣神': '圣神'
        },
        
        // 子分类名称
        'subCategories': {
            '通用': '通用',
            '甲年': '甲年',
            '乙年': '乙年',
            '丙年': '丙年'
        },
        
        // 版本名称
        'versions': {
            '原谱': '原谱',
            '贝司': '贝司',
            '吉他': '吉他',
            '备选': '备选'
        },
        
        // 歌曲数量文本
        'songsCount': '首歌曲',
        
        // 涂改相关按钮
        'doodle': '涂改',
        'doodleSave': '保存涂改',
        'doodleClear': '清空涂改',
        'eraser': '橡皮擦',
        'pen': '画笔',
        'penMode': '画笔模式',
        'eraserMode': '橡皮擦模式',
        'selectPreferredVersion': '请选择优先显示版本',
    },
    'en': {
        // 标题和导航
        'mainTitle': 'Vita Plan',
        'weeklyButton': '♪ Weekly Songs',
        'backButton': 'Back',
        'searchPlaceholder': 'Search songs...',
        'preferredVersion': 'Preferred Version: ',
        'updateDate': 'Update Date: ',
        'clearSearch': '×',
        
        // 乐谱查看器
        'loadingText': 'Loading...',
        'versionText': 'Version',
        'sheetMusic': 'Sheet Music',
        'prevSong': 'Prev',
        'nextSong': 'Next',
        
        // 历史和收藏
        'historyPanelTitle': 'History & Favorites',
        'recentTab': 'Recently Viewed',
        'favoritesTab': 'Favorites',
        'clearButton': 'Clear',
        'noRecords': 'No Records',
        'noFavorites': 'No Favorites',
        
        // 搜索结果
        'searchResults': 'Search Results',
        'noMatchingSongs': 'No matching songs found',
        
        // 确认消息
        'confirmClearHistory': 'Clear recently viewed history?',
        
        // 分类名称
        'categories': {
            '进堂咏': 'Entrance',
            '垂怜曲': 'Kyrie',
            '光荣颂': 'Gloria',
            '答唱咏（朱健仁）': 'Responsorial Psalm(Zhu Jianren)',
            '福音前欢呼': 'Gospel Acclamation',
            '奉献咏': 'Offertory',
            '天主经': 'The Lord\'s Prayer',
            '领主咏': 'Communion',
            '礼成咏': 'Recessional',
            '圣诞': 'Christmas',
            '圣神': 'Holy Spirit',
            '备用': 'Reserve',
            '其他': 'Others'
        },
        
        // 子分类名称
        'subCategories': {
            '通用': 'Common',
            '甲年': 'Year A',
            '乙年': 'Year B',
            '丙年': 'Year C'
        },
        
        // 版本名称
        'versions': {
            '原谱': 'Original',
            '贝司': 'Bass',
            '吉他': 'Guitar',
            '备选': 'Reserve'
        },
        
        // 歌曲数量文本
        'songsCount': 'songs',
        
        // 涂改相关按钮
        'doodle': 'Doodle',
        'doodleSave': 'Save',
        'doodleClear': 'Clear',
        'eraser': 'Eraser',
        'pen': 'Pen',
        'penMode': 'Pen Mode',
        'eraserMode': 'Eraser Mode',
        'selectPreferredVersion': 'Select preferred version',
    }
};

// 当前语言
let currentLanguage = 'zh';

// 当前状态
let currentState = {
    currentCategory: null,
    currentSong: null,
    currentPage: 1,
    totalPages: 1,
    currentVersion: "原谱",
    preferredVersion: "原谱",
    availableVersions: [],
    isSearchActive: false,
    lastSearchQuery: "",
    openedFrom: null,
    currentSongList: [], // 用于存储当前显示的歌曲列表
    isSubCategoryView: false, // 标记是否在子分类视图
    parentCategory: null, // 存储父分类名称
    currentSubCategory: null // 存储当前子分类名称
};

// 预加载相关变量
let weeklyPreloadTimer = null;
let weeklySongsPreloaded = false;

// 本地存储管理
const storageManager = {
    // 键名
    keys: {
        recentlyViewed: 'fhj_recently_viewed',
        favorites: 'fhj_favorites'
    },
    
    // 初始化存储
    initialize() {
        // 如果本地存储中没有数据，创建初始结构
        if (!localStorage.getItem(this.keys.recentlyViewed)) {
            localStorage.setItem(this.keys.recentlyViewed, JSON.stringify({
                items: [],
                maxItems: 10
            }));
        }
        
        if (!localStorage.getItem(this.keys.favorites)) {
            localStorage.setItem(this.keys.favorites, JSON.stringify({
                items: []
            }));
        }
        
        // 旧代码已移除 - 不再需要临时收藏迁移逻辑
    },
    
    // 获取最近查看记录
    getRecentlyViewed() {
        try {
            return JSON.parse(localStorage.getItem(this.keys.recentlyViewed));
        } catch (e) {
            console.error('获取最近查看记录失败', e);
            return { items: [], maxItems: 10 };
        }
    },
    
    // 添加最近查看记录
    addToRecentlyViewed(song, category) {
        try {
            const recentlyViewed = this.getRecentlyViewed();
            
            // 检查是否已存在，如果存在则删除旧记录
            const existingIndex = recentlyViewed.items.findIndex(
                item => item.id === song.id && item.category === category
            );
            
            if (existingIndex !== -1) {
                recentlyViewed.items.splice(existingIndex, 1);
            }
            
            // 添加新记录到开头
            recentlyViewed.items.unshift({
                id: song.id,
                title: song.title,
                category: category,
                timestamp: Date.now()
            });
            
            // 如果超过最大数量，删除最旧的
            if (recentlyViewed.items.length > recentlyViewed.maxItems) {
                recentlyViewed.items.pop();
            }
            
            // 保存到本地存储
            localStorage.setItem(this.keys.recentlyViewed, JSON.stringify(recentlyViewed));
            return true;
        } catch (e) {
            console.error('添加最近查看记录失败', e);
            return false;
        }
    },
    
    // 清空最近查看记录
    clearRecentlyViewed() {
        try {
            localStorage.setItem(this.keys.recentlyViewed, JSON.stringify({
                items: [],
                maxItems: 10
            }));
            return true;
        } catch (e) {
            console.error('清空最近查看记录失败', e);
            return false;
        }
    },
    
    // 获取收藏
    getFavorites() {
        try {
            return JSON.parse(localStorage.getItem(this.keys.favorites));
        } catch (e) {
            console.error('获取收藏失败', e);
            return { items: [] };
        }
    },
    
    // 添加/移除收藏
    toggleFavorite(song, category) {
        try {
            const favorites = this.getFavorites();
            
            // 检查是否已经收藏
            const existingIndex = favorites.items.findIndex(
                item => item.id === song.id && item.category === category
            );
            
            // 如果已存在，则移除
            if (existingIndex !== -1) {
                favorites.items.splice(existingIndex, 1);
                localStorage.setItem(this.keys.favorites, JSON.stringify(favorites));
                return false; // 返回false表示已取消收藏
            }
            
            // 如果不存在，添加到收藏
            favorites.items.push({
                id: song.id,
                title: song.title,
                category: category,
                timestamp: Date.now()
            });
            
            // 保存到本地存储
            localStorage.setItem(this.keys.favorites, JSON.stringify(favorites));
            return true; // 返回true表示已添加收藏
        } catch (e) {
            console.error('切换收藏状态失败', e);
            return null;
        }
    },
    
    // 清空收藏
    clearFavorites() {
        try {
            localStorage.setItem(this.keys.favorites, JSON.stringify({
                items: []
            }));
            return true;
        } catch (e) {
            console.error('清空收藏失败', e);
            return false;
        }
    },
    
    // 检查是否已收藏
    isFavorite(songId, category) {
        try {
            const favorites = this.getFavorites();
            return favorites.items.some(
                item => item.id === songId && item.category === category
            );
        } catch (e) {
            console.error('检查收藏状态失败', e);
            return false;
        }
    }
};

// DOM元素
const mainView = document.getElementById('main-view');
const categoryView = document.getElementById('category-view');
const weeklyView = document.getElementById('weekly-view');
const viewerView = document.getElementById('viewer-view');
const viewerContent = document.getElementById('viewerContent');
const categoriesContainer = document.getElementById('categoriesContainer');
const categoryTitle = document.getElementById('categoryTitle');
const weeklyTitle = document.getElementById('weeklyTitle');
const updateDate = document.getElementById('updateDate');
const songsContainer = document.getElementById('songsContainer');
const weeklySongsContainer = document.getElementById('weeklySongsContainer');
const backButton = document.getElementById('backButton');
const backButtonWeekly = document.getElementById('backButtonWeekly');
const closeViewerButton = document.getElementById('close-viewer');
const sheetImage = document.getElementById('sheet-image');
const prevPageButton = document.getElementById('prev-page');
const nextPageButton = document.getElementById('next-page');
const pageIndicator = document.getElementById('page-indicator');
const versionButtonsContainer = document.getElementById('versionButtons');
const versionToggleButton = document.getElementById('versionToggleButton');
const versionButtonText = document.getElementById('versionButtonText');
const versionPreferenceContainer = document.getElementById('versionPreference');
const weeklyButton = document.getElementById('weeklyButton');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingIndicator = document.getElementById('loadingIndicator');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchResultsList = document.getElementById('searchResultsList');
const clearSearchButton = document.getElementById('clearSearch');
const favoriteButton = document.getElementById('favoriteButton');
const viewerBreadcrumb = document.getElementById('viewer-breadcrumb');
const recentlyViewedContainer = document.getElementById('recentlyViewedContainer');
const recentlyViewedList = document.getElementById('recentlyViewedList');
const favoritesList = document.getElementById('favoritesList');
const clearRecentlyViewed = document.getElementById('clearRecentlyViewed');
const clearFavorites = document.getElementById('clearFavorites');
const historyButton = document.getElementById('historyButton');
const historyPanel = document.getElementById('historyPanel');
const historyPanelClose = document.getElementById('historyPanelClose');
const recentTab = document.getElementById('recentTab');
const favoritesTab = document.getElementById('favoritesTab');
const recentPanel = document.getElementById('recentPanel');
const favoritesPanel = document.getElementById('favoritesPanel');
const prevSongButton = document.getElementById('prev-song');
const nextSongButton = document.getElementById('next-song');

// 初始化应用
function initApp() {
    // 初始添加一个历史记录
    history.replaceState(null, null);
    
    // 初始化本地存储
    storageManager.initialize();
    
    // 初始化主题设置
    initTheme();
    
    // 注意：initLanguage 现在会在数据加载完成后调用
    initLanguage();
    
    renderCategories();
    renderVersionPreference();
    setupEventListeners();
    setupSearchFunction();
    
    // 渲染最近查看和收藏
    renderRecentlyViewed();
    renderFavorites();
    
    loadingOverlay.style.display = 'none';
    loadingIndicator.style.display = 'none';
    
    // 更新首页本周歌曲按钮的日期
    document.getElementById('weeklyButtonDate').textContent = 
        `${t('updateDate')}${songsData.weeklySongs.updateDate}`;
    
    showVersionModal();
}

// 初始化主题设置
function initTheme() {
    // 优先检查URL参数，如果存在?theme=1，以此为准
    const urlParams = new URLSearchParams(window.location.search);
    const themeParam = urlParams.get('theme');
    
    if (themeParam === '1') {
        // URL参数为1，强制启用圣诞主题
        document.body.classList.add('christmas-theme');
        addChristmasDecorations();
    } else {
        // 没有URL参数或参数不为1，检查HTML中的类
        if (document.body.classList.contains('christmas-theme')) {
            // 如果HTML中已经有圣诞主题类，启用圣诞主题
            addChristmasDecorations();
        } else {
            // 确保移除圣诞主题
            document.body.classList.remove('christmas-theme');
            removeChristmasDecorations();
        }
    }
}

// 添加圣诞装饰
function addChristmasDecorations() {
    // 添加圣诞装饰元素
    const decorations = [
        { emoji: '🎅', position: 'top-left' },
        { emoji: '🦌', position: 'top-right' },
        { emoji: '🎁', position: 'bottom-left' },
        { emoji: '⛄', position: 'bottom-right' }
    ];
    
    decorations.forEach((decoration, index) => {
        const decorElement = document.createElement('div');
        decorElement.className = 'christmas-decoration';
        decorElement.textContent = decoration.emoji;
        decorElement.style.cssText = `
            position: fixed;
            font-size: 2rem;
            z-index: 1000;
            pointer-events: none;
            animation: float 3s ease-in-out infinite;
            animation-delay: ${index * 0.5}s;
        `;
        
        switch (decoration.position) {
            case 'top-left':
                decorElement.style.top = '80px';
                decorElement.style.left = '80px';
                break;
            case 'top-right':
                decorElement.style.top = '80px';
                decorElement.style.right = '80px';
                break;
            case 'bottom-left':
                decorElement.style.bottom = '80px';
                decorElement.style.left = '80px';
                break;
            case 'bottom-right':
                decorElement.style.bottom = '80px';
                decorElement.style.right = '80px';
                break;
        }
        
        document.body.appendChild(decorElement);
    });
    
    // 确保标题有圣诞树装饰
    ensureChristmasTrees();
    
    // 添加独立雪花
    addSnowflakes();
}

// 确保标题有圣诞树装饰
function ensureChristmasTrees() {
    const mainTitle = document.querySelector('.main-title');
    if (mainTitle && !mainTitle.querySelector('.christmas-tree-left')) {
        // 如果还没有圣诞树，添加它们
        const leftTree = document.createElement('span');
        leftTree.className = 'christmas-tree-left';
        leftTree.textContent = '🎄';
        
        const rightTree = document.createElement('span');
        rightTree.className = 'christmas-tree-right';
        rightTree.textContent = '🎄';
        
        // 获取当前标题文本
        const titleText = mainTitle.textContent || t('mainTitle');
        
        // 清空标题内容并重新构建
        mainTitle.innerHTML = '';
        mainTitle.appendChild(leftTree);
        mainTitle.appendChild(document.createTextNode(titleText));
        mainTitle.appendChild(rightTree);
    }
}

// 重新设计的动态下雪系统
let snowflakeInterval;

function addSnowflakes() {
    const snowflakes = ['❄', '❅', '❆', '❄', '❅'];
    const snowflakeContainer = document.createElement('div');
    snowflakeContainer.className = 'snowflake-container';
    document.body.appendChild(snowflakeContainer);
    
    // 开始动态生成雪花
    snowflakeInterval = setInterval(() => {
        createSnowflake(snowflakeContainer, snowflakes);
    }, 200); // 每200ms生成一个雪花
}

function createSnowflake(container, snowflakes) {
    const snowflake = document.createElement('div');
    snowflake.className = 'snowflake';
    snowflake.textContent = snowflakes[Math.floor(Math.random() * snowflakes.length)];
    
    // 随机大小 (6px - 14px)
    const size = Math.random() * 8 + 6;
    snowflake.style.fontSize = size + 'px';
    
    // 随机起始位置 (屏幕顶部)
    snowflake.style.left = Math.random() * 120 - 10 + '%'; // -10%到110%
    snowflake.style.top = '-10px';
    
    // 随机动画时长 (4s - 12s)
    const duration = Math.random() * 8 + 4;
    snowflake.style.animationDuration = duration + 's';
    
    // 随机水平漂移
    const driftX = (Math.random() - 0.5) * 100; // -50px到50px
    snowflake.style.setProperty('--drift-x', driftX + 'px');
    
    // 随机旋转
    const rotation = Math.random() * 360;
    snowflake.style.setProperty('--rotation', rotation + 'deg');
    
    container.appendChild(snowflake);
    
    // 动画结束后移除雪花
    setTimeout(() => {
        if (snowflake.parentNode) {
            snowflake.parentNode.removeChild(snowflake);
        }
    }, duration * 1000);
}

// 隐藏圣诞装饰（在查看乐谱时）
function hideChristmasDecorations() {
    const decorations = document.querySelectorAll('.christmas-decoration');
    decorations.forEach(decor => {
        decor.style.display = 'none';
    });
    
    // 停止动态生成雪花
    if (snowflakeInterval) {
        clearInterval(snowflakeInterval);
        snowflakeInterval = null;
    }
    
    // 隐藏雪花
    const snowflakeContainer = document.querySelector('.snowflake-container');
    if (snowflakeContainer) {
        snowflakeContainer.style.display = 'none';
    }
}

// 显示圣诞装饰（离开乐谱查看时）
function showChristmasDecorations() {
    const decorations = document.querySelectorAll('.christmas-decoration');
    decorations.forEach(decor => {
        decor.style.display = 'block';
    });
    
    // 重新开始动态生成雪花
    const snowflakeContainer = document.querySelector('.snowflake-container');
    if (snowflakeContainer && !snowflakeInterval) {
        const snowflakes = ['❄', '❅', '❆', '❄', '❅'];
        snowflakeInterval = setInterval(() => {
            createSnowflake(snowflakeContainer, snowflakes);
        }, 200);
    }
    
    // 显示雪花
    if (snowflakeContainer) {
        snowflakeContainer.style.display = 'block';
    }
}

// 移除圣诞装饰
function removeChristmasDecorations() {
    const decorations = document.querySelectorAll('.christmas-decoration');
    decorations.forEach(decor => decor.remove());
    
    // 移除标题中的圣诞树
    const mainTitle = document.querySelector('.main-title');
    if (mainTitle) {
        // 获取纯文本内容（不包含圣诞树）
        const titleText = mainTitle.textContent || t('mainTitle');
        // 移除所有圣诞树元素，只保留文本
        const treeElements = mainTitle.querySelectorAll('.christmas-tree-left, .christmas-tree-right');
        treeElements.forEach(element => element.remove());
        // 确保标题只包含文本
        if (!mainTitle.textContent.trim()) {
            mainTitle.textContent = titleText;
        }
    }
    
    // 停止动态生成雪花
    if (snowflakeInterval) {
        clearInterval(snowflakeInterval);
        snowflakeInterval = null;
    }
    
    // 移除雪花容器
    const snowflakeContainer = document.querySelector('.snowflake-container');
    if (snowflakeContainer) {
        snowflakeContainer.remove();
    }
}

// 初始化语言设置
function initLanguage() {
    // 尝试从本地存储加载语言设置
    const savedLang = localStorage.getItem('fhj_language');
    if (savedLang && (savedLang === 'zh' || savedLang === 'en')) {
        currentLanguage = savedLang;
    }
    
    // 应用翻译
    applyTranslations();
}

// 切换语言
function toggleLanguage() {
    currentLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
    localStorage.setItem('fhj_language', currentLanguage);
    applyTranslations();
    
    // 重新渲染分类列表以更新"首歌曲"/"songs"显示
    renderCategories();

    // 通知离线歌谱区更新文字
    document.dispatchEvent(new CustomEvent('languagechange'));
}

// 获取翻译
function t(key, section = null) {
    if (section) {
        return translations[currentLanguage][section][key] || key;
    }
    return translations[currentLanguage][key] || key;
}

// 应用翻译到UI
function applyTranslations() {
    // 更新主标题（保持圣诞树装饰）
    const mainTitle = document.querySelector('.main-title');
    if (mainTitle) {
        const leftTree = mainTitle.querySelector('.christmas-tree-left');
        const rightTree = mainTitle.querySelector('.christmas-tree-right');
        
        // 清空标题内容
        mainTitle.innerHTML = '';
        
        // 重新添加圣诞树和翻译后的文本
        if (leftTree) mainTitle.appendChild(leftTree);
        mainTitle.appendChild(document.createTextNode(t('mainTitle')));
        if (rightTree) mainTitle.appendChild(rightTree);
    }
    
    // 更新搜索框
    searchInput.placeholder = t('searchPlaceholder');
    
    // 更新本周歌曲按钮
    document.querySelector('#weeklyButton h2').textContent = t('weeklyButton');
    
    // 更新返回按钮
    const backButtons = document.querySelectorAll('.back-button');
    backButtons.forEach(btn => {
        const textNode = Array.from(btn.childNodes).find(node => 
            node.nodeType === Node.TEXT_NODE && node.textContent.trim()
        );
        if (textNode) {
            textNode.textContent = t('backButton');
        }
    });
    
    // 更新加载文本
    document.querySelector('#loadingIndicator div:last-child').textContent = t('loadingText');
    
    // 更新历史面板
    document.querySelector('.history-panel-title').textContent = t('historyPanelTitle');
    document.querySelector('#recentTab').textContent = t('recentTab');
    document.querySelector('#favoritesTab').textContent = t('favoritesTab');
    document.querySelectorAll('.clear-button').forEach(btn => {
        btn.textContent = t('clearButton');
    });
    
    // 更新面板内标题
    const recentPanelTitle = document.querySelector('#recentPanel .section-title');
    if (recentPanelTitle) {
        recentPanelTitle.textContent = t('recentTab');
    }
    
    const favoritesPanelTitle = document.querySelector('#favoritesPanel .section-title');
    if (favoritesPanelTitle) {
        favoritesPanelTitle.textContent = t('favoritesTab');
    }
    
    // 更新无记录提示
    const updateEmptyMessages = () => {
        const recentList = document.querySelector('#recentlyViewedList');
        const favoritesList = document.querySelector('#favoritesList');
        
        if (recentList && recentList.querySelector('.empty-list-message')) {
            recentList.querySelector('.empty-list-message').textContent = t('noRecords');
        }
        
        if (favoritesList && favoritesList.querySelector('.empty-list-message')) {
            favoritesList.querySelector('.empty-list-message').textContent = t('noFavorites');
        }
    };
    updateEmptyMessages();
    
    // 更新搜索结果标题
    document.querySelector('.search-results-title').textContent = t('searchResults');
    
    // 更新优先显示文本
    document.querySelector('#versionPreference span').textContent = t('preferredVersion');
    
    // 更新版本按钮文本
    if (versionButtonText) {
        const version = currentState.currentVersion || '原谱';
        versionButtonText.textContent = t(version, 'versions');
    }
    
    // 更新乐谱图片alt属性
    const sheetImage = document.getElementById('sheet-image');
    if (sheetImage) {
        sheetImage.alt = t('sheetMusic');
    }
    
    // 更新分类列表
    updateCategoryNames();
    
    // 更新周歌曲标题
    document.querySelector('#weeklyTitle').textContent = t('weeklyButton');
    
    // 更新分类标题
    if (currentState.currentCategory) {
        // 检查是否包含子分类信息（包含" - "分隔符）
        if (categoryTitle.textContent.includes(" - ")) {
            const parts = categoryTitle.textContent.split(" - ");
            const categoryName = parts[0];
            const subCategoryName = parts[1];
            
            // 从状态中获取当前子分类名称，以便正确翻译
            if (currentState.currentSubCategory) {
                categoryTitle.textContent = `${t(currentState.currentCategory, 'categories')} - ${t(currentState.currentSubCategory, 'subCategories')}`;
            } else {
                categoryTitle.textContent = `${t(currentState.currentCategory, 'categories')} - ${subCategoryName}`;
            }
        } else {
            categoryTitle.textContent = t(currentState.currentCategory, 'categories');
        }
    }
    
    // 更新版本切换按钮文本
    if (versionButtonText) {
        const version = currentState.currentVersion || '原谱';
        versionButtonText.textContent = t(version, 'versions');
    }
    
    // 更新版本选择下拉菜单中的选项
    updateVersionSelect();
    
    // 更新歌曲导航按钮文本
    const prevSongText = document.querySelector('#prev-song .song-nav-text');
    const nextSongText = document.querySelector('#next-song .song-nav-text');
    if (prevSongText) prevSongText.textContent = t('prevSong');
    if (nextSongText) nextSongText.textContent = t('nextSong');
    
    // 更新首页本周歌曲按钮的日期
    document.getElementById('weeklyButtonDate').textContent = `${t('updateDate')}${songsData.weeklySongs.updateDate}`;
    
    // 涂改相关按钮
    if (doodleEnterBtn) doodleEnterBtn.textContent = t('doodle');
    if (doodleExitBtn) doodleExitBtn.textContent = t('doodleSave');
    if (doodleClearBtn) doodleClearBtn.textContent = t('doodleClear');
    if (doodleEraserBtn) doodleEraserBtn.textContent = isEraser ? t('pen') : t('eraser');
    
    // 更新子分类卡片
    const subcategoryCards = document.querySelectorAll('.category-card h2[data-subcategory]');
    subcategoryCards.forEach(card => {
        const subcategoryName = card.getAttribute('data-subcategory');
        if (subcategoryName) {
            card.textContent = t(subcategoryName, 'subCategories');
        }
    });
}

// 更新分类名称（在列表中和显示歌曲时）
function updateCategoryNames() {
    // 更新分类卡片
    const categoryCards = document.querySelectorAll('.category-card:not(#weeklyButton)');
    categoryCards.forEach(card => {
        const titleElement = card.querySelector('h2');
        if (titleElement) {
            const originalName = titleElement.getAttribute('data-original-name') || titleElement.textContent;
            titleElement.setAttribute('data-original-name', originalName);
            titleElement.textContent = t(originalName, 'categories');
        }
    });
    
    // 更新歌曲列表中的分类标签
    const categoryLabels = document.querySelectorAll('.song-category');
    categoryLabels.forEach(label => {
        const text = label.textContent;
        const parts = text.split(' ');
        if (parts.length >= 2) {
            const categoryName = parts[0];
            const songId = parts.slice(1).join(' ');
            label.textContent = `${t(categoryName, 'categories')} ${songId}`;
        }
    });
}

// 更新版本选择下拉菜单
function updateVersionSelect() {
    const versionSelect = document.getElementById('versionSelect');
    if (!versionSelect) return;
    
    // 保存当前选中的值
    const selectedValue = versionSelect.value;
    
    // 清空并重新填充选项
    versionSelect.innerHTML = '';
    
    // 添加原谱选项
    const originalOption = document.createElement('option');
    originalOption.value = "原谱";
    originalOption.textContent = t('原谱', 'versions');
    originalOption.selected = selectedValue === '原谱';
    versionSelect.appendChild(originalOption);
    
    // 获取所有版本并添加到下拉菜单
    const allVersions = getAllVersions();
    allVersions.forEach(version => {
        if (version !== '原谱') {
            const option = document.createElement('option');
            option.value = version;
            option.textContent = t(version, 'versions');
            option.selected = selectedValue === version;
            versionSelect.appendChild(option);
        }
    });
}

// 获取所有可用的版本名称
function getAllVersions() {
    const allVersions = new Set(['原谱']);
    Object.keys(songsData.categories).forEach(categoryName => {
        const category = songsData.categories[categoryName];
        Object.keys(category.songs).forEach(id => {
            const song = category.songs[id];
            (song.versions || []).forEach(version => {
                allVersions.add(version);
            });
        });
    });
    return Array.from(allVersions);
}

// 渲染分类列表
function renderCategories() {
    categoriesContainer.innerHTML = '';
    Object.keys(songsData.categories).forEach(categoryName => {
        const category = songsData.categories[categoryName];
        const songCount = Object.keys(category.songs).length;
        const categoryElement = document.createElement('div');
        categoryElement.className = 'category-card';
        categoryElement.innerHTML = `
            <h2 data-original-name="${categoryName}">${t(categoryName, 'categories')}</h2>
            <p>${songCount} ${t('songsCount')}</p>
        `;
        categoryElement.addEventListener('click', () => showCategory(categoryName));
        categoriesContainer.appendChild(categoryElement);
    });
}

// 渲染版本偏好选项
function renderVersionPreference() {
    // 收集所有可用的版本
    const allVersions = getAllVersions();
    
    const versionSelect = document.getElementById('versionSelect');
    versionSelect.innerHTML = '';
    
    // 添加原谱选项
    const originalOption = document.createElement('option');
    originalOption.value = "原谱";
    originalOption.textContent = t('原谱', 'versions');
    originalOption.selected = currentState.preferredVersion === '原谱';
    versionSelect.appendChild(originalOption);
    
    // 添加其他版本选项
    Array.from(allVersions).forEach(version => {
        if (version !== '原谱') {
            const option = document.createElement('option');
            option.value = version;
            option.textContent = t(version, 'versions');
            option.selected = currentState.preferredVersion === version;
            versionSelect.appendChild(option);
        }
    });
    
    // 更新"优先显示"文本
    document.querySelector('#versionPreference span').textContent = t('preferredVersion');
    
    // 添加事件监听
    versionSelect.addEventListener('change', () => {
        currentState.preferredVersion = versionSelect.value;
    });
}

// 修改showCategory函数，添加"答唱咏（朱健仁）"的子分类处理
function showCategory(categoryName) {
    const category = songsData.categories[categoryName];
    if (!category) return;

    // 对"答唱咏（朱健仁）"卡片进行特殊处理
    if (categoryName === "答唱咏（朱健仁）") {
        // 创建子分类视图
        songsContainer.innerHTML = '';
        mainView.style.display = 'none';
        categoryView.style.display = 'block';
        categoryTitle.textContent = t(categoryName, 'categories');
        // 创建四个子分类：通用、甲年、乙年、丙年
        const subCategories = ["通用", "甲年", "乙年", "丙年"];
        // 将歌曲按标题分类
        const songsBySubCategory = {
            "甲年": [],
            "乙年": [],
            "丙年": [],
            "通用": []
        };
        Object.keys(category.songs).forEach(id => {
            const song = category.songs[id];
            if (song.title.startsWith("甲年")) songsBySubCategory["甲年"].push({...song, id});
            else if (song.title.startsWith("乙年")) songsBySubCategory["乙年"].push({...song, id});
            else if (song.title.startsWith("丙年")) songsBySubCategory["丙年"].push({...song, id});
            else songsBySubCategory["通用"].push({...song, id});
        });
        subCategories.forEach(subCat => {
            const subCategoryElement = document.createElement('div');
            subCategoryElement.className = 'category-card';
            subCategoryElement.innerHTML = `
                <h2 data-subcategory="${subCat}">${t(subCat, 'subCategories')}</h2>
                <p>${songsBySubCategory[subCat].length} ${t('songsCount')}</p>
            `;
            subCategoryElement.addEventListener('click', () => showSubCategory(categoryName, subCat, songsBySubCategory[subCat]));
            songsContainer.appendChild(subCategoryElement);
        });
        historyButton.style.display = 'none';
        document.getElementById('languageButton').style.display = 'none';
        window.scrollTo(0, 0);
        return;
    }
    currentState.currentCategory = categoryName;
    categoryTitle.textContent = t(categoryName, 'categories');
    songsContainer.innerHTML = '';
    currentState.currentSongList = Object.keys(category.songs).map(id => ({
        ...category.songs[id],
        id,
        category: categoryName
    }));
    Object.keys(category.songs).forEach(id => {
        const song = category.songs[id];
        const songElement = document.createElement('div');
        songElement.className = 'song-item';
        songElement.innerHTML = `
            <div class="song-number">${id}</div>
            <div class="song-title">${song.title}</div>
        `;
        songElement.addEventListener('click', () => showSong(categoryName, {...song, id}));
        songsContainer.appendChild(songElement);
    });
    mainView.style.display = 'none';
    categoryView.style.display = 'block';
    historyButton.style.display = 'none';
    document.getElementById('languageButton').style.display = 'none';
    window.scrollTo(0, 0);
}

            // 新增函数：显示子分类下的歌曲
    function showSubCategory(categoryName, subCategoryName, songs) {
        currentState.currentCategory = categoryName;
        categoryTitle.textContent = `${t(categoryName, 'categories')} - ${t(subCategoryName, 'subCategories')}`;
        songsContainer.innerHTML = '';
        
        // 存储当前歌曲列表，用于导航
        currentState.currentSongList = songs.map(song => ({
            ...song,
            category: categoryName
        }));

        songs.forEach((song) => {
            const songElement = document.createElement('div');
            songElement.className = 'song-item';
            songElement.innerHTML = `
                <div class="song-number">${song.id}</div>
                <div class="song-title">${song.title}</div>
            `;
            songElement.addEventListener('click', () => showSong(categoryName, song));
            songsContainer.appendChild(songElement);
        });
        
                        // 修改返回按钮行为：标记当前是子分类视图
        currentState.isSubCategoryView = true;
        currentState.parentCategory = categoryName;
        
        // 记录当前子分类名称，用于键盘导航限制
        currentState.currentSubCategory = subCategoryName;
        
        // 滚动到顶部
        window.scrollTo(0, 0);
    }

// 显示本周歌曲
function showWeeklySongs() {
    currentState.openedFrom = null;
    updateDate.textContent = `${t('updateDate')}${songsData.weeklySongs.updateDate}`;
    weeklySongsContainer.innerHTML = '';
    currentState.currentSongList = songsData.weeklySongs.songs.map(item => {
        const category = songsData.categories[item.category];
        if (!category) return null;
        const song = category.songs[item.id];
        if (!song) return null;
        return {
            ...song,
            id: item.id,
            category: item.category
        };
    }).filter(Boolean);
    songsData.weeklySongs.songs.forEach((song, index) => {
        const category = songsData.categories[song.category];
        if (!category) return;
        const fullSong = category.songs[song.id];
        if (!fullSong) return;
        const songElement = document.createElement('div');
        songElement.className = 'song-item';
        songElement.innerHTML = `
            <div class="song-category">${t(song.category, 'categories')} ${song.id}</div>
            <div class="song-title">${fullSong.title}</div>
        `;
        songElement.addEventListener('click', () => showSong(song.category, {...fullSong, id: song.id}));
        weeklySongsContainer.appendChild(songElement);
    });
    mainView.style.display = 'none';
    weeklyView.style.display = 'block';
    historyButton.style.display = 'none';
    document.getElementById('languageButton').style.display = 'none';
    
    // 重置预加载状态（当重新进入本周歌曲时）
    weeklySongsPreloaded = false;
}

// 显示乐谱
function showSong(categoryName, song) {
    loadingOverlay.style.display = 'none';
    loadingIndicator.style.display = 'none';
    
// 记录是从哪个界面打开的，并设置对应的歌曲列表
if (weeklyView.style.display === 'block') {
    currentState.openedFrom = 'weekly';
    // 设置当前歌曲列表为本周歌曲
    currentState.currentSongList = songsData.weeklySongs.songs.map(item => {
        const category = songsData.categories[item.category];
        if (!category) return null;
        const fullSong = category.songs[item.id];
        if (!fullSong) return null;
        return {
            ...fullSong,
            id: item.id,
            category: item.category
        };
    }).filter(Boolean);
    
    // 每次从本周歌曲进入时都检查并启动预加载计时器
    startWeeklyPreloadTimer();
} else if (currentState.openedFrom === 'weekly') {
    // 如果当前是从本周歌曲进入的，继续检查预加载状态
    startWeeklyPreloadTimer();
} else if (categoryView.style.display === 'block') {
    currentState.openedFrom = 'category';
    
    // 特殊处理：如果是从子分类视图点击了歌曲，保持isSubCategoryView标记
    // 这样在使用键盘上下键导航时可以知道是在子分类视图中
    
    // 如果是从子分类视图进入，保持当前子分类的歌曲列表
    if (currentState.isSubCategoryView && currentState.currentSubCategory) {
        // 保持当前子分类的歌曲列表，不重新设置
        // currentState.currentSongList 已经在 showSubCategory 中设置
    } else {
        // 设置当前歌曲列表为当前分类下的歌曲
        const category = songsData.categories[categoryName];
        currentState.currentSongList = Object.keys(category.songs).map(id => ({
            ...category.songs[id],
            id,
            category: categoryName
        }));
    }
} else if (searchResults.classList.contains('show')) {
    currentState.openedFrom = 'search';
    // 搜索列表已经在performSearch中设置
} else if (historyPanel.classList.contains('show')) {
    currentState.openedFrom = 'history';
    // 根据当前激活的标签页设置歌曲列表
    if (recentPanel.classList.contains('active')) {
        // 设置当前歌曲列表为最近查看的歌曲
        const recentData = storageManager.getRecentlyViewed();
        currentState.currentSongList = recentData.items.map(item => {
            const category = songsData.categories[item.category];
            if (!category) return null;
            const fullSong = category.songs[item.id];
            if (!fullSong) return null;
            return {
                ...fullSong,
                id: item.id,
                category: item.category
            };
        }).filter(Boolean);
    } else {
        // 设置当前歌曲列表为收藏的歌曲
        const favoritesData = storageManager.getFavorites();
        currentState.currentSongList = favoritesData.items.map(item => {
            const category = songsData.categories[item.category];
            if (!category) return null;
            const fullSong = category.songs[item.id];
            if (!fullSong) return null;
            return {
                ...fullSong,
                id: item.id,
                category: item.category
            };
        }).filter(Boolean);
    }
}
    
    // 添加到最近查看记录
    storageManager.addToRecentlyViewed(song, categoryName);
    
    currentState.currentCategory = categoryName;
    currentState.currentSong = song;
    currentState.currentPage = 1;
    currentState.totalPages = song.pages;
    currentState.availableVersions = ['原谱', ...(song.versions || [])];
    
    // 根据偏好设置当前版本
    if (song.versions && song.versions.includes(currentState.preferredVersion)) {
        currentState.currentVersion = currentState.preferredVersion;
    } else {
        currentState.currentVersion = '原谱';
    }

    loadImage(currentState.currentPage);
    updatePageIndicator();
    renderVersionButtons();
    updateSongNavButtons();
    updateBreadcrumb();
    
    // 检查是否已收藏并更新收藏按钮状态
    if (storageManager.isFavorite(song.id, categoryName)) {
        favoriteButton.classList.add('active');
    } else {
        favoriteButton.classList.remove('active');
    }

    categoryView.style.display = 'none';
    weeklyView.style.display = 'none';
    viewerView.style.display = 'flex';
    
    // 无论从哪个界面打开，在查看乐谱时都隐藏历史按钮
    historyButton.style.display = 'none';
    
    // 在查看乐谱时隐藏圣诞装饰
    if (document.body.classList.contains('christmas-theme')) {
        hideChristmasDecorations();
    }
    
    // 滚动到顶部
    document.querySelector('.viewer-content').scrollTop = 0;
    
    // 添加历史记录
    history.pushState({viewingSheet: true}, null);
}

// 加载乐谱图片
function loadImage(page) {
    // 显示加载指示器
    loadingOverlay.style.display = 'block';
    loadingIndicator.style.display = 'block';
    
    // 先清除图片源
    sheetImage.src = '';
    
    let imagePath;
    // 动态拼接文件名：分类名_编号_标题
    const base = `${currentState.currentCategory}_${currentState.currentSong.id}_${currentState.currentSong.title}`;
    if (currentState.currentVersion === '原谱') {
        imagePath = `img/${currentState.currentCategory}/${base}_${page}.jpeg`;
    } else {
        imagePath = `img/${currentState.currentCategory}/${base}_${currentState.currentVersion}_${page}.jpeg`;
    }
    
    // 图片加载完成时隐藏指示器
    sheetImage.onload = function() {
        loadingOverlay.style.display = 'none';
        loadingIndicator.style.display = 'none';
        // 同步canvas尺寸
        syncDoodleCanvasSize();
    };
    
    // 图片加载出错时也隐藏指示器
    sheetImage.onerror = function() {
        loadingOverlay.style.display = 'none';
        loadingIndicator.style.display = 'none';
        // 可以在这里添加错误处理，比如显示一个错误消息
    };
    
    sheetImage.src = versionedImageUrl(imagePath);
    
    // 预加载相邻页面（保持原有逻辑）
    if (page < currentState.totalPages) {
        const nextImage = new Image();
        if (currentState.currentVersion === '原谱') {
            nextImage.src = versionedImageUrl(`img/${currentState.currentCategory}/${base}_${page + 1}.jpeg`);
        } else {
            nextImage.src = versionedImageUrl(`img/${currentState.currentCategory}/${base}_${currentState.currentVersion}_${page + 1}.jpeg`);
        }
    }
    if (page > 1) {
        const prevImage = new Image();
        if (currentState.currentVersion === '原谱') {
            prevImage.src = versionedImageUrl(`img/${currentState.currentCategory}/${base}_${page - 1}.jpeg`);
        } else {
            prevImage.src = versionedImageUrl(`img/${currentState.currentCategory}/${base}_${currentState.currentVersion}_${page - 1}.jpeg`);
        }
    }
}

// 渲染版本切换按钮
function renderVersionButtons() {
    versionButtonsContainer.innerHTML = '';
    
    // 总是显示版本切换按钮，即使只有原谱
    currentState.availableVersions.forEach(version => {
        const button = document.createElement('button');
        button.className = 'version-button';
        button.textContent = t(version, 'versions');
        if (version === currentState.currentVersion) {
            button.classList.add('active');
        }
        button.addEventListener('click', () => {
            if (version !== currentState.currentVersion) {
                currentState.currentVersion = version;
                currentState.currentPage = 1;
                loadImage(currentState.currentPage);
                updatePageIndicator();
                renderVersionButtons();
                // 关闭折叠菜单
                versionButtonsContainer.classList.remove('show');
                // 更新箭头方向
                document.querySelector('.version-toggle-button .arrow').textContent = '▼';
            }
        });
        versionButtonsContainer.appendChild(button);
    });
    
    // 更新切换按钮文本
    versionButtonText.textContent = t(currentState.currentVersion, 'versions');
    const arrow = versionToggleButton.querySelector('.arrow') || document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '▼';
    versionToggleButton.appendChild(arrow);
    
    // 总是显示版本切换按钮
    versionToggleButton.style.display = 'flex';
}

// 更新页码指示器
function updatePageIndicator() {
    pageIndicator.textContent = `${currentState.currentPage} / ${currentState.totalPages}`;
    
    // 更新翻页按钮状态
    prevPageButton.style.opacity = currentState.currentPage > 1 ? '0.7' : '0.3';
    nextPageButton.style.opacity = currentState.currentPage < currentState.totalPages ? '0.7' : '0.3';
}

// 更新歌曲导航按钮状态
function updateSongNavButtons() {
    if (!currentState.currentSongList || currentState.currentSongList.length === 0) {
        prevSongButton.classList.add('disabled');
        nextSongButton.classList.add('disabled');
        return;
    }
    
    const currentIndex = currentState.currentSongList.findIndex(
        song => song.id === currentState.currentSong.id && song.category === currentState.currentCategory
    );
    
    // 如果在子分类视图中，需要过滤出当前子分类的歌曲
    let filteredSongList = currentState.currentSongList;
    if (currentState.isSubCategoryView && currentState.currentSubCategory) {
        const getCurrentPrefix = (title) => {
            if (title.startsWith('甲年')) return '甲年';
            if (title.startsWith('乙年')) return '乙年';
            if (title.startsWith('丙年')) return '丙年';
            return 'other'; // 通用类别
        };
        
        const currentPrefix = getCurrentPrefix(currentState.currentSong.title);
        filteredSongList = currentState.currentSongList.filter(song => {
            const songPrefix = getCurrentPrefix(song.title);
            return songPrefix === currentPrefix;
        });
        
        // 重新计算在当前子分类中的索引
        const subCategoryIndex = filteredSongList.findIndex(
            song => song.id === currentState.currentSong.id && song.category === currentState.currentCategory
        );
        
        // 上一首按钮状态
        if (subCategoryIndex > 0) {
            prevSongButton.classList.remove('disabled');
            prevSongButton.style.opacity = '0.7';
        } else {
            prevSongButton.classList.add('disabled');
            prevSongButton.style.opacity = '0.3';
        }
        
        // 下一首按钮状态
        if (subCategoryIndex < filteredSongList.length - 1) {
            nextSongButton.classList.remove('disabled');
            nextSongButton.style.opacity = '0.7';
        } else {
            nextSongButton.classList.add('disabled');
            nextSongButton.style.opacity = '0.3';
        }
        return;
    }
    
    // 上一首按钮状态
    if (currentIndex > 0) {
        prevSongButton.classList.remove('disabled');
        prevSongButton.style.opacity = '0.7';
    } else {
        prevSongButton.classList.add('disabled');
        prevSongButton.style.opacity = '0.3';
    }
    
    // 下一首按钮状态
    if (currentIndex < currentState.currentSongList.length - 1) {
        nextSongButton.classList.remove('disabled');
        nextSongButton.style.opacity = '0.7';
    } else {
        nextSongButton.classList.add('disabled');
        nextSongButton.style.opacity = '0.3';
    }
}

function updateBreadcrumb() {
    if (!viewerBreadcrumb || !currentState.currentSong) return;
    const cat = t(currentState.currentCategory, 'categories');
    const id = currentState.currentSong.id;
    let text;
    if (currentState.isSubCategoryView && currentState.currentSubCategory) {
        const sub = t(currentState.currentSubCategory, 'subCategories');
        text = `${cat} / ${sub} / ${id}`;
    } else {
        text = `${cat} / ${id}`;
    }
    viewerBreadcrumb.textContent = text;
}

// 导航到上一首歌曲
function goToPrevSong() {
    if (!currentState.currentSongList || currentState.currentSongList.length === 0) return;
    
    // 如果在子分类视图中，需要过滤出当前子分类的歌曲
    let filteredSongList = currentState.currentSongList;
    let currentIndex;
    
    if (currentState.isSubCategoryView && currentState.currentSubCategory) {
        const getCurrentPrefix = (title) => {
            if (title.startsWith('甲年')) return '甲年';
            if (title.startsWith('乙年')) return '乙年';
            if (title.startsWith('丙年')) return '丙年';
            return 'other'; // 通用类别
        };
        
        const currentPrefix = getCurrentPrefix(currentState.currentSong.title);
        filteredSongList = currentState.currentSongList.filter(song => {
            const songPrefix = getCurrentPrefix(song.title);
            return songPrefix === currentPrefix;
        });
        
        currentIndex = filteredSongList.findIndex(
            song => song.id === currentState.currentSong.id && song.category === currentState.currentCategory
        );
    } else {
        currentIndex = currentState.currentSongList.findIndex(
            song => song.id === currentState.currentSong.id && song.category === currentState.currentCategory
        );
    }
    
    if (currentIndex > 0) {
        const prevSong = filteredSongList[currentIndex - 1];
        
        // 取消预加载计时器（如果是从本周歌曲进入的）
        if (currentState.openedFrom === 'weekly') {
            cancelWeeklyPreloadTimer();
        }
        
        showSong(prevSong.category, prevSong);
    }
}

// 导航到下一首歌曲
function goToNextSong() {
    if (!currentState.currentSongList || currentState.currentSongList.length === 0) return;
    
    // 如果在子分类视图中，需要过滤出当前子分类的歌曲
    let filteredSongList = currentState.currentSongList;
    let currentIndex;
    
    if (currentState.isSubCategoryView && currentState.currentSubCategory) {
        const getCurrentPrefix = (title) => {
            if (title.startsWith('甲年')) return '甲年';
            if (title.startsWith('乙年')) return '乙年';
            if (title.startsWith('丙年')) return '丙年';
            return 'other'; // 通用类别
        };
        
        const currentPrefix = getCurrentPrefix(currentState.currentSong.title);
        filteredSongList = currentState.currentSongList.filter(song => {
            const songPrefix = getCurrentPrefix(song.title);
            return songPrefix === currentPrefix;
        });
        
        currentIndex = filteredSongList.findIndex(
            song => song.id === currentState.currentSong.id && song.category === currentState.currentCategory
        );
    } else {
        currentIndex = currentState.currentSongList.findIndex(
            song => song.id === currentState.currentSong.id && song.category === currentState.currentCategory
        );
    }
    
    if (currentIndex < filteredSongList.length - 1) {
        const nextSong = filteredSongList[currentIndex + 1];
        
        // 取消预加载计时器（如果是从本周歌曲进入的）
        if (currentState.openedFrom === 'weekly') {
            cancelWeeklyPreloadTimer();
        }
        
        showSong(nextSong.category, nextSong);
    }
}

// 关闭查看器
function closeViewer() {
    loadingOverlay.style.display = 'none';
    loadingIndicator.style.display = 'none';
    viewerView.style.display = 'none';
    doodleCanvas.style.display = 'none';
    
    // 取消预加载计时器
    cancelWeeklyPreloadTimer();
    
    // 添加一个状态标记来记录是从哪个界面打开的查看器
    if (currentState.openedFrom === 'weekly') {
        weeklyView.style.display = 'block';
        // 周歌曲界面不显示历史按钮
        historyButton.style.display = 'none';
    } else if (currentState.openedFrom === 'category') {
        categoryView.style.display = 'block';
        // 分类界面不显示历史按钮
        historyButton.style.display = 'none';
    } else if (currentState.openedFrom === 'search') {
        // 从搜索结果回来，保持搜索结果显示
        searchResults.classList.add('show');
        categoriesContainer.style.display = 'none';
        weeklyButton.style.display = 'none';
        versionPreferenceContainer.style.display = 'none';
        mainView.style.display = 'block';
        currentState.isSearchActive = true;
        
        // 确保搜索框仍然有值
        if (searchInput.value.trim() === '' && currentState.lastSearchQuery) {
            searchInput.value = currentState.lastSearchQuery;
        }
        
        // 搜索结果界面不显示历史按钮和语言切换按钮
        historyButton.style.display = 'none';
        document.getElementById('languageButton').style.display = 'none';
        
        // 添加搜索激活标志
        document.body.classList.add('search-active');
        
    } else if (currentState.openedFrom === 'history') {
        // 从历史/收藏面板回来，返回主界面
        mainView.style.display = 'block';
        // 主界面显示历史按钮
        historyButton.style.display = 'flex';
    } else {
        mainView.style.display = 'block';
        // 主界面显示历史按钮
        historyButton.style.display = 'flex';
    }
    
    // 更新最近查看和收藏列表
    renderRecentlyViewed();
    renderFavorites();
    
    // 清除打开来源标记
    currentState.openedFrom = null;
    history.replaceState(null, null);
    // 退出时恢复图片适应模式为宽度适应
    isFitHeight = false;
    updateSheetFitMode();
    
    // 离开乐谱查看时显示圣诞装饰
    if (document.body.classList.contains('christmas-theme')) {
        showChristmasDecorations();
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 返回按钮
    backButton.addEventListener('click', () => {
        // 检查是否在子分类视图
        if (currentState.isSubCategoryView) {
            // 返回上级分类，而不是返回首页
            currentState.isSubCategoryView = false;
            showCategory(currentState.parentCategory);
        } else {
            // 常规返回首页行为
            categoryView.style.display = 'none';
            mainView.style.display = 'block';
            // 返回主界面时显示历史按钮和语言切换按钮
            historyButton.style.display = 'flex';
            document.getElementById('languageButton').style.display = 'flex';
        }
    });
    
    // 本周歌曲返回按钮
    backButtonWeekly.addEventListener('click', () => {
        weeklyView.style.display = 'none';
        mainView.style.display = 'block';
        // 返回主界面时显示历史按钮和语言切换按钮
        historyButton.style.display = 'flex';
        document.getElementById('languageButton').style.display = 'flex';
    });

    // 关闭查看器按钮
    closeViewerButton.addEventListener('click', closeViewer);

    // 点击乐谱外区域关闭查看器
    viewerContent.addEventListener('click', (e) => {
        if (e.target === viewerContent) {
            closeViewer();
        }
    });

    // 翻页按钮
    prevPageButton.addEventListener('click', () => {
        goToPrevPage();
    });

    nextPageButton.addEventListener('click', () => {
        goToNextPage();
    });
    
    // 歌曲导航按钮
    prevSongButton.addEventListener('click', () => {
        if (!prevSongButton.classList.contains('disabled')) {
            goToPrevSong();
        }
    });
    
    nextSongButton.addEventListener('click', () => {
        if (!nextSongButton.classList.contains('disabled')) {
            goToNextSong();
        }
    });

    // 版本切换按钮点击事件
    versionToggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        versionButtonsContainer.classList.toggle('show');
        const arrow = versionToggleButton.querySelector('.arrow');
        if (versionButtonsContainer.classList.contains('show')) {
            arrow.textContent = '▲';
        } else {
            arrow.textContent = '▼';
        }
    });

    // 点击页面其他地方关闭版本选择菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.version-buttons-container') && 
            !e.target.closest('.version-buttons')) {
            versionButtonsContainer.classList.remove('show');
            const arrow = versionToggleButton.querySelector('.arrow');
            if (arrow) arrow.textContent = '▼';
        }
    });

    // 本周歌曲按钮点击事件
    weeklyButton.addEventListener('click', showWeeklySongs);

    // 为"本周歌曲"标题添加彩蛋：点击复制歌曲列表
    weeklyTitle.addEventListener('click', () => {
        const songList = songsData.weeklySongs.songs;
        if (!songList || songList.length === 0) {
            showToast('没有可复制的歌曲');
            return;
        }

        let clipboardText = '';
        try {
            songList.forEach(songInfo => {
                const category = songInfo.category;
                const songId = songInfo.id;
                // 确保歌曲数据存在
                if (songsData.categories[category] && songsData.categories[category].songs[songId]) {
                    const title = songsData.categories[category].songs[songId].title;
                    clipboardText += `${t(category, 'categories')} ${songId} ${title}\n`;
                }
            });

            clipboardText = clipboardText.trim();

            if (clipboardText) {
                navigator.clipboard.writeText(clipboardText).then(() => {
                    showToast('歌曲列表已复制到剪贴板');
                }).catch(err => {
                    console.error('无法复制到剪贴板:', err);
                    showToast('复制失败');
                });
            }
        } catch (error) {
            console.error('生成歌曲列表时出错:', error);
            showToast('处理歌曲列表时出错');
        }
    });

    // 语言切换按钮点击事件
    document.getElementById('languageButton').addEventListener('click', () => {
        toggleLanguage();
    });

    // 监听返回键（针对移动设备）
    window.addEventListener('popstate', function(event) {
        if (viewerView.style.display === 'flex') {
            // 如果正在查看乐谱，则关闭查看器而不退出页面
            closeViewer();
            // 阻止默认的返回行为
            history.pushState(null, null, document.URL);
            event.preventDefault();
        } else if (categoryView.style.display === 'block') {
            // 检查是否在子分类视图
            if (currentState.isSubCategoryView) {
                // 返回上级分类，而不是返回首页
                currentState.isSubCategoryView = false;
                showCategory(currentState.parentCategory);
            } else {
                // 如果在分类视图，返回主视图
                categoryView.style.display = 'none';
                mainView.style.display = 'block';
                // 返回主界面时显示历史按钮
                historyButton.style.display = 'flex';
                document.getElementById('languageButton').style.display = 'flex';
            }
            history.pushState(null, null, document.URL);
            event.preventDefault();
        } else if (weeklyView.style.display === 'block') {
            // 如果在本周歌曲视图，返回主视图
            weeklyView.style.display = 'none';
            mainView.style.display = 'block';
            // 返回主界面时显示历史按钮
            historyButton.style.display = 'flex';
            history.pushState(null, null, document.URL);
            event.preventDefault();
        } else if (currentState.isSearchActive && searchResults.classList.contains('show')) {
            // 如果在搜索结果视图，清除搜索并返回主视图
            searchInput.value = '';
            searchResults.classList.remove('show');
            categoriesContainer.style.display = '';
            weeklyButton.style.display = '';
            versionPreferenceContainer.style.display = '';
            currentState.isSearchActive = false;
            history.pushState(null, null, document.URL);
            event.preventDefault();
        }
    });

    // 上一页函数
    function goToPrevPage() {
        if (isDoodleMode) return; // 涂改时禁止翻页
        if (currentState.currentPage > 1) {
            currentState.currentPage--;
            loadImage(currentState.currentPage);
            updatePageIndicator();
            // 滚动到顶部
            document.querySelector('.viewer-content').scrollTop = 0;
        }
    }

    // 下一页函数
    function goToNextPage() {
        if (isDoodleMode) return; // 涂改时禁止翻页
        if (currentState.currentPage < currentState.totalPages) {
            currentState.currentPage++;
            loadImage(currentState.currentPage);
            updatePageIndicator();
            // 滚动到顶部
            document.querySelector('.viewer-content').scrollTop = 0;
        }
    }

    // 触摸滑动翻页
    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchEndY = 0;
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, false);
    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, false);
    function handleSwipe() {
        if (!viewerView.style.display || viewerView.style.display === 'none') return;
        if (isDoodleMode) return; // 涂改时禁止滑动翻页
        const threshold = 50; // 最小横向滑动距离
        const verticalLimit = 40; // 允许的最大纵向偏移
        const diffX = touchStartX - touchEndX;
        const diffY = Math.abs(touchStartY - touchEndY);
        if (diffY > verticalLimit) return; // 纵向偏移大，不触发翻页
        if (diffX > threshold) {
            goToNextPage();
        } else if (diffX < -threshold) {
            goToPrevPage();
        }
    }

    // 键盘事件监听
    document.addEventListener('keydown', (e) => {
        // 涂改时禁止所有翻页/切歌/退出
        if (isDoodleMode) {
            if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Escape"].includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
        // ESC键退出查看器
        if (e.key === 'Escape' && viewerView.style.display === 'flex') {
            closeViewer();
        }
        // F键切换适应模式（全屏/退出全屏）
        if ((e.key === 'f' || e.key === 'F') && viewerView.style.display === 'flex' && !isDoodleMode) {
            e.preventDefault();
            fitModeBtn.click();
        }
        // 左右方向键翻页
        if (viewerView.style.display === 'flex') {
            if (e.key === 'ArrowLeft') {
                goToPrevPage();
            } else if (e.key === 'ArrowRight') {
                goToNextPage();
            }
        }
        // 上下方向键切换歌曲
        if (viewerView.style.display === 'flex') {
            if (e.key === 'ArrowUp') {
                goToPrevSong();
            } else if (e.key === 'ArrowDown') {
                goToNextSong();
            }
        }
    });

    // 清除搜索按钮点击事件
    clearSearchButton.addEventListener('click', () => {
        searchInput.value = '';
        searchResults.classList.remove('show');
        categoriesContainer.style.display = '';
        weeklyButton.style.display = '';
        versionPreferenceContainer.style.display = '';
        currentState.isSearchActive = false;
        clearSearchButton.classList.remove('visible');
        
        // 在主界面显示历史/收藏按钮和语言切换按钮
        historyButton.style.display = 'flex';
        document.getElementById('languageButton').style.display = 'flex';
        
        // 移除搜索激活标志
        document.body.classList.remove('search-active');
        
        // 清除后让搜索框重新获得焦点
        searchInput.focus();
    });
    
    // 搜索框获得焦点时如果有内容则显示清除按钮
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim() !== '') {
            clearSearchButton.classList.add('visible');
        }
    });

    // 清空最近查看按钮
    clearRecentlyViewed.addEventListener('click', () => {
        if (confirm(t('confirmClearHistory'))) {
            storageManager.clearRecentlyViewed();
            renderRecentlyViewed();
            showToast(currentLanguage === 'zh' ? '已清空最近查看' : 'Recently viewed cleared');
        }
    });
    
    // 收藏按钮点击事件
    favoriteButton.addEventListener('click', (e) => {
        e.stopPropagation(); // 防止事件冒泡
        if (!currentState.currentSong) return;
        const isFavorited = storageManager.toggleFavorite(
            currentState.currentSong, 
            currentState.currentCategory
        );
        // 更新按钮样式
        if (isFavorited) {
            favoriteButton.classList.add('active');
            showToast(currentLanguage === 'zh' ? '已添加到收藏' : 'Added to favorites');
        } else {
            favoriteButton.classList.remove('active');
            showToast(currentLanguage === 'zh' ? '已取消收藏' : 'Removed from favorites');
        }
        // 更新收藏列表（如果面板是打开的）
        if (historyPanel.classList.contains('show')) {
            renderFavorites();
        }
    });
    
    // 历史面板相关事件
    historyButton.addEventListener('click', () => {
        historyPanel.classList.add('show');
        // 刷新数据
        renderRecentlyViewed();
        renderFavorites();
    });
    
    historyPanelClose.addEventListener('click', () => {
        historyPanel.classList.remove('show');
    });
    
    // 点击面板外部关闭面板
    document.addEventListener('click', (e) => {
        if (historyPanel.classList.contains('show') && 
            !historyPanel.contains(e.target) && 
            !historyButton.contains(e.target)) {
            historyPanel.classList.remove('show');
        }
    });
    
    // 标签切换
    recentTab.addEventListener('click', () => {
        recentTab.classList.add('active');
        favoritesTab.classList.remove('active');
        recentPanel.classList.add('active');
        favoritesPanel.classList.remove('active');
    });
    
    favoritesTab.addEventListener('click', () => {
        favoritesTab.classList.add('active');
        recentTab.classList.remove('active');
        favoritesPanel.classList.add('active');
        recentPanel.classList.remove('active');
    });
}

// 搜索功能
function setupSearchFunction() {
    searchInput.addEventListener('input', debounce(performSearch, 300));
    
    // 监听输入变化，控制清除按钮显示
    searchInput.addEventListener('input', () => {
        if (searchInput.value.trim() !== '') {
            clearSearchButton.classList.add('visible');
            
            // 当输入内容时，隐藏语言切换按钮
            document.getElementById('languageButton').style.display = 'none';
            
            // 添加搜索激活标志
            document.body.classList.add('search-active');
        } else {
            clearSearchButton.classList.remove('visible');
            
            // 当搜索框内容为空时，隐藏搜索结果并显示主界面内容
            searchResults.classList.remove('show');
            categoriesContainer.style.display = '';
            weeklyButton.style.display = '';
            versionPreferenceContainer.style.display = '';
            currentState.isSearchActive = false;
            
            // 显示历史/收藏按钮和语言切换按钮
            historyButton.style.display = 'flex';
            document.getElementById('languageButton').style.display = 'flex';
            
            // 移除搜索激活标志
            document.body.classList.remove('search-active');
        }
    });
    
    // 初始检查搜索框是否有内容
    if (searchInput.value.trim() !== '') {
        clearSearchButton.classList.add('visible');
    }
    
    // 点击其他区域隐藏搜索结果
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container') && 
            !e.target.closest('.search-results')) {
            if (currentState.isSearchActive) {
                // 保存搜索状态但不要立即隐藏
                currentState.isSearchActive = searchResults.classList.contains('show');
                currentState.lastSearchQuery = searchInput.value.trim();
            } else {
                searchResults.classList.remove('show');
                categoriesContainer.style.display = '';
                weeklyButton.style.display = '';
                versionPreferenceContainer.style.display = '';
            }
        }
    });
    
    // 搜索框失焦时，如果无搜索内容则恢复显示主界面内容
    searchInput.addEventListener('blur', () => {
        if (searchInput.value.trim() === '' && searchResults.classList.contains('show')) {
            setTimeout(() => {
                searchResults.classList.remove('show');
                categoriesContainer.style.display = '';
                weeklyButton.style.display = '';
                versionPreferenceContainer.style.display = '';
                currentState.isSearchActive = false;
                
                // 在主界面显示历史/收藏按钮和语言切换按钮
                historyButton.style.display = 'flex';
                document.getElementById('languageButton').style.display = 'flex';
                
                // 移除搜索激活标志
                document.body.classList.remove('search-active');
            }, 200);
        }
    });
    
    // 清除搜索并恢复主界面
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            searchResults.classList.remove('show');
            categoriesContainer.style.display = '';
            weeklyButton.style.display = '';
            versionPreferenceContainer.style.display = '';
            searchInput.blur();
            currentState.isSearchActive = false;
            
            // 在主界面显示历史/收藏按钮和语言切换按钮
            historyButton.style.display = 'flex';
            document.getElementById('languageButton').style.display = 'flex';
            
            // 隐藏清除按钮
            clearSearchButton.classList.remove('visible');
            
            // 移除搜索激活标志
            document.body.classList.remove('search-active');
        }
    });
}

// 执行搜索
function performSearch() {
    const query = searchInput.value.trim().toLowerCase();
    if (query.length < 1) {
        searchResults.classList.remove('show');
        categoriesContainer.style.display = '';
        weeklyButton.style.display = '';
        versionPreferenceContainer.style.display = '';
        currentState.isSearchActive = false;
        historyButton.style.display = 'flex';
        document.body.classList.remove('search-active');
        return;
    }
    currentState.isSearchActive = true;
    currentState.lastSearchQuery = query;
    // 收集所有歌曲
    const allSongs = [];
    Object.keys(songsData.categories).forEach(categoryName => {
        const category = songsData.categories[categoryName];
        Object.keys(category.songs).forEach(id => {
            const song = category.songs[id];
            allSongs.push({
                category: categoryName,
                id,
                ...song
            });
        });
    });
    // 过滤匹配的歌曲
    const matchedSongs = allSongs.filter(song => 
        song.title.toLowerCase().includes(query) || 
        song.id.toLowerCase().includes(query) ||
        song.category.toLowerCase().includes(query) || 
        (currentLanguage === 'en' && t(song.category, 'categories').toLowerCase().includes(query))
    );
    // 高亮函数
    function highlight(text) {
        if (!query) return text;
        // 支持中英文关键词高亮
        const reg = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(reg, '<span class="search-highlight">$1</span>');
    }
    // 显示搜索结果
    searchResultsList.innerHTML = '';
    if (matchedSongs.length > 0) {
        // 存储当前歌曲列表，用于导航
        currentState.currentSongList = matchedSongs;
        matchedSongs.forEach((song, index) => {
            const songElement = document.createElement('div');
            songElement.className = 'song-item';
            songElement.innerHTML = `
                <div class="song-category">${highlight(t(song.category, 'categories') + ' ' + song.id)}</div>
                <div class="song-title">${highlight(song.title)}</div>
            `;
            songElement.addEventListener('click', () => {
                showSong(song.category, song);
                // 不再清除搜索结果和搜索框
            });
            searchResultsList.appendChild(songElement);
        });
    } else {
        const noResults = document.createElement('div');
        noResults.className = 'no-results';
        noResults.textContent = t('noMatchingSongs');
        searchResultsList.appendChild(noResults);
    }
    searchResults.classList.add('show');
    // 隐藏主界面内容
    categoriesContainer.style.display = 'none';
    weeklyButton.style.display = 'none';
    versionPreferenceContainer.style.display = 'none';
    // 隐藏历史/收藏按钮
    historyButton.style.display = 'none';
    // 添加搜索激活标志
    document.body.classList.add('search-active');
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// 渲染最近查看列表
function renderRecentlyViewed() {
    const recentData = storageManager.getRecentlyViewed();
    if (recentData.items.length === 0) {
        recentlyViewedList.innerHTML = `<div class="empty-list-message">${t('noRecords')}</div>`;
        return;
    }
    recentlyViewedList.innerHTML = '';
    recentData.items.forEach((item) => {
        const songElement = document.createElement('div');
        songElement.className = 'song-item';
        songElement.innerHTML = `
            <div class="song-category">${t(item.category, 'categories')} ${item.id}</div>
            <div class="song-title">${item.title}</div>
        `;
        songElement.addEventListener('click', () => {
            const category = songsData.categories[item.category];
            if (!category) return;
            const song = category.songs[item.id];
            if (!song) return;
            currentState.openedFrom = 'history';
            showSong(item.category, {...song, id: item.id});
            historyPanel.classList.remove('show');
        });
        recentlyViewedList.appendChild(songElement);
    });
}

// 渲染收藏列表
function renderFavorites() {
    const favoritesData = storageManager.getFavorites();
    if (favoritesData.items.length === 0) {
        favoritesList.innerHTML = `<div class="empty-list-message">${t('noFavorites')}</div>`;
        return;
    }
    favoritesList.innerHTML = '';
    favoritesData.items.forEach((item) => {
        const songElement = document.createElement('div');
        songElement.className = 'song-item favorite-item';
        const songInfo = document.createElement('div');
        songInfo.className = 'song-info';
        songInfo.innerHTML = `
            <div class="song-category">${t(item.category, 'categories')} ${item.id}</div>
            <div class="song-title">${item.title}</div>
        `;
        songInfo.addEventListener('click', () => {
            const category = songsData.categories[item.category];
            if (!category) return;
            const song = category.songs[item.id];
            if (!song) return;
            currentState.openedFrom = 'history';
            showSong(item.category, {...song, id: item.id});
            historyPanel.classList.remove('show');
        });
        const unfavoriteButton = document.createElement('button');
        unfavoriteButton.className = 'unfavorite-button';
        unfavoriteButton.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
            </svg>
        `;
        unfavoriteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const category = songsData.categories[item.category];
            if (!category) return;
            const song = category.songs[item.id];
            if (!song) return;
            storageManager.toggleFavorite({...song, id: item.id}, item.category);
            renderFavorites();
            if (currentState.currentSong && 
                currentState.currentSong.id === item.id && 
                currentState.currentCategory === item.category) {
                favoriteButton.classList.remove('active');
            }
            showToast(currentLanguage === 'zh' ? '已取消收藏' : 'Removed from favorites');
        });
        songElement.appendChild(songInfo);
        songElement.appendChild(unfavoriteButton);
        favoritesList.appendChild(songElement);
    });
}

// 启动应用
document.addEventListener('DOMContentLoaded', function() {
    loadSongsData();
});

// 预加载相关函数
function startWeeklyPreloadTimer() {
    // 清除之前的计时器
    if (weeklyPreloadTimer) {
        clearTimeout(weeklyPreloadTimer);
    }
    
    // 如果已经预加载过，直接返回
    if (weeklySongsPreloaded) {
        console.log('✅ 本周歌曲已预加载完成，无需重新预加载');
        return;
    }
    
    console.log('⏰ 启动本周歌曲预加载计时器 (10秒后开始预加载)...');
    
    // 设置10秒后预加载
    weeklyPreloadTimer = setTimeout(() => {
        preloadWeeklySongs();
    }, 10000);
}

function cancelWeeklyPreloadTimer() {
    if (weeklyPreloadTimer) {
        clearTimeout(weeklyPreloadTimer);
        weeklyPreloadTimer = null;
        console.log('⏹️ 本周歌曲预加载计时器已取消');
    }
}

function preloadWeeklySongs() {
    if (weeklySongsPreloaded) {
        console.log('✅ 本周歌曲已预加载完成，跳过重复预加载');
        return;
    }
    
    console.log('🚀 开始预加载本周歌曲的优先显示版本歌谱...');
    
    // 获取本周歌曲列表
    const weeklySongs = songsData.weeklySongs.songs;
    let loadedCount = 0;
    const totalSongs = weeklySongs.length;
    
    weeklySongs.forEach(item => {
        const category = songsData.categories[item.category];
        if (!category) return;
        
        const song = category.songs[item.id];
        if (!song) return;
        
        // 确定优先显示版本
        let preferredVersion = currentState.preferredVersion;
        
        // 检查歌曲是否支持优先显示版本
        const availableVersions = ['原谱', ...(song.versions || [])];
        if (!availableVersions.includes(preferredVersion)) {
            preferredVersion = '原谱'; // 如果不支持，默认使用原谱
        }
        
        let pageLoadCount = 0;
        const totalPages = song.pages;
        
        // 只为优先显示版本预加载所有页面
        for (let page = 1; page <= song.pages; page++) {
            const img = new Image();
            
            // 构建图片路径
            const base = `${item.category}_${item.id}_${song.title}`;
            
            let imagePath;
            if (preferredVersion === '原谱') {
                imagePath = `img/${item.category}/${base}_${page}.jpeg`;
            } else {
                imagePath = `img/${item.category}/${base}_${preferredVersion}_${page}.jpeg`;
            }
            
            img.onload = () => {
                pageLoadCount++;
                if (pageLoadCount === totalPages) {
                    loadedCount++;
                    console.log(`✅ 歌曲加载完成: ${item.category} ${item.id} - ${song.title} (${preferredVersion}版本, ${totalPages}页)`);
                    
                    if (loadedCount === totalSongs) {
                        weeklySongsPreloaded = true;
                        console.log(`🎉 本周歌曲优先显示版本预加载完成 (共${totalSongs}首歌曲)`);
                    }
                }
            };
            
            img.onerror = () => {
                pageLoadCount++;
                console.log(`❌ 歌曲加载失败: ${item.category} ${item.id} - ${song.title} (${preferredVersion}版本, 第${page}页)`);
                
                if (pageLoadCount === totalPages) {
                    loadedCount++;
                    console.log(`⚠️ 歌曲部分加载完成: ${item.category} ${item.id} - ${song.title} (${preferredVersion}版本, ${totalPages}页, 有加载失败的页面)`);
                    
                    if (loadedCount === totalSongs) {
                        weeklySongsPreloaded = true;
                        console.log(`🎉 本周歌曲优先显示版本预加载完成 (共${totalSongs}首歌曲)`);
                    }
                }
            };
            
            img.src = versionedImageUrl(imagePath);
        }
    });
}

// Toast 显示函数
function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 2000);
}

// 涂鸦相关元素
const doodleCanvas = document.getElementById('doodle-canvas');
const doodleEnterBtn = document.getElementById('doodleEnterBtn');
const doodleExitBtn = document.getElementById('doodleExitBtn');
const doodleClearBtn = document.getElementById('doodleClearBtn');
const doodleEraserBtn = document.getElementById('doodleEraserBtn');
const doodlePreviewCanvas = document.getElementById('doodle-preview-canvas');
let isDoodleMode = false;
let isDrawing = false;
let lastX = 0, lastY = 0;
let doodleKey = '';
let doodleColor = '#d32f2f'; // 红色
let doodleLineWidth = 3;
let isEraser = false;
const doodleUndoBtn = document.getElementById('doodleUndoBtn');
const doodleRedoBtn = document.getElementById('doodleRedoBtn');
let doodleUndoStack = [];
let doodleRedoStack = [];
let hasDrawn = false; // 新增：用于判断是否真的画了内容

// 同步canvas尺寸到图片
function syncDoodleCanvasSize() {
    if (!sheetImage.complete || sheetImage.naturalWidth === 0) return;
    // 最大分辨率
    const MAX_CANVAS_WIDTH = 875;
    const MAX_CANVAS_HEIGHT = 1400;
    let scale = Math.min(
        1,
        MAX_CANVAS_WIDTH / sheetImage.naturalWidth,
        MAX_CANVAS_HEIGHT / sheetImage.naturalHeight
    );
    // 缩放后的画布尺寸
    const canvasWidth = Math.round(sheetImage.naturalWidth * scale);
    const canvasHeight = Math.round(sheetImage.naturalHeight * scale);

    doodleCanvas.width = canvasWidth;
    doodleCanvas.height = canvasHeight;
    doodleCanvas.style.width = sheetImage.width + 'px';
    doodleCanvas.style.height = sheetImage.height + 'px';
    doodleCanvas.style.display = 'block'; // 始终显示
    doodleCanvas.style.pointerEvents = isDoodleMode ? 'auto' : 'none';
    // 预览canvas同步
    doodlePreviewCanvas.width = canvasWidth;
    doodlePreviewCanvas.height = canvasHeight;
    doodlePreviewCanvas.style.width = sheetImage.width + 'px';
    doodlePreviewCanvas.style.height = sheetImage.height + 'px';
    doodlePreviewCanvas.style.display = isDoodleMode ? 'block' : 'none';
    // 记录缩放比例
    doodleCanvas._scale = scale;
    // 重新加载本地涂鸦
    loadDoodleFromStorage();
}

// 监听窗口resize和图片加载
window.addEventListener('resize', syncDoodleCanvasSize);
sheetImage.addEventListener('load', syncDoodleCanvasSize);

// 涂鸦按钮逻辑
doodleEnterBtn.addEventListener('click', () => {
    isDoodleMode = true;
    doodleCanvas.style.pointerEvents = 'auto';
    doodleEnterBtn.style.display = 'none';
    doodleExitBtn.style.display = 'inline-block';
    doodleClearBtn.style.display = 'inline-block';
    doodleEraserBtn.style.display = 'inline-block';
    doodleUndoBtn.style.display = 'inline-block';
    doodleRedoBtn.style.display = 'inline-block';
    doodleUndoStack = [];
    doodleRedoStack = [];
    saveDoodleState(); // 进入时保存初始状态
    updateUndoRedoButtons();
    isEraser = false;
    doodleEraserBtn.classList.remove('active');
    doodleEraserBtn.textContent = t('eraser');
    doodlePreviewCanvas.style.display = 'block';
    setDoodleRelatedButtonsDisabled(true);
    // 进入涂改模式时加载本地涂鸦
    loadDoodleFromStorage();
    // 禁用收藏按钮
    favoriteButton.disabled = true;
    favoriteButton.style.opacity = '0.4';
    showToast(t('penMode')); // 新增toast
});
doodleExitBtn.addEventListener('click', () => {
    isDoodleMode = false;
    doodleCanvas.style.pointerEvents = 'none';
    doodleEnterBtn.style.display = 'inline-block';
    doodleExitBtn.style.display = 'none';
    doodleClearBtn.style.display = 'none';
    doodleEraserBtn.style.display = 'none';
    doodleUndoBtn.style.display = 'none';
    doodleRedoBtn.style.display = 'none';
    doodlePreviewCanvas.style.display = 'none';
    isEraser = false;
    doodleEraserBtn.classList.remove('active');
    doodleEraserBtn.textContent = t('eraser');
    setDoodleRelatedButtonsDisabled(false);
    // 退出时保存涂鸦
    saveDoodleToStorage();
    // 恢复收藏按钮
    favoriteButton.disabled = false;
    favoriteButton.style.opacity = '';
});
doodleClearBtn.addEventListener('click', () => {
    const ctx = doodleCanvas.getContext('2d');
    ctx.clearRect(0, 0, doodleCanvas.width, doodleCanvas.height);
    // 清除本地保存
    clearDoodleStorage();
    // 清空撤回重做栈并保存空白状态
    doodleUndoStack = [];
    doodleRedoStack = [];
    saveDoodleState();
    updateUndoRedoButtons();
});
// 橡皮擦按钮逻辑
doodleEraserBtn.addEventListener('click', () => {
    isEraser = !isEraser;
    if (isEraser) {
        doodleEraserBtn.classList.add('active');
        doodleEraserBtn.textContent = t('pen');
        showToast(t('eraserMode')); // 新增toast
    } else {
        doodleEraserBtn.classList.remove('active');
        doodleEraserBtn.textContent = t('eraser');
        showToast(t('penMode')); // 新增toast
    }
});
// 设置涂改时禁用/恢复无关按钮
function setDoodleRelatedButtonsDisabled(disabled) {
    // 关闭按钮
    closeViewerButton.disabled = disabled;
    closeViewerButton.style.opacity = disabled ? '0.4' : '';
    // 翻页
    prevPageButton.style.pointerEvents = disabled ? 'none' : '';
    nextPageButton.style.pointerEvents = disabled ? 'none' : '';
    prevPageButton.style.opacity = disabled ? '0.3' : (currentState.currentPage > 1 ? '0.7' : '0.3');
    nextPageButton.style.opacity = disabled ? '0.3' : (currentState.currentPage < currentState.totalPages ? '0.7' : '0.3');
    // 歌曲导航
    prevSongButton.style.pointerEvents = disabled ? 'none' : '';
    nextSongButton.style.pointerEvents = disabled ? 'none' : '';
    prevSongButton.style.opacity = disabled ? '0.3' : (prevSongButton.classList.contains('disabled') ? '0.3' : '0.7');
    nextSongButton.style.opacity = disabled ? '0.3' : (nextSongButton.classList.contains('disabled') ? '0.3' : '0.7');
    // 版本切换
    versionToggleButton.disabled = disabled;
    versionToggleButton.style.opacity = disabled ? '0.4' : '';
    // 版本菜单
    versionButtonsContainer.style.pointerEvents = disabled ? 'none' : '';
    versionButtonsContainer.style.opacity = disabled ? '0.4' : '';
    // 全屏切换按钮
    fitModeBtn.disabled = disabled;
    fitModeBtn.style.opacity = disabled ? '0.4' : '';
}
// 生成当前图片的唯一key
function getDoodleKey() {
    if (!currentState.currentSong || !currentState.currentCategory) return '';
    let version = currentState.currentVersion || '原谱';
    let page = currentState.currentPage || 1;
    
    const baseIdentifier = `${currentState.currentCategory}_${currentState.currentSong.id}_${currentState.currentSong.title}`;

    return `doodle_${baseIdentifier}_${version}_${page}`;
}
// 保存canvas到localStorage
function saveDoodleToStorage() {
    doodleKey = getDoodleKey();
    if (!doodleKey) return;
    try {
        const data = doodleCanvas.toDataURL('image/png');
        localStorage.setItem(doodleKey, data);
    } catch (e) {}
}
// 加载canvas内容
function loadDoodleFromStorage() {
    doodleKey = getDoodleKey();
    if (!doodleKey) return;
    const ctx = doodleCanvas.getContext('2d');
    ctx.clearRect(0, 0, doodleCanvas.width, doodleCanvas.height);
    const data = localStorage.getItem(doodleKey);
    if (data) {
        const img = new window.Image();
        img.onload = function() {
            ctx.drawImage(img, 0, 0, doodleCanvas.width, doodleCanvas.height);
        };
        img.src = data;
    }
}
// 清除本地保存
function clearDoodleStorage() {
    doodleKey = getDoodleKey();
    if (!doodleKey) return;
    localStorage.removeItem(doodleKey);
}
// 每次翻页/切换版本/切换歌曲时加载涂鸦
function afterPageOrSongChange() {
    setTimeout(() => {
        loadDoodleFromStorage();
        doodleCanvas.style.pointerEvents = isDoodleMode ? 'auto' : 'none';
        doodleCanvas.style.display = 'block';
        // 重置撤回重做栈
        doodleUndoStack = [];
        doodleRedoStack = [];
        saveDoodleState();
        updateUndoRedoButtons();
    }, 100);
}
// 在loadImage后调用
const oldLoadImage = loadImage;
loadImage = function(page) {
    oldLoadImage(page);
    afterPageOrSongChange();
}
// 绘画事件
function getCanvasPos(e) {
    const rect = doodleCanvas.getBoundingClientRect();
    let x, y;
    let scale = doodleCanvas._scale || 1;
    if (e.touches) {
        x = (e.touches[0].clientX - rect.left) * (doodleCanvas.width / rect.width);
        y = (e.touches[0].clientY - rect.top) * (doodleCanvas.height / rect.height);
    } else {
        x = (e.clientX - rect.left) * (doodleCanvas.width / rect.width);
        y = (e.clientY - rect.top) * (doodleCanvas.height / rect.height);
    }
    return {x, y};
}
doodleCanvas.addEventListener('mousedown', function(e) {
    if (!isDoodleMode) return;
    isDrawing = true;
    hasDrawn = false;
    doodleRedoStack = [];
    updateUndoRedoButtons();
    const ctx = doodleCanvas.getContext('2d');
    if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = 20;
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = doodleColor;
        ctx.lineWidth = doodleLineWidth;
    }
    const pos = getCanvasPos(e);
    lastX = pos.x; lastY = pos.y;
});
doodleCanvas.addEventListener('mousemove', function(e) {
    if (!isDoodleMode || !isDrawing) return;
    const ctx = doodleCanvas.getContext('2d');
    if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = 20;
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = doodleColor;
        ctx.lineWidth = doodleLineWidth;
    }
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastX = pos.x; lastY = pos.y;
    hasDrawn = true; // 新增
});
doodleCanvas.addEventListener('mouseup', function(e) {
    if (!isDoodleMode) return;
    isDrawing = false;
    if (hasDrawn) {
        saveDoodleState();
        hasDrawn = false;
    }
});
doodleCanvas.addEventListener('mouseleave', function(e) {
    if (!isDoodleMode) return;
    isDrawing = false;
    if (hasDrawn) {
        saveDoodleState();
        hasDrawn = false;
    }
});
// 触摸
doodleCanvas.addEventListener('touchstart', function(e) {
    if (!isDoodleMode) return;
    isDrawing = true;
    hasDrawn = false; // 新增
    doodleRedoStack = []; // 关键：每次新画一笔时清空重做栈
    updateUndoRedoButtons();
    const ctx = doodleCanvas.getContext('2d');
    if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = 20;
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = doodleColor;
        ctx.lineWidth = doodleLineWidth;
    }
    const pos = getCanvasPos(e);
    lastX = pos.x; lastY = pos.y;
    e.preventDefault();
}, {passive:false});
doodleCanvas.addEventListener('touchmove', function(e) {
    if (!isDoodleMode || !isDrawing) return;
    const ctx = doodleCanvas.getContext('2d');
    if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = 20;
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = doodleColor;
        ctx.lineWidth = doodleLineWidth;
    }
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastX = pos.x; lastY = pos.y;
    hasDrawn = true; // 新增
    e.preventDefault();
}, {passive:false});
doodleCanvas.addEventListener('touchend', function(e) {
    if (!isDoodleMode) return;
    isDrawing = false;
    if (hasDrawn) {
        saveDoodleState();
        hasDrawn = false;
    }
    e.preventDefault();
}, {passive:false});
doodleCanvas.addEventListener('touchcancel', function(e) {
    if (!isDoodleMode) return;
    isDrawing = false;
    if (hasDrawn) {
        saveDoodleState();
        hasDrawn = false;
    }
    e.preventDefault();
}, {passive:false});

// 禁用方向键和点击乐谱外区域关闭
let doodleKeydownHandler = null;
let doodleViewerClickHandler = null;
function enableDoodleModeBlockers(enable) {
    if (enable) {
        // 禁用方向键
        doodleKeydownHandler = function(e) {
            if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Escape"].includes(e.key)) {
                e.stopPropagation();
                e.preventDefault();
            }
        };
        document.addEventListener('keydown', doodleKeydownHandler, true);
        // 禁用点击乐谱外区域关闭
        doodleViewerClickHandler = function(e) {
            if (e.target === viewerContent) {
                e.stopPropagation();
                e.preventDefault();
            }
        };
        viewerContent.addEventListener('click', doodleViewerClickHandler, true);
    } else {
        if (doodleKeydownHandler) document.removeEventListener('keydown', doodleKeydownHandler, true);
        if (doodleViewerClickHandler) viewerContent.removeEventListener('click', doodleViewerClickHandler, true);
    }
}
// 在涂改按钮切换时调用
doodleEnterBtn.addEventListener('click', () => { enableDoodleModeBlockers(true); });
doodleExitBtn.addEventListener('click', () => { enableDoodleModeBlockers(false); });

// 画笔/橡皮擦预览
function drawDoodlePreview(x, y) {
    const ctx = doodlePreviewCanvas.getContext('2d');
    ctx.clearRect(0, 0, doodlePreviewCanvas.width, doodlePreviewCanvas.height);
    if (!isDoodleMode) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4); // 45度

    if (isEraser) {
        // 橡皮擦：白色椭圆，灰色边框
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 6, 0, 0, 2 * Math.PI); // 长轴14，短轴6
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#888';
        ctx.stroke();
        // 画出橡皮擦的"斜切面"效果
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 6, 0, Math.PI * 0.1, Math.PI * 0.9);
        ctx.strokeStyle = '#bbb';
        ctx.stroke();
    } else {
        // 画笔：红色椭圆，深色边框
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 4, 0, 0, 2 * Math.PI); // 长轴10，短轴4
        ctx.fillStyle = '#d32f2f';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#a31515';
        ctx.stroke();
        // 画出笔尖的"高光"
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.ellipse(-2, -1, 3, 1.2, 0, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
    }
    ctx.restore();
}
function clearDoodlePreview() {
    const ctx = doodlePreviewCanvas.getContext('2d');
    ctx.clearRect(0, 0, doodlePreviewCanvas.width, doodlePreviewCanvas.height);
}
// 鼠标预览
doodleCanvas.addEventListener('mousemove', function(e) {
    if (!isDoodleMode) return;
    const rect = doodleCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (doodleCanvas.width / rect.width);
    const y = (e.clientY - rect.top) * (doodleCanvas.height / rect.height);
    drawDoodlePreview(x, y);
});
doodleCanvas.addEventListener('mouseleave', function(e) {
    clearDoodlePreview();
});
doodleCanvas.addEventListener('mouseenter', function(e) {
    if (!isDoodleMode) return;
    const rect = doodleCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (doodleCanvas.width / rect.width);
    const y = (e.clientY - rect.top) * (doodleCanvas.height / rect.height);
    drawDoodlePreview(x, y);
});
// 触摸预览
doodleCanvas.addEventListener('touchmove', function(e) {
    if (!isDoodleMode) return;
    const rect = doodleCanvas.getBoundingClientRect();
    const x = (e.touches[0].clientX - rect.left) * (doodleCanvas.width / rect.width);
    const y = (e.touches[0].clientY - rect.top) * (doodleCanvas.height / rect.height);
    drawDoodlePreview(x, y);
}, {passive:false});
doodleCanvas.addEventListener('touchend', function(e) {
    clearDoodlePreview();
}, {passive:false});
doodleCanvas.addEventListener('touchcancel', function(e) {
    clearDoodlePreview();
}, {passive:false});

// 撤回/重做按钮事件
function restoreDoodleState(dataUrl, callback) {
    const ctx = doodleCanvas.getContext('2d');
    const img = new window.Image();
    img.onload = function() {
        ctx.clearRect(0, 0, doodleCanvas.width, doodleCanvas.height);
        ctx.drawImage(img, 0, 0, doodleCanvas.width, doodleCanvas.height);
        if (callback) callback();
    };
    img.src = dataUrl;
}

// 撤回
doodleUndoBtn.addEventListener('click', () => {
    if (doodleUndoStack.length > 1) {
        const last = doodleUndoStack.pop();
        doodleRedoStack.push(last);
        restoreDoodleState(doodleUndoStack[doodleUndoStack.length - 1], updateUndoRedoButtons);
    }
});
// 重做
doodleRedoBtn.addEventListener('click', () => {
    if (doodleRedoStack.length > 0) {
        const redoState = doodleRedoStack.pop();
        doodleUndoStack.push(redoState);
        restoreDoodleState(redoState, updateUndoRedoButtons);
    }
});

// 撤回/重做相关函数
function saveDoodleState() {
    try {
        doodleUndoStack.push(doodleCanvas.toDataURL());
        if (doodleUndoStack.length > 30) doodleUndoStack.shift(); // 限制栈大小
    } catch (e) {}
    updateUndoRedoButtons();
}
function updateUndoRedoButtons() {
    doodleUndoBtn.disabled = doodleUndoStack.length <= 1;
    doodleUndoBtn.style.opacity = doodleUndoBtn.disabled ? '0.3' : '0.9';
    doodleRedoBtn.disabled = doodleRedoStack.length === 0;
    doodleRedoBtn.style.opacity = doodleRedoBtn.disabled ? '0.3' : '0.9';
}

function showVersionModal() {
    const modal = document.getElementById('version-modal');
    const btnList = document.getElementById('modalVersionBtnList');
    const title = document.getElementById('modalVersionTitle');
    btnList.innerHTML = '';
    // 设置标题多语言
    title.textContent = t('selectPreferredVersion');
    // 填充所有版本为按钮
    getAllVersions().forEach(version => {
        const btn = document.createElement('button');
        btn.textContent = t(version, 'versions');
        btn.value = version;
        // 使用类而不是内联样式，方便为“原谱”添加特殊样式
        btn.className = 'modal-version-btn';
        // 如果是“原谱”，添加突出显示的类
        if (version === '原谱') {
            btn.classList.add('primary-version-btn');
        }
        btn.onclick = function() {
            currentState.preferredVersion = version;
            renderVersionPreference();
            hideVersionModal();
        };
        btnList.appendChild(btn);
    });
    modal.style.display = 'flex';
    // 禁止页面滚动和交互
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.addEventListener('wheel', preventScroll, { passive: false });
    document.body.addEventListener('touchmove', preventScroll, { passive: false });
    document.body.addEventListener('keydown', preventKeyScroll, true);
}
function hideVersionModal() {
    document.getElementById('version-modal').style.display = 'none';
    // 恢复页面滚动和交互
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.body.removeEventListener('wheel', preventScroll, { passive: false });
    document.body.removeEventListener('touchmove', preventScroll, { passive: false });
    document.body.removeEventListener('keydown', preventKeyScroll, true);
}
function preventScroll(e) { e.preventDefault(); }
function preventKeyScroll(e) {
    // 禁止方向键、空格、PageUp/PageDown等
    if ([32,33,34,35,36,37,38,39,40].includes(e.keyCode)) {
        e.preventDefault();
    }
}

document.getElementById('modalVersionBtnList').onclick = function() {
    const select = document.getElementById('versionSelect');
    currentState.preferredVersion = select.value;
    renderVersionPreference();
    hideVersionModal();
};

// 适应模式切换
const fitModeBtn = document.getElementById('fitModeBtn');
const fitModeIconExpand = document.getElementById('fitModeIconExpand');
const fitModeIconCollapse = document.getElementById('fitModeIconCollapse');
let isFitHeight = false;
fitModeBtn.addEventListener('click', function() {
    isFitHeight = !isFitHeight;
    updateSheetFitMode();
});
function updateSheetFitMode() {
    if (isFitHeight) {
        sheetImage.style.width = 'auto';
        sheetImage.style.height = '100vh';
        sheetImage.style.maxWidth = 'unset';
        sheetImage.style.maxHeight = '100vh';
        fitModeIconExpand.style.display = 'none';
        fitModeIconCollapse.style.display = '';
        sheetImage.classList.add('fit-height-mode');
    } else {
        sheetImage.style.width = '100%';
        sheetImage.style.height = 'auto';
        sheetImage.style.maxWidth = '100%';
        sheetImage.style.maxHeight = 'unset';
        fitModeIconExpand.style.display = '';
        fitModeIconCollapse.style.display = 'none';
        sheetImage.classList.remove('fit-height-mode');
    }
    // 画布同步
    syncDoodleCanvasSize();
}
// 每次图片加载后自动同步适应模式
sheetImage.addEventListener('load', updateSheetFitMode);