/**
 * app.js - 主程式：畫面切換、事件綁定
 */

(async () => {
    // 預先載入所有 OPFS 圖片快取
    await OPFS.preloadAll();

    // 還原已儲存的音樂
    const musicMeta = loadMusicMeta();
    if (musicMeta) {
        try {
            const musicFile = await OPFS.loadMusic();
            if (musicFile) {
                const ac = AudioEngine.getContext();
                const arrayBuf = await musicFile.arrayBuffer();
                const audioBuf = await ac.decodeAudioData(arrayBuf);
                AudioEngine.setMusic(audioBuf, musicMeta.name, musicMeta.offset || 0);
            }
        } catch (e) {
            console.warn('Music restore failed', e);
        }
    }

    const screens = {
        home: document.getElementById('screen-home'),
        editor: document.getElementById('screen-editor'),
        game: document.getElementById('screen-game'),
    };

    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');

        if (name === 'editor') Editor.init();
        if (name === 'game') Game.init();
        if (name !== 'editor') Editor.stopPreview();
        if (name !== 'game') Game.stop();
    }

    // 首頁按鈕
    document.getElementById('btn-start').addEventListener('click', () => showScreen('game'));
    document.getElementById('btn-settings').addEventListener('click', () => showScreen('editor'));

    // 編輯器按鈕
    document.getElementById('btn-editor-back').addEventListener('click', () => showScreen('home'));
    document.getElementById('btn-prev-stage').addEventListener('click', () => Editor.prevStage());
    document.getElementById('btn-next-stage').addEventListener('click', () => Editor.nextStage());
    document.getElementById('btn-add-stage').addEventListener('click', () => Editor.addStage());
    document.getElementById('btn-del-stage').addEventListener('click', () => Editor.deleteStage());
    document.getElementById('btn-random').addEventListener('click', () => Editor.randomFill());
    document.getElementById('btn-reset-actions').addEventListener('click', () => Editor.resetToDefault());
    document.getElementById('btn-save').addEventListener('click', () => Editor.save());

    // 遊戲模式按鈕
    document.getElementById('btn-game-back').addEventListener('click', () => {
        Game.destroy();
        showScreen('home');
    });
    document.getElementById('btn-play').addEventListener('click', () => Game.toggle());
    document.getElementById('btn-complete-home').addEventListener('click', () => {
        Game.destroy();
        showScreen('home');
    });
})();
