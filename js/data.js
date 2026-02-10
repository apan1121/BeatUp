/**
 * data.js - 動作定義、預設 Stage 資料、localStorage 存取
 */

const DEFAULT_ACTIONS = [
    { id: 'forward',  name: '前',   icon: '⬆', iconType: 'emoji', imageFileId: null, color: '#4A90D9' },
    { id: 'backward', name: '後',   icon: '⬇', iconType: 'emoji', imageFileId: null, color: '#E8913A' },
    { id: 'turn',     name: '轉身', icon: '🔄', iconType: 'emoji', imageFileId: null, color: '#C44A8C' },
];

const PRESET_COLORS = [
    '#4A90D9', '#E8913A', '#C44A8C', '#27ae60',
    '#e74c3c', '#8e44ad', '#2c3e50', '#f39c12',
];

let ACTIONS = [...DEFAULT_ACTIONS];

const STORAGE_KEY = 'beatup_stages';
const STORAGE_BPM_KEY = 'beatup_bpm';
const STORAGE_ACTIONS_KEY = 'beatup_custom_actions';

const DEFAULT_STAGES = [
    {
        beats: ['forward', 'forward', 'backward', 'backward',
                'turn', 'turn', 'forward', null]
    },
    {
        beats: ['backward', 'backward', 'forward', 'forward',
                'forward', 'turn', 'backward', 'backward']
    },
    {
        beats: ['forward', 'backward', 'turn', 'forward',
                'backward', 'forward', 'turn', null]
    },
];

function getActionById(id) {
    return ACTIONS.find(a => a.id === id) || null;
}

function createEmptyStage() {
    return { beats: [null, null, null, null, null, null, null, null] };
}

/**
 * 產生 action icon 的 HTML（emoji 或圖片）
 */
function renderActionIcon(action) {
    if (action.iconType === 'image' && action.imageFileId) {
        const url = OPFS.getCachedURL(action.imageFileId);
        if (url) {
            return `<img class="action-icon action-icon-img" src="${url}" alt="${action.name}" draggable="false">`;
        }
    }
    return `<span class="action-icon">${action.icon}</span>`;
}

// 動作管理
function addAction(name, icon, iconType, imageFileId) {
    const id = 'action_' + Date.now();
    const colorIndex = ACTIONS.length % PRESET_COLORS.length;
    const action = {
        id, name, icon,
        iconType: iconType || 'emoji',
        imageFileId: imageFileId || null,
        color: PRESET_COLORS[colorIndex]
    };
    ACTIONS.push(action);
    saveActions();
    return action;
}

function updateAction(id, name, icon, iconType, imageFileId) {
    const action = ACTIONS.find(a => a.id === id);
    if (!action) return;
    action.name = name;
    action.icon = icon;
    if (iconType !== undefined) action.iconType = iconType;
    if (imageFileId !== undefined) action.imageFileId = imageFileId;
    saveActions();
}

async function removeAction(id) {
    const action = ACTIONS.find(a => a.id === id);
    if (action && action.iconType === 'image' && action.imageFileId) {
        await OPFS.deleteImage(action.imageFileId);
    }
    ACTIONS = ACTIONS.filter(a => a.id !== id);
    saveActions();
}

async function resetActions() {
    await OPFS.clearAll();
    ACTIONS = JSON.parse(JSON.stringify(DEFAULT_ACTIONS));
    saveActions();
}

function saveActions() {
    localStorage.setItem(STORAGE_ACTIONS_KEY, JSON.stringify(ACTIONS));
}

function loadActions() {
    try {
        const raw = localStorage.getItem(STORAGE_ACTIONS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                ACTIONS = parsed.map(a => ({
                    ...a,
                    iconType: a.iconType || 'emoji',
                    imageFileId: a.imageFileId || null,
                }));
                return;
            }
        }
    } catch (e) { /* ignore */ }
    ACTIONS = JSON.parse(JSON.stringify(DEFAULT_ACTIONS));
}

// 啟動時載入動作
loadActions();

// localStorage 操作
function loadStages() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(DEFAULT_STAGES));
}

function saveStages(stages) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stages));
}

function loadBPM() {
    const val = localStorage.getItem(STORAGE_BPM_KEY);
    return val ? parseInt(val, 10) : 120;
}

function saveBPM(bpm) {
    localStorage.setItem(STORAGE_BPM_KEY, String(bpm));
}
