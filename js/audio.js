/**
 * audio.js - Web Audio API 音效合成
 */

const AudioEngine = (() => {
    let ctx = null;

    function getContext() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function currentTime() {
        return getContext().currentTime;
    }

    /**
     * 播放一個節拍音效
     * @param {number} time - AudioContext 時間
     * @param {boolean} isAccent - 是否為重音（第1、5拍）
     */
    function playBeat(time, isAccent) {
        const ac = getContext();

        // 主音（電子鼓風格）
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(isAccent ? 880 : 660, time);
        osc.frequency.exponentialRampToValueAtTime(isAccent ? 440 : 330, time + 0.08);

        gain.gain.setValueAtTime(isAccent ? 0.45 : 0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

        osc.start(time);
        osc.stop(time + 0.12);

        // 重音加 sub bass + 噪音層
        if (isAccent) {
            // Sub bass
            const sub = ac.createOscillator();
            const subGain = ac.createGain();
            sub.connect(subGain);
            subGain.connect(ac.destination);
            sub.type = 'sine';
            sub.frequency.setValueAtTime(120, time);
            subGain.gain.setValueAtTime(0.35, time);
            subGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
            sub.start(time);
            sub.stop(time + 0.15);

            // 噪音（模擬鼓皮打擊感）
            const bufferSize = ac.sampleRate * 0.05;
            const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
            }
            const noise = ac.createBufferSource();
            const noiseGain = ac.createGain();
            const filter = ac.createBiquadFilter();
            noise.buffer = buffer;
            filter.type = 'highpass';
            filter.frequency.value = 1000;
            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(ac.destination);
            noiseGain.gain.setValueAtTime(0.25, time);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
            noise.start(time);
        }

        // 輕拍也加一點 click 感
        if (!isAccent) {
            const click = ac.createOscillator();
            const clickGain = ac.createGain();
            click.connect(clickGain);
            clickGain.connect(ac.destination);
            click.type = 'triangle';
            click.frequency.setValueAtTime(1200, time);
            click.frequency.exponentialRampToValueAtTime(600, time + 0.02);
            clickGain.gain.setValueAtTime(0.15, time);
            clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
            click.start(time);
            click.stop(time + 0.04);
        }
    }

    /**
     * 播放完成音效
     */
    function playComplete(time) {
        const ac = getContext();
        const t = time || ac.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain);
            gain.connect(ac.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, t + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.4);
            osc.start(t + i * 0.12);
            osc.stop(t + i * 0.12 + 0.4);
        });
    }

    return { getContext, currentTime, playBeat, playComplete };
})();
