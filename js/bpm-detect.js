/**
 * bpm-detect.js - 從音樂檔案自動偵測 BPM 與第一拍位置
 *
 * 演算法：
 * 1. 降混單聲道 → 多頻段濾波（低頻 kick + 中頻 snare）
 * 2. 各頻段計算能量包絡 → 取正向差分（onset 函數）
 * 3. 合併多頻段 onset → 自相關(Autocorrelation)找最強週期 → BPM
 * 4. 拋物線插值提高精度 + 倍頻修正避免八度誤判
 * 5. 相位掃描(Phase Scan)找出第一拍最佳對齊位置 → offset
 */
const BPMDetector = (() => {

    async function detect(file) {
        const ac = AudioEngine.getContext();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ac.decodeAudioData(arrayBuffer);

        const result = analyzeBPM(audioBuffer);

        AudioEngine.setMusic(audioBuffer, file.name, result.offset);
        return result;
    }

    function analyzeBPM(buffer) {
        const sampleRate = buffer.sampleRate;
        const mono = getMono(buffer);

        // --- Step 1: 多頻段濾波 ---
        const lowBand = bandPassFilter(mono, sampleRate, 40, 160);   // kick
        const midBand = bandPassFilter(mono, sampleRate, 300, 3000); // snare/hats

        // --- Step 2: 計算能量包絡 + onset 函數 ---
        const intervalSize = Math.round(sampleRate * 0.01); // 10ms 區間
        const lowEnv = computeEnvelope(lowBand, intervalSize);
        const midEnv = computeEnvelope(midBand, intervalSize);
        const lowOnset = positiveDerivative(lowEnv);
        const midOnset = positiveDerivative(midEnv);

        // 合併（低頻權重較高，因為 kick 最能代表節拍）
        const onsetLen = Math.min(lowOnset.length, midOnset.length);
        const onset = new Float32Array(onsetLen);
        for (let i = 0; i < onsetLen; i++) {
            onset[i] = lowOnset[i] * 0.7 + midOnset[i] * 0.3;
        }

        // 正規化
        let maxVal = 0;
        for (let i = 0; i < onset.length; i++) {
            if (onset[i] > maxVal) maxVal = onset[i];
        }
        if (maxVal > 0) {
            for (let i = 0; i < onset.length; i++) onset[i] /= maxVal;
        }

        const frameRate = sampleRate / intervalSize; // 100 幀/秒

        // --- Step 3: 自相關找最強週期 ---
        const minLag = Math.round(frameRate * 60 / 300); // 300 BPM → 20 幀
        const maxLag = Math.round(frameRate * 60 / 60);  // 60 BPM → 100 幀
        const { bestLag, acResult } = autocorrelate(onset, minLag, maxLag);

        let bpm = Math.round(frameRate * 60 / bestLag);

        // --- Step 4: 倍頻修正 ---
        bpm = resolveOctave(bpm, bestLag, acResult, minLag, maxLag, frameRate);
        bpm = Math.max(60, Math.min(300, bpm));

        // --- Step 5: 相位掃描找最佳第一拍 offset ---
        const beatPeriodFrames = frameRate * 60 / bpm;
        const offset = findBeatPhase(onset, beatPeriodFrames, frameRate);

        return { bpm, offset, onset, frameRate, beatPeriodFrames };
    }

    // ===== 降混單聲道 =====
    function getMono(buffer) {
        if (buffer.numberOfChannels === 1) {
            return buffer.getChannelData(0);
        }
        const ch0 = buffer.getChannelData(0);
        const ch1 = buffer.getChannelData(1);
        const mono = new Float32Array(ch0.length);
        for (let i = 0; i < ch0.length; i++) {
            mono[i] = (ch0[i] + ch1[i]) * 0.5;
        }
        return mono;
    }

    // ===== 帶通濾波（二階 Butterworth 近似）=====
    // lowCut/highCut 為截止頻率(Hz)
    function bandPassFilter(data, sampleRate, lowCut, highCut) {
        // 先高通再低通
        const hp = highPassOnepole(data, sampleRate, lowCut);
        return lowPassOnepole(hp, sampleRate, highCut);
    }

    function lowPassOnepole(data, sampleRate, cutoff) {
        const rc = 1.0 / (2.0 * Math.PI * cutoff);
        const dt = 1.0 / sampleRate;
        const alpha = dt / (rc + dt);
        const out = new Float32Array(data.length);
        out[0] = data[0] * alpha;
        for (let i = 1; i < data.length; i++) {
            out[i] = out[i - 1] + alpha * (data[i] - out[i - 1]);
        }
        return out;
    }

    function highPassOnepole(data, sampleRate, cutoff) {
        const rc = 1.0 / (2.0 * Math.PI * cutoff);
        const dt = 1.0 / sampleRate;
        const alpha = rc / (rc + dt);
        const out = new Float32Array(data.length);
        out[0] = data[0];
        for (let i = 1; i < data.length; i++) {
            out[i] = alpha * (out[i - 1] + data[i] - data[i - 1]);
        }
        return out;
    }

    // ===== 能量包絡 =====
    function computeEnvelope(data, intervalSize) {
        const len = Math.floor(data.length / intervalSize);
        const envelope = new Float32Array(len);
        for (let i = 0; i < len; i++) {
            let sum = 0;
            const off = i * intervalSize;
            for (let j = 0; j < intervalSize; j++) {
                const v = data[off + j];
                sum += v * v;
            }
            envelope[i] = Math.sqrt(sum / intervalSize);
        }
        return envelope;
    }

    // ===== 正向差分（只取能量上升的部分 = onset） =====
    function positiveDerivative(envelope) {
        const out = new Float32Array(envelope.length);
        for (let i = 1; i < envelope.length; i++) {
            const diff = envelope[i] - envelope[i - 1];
            out[i] = diff > 0 ? diff : 0;
        }
        return out;
    }

    // ===== 自相關 =====
    function autocorrelate(signal, minLag, maxLag) {
        const len = signal.length;
        const acResult = new Float32Array(maxLag + 1);

        for (let lag = minLag; lag <= maxLag; lag++) {
            let sum = 0;
            const count = len - lag;
            for (let i = 0; i < count; i++) {
                sum += signal[i] * signal[i + lag];
            }
            acResult[lag] = sum / count;
        }

        // 找最大自相關值的 lag
        let bestLag = minLag;
        let bestVal = -Infinity;
        for (let lag = minLag; lag <= maxLag; lag++) {
            if (acResult[lag] > bestVal) {
                bestVal = acResult[lag];
                bestLag = lag;
            }
        }

        // 拋物線插值提高精度（可得到小數 lag）
        if (bestLag > minLag && bestLag < maxLag) {
            const y0 = acResult[bestLag - 1];
            const y1 = acResult[bestLag];
            const y2 = acResult[bestLag + 1];
            const denom = 2 * (2 * y1 - y0 - y2);
            if (denom !== 0) {
                const shift = (y0 - y2) / denom;
                bestLag = bestLag + Math.max(-0.5, Math.min(0.5, shift));
            }
        }

        return { bestLag, acResult };
    }

    // ===== 倍頻修正 =====
    // 自相關在諧波關係的 lag 都會有峰值（lag, lag*2, lag/2...），
    // 單靠門檻比例無法正確選擇。
    // 策略：收集所有候選 lag（原始 + 倍/半頻），
    //        用「自相關強度 × 節奏範圍權重」綜合評分選出最佳。
    function resolveOctave(bpm, bestLag, acResult, minLag, maxLag, frameRate) {
        // 收集候選 lag：原始、×2、×3、/2、/3
        const multipliers = [1/3, 1/2, 1, 2, 3];
        let bestScore = -Infinity;
        let bestBPM = bpm;

        for (const mul of multipliers) {
            const candidateLag = Math.round(bestLag * mul);
            if (candidateLag < minLag || candidateLag > maxLag) continue;

            const acVal = getLagValue(acResult, candidateLag, minLag, maxLag);
            if (acVal <= 0) continue;

            const candidateBPM = Math.round(frameRate * 60 / candidateLag);
            if (candidateBPM < 60 || candidateBPM > 300) continue;

            // 節奏範圍權重：高斯分布，中心 120 BPM，σ=50
            // 80~160 BPM 得到最高權重，偏離越遠扣分越多
            const diff = candidateBPM - 120;
            const tempoWeight = Math.exp(-(diff * diff) / (2 * 50 * 50));

            // 正規化自相關值（相對於最大峰值）
            const normAC = acVal / getLagValue(acResult, bestLag, minLag, maxLag);

            const score = normAC * tempoWeight;

            if (score > bestScore) {
                bestScore = score;
                bestBPM = candidateBPM;
            }
        }

        return bestBPM;
    }

    function getLagValue(acResult, lag, minLag, maxLag) {
        const r = Math.round(lag);
        if (r < minLag || r > maxLag) return 0;
        return acResult[r] || 0;
    }

    // ===== 相位掃描 + 跳過靜音 =====
    // 1. 相位掃描找出全局最佳的節拍 grid 對齊方式
    // 2. 偵測音樂實際開始的位置（跳過前面的靜音）
    // 3. 回傳 grid 上第一個落在有聲音區域的拍點
    function findBeatPhase(onsetFunc, beatPeriodFrames, frameRate) {
        const len = onsetFunc.length;
        const period = beatPeriodFrames;
        const steps = Math.min(Math.ceil(period), 200);

        // Step 1: 相位掃描 — 找最佳 grid 對齊
        let bestPhase = 0;
        let bestScore = -Infinity;

        for (let p = 0; p < steps; p++) {
            const phase = p * period / steps;
            let score = 0;
            let count = 0;

            for (let pos = phase; pos < len; pos += period) {
                const idx = Math.round(pos);
                if (idx >= 0 && idx < len) {
                    score += onsetFunc[idx];
                    count++;
                }
            }

            if (count > 0) score /= count;

            if (score > bestScore) {
                bestScore = score;
                bestPhase = phase;
            }
        }

        // Step 2: 找音樂實際開始的位置（能量超過峰值 5% 的第一個幀）
        let maxOnset = 0;
        for (let i = 0; i < len; i++) {
            if (onsetFunc[i] > maxOnset) maxOnset = onsetFunc[i];
        }
        const silenceThreshold = maxOnset * 0.05;
        let musicStart = 0;
        for (let i = 0; i < len; i++) {
            if (onsetFunc[i] > silenceThreshold) {
                musicStart = i;
                break;
            }
        }

        // Step 3: 在 grid 上找第一個 >= musicStart 的拍點
        let firstBeat = bestPhase;
        while (firstBeat < musicStart - period * 0.5) {
            firstBeat += period;
        }

        return Math.max(0, firstBeat / frameRate);
    }

    /** 從已載入的 AudioBuffer 重新分析（用於頁面還原波形） */
    function reanalyze() {
        const buf = AudioEngine.getMusicBuffer();
        if (!buf) return null;
        return analyzeBPM(buf);
    }

    return { detect, reanalyze };
})();
