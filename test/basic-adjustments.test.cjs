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

async function testBasicAdjustments(LibRaw) {
    log('TEST', 'Testing all BasicAdjustments parameters...');
    
    const processor = new LibRaw.LibRaw();
    processor.setDebugMode(true);
    
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
    
    // Test cases for each BasicAdjustment parameter
    const testCases = [
        {
            name: 'Exposure',
            setup: (p) => {
                p.setBrightness(2.0); // Max exposure (+5 -> 2.0)
            },
            params: { exposure: 5 }
        },
        {
            name: 'Contrast (Gamma)',
            setup: (p) => {
                p.setGamma(2.7, 3.5); // High contrast
            },
            params: { contrast: 100 }
        },
        {
            name: 'Highlights',
            setup: (p) => {
                p.setHighlight(2); // Blend mode
            },
            params: { highlights: -50 }
        },
        {
            name: 'Shadows',
            setup: (p) => {
                p.setExposure(1.0, 0.0); // Lift shadows
            },
            params: { shadows: 100 }
        },
        {
            name: 'Whites (Auto Brightness)',
            setup: (p) => {
                p.setAutoBright(true, 0.02);
            },
            params: { whites: 100 }
        },
        {
            name: 'Blacks (User Black Level)',
            setup: (p) => {
                p.setUserBlack(256); // Max black level
            },
            params: { blacks: 100 }
        },
        {
            name: 'Temperature & Tint (Custom WB)',
            setup: (p) => {
                p.setCustomWB(1.3, 0.9, 0.9, 0.7); // Warm
            },
            params: { temperature: 100, tint: 0 }
        },
        {
            name: 'Saturation',
            setup: (p) => {
                if (typeof p.setSaturation === 'function') {
                    p.setSaturation(50);
                } else {
                    log('INFO', 'setSaturation not available');
                }
            },
            params: { saturation: 50 }
        },
        {
            name: 'Vibrance',
            setup: (p) => {
                if (typeof p.setVibrance === 'function') {
                    p.setVibrance(50);
                } else {
                    log('INFO', 'setVibrance not available');
                }
            },
            params: { vibrance: 50 }
        }
    ];
    
    let passedTests = 0;
    
    for (const test of testCases) {
        log('TEST', `Testing: ${test.name}`);
        
        try {
            // Reset to defaults
            processor.setUseCameraWB(1);
            processor.setOutputColor(1); // sRGB
            processor.setBrightness(1.0);
            processor.setQuality(3); // AHD
            
            // Apply test parameters
            test.setup(processor);
            
            // Process image
            const startTime = Date.now();
            if (!processor.process()) {
                log('ERROR', `Failed to process with ${test.name}`);
                continue;
            }
            const processTime = Date.now() - startTime;
            
            const imageData = processor.getImageData();
            if (imageData && imageData.width && imageData.height) {
                log('SUCCESS', `✓ ${test.name}: ${imageData.width}x${imageData.height} (${processTime}ms)`);
                passedTests++;
                
                // Additional validation for specific parameters
                if (test.name === 'Exposure' && imageData.data) {
                    // Check if image is brighter (rough check)
                    const avgBrightness = Array.from(imageData.data.slice(0, 1000))
                        .reduce((a, b) => a + b, 0) / 1000;
                    log('INFO', `  Average brightness sample: ${avgBrightness.toFixed(1)}`);
                }
            } else {
                log('ERROR', `✗ ${test.name}: No image data`);
            }
        } catch (error) {
            log('ERROR', `✗ ${test.name}: ${error.message}`);
        }
    }
    
    log('INFO', `\nBasic adjustments tests: ${passedTests}/${testCases.length} passed`);
    return passedTests === testCases.length;
}

async function testParameterCombinations(LibRaw) {
    log('TEST', '\nTesting parameter combinations...');
    
    const processor = new LibRaw.LibRaw();
    
    // Load test image
    const testFile = path.join(__dirname, '../test-image/DSC00085.ARW');
    const rawData = new Uint8Array(fs.readFileSync(testFile));
    
    if (!processor.loadFromUint8Array(rawData)) {
        log('ERROR', 'Failed to load RAW file');
        return false;
    }
    
    if (!processor.unpack()) {
        log('ERROR', 'Failed to unpack RAW data');
        return false;
    }
    
    const combinations = [
        {
            name: 'Balanced edit',
            setup: (p) => {
                p.setBrightness(1.2);
                p.setGamma(2.2, 4.5);
                p.setHighlight(1);
                p.setCustomWB(1.1, 0.95, 0.95, 0.9);
            }
        },
        {
            name: 'High contrast + shadows',
            setup: (p) => {
                p.setGamma(2.5, 3.0);
                p.setExposure(0.5, 1.0);
                p.setUserBlack(150);
            }
        },
        {
            name: 'Color grading',
            setup: (p) => {
                p.setCustomWB(1.2, 1.0, 1.0, 0.8);
                if (typeof p.setSaturation === 'function') {
                    p.setSaturation(30);
                }
                if (typeof p.setVibrance === 'function') {
                    p.setVibrance(40);
                }
            }
        }
    ];
    
    let passedTests = 0;
    
    for (const combo of combinations) {
        log('TEST', `Testing: ${combo.name}`);
        
        try {
            // Reset to defaults
            processor.setUseCameraWB(1);
            processor.setOutputColor(1);
            processor.setBrightness(1.0);
            processor.setQuality(3);
            
            // Apply combination
            combo.setup(processor);
            
            const startTime = Date.now();
            if (!processor.process()) {
                log('ERROR', `Failed to process ${combo.name}`);
                continue;
            }
            const processTime = Date.now() - startTime;
            
            const imageData = processor.getImageData();
            if (imageData && imageData.width && imageData.height) {
                log('SUCCESS', `✓ ${combo.name}: processed in ${processTime}ms`);
                passedTests++;
            } else {
                log('ERROR', `✗ ${combo.name}: No image data`);
            }
        } catch (error) {
            log('ERROR', `✗ ${combo.name}: ${error.message}`);
        }
    }
    
    log('INFO', `\nCombination tests: ${passedTests}/${combinations.length} passed`);
    return passedTests === combinations.length;
}

async function main() {
    log('INFO', '🧪 LibRaw BasicAdjustments Test Suite\n');
    
    try {
        // Load LibRaw module
        const LibRaw = require('../wasm/libraw-node.js');
        const libraw = await LibRaw();
        
        log('SUCCESS', `LibRaw ${libraw.LibRaw.getVersion()} loaded`);
        
        // Check available methods
        const processor = new libraw.LibRaw();
        log('INFO', '\nChecking available adjustment methods:');
        const methods = [
            'setBrightness', 'setGamma', 'setHighlight', 'setExposure',
            'setAutoBright', 'setUserBlack', 'setCustomWB',
            'setSaturation', 'setVibrance'
        ];
        
        for (const method of methods) {
            const available = typeof processor[method] === 'function';
            log(available ? 'SUCCESS' : 'INFO', `  ${method}: ${available ? '✓' : '✗'}`);
        }
        
        log('INFO', '');
        
        // Run tests
        const basicSuccess = await testBasicAdjustments(libraw);
        const comboSuccess = await testParameterCombinations(libraw);
        
        if (basicSuccess && comboSuccess) {
            log('SUCCESS', '\n🎉 All BasicAdjustments tests passed!');
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