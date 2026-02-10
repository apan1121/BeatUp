/**
 * bpm-detect.js - 從音樂檔案自動偵測 BPM 與第一拍位置
 */
const BPMDetector = (() => {

    async function detect(file) {
        // 用共享 AudioContext 解碼（只解碼一次）
        const ac = AudioEngine.getContext();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ac.decodeAudioData(arrayBuffer);

        // 分析 BPM 與第一拍 offset
        const result = analyzeBPM(audioBuffer);

        // 將解碼結果存入 AudioEngine 供播放
        AudioEngine.setMusic(audioBuffer, file.name, result.offset);

        return result;
    }

    function analyzeBPM(buffer) {
        const channelData = getMono(buffer);
        const filtered = lowPassFilter(channelData, buffer.sampleRate);

        const sampleRate = buffer.sampleRate;
        const intervalSize = Math.round(sampleRate * 0.01); // 10ms 區間
        const envelope = computeEnvelope(filtered, intervalSize);
        const peaks = detectPeaks(envelope);
        const bpm = computeBPMFromPeaks(peaks, intervalSize, sampleRate);

        // 第一拍在音訊中的秒數位置
        const offset = peaks.length > 0
            ? (peaks[0] * intervalSize) / sampleRate
            : 0;

        return { bpm, offset };
    }

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

    function lowPassFilter(data, sampleRate) {
        const rc = 1.0 / (2.0 * Math.PI * 150);
        const dt = 1.0 / sampleRate;
        const alpha = dt / (rc + dt);
        const out = new Float32Array(data.length);
        out[0] = data[0];
        for (let i = 1; i < data.length; i++) {
            out[i] = out[i - 1] + alpha * (data[i] - out[i - 1]);
        }
        return out;
    }

    function computeEnvelope(data, intervalSize) {
        const len = Math.floor(data.length / intervalSize);
        const envelope = new Float32Array(len);
        for (let i = 0; i < len; i++) {
            let sum = 0;
            const offset = i * intervalSize;
            for (let j = 0; j < intervalSize; j++) {
                const v = data[offset + j];
                sum += v * v;
            }
            envelope[i] = Math.sqrt(sum / intervalSize);
        }
        return envelope;
    }

    function detectPeaks(envelope) {
        const windowSize = 100;
        const peaks = [];

        for (let i = windowSize; i < envelope.length - windowSize; i++) {
            let sum = 0;
            for (let j = i - windowSize; j < i + windowSize; j++) {
                sum += envelope[j];
            }
            const avg = sum / (windowSize * 2);
            const threshold = avg * 1.4;

            if (envelope[i] > threshold &&
                envelope[i] >= envelope[i - 1] &&
                envelope[i] >= envelope[i + 1]) {
                if (peaks.length === 0 || (i - peaks[peaks.length - 1]) > 20) {
                    peaks.push(i);
                }
            }
        }

        return peaks;
    }

    function computeBPMFromPeaks(peaks, intervalSize, sampleRate) {
        if (peaks.length < 2) return 120;

        const intervals = [];
        for (let i = 1; i < peaks.length; i++) {
            intervals.push(peaks[i] - peaks[i - 1]);
        }

        const secondsPerInterval = intervalSize / sampleRate;
        const bpmCounts = {};

        for (const interval of intervals) {
            const seconds = interval * secondsPerInterval;
            let bpm = Math.round(60 / seconds);

            while (bpm > 300) bpm = Math.round(bpm / 2);
            while (bpm < 60) bpm *= 2;

            if (bpm >= 60 && bpm <= 300) {
                const key = bpm;
                bpmCounts[key] = (bpmCounts[key] || 0) + 1;
            }
        }

        let bestBPM = 120;
        let bestScore = 0;
        const bpmKeys = Object.keys(bpmCounts).map(Number).sort((a, b) => a - b);

        for (const bpm of bpmKeys) {
            let score = 0;
            for (const other of bpmKeys) {
                if (Math.abs(other - bpm) <= 2) {
                    score += bpmCounts[other];
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestBPM = bpm;
            }
        }

        return Math.max(60, Math.min(300, bestBPM));
    }

    return { detect };
})();
