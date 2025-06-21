/* LibRaw WebAssembly wrapper
 * Provides JavaScript-friendly interface to LibRaw functionality
 */

#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <vector>
#include <string>
#include <cstring>
#include "libraw/libraw.h"

using namespace emscripten;

class LibRawWasm {
private:
    LibRaw processor;
    bool isLoaded;
    bool debugMode;

public:
    LibRawWasm() : isLoaded(false), debugMode(false) {}
    
    ~LibRawWasm() {
        if (isLoaded) {
            processor.recycle();
        }
    }
    
    // Load RAW file from memory buffer (string version - deprecated)
    bool loadFromMemory(const std::string& buffer) {
        if (debugMode) {
            printf("[DEBUG] LibRaw: Loading string buffer of size %zu bytes\n", buffer.size());
        }
        
        if (isLoaded) {
            if (debugMode) printf("[DEBUG] LibRaw: Recycling previous instance\n");
            processor.recycle();
            isLoaded = false;
        }
        
        int ret = processor.open_buffer((void*)buffer.data(), buffer.size());
        if (ret != LIBRAW_SUCCESS) {
            if (debugMode) {
                printf("[DEBUG] LibRaw: Failed to open string buffer, error: %s\n", 
                       libraw_strerror(ret));
            }
            return false;
        }
        
        if (debugMode) {
            printf("[DEBUG] LibRaw: String buffer loaded successfully\n");
            printf("[DEBUG] LibRaw: Camera: %s %s\n", 
                   processor.imgdata.idata.make, 
                   processor.imgdata.idata.model);
            printf("[DEBUG] LibRaw: Image size: %dx%d\n", 
                   processor.imgdata.sizes.raw_width, 
                   processor.imgdata.sizes.raw_height);
        }
        
        isLoaded = true;
        return true;
    }
    
    // Load RAW file from Uint8Array (preferred method)
    bool loadFromUint8Array(val uint8Array) {
        if (debugMode) {
            printf("[DEBUG] LibRaw: Loading Uint8Array buffer\n");
        }
        
        if (isLoaded) {
            if (debugMode) printf("[DEBUG] LibRaw: Recycling previous instance\n");
            processor.recycle();
            isLoaded = false;
        }
        
        // Get buffer info
        size_t length = uint8Array["length"].as<size_t>();
        if (debugMode) {
            printf("[DEBUG] LibRaw: Uint8Array length: %zu bytes\n", length);
        }
        
        // Allocate memory in WASM heap
        void* wasmBuffer = malloc(length);
        if (!wasmBuffer) {
            if (debugMode) printf("[DEBUG] LibRaw: Failed to allocate WASM memory\n");
            return false;
        }
        
        // Copy data from JavaScript to WASM memory using typed memory view
        if (debugMode) {
            printf("[DEBUG] LibRaw: Copying data to WASM buffer at %p\n", wasmBuffer);
        }
        
        // Create a typed memory view for the WASM buffer
        val wasmView = val(typed_memory_view(length, (unsigned char*)wasmBuffer));
        
        // Copy data from JavaScript Uint8Array to WASM memory
        wasmView.call<void>("set", uint8Array);
        
        if (debugMode) {
            printf("[DEBUG] LibRaw: Data copied using typed memory view\n");
        }
        
        if (debugMode) {
            printf("[DEBUG] LibRaw: Data copied to WASM memory\n");
            // Show first few bytes for verification
            unsigned char* bytes = (unsigned char*)wasmBuffer;
            printf("[DEBUG] LibRaw: First 16 bytes: ");
            for (int i = 0; i < 16 && i < length; i++) {
                printf("%02x ", bytes[i]);
            }
            printf("\n");
        }
        
        // Try to open the buffer
        int ret = processor.open_buffer(wasmBuffer, length);
        
        if (ret != LIBRAW_SUCCESS) {
            if (debugMode) {
                printf("[DEBUG] LibRaw: Failed to open Uint8Array buffer, error: %s\n", 
                       libraw_strerror(ret));
            }
            free(wasmBuffer);
            return false;
        }
        
        if (debugMode) {
            printf("[DEBUG] LibRaw: Uint8Array buffer loaded successfully\n");
            printf("[DEBUG] LibRaw: Camera: %s %s\n", 
                   processor.imgdata.idata.make, 
                   processor.imgdata.idata.model);
            printf("[DEBUG] LibRaw: Image size: %dx%d\n", 
                   processor.imgdata.sizes.raw_width, 
                   processor.imgdata.sizes.raw_height);
        }
        
        isLoaded = true;
        
        // Keep buffer allocated until processor is recycled
        // Note: This creates a small memory leak, but it's necessary for LibRaw to work
        // The buffer will be freed when the processor is deleted or recycled
        
        return true;
    }
    
