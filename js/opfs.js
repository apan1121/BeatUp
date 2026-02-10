/**
 * opfs.js - Origin Private File System 圖片管理模組
 */

const OPFS = (() => {
    const DIR_NAME = 'action-images';
    const MAX_SIZE = 256;
    const _urlCache = new Map();

    async function getImagesDir() {
        const root = await navigator.storage.getDirectory();
        return await root.getDirectoryHandle(DIR_NAME, { create: true });
    }

    /**
     * 壓縮圖片到 MAX_SIZE x MAX_SIZE 以內
     */
    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;
                // 取正方形裁切（cover 邏輯）
                const size = Math.min(w, h);
                const sx = (w - size) / 2;
                const sy = (h - size) / 2;
                canvas.width = MAX_SIZE;
                canvas.height = MAX_SIZE;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, sx, sy, size, size, 0, 0, MAX_SIZE, MAX_SIZE);
                canvas.toBlob(blob => {
                    if (blob) resolve(blob);
                    else reject(new Error('compress failed'));
                }, 'image/png');
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('image load failed'));
            };
            img.src = url;
        });
    }

    async function saveImage(fileId, blob) {
        const dir = await getImagesDir();
        const handle = await dir.getFileHandle(fileId, { create: true });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        // 更新快取
        if (_urlCache.has(fileId)) {
            URL.revokeObjectURL(_urlCache.get(fileId));
        }
        const file = await handle.getFile();
        const objUrl = URL.createObjectURL(file);
        _urlCache.set(fileId, objUrl);
        return objUrl;
    }

    async function loadImageAsURL(fileId) {
        if (_urlCache.has(fileId)) return _urlCache.get(fileId);
        try {
            const dir = await getImagesDir();
            const handle = await dir.getFileHandle(fileId);
            const file = await handle.getFile();
            const objUrl = URL.createObjectURL(file);
            _urlCache.set(fileId, objUrl);
            return objUrl;
        } catch (e) {
            return null;
        }
    }

    async function deleteImage(fileId) {
        try {
            if (_urlCache.has(fileId)) {
                URL.revokeObjectURL(_urlCache.get(fileId));
                _urlCache.delete(fileId);
            }
            const dir = await getImagesDir();
            await dir.removeEntry(fileId);
        } catch (e) { /* ignore */ }
    }

    async function clearAll() {
        _urlCache.forEach(url => URL.revokeObjectURL(url));
        _urlCache.clear();
        try {
            const root = await navigator.storage.getDirectory();
            await root.removeEntry(DIR_NAME, { recursive: true });
        } catch (e) { /* ignore */ }
    }

    async function preloadAll() {
        for (const action of ACTIONS) {
            if (action.iconType === 'image' && action.imageFileId) {
                await loadImageAsURL(action.imageFileId);
            }
        }
    }

    function getCachedURL(fileId) {
        return _urlCache.get(fileId) || null;
    }

    return { compressImage, saveImage, loadImageAsURL, deleteImage, clearAll, preloadAll, getCachedURL };
})();
