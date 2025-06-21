/**
 * LibRaw WebAssembly JavaScript Interface
 * High-level wrapper for the LibRaw WASM module
 */

export class LibRawJS {
    constructor() {
        this.module = null;
        this.instance = null;
        this.ready = false;
    }

    /**
     * Initialize the LibRaw WASM module
     * @param {string|Module} moduleOrPath - Path to the WASM module or pre-loaded module
     * @returns {Promise<void>}
     */
    async init(moduleOrPath) {
        if (typeof moduleOrPath === 'string') {
            // Dynamic import of the ES6 module
            const LibRawModule = await import(moduleOrPath);
            this.module = await LibRawModule.default();
        } else {
            // Pre-loaded module
            this.module = moduleOrPath;
        }
        
        this.ready = true;
    }

    /**
     * Load a RAW file from an ArrayBuffer
     * @param {ArrayBuffer} buffer - The RAW file data
     * @returns {LibRawImage} A new LibRawImage instance
     */
    async loadRAW(buffer) {
        if (!this.ready) {
            throw new Error('LibRaw not initialized. Call init() first.');
        }

        const image = new LibRawImage(this.module);
        await image.load(buffer);
        return image;
    }

    /**
     * Get LibRaw version
     * @returns {string} Version string
     */
    getVersion() {
        if (!this.ready) return 'Not initialized';
        return this.module.LibRaw.getVersion();
    }

    /**
     * Get number of supported cameras
     * @returns {number} Camera count
     */
    getCameraCount() {
        if (!this.ready) return 0;
        return this.module.LibRaw.getCameraCount();
    }

    /**
     * Get list of supported cameras
     * @returns {string[]} Array of camera model names
     */
    getCameraList() {
        if (!this.ready) return [];
        return this.module.LibRaw.getCameraList();
    }
}

/**
 * Represents a loaded RAW image
 */
export class LibRawImage {
    constructor(module) {
        this.module = module;
        this.processor = new module.LibRaw();
        this.loaded = false;
        this.processed = false;
    }

    /**
     * Load RAW data from ArrayBuffer
     * @param {ArrayBuffer} buffer - RAW file data
     * @returns {Promise<boolean>} Success status
     */
    async load(buffer) {
        // Convert ArrayBuffer to Uint8Array for binary-safe loading
        const uint8Array = new Uint8Array(buffer);
        
        // Try new Uint8Array method first, fallback to string method
        let loaded = false;
        
        if (typeof this.processor.loadFromUint8Array === 'function') {
            // Use the new binary-safe method
            loaded = this.processor.loadFromUint8Array(uint8Array);
        } else {
            // Fallback to string method (deprecated)
            console.warn('Using deprecated string loading method. Consider rebuilding WASM module.');
            const binaryString = Array.from(uint8Array)
                .map(byte => String.fromCharCode(byte))
                .join('');
            loaded = this.processor.loadFromMemory(binaryString);
        }
        
        this.loaded = loaded;
        if (!this.loaded) {
            throw new Error('Failed to load RAW file');
        }
        
        // Unpack the RAW data
        const unpacked = this.processor.unpack();
        if (!unpacked) {
            throw new Error('Failed to unpack RAW data');
        }
        
        return true;
    }

    /**
     * Process the RAW image with given options
     * @param {Object} options - Processing options
     * @returns {Promise<void>}
     */
    async process(options = {}) {
        if (!this.loaded) {
            throw new Error('No image loaded');
        }

        // Apply processing options
        if (options.useAutoWB !== undefined) {
            this.processor.setUseAutoWB(options.useAutoWB);
        }
        if (options.useCameraWB !== undefined) {
            this.processor.setUseCameraWB(options.useCameraWB);
        }
        if (options.outputColor !== undefined) {
            this.processor.setOutputColor(options.outputColor);
        }
        if (options.brightness !== undefined) {
            this.processor.setBrightness(options.brightness);
        }
        if (options.quality !== undefined) {
            this.processor.setQuality(options.quality);
        }
        if (options.halfSize !== undefined) {
            this.processor.setHalfSize(options.halfSize);
        }

        // Process the image
        const success = this.processor.process();
        if (!success) {
            throw new Error('Failed to process image: ' + this.processor.getLastError());
        }
        
        this.processed = true;
    }

    /**
     * Get processed image data
     * @returns {ImageData|null} Processed image data or null
     */
    getImageData() {
        if (!this.processed) {
            throw new Error('Image not processed. Call process() first.');
        }

        const data = this.processor.getImageData();
        if (!data) {
            return null;
        }

        // Convert to ImageData format
        const imageData = {
            width: data.width,
            height: data.height,
            data: data.data,
            colorSpace: 'srgb'
        };

        return imageData;
    }

    /**
     * Get image as data URL
     * @param {string} format - Output format ('png' or 'jpeg')
     * @param {number} quality - JPEG quality (0-1)
     * @returns {Promise<string>} Data URL
     */
    async getDataURL(format = 'png', quality = 0.92) {
        const imageData = this.getImageData();
        if (!imageData) {
            throw new Error('No image data available');
        }

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');

        // Convert RGB to RGBA
        const rgbaData = new Uint8ClampedArray(imageData.width * imageData.height * 4);
        const rgbData = imageData.data;
        
        for (let i = 0, j = 0; i < rgbData.length; i += 3, j += 4) {
            rgbaData[j] = rgbData[i];     // R
            rgbaData[j + 1] = rgbData[i + 1]; // G
            rgbaData[j + 2] = rgbData[i + 2]; // B
            rgbaData[j + 3] = 255;        // A
        }

        // Create ImageData and draw to canvas
        const canvasImageData = new ImageData(rgbaData, imageData.width, imageData.height);
        ctx.putImageData(canvasImageData, 0, 0);

        // Convert to data URL
        return canvas.toDataURL(`image/${format}`, quality);
    }

    /**
     * Get image metadata
     * @returns {Object} Metadata object
     */
    getMetadata() {
        if (!this.loaded) {
            throw new Error('No image loaded');
        }

        return this.processor.getMetadata();
    }

    /**
     * Get thumbnail if available
     * @returns {Object|null} Thumbnail data or null
     */
    getThumbnail() {
        if (!this.loaded) {
            return null;
        }

        return this.processor.getThumbnail();
    }

    /**
     * Get thumbnail as data URL
     * @returns {Promise<string|null>} Thumbnail data URL or null
     */
    async getThumbnailDataURL() {
        const thumb = this.getThumbnail();
        if (!thumb || thumb.format !== 'jpeg') {
            return null;
        }

        // Create blob from JPEG data
        const blob = new Blob([thumb.data], { type: 'image/jpeg' });
        return URL.createObjectURL(blob);
    }

    /**
     * Cleanup resources
     */
    dispose() {
        if (this.processor) {
            this.processor.delete();
            this.processor = null;
        }
        this.loaded = false;
        this.processed = false;
    }
}

// Export color space constants
export const ColorSpace = {
    RAW: 0,
    SRGB: 1,
    ADOBE_RGB: 2,
    WIDE_GAMUT: 3,
    PROPHOTO_RGB: 4,
    XYZ: 5
};

// Export quality constants
export const Quality = {
    LINEAR: 0,
    VNG: 1,
    PPG: 2,
    AHD: 3,
    DCB: 4,
    DHT: 11
};