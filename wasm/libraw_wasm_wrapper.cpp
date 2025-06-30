/* LibRaw WebAssembly wrapper
 * Provides JavaScript-friendly interface to LibRaw functionality
 */

#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <vector>
#include <string>
#include <cstring>
#include <algorithm>
#include "libraw/libraw.h"

using namespace emscripten;

// Helper functions for color adjustments
inline void rgbToHsl(float r, float g, float b, float& h, float& s, float& l) {
    float max = std::max({r, g, b});
    float min = std::min({r, g, b});
    l = (max + min) / 2.0f;
    
    if (max == min) {
        h = s = 0.0f; // achromatic
    } else {
        float d = max - min;
        s = l > 0.5f ? d / (2.0f - max - min) : d / (max + min);
        
        if (max == r) {
            h = (g - b) / d + (g < b ? 6.0f : 0.0f);
        } else if (max == g) {
            h = (b - r) / d + 2.0f;
        } else {
            h = (r - g) / d + 4.0f;
        }
        h /= 6.0f;
    }
}

inline void hslToRgb(float h, float s, float l, float& r, float& g, float& b) {
    if (s == 0.0f) {
        r = g = b = l; // achromatic
    } else {
        auto hue2rgb = [](float p, float q, float t) {
            if (t < 0.0f) t += 1.0f;
            if (t > 1.0f) t -= 1.0f;
            if (t < 1.0f/6.0f) return p + (q - p) * 6.0f * t;
            if (t < 1.0f/2.0f) return q;
            if (t < 2.0f/3.0f) return p + (q - p) * (2.0f/3.0f - t) * 6.0f;
            return p;
        };
        
        float q = l < 0.5f ? l * (1.0f + s) : l + s - l * s;
        float p = 2.0f * l - q;
        r = hue2rgb(p, q, h + 1.0f/3.0f);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1.0f/3.0f);
    }
}

class LibRawWasm {
private:
    LibRaw processor;
    bool isLoaded;
    bool debugMode;
    float custom_saturation;
    float custom_vibrance;

public:
    LibRawWasm() : isLoaded(false), debugMode(false), custom_saturation(0.0f), custom_vibrance(0.0f) {}
    
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
        
        // Apply saturation and vibrance adjustments if needed
        if (custom_saturation != 0.0f || custom_vibrance != 0.0f) {
            // Create a copy of the image data for modification
            std::vector<unsigned char> modifiedData(image->data, image->data + image->data_size);
            
            // Process each pixel
            int pixelCount = image->width * image->height;
            int bytesPerPixel = image->colors * (image->bits / 8);
            
            for (int i = 0; i < pixelCount; i++) {
                int offset = i * bytesPerPixel;
                
                // Get RGB values (assuming 8-bit per channel)
                float r = modifiedData[offset] / 255.0f;
                float g = modifiedData[offset + 1] / 255.0f;
                float b = modifiedData[offset + 2] / 255.0f;
                
                // Convert to HSL
                float h, s, l;
                rgbToHsl(r, g, b, h, s, l);
                
                // Apply saturation
                if (custom_saturation != 0.0f) {
                    s = std::max(0.0f, std::min(1.0f, s * (1.0f + custom_saturation)));
                }
                
                // Apply vibrance (less aggressive on already saturated colors)
                if (custom_vibrance != 0.0f) {
                    float vibrance_amount = custom_vibrance * (1.0f - s);
                    s = std::max(0.0f, std::min(1.0f, s * (1.0f + vibrance_amount)));
                }
                
                // Convert back to RGB
                hslToRgb(h, s, l, r, g, b);
                
                // Write back
                modifiedData[offset] = (unsigned char)(r * 255.0f);
                modifiedData[offset + 1] = (unsigned char)(g * 255.0f);
                modifiedData[offset + 2] = (unsigned char)(b * 255.0f);
            }
            
            // Copy modified data to JavaScript array
            val data = val::global("Uint8Array").new_(image->data_size);
            val dataView = val(typed_memory_view(image->data_size, modifiedData.data()));
            data.call<void>("set", dataView);
            result.set("data", data);
        } else {
            // Copy original image data to JavaScript array
            size_t dataSize = image->data_size;
            val data = val::global("Uint8Array").new_(dataSize);
            
            // Use typed memory view for safe copying
            val dataView = val(typed_memory_view(dataSize, image->data));
            data.call<void>("set", dataView);
            
            result.set("data", data);
        }
        
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
    
