/**
 * data.js - 動作定義、預設 Stage 資料、localStorage 存取
 */

const DEFAULT_ACTIONS = [
    { id: 'forward',  name: '前',   icon: '⬆', color: '#4A90D9' },
    { id: 'backward', name: '後',   icon: '⬇', color: '#E8913A' },
    { id: 'turn',     name: '轉身', icon: '🔄', color: '#C44A8C' },
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

// 自訂動作
function addCustomAction(name, icon) {
    const id = 'custom_' + Date.now();
    const colorIndex = ACTIONS.length % PRESET_COLORS.length;
    const action = { id, name, icon, color: PRESET_COLORS[colorIndex], custom: true };
    ACTIONS.push(action);
    saveCustomActions();
    return action;
}

function removeCustomAction(id) {
    ACTIONS = ACTIONS.filter(a => a.id !== id);
    saveCustomActions();
}

function saveCustomActions() {
    const customs = ACTIONS.filter(a => a.custom);
    localStorage.setItem(STORAGE_ACTIONS_KEY, JSON.stringify(customs));
}

function loadCustomActions() {
    try {
        const raw = localStorage.getItem(STORAGE_ACTIONS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                ACTIONS = [...DEFAULT_ACTIONS, ...parsed];
            }
        }
    } catch (e) { /* ignore */ }
}

// 啟動時載入自訂動作
loadCustomActions();

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
