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
    let bpmInited = false;

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

    function updateBpmSeconds(bpm) {
        var el = document.getElementById('bpm-seconds');
        if (el) el.textContent = '每拍 ' + (60 / bpm).toFixed(2) + ' 秒';
    }

    function initBPM() {
        const slider = document.getElementById('editor-bpm');
        const value = document.getElementById('editor-bpm-value');
        const demoBtn = document.getElementById('btn-bpm-demo');
        const bpm = loadBPM();
        slider.value = bpm;
        value.textContent = bpm;
        updateBpmSeconds(bpm);

        if (bpmInited) return;
        bpmInited = true;

        slider.addEventListener('input', () => {
            value.textContent = slider.value;
            updateBpmSeconds(parseInt(slider.value, 10));
            startPreview(parseInt(slider.value, 10));
        });

        slider.addEventListener('change', () => {
            stopPreview();
            if (waveformData) {
                waveformData.bpm = parseInt(slider.value, 10);
                drawWaveform(waveformData);
            }
        });

        demoBtn.addEventListener('click', () => {
            if (previewTimer) {
                stopPreview();
            } else {
                startPreview(parseInt(slider.value, 10));
            }
        });

        // BPM 偵測
        const detectBtn = document.getElementById('btn-detect-bpm');
        const fileInput = document.getElementById('bpm-music-file');
        const clearMusicBtn = document.getElementById('btn-clear-music');
        clearMusicBtn.addEventListener('click', () => {
            AudioEngine.clearMusic();
            updateMusicStatus();
            hideWaveform();
        });
        updateMusicStatus();

        detectBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            detectBtn.disabled = true;
            detectBtn.textContent = '偵測中...';
            try {
                const result = await BPMDetector.detect(file);
                const bpm = result.bpm;
                slider.value = bpm;
                value.textContent = bpm;
                updateBpmSeconds(bpm);
                updateMusicStatus();
                drawWaveform(result);
            } catch (e) {
                console.error('BPM detect error', e);
                detectBtn.textContent = '偵測失敗';
                setTimeout(() => { detectBtn.textContent = '🎵 從音樂偵測'; }, 1500);
                return;
            } finally {
                detectBtn.disabled = false;
                fileInput.value = '';
            }
            detectBtn.textContent = '🎵 從音樂偵測';
        });
    }

    function updateMusicStatus() {
        const statusEl = document.getElementById('bpm-music-status');
        const clearBtn = document.getElementById('btn-clear-music');
        if (AudioEngine.hasMusic()) {
            const name = AudioEngine.getMusicName() || '音樂';
            statusEl.textContent = '🎶 ' + name;
            statusEl.classList.remove('hidden');
            clearBtn.classList.remove('hidden');
        } else {
            statusEl.classList.add('hidden');
            clearBtn.classList.add('hidden');
        }
    }

    // ====== 波形視覺化 ======
    let waveformData = null; // 儲存偵測結果供繪製
    let waveformImage = null; // 快取波形底圖 ImageData
    let playheadRAF = null;
    let previewStartCtxTime = 0;
    let waveformDuration = 0; // 波形顯示的秒數
    let canvasW = 0, canvasH = 0; // 快取 canvas 像素尺寸

    function drawWaveform(detectResult) {
        waveformData = detectResult;
        var container = document.getElementById('editor-waveform-container');
        var canvas = document.getElementById('editor-waveform');
        if (!container || !canvas) return;

        container.classList.remove('hidden');

        var buf = AudioEngine.getMusicBuffer();
        if (!buf) return;

        // canvas 尺寸只量測一次，之後用快取值
        var dpr = window.devicePixelRatio || 1;
        if (canvasW === 0 || canvasH === 0) {
            var rect = container.getBoundingClientRect();
            canvasW = Math.round(rect.width * dpr);
            canvasH = Math.round(rect.height * dpr);
            canvas.width = canvasW;
            canvas.height = canvasH;
        }
        var w = canvasW;
        var h = canvasH;

        // 只畫前 N 秒（與 demo 播放範圍對應）
        var bpm = detectResult.bpm;
        var maxBeats = 32;
        waveformDuration = maxBeats * 60.0 / bpm;
        var totalSamples = Math.min(
            Math.round(waveformDuration * buf.sampleRate),
            buf.length
        );

        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);

        // 繪製波形
        var raw = buf.getChannelData(0);
        var step = Math.max(1, Math.floor(totalSamples / w));
        ctx.fillStyle = 'rgba(124, 92, 224, 0.5)';
        for (var x = 0; x < w; x++) {
            var start = Math.floor(x * totalSamples / w);
            var end = Math.min(start + step, totalSamples);
            var min = 0, max = 0;
            for (var j = start; j < end; j++) {
                var v = raw[j] || 0;
                if (v < min) min = v;
                if (v > max) max = v;
            }
            var yMin = (1 + min) * h / 2;
            var yMax = (1 + max) * h / 2;
            ctx.fillRect(x, Math.floor(yMax), 1, Math.max(1, Math.floor(yMin - yMax)));
        }

        // 繪製音樂 onset 峰值（青色，從下方畫起，高度代表能量強度）
        if (detectResult.onset && detectResult.frameRate) {
            var onset = detectResult.onset;
            var fr = detectResult.frameRate;
            var totalFrames = Math.min(onset.length, Math.round(waveformDuration * fr));
            // 找出 onset 中的局部峰值
            var peakThreshold = 0.15;
            var minGap = Math.round(fr * 0.1); // 至少間隔 100ms
            var lastPeak = -minGap;
            ctx.strokeStyle = 'rgba(0, 200, 220, 0.6)';
            ctx.lineWidth = dpr;
            for (var fi = 1; fi < totalFrames - 1; fi++) {
                if (onset[fi] > peakThreshold &&
                    onset[fi] >= onset[fi - 1] &&
                    onset[fi] >= onset[fi + 1] &&
                    fi - lastPeak >= minGap) {
                    var peakTime = fi / fr;
                    var px = (peakTime / waveformDuration) * w;
                    var peakH = onset[fi] * h * 0.4; // 高度 = 能量比例
                    ctx.beginPath();
                    ctx.moveTo(px, h);
                    ctx.lineTo(px, h - peakH);
                    ctx.stroke();
                    lastPeak = fi;
                }
            }
        }

        // 繪製 BPM 節拍格線（紅色，等間距）
        var offset = detectResult.offset;
        var beatPeriod = 60.0 / bpm;
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.7)';
        ctx.lineWidth = dpr;
        for (var t = offset; t < waveformDuration; t += beatPeriod) {
            var bx = (t / waveformDuration) * w;
            ctx.beginPath();
            ctx.moveTo(bx, 0);
            ctx.lineTo(bx, h);
            ctx.stroke();
        }

        // 第一拍用較粗的線
        ctx.strokeStyle = 'rgba(231, 76, 60, 1)';
        ctx.lineWidth = 2 * dpr;
        var firstX = (offset / waveformDuration) * w;
        ctx.beginPath();
        ctx.moveTo(firstX, 0);
        ctx.lineTo(firstX, h);
        ctx.stroke();

        // 快取波形底圖
        waveformImage = ctx.getImageData(0, 0, w, h);
    }

    function drawPlayhead(elapsed) {
        var canvas = document.getElementById('editor-waveform');
        if (!canvas || !waveformImage) return;

        var dpr = window.devicePixelRatio || 1;
        var w = canvasW;
        var h = canvasH;
        var ctx = canvas.getContext('2d');

        // 還原快取的波形底圖（不重新計算尺寸）
        ctx.putImageData(waveformImage, 0, 0);

        // 播放頭
        var px = (elapsed / waveformDuration) * w;
        if (px < 0 || px > w) return;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();

        // 播放頭光暈
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 6 * dpr;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
    }

    function animatePlayhead() {
        var elapsed = AudioEngine.currentTime() - previewStartCtxTime;
        drawPlayhead(elapsed);
        playheadRAF = requestAnimationFrame(animatePlayhead);
    }

    function hideWaveform() {
        var container = document.getElementById('editor-waveform-container');
        if (container) container.classList.add('hidden');
        waveformData = null;
        waveformImage = null;
        canvasW = 0;
        canvasH = 0;
    }

    let previewTotal = 0;

    function startPreview(bpm) {
        stopPreview();
        AudioEngine.getContext();
        previewBeat = 0;
        previewTotal = 0;
        previewNextTime = AudioEngine.currentTime() + 0.05;
        previewStartCtxTime = previewNextTime;
        var btn = document.getElementById('btn-bpm-demo');
        if (btn) { btn.textContent = '⏹'; btn.classList.add('playing'); }
        AudioEngine.playMusic(previewNextTime);
        if (waveformData) animatePlayhead();
        schedulePreview(bpm);
    }

    function schedulePreview(bpm) {
        // 有音樂時播久一點（32拍=4個八拍），方便確認對齊
        var maxBeats = AudioEngine.hasMusic() ? 32 : 16;
        if (previewTotal >= maxBeats) {
            previewTimer = null;
            stopPreview();
            return;
        }
        const ac = AudioEngine.getContext();
        while (previewNextTime < ac.currentTime + 0.1 && previewTotal < maxBeats) {
            const isAccent = (previewBeat % 4 === 0);
            AudioEngine.playBeat(previewNextTime, isAccent);
            previewNextTime += 60.0 / bpm;
            previewBeat = (previewBeat + 1) % 8;
            previewTotal++;
        }
        if (previewTotal < maxBeats) {
            previewTimer = setTimeout(() => schedulePreview(bpm), 25);
        }
    }

    function stopPreview() {
        if (previewTimer) {
            clearTimeout(previewTimer);
            previewTimer = null;
        }
        if (playheadRAF) {
            cancelAnimationFrame(playheadRAF);
            playheadRAF = null;
        }
        AudioEngine.stopMusic();
        // 還原波形底圖（移除播放頭）
        if (waveformImage) {
            var canvas = document.getElementById('editor-waveform');
            if (canvas) canvas.getContext('2d').putImageData(waveformImage, 0, 0);
        }
        var btn = document.getElementById('btn-bpm-demo');
        if (btn) { btn.textContent = '▶'; btn.classList.remove('playing'); }
    }

    function renderSourceList() {
        const list = elSourceList();
        list.innerHTML = '';
        ACTIONS.forEach(action => {
            const wrapper = document.createElement('div');
            wrapper.className = 'source-item-wrapper';

            const el = document.createElement('div');
            const isImage = action.iconType === 'image' && action.imageFileId && OPFS.getCachedURL(action.imageFileId);
            el.className = `source-item${isImage ? ' has-image' : ''}`;
            el.style.borderColor = action.color;
            el.draggable = true;
            el.dataset.actionId = action.id;
            el.innerHTML = `
                ${renderActionIcon(action)}
                <span class="action-name">${action.name}</span>
            `;
            el.addEventListener('dragstart', onSourceDragStart);
            el.addEventListener('dblclick', () => showEditActionDialog(action));
            wrapper.appendChild(el);

            // 所有動作都可刪除
            const delBtn = document.createElement('button');
            delBtn.className = 'source-del-btn';
            delBtn.textContent = '✕';
            delBtn.addEventListener('click', () => {
                showConfirmDialog(
                    `刪除「${action.name}」？`,
                    '所有關卡中使用此動作的格子也會被清空',
                    async () => {
                        await removeAction(action.id);
                        stages.forEach(stage => {
                            for (let i = 0; i < stage.beats.length; i++) {
                                if (stage.beats[i] === action.id) stage.beats[i] = null;
                            }
                        });
                        renderSourceList();
                        renderGrid();
                    }
                );
            });
            wrapper.appendChild(delBtn);

            list.appendChild(wrapper);
        });

        // 「+」新增按鈕
        const addBtn = document.createElement('div');
        addBtn.className = 'source-item source-add-btn';
        addBtn.innerHTML = '<span class="action-icon">＋</span><span class="action-name">新增</span>';
        addBtn.addEventListener('click', showAddActionDialog);
        list.appendChild(addBtn);

    }

    // ====== 新增動作對話框 ======
    function showAddActionDialog() {
        let currentIconType = 'emoji';
        let selectedFile = null;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-box">
                <h3>新增動作</h3>
                <div class="icon-type-tabs">
                    <button class="icon-tab active" data-type="emoji">Emoji</button>
                    <button class="icon-tab" data-type="image">圖片</button>
                </div>
                <div class="modal-field icon-panel" id="panel-emoji">
                    <label>Emoji / 圖示</label>
                    <input type="text" id="new-action-icon" placeholder="例如：👊🦵💪" maxlength="4">
                </div>
                <div class="modal-field icon-panel hidden" id="panel-image">
                    <label>上傳圖片</label>
                    <div class="image-upload-area" id="image-upload-area">
                        <input type="file" id="new-action-image" accept="image/*" style="display:none">
                        <div class="upload-placeholder" id="upload-placeholder">點擊選擇圖片</div>
                        <img class="upload-preview hidden" id="upload-preview">
                    </div>
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

        // 標籤頁切換
        overlay.querySelectorAll('.icon-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                overlay.querySelectorAll('.icon-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentIconType = tab.dataset.type;
                document.getElementById('panel-emoji').classList.toggle('hidden', currentIconType !== 'emoji');
                document.getElementById('panel-image').classList.toggle('hidden', currentIconType !== 'image');
            });
        });

        // 圖片上傳
        const setupUpload = () => {
            const area = document.getElementById('image-upload-area');
            const input = document.getElementById('new-action-image');
            const preview = document.getElementById('upload-preview');
            const placeholder = document.getElementById('upload-placeholder');
            area.addEventListener('click', () => input.click());
            input.addEventListener('change', () => {
                if (input.files && input.files[0]) {
                    selectedFile = input.files[0];
                    const url = URL.createObjectURL(selectedFile);
                    preview.src = url;
                    preview.classList.remove('hidden');
                    placeholder.classList.add('hidden');
                }
            });
        };

        overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        overlay.querySelector('.modal-confirm').addEventListener('click', async () => {
            const name = document.getElementById('new-action-name').value.trim();
            if (!name) return;

            if (currentIconType === 'emoji') {
                const icon = document.getElementById('new-action-icon').value.trim();
                if (!icon) return;
                addAction(name, icon, 'emoji', null);
            } else {
                if (!selectedFile) return;
                const compressed = await OPFS.compressImage(selectedFile);
                const action = addAction(name, '🖼', 'image', null);
                const fileId = action.id + '_img';
                await OPFS.saveImage(fileId, compressed);
                action.imageFileId = fileId;
                saveActions();
            }
            overlay.remove();
            renderSourceList();
        });

        document.body.appendChild(overlay);
        setupUpload();
        document.getElementById('new-action-icon').focus();
    }

    // ====== 編輯動作對話框 ======
    function showEditActionDialog(action) {
        let currentIconType = action.iconType || 'emoji';
        let selectedFile = null;
        const existingImageUrl = (action.iconType === 'image' && action.imageFileId)
            ? OPFS.getCachedURL(action.imageFileId) : null;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-box">
                <h3>編輯動作</h3>
                <div class="icon-type-tabs">
                    <button class="icon-tab ${currentIconType === 'emoji' ? 'active' : ''}" data-type="emoji">Emoji</button>
                    <button class="icon-tab ${currentIconType === 'image' ? 'active' : ''}" data-type="image">圖片</button>
                </div>
                <div class="modal-field icon-panel ${currentIconType !== 'emoji' ? 'hidden' : ''}" id="panel-emoji">
                    <label>Emoji / 圖示</label>
                    <input type="text" id="edit-action-icon" value="${action.iconType === 'emoji' ? action.icon : ''}" maxlength="4">
                </div>
                <div class="modal-field icon-panel ${currentIconType !== 'image' ? 'hidden' : ''}" id="panel-image">
                    <label>上傳圖片</label>
                    <div class="image-upload-area" id="image-upload-area">
                        <input type="file" id="edit-action-image" accept="image/*" style="display:none">
                        <div class="upload-placeholder ${existingImageUrl ? 'hidden' : ''}" id="upload-placeholder">點擊選擇圖片</div>
                        <img class="upload-preview ${existingImageUrl ? '' : 'hidden'}" id="upload-preview" ${existingImageUrl ? 'src="' + existingImageUrl + '"' : ''}>
                    </div>
                </div>
                <div class="modal-field">
                    <label>動作名稱</label>
                    <input type="text" id="edit-action-name" value="${action.name}" maxlength="6">
                </div>
                <div class="modal-buttons">
                    <button class="btn btn-secondary modal-cancel">取消</button>
                    <button class="btn btn-primary modal-confirm">儲存</button>
                </div>
            </div>
        `;

        // 標籤頁切換
        overlay.querySelectorAll('.icon-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                overlay.querySelectorAll('.icon-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentIconType = tab.dataset.type;
                document.getElementById('panel-emoji').classList.toggle('hidden', currentIconType !== 'emoji');
                document.getElementById('panel-image').classList.toggle('hidden', currentIconType !== 'image');
            });
        });

        // 圖片上傳
        const setupUpload = () => {
            const area = document.getElementById('image-upload-area');
            const input = document.getElementById('edit-action-image');
            const preview = document.getElementById('upload-preview');
            const placeholder = document.getElementById('upload-placeholder');
            area.addEventListener('click', () => input.click());
            input.addEventListener('change', () => {
                if (input.files && input.files[0]) {
                    selectedFile = input.files[0];
                    const url = URL.createObjectURL(selectedFile);
                    preview.src = url;
                    preview.classList.remove('hidden');
                    placeholder.classList.add('hidden');
                }
            });
        };

        overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        overlay.querySelector('.modal-confirm').addEventListener('click', async () => {
            const name = document.getElementById('edit-action-name').value.trim();
            if (!name) return;

            if (currentIconType === 'emoji') {
                const icon = document.getElementById('edit-action-icon').value.trim();
                if (!icon) return;
                // 如果之前是圖片，刪除舊圖
                if (action.iconType === 'image' && action.imageFileId) {
                    await OPFS.deleteImage(action.imageFileId);
                }
                updateAction(action.id, name, icon, 'emoji', null);
            } else {
                if (selectedFile) {
                    // 上傳新圖片
                    const compressed = await OPFS.compressImage(selectedFile);
                    const fileId = action.id + '_img';
                    await OPFS.saveImage(fileId, compressed);
                    updateAction(action.id, name, '🖼', 'image', fileId);
                } else if (action.iconType === 'image' && action.imageFileId) {
                    // 保留原圖，只改名稱
                    updateAction(action.id, name, '🖼', 'image', action.imageFileId);
                } else {
                    return; // 沒有圖片可用
                }
            }
            overlay.remove();
            renderSourceList();
            renderGrid();
        });

        document.body.appendChild(overlay);
        setupUpload();
        if (currentIconType === 'emoji') {
            document.getElementById('edit-action-icon').focus();
        }
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
            } else {
                box.innerHTML = '<span class="beat-placeholder">拖入</span>';
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
        const isImage = action.iconType === 'image' && action.imageFileId && OPFS.getCachedURL(action.imageFileId);
        box.className = `beat-box has-action action-${action.id}${isImage ? ' has-image' : ''}`;
        box.innerHTML = `
            ${renderActionIcon(action)}
            <span class="action-name">${action.name}</span>
        `;
        box.dataset.actionId = actionId;
    }

    function clearBox(box) {
        box.className = 'beat-box';
        box.innerHTML = '<span class="beat-placeholder">拖入</span>';
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
        const btn = document.getElementById('btn-save');
        const orig = btn.textContent;
        btn.textContent = '✓ 已儲存';
        btn.style.background = '#27ae60';
        setTimeout(() => {
            btn.textContent = orig;
            btn.style.background = '';
        }, 1200);
    }

    function resetToDefault() {
        showConfirmDialog('確定要還原預設嗎？', '動作素材、關卡配置、BPM 都會被重設', async () => {
            await resetActions();
            stages = JSON.parse(JSON.stringify(DEFAULT_STAGES));
            currentStageIndex = 0;
            const slider = document.getElementById('editor-bpm');
            const value = document.getElementById('editor-bpm-value');
            slider.value = 120;
            value.textContent = '120';
            updateBpmSeconds(120);
            renderSourceList();
            renderGrid();
            updateIndicator();
        });
    }

    function showConfirmDialog(title, message, onConfirm) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-box">
                <h3>${title}</h3>
                <p style="color:#999;font-size:14px;text-align:center">${message}</p>
                <div class="modal-buttons">
                    <button class="btn btn-secondary modal-cancel">取消</button>
                    <button class="btn btn-outline-danger modal-confirm">確定還原</button>
                </div>
            </div>
        `;
        overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
        overlay.querySelector('.modal-confirm').addEventListener('click', () => {
            overlay.remove();
            onConfirm();
        });
        document.body.appendChild(overlay);
    }

    return { init, prevStage, nextStage, addStage, deleteStage, randomFill, save, stopPreview, resetToDefault };
})();