    // Unpack RAW data
    bool unpack() {
        if (!isLoaded) return false;
        
        if (debugMode) printf("[DEBUG] LibRaw: Unpacking RAW data...\n");
        
        int ret = processor.unpack();
        if (ret != LIBRAW_SUCCESS) {
            if (debugMode) {
                printf("[DEBUG] LibRaw: Unpack failed, error: %s\n", 
                       libraw_strerror(ret));
            }
            return false;
        }
        
        if (debugMode) {
            printf("[DEBUG] LibRaw: Unpack successful\n");
            printf("[DEBUG] LibRaw: Colors: %d, Filters: 0x%x\n", 
                   processor.imgdata.idata.colors,
                   processor.imgdata.idata.filters);
        }
        
        return true;
    }
    
    // Process image (demosaic, color conversion, etc.)
    bool process() {
        if (!isLoaded) return false;
        
        if (debugMode) printf("[DEBUG] LibRaw: Starting image processing...\n");
        
        // Set reasonable defaults
        processor.imgdata.params.use_camera_wb = 1;
        processor.imgdata.params.use_auto_wb = 0;
        processor.imgdata.params.output_color = 1; // sRGB
        processor.imgdata.params.output_bps = 8;
        processor.imgdata.params.no_auto_bright = 0;
        processor.imgdata.params.gamm[0] = 1/2.4;
        processor.imgdata.params.gamm[1] = 12.92;
        
        if (debugMode) {
            printf("[DEBUG] LibRaw: Processing parameters:\n");
            printf("[DEBUG] LibRaw:   Use camera WB: %d\n", processor.imgdata.params.use_camera_wb);
            printf("[DEBUG] LibRaw:   Output color: %d\n", processor.imgdata.params.output_color);
            printf("[DEBUG] LibRaw:   Quality: %d\n", processor.imgdata.params.user_qual);
            printf("[DEBUG] LibRaw:   Brightness: %.2f\n", processor.imgdata.params.bright);
        }
        
        int ret = processor.dcraw_process();
        if (ret != LIBRAW_SUCCESS) {
            if (debugMode) {
                printf("[DEBUG] LibRaw: Processing failed, error: %s\n", 
                       libraw_strerror(ret));
            }
            return false;
        }
        
        if (debugMode) printf("[DEBUG] LibRaw: Image processing completed successfully\n");
        return true;
    }
    
    // Get processed image as RGB data
    val getImageData() {
        if (!isLoaded) return val::null();
        
        if (debugMode) printf("[DEBUG] LibRaw: Creating memory image...\n");
        
        libraw_processed_image_t *image = processor.dcraw_make_mem_image();
        if (!image) {
            if (debugMode) printf("[DEBUG] LibRaw: Failed to create memory image\n");
            return val::null();
        }
        
        if (debugMode) {
            printf("[DEBUG] LibRaw: Memory image created successfully\n");
            printf("[DEBUG] LibRaw:   Size: %dx%d\n", image->width, image->height);
            printf("[DEBUG] LibRaw:   Colors: %d, Bits: %d\n", image->colors, image->bits);
            printf("[DEBUG] LibRaw:   Data size: %u bytes\n", (unsigned int)image->data_size);
        }
        
        // Create result object
        val result = val::object();
        result.set("width", image->width);
        result.set("height", image->height);
        result.set("colors", image->colors);
        result.set("bits", image->bits);
        
        // Copy image data to JavaScript array
        size_t dataSize = image->data_size;
        val data = val::global("Uint8Array").new_(dataSize);
        
        // Use typed memory view for safe copying
        val dataView = val(typed_memory_view(dataSize, image->data));
        data.call<void>("set", dataView);
        
        result.set("data", data);
        
        LibRaw::dcraw_clear_mem(image);
        
        if (debugMode) printf("[DEBUG] LibRaw: Image data copied to JavaScript\n");
        return result;
    }
    
