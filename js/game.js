/**
 * game.js - 遊戲模式：節拍引擎、亮燈、Stage 切換
 * 每個八拍播兩次：第一次「看」、第二次「做」
 */

const Game = (() => {
    let stages = [];
    let currentStageIndex = 0;
    let currentBeat = 0;
    let currentRound = 1; // 1 = 看, 2 = 做
    let isPlaying = false;
    let nextNoteTime = 0;
    let schedulerTimer = null;
    let bpm = 120;

    const SCHEDULE_AHEAD = 0.1;
    const LOOKAHEAD_MS = 25;

    // DOM references
    const elRow1 = () => document.getElementById('game-row1');
    const elRow2 = () => document.getElementById('game-row2');
    const elStageInfo = () => document.getElementById('game-stage-info');
    const elRoundLabel = () => document.getElementById('game-round-label');
    const elPlayBtn = () => document.getElementById('btn-play');
    const elComplete = () => document.getElementById('game-complete');

    let boxes = [];

    function init() {
        stages = loadStages();
        bpm = loadBPM();
        currentStageIndex = 0;
        currentBeat = 0;
        currentRound = 1;
        isPlaying = false;

        elComplete().classList.add('hidden');
        renderStage();
    }

    function renderStage() {
        const row1 = elRow1();
        const row2 = elRow2();
        row1.innerHTML = '';
        row2.innerHTML = '';
        boxes = [];

        if (currentStageIndex >= stages.length) {
            showComplete();
            return;
        }

        const stage = stages[currentStageIndex];
        elStageInfo().textContent = `${currentStageIndex + 1} / ${stages.length}`;
        updateRoundLabel();

        for (let i = 0; i < 8; i++) {
            const box = document.createElement('div');
            box.className = 'beat-box';
            const actionId = stage.beats[i];
            const action = actionId ? getActionById(actionId) : null;

            if (action) {
                const isImage = action.iconType === 'image' && action.imageFileId && OPFS.getCachedURL(action.imageFileId);
                box.classList.add(`action-${action.id}`);
                if (isImage) box.classList.add('has-image');
                box.innerHTML = `
                    ${renderActionIcon(action)}
                    <span class="action-name">${action.name}</span>
                `;
            }

            if (i < 4) row1.appendChild(box);
            else row2.appendChild(box);
            boxes.push(box);
        }
    }

    function updateRoundLabel() {
        const label = elRoundLabel();
        if (currentRound === 1) {
            label.textContent = '👀 看';
            label.className = 'game-round-label round-watch';
        } else {
            label.textContent = '🏃 做';
            label.className = 'game-round-label round-do';
        }
    }

    function start() {
        if (stages.length === 0) return;

        AudioEngine.getContext();
        isPlaying = true;
        currentBeat = 0;
        currentRound = 1;
        nextNoteTime = AudioEngine.currentTime() + 0.1;
        elPlayBtn().textContent = '⏹ 停止';
        updateRoundLabel();
        AudioEngine.playMusic(nextNoteTime);
        scheduler();
    }

    function stop() {
        isPlaying = false;
        clearTimeout(schedulerTimer);
        AudioEngine.stopMusic();
        boxes.forEach(b => b.classList.remove('active'));
        elPlayBtn().textContent = '▶ 播放';
        elRoundLabel().classList.add('hidden');
    }

    function scheduler() {
        if (!isPlaying) return;
        const ac = AudioEngine.getContext();

        while (nextNoteTime < ac.currentTime + SCHEDULE_AHEAD) {
            if (currentBeat >= 8) {
                if (currentRound === 1) {
                    // 第一次（看）結束，直接無縫接第二次（做）
                    currentRound = 2;
                    currentBeat = 0;
                    const switchDelay = (nextNoteTime - ac.currentTime) * 1000;
                    setTimeout(() => {
                        if (!isPlaying) return;
                        updateRoundLabel();
                        boxes.forEach(b => b.classList.remove('active'));
                    }, Math.max(0, switchDelay));
                    // 不暫停，繼續排程
                    continue;
                } else {
                    // 第二次（做）結束，無縫切換下一個 Stage
                    currentStageIndex++;
                    if (currentStageIndex >= stages.length) {
                        const delay = (nextNoteTime - ac.currentTime) * 1000;
                        setTimeout(() => {
                            if (!isPlaying) return;
                            stop();
                            showComplete();
                        }, Math.max(0, delay));
                        return;
                    }
                    currentRound = 1;
                    currentBeat = 0;
                    const switchDelay = (nextNoteTime - ac.currentTime) * 1000;
                    setTimeout(() => {
                        if (!isPlaying) return;
                        renderStage();
                    }, Math.max(0, switchDelay));
                    // 不暫停，繼續排程
                    continue;
                }
            }

            scheduleBeat(currentBeat, nextNoteTime);
            nextNoteTime += 60.0 / bpm;
            currentBeat++;
        }

        schedulerTimer = setTimeout(scheduler, LOOKAHEAD_MS);
    }

    function scheduleBeat(beat, time) {
        const isAccent = (beat === 0 || beat === 4);
        AudioEngine.playBeat(time, isAccent);

        const delay = (time - AudioEngine.currentTime()) * 1000;
        setTimeout(() => {
            if (!isPlaying && beat !== 0) return;
            boxes.forEach(b => b.classList.remove('active'));
            if (boxes[beat]) boxes[beat].classList.add('active');
        }, Math.max(0, delay));
    }

    function showComplete() {
        AudioEngine.playComplete();
        elComplete().classList.remove('hidden');
        elRoundLabel().classList.add('hidden');
    }

    function toggle() {
        if (isPlaying) {
            stop();
        } else {
            if (currentStageIndex >= stages.length) {
                currentStageIndex = 0;
                elComplete().classList.add('hidden');
                renderStage();
            }
            start();
        }
    }

    function destroy() {
        stop();
    }

    return { init, toggle, destroy, stop };
})();
