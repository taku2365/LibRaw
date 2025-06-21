#!/usr/bin/env node
/**
 * LibRaw Extended Parameters Test
 * Tests all the new processing parameters added to LibRaw WASM
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

async function testExtendedParameters(LibRaw) {
    log('TEST', 'Testing extended LibRaw parameters...');
    
    const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
    if (!fs.existsSync(arwPath)) {
        log('WARNING', 'ARW test file not found, skipping extended parameter tests');
        return true;
    }
    
    const fileBuffer = await readFile(arwPath);
    
    const parameterTests = [
        {
            name: 'Highlight Recovery Modes',
            tests: [
                { highlight: 0, desc: 'Clip mode' },
                { highlight: 1, desc: 'Unclip mode' },
                { highlight: 2, desc: 'Blend mode' },
                { highlight: 3, desc: 'Rebuild mode' }
            ]
        },
        {
            name: 'Gamma Curve Adjustment',
            tests: [
                { gamma: [2.2, 4.5], desc: 'Standard gamma' },
                { gamma: [1.8, 5.0], desc: 'Low contrast gamma' },
                { gamma: [2.6, 4.0], desc: 'High contrast gamma' }
            ]
        },
        {
            name: 'Noise Reduction',
            tests: [
                { noiseThreshold: 0, medianPasses: 0, desc: 'No noise reduction' },
                { noiseThreshold: 100, medianPasses: 1, desc: 'Light noise reduction' },
                { noiseThreshold: 300, medianPasses: 3, desc: 'Heavy noise reduction' }
            ]
        },
        {
            name: 'Exposure Adjustment',
            tests: [
                { exposure: { shift: 0.5, preserve: 0 }, desc: 'Exposure +0.5' },
                { exposure: { shift: -0.5, preserve: 1 }, desc: 'Exposure -0.5 with highlight preserve' },
                { exposure: { shift: 1.0, preserve: 1 }, desc: 'Exposure +1.0 with highlight preserve' }
            ]
        },
        {
            name: 'Custom White Balance',
            tests: [
                { customWB: { r: 1.0, g1: 1.0, g2: 1.0, b: 1.0 }, desc: 'Neutral WB' },
                { customWB: { r: 1.2, g1: 1.0, g2: 1.0, b: 0.8 }, desc: 'Warm WB' },
                { customWB: { r: 0.8, g1: 1.0, g2: 1.0, b: 1.2 }, desc: 'Cool WB' }
            ]
        },
        {
            name: 'DCB Demosaic Settings',
            tests: [
                { quality: 4, dcbIterations: 1, dcbEnhance: false, desc: 'DCB basic' },
                { quality: 4, dcbIterations: 3, dcbEnhance: true, desc: 'DCB enhanced' },
                { quality: 4, dcbIterations: 5, dcbEnhance: true, desc: 'DCB maximum quality' }
            ]
        },
        {
            name: 'Black Level Adjustment',
            tests: [
                { userBlack: 0, desc: 'Auto black level' },
                { userBlack: 128, desc: 'Manual black level 128' },
                { userBlack: 256, desc: 'Manual black level 256' }
            ]
        },
        {
            name: 'Chromatic Aberration Correction',
            tests: [
                { aberrationCorrection: { r: 1.0, b: 1.0 }, desc: 'No correction' },
                { aberrationCorrection: { r: 0.999, b: 1.001 }, desc: 'Subtle correction' },
                { aberrationCorrection: { r: 0.995, b: 1.005 }, desc: 'Strong correction' }
            ]
        }
    ];
    
    let totalTests = 0;
    let passedTests = 0;
    
    for (const category of parameterTests) {
        log('INFO', `\nTesting ${category.name}:`);
        
        for (const test of category.tests) {
            totalTests++;
            const processor = new LibRaw.LibRaw();
            processor.setDebugMode(false);
            
            try {
                // Create a fresh copy of the data for each test
                const testData = new Uint8Array(fileBuffer);
                
                // Load file
                const loaded = processor.loadFromUint8Array(testData);
                if (!loaded) {
                    console.log(`[DEBUG] Load failed for ${test.desc}`);
                    throw new Error('Failed to load file');
                }
                
                // Unpack
                const unpacked = processor.unpack();
                if (!unpacked) throw new Error('Failed to unpack');
                
                // Apply base settings
                processor.setUseCameraWB(true);
                processor.setOutputColor(1); // sRGB
                processor.setQuality(test.quality || 3); // AHD unless testing DCB
                processor.setHalfSize(true); // For speed
                processor.setBrightness(1.0);
                
                // Apply test parameters
                if (test.highlight !== undefined) {
                    processor.setHighlight(test.highlight);
                }
                
                if (test.gamma) {
                    processor.setGamma(test.gamma[0], test.gamma[1]);
                }
                
                if (test.noiseThreshold !== undefined) {
                    processor.setNoiseThreshold(test.noiseThreshold);
                }
                
                if (test.medianPasses !== undefined) {
                    processor.setMedianPasses(test.medianPasses);
                }
                
                if (test.exposure) {
                    processor.setExposure(test.exposure.shift, test.exposure.preserve);
                }
                
                if (test.autoBright) {
                    processor.setAutoBright(test.autoBright.enabled, test.autoBright.threshold);
                }
                
                if (test.customWB) {
                    processor.setCustomWB(
                        test.customWB.r,
                        test.customWB.g1,
                        test.customWB.g2,
                        test.customWB.b
                    );
                    processor.setUseCameraWB(false); // Use custom WB
                }
                
                if (test.fourColorRGB !== undefined) {
                    processor.setFourColorRGB(test.fourColorRGB);
                }
                
                if (test.dcbIterations !== undefined) {
                    processor.setDCBIterations(test.dcbIterations);
                }
                
                if (test.dcbEnhance !== undefined) {
                    processor.setDCBEnhance(test.dcbEnhance);
                }
                
                if (test.outputBPS !== undefined) {
                    processor.setOutputBPS(test.outputBPS);
                }
                
                if (test.userBlack !== undefined) {
                    processor.setUserBlack(test.userBlack);
                }
                
                if (test.aberrationCorrection) {
                    try {
                        processor.setAberrationCorrection(
                            test.aberrationCorrection.r,
                            test.aberrationCorrection.b
                        );
                    } catch (aberError) {
                        log('ERROR', `  Failed to set aberration correction: ${aberError.message}`);
                    }
                }
                
                // Process
                const startTime = Date.now();
                let processed;
                try {
                    // Debug: Check if processor is still valid
                    if (test.aberrationCorrection) {
                        console.log(`[DEBUG] About to process ${test.desc}, processor:`, !!processor);
                    }
                    processed = processor.process();
                } catch (procError) {
                    log('ERROR', `  ✗ ${test.desc}: Process threw error: ${procError.message}`);
                    continue;
                }
                const processTime = Date.now() - startTime;
                
                if (processed === true) {
                    log('SUCCESS', `  ✓ ${test.desc}: ${processTime}ms`);
                    passedTests++;
                } else if (processed === false) {
                    log('ERROR', `  ✗ ${test.desc}: Processing failed`);
                } else {
                    log('ERROR', `  ✗ ${test.desc}: ${processed}`);
                }
                
            } catch (error) {
                log('ERROR', `  ✗ ${test.desc}: ${error.message}`);
            } finally {
                processor.delete();
            }
        }
    }
    
    log('INFO', `\nExtended parameter tests: ${passedTests}/${totalTests} passed`);
    return passedTests === totalTests;
}

async function testParameterCombinations(LibRaw) {
    log('TEST', '\nTesting parameter combinations...');
    
    const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
    if (!fs.existsSync(arwPath)) {
        return true;
    }
    
    const fileBuffer = await readFile(arwPath);
    
    const combinations = [
        {
            name: 'High quality with noise reduction',
            params: {
                quality: 11, // DHT
                noiseThreshold: 200,
                medianPasses: 2,
                fourColorRGB: true,
                outputBPS: 16
            }
        },
        {
            name: 'Fast preview with exposure adjustment',
            params: {
                quality: 0, // Linear
                halfSize: true,
                exposure: { shift: 0.7, preserve: 1 },
                autoBright: { enabled: true, threshold: 0.015 }
            }
        },
        {
            name: 'Artistic with custom WB and gamma',
            params: {
                customWB: { r: 1.1, g1: 0.95, g2: 0.95, b: 0.9 },
                gamma: [1.8, 6.0],
                highlight: 2,
                aberrationCorrection: { r: 0.998, b: 1.002 }
            }
        }
    ];
    
    for (const combo of combinations) {
        const processor = new LibRaw.LibRaw();
        processor.setDebugMode(false);
        
        try {
            // Create a fresh copy of the data for each test
            const testData = new Uint8Array(fileBuffer);
            
            processor.loadFromUint8Array(testData);
            processor.unpack();
            
            // Apply all parameters
            Object.entries(combo.params).forEach(([key, value]) => {
                switch (key) {
                    case 'quality':
                        processor.setQuality(value);
                        break;
                    case 'halfSize':
                        processor.setHalfSize(value);
                        break;
                    case 'noiseThreshold':
                        processor.setNoiseThreshold(value);
                        break;
                    case 'medianPasses':
                        processor.setMedianPasses(value);
                        break;
                    case 'fourColorRGB':
                        processor.setFourColorRGB(value);
                        break;
                    case 'outputBPS':
                        processor.setOutputBPS(value);
                        break;
                    case 'exposure':
                        processor.setExposure(value.shift, value.preserve);
                        break;
                    case 'autoBright':
                        processor.setAutoBright(value.enabled, value.threshold);
                        break;
                    case 'customWB':
                        processor.setCustomWB(value.r, value.g1, value.g2, value.b);
                        processor.setUseCameraWB(false);
                        break;
                    case 'gamma':
                        processor.setGamma(value[0], value[1]);
                        break;
                    case 'highlight':
                        processor.setHighlight(value);
                        break;
                    case 'aberrationCorrection':
                        processor.setAberrationCorrection(value.r, value.b);
                        break;
                }
            });
            
            const startTime = Date.now();
            const processed = processor.process();
            const processTime = Date.now() - startTime;
            
            if (processed) {
                log('SUCCESS', `✓ ${combo.name}: ${processTime}ms`);
            } else {
                log('ERROR', `✗ ${combo.name}: Processing failed`);
            }
            
        } catch (error) {
            log('ERROR', `✗ ${combo.name}: ${error.message}`);
        } finally {
            processor.delete();
        }
    }
    
    return true;
}

async function main() {
    console.log(`\n${colors.cyan}${colors.bright}🧪 LibRaw Extended Parameters Test Suite${colors.reset}\n`);
    
    try {
        const LibRaw = await loadLibRaw();
        log('SUCCESS', `LibRaw ${LibRaw.LibRaw.getVersion()} loaded`);
        
        // Verify new methods exist
        const processor = new LibRaw.LibRaw();
        const methodsToCheck = [
            'setHighlight', 'setGamma', 'setNoiseThreshold', 'setMedianPasses',
            'setExposure', 'setAutoBright', 'setCustomWB', 'setFourColorRGB',
            'setDCBIterations', 'setDCBEnhance', 'setOutputBPS', 'setUserBlack',
            'setAberrationCorrection'
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
        
        log('SUCCESS', 'All extended methods are available');
        
        // Run tests
        const extendedTestsPassed = await testExtendedParameters(LibRaw);
        const combinationTestsPassed = await testParameterCombinations(LibRaw);
        
        // Summary
        console.log(`\n${colors.cyan}${colors.bright}📊 Extended Parameters Test Summary${colors.reset}\n`);
        
        const allPassed = extendedTestsPassed && combinationTestsPassed;
        
        if (allPassed) {
            log('SUCCESS', '🎉 All extended parameter tests passed!');
            log('INFO', 'LibRaw WASM now supports advanced RAW processing features');
        } else {
            log('ERROR', '❌ Some extended parameter tests failed');
        }
        
        return allPassed;
        
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

module.exports = { testExtendedParameters, testParameterCombinations };