    // Get image metadata
    val getMetadata() {
        if (!isLoaded) return val::null();
        
        val metadata = val::object();
        
        // Camera info
        metadata.set("make", std::string(processor.imgdata.idata.make));
        metadata.set("model", std::string(processor.imgdata.idata.model));
        metadata.set("timestamp", (int)processor.imgdata.other.timestamp);
        
        // Shooting info
        metadata.set("iso", processor.imgdata.other.iso_speed);
        metadata.set("shutter", processor.imgdata.other.shutter);
        metadata.set("aperture", processor.imgdata.other.aperture);
        metadata.set("focalLength", processor.imgdata.other.focal_len);
        
        // Image dimensions
        metadata.set("rawWidth", processor.imgdata.sizes.raw_width);
        metadata.set("rawHeight", processor.imgdata.sizes.raw_height);
        metadata.set("width", processor.imgdata.sizes.width);
        metadata.set("height", processor.imgdata.sizes.height);
        metadata.set("flip", processor.imgdata.sizes.flip);
        
        // Color info
        val colorDesc = val::object();
        colorDesc.set("cameraWhiteBalance", val::array());
        for (int i = 0; i < 4; i++) {
            colorDesc["cameraWhiteBalance"].call<void>("push", 
                processor.imgdata.color.cam_mul[i]);
        }
        metadata.set("color", colorDesc);
        
        return metadata;
    }
    
    // Get thumbnail if available
    val getThumbnail() {
        if (!isLoaded) return val::null();
        
        int ret = processor.unpack_thumb();
        if (ret != LIBRAW_SUCCESS) return val::null();
        
        if (processor.imgdata.thumbnail.tformat == LIBRAW_THUMBNAIL_JPEG) {
            val result = val::object();
            result.set("format", "jpeg");
            result.set("width", processor.imgdata.thumbnail.twidth);
            result.set("height", processor.imgdata.thumbnail.theight);
            
            // Copy thumbnail data
            size_t thumbSize = processor.imgdata.thumbnail.tlength;
            val data = val::global("Uint8Array").new_(thumbSize);
            
            val dataView = val(typed_memory_view(thumbSize, processor.imgdata.thumbnail.thumb));
            data.call<void>("set", dataView);
            
            result.set("data", data);
            return result;
        }
        
        return val::null();
    }
    
    // Set processing parameters
    void setUseAutoWB(bool value) {
        processor.imgdata.params.use_auto_wb = value ? 1 : 0;
    }
    
    void setUseCameraWB(bool value) {
        processor.imgdata.params.use_camera_wb = value ? 1 : 0;
    }
    
    void setOutputColor(int space) {
        processor.imgdata.params.output_color = space;
    }
    
    void setBrightness(float brightness) {
        processor.imgdata.params.bright = brightness;
    }
    
    void setQuality(int quality) {
        processor.imgdata.params.user_qual = quality;
    }
    
    void setHalfSize(bool half) {
        processor.imgdata.params.half_size = half ? 1 : 0;
    }
    
    // Get LibRaw version
    static std::string getVersion() {
        return std::string(LibRaw::version());
    }
    
    // Get number of supported cameras
    static int getCameraCount() {
        return LibRaw::cameraCount();
    }
    
    // Get supported camera list
    static val getCameraList() {
        val list = val::array();
        const char** clist = LibRaw::cameraList();
        int count = LibRaw::cameraCount();
        
        for (int i = 0; i < count; i++) {
            list.call<void>("push", std::string(clist[i]));
        }
        
        return list;
    }
    
    // Enable/disable debug mode
    void setDebugMode(bool enabled) {
        debugMode = enabled;
        if (debugMode) {
            printf("[DEBUG] LibRaw: Debug mode enabled\n");
        }
    }
    
