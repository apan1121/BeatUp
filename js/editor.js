/**
 * editor.js - 編輯器邏輯：拖拉、Stage 管理、存檔
 */

const Editor = (() => {
    let stages = [];
    let currentStageIndex = 0;
    let boxes = [];

    // DOM references
    const elSourceList = () => document.getElementById('source-list');
    const elRow1 = () => document.getElementById('editor-row1');
    const elRow2 = () => document.getElementById('editor-row2');
    const elIndicator = () => document.getElementById('stage-indicator');

    let adLoaded = false;

    function init() {
        stages = loadStages();
        currentStageIndex = 0;
        renderSourceList();
        renderGrid();
        updateIndicator();
        initBPM();
        loadAd();
    }

    function loadAd() {
        if (adLoaded) return;
        try {
            (adsbygoogle = window.adsbygoogle || []).push({});
            adLoaded = true;
        } catch (e) { /* ignore */ }
    }

    let previewTimer = null;
    let previewBeat = 0;
    let previewNextTime = 0;

    function initBPM() {
        const slider = document.getElementById('editor-bpm');
        const value = document.getElementById('editor-bpm-value');
        const bpm = loadBPM();
        slider.value = bpm;
        value.textContent = bpm;

        slider.addEventListener('input', () => {
            value.textContent = slider.value;
            startPreview(parseInt(slider.value, 10));
        });

        slider.addEventListener('change', () => {
            stopPreview();
        });
    }

    let previewTotal = 0;

    function startPreview(bpm) {
        stopPreview();
        AudioEngine.getContext();
        previewBeat = 0;
        previewTotal = 0;
        previewNextTime = AudioEngine.currentTime() + 0.05;
        schedulePreview(bpm);
    }

    function schedulePreview(bpm) {
        if (previewTotal >= 16) { stopPreview(); return; }
        const ac = AudioEngine.getContext();
        while (previewNextTime < ac.currentTime + 0.1 && previewTotal < 16) {
            const isAccent = (previewBeat % 4 === 0);
            AudioEngine.playBeat(previewNextTime, isAccent);
            previewNextTime += 60.0 / bpm;
            previewBeat = (previewBeat + 1) % 8;
            previewTotal++;
        }
        if (previewTotal < 16) {
            previewTimer = setTimeout(() => schedulePreview(bpm), 25);
        }
    }

    function stopPreview() {
        if (previewTimer) {
            clearTimeout(previewTimer);
            previewTimer = null;
        }
    }

    function renderSourceList() {
        const list = elSourceList();
        list.innerHTML = '';
        ACTIONS.forEach(action => {
            const wrapper = document.createElement('div');
            wrapper.className = 'source-item-wrapper';

            const el = document.createElement('div');
            el.className = `source-item`;
            el.style.borderColor = action.color;
            el.draggable = true;
            el.dataset.actionId = action.id;
            el.innerHTML = `
                <span class="action-icon">${action.icon}</span>
                <span class="action-name">${action.name}</span>
            `;
            el.addEventListener('dragstart', onSourceDragStart);
            wrapper.appendChild(el);

            // 自訂動作可刪除
            if (action.custom) {
                const delBtn = document.createElement('button');
                delBtn.className = 'source-del-btn';
                delBtn.textContent = '✕';
                delBtn.addEventListener('click', () => {
                    removeCustomAction(action.id);
                    renderSourceList();
                });
                wrapper.appendChild(delBtn);
            }

            list.appendChild(wrapper);
        });

        // 「+」新增按鈕
        const addBtn = document.createElement('div');
        addBtn.className = 'source-item source-add-btn';
        addBtn.innerHTML = '<span class="action-icon">＋</span><span class="action-name">新增</span>';
        addBtn.addEventListener('click', showAddActionDialog);
        list.appendChild(addBtn);
    }

    function showAddActionDialog() {
        // 建立 modal
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-box">
                <h3>新增動作</h3>
                <div class="modal-field">
                    <label>Emoji / 圖示</label>
                    <input type="text" id="new-action-icon" placeholder="例如：👊🦵💪" maxlength="4">
                </div>
                <div class="modal-field">
                    <label>動作名稱</label>
                    <input type="text" id="new-action-name" placeholder="例如：踢、拳" maxlength="6">
                </div>
                <div class="modal-buttons">
                    <button class="btn btn-secondary modal-cancel">取消</button>
                    <button class="btn btn-primary modal-confirm">新增</button>
                </div>
            </div>
        `;

        overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        overlay.querySelector('.modal-confirm').addEventListener('click', () => {
            const icon = document.getElementById('new-action-icon').value.trim();
            const name = document.getElementById('new-action-name').value.trim();
            if (!icon || !name) return;
            addCustomAction(name, icon);
            overlay.remove();
            renderSourceList();
        });

        document.body.appendChild(overlay);
        document.getElementById('new-action-icon').focus();
    }

    function renderGrid() {
        const row1 = elRow1();
        const row2 = elRow2();
        row1.innerHTML = '';
        row2.innerHTML = '';
        boxes = [];

        const stage = stages[currentStageIndex];
        if (!stage) return;

        for (let i = 0; i < 8; i++) {
            const box = document.createElement('div');
            box.className = 'beat-box';
            box.dataset.index = i;

            const actionId = stage.beats[i];
            if (actionId) {
                setBoxAction(box, actionId);
            }

            // Drop target
            box.addEventListener('dragover', onBoxDragOver);
            box.addEventListener('dragleave', onBoxDragLeave);
            box.addEventListener('drop', onBoxDrop);

            // 點擊清空
            box.addEventListener('click', () => {
                const idx = parseInt(box.dataset.index, 10);
                stages[currentStageIndex].beats[idx] = null;
                clearBox(box);
            });

            // 格子也可拖出（交換用）
            box.draggable = true;
            box.addEventListener('dragstart', onBoxDragStart);

            if (i < 4) row1.appendChild(box);
            else row2.appendChild(box);
            boxes.push(box);
        }
    }

    function setBoxAction(box, actionId) {
        const action = getActionById(actionId);
        if (!action) return;
        box.className = `beat-box has-action action-${action.id}`;
        box.innerHTML = `
            <span class="action-icon">${action.icon}</span>
            <span class="action-name">${action.name}</span>
        `;
        box.dataset.actionId = actionId;
    }

    function clearBox(box) {
        box.className = 'beat-box';
        box.innerHTML = '';
        delete box.dataset.actionId;
    }

    function updateIndicator() {
        elIndicator().textContent = `第 ${currentStageIndex + 1} / ${stages.length} 關`;
    }

    // Drag & Drop handlers
    let dragData = { source: null, actionId: null, fromIndex: null };

    function onSourceDragStart(e) {
        dragData = {
            source: 'palette',
            actionId: e.currentTarget.dataset.actionId,
            fromIndex: null
        };
        e.dataTransfer.effectAllowed = 'copy';
    }

    function onBoxDragStart(e) {
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        const actionId = e.currentTarget.dataset.actionId;
        if (!actionId) {
            e.preventDefault();
            return;
        }
        dragData = {
            source: 'grid',
            actionId: actionId,
            fromIndex: idx
        };
        e.dataTransfer.effectAllowed = 'move';
    }

    function onBoxDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    function onBoxDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    function onBoxDrop(e) {
        e.preventDefault();
        const box = e.currentTarget;
        box.classList.remove('drag-over');
        const toIndex = parseInt(box.dataset.index, 10);

        if (!dragData.actionId) return;

        const stage = stages[currentStageIndex];

        if (dragData.source === 'grid' && dragData.fromIndex !== null) {
            // 交換
            const fromAction = stage.beats[dragData.fromIndex];
            const toAction = stage.beats[toIndex];
            stage.beats[toIndex] = fromAction;
            stage.beats[dragData.fromIndex] = toAction;
        } else {
            // 從素材區放入
            stage.beats[toIndex] = dragData.actionId;
        }

        renderGrid();
        dragData = { source: null, actionId: null, fromIndex: null };
    }

    // Stage 管理
    function prevStage() {
        if (currentStageIndex > 0) {
            currentStageIndex--;
            renderGrid();
            updateIndicator();
        }
    }

    function nextStage() {
        if (currentStageIndex < stages.length - 1) {
            currentStageIndex++;
            renderGrid();
            updateIndicator();
        }
    }

    function addStage() {
        stages.push(createEmptyStage());
        currentStageIndex = stages.length - 1;
        renderGrid();
        updateIndicator();
    }

    function deleteStage() {
        stages.splice(currentStageIndex, 1);
        if (stages.length === 0) {
            stages.push(createEmptyStage());
        }
        if (currentStageIndex >= stages.length) {
            currentStageIndex = stages.length - 1;
        }
        renderGrid();
        updateIndicator();
    }

    function randomFill() {
        const stage = stages[currentStageIndex];
        for (let i = 0; i < 8; i++) {
            stage.beats[i] = ACTIONS[Math.floor(Math.random() * ACTIONS.length)].id;
        }
        renderGrid();
    }

    function save() {
        saveStages(stages);
        saveBPM(parseInt(document.getElementById('editor-bpm').value, 10));
        // 簡單的儲存反饋
        const btn = document.getElementById('btn-save');
        const orig = btn.textContent;
        btn.textContent = '✓ 已儲存';
        btn.style.background = '#27ae60';
        setTimeout(() => {
            btn.textContent = orig;
            btn.style.background = '';
        }, 1200);
    }

    return { init, prevStage, nextStage, addStage, deleteStage, randomFill, save };
})();