    // Get 4-channel RAW data (RGBG) - similar to 4channels.cpp sample
    val get4ChannelData() {
        if (!isLoaded) return val::null();
        
        // Ensure raw2image has been called
        int ret = processor.raw2image();
        if (ret != LIBRAW_SUCCESS) {
            if (debugMode) {
                printf("[DEBUG] LibRaw: raw2image failed: %s\n", libraw_strerror(ret));
            }
            return val::null();
        }
        
        if (!processor.imgdata.image) {
            if (debugMode) printf("[DEBUG] LibRaw: No 4-channel image data available\n");
            return val::null();
        }
        
        int width = processor.imgdata.sizes.iwidth;
        int height = processor.imgdata.sizes.iheight;
        int colors = processor.imgdata.idata.colors;
        
        if (debugMode) {
            printf("[DEBUG] LibRaw: 4-channel data: %dx%d, %d colors\n", width, height, colors);
        }
        
        val result = val::object();
        result.set("width", width);
        result.set("height", height);
        result.set("colors", colors);
        
        // Create separate arrays for each channel
        val channels = val::array();
        
        for (int c = 0; c < colors && c < 4; c++) {
            size_t channelSize = width * height * sizeof(unsigned short);
            val channelData = val::global("Uint16Array").new_(width * height);
            
            // Extract channel data
            for (int i = 0; i < width * height; i++) {
                channelData.call<void>("set", i, processor.imgdata.image[i][c]);
            }
            
            channels.call<void>("push", channelData);
        }
        
        result.set("channels", channels);
        return result;
    }
    
