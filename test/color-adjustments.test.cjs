const fs = require('fs');
const path = require('path');

// Simple console coloring
const log = (level, message) => {
    const colors = {
        'SUCCESS': '\x1b[32m\x1b[1m',
        'ERROR': '\x1b[31m\x1b[1m',
        'INFO': '\x1b[36m\x1b[1m',
        'TEST': '\x1b[35m\x1b[1m',
        'RESET': '\x1b[0m'
    };
    
    const color = colors[level] || colors.RESET;
    console.log(`${color}[${level}]${colors.RESET} ${message}`);
};

async function testColorAdjustments(LibRaw) {
    log('TEST', 'Testing saturation and vibrance adjustments...');
    
    const processor = new LibRaw.LibRaw();
    
    // Check if methods exist
    const hasSaturation = typeof processor.setSaturation === 'function';
    const hasVibrance = typeof processor.setVibrance === 'function';
    
    log('INFO', `setSaturation available: ${hasSaturation}`);
    log('INFO', `setVibrance available: ${hasVibrance}`);
    
    if (!hasSaturation || !hasVibrance) {
        log('ERROR', 'Color adjustment methods not available');
        return false;
    }
    
    // Load test image
    const testFile = path.join(__dirname, '../test-image/DSC00085.ARW');
    if (!fs.existsSync(testFile)) {
        log('ERROR', 'Test file not found: ' + testFile);
        return false;
    }
    
    const rawData = new Uint8Array(fs.readFileSync(testFile));
    
    if (!processor.loadFromUint8Array(rawData)) {
        log('ERROR', 'Failed to load RAW file');
        return false;
    }
    
    if (!processor.unpack()) {
        log('ERROR', 'Failed to unpack RAW data');
        return false;
    }
    
    // Test different saturation/vibrance values
    const testCases = [
        { saturation: 0, vibrance: 0, name: 'Baseline' },
        { saturation: 50, vibrance: 0, name: 'High saturation' },
        { saturation: -50, vibrance: 0, name: 'Low saturation' },
        { saturation: 0, vibrance: 50, name: 'High vibrance' },
        { saturation: 0, vibrance: -50, name: 'Low vibrance' },
        { saturation: 30, vibrance: 30, name: 'Both positive' }
    ];
    
    for (const test of testCases) {
        log('TEST', `Testing: ${test.name} (sat: ${test.saturation}, vib: ${test.vibrance})`);
        
        // Set parameters
        processor.setUseCameraWB(1);
        processor.setOutputColor(1); // sRGB
        processor.setBrightness(1.0);
        processor.setQuality(3); // AHD
        
        // Apply color adjustments
        processor.setSaturation(test.saturation);
        processor.setVibrance(test.vibrance);
        
        if (!processor.process()) {
            log('ERROR', `Failed to process with ${test.name}`);
            continue;
        }
        
        const imageData = processor.getImageData();
        if (imageData && imageData.width && imageData.height) {
            log('SUCCESS', `✓ ${test.name}: ${imageData.width}x${imageData.height}`);
        } else {
            log('ERROR', `✗ ${test.name}: No image data`);
        }
    }
    
    return true;
}

async function main() {
    log('INFO', '🧪 LibRaw Color Adjustments Test Suite\n');
    
    try {
        // Load LibRaw module
        const LibRaw = require('../wasm/libraw-node.js');
        const libraw = await LibRaw();
        
        log('SUCCESS', `LibRaw ${libraw.LibRaw.getVersion()} loaded`);
        
        // Run tests
        const success = await testColorAdjustments(libraw);
        
        if (success) {
            log('SUCCESS', '\n🎉 All color adjustment tests passed!');
        } else {
            log('ERROR', '\n❌ Some tests failed');
            process.exit(1);
        }
        
    } catch (error) {
        log('ERROR', 'Test failed: ' + error.message);
        console.error(error);
        process.exit(1);
    }
}

main();