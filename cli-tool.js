#!/usr/bin/env node
/**
 * LibRaw WebAssembly Command Line Tool
 * Process RAW files from command line without browser
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function log(level, message) {
    const colorMap = {
        INFO: colors.cyan,
        SUCCESS: colors.green,
        ERROR: colors.red,
        WARNING: colors.yellow
    };
    
    const color = colorMap[level] || colors.white;
    console.log(`${color}${colors.bright}[${level}]${colors.reset} ${message}`);
}

function showUsage() {
    console.log(`${colors.cyan}${colors.bright}LibRaw WebAssembly CLI Tool${colors.reset}

Usage: node cli-tool.js [options] <input-file> [output-file]

Options:
  -h, --help              Show this help message
  -v, --verbose           Enable verbose output
  -d, --debug             Enable debug mode
  -q, --quality <num>     Set interpolation quality (0-11)
                          0=Linear, 1=VNG, 2=PPG, 3=AHD, 4=DCB, 11=DHT
  -c, --colorspace <num>  Set output colorspace (1-5)
                          1=sRGB, 2=Adobe RGB, 3=Wide Gamut, 4=ProPhoto, 5=XYZ
  -b, --brightness <num>  Set brightness multiplier (0.5-2.0)
  -w, --white-balance <mode>  Set white balance mode
                          camera=Use camera WB, auto=Auto WB, none=No adjustment
  --half-size             Process at half resolution (faster)
  --metadata              Show metadata only (no processing)
  --thumbnail             Extract thumbnail only
  --info                  Show camera and processing info
  --format <fmt>          Output format: rgb, ppm, tiff (default: rgb)

Examples:
  node cli-tool.js input.cr2                    # Process with defaults
  node cli-tool.js -q 3 -c 1 input.nef out.rgb # AHD quality, sRGB
  node cli-tool.js --metadata input.arw         # Show metadata only
  node cli-tool.js --thumbnail input.dng thumb.jpg # Extract thumbnail
  node cli-tool.js -d --info input.raf          # Debug info
`);
}

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        inputFile: null,
        outputFile: null,
        verbose: false,
        debug: false,
        quality: 3, // AHD
        colorspace: 1, // sRGB
        brightness: 1.0,
        whiteBalance: 'camera',
        halfSize: false,
        metadataOnly: false,
        thumbnailOnly: false,
        showInfo: false,
        format: 'rgb'
    };
    
    let i = 0;
    while (i < args.length) {
        const arg = args[i];
        
        if (arg === '-h' || arg === '--help') {
            showUsage();
            process.exit(0);
        } else if (arg === '-v' || arg === '--verbose') {
            options.verbose = true;
        } else if (arg === '-d' || arg === '--debug') {
            options.debug = true;
            options.verbose = true;
        } else if (arg === '-q' || arg === '--quality') {
            options.quality = parseInt(args[++i]);
            if (isNaN(options.quality) || options.quality < 0 || options.quality > 11) {
                log('ERROR', 'Quality must be between 0 and 11');
                process.exit(1);
            }
        } else if (arg === '-c' || arg === '--colorspace') {
            options.colorspace = parseInt(args[++i]);
            if (isNaN(options.colorspace) || options.colorspace < 1 || options.colorspace > 5) {
                log('ERROR', 'Colorspace must be between 1 and 5');
                process.exit(1);
            }
        } else if (arg === '-b' || arg === '--brightness') {
            options.brightness = parseFloat(args[++i]);
            if (isNaN(options.brightness) || options.brightness < 0.1 || options.brightness > 5.0) {
                log('ERROR', 'Brightness must be between 0.1 and 5.0');
                process.exit(1);
            }
        } else if (arg === '-w' || arg === '--white-balance') {
            options.whiteBalance = args[++i];
            if (!['camera', 'auto', 'none'].includes(options.whiteBalance)) {
                log('ERROR', 'White balance must be: camera, auto, or none');
                process.exit(1);
            }
        } else if (arg === '--half-size') {
            options.halfSize = true;
        } else if (arg === '--metadata') {
            options.metadataOnly = true;
        } else if (arg === '--thumbnail') {
            options.thumbnailOnly = true;
        } else if (arg === '--info') {
            options.showInfo = true;
        } else if (arg === '--format') {
            options.format = args[++i];
            if (!['rgb', 'ppm', 'tiff'].includes(options.format)) {
                log('ERROR', 'Format must be: rgb, ppm, or tiff');
                process.exit(1);
            }
        } else if (arg.startsWith('-')) {
            log('ERROR', `Unknown option: ${arg}`);
            process.exit(1);
        } else {
            if (!options.inputFile) {
                options.inputFile = arg;
            } else if (!options.outputFile) {
                options.outputFile = arg;
            } else {
                log('ERROR', 'Too many arguments');
                process.exit(1);
            }
        }
        i++;
    }
    
    if (!options.inputFile) {
        log('ERROR', 'Input file is required');
        showUsage();
        process.exit(1);
    }
    
    if (!fs.existsSync(options.inputFile)) {
        log('ERROR', `Input file not found: ${options.inputFile}`);
        process.exit(1);
    }
    
    // Auto-generate output filename if not provided
    if (!options.outputFile && !options.metadataOnly && !options.showInfo) {
        const basename = path.basename(options.inputFile, path.extname(options.inputFile));
        if (options.thumbnailOnly) {
            options.outputFile = `${basename}_thumb.jpg`;
        } else {
            const ext = options.format === 'ppm' ? 'ppm' : 
                       options.format === 'tiff' ? 'tiff' : 'rgb';
            options.outputFile = `${basename}_processed.${ext}`;
        }
    }
    
    return options;
}

async function loadLibRaw() {
    try {
        const wasmPath = path.resolve(__dirname, 'wasm/libraw.js');
        
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`WASM module not found at ${wasmPath}`);
        }
        
        const LibRawModule = await import(`file://${wasmPath}`);
        const LibRaw = await LibRawModule.default();
        
        return LibRaw;
        
    } catch (error) {
        log('ERROR', `Failed to load LibRaw WASM: ${error.message}`);
        process.exit(1);
    }
}

function formatMetadata(metadata) {
    return `Camera Information:
  Make: ${metadata.make}
  Model: ${metadata.model}
  
Shooting Information:
  ISO: ${metadata.iso}
  Shutter: ${metadata.shutter}s
  Aperture: f/${metadata.aperture}
  Focal Length: ${metadata.focalLength}mm
  Timestamp: ${new Date(metadata.timestamp * 1000).toISOString()}
  
Image Dimensions:
  RAW Size: ${metadata.rawWidth} × ${metadata.rawHeight}
  Output Size: ${metadata.width} × ${metadata.height}
  Rotation: ${metadata.flip}°
  
Color Information:
  Camera White Balance: [${metadata.color.cameraWhiteBalance.map(v => v.toFixed(3)).join(', ')}]`;
}

function formatProcessingInfo(info) {
    return `Camera Details:
  Make: ${info.camera_make}
  Model: ${info.camera_model}
  Normalized: ${info.camera_normalized_make} ${info.camera_normalized_model}
  
Image Details:
  RAW Dimensions: ${info.raw_width} × ${info.raw_height}
  Output Dimensions: ${info.width} × ${info.height}
  Internal Dimensions: ${info.iwidth} × ${info.iheight}
  Colors: ${info.colors}
  Filters: 0x${info.filters.toString(16).toUpperCase()}
  
Color Information:
  Flags: ${info.color.color_flags}
  Black Level: ${info.color.black}
  Maximum: ${info.color.maximum}
  Camera Multipliers: [${info.color.cam_mul.map(v => v.toFixed(3)).join(', ')}]
  
Processing:
  Warnings: ${info.process_warnings}`;
}

function writePPM(imageData, outputPath) {
    const header = `P6\n${imageData.width} ${imageData.height}\n255\n`;
    const headerBuffer = Buffer.from(header, 'ascii');
    const imageBuffer = Buffer.from(imageData.data);
    const combinedBuffer = Buffer.concat([headerBuffer, imageBuffer]);
    fs.writeFileSync(outputPath, combinedBuffer);
}

async function processRAWFile(options) {
    const LibRaw = await loadLibRaw();
    
    if (options.verbose) {
        log('INFO', `LibRaw version: ${LibRaw.LibRaw.getVersion()}`);
        log('INFO', `Supported cameras: ${LibRaw.LibRaw.getCameraCount()}`);
    }
    
    const processor = new LibRaw.LibRaw();
    
    if (options.debug) {
        processor.setDebugMode(true);
    }
    
    try {
        // Load file
        if (options.verbose) log('INFO', 'Loading RAW file...');
        const fileBuffer = fs.readFileSync(options.inputFile);
        const binaryString = Array.from(fileBuffer)
            .map(byte => String.fromCharCode(byte))
            .join('');
        
        const loaded = processor.loadFromMemory(binaryString);
        if (!loaded) {
            log('ERROR', 'Failed to load RAW file');
            return;
        }
        
        if (options.verbose) log('SUCCESS', 'RAW file loaded');
        
        // Show info if requested
        if (options.showInfo) {
            const procInfo = processor.getProcessingInfo();
            console.log('\n' + formatProcessingInfo(procInfo));
        }
        
        // Unpack
        if (options.verbose) log('INFO', 'Unpacking RAW data...');
        const unpacked = processor.unpack();
        if (!unpacked) {
            log('ERROR', 'Failed to unpack RAW data');
            return;
        }
        
        if (options.verbose) log('SUCCESS', 'RAW data unpacked');
        
        // Get metadata
        const metadata = processor.getMetadata();
        
        if (options.metadataOnly) {
            console.log('\n' + formatMetadata(metadata));
            return;
        }
        
        // Extract thumbnail if requested
        if (options.thumbnailOnly) {
            if (options.verbose) log('INFO', 'Extracting thumbnail...');
            const thumbnail = processor.getThumbnail();
            
            if (thumbnail && thumbnail.format === 'jpeg') {
                fs.writeFileSync(options.outputFile, thumbnail.data);
                log('SUCCESS', `Thumbnail saved to: ${options.outputFile}`);
                log('INFO', `Thumbnail size: ${thumbnail.width}×${thumbnail.height}`);
            } else {
                log('ERROR', 'No JPEG thumbnail available in this file');
            }
            return;
        }
        
        // Configure processing options
        processor.setUseCameraWB(options.whiteBalance === 'camera');
        processor.setUseAutoWB(options.whiteBalance === 'auto');
        processor.setOutputColor(options.colorspace);
        processor.setQuality(options.quality);
        processor.setBrightness(options.brightness);
        processor.setHalfSize(options.halfSize);
        
        if (options.verbose) {
            log('INFO', `Processing settings:`);
            console.log(`  Quality: ${options.quality} (${['Linear','VNG','PPG','AHD','DCB'][options.quality] || 'Custom'})`);
            console.log(`  Colorspace: ${['','sRGB','Adobe RGB','Wide Gamut','ProPhoto','XYZ'][options.colorspace]}`);
            console.log(`  White Balance: ${options.whiteBalance}`);
            console.log(`  Brightness: ${options.brightness}`);
            console.log(`  Half Size: ${options.halfSize}`);
        }
        
        // Process
        if (options.verbose) log('INFO', 'Processing image...');
        const startTime = process.hrtime.bigint();
        
        const processed = processor.process();
        if (!processed) {
            log('ERROR', 'Image processing failed');
            const errorMsg = processor.getLastError();
            log('ERROR', `Error: ${errorMsg}`);
            return;
        }
        
        const processTime = Number(process.hrtime.bigint() - startTime) / 1000000;
        if (options.verbose) log('SUCCESS', `Processing completed in ${processTime.toFixed(2)}ms`);
        
        // Get image data
        if (options.verbose) log('INFO', 'Retrieving image data...');
        const imageData = processor.getImageData();
        
        if (!imageData) {
            log('ERROR', 'Failed to get image data');
            return;
        }
        
        if (options.verbose) {
            log('SUCCESS', `Image data retrieved: ${imageData.width}×${imageData.height}`);
            log('INFO', `Data size: ${(imageData.data.length / 1024 / 1024).toFixed(2)} MB`);
        }
        
        // Save output
        if (options.verbose) log('INFO', `Saving to: ${options.outputFile}`);
        
        if (options.format === 'ppm') {
            writePPM(imageData, options.outputFile);
        } else {
            // Raw RGB data
            fs.writeFileSync(options.outputFile, imageData.data);
        }
        
        log('SUCCESS', `Image saved successfully: ${options.outputFile}`);
        
        if (options.verbose) {
            console.log(`\nImage Information:`);
            console.log(`  Dimensions: ${imageData.width} × ${imageData.height}`);
            console.log(`  Colors: ${imageData.colors}`);
            console.log(`  Bits per channel: ${imageData.bits}`);
            console.log(`  Total processing time: ${processTime.toFixed(2)}ms`);
            console.log(`  File size: ${(fs.statSync(options.outputFile).size / 1024 / 1024).toFixed(2)} MB`);
        }
        
    } catch (error) {
        log('ERROR', `Processing failed: ${error.message}`);
        if (options.debug) {
            console.error(error.stack);
        }
    } finally {
        processor.delete();
    }
}

async function main() {
    const options = parseArgs();
    
    if (options.verbose) {
        console.log(`${colors.cyan}${colors.bright}LibRaw WebAssembly CLI Tool${colors.reset}\n`);
        log('INFO', `Input: ${options.inputFile}`);
        if (options.outputFile) {
            log('INFO', `Output: ${options.outputFile}`);
        }
    }
    
    await processRAWFile(options);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log('ERROR', `Uncaught exception: ${error.message}`);
    process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        log('ERROR', error.message);
        process.exit(1);
    });
}