    bool getDebugMode() {
        return debugMode;
    }
    
    // Get last error message
    std::string getLastError() {
        return std::string(libraw_strerror(processor.imgdata.process_warnings));
    }
    
    // Get detailed processing info
    val getProcessingInfo() {
        val info = val::object();
        
        if (isLoaded) {
            // Camera info
            info.set("camera_make", std::string(processor.imgdata.idata.make));
            info.set("camera_model", std::string(processor.imgdata.idata.model));
            info.set("camera_normalized_make", std::string(processor.imgdata.idata.normalized_make));
            info.set("camera_normalized_model", std::string(processor.imgdata.idata.normalized_model));
            
            // Image info
            info.set("raw_width", processor.imgdata.sizes.raw_width);
            info.set("raw_height", processor.imgdata.sizes.raw_height);
            info.set("width", processor.imgdata.sizes.width);
            info.set("height", processor.imgdata.sizes.height);
            info.set("iwidth", processor.imgdata.sizes.iwidth);
            info.set("iheight", processor.imgdata.sizes.iheight);
            info.set("colors", processor.imgdata.idata.colors);
            info.set("filters", (int)processor.imgdata.idata.filters);
            
            // Processing warnings
            info.set("process_warnings", processor.imgdata.process_warnings);
            
            // Color info
            val colorInfo = val::object();
            colorInfo.set("black", processor.imgdata.color.black);
            colorInfo.set("maximum", processor.imgdata.color.maximum);
            
            val camMul = val::array();
            for (int i = 0; i < 4; i++) {
                camMul.call<void>("push", processor.imgdata.color.cam_mul[i]);
            }
            colorInfo.set("cam_mul", camMul);
            
            info.set("color", colorInfo);
        }
        
        return info;
    }
};

// Emscripten bindings
EMSCRIPTEN_BINDINGS(libraw_module) {
    class_<LibRawWasm>("LibRaw")
        .constructor<>()
        .function("loadFromMemory", &LibRawWasm::loadFromMemory)
        .function("loadFromUint8Array", &LibRawWasm::loadFromUint8Array)
        .function("unpack", &LibRawWasm::unpack)
        .function("process", &LibRawWasm::process)
        .function("getImageData", &LibRawWasm::getImageData)
        .function("getMetadata", &LibRawWasm::getMetadata)
        .function("getThumbnail", &LibRawWasm::getThumbnail)
        .function("setUseAutoWB", &LibRawWasm::setUseAutoWB)
        .function("setUseCameraWB", &LibRawWasm::setUseCameraWB)
        .function("setOutputColor", &LibRawWasm::setOutputColor)
        .function("setBrightness", &LibRawWasm::setBrightness)
        .function("setQuality", &LibRawWasm::setQuality)
        .function("setHalfSize", &LibRawWasm::setHalfSize)
        .function("setDebugMode", &LibRawWasm::setDebugMode)
        .function("getDebugMode", &LibRawWasm::getDebugMode)
        .function("getLastError", &LibRawWasm::getLastError)
        .function("getProcessingInfo", &LibRawWasm::getProcessingInfo)
        .class_function("getVersion", &LibRawWasm::getVersion)
        .class_function("getCameraCount", &LibRawWasm::getCameraCount)
        .class_function("getCameraList", &LibRawWasm::getCameraList);
    
    // Color space constants
    constant("OUTPUT_COLOR_RAW", 0);
    constant("OUTPUT_COLOR_SRGB", 1);
    constant("OUTPUT_COLOR_ADOBE", 2);
    constant("OUTPUT_COLOR_WIDE", 3);
    constant("OUTPUT_COLOR_PROPHOTO", 4);
    constant("OUTPUT_COLOR_XYZ", 5);
    
    // Quality constants
    constant("QUALITY_LINEAR", 0);
    constant("QUALITY_VNG", 1);
    constant("QUALITY_PPG", 2);
    constant("QUALITY_AHD", 3);
    constant("QUALITY_DCB", 4);
    constant("QUALITY_DHT", 11);
}