    // Get RAW Bayer data (single channel) - for advanced processing
    val getRawBayerData() {
        if (!isLoaded) return val::null();
        
        if (!processor.imgdata.rawdata.raw_image) {
            if (debugMode) printf("[DEBUG] LibRaw: No RAW Bayer data available\n");
            return val::null();
        }
        
        int width = processor.imgdata.sizes.raw_width;
        int height = processor.imgdata.sizes.raw_height;
        
        val result = val::object();
        result.set("width", width);
        result.set("height", height);
        result.set("filters", (int)processor.imgdata.idata.filters);
        
        // Copy RAW data
        size_t dataSize = width * height;
        val rawData = val::global("Uint16Array").new_(dataSize);
        
        val dataView = val(typed_memory_view(dataSize, processor.imgdata.rawdata.raw_image));
        rawData.call<void>("set", dataView);
        
        result.set("data", rawData);
        return result;
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
    
    // Extended parameters for more control
    void setHighlight(int mode) {
        // Highlight recovery: 0=clip, 1=unclip, 2=blend, 3-9=rebuild
        processor.imgdata.params.highlight = mode;
    }
    
    void setGamma(float g1, float g2) {
        // Gamma curve parameters
        processor.imgdata.params.gamm[0] = g1;
        processor.imgdata.params.gamm[1] = g2;
    }
    
    void setNoiseThreshold(float threshold) {
        // Noise reduction threshold
        processor.imgdata.params.threshold = threshold;
    }
    
    void setMedianPasses(int passes) {
        // Median filter passes for noise reduction
        processor.imgdata.params.med_passes = passes;
    }
    
    void setExposure(float shift, float preserve) {
        // Exposure correction
        processor.imgdata.params.exp_shift = shift;
        processor.imgdata.params.exp_preser = preserve;
    }
    
    void setAutoBright(bool enabled, float threshold) {
        // Auto brightness control
        processor.imgdata.params.no_auto_bright = enabled ? 0 : 1;
        processor.imgdata.params.auto_bright_thr = threshold;
    }
    
    void setCustomWB(float r, float g1, float g2, float b) {
        // Custom white balance multipliers
        processor.imgdata.params.user_mul[0] = r;
        processor.imgdata.params.user_mul[1] = g1;
        processor.imgdata.params.user_mul[2] = g2;
        processor.imgdata.params.user_mul[3] = b;
    }
    
    void setFourColorRGB(bool enabled) {
        // Use separate greens for better color
        processor.imgdata.params.four_color_rgb = enabled ? 1 : 0;
    }
    
    void setDCBIterations(int iterations) {
        // DCB demosaic quality
        processor.imgdata.params.dcb_iterations = iterations;
    }
    
    void setDCBEnhance(bool enabled) {
        // DCB false color suppression
        processor.imgdata.params.dcb_enhance_fl = enabled ? 1 : 0;
    }
    
    void setOutputBPS(int bps) {
        // Output bits per sample (8 or 16)
        processor.imgdata.params.output_bps = bps;
    }
    
    void setUserBlack(int level) {
        // Manual black level
        processor.imgdata.params.user_black = level;
    }
    
    void setAberrationCorrection(float r, float b) {
        // Chromatic aberration correction
        processor.imgdata.params.aber[0] = r;
        processor.imgdata.params.aber[2] = b;
    }
    
    // Additional processing parameters from samples
    void setShotSelect(int shot) {
        // Select specific shot from multi-shot RAW files
        processor.imgdata.rawparams.shot_select = shot;
    }
    
    void setCropArea(int x1, int y1, int x2, int y2) {
        // Set crop area (similar to dcraw -B x1 y1 x2 y2)
        processor.imgdata.params.cropbox[0] = x1;
        processor.imgdata.params.cropbox[1] = y1;
        processor.imgdata.params.cropbox[2] = x2;
        processor.imgdata.params.cropbox[3] = y2;
    }
    
    void setGreyBox(int x1, int y1, int x2, int y2) {
        // Set grey box area for white balance (similar to dcraw -A x1 y1 x2 y2)
        processor.imgdata.params.greybox[0] = x1;
        processor.imgdata.params.greybox[1] = y1;
        processor.imgdata.params.greybox[2] = x2;
        processor.imgdata.params.greybox[3] = y2;
    }
    
    void setUserFlip(int flip) {
        // Set rotation/flip: 0=none, 3=180, 5=90CCW, 6=90CW
        processor.imgdata.params.user_flip = flip;
    }
    
    void setNoAutoBright(bool disable) {
        // Disable automatic brightness adjustment
        processor.imgdata.params.no_auto_bright = disable ? 1 : 0;
    }
    
    void setOutputTiff(bool tiff) {
        // Output TIFF instead of PPM
        processor.imgdata.params.output_tiff = tiff ? 1 : 0;
    }
    
    // Color adjustment methods (applied in post-processing)
    void setSaturation(float saturation) {
        // Saturation adjustment: -100 to +100
        // Will be applied during RGB conversion
        custom_saturation = saturation / 100.0f; // Convert to -1.0 to 1.0
    }
    
    void setVibrance(float vibrance) {
        // Vibrance adjustment: -100 to +100
        // Similar to saturation but protects skin tones
        custom_vibrance = vibrance / 100.0f; // Convert to -1.0 to 1.0
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
    
    // MetaISP Integration Methods
    
    // Get Bayer channels for MetaISP (4 channels: R, G1, G2, B)
    val getBayerChannelsForMetaISP() {
        if (!isLoaded) return val::null();
        
        // Check CFA pattern
        if (processor.imgdata.idata.cdesc[processor.imgdata.idata.fc(0, 0)] != 'R') {
            if (debugMode) {
                printf("[DEBUG] LibRaw: Unsupported CFA pattern for MetaISP. Only RGGB is supported.\n");
            }
            return val::null();
        }
        
        int raw_width = processor.imgdata.sizes.raw_width;
        int raw_height = processor.imgdata.sizes.raw_height;
        int output_width = raw_width / 2;
        int output_height = raw_height / 2;
        
        if (debugMode) {
            printf("[DEBUG] LibRaw: Extracting Bayer channels for MetaISP: %dx%d -> %dx%d\n", 
                   raw_width, raw_height, output_width, output_height);
        }
        
        val result = val::object();
        result.set("width", output_width);
        result.set("height", output_height);
        
        // Create Float32Array for 4 channels
        size_t channelSize = output_width * output_height;
        val channelData = val::global("Float32Array").new_(4 * channelSize);
        
        float max_val = processor.imgdata.color.maximum ? processor.imgdata.color.maximum : 65535.0f;
        
        // Extract Bayer pattern
        for (int row = 0; row < output_height; row++) {
            for (int col = 0; col < output_width; col++) {
                int idx = row * output_width + col;
                int raw_row = row * 2;
                int raw_col = col * 2;
                
                // RGGB pattern
                // R  G1
                // G2 B
                channelData.call<void>("set", 0 * channelSize + idx, 
                    processor.imgdata.rawdata.raw_image[raw_row * raw_width + raw_col] / max_val);  // R
                channelData.call<void>("set", 1 * channelSize + idx, 
                    processor.imgdata.rawdata.raw_image[raw_row * raw_width + raw_col + 1] / max_val);  // G1
                channelData.call<void>("set", 2 * channelSize + idx, 
                    processor.imgdata.rawdata.raw_image[(raw_row + 1) * raw_width + raw_col] / max_val);  // G2
                channelData.call<void>("set", 3 * channelSize + idx, 
                    processor.imgdata.rawdata.raw_image[(raw_row + 1) * raw_width + raw_col + 1] / max_val);  // B
            }
        }
        
        result.set("data", channelData);
        return result;
    }
    
    // Get metadata for MetaISP in JSON format
    val getMetaISPMetadata() {
        if (!isLoaded) return val::null();
        
        val metadata = val::object();
        
        // Basic information
        metadata.set("iso", processor.imgdata.other.iso_speed);
        metadata.set("exposure", processor.imgdata.other.shutter);
        metadata.set("aperture", processor.imgdata.other.aperture);
        metadata.set("focal_length", processor.imgdata.other.focal_len);
        
        // White balance coefficients
        val wb_coeffs = val::array();
        for (int i = 0; i < 4; i++) {
            wb_coeffs.call<void>("push", processor.imgdata.color.cam_mul[i]);
        }
        metadata.set("wb_coeffs", wb_coeffs);
        
        // Camera information
        metadata.set("camera_make", std::string(processor.imgdata.idata.make));
        metadata.set("camera_model", std::string(processor.imgdata.idata.model));
        
        // Device mapping for MetaISP
        std::string model(processor.imgdata.idata.model);
        int device_id = -1; // Unknown by default
        
        if (model.find("iPhone") != std::string::npos) {
            device_id = 2;  // iPhone
        } else if (model.find("Samsung") != std::string::npos || 
                   model.find("Galaxy") != std::string::npos) {
            device_id = 1;  // Samsung
        } else if (model.find("Pixel") != std::string::npos) {
            device_id = 0;  // Pixel
        }
        
        metadata.set("device_id", device_id);
        
        // Image dimensions
        metadata.set("raw_width", processor.imgdata.sizes.raw_width);
        metadata.set("raw_height", processor.imgdata.sizes.raw_height);
        metadata.set("width", processor.imgdata.sizes.width);
        metadata.set("height", processor.imgdata.sizes.height);
        
        // Black level and maximum
        metadata.set("black_level", processor.imgdata.color.black);
        metadata.set("maximum", processor.imgdata.color.maximum);
        
        // CFA pattern
        std::string cfa_pattern;
        cfa_pattern += processor.imgdata.idata.cdesc[processor.imgdata.idata.fc(0, 0)];
        cfa_pattern += processor.imgdata.idata.cdesc[processor.imgdata.idata.fc(0, 1)];
        cfa_pattern += processor.imgdata.idata.cdesc[processor.imgdata.idata.fc(1, 0)];
        cfa_pattern += processor.imgdata.idata.cdesc[processor.imgdata.idata.fc(1, 1)];
        metadata.set("cfa_pattern", cfa_pattern);
        
        return metadata;
    }
    
    // Get bilinear interpolated RGB for MetaISP (raw_full input)
    val getBilinearRGB() {
        if (!isLoaded) return val::null();
        
        // Save current settings
        int saved_quality = processor.imgdata.params.user_qual;
        int saved_half_size = processor.imgdata.params.half_size;
        float saved_gamm[2] = {processor.imgdata.params.gamm[0], processor.imgdata.params.gamm[1]};
        
        // Process with simple bilinear interpolation
        processor.imgdata.params.half_size = 0;
        processor.imgdata.params.use_camera_wb = 1;
        processor.imgdata.params.use_auto_wb = 0;
        processor.imgdata.params.output_color = 1;  // sRGB
        processor.imgdata.params.output_bps = 16;
        processor.imgdata.params.gamm[0] = 1.0;  // Linear output
        processor.imgdata.params.gamm[1] = 1.0;
        processor.imgdata.params.user_qual = 0;  // Bilinear
        processor.imgdata.params.no_auto_bright = 1;
        
        int ret = processor.dcraw_process();
        if (ret != LIBRAW_SUCCESS) {
            if (debugMode) {
                printf("[DEBUG] LibRaw: Failed to process bilinear RGB: %s\n", libraw_strerror(ret));
            }
            // Restore settings
            processor.imgdata.params.user_qual = saved_quality;
            processor.imgdata.params.half_size = saved_half_size;
            processor.imgdata.params.gamm[0] = saved_gamm[0];
            processor.imgdata.params.gamm[1] = saved_gamm[1];
            return val::null();
        }
        
        libraw_processed_image_t* image = processor.dcraw_make_mem_image(&ret);
        if (!image) {
            if (debugMode) {
                printf("[DEBUG] LibRaw: Failed to create bilinear RGB image\n");
            }
            // Restore settings
            processor.imgdata.params.user_qual = saved_quality;
            processor.imgdata.params.half_size = saved_half_size;
            processor.imgdata.params.gamm[0] = saved_gamm[0];
            processor.imgdata.params.gamm[1] = saved_gamm[1];
            return val::null();
        }
        
        int width = image->width;
        int height = image->height;
        
        val result = val::object();
        result.set("width", width);
        result.set("height", height);
        
        // Create Float32Array for RGB data
        size_t pixelCount = width * height;
        val rgbData = val::global("Float32Array").new_(3 * pixelCount);
        
        // Convert to float RGB
        unsigned char* data = image->data;
        for (int i = 0; i < pixelCount; i++) {
            rgbData.call<void>("set", 0 * pixelCount + i, data[i * 3 + 0] / 255.0f);  // R
            rgbData.call<void>("set", 1 * pixelCount + i, data[i * 3 + 1] / 255.0f);  // G
            rgbData.call<void>("set", 2 * pixelCount + i, data[i * 3 + 2] / 255.0f);  // B
        }
        
        result.set("data", rgbData);
        
        LibRaw::dcraw_clear_mem(image);
        
        // Restore settings
        processor.imgdata.params.user_qual = saved_quality;
        processor.imgdata.params.half_size = saved_half_size;
        processor.imgdata.params.gamm[0] = saved_gamm[0];
        processor.imgdata.params.gamm[1] = saved_gamm[1];
        
        return result;
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
        .function("setHighlight", &LibRawWasm::setHighlight)
        .function("setGamma", &LibRawWasm::setGamma)
        .function("setNoiseThreshold", &LibRawWasm::setNoiseThreshold)
        .function("setMedianPasses", &LibRawWasm::setMedianPasses)
        .function("setExposure", &LibRawWasm::setExposure)
        .function("setAutoBright", &LibRawWasm::setAutoBright)
        .function("setCustomWB", &LibRawWasm::setCustomWB)
        .function("setFourColorRGB", &LibRawWasm::setFourColorRGB)
        .function("setDCBIterations", &LibRawWasm::setDCBIterations)
        .function("setDCBEnhance", &LibRawWasm::setDCBEnhance)
        .function("setOutputBPS", &LibRawWasm::setOutputBPS)
        .function("setUserBlack", &LibRawWasm::setUserBlack)
        .function("setAberrationCorrection", &LibRawWasm::setAberrationCorrection)
        .function("setShotSelect", &LibRawWasm::setShotSelect)
        .function("setCropArea", &LibRawWasm::setCropArea)
        .function("setGreyBox", &LibRawWasm::setGreyBox)
        .function("setUserFlip", &LibRawWasm::setUserFlip)
        .function("setNoAutoBright", &LibRawWasm::setNoAutoBright)
        .function("setOutputTiff", &LibRawWasm::setOutputTiff)
        .function("setSaturation", &LibRawWasm::setSaturation)
        .function("setVibrance", &LibRawWasm::setVibrance)
        .function("get4ChannelData", &LibRawWasm::get4ChannelData)
        .function("getRawBayerData", &LibRawWasm::getRawBayerData)
        .function("setDebugMode", &LibRawWasm::setDebugMode)
        .function("getDebugMode", &LibRawWasm::getDebugMode)
        .function("getLastError", &LibRawWasm::getLastError)
        .function("getProcessingInfo", &LibRawWasm::getProcessingInfo)
        .function("getBayerChannelsForMetaISP", &LibRawWasm::getBayerChannelsForMetaISP)
        .function("getMetaISPMetadata", &LibRawWasm::getMetaISPMetadata)
        .function("getBilinearRGB", &LibRawWasm::getBilinearRGB)
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
    
    // Highlight recovery modes
    constant("HIGHLIGHT_CLIP", 0);
    constant("HIGHLIGHT_UNCLIP", 1);
    constant("HIGHLIGHT_BLEND", 2);
    constant("HIGHLIGHT_REBUILD", 3);
    
    // Rotation/flip constants
    constant("FLIP_NONE", 0);
    constant("FLIP_HORIZONTAL", 1);
    constant("FLIP_VERTICAL", 2);
    constant("FLIP_180", 3);
    constant("FLIP_90CCW", 5);
    constant("FLIP_90CW", 6);
}