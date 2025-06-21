#!/usr/bin/env node
/**
 * LibRaw Sony ARW Test with Uint8Array (Binary-safe method)
 * Tests LibRaw functionality with actual Sony ARW files using proper binary handling
 */

const fs = require('fs');
const path = require('path');

function log(level, message, data = null) {
    const colors = {
        INFO: '\x1b[36m\x1b[1m',
        ERROR: '\x1b[31m\x1b[1m',
        SUCCESS: '\x1b[32m\x1b[1m',
        DEBUG: '\x1b[35m\x1b[1m',
        DETAIL: '\x1b[34m\x1b[1m',
        RESET: '\x1b[0m'
    };
    
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`${colors[level] || ''}[${timestamp}] ${level}:${colors.RESET} ${message}`);
    
    if (data) {
        if (typeof data === 'object') {
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log(data);
        }
    }
}

async function loadLibRaw() {
    try {
        const wasmPath = path.resolve(__dirname, '../wasm/libraw-node.js');
        const LibRawFactory = require(wasmPath);
        const LibRaw = await LibRawFactory();
        return LibRaw;
    } catch (error) {
        log('ERROR', 'Failed to load LibRaw WASM module', { error: error.message });
        throw error;
    }
}

function formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

async function testARWWithUint8Array(LibRaw, filePath) {
    log('INFO', `Testing Sony ARW file with Uint8Array: ${path.basename(filePath)}`);
    
    const processor = new LibRaw.LibRaw();
    processor.setDebugMode(true);
    
    try {
        // Read file as buffer
        const fileBuffer = fs.readFileSync(filePath);
        const stats = fs.statSync(filePath);
        
        log('DETAIL', 'File information:', {
            path: filePath,
            size: formatFileSize(stats.size),
            bufferLength: fileBuffer.length
        });
        
        // Convert Node.js Buffer to Uint8Array
        log('INFO', 'Converting Buffer to Uint8Array...');
        const uint8Array = new Uint8Array(fileBuffer);
        
        log('DEBUG', 'Uint8Array created:', {
            length: uint8Array.length,
            constructor: uint8Array.constructor.name,
            firstBytes: Array.from(uint8Array.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')
        });
        
        // Test if loadFromUint8Array method exists
        if (typeof processor.loadFromUint8Array !== 'function') {
            log('ERROR', 'loadFromUint8Array method not available. Need to rebuild WASM module.');
            return false;
        }
        
        // Load using Uint8Array method
        log('INFO', 'Loading ARW file using Uint8Array method...');
        const startLoad = process.hrtime.bigint();
        
        const loaded = processor.loadFromUint8Array(uint8Array);
        const loadTime = Number(process.hrtime.bigint() - startLoad) / 1000000;
        
        if (!loaded) {
            log('ERROR', 'Failed to load ARW file with Uint8Array');
            const errorMsg = processor.getLastError();
            log('ERROR', `Error details: ${errorMsg}`);
            return false;
        }
        
        log('SUCCESS', `ARW file loaded successfully in ${loadTime.toFixed(2)}ms`);
        
        // Extract metadata
        log('INFO', 'Extracting Sony ARW metadata...');
        const metadata = processor.getMetadata();
        
        log('SUCCESS', 'Sony ARW Metadata:', {
            make: metadata.make,
            model: metadata.model,
            iso: metadata.iso,
            shutter: metadata.shutter,
            aperture: metadata.aperture,
            focalLength: metadata.focalLength,
            timestamp: new Date(metadata.timestamp * 1000).toLocaleString('ja-JP'),
            dimensions: {
                raw: `${metadata.rawWidth} × ${metadata.rawHeight}`,
                output: `${metadata.width} × ${metadata.height}`
            }
        });
        
        // Get processing info
        const procInfo = processor.getProcessingInfo();
        log('DETAIL', 'Sony Camera Details:', {
            normalizedMake: procInfo.camera_normalized_make,
            normalizedModel: procInfo.camera_normalized_model,
            colors: procInfo.colors,
            filters: `0x${procInfo.filters.toString(16).toUpperCase()}`
        });
        
        // Unpack RAW data
        log('INFO', 'Unpacking Sony ARW RAW data...');
        const startUnpack = process.hrtime.bigint();
        
        const unpacked = processor.unpack();
        const unpackTime = Number(process.hrtime.bigint() - startUnpack) / 1000000;
        
        if (!unpacked) {
            log('ERROR', 'Failed to unpack ARW RAW data');
            return false;
        }
        
        log('SUCCESS', `ARW RAW data unpacked successfully in ${unpackTime.toFixed(2)}ms`);
        
        // Extract thumbnail
        log('INFO', 'Extracting embedded thumbnail...');
        const thumbnail = processor.getThumbnail();
        
        if (thumbnail && thumbnail.format === 'jpeg') {
            const thumbPath = path.join(__dirname, `arw_thumb_uint8_${path.basename(filePath, '.ARW')}.jpg`);
            const thumbBuffer = Buffer.from(thumbnail.data);
            fs.writeFileSync(thumbPath, thumbBuffer);
            log('SUCCESS', `Thumbnail extracted: ${thumbPath} (${thumbnail.width}×${thumbnail.height})`);
        }
        
        // Process with camera white balance
        log('INFO', 'Processing ARW with camera white balance...');
        processor.setUseCameraWB(true);
        processor.setUseAutoWB(false);
        processor.setOutputColor(LibRaw.OUTPUT_COLOR_SRGB);
        processor.setQuality(LibRaw.QUALITY_AHD);
        processor.setBrightness(1.0);
        processor.setHalfSize(false);
        
        const startProcess = process.hrtime.bigint();
        const processed = processor.process();
        const processTime = Number(process.hrtime.bigint() - startProcess) / 1000000;
        
        if (!processed) {
            log('ERROR', 'ARW processing failed');
            return false;
        }
        
        log('SUCCESS', `ARW processing completed in ${processTime.toFixed(2)}ms`);
        
        // Get processed image data
        log('INFO', 'Retrieving processed image data...');
        const startImage = process.hrtime.bigint();
        const imageData = processor.getImageData();
        const imageTime = Number(process.hrtime.bigint() - startImage) / 1000000;
        
        if (!imageData) {
            log('ERROR', 'Failed to retrieve processed image data');
            return false;
        }
        
        log('SUCCESS', `Image data retrieved in ${imageTime.toFixed(2)}ms`);
        log('DETAIL', 'Processed Image Info:', {
            dimensions: `${imageData.width} × ${imageData.height}`,
            colors: imageData.colors,
            bits: imageData.bits,
            dataSize: formatFileSize(imageData.data.length),
            megapixels: ((imageData.width * imageData.height) / 1000000).toFixed(2)
        });
        
        // Save RGB data
        const rgbPath = path.join(__dirname, `arw_uint8_${path.basename(filePath, '.ARW')}.rgb`);
        const rgbBuffer = Buffer.from(imageData.data);
        fs.writeFileSync(rgbPath, rgbBuffer);
        log('SUCCESS', `RGB data saved: ${rgbPath}`);
        
        // Create PPM for easy viewing
        const ppmPath = path.join(__dirname, `arw_uint8_${path.basename(filePath, '.ARW')}.ppm`);
        const ppmHeader = `P6\n${imageData.width} ${imageData.height}\n255\n`;
        const ppmData = Buffer.concat([Buffer.from(ppmHeader, 'ascii'), rgbBuffer]);
        fs.writeFileSync(ppmPath, ppmData);
        log('SUCCESS', `PPM image saved: ${ppmPath}`);
        
        // Calculate image statistics
        const pixels = imageData.data.length / 3;
        let rSum = 0, gSum = 0, bSum = 0;
        
        for (let i = 0; i < imageData.data.length; i += 3) {
            rSum += imageData.data[i];
            gSum += imageData.data[i + 1];
            bSum += imageData.data[i + 2];
        }
        
        log('DETAIL', 'Image Statistics:', {
            totalPixels: pixels.toLocaleString(),
            averageRGB: {
                r: (rSum / pixels).toFixed(1),
                g: (gSum / pixels).toFixed(1),
                b: (bSum / pixels).toFixed(1)
            },
            brightness: ((rSum + gSum + bSum) / (pixels * 3) / 255 * 100).toFixed(1) + '%'
        });
        
        const totalTime = loadTime + unpackTime + processTime + imageTime;
        log('SUCCESS', `Total processing time: ${totalTime.toFixed(2)}ms`);
        
        return true;
        
    } catch (error) {
        log('ERROR', 'ARW test with Uint8Array failed', {
            error: error.message,
            stack: error.stack
        });
        return false;
    } finally {
        processor.delete();
        log('INFO', 'Processor cleanup completed');
    }
}

async function main() {
    console.log('\x1b[36m\x1b[1m📸 LibRaw Sony ARW Uint8Array Test\x1b[0m\n');
    
    try {
        // Load LibRaw
        log('INFO', 'Loading LibRaw WASM module...');
        const LibRaw = await loadLibRaw();
        
        log('SUCCESS', `LibRaw ${LibRaw.LibRaw.getVersion()} loaded`);
        log('INFO', `Supported cameras: ${LibRaw.LibRaw.getCameraCount()}`);
        
        // Find ARW test files
        const testImageDir = path.resolve(__dirname, '../test-image');
        
        if (!fs.existsSync(testImageDir)) {
            log('ERROR', `Test image directory not found: ${testImageDir}`);
            process.exit(1);
        }
        
        const files = fs.readdirSync(testImageDir);
        const arwFiles = files.filter(file => 
            file.toLowerCase().endsWith('.arw') && 
            !file.includes('Zone.Identifier')
        );
        
        if (arwFiles.length === 0) {
            log('ERROR', 'No ARW files found in test-image directory');
            process.exit(1);
        }
        
        log('INFO', `Found ${arwFiles.length} ARW file(s): ${arwFiles.join(', ')}`);
        
        // Test each ARW file
        for (const arwFile of arwFiles) {
            const filePath = path.join(testImageDir, arwFile);
            log('INFO', `\n${'='.repeat(60)}`);
            log('INFO', `Testing: ${arwFile}`);
            log('INFO', `${'='.repeat(60)}`);
            
            const success = await testARWWithUint8Array(LibRaw, filePath);
            
            if (success) {
                log('SUCCESS', '🎉 Sony ARW file processed successfully with Uint8Array!');
            } else {
                log('ERROR', '❌ Sony ARW file processing failed');
            }
        }
        
    } catch (error) {
        log('ERROR', '❌ Sony ARW Uint8Array test suite failed', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

main().catch(console.error);