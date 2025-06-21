#!/usr/bin/env node
/**
 * LibRaw Sony ARW Debug Tool
 * Detailed debugging for ARW file loading issues
 */

const fs = require('fs');
const path = require('path');

function log(level, message) {
    const colors = {
        INFO: '\x1b[36m\x1b[1m',
        ERROR: '\x1b[31m\x1b[1m',
        SUCCESS: '\x1b[32m\x1b[1m',
        DEBUG: '\x1b[35m\x1b[1m',
        RESET: '\x1b[0m'
    };
    console.log(`${colors[level] || ''}[${level}]${colors.RESET} ${message}`);
}

async function debugARWFile() {
    const filePath = '/home/takuya/LLM-Camera/LibRaw/test-image/DSC00085.ARW';
    
    if (!fs.existsSync(filePath)) {
        log('ERROR', `ARW file not found: ${filePath}`);
        return;
    }
    
    log('INFO', 'Analyzing ARW file structure...');
    
    // Read file header
    const fileBuffer = fs.readFileSync(filePath);
    const stats = fs.statSync(filePath);
    
    log('INFO', `File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    log('INFO', `Buffer length: ${fileBuffer.length} bytes`);
    
    // Check TIFF header
    const header = fileBuffer.slice(0, 8);
    log('DEBUG', `TIFF header: ${header.toString('hex')}`);
    
    if (header[0] === 0x49 && header[1] === 0x49 && header[2] === 0x2a && header[3] === 0x00) {
        log('SUCCESS', 'Valid TIFF little-endian header detected');
    } else if (header[0] === 0x4d && header[1] === 0x4d && header[2] === 0x00 && header[3] === 0x2a) {
        log('SUCCESS', 'Valid TIFF big-endian header detected');
    } else {
        log('ERROR', 'Invalid TIFF header');
        return;
    }
    
    // Check for Sony ARW markers
    const sonyMarkers = [
        'SONY',
        'ILCE',
        'DSC',
        'SLT'
    ];
    
    let foundMarkers = [];
    for (const marker of sonyMarkers) {
        if (fileBuffer.includes(Buffer.from(marker, 'ascii'))) {
            foundMarkers.push(marker);
        }
    }
    
    log('SUCCESS', `Sony markers found: ${foundMarkers.join(', ')}`);
    
    // Test LibRaw loading with different approaches
    try {
        log('INFO', 'Loading LibRaw module...');
        const wasmPath = path.resolve(__dirname, '../wasm/libraw-node.js');
        const LibRawFactory = require(wasmPath);
        const LibRaw = await LibRawFactory();
        
        log('SUCCESS', `LibRaw ${LibRaw.LibRaw.getVersion()} loaded`);
        
        // Test camera list for Sony support
        try {
            const cameraList = LibRaw.LibRaw.getCameraList();
            log('DEBUG', `Camera list type: ${typeof cameraList}, length: ${cameraList ? cameraList.length : 'undefined'}`);
            
            const sonyCameras = [];
            if (Array.isArray(cameraList)) {
                for (const camera of cameraList) {
                    if (camera.toLowerCase().includes('sony') || 
                        camera.toLowerCase().includes('ilce') ||
                        camera.toLowerCase().includes('dsc')) {
                        sonyCameras.push(camera);
                    }
                }
                log('SUCCESS', `Found ${sonyCameras.length} Sony cameras in database`);
                if (sonyCameras.length > 0) {
                    log('DEBUG', `Sample Sony cameras: ${sonyCameras.slice(0, 5).join(', ')}`);
                }
            } else {
                log('DEBUG', `Camera list format not as expected, total cameras: ${LibRaw.LibRaw.getCameraCount()}`);
            }
        } catch (error) {
            log('DEBUG', `Camera list access failed: ${error.message}`);
        }
        
        // Try loading file with maximum debug
        const processor = new LibRaw.LibRaw();
        processor.setDebugMode(true);
        
        log('INFO', 'Attempting to load ARW file...');
        
        // Convert to binary string (this might be the issue)
        log('DEBUG', 'Converting buffer to binary string...');
        const startConvert = process.hrtime.bigint();
        
        // Try different conversion methods
        const methods = [
            {
                name: 'Array.from + String.fromCharCode',
                convert: (buf) => Array.from(buf).map(byte => String.fromCharCode(byte)).join('')
            },
            {
                name: 'Buffer toString with latin1',
                convert: (buf) => buf.toString('latin1')
            },
            {
                name: 'Direct byte mapping',
                convert: (buf) => {
                    let result = '';
                    for (let i = 0; i < buf.length; i++) {
                        result += String.fromCharCode(buf[i]);
                    }
                    return result;
                }
            }
        ];
        
        for (const method of methods) {
            log('INFO', `Testing conversion method: ${method.name}`);
            
            try {
                const startTime = process.hrtime.bigint();
                const binaryString = method.convert(fileBuffer); // Test with full file
                const convertTime = Number(process.hrtime.bigint() - startTime) / 1000000;
                
                log('DEBUG', `Conversion completed in ${convertTime.toFixed(2)}ms`);
                log('DEBUG', `Binary string length: ${binaryString.length}`);
                log('DEBUG', `First 32 chars: ${binaryString.slice(0, 32).split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')}`);
                
                // Try loading
                const loaded = processor.loadFromMemory(binaryString);
                
                if (loaded) {
                    log('SUCCESS', `ARW file loaded successfully with method: ${method.name}`);
                    
                    // Get metadata
                    const metadata = processor.getMetadata();
                    log('SUCCESS', `Camera: ${metadata.make} ${metadata.model}`);
                    log('SUCCESS', `Image size: ${metadata.rawWidth} × ${metadata.rawHeight}`);
                    break;
                } else {
                    const errorMsg = processor.getLastError();
                    log('ERROR', `Loading failed with ${method.name}: ${errorMsg}`);
                }
                
            } catch (error) {
                log('ERROR', `Method ${method.name} failed: ${error.message}`);
            }
        }
        
        processor.delete();
        
    } catch (error) {
        log('ERROR', `LibRaw test failed: ${error.message}`);
    }
}

async function main() {
    console.log('\x1b[36m\x1b[1m🔍 LibRaw Sony ARW Debug Tool\x1b[0m\n');
    await debugARWFile();
}

main().catch(console.error);