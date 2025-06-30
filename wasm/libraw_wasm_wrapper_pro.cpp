/* Additional professional features for LibRaw WebAssembly wrapper
 * To be added to the main wrapper
 */

// Add these methods to the LibRawWasm class:

    // Professional Color Grading
    void setColorMatrix(float matrix[3][3]) {
        // Apply custom color matrix transformation
        // This would need to be applied in post-processing after dcraw_process
        // Store for later use in getImageData()
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
                custom_color_matrix[i][j] = matrix[i][j];
            }
        }
        use_custom_color_matrix = true;
    }
    
    // Lens Corrections (using LibRaw's built-in support)
    void setLensCorrection(bool ca, bool vignetting, bool distortion) {
        // Chromatic aberration
        processor.imgdata.params.ca_correc = ca ? 1 : 0;
        // Vignetting
        processor.imgdata.params.cafa_green = vignetting ? 1.0 : 0.0;
        // Distortion would need external lens profile data
        lens_distortion_enabled = distortion;
    }
    
    // Bad Pixel Removal
    void setBadPixels(val badPixelList) {
        // Store bad pixel coordinates for removal during processing
        bad_pixels.clear();
        size_t count = badPixelList["length"].as<size_t>();
        for (size_t i = 0; i < count; i++) {
            val pixel = badPixelList[i];
            int x = pixel["x"].as<int>();
            int y = pixel["y"].as<int>();
            bad_pixels.push_back({x, y});
        }
    }
    
    // Dark Frame Subtraction
    void setDarkFrame(val darkFrameData) {
        // Store dark frame for noise reduction
        if (dark_frame_data) {
            delete[] dark_frame_data;
        }
        
        size_t length = darkFrameData["length"].as<size_t>();
        dark_frame_data = new unsigned short[length];
        
        val dataView = val(typed_memory_view(length, dark_frame_data));
        dataView.call<void>("set", darkFrameData);
        has_dark_frame = true;
    }
    
    // Flat Field Correction
    void setFlatField(val flatFieldData) {
        // Store flat field for vignetting/dust correction
        if (flat_field_data) {
            delete[] flat_field_data;
        }
        
        size_t length = flatFieldData["length"].as<size_t>();
        flat_field_data = new float[length];
        
        val dataView = val(typed_memory_view(length, flat_field_data));
        dataView.call<void>("set", flatFieldData);
        has_flat_field = true;
    }
    
    // Advanced Histogram Analysis
    val getHistogramData() {
        if (!isLoaded) return val::null();
        
        val result = val::object();
        
        // Calculate histogram for each channel
        int hist_r[4096] = {0};
        int hist_g[4096] = {0};
        int hist_b[4096] = {0};
        
        if (processor.imgdata.image) {
            int width = processor.imgdata.sizes.iwidth;
            int height = processor.imgdata.sizes.iheight;
            
            for (int i = 0; i < width * height; i++) {
                hist_r[processor.imgdata.image[i][0] >> 4]++;
                hist_g[processor.imgdata.image[i][1] >> 4]++;
                hist_b[processor.imgdata.image[i][2] >> 4]++;
            }
        }
        
        // Convert to JavaScript arrays
        val r_hist = val::array();
        val g_hist = val::array();
        val b_hist = val::array();
        
        for (int i = 0; i < 256; i++) {
            r_hist.call<void>("push", hist_r[i]);
            g_hist.call<void>("push", hist_g[i]);
            b_hist.call<void>("push", hist_b[i]);
        }
        
        result.set("red", r_hist);
        result.set("green", g_hist);
        result.set("blue", b_hist);
        
        // Calculate statistics
        val stats = val::object();
        stats.set("black_level", processor.imgdata.color.black);
        stats.set("white_level", processor.imgdata.color.maximum);
        result.set("stats", stats);
        
        return result;
    }
    
    // Get EXIF Data
    val getExifData() {
        if (!isLoaded) return val::null();
        
        val exif = val::object();
        
        // Basic EXIF
        exif.set("make", std::string(processor.imgdata.idata.make));
        exif.set("model", std::string(processor.imgdata.idata.model));
        exif.set("software", std::string(processor.imgdata.idata.software));
        
        // Shooting conditions
        exif.set("iso", processor.imgdata.other.iso_speed);
        exif.set("shutter", processor.imgdata.other.shutter);
        exif.set("aperture", processor.imgdata.other.aperture);
        exif.set("focal_length", processor.imgdata.other.focal_len);
        exif.set("timestamp", processor.imgdata.other.timestamp);
        
        // GPS data if available
        if (processor.imgdata.other.gpsdata[0] != 0) {
            val gps = val::object();
            gps.set("latitude", processor.imgdata.other.gpsdata[0]);
            gps.set("longitude", processor.imgdata.other.gpsdata[1]);
            gps.set("altitude", processor.imgdata.other.gpsdata[2]);
            exif.set("gps", gps);
        }
        
        // Lens info
        val lens = val::object();
        lens.set("name", std::string(processor.imgdata.lens.Lens));
        lens.set("focal_min", processor.imgdata.lens.MinFocal);
        lens.set("focal_max", processor.imgdata.lens.MaxFocal);
        lens.set("aperture_min", processor.imgdata.lens.MinAp);
        lens.set("aperture_max", processor.imgdata.lens.MaxAp);
        exif.set("lens", lens);
        
        // Color profile
        exif.set("color_profile", std::string(processor.imgdata.color.model2));
        
        return exif;
    }
    
    // Focus Peaking Helper (returns edge detection map)
    val getFocusPeakingMap() {
        if (!isLoaded || !processor.imgdata.image) return val::null();
        
        int width = processor.imgdata.sizes.iwidth;
        int height = processor.imgdata.sizes.iheight;
        
        val result = val::object();
        result.set("width", width);
        result.set("height", height);
        
        // Create edge detection map using Sobel operator
        val edgeMap = val::global("Uint8Array").new_(width * height);
        
        // Simplified edge detection for focus areas
        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                int idx = y * width + x;
                
                // Get luminance values around pixel
                int center = processor.imgdata.image[idx][1]; // Green channel
                int left = processor.imgdata.image[idx - 1][1];
                int right = processor.imgdata.image[idx + 1][1];
                int top = processor.imgdata.image[idx - width][1];
                int bottom = processor.imgdata.image[idx + width][1];
                
                // Simple edge detection
                int dx = abs(right - left);
                int dy = abs(bottom - top);
                int edge = sqrt(dx * dx + dy * dy) >> 5; // Scale to 0-255
                
                edgeMap.call<void>("set", idx, std::min(255, edge));
            }
        }
        
        result.set("data", edgeMap);
        return result;
    }
    
    // Clipping Warning (highlight/shadow clipping detection)
    val getClippingWarnings() {
        if (!isLoaded || !processor.imgdata.image) return val::null();
        
        int width = processor.imgdata.sizes.iwidth;
        int height = processor.imgdata.sizes.iheight;
        
        val result = val::object();
        
        int highlight_pixels = 0;
        int shadow_pixels = 0;
        int total_pixels = width * height;
        
        // Thresholds
        int highlight_threshold = processor.imgdata.color.maximum * 0.99;
        int shadow_threshold = processor.imgdata.color.black + 10;
        
        // Create warning maps
        val highlightMap = val::global("Uint8Array").new_(total_pixels);
        val shadowMap = val::global("Uint8Array").new_(total_pixels);
        
        for (int i = 0; i < total_pixels; i++) {
            bool is_highlight = false;
            bool is_shadow = false;
            
            // Check all channels
            for (int c = 0; c < 3; c++) {
                if (processor.imgdata.image[i][c] >= highlight_threshold) {
                    is_highlight = true;
                }
                if (processor.imgdata.image[i][c] <= shadow_threshold) {
                    is_shadow = true;
                }
            }
            
            highlightMap.call<void>("set", i, is_highlight ? 255 : 0);
            shadowMap.call<void>("set", i, is_shadow ? 255 : 0);
            
            if (is_highlight) highlight_pixels++;
            if (is_shadow) shadow_pixels++;
        }
        
        result.set("highlight_map", highlightMap);
        result.set("shadow_map", shadowMap);
        result.set("highlight_percentage", (float)highlight_pixels / total_pixels * 100);
        result.set("shadow_percentage", (float)shadow_pixels / total_pixels * 100);
        result.set("width", width);
        result.set("height", height);
        
        return result;
    }
    
    // White Balance Picker (get WB from specific area)
    val getWhiteBalanceFromArea(int x, int y, int radius) {
        if (!isLoaded || !processor.imgdata.image) return val::null();
        
        int width = processor.imgdata.sizes.iwidth;
        int height = processor.imgdata.sizes.iheight;
        
        // Bounds checking
        int x1 = std::max(0, x - radius);
        int y1 = std::max(0, y - radius);
        int x2 = std::min(width - 1, x + radius);
        int y2 = std::min(height - 1, y + radius);
        
        // Calculate average RGB values in the area
        long long r_sum = 0, g_sum = 0, b_sum = 0;
        int pixel_count = 0;
        
        for (int py = y1; py <= y2; py++) {
            for (int px = x1; px <= x2; px++) {
                int idx = py * width + px;
                r_sum += processor.imgdata.image[idx][0];
                g_sum += processor.imgdata.image[idx][1];
                b_sum += processor.imgdata.image[idx][2];
                pixel_count++;
            }
        }
        
        if (pixel_count == 0) return val::null();
        
        // Calculate WB multipliers
        float r_avg = (float)r_sum / pixel_count;
        float g_avg = (float)g_sum / pixel_count;
        float b_avg = (float)b_sum / pixel_count;
        
        val result = val::object();
        result.set("r", g_avg / r_avg);
        result.set("g1", 1.0);
        result.set("g2", 1.0);
        result.set("b", g_avg / b_avg);
        
        return result;
    }

// Add these private members to the class:
private:
    float custom_color_matrix[3][3];
    bool use_custom_color_matrix = false;
    bool lens_distortion_enabled = false;
    std::vector<std::pair<int, int>> bad_pixels;
    unsigned short* dark_frame_data = nullptr;
    float* flat_field_data = nullptr;
    bool has_dark_frame = false;
    bool has_flat_field = false;

// Add these bindings to EMSCRIPTEN_BINDINGS:
    .function("setColorMatrix", &LibRawWasm::setColorMatrix)
    .function("setLensCorrection", &LibRawWasm::setLensCorrection)
    .function("setBadPixels", &LibRawWasm::setBadPixels)
    .function("setDarkFrame", &LibRawWasm::setDarkFrame)
    .function("setFlatField", &LibRawWasm::setFlatField)
    .function("getHistogramData", &LibRawWasm::getHistogramData)
    .function("getExifData", &LibRawWasm::getExifData)
    .function("getFocusPeakingMap", &LibRawWasm::getFocusPeakingMap)
    .function("getClippingWarnings", &LibRawWasm::getClippingWarnings)
    .function("getWhiteBalanceFromArea", &LibRawWasm::getWhiteBalanceFromArea);