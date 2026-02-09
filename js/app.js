/**
 * app.js - 主程式：畫面切換、事件綁定
 */

(() => {
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
