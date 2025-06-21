#!/usr/bin/env node
/**
 * LibRaw WebAssembly Sony ARW Real File Test
 * Tests LibRaw functionality with actual Sony ARW files
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bright: '\x1b[1m'
};

function log(level, message, data = null) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const colorMap = {
        INFO: colors.cyan,
        SUCCESS: colors.green,
        ERROR: colors.red,
        WARNING: colors.yellow,
        DEBUG: colors.magenta,
        DETAIL: colors.blue
    };
    
    const color = colorMap[level] || colors.white;
    console.log(`${color}${colors.bright}[${timestamp}] ${level}:${colors.reset} ${message}`);
    
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
        
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`WASM CommonJS module not found at ${wasmPath}`);
        }
        
        const LibRawFactory = require(wasmPath);
        const LibRaw = await LibRawFactory();
        
        return LibRaw;
        
    } catch (error) {
        log('ERROR', 'Failed to load LibRaw WASM module', {
            error: error.message
        });
        throw error;
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatMetadata(metadata) {
    return `
${colors.cyan}${colors.bright}Camera Information:${colors.reset}
  Make: ${metadata.make}
  Model: ${metadata.model}
  
${colors.cyan}${colors.bright}Shooting Information:${colors.reset}
  ISO: ${metadata.iso}
  Shutter: ${metadata.shutter}s
  Aperture: f/${metadata.aperture}
  Focal Length: ${metadata.focalLength}mm
  Timestamp: ${new Date(metadata.timestamp * 1000).toLocaleString('ja-JP')}
  
${colors.cyan}${colors.bright}Image Dimensions:${colors.reset}
  RAW Size: ${metadata.rawWidth} × ${metadata.rawHeight}
  Output Size: ${metadata.width} × ${metadata.height}
  Rotation: ${metadata.flip}°
  
${colors.cyan}${colors.bright}Color Information:${colors.reset}
  Camera WB: [${metadata.color.cameraWhiteBalance.map(v => v.toFixed(3)).join(', ')}]`;
}

async function testARWFile(LibRaw, filePath) {
    log('INFO', `Testing Sony ARW file: ${path.basename(filePath)}`);
    
    const processor = new LibRaw.LibRaw();
    processor.setDebugMode(true);
    
    try {
        // File information
        const stats = fs.statSync(filePath);
        log('DETAIL', 'File information:', {
            path: filePath,
            size: formatFileSize(stats.size),
            modified: stats.mtime.toLocaleString('ja-JP')
        });
        
        // Read and load file
        log('INFO', 'Loading ARW file into LibRaw...');
        const startLoad = process.hrtime.bigint();
        
        const fileBuffer = fs.readFileSync(filePath);
        const binaryString = Array.from(fileBuffer)
            .map(byte => String.fromCharCode(byte))
            .join('');
        
        const loaded = processor.loadFromMemory(binaryString);
        const loadTime = Number(process.hrtime.bigint() - startLoad) / 1000000;
        
        if (!loaded) {
            log('ERROR', 'Failed to load ARW file');
            const errorMsg = processor.getLastError();
            log('ERROR', `Error details: ${errorMsg}`);
            return false;
        }
        
        log('SUCCESS', `ARW file loaded successfully in ${loadTime.toFixed(2)}ms`);
        
        // Get processing info
        log('INFO', 'Extracting processing information...');
        const procInfo = processor.getProcessingInfo();
        log('DETAIL', 'Sony ARW camera details:', {
            make: procInfo.camera_make,
            model: procInfo.camera_model,
            normalizedMake: procInfo.camera_normalized_make,
            normalizedModel: procInfo.camera_normalized_model,
            rawDimensions: `${procInfo.raw_width} × ${procInfo.raw_height}`,
            outputDimensions: `${procInfo.width} × ${procInfo.height}`,
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
            const errorMsg = processor.getLastError();
            log('ERROR', `Error details: ${errorMsg}`);
            return false;
        }
        
        log('SUCCESS', `ARW RAW data unpacked successfully in ${unpackTime.toFixed(2)}ms`);
        
        // Extract metadata
        log('INFO', 'Extracting Sony ARW metadata...');
        const metadata = processor.getMetadata();
        console.log(formatMetadata(metadata));
        
        // Test thumbnail extraction
        log('INFO', 'Extracting embedded thumbnail...');
        const thumbnail = processor.getThumbnail();
        
        if (thumbnail && thumbnail.format === 'jpeg') {
            const thumbPath = path.join(__dirname, `arw_thumbnail_${path.basename(filePath, '.ARW')}.jpg`);
            fs.writeFileSync(thumbPath, thumbnail.data);
            log('SUCCESS', `Thumbnail extracted: ${thumbPath}`);
            log('DETAIL', 'Thumbnail info:', {
                format: thumbnail.format,
                dimensions: `${thumbnail.width} × ${thumbnail.height}`,
                size: formatFileSize(thumbnail.data.length)
            });
        } else {
            log('WARNING', 'No JPEG thumbnail found in ARW file');
        }
        
        // Test different processing modes
        const processingModes = [
            {
                name: 'Sony Camera White Balance + AHD',
                settings: {
                    useCameraWB: true,
                    useAutoWB: false,
                    outputColor: LibRaw.OUTPUT_COLOR_SRGB,
                    quality: LibRaw.QUALITY_AHD,
                    brightness: 1.0,
                    halfSize: false
                }
            },
            {
                name: 'Auto White Balance + Linear (Fast)',
                settings: {
                    useCameraWB: false,
                    useAutoWB: true,
                    outputColor: LibRaw.OUTPUT_COLOR_SRGB,
                    quality: LibRaw.QUALITY_LINEAR,
                    brightness: 1.2,
                    halfSize: true
                }
            }
        ];
        
        for (const mode of processingModes) {
            log('INFO', `--- Processing Mode: ${mode.name} ---`);
            
            // Apply settings
            processor.setUseCameraWB(mode.settings.useCameraWB);
            processor.setUseAutoWB(mode.settings.useAutoWB);
            processor.setOutputColor(mode.settings.outputColor);
            processor.setQuality(mode.settings.quality);
            processor.setBrightness(mode.settings.brightness);
            processor.setHalfSize(mode.settings.halfSize);
            
            // Process
            const startProcess = process.hrtime.bigint();
            const processed = processor.process();
            const processTime = Number(process.hrtime.bigint() - startProcess) / 1000000;
            
            if (!processed) {
                log('ERROR', `ARW processing failed for mode: ${mode.name}`);
                const errorMsg = processor.getLastError();
                log('ERROR', `Error details: ${errorMsg}`);
                continue;
            }
            
            log('SUCCESS', `ARW processing completed in ${processTime.toFixed(2)}ms`);
            
            // Get processed image data
            const startImage = process.hrtime.bigint();
            const imageData = processor.getImageData();
            const imageTime = Number(process.hrtime.bigint() - startImage) / 1000000;
            
            if (imageData) {
                log('SUCCESS', `Image data retrieved in ${imageTime.toFixed(2)}ms`);
                log('DETAIL', 'Processed image info:', {
                    dimensions: `${imageData.width} × ${imageData.height}`,
                    colors: imageData.colors,
                    bits: imageData.bits,
                    dataSize: formatFileSize(imageData.data.length),
                    megapixels: ((imageData.width * imageData.height) / 1000000).toFixed(2)
                });
                
                // Save RGB data
                const outputPath = path.join(__dirname, 
                    `arw_processed_${mode.name.replace(/[^a-zA-Z0-9]/g, '_')}_${path.basename(filePath, '.ARW')}.rgb`);
                fs.writeFileSync(outputPath, imageData.data);
                log('INFO', `RGB data saved: ${outputPath}`);
                
                // Calculate basic statistics
                const pixels = imageData.data.length / 3;
                let rSum = 0, gSum = 0, bSum = 0;
                let rMax = 0, gMax = 0, bMax = 0;
                
                for (let i = 0; i < imageData.data.length; i += 3) {
                    const r = imageData.data[i];
                    const g = imageData.data[i + 1];
                    const b = imageData.data[i + 2];
                    
                    rSum += r; gSum += g; bSum += b;
                    rMax = Math.max(rMax, r);
                    gMax = Math.max(gMax, g);
                    bMax = Math.max(bMax, b);
                }
                
                log('DETAIL', 'Image statistics:', {
                    totalPixels: pixels.toLocaleString(),
                    averageRGB: {
                        r: (rSum / pixels).toFixed(1),
                        g: (gSum / pixels).toFixed(1),
                        b: (bSum / pixels).toFixed(1)
                    },
                    maxRGB: { r: rMax, g: gMax, b: bMax },
                    brightness: ((rSum + gSum + bSum) / (pixels * 3) / 255 * 100).toFixed(1) + '%'
                });
                
                // Create PPM for easy viewing
                const ppmPath = path.join(__dirname, 
                    `arw_${mode.name.replace(/[^a-zA-Z0-9]/g, '_')}_${path.basename(filePath, '.ARW')}.ppm`);
                const ppmHeader = `P6\n${imageData.width} ${imageData.height}\n255\n`;
                const ppmData = Buffer.concat([Buffer.from(ppmHeader, 'ascii'), Buffer.from(imageData.data)]);
                fs.writeFileSync(ppmPath, ppmData);
                log('INFO', `PPM image saved: ${ppmPath}`);
                
            } else {
                log('ERROR', 'Failed to retrieve processed image data');
            }
            
            const totalTime = loadTime + unpackTime + processTime + imageTime;
            log('SUCCESS', `Total processing time: ${totalTime.toFixed(2)}ms`);
            log('INFO', '--- End Processing Mode ---\n');
        }
        
        return true;
        
    } catch (error) {
        log('ERROR', 'ARW test failed', {
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
    console.log(`${colors.cyan}${colors.bright}📸 LibRaw Sony ARW Real File Test${colors.reset}\n`);
    
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
        
        let successCount = 0;
        
        // Test each ARW file
        for (const arwFile of arwFiles) {
            const filePath = path.join(testImageDir, arwFile);
            log('INFO', `\n${'='.repeat(60)}`);
            log('INFO', `Testing: ${arwFile}`);
            log('INFO', `${'='.repeat(60)}`);
            
            const success = await testARWFile(LibRaw, filePath);
            if (success) {
                successCount++;
            }
        }
        
        log('INFO', `\n${'='.repeat(60)}`);
        log('SUCCESS', `ARW Test Results: ${successCount}/${arwFiles.length} files processed successfully`);
        
        if (successCount === arwFiles.length) {
            log('SUCCESS', '🎉 All Sony ARW files processed successfully!');
            
            console.log(`\n${colors.green}${colors.bright}Generated Files:${colors.reset}`);
            console.log('  - *.jpg: Extracted thumbnails');
            console.log('  - *.rgb: Raw RGB data');
            console.log('  - *.ppm: PPM images (viewable with image viewers)');
            
        } else {
            log('WARNING', `${arwFiles.length - successCount} file(s) failed processing`);
        }
        
    } catch (error) {
        log('ERROR', '❌ Sony ARW test suite failed', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log('ERROR', 'Uncaught exception', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { testARWFile, loadLibRaw };