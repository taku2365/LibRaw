#!/usr/bin/env node
/**
 * LibRaw Advanced Features Test
 * Tests new features derived from LibRaw samples
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    bright: '\x1b[1m'
};

function log(level, message) {
    const colorMap = {
        INFO: colors.cyan,
        SUCCESS: colors.green,
        ERROR: colors.red,
        WARNING: colors.yellow,
        TEST: colors.magenta
    };
    
    const color = colorMap[level] || colors.white;
    console.log(`${color}${colors.bright}[${level}]${colors.reset} ${message}`);
}

async function loadLibRaw() {
    const wasmPath = path.resolve(__dirname, '../wasm/libraw-node.js');
    if (!fs.existsSync(wasmPath)) {
        throw new Error(`libraw-node.js not found at ${wasmPath}`);
    }
    
    const LibRawFactory = require(wasmPath);
    return await LibRawFactory();
}

async function testThumbnailExtraction(LibRaw) {
    log('TEST', 'Testing thumbnail extraction...');
    
    const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
    if (!fs.existsSync(arwPath)) {
        log('WARNING', 'ARW test file not found, skipping thumbnail tests');
        return true;
    }
    
    const fileBuffer = await readFile(arwPath);
    const testData = new Uint8Array(fileBuffer);
    
    const processor = new LibRaw.LibRaw();
    
    try {
        processor.loadFromUint8Array(testData);
        processor.unpack();
        
        const thumbnail = processor.getThumbnail();
        
        if (thumbnail && thumbnail.format === 'jpeg') {
            log('SUCCESS', `✓ Thumbnail extracted: ${thumbnail.width}x${thumbnail.height} JPEG`);
            log('INFO', `  Data size: ${thumbnail.data.length} bytes`);
            return true;
        } else {
            log('WARNING', '⚠ No JPEG thumbnail found in this file');
            return true; // Not an error, some files don't have thumbnails
        }
    } catch (error) {
        log('ERROR', `✗ Thumbnail extraction failed: ${error.message}`);
        return false;
    } finally {
        processor.delete();
    }
}

async function test4ChannelData(LibRaw) {
    log('TEST', 'Testing 4-channel RAW data access...');
    
    const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
    if (!fs.existsSync(arwPath)) {
        log('WARNING', 'ARW test file not found, skipping 4-channel tests');
        return true;
    }
    
    const fileBuffer = await readFile(arwPath);
    const testData = new Uint8Array(fileBuffer);
    
    const processor = new LibRaw.LibRaw();
    
    try {
        processor.loadFromUint8Array(testData);
        processor.unpack();
        
        // Enable half-size for faster processing
        processor.setHalfSize(true);
        
        const channels4 = processor.get4ChannelData();
        
        if (channels4 && channels4.channels) {
            log('SUCCESS', `✓ 4-channel data: ${channels4.width}x${channels4.height}, ${channels4.colors} colors`);
            log('INFO', `  Channels available: ${channels4.channels.length}`);
            
            // Verify each channel has data
            for (let i = 0; i < channels4.channels.length; i++) {
                const channel = channels4.channels[i];
                if (channel.length > 0) {
                    log('INFO', `  Channel ${i}: ${channel.length} pixels`);
                } else {
                    log('ERROR', `  Channel ${i}: No data`);
                    return false;
                }
            }
            return true;
        } else {
            log('ERROR', '✗ Failed to get 4-channel data');
            return false;
        }
    } catch (error) {
        log('ERROR', `✗ 4-channel test failed: ${error.message}`);
        return false;
    } finally {
        processor.delete();
    }
}

async function testCropFunctionality(LibRaw) {
    log('TEST', 'Testing crop functionality...');
    
    const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
    if (!fs.existsSync(arwPath)) {
        log('WARNING', 'ARW test file not found, skipping crop tests');
        return true;
    }
    
    const fileBuffer = await readFile(arwPath);
    const testData = new Uint8Array(fileBuffer);
    
    const processor = new LibRaw.LibRaw();
    
    try {
        processor.loadFromUint8Array(testData);
        processor.unpack();
        
        // Set crop area (center region: x1,y1,x2,y2)
        processor.setHalfSize(true); // For speed
        processor.setCropArea(500, 500, 1500, 1500);
        processor.setUseCameraWB(true);
        processor.setOutputColor(1);
        
        const processed = processor.process();
        
        if (processed) {
            const imageData = processor.getImageData();
            log('SUCCESS', `✓ Crop processing: ${imageData.width}x${imageData.height}`);
            return true;
        } else {
            log('ERROR', '✗ Crop processing failed');
            return false;
        }
    } catch (error) {
        log('ERROR', `✗ Crop test failed: ${error.message}`);
        return false;
    } finally {
        processor.delete();
    }
}

async function testRotationFlip(LibRaw) {
    log('TEST', 'Testing rotation/flip functionality...');
    
    const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
    if (!fs.existsSync(arwPath)) {
        log('WARNING', 'ARW test file not found, skipping rotation tests');
        return true;
    }
    
    const fileBuffer = await readFile(arwPath);
    
    const rotations = [
        { flip: 0, desc: 'No rotation' },
        { flip: 3, desc: '180° rotation' },
        { flip: 5, desc: '90° CCW rotation' },
        { flip: 6, desc: '90° CW rotation' }
    ];
    
    for (const rotation of rotations) {
        const testData = new Uint8Array(fileBuffer);
        const processor = new LibRaw.LibRaw();
        
        try {
            processor.loadFromUint8Array(testData);
            processor.unpack();
            
            processor.setHalfSize(true);
            processor.setUserFlip(rotation.flip);
            processor.setUseCameraWB(true);
            processor.setOutputColor(1);
            
            const processed = processor.process();
            
            if (processed) {
                const imageData = processor.getImageData();
                log('SUCCESS', `  ✓ ${rotation.desc}: ${imageData.width}x${imageData.height}`);
            } else {
                log('ERROR', `  ✗ ${rotation.desc}: Failed`);
                return false;
            }
        } catch (error) {
            log('ERROR', `  ✗ ${rotation.desc}: ${error.message}`);
            return false;
        } finally {
            processor.delete();
        }
    }
    
    return true;
}

async function testAdvancedProcessingOptions(LibRaw) {
    log('TEST', 'Testing advanced processing options...');
    
    const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
    if (!fs.existsSync(arwPath)) {
        log('WARNING', 'ARW test file not found, skipping advanced option tests');
        return true;
    }
    
    const fileBuffer = await readFile(arwPath);
    const testData = new Uint8Array(fileBuffer);
    
    const processor = new LibRaw.LibRaw();
    
    try {
        processor.loadFromUint8Array(testData);
        processor.unpack();
        
        // Test various advanced options
        processor.setHalfSize(true);
        processor.setNoAutoBright(true); // Disable auto brightness
        processor.setOutputTiff(false);  // PPM output
        processor.setUseCameraWB(true);
        processor.setOutputColor(1);
        processor.setOutputBPS(16);      // 16-bit output
        
        const processed = processor.process();
        
        if (processed) {
            const imageData = processor.getImageData();
            log('SUCCESS', `✓ Advanced options: ${imageData.width}x${imageData.height}`);
            return true;
        } else {
            log('ERROR', '✗ Advanced options processing failed');
            return false;
        }
    } catch (error) {
        log('ERROR', `✗ Advanced options test failed: ${error.message}`);
        return false;
    } finally {
        processor.delete();
    }
}

async function main() {
    console.log(`\n${colors.cyan}${colors.bright}🧪 LibRaw Advanced Features Test Suite${colors.reset}\n`);
    
    try {
        const LibRaw = await loadLibRaw();
        log('SUCCESS', `LibRaw ${LibRaw.LibRaw.getVersion()} loaded`);
        
        // Verify new methods exist
        const processor = new LibRaw.LibRaw();
        const methodsToCheck = [
            'get4ChannelData', 'getRawBayerData', 'setShotSelect',
            'setCropArea', 'setGreyBox', 'setUserFlip', 'setNoAutoBright', 'setOutputTiff'
        ];
        
        let allMethodsExist = true;
        for (const method of methodsToCheck) {
            if (typeof processor[method] !== 'function') {
                log('ERROR', `Method ${method} not found!`);
                allMethodsExist = false;
            }
        }
        processor.delete();
        
        if (!allMethodsExist) {
            log('ERROR', 'Some methods are missing. Please rebuild LibRaw WASM.');
            return false;
        }
        
        log('SUCCESS', 'All advanced methods are available');
        
        // Run tests
        const results = [];
        results.push(await testThumbnailExtraction(LibRaw));
        results.push(await test4ChannelData(LibRaw));
        results.push(await testCropFunctionality(LibRaw));
        results.push(await testRotationFlip(LibRaw));
        results.push(await testAdvancedProcessingOptions(LibRaw));
        
        // Summary
        console.log(`\n${colors.cyan}${colors.bright}📊 Advanced Features Test Summary${colors.reset}\n`);
        
        const passed = results.filter(r => r).length;
        const total = results.length;
        
        if (passed === total) {
            log('SUCCESS', '🎉 All advanced feature tests passed!');
            log('INFO', 'LibRaw WASM now supports professional-grade features');
        } else {
            log('ERROR', `❌ ${total - passed} advanced feature tests failed`);
        }
        
        return passed === total;
        
    } catch (error) {
        log('ERROR', `Test suite failed: ${error.message}`);
        return false;
    }
}

if (require.main === module) {
    main().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        log('ERROR', `Unhandled error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { testThumbnailExtraction, test4ChannelData, testCropFunctionality, testRotationFlip, testAdvancedProcessingOptions };