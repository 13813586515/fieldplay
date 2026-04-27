<template>
  <div class="export-share-container">
    <div class="export-share-btn">
      <button @click="openDialog" class="open-export-dialog">
        <span class="icon">⬇</span> Export & Share
      </button>
    </div>

    <div v-if="isOpened" class="export-overlay" @click.self="closeDialog">
      <div class="export-dialog" ref="dialogRef">
        <div class="dialog-header">
          <h2>Export & Share</h2>
          <button @click="closeDialog" class="close-btn" title="close">×</button>
        </div>

        <div class="tabs-container">
          <button 
            v-for="tab in tabs" 
            :key="tab.id"
            :class="['tab-button', { active: activeTab === tab.id }]"
            @click="switchTab(tab.id)"
          >
            {{ tab.name }}
          </button>
        </div>

        <div class="tab-panels">
          <div v-show="activeTab === 'video'" class="tab-panel video-panel">
            <div class="form-row">
              <label class="form-label">Output Format</label>
              <select v-model="videoFormat" class="form-control">
                <option value="webm">WebM Video (Recommended)</option>
                <option value="gif">GIF Animation</option>
              </select>
            </div>

            <div class="form-row">
              <label class="form-label">Resolution</label>
              <select v-model="resolutionPreset" class="form-control" @change="onResolutionChange">
                <option value="720p">720p (1280 × 720)</option>
                <option value="1080p">1080p (1920 × 1080)</option>
                <option value="4k">4K (3840 × 2160)</option>
                <option value="square">Square (1080 × 1080)</option>
                <option value="custom">Custom...</option>
              </select>
              <div v-if="resolutionPreset === 'custom'" class="custom-resolution">
                <input type="number" v-model.number="exportWidth" min="320" max="4096" class="res-input">
                <span class="sep">×</span>
                <input type="number" v-model.number="exportHeight" min="240" max="4096" class="res-input">
              </div>
            </div>

            <div class="form-row">
              <label class="form-label">
                Duration: <span class="duration-display">{{ duration }} seconds</span>
              </label>
              <div class="slider-container">
                <input 
                  type="range" 
                  v-model.number="duration" 
                  min="1" 
                  max="60" 
                  step="1"
                  class="slider"
                >
                <div class="slider-ticks">
                  <span v-for="tick in sliderTicks" :key="tick.value" class="tick" :style="{ left: tick.percent + '%' }">
                    {{ tick.label }}
                  </span>
                </div>
              </div>
            </div>

            <div class="form-row">
              <label class="form-label">Frame Rate</label>
              <select v-model.number="fps" class="form-control">
                <option :value="30">30 FPS</option>
                <option :value="60">60 FPS</option>
              </select>
            </div>

            <div v-if="isRecording" class="progress-container">
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" :style="{ width: recordingProgress + '%' }"></div>
              </div>
              <p class="progress-text">
                Recording: {{ Math.round(recordingProgress) }}% 
                ({{ currentFrame }} / {{ totalFrames }} frames)
              </p>
            </div>

            <div v-if="errorMessage" class="error-message">
              {{ errorMessage }}
            </div>

            <div v-if="successMessage" class="success-message">
              {{ successMessage }}
            </div>

            <div class="button-row">
              <button 
                v-if="!isRecording && !isProcessing" 
                class="btn btn-primary" 
                @click="startRecording"
              >
                🎥 Start Recording
              </button>
              <button 
                v-else-if="isRecording"
                class="btn btn-danger" 
                @click="stopRecording"
              >
                ⏹ Stop Recording
              </button>
              <button 
                v-else
                class="btn btn-primary" 
                disabled
              >
                ⏳ Processing...
              </button>
            </div>

            <div v-if="videoFormat === 'gif'" class="notice-box">
              <strong>Note:</strong> GIF export may take longer to process and produce larger files. 
              WebM is recommended for better quality and smaller file sizes.
            </div>
          </div>

          <div v-show="activeTab === 'shader'" class="tab-panel shader-panel">
            <div class="form-row">
              <label class="form-label">Target Platform</label>
              <select v-model="shaderPlatform" class="form-control" @change="onShaderPlatformChange">
                <option value="shadertoy">Shadertoy</option>
                <option value="glslsandbox">GLSL Sandbox</option>
              </select>
            </div>

            <div class="code-container">
              <div class="code-header">
                <span class="code-title">Generated {{ shaderPlatform === 'shadertoy' ? 'Shadertoy' : 'GLSL Sandbox' }} Code</span>
                <button class="btn btn-small" @click="copyShaderCode">
                  {{ copied ? '✓ Copied!' : '📋 Copy' }}
                </button>
              </div>
              <textarea 
                ref="shaderTextarea"
                :value="generatedShaderCode" 
                class="code-editor"
                readonly
                spellcheck="false"
              ></textarea>
            </div>

            <div class="info-box">
              <h4>How to use:</h4>
              <template v-if="shaderPlatform === 'shadertoy'">
                <p>1. Go to <a href="https://www.shadertoy.com/new" target="_blank">shadertoy.com/new</a></p>
                <p>2. Create a new shader</p>
                <p>3. Paste the code above into the "Image" tab</p>
                <p>4. Click the play button to see your vector field</p>
              </template>
              <template v-else>
                <p>1. Go to <a href="http://glslsandbox.com/" target="_blank">glslsandbox.com</a></p>
                <p>2. Click "New shader"</p>
                <p>3. Replace the default code with the code above</p>
                <p>4. The shader should run automatically</p>
              </template>
            </div>
          </div>

          <div v-show="activeTab === 'poster'" class="tab-panel poster-panel">
            <div class="form-row">
              <label class="form-label">Poster Title</label>
              <input 
                type="text" 
                v-model="posterTitle" 
                class="form-control"
                placeholder="Enter a title for your poster..."
                @input="updatePosterPreview"
              >
            </div>

            <div class="form-row">
              <label class="form-label">Subtitle</label>
              <input 
                type="text" 
                v-model="posterSubtitle" 
                class="form-control"
                placeholder="Enter a subtitle..."
                @input="updatePosterPreview"
              >
            </div>

            <div class="form-row">
              <label class="form-label">Poster Size</label>
              <select v-model="posterSize" class="form-control" @change="updatePosterPreview">
                <option value="instagram">Instagram (1080 × 1080)</option>
                <option value="a4">A4 Portrait (794 × 1123)</option>
                <option value="wide">Wide (1920 × 1080)</option>
              </select>
            </div>

            <div class="form-row">
              <label class="form-label">QR Code Content (for display only)</label>
              <input 
                type="text" 
                v-model="qrContent" 
                class="form-control"
                placeholder="URL or text for the QR code..."
                @input="updatePosterPreview"
              >
              <p class="field-hint">This is for visual purposes only - the QR code is a visual placeholder.</p>
            </div>

            <div class="poster-preview-container">
              <div class="preview-header">
                <span class="preview-label">Live Preview</span>
                <button class="btn btn-small" @click="updatePosterPreview">🔄 Refresh</button>
              </div>
              <div class="preview-wrapper">
                <canvas ref="posterPreviewCanvas" class="preview-canvas"></canvas>
              </div>
            </div>

            <div class="button-row">
              <button class="btn btn-primary" @click="downloadPoster">
                💾 Download Poster (PNG)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
const tabs = [
  { id: 'video', name: '📹 Video' },
  { id: 'shader', name: '💻 Shader Code' },
  { id: 'poster', name: '🎨 Poster' }
];

const sliderTicks = [
  { value: 1, label: '1s', percent: 0 },
  { value: 10, label: '10s', percent: (10 - 1) / (60 - 1) * 100 },
  { value: 30, label: '30s', percent: (30 - 1) / (60 - 1) * 100 },
  { value: 60, label: '60s', percent: 100 }
];

let CCapture = null;

function loadCCapture() {
  return import('ccapture.js').then(module => {
    CCapture = module.default || module;
    return CCapture;
  });
}

export default {
  name: 'ExportShare',
  data() {
    return {
      tabs,
      sliderTicks,
      isOpened: false,
      activeTab: 'video',

      videoFormat: 'webm',
      resolutionPreset: '720p',
      exportWidth: 1280,
      exportHeight: 720,
      duration: 5,
      fps: 30,
      
      isRecording: false,
      isProcessing: false,
      recordingProgress: 0,
      currentFrame: 0,
      totalFrames: 0,
      errorMessage: '',
      successMessage: '',
      
      mediaRecorder: null,
      recordedChunks: [],
      recordingTimer: null,
      capturer: null,

      shaderPlatform: 'shadertoy',
      generatedShaderCode: '',
      copied: false,

      posterTitle: 'Vector Field Art',
      posterSubtitle: 'Generated with FieldPlay',
      posterSize: 'instagram',
      qrContent: 'https://github.com/anvaka/fieldplay',
    };
  },
  mounted() {
    document.addEventListener('keydown', this.handleKeyDown);
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.cleanupRecording();
  },
  methods: {
    handleKeyDown(e) {
      if (e.key === 'Escape' && this.isOpened) {
        this.closeDialog();
      }
    },
    openDialog() {
      this.isOpened = true;
      this.errorMessage = '';
      this.successMessage = '';
      this.$nextTick(() => {
        if (this.activeTab === 'shader') {
          this.generateShaderCode();
        } else if (this.activeTab === 'poster') {
          this.updatePosterPreview();
        }
      });
    },
    closeDialog() {
      this.isOpened = false;
      this.cleanupRecording();
    },
    switchTab(tabId) {
      this.activeTab = tabId;
      this.errorMessage = '';
      this.successMessage = '';
      this.$nextTick(() => {
        if (tabId === 'shader') {
          this.generateShaderCode();
        } else if (tabId === 'poster') {
          this.updatePosterPreview();
        }
      });
    },
    onResolutionChange() {
      const presets = {
        '720p': { width: 1280, height: 720 },
        '1080p': { width: 1920, height: 1080 },
        '4k': { width: 3840, height: 2160 },
        'square': { width: 1080, height: 1080 }
      };
      if (presets[this.resolutionPreset]) {
        this.exportWidth = presets[this.resolutionPreset].width;
        this.exportHeight = presets[this.resolutionPreset].height;
      }
    },
    onShaderPlatformChange() {
      this.generateShaderCode();
    },
    cleanupRecording() {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try {
          this.mediaRecorder.stop();
        } catch (e) {}
      }
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
      }
      if (this.capturer) {
        try {
          this.capturer.stop();
        } catch (e) {}
        this.capturer = null;
      }
      this.isRecording = false;
      this.isProcessing = false;
      this.mediaRecorder = null;
      this.recordedChunks = [];
    },
    async startRecording() {
      const canvas = document.getElementById('scene');
      if (!canvas) {
        this.errorMessage = 'Cannot find the canvas element';
        return;
      }

      this.isRecording = true;
      this.errorMessage = '';
      this.successMessage = '';
      this.totalFrames = this.duration * this.fps;
      this.currentFrame = 0;
      this.recordingProgress = 0;

      try {
        if (this.videoFormat === 'webm') {
          await this.startWebMRecording(canvas);
        } else {
          await this.startGIFRecording(canvas);
        }
      } catch (e) {
        this.errorMessage = 'Recording failed: ' + e.message;
        this.isRecording = false;
      }
    },
    async startWebMRecording(canvas) {
      const stream = canvas.captureStream(this.fps);
      
      let options = { mimeType: 'video/webm' };
      
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        options = { mimeType: 'video/webm;codecs=vp8' };
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options = { mimeType: 'video/webm;codecs=vp9' };
      }

      this.mediaRecorder = new MediaRecorder(stream, options);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.downloadWebM();
      };

      this.mediaRecorder.onerror = (event) => {
        this.errorMessage = 'MediaRecorder error occurred';
        this.isRecording = false;
      };

      this.mediaRecorder.start(100);

      this.startProgressTimer();

      setTimeout(() => {
        if (this.isRecording) {
          this.stopRecording();
        }
      }, (this.duration + 0.5) * 1000);
    },
    async startGIFRecording(canvas) {
      if (!CCapture) {
        try {
          await loadCCapture();
        } catch (e) {
          this.errorMessage = 'Cannot load GIF encoder. Please use WebM format instead.';
          this.isRecording = false;
          return;
        }
      }

      this.capturer = new CCapture({
        format: 'gif',
        framerate: this.fps,
        verbose: false,
        quality: 80,
        workersPath: '',
      });

      this.capturer.start();

      this.recordingTimer = setInterval(() => {
        if (!this.isRecording) {
          clearInterval(this.recordingTimer);
          return;
        }

        try {
          this.capturer.capture(canvas);
        } catch (e) {
          console.error('Capture error:', e);
        }

        this.currentFrame++;
        this.recordingProgress = Math.min(100, (this.currentFrame / this.totalFrames) * 100);
        
        if (this.currentFrame >= this.totalFrames) {
          clearInterval(this.recordingTimer);
          this.finishGIFRecording();
        }
      }, 1000 / this.fps);

      setTimeout(() => {
        if (this.isRecording) {
          this.stopRecording();
        }
      }, (this.duration + 5) * 1000);
    },
    finishGIFRecording() {
      this.isRecording = false;
      this.isProcessing = true;
      this.successMessage = 'Processing GIF... This may take a moment.';
      this.errorMessage = '';

      try {
        this.capturer.stop();
        
        this.capturer.save((blob) => {
          if (blob && blob.size > 0) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            document.body.appendChild(a);
            a.style.display = 'none';
            a.href = url;
            a.download = `vector-field-${Date.now()}.gif`;
            a.click();
            
            setTimeout(() => {
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
            }, 100);

            this.successMessage = 'GIF downloaded successfully!';
          } else {
            this.errorMessage = 'GIF generation failed - no data produced. Try using WebM format instead.';
          }
          this.isProcessing = false;
          this.capturer = null;
        });
      } catch (e) {
        this.errorMessage = 'GIF processing error: ' + e.message + '. Try using WebM format instead.';
        this.isProcessing = false;
        this.capturer = null;
      }
    },
    startProgressTimer() {
      this.recordingTimer = setInterval(() => {
        if (!this.isRecording) {
          clearInterval(this.recordingTimer);
          return;
        }
        this.currentFrame++;
        this.recordingProgress = Math.min(100, (this.currentFrame / this.totalFrames) * 100);
        
        if (this.currentFrame >= this.totalFrames) {
          clearInterval(this.recordingTimer);
        }
      }, 1000 / this.fps);
    },
    stopRecording() {
      if (this.videoFormat === 'gif' && this.capturer) {
        if (this.recordingTimer) {
          clearInterval(this.recordingTimer);
          this.recordingTimer = null;
        }
        this.finishGIFRecording();
        return;
      }

      this.isRecording = false;
      
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
      }

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try {
          this.mediaRecorder.stop();
        } catch (e) {
          this.downloadWebM();
        }
      }
    },
    downloadWebM() {
      if (this.recordedChunks.length === 0) {
        this.errorMessage = 'No video data was recorded. Try using a different browser.';
        this.isRecording = false;
        return;
      }

      try {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        
        if (blob.size === 0) {
          this.errorMessage = 'Recorded video is empty. Please try again.';
          this.isRecording = false;
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = `vector-field-${Date.now()}.webm`;
        a.click();
        
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 100);

        this.isRecording = false;
        this.recordingProgress = 0;
        this.errorMessage = '';
        this.successMessage = 'Video downloaded successfully!';
      } catch (e) {
        this.errorMessage = 'Download failed: ' + e.message;
        this.isRecording = false;
      }
    },
    getVectorFieldCode() {
      if (window.scene && window.scene.vectorFieldEditorState) {
        return window.scene.vectorFieldEditorState.getCode() || '';
      }
      return 'vec2 get_velocity(vec2 p) {\n  return vec2(p.y, -p.x);\n}';
    },
    generateShaderCode() {
      const userCode = this.getVectorFieldCode();
      
      if (this.shaderPlatform === 'shadertoy') {
        this.generatedShaderCode = this.buildShadertoyCode(userCode);
      } else {
        this.generatedShaderCode = this.buildGLSLSandboxCode(userCode);
      }
    },
    buildShadertoyCode(userCode) {
      return `// Vector Field Visualization - Shadertoy Export
// Generated with FieldPlay (https://github.com/anvaka/fieldplay)

const float PI = 3.1415926535897932384626433832795;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                            + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                              dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
float rand(vec2 co) {
    float t = dot(rand_constants.xy, co);
    return fract(sin(t) * (rand_constants.z + t));
}

vec2 rotate(vec2 p, float a) {
    return cos(a)*p + sin(a)*vec2(p.y, -p.x);
}

${userCode}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 p = (uv - 0.5) * 2.0;
    p.x *= iResolution.x / iResolution.y;
    
    vec2 vel = get_velocity(p);
    float speed = length(vel);
    
    vec3 color = vec3(0.02, 0.04, 0.08);
    
    if (speed > 0.001) {
        float angle = atan(vel.y, vel.x);
        float hue = angle / 6.28318 + 0.5;
        
        float t = iTime * 0.5;
        vec3 c1 = vec3(
            0.6 + 0.4 * sin(hue * 6.28318 + t),
            0.6 + 0.4 * sin(hue * 6.28318 + 2.094 + t * 0.7),
            0.8 + 0.2 * sin(hue * 6.28318 + 4.188 + t * 0.3)
        );
        
        float intensity = smoothstep(0.0, 2.0, speed);
        color = mix(color, c1, intensity * 0.8);
    }
    
    float grid = 0.0;
    vec2 gridPos = p * 5.0;
    vec2 gridDist = abs(fract(gridPos) - 0.5);
    float gridLine = min(gridDist.x, gridDist.y);
    grid = smoothstep(0.03, 0.0, gridLine) * 0.15;
    color += vec3(grid);
    
    vec2 centerDist = abs(p);
    float vignette = 1.0 - 0.3 * smoothstep(0.8, 1.5, max(centerDist.x, centerDist.y));
    color *= vignette;
    
    fragColor = vec4(color, 1.0);
}`;
    },
    buildGLSLSandboxCode(userCode) {
      return `// Vector Field Visualization - GLSL Sandbox Export
// Generated with FieldPlay (https://github.com/anvaka/fieldplay)

#ifdef GL_ES
precision mediump float;
#endif

uniform float time;
uniform vec2 mouse;
uniform vec2 resolution;

const float PI = 3.1415926535897932384626433832795;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                            + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                              dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
float rand(vec2 co) {
    float t = dot(rand_constants.xy, co);
    return fract(sin(t) * (rand_constants.z + t));
}

vec2 rotate(vec2 p, float a) {
    return cos(a)*p + sin(a)*vec2(p.y, -p.x);
}

${userCode}

void main(void) {
    vec2 position = (gl_FragCoord.xy / resolution.xy) - vec2(0.5);
    position.x *= resolution.x / resolution.y;
    
    vec2 vel = get_velocity(position);
    float speed = length(vel);
    
    vec3 color = vec3(0.02, 0.04, 0.08);
    
    if (speed > 0.001) {
        float angle = atan(vel.y, vel.x);
        float hue = angle / 6.28318 + 0.5;
        
        float t = time * 0.5;
        vec3 c1 = vec3(
            0.6 + 0.4 * sin(hue * 6.28318 + t),
            0.6 + 0.4 * sin(hue * 6.28318 + 2.094 + t * 0.7),
            0.8 + 0.2 * sin(hue * 6.28318 + 4.188 + t * 0.3)
        );
        
        float intensity = smoothstep(0.0, 2.0, speed);
        color = mix(color, c1, intensity * 0.8);
    }
    
    float grid = 0.0;
    vec2 gridPos = position * 5.0;
    vec2 gridDist = abs(fract(gridPos) - 0.5);
    float gridLine = min(gridDist.x, gridDist.y);
    grid = smoothstep(0.03, 0.0, gridLine) * 0.15;
    color += vec3(grid);
    
    vec2 centerDist = abs(position);
    float vignette = 1.0 - 0.3 * smoothstep(0.8, 1.5, max(centerDist.x, centerDist.y));
    color *= vignette;
    
    gl_FragColor = vec4(color, 1.0);
}`;
    },
    async copyShaderCode() {
      const textarea = this.$refs.shaderTextarea;
      if (!textarea) return;
      
      try {
        await navigator.clipboard.writeText(this.generatedShaderCode);
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 2000);
      } catch (e) {
        textarea.select();
        try {
          document.execCommand('copy');
          this.copied = true;
          setTimeout(() => { this.copied = false; }, 2000);
        } catch (e2) {
          this.errorMessage = 'Could not copy to clipboard. Please select and copy manually.';
        }
      }
    },
    getPosterDimensions() {
      const sizes = {
        'instagram': { width: 1080, height: 1080 },
        'a4': { width: 794, height: 1123 },
        'wide': { width: 1920, height: 1080 }
      };
      return sizes[this.posterSize] || sizes.instagram;
    },
    updatePosterPreview() {
      const canvas = this.$refs.posterPreviewCanvas;
      if (!canvas) return;

      const dims = this.getPosterDimensions();
      const previewScale = 0.35;
      
      canvas.width = dims.width * previewScale;
      canvas.height = dims.height * previewScale;

      const ctx = canvas.getContext('2d');
      this.renderPoster(ctx, canvas.width, canvas.height, previewScale);
    },
    renderPoster(ctx, width, height, scale) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#0a1628');
      gradient.addColorStop(0.5, '#0d1f3c');
      gradient.addColorStop(1, '#061838');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const sourceCanvas = document.getElementById('scene');
      
      const previewWidth = Math.floor(width * 0.92);
      const aspectRatio = this.posterSize === 'wide' ? 16/9 : (this.posterSize === 'a4' ? 4/3 : 1);
      const previewHeight = Math.floor(previewWidth / aspectRatio);
      const previewX = Math.floor((width - previewWidth) / 2);
      const previewY = Math.floor(height * 0.05);

      if (sourceCanvas) {
        try {
          ctx.drawImage(sourceCanvas, previewX, previewY, previewWidth, previewHeight);
        } catch (e) {
          this.drawPlaceholderField(ctx, previewX, previewY, previewWidth, previewHeight);
        }
      } else {
        this.drawPlaceholderField(ctx, previewX, previewY, previewWidth, previewHeight);
      }

      ctx.strokeStyle = 'rgba(153, 197, 241, 0.4)';
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(previewX, previewY, previewWidth, previewHeight);

      const contentY = previewY + previewHeight + 20 * scale;

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.floor(24 * scale)}px Arial, Helvetica, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(this.posterTitle, width / 2, contentY);

      ctx.fillStyle = '#99c5f1';
      ctx.font = `${Math.floor(14 * scale)}px Arial, Helvetica, sans-serif`;
      ctx.fillText(this.posterSubtitle, width / 2, contentY + 24 * scale);

      const qrSize = Math.floor(80 * scale);
      const qrX = Math.floor(width / 2 - qrSize / 2);
      const qrY = Math.floor(contentY + 35 * scale);

      this.drawQRPlaceholder(ctx, qrX, qrY, qrSize);

      ctx.fillStyle = '#435970';
      ctx.font = `${Math.floor(10 * scale)}px Arial, Helvetica, sans-serif`;
      ctx.fillText('Scan to experience (Visual Demo)', width / 2, qrY + qrSize + 16 * scale);

      ctx.fillStyle = '#455B7D';
      ctx.font = `${Math.floor(8 * scale)}px Arial, Helvetica, sans-serif`;
      const footerY = height - 12 * scale;
      ctx.fillText('Generated with FieldPlay • Vector Field Art', width / 2, footerY);
    },
    drawPlaceholderField(ctx, x, y, w, h) {
      const time = Date.now() * 0.001;
      
      for (let i = 0; i < 3000; i++) {
        const px = x + Math.random() * w;
        const py = y + Math.random() * h;
        const nx = (px - x) / w - 0.5;
        const ny = (py - y) / h - 0.5;
        
        const vx = Math.sin(nx * 6 + time) * 0.4 - ny * 0.8;
        const vy = Math.cos(ny * 6 + time) * 0.4 + nx * 0.8;
        
        const hue = Math.atan2(vy, vx) / 6.28 + 0.5;
        const r = Math.floor(140 + 115 * Math.sin(hue * 6.28));
        const g = Math.floor(140 + 115 * Math.sin(hue * 6.28 + 2.09));
        const b = Math.floor(180 + 75 * Math.sin(hue * 6.28 + 4.18));
        
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
        ctx.fillRect(px, py, 1.5, 1.5);
      }
    },
    drawQRPlaceholder(ctx, x, y, size) {
      const gridSize = 21;
      const cellSize = size / gridSize;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, size, size);
      
      ctx.fillStyle = '#0a1628';
      
      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          let fill = false;
          
          if (row < 7 && col < 7) {
            fill = this.isQRFinderPattern(row, col);
          } else if (row < 7 && col >= 14) {
            fill = this.isQRFinderPattern(row, col - 14);
          } else if (row >= 14 && col < 7) {
            fill = this.isQRFinderPattern(row - 14, col);
          } else if (row === 6 || col === 6 || row === gridSize - 7 || col === gridSize - 7) {
            fill = (row + col) % 2 === 0;
          } else if (row >= 8 && row <= 12 && col >= 8 && col <= 12) {
            fill = this.isQRFinderPattern(row - 8, col - 8);
          } else {
            fill = (Math.sin(row * 1.7) * Math.cos(col * 1.3) > 0.2) || 
                   (Math.cos(row * 2.1 + col * 0.8) > 0.4);
          }
          
          if (fill) {
            const px = Math.floor(x + col * cellSize);
            const py = Math.floor(y + row * cellSize);
            const s = Math.ceil(cellSize);
            ctx.fillRect(px, py, s, s);
          }
        }
      }
      
      ctx.strokeStyle = '#455B7D';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, size, size);
    },
    isQRFinderPattern(row, col) {
      if (row === 0 || row === 6 || col === 0 || col === 6) return true;
      if (row >= 2 && row <= 4 && col >= 2 && col <= 4) return true;
      return false;
    },
    downloadPoster() {
      const dims = this.getPosterDimensions();
      
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      
      const ctx = canvas.getContext('2d');
      this.renderPoster(ctx, dims.width, dims.height, 1.0);
      
      try {
        const dataUrl = canvas.toDataURL('image/png', 0.95);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = dataUrl;
        a.download = `fieldplay-poster-${Date.now()}.png`;
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
        }, 100);
      } catch (e) {
        this.errorMessage = 'Failed to generate poster: ' + e.message;
      }
    }
  }
}
</script>

<style lang="stylus" scoped>
@import "./shared.styl";

.export-share-container {
  position: fixed;
  right: 90px;
  top: 8px;
  z-index: 100;
}

.open-export-dialog {
  padding: 8px 16px;
  color: white;
  background: rgba(153, 197, 241, 0.1);
  border: 1px solid rgba(153, 197, 241, 0.3);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(153, 197, 241, 0.2);
    border-color: primary-border;
  }

  .icon {
    margin-right: 6px;
  }
}

.export-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.export-dialog {
  background: window-background;
  border: 1px solid primary-border;
  border-radius: 8px;
  width: 580px;
  max-width: 95vw;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid secondary-border;
  flex-shrink: 0;

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: normal;
    color: primary-text;
  }

  .close-btn {
    background: none;
    border: none;
    color: secondary-text;
    font-size: 26px;
    line-height: 1;
    cursor: pointer;
    padding: 0 6px;
    transition: color 0.2s;

    &:hover {
      color: #ff6b6b;
    }
  }
}

.tabs-container {
  display: flex;
  gap: 3px;
  padding: 10px 14px 0;
  background: rgba(0, 0, 0, 0.15);
  border-bottom: 1px solid secondary-border;
  flex-shrink: 0;
}

.tab-button {
  flex: 1;
  padding: 9px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 5px 5px 0 0;
  color: secondary-text;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  top: 1px;

  &:hover:not(.active) {
    color: primary-text;
    background: rgba(153, 197, 241, 0.08);
  }

  &.active {
    background: window-background;
    border-color: secondary-border;
    border-bottom-color: window-background;
    color: primary-text;
  }
}

.tab-panels {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
}

.tab-panel {
  display: block;
}

.form-row {
  margin-bottom: 14px;

  .form-label {
    display: block;
    color: secondary-text;
    font-size: 12px;
    margin-bottom: 6px;

    .duration-display {
      color: primary-text;
      font-weight: 500;
    }
  }

  .form-control {
    width: 100%;
    padding: 9px 11px;
    background: rgba(6, 24, 56, 0.9);
    color: primary-text;
    border: 1px solid secondary-border;
    border-radius: 4px;
    font-size: 13px;
    box-sizing: border-box;

    &:focus {
      outline: none;
      border-color: primary-border;
    }
  }

  .custom-resolution {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;

    .res-input {
      flex: 1;
      min-width: 80px;
      padding: 7px 9px;
      background: rgba(6, 24, 56, 0.9);
      color: primary-text;
      border: 1px solid secondary-border;
      border-radius: 4px;
      font-size: 13px;

      &:focus {
        outline: none;
        border-color: primary-border;
      }
    }

    .sep {
      color: secondary-text;
      font-size: 15px;
    }
  }
}

.slider-container {
  position: relative;
  padding: 6px 0;
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: rgba(69, 91, 125, 0.5);
  outline: none;
  -webkit-appearance: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #99c5f1;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #99c5f1;
    cursor: pointer;
    border: 2px solid white;
  }
}

.slider-ticks {
  position: relative;
  height: 18px;
  margin-top: 3px;

  .tick {
    position: absolute;
    transform: translateX(-50%);
    color: ternary-text;
    font-size: 10px;
  }
}

.progress-container {
  margin: 14px 0;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 5px;

  .progress-bar-bg {
    width: 100%;
    height: 8px;
    background: rgba(69, 91, 125, 0.5);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #455B7D, #99c5f1);
    border-radius: 4px;
    transition: width 0.1s linear;
  }

  .progress-text {
    margin: 6px 0 0;
    color: secondary-text;
    font-size: 11px;
    text-align: center;
  }
}

.error-message {
  margin: 10px 0;
  padding: 9px 12px;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.4);
  border-radius: 4px;
  color: #ff9999;
  font-size: 12px;
}

.success-message {
  margin: 10px 0;
  padding: 9px 12px;
  background: rgba(100, 255, 100, 0.1);
  border: 1px solid rgba(100, 255, 100, 0.4);
  border-radius: 4px;
  color: #99ff99;
  font-size: 12px;
}

.notice-box {
  margin-top: 14px;
  padding: 10px 12px;
  background: rgba(255, 200, 100, 0.1);
  border: 1px solid rgba(255, 200, 100, 0.3);
  border-radius: 4px;
  color: #ffcc80;
  font-size: 11px;
  line-height: 1.5;
}

.button-row {
  margin-top: 16px;

  .btn {
    width: 100%;
    padding: 11px 20px;
    border: 1px solid secondary-border;
    border-radius: 5px;
    background: transparent;
    color: primary-text;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.btn-primary {
      background: rgba(153, 197, 241, 0.2);
      border-color: primary-border;

      &:hover:not(:disabled) {
        background: rgba(153, 197, 241, 0.3);
      }
    }

    &.btn-danger {
      background: rgba(255, 107, 107, 0.2);
      border-color: #ff6b6b;

      &:hover {
        background: rgba(255, 107, 107, 0.3);
      }
    }

    &.btn-small {
      width: auto;
      padding: 5px 12px;
      font-size: 11px;
    }
  }
}

.code-container {
  margin-bottom: 14px;
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;

  .code-title {
    color: secondary-text;
    font-size: 12px;
  }
}

.code-editor {
  width: 100%;
  height: 280px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.4);
  color: #e0e0e0;
  border: 1px solid secondary-border;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 10px;
  line-height: 1.5;
  resize: none;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: primary-border;
  }
}

.info-box {
  padding: 12px 14px;
  background: rgba(6, 24, 56, 0.8);
  border: 1px solid secondary-border;
  border-radius: 5px;

  h4 {
    margin: 0 0 8px;
    color: primary-text;
    font-size: 13px;
    font-weight: normal;
  }

  p {
    margin: 4px 0;
    color: secondary-text;
    font-size: 11px;
    line-height: 1.5;

    a {
      color: #99c5f1;
      text-decoration: underline;
    }
  }
}

.poster-preview-container {
  margin: 14px 0;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;

  .preview-label {
    color: secondary-text;
    font-size: 12px;
  }
}

.preview-wrapper {
  display: flex;
  justify-content: center;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 5px;
  border: 1px solid secondary-border;
  max-height: 250px;
  overflow: hidden;
}

.preview-canvas {
  max-width: 100%;
  max-height: 230px;
  background: #0a1628;
  object-fit: contain;
}

.field-hint {
  margin: 5px 0 0;
  color: ternary-text;
  font-size: 10px;
  font-style: italic;
}

@media (max-width: small-screen) {
  .export-share-container {
    right: 10px;
    top: auto;
    bottom: 10px;
  }

  .export-dialog {
    width: 95vw;
    max-height: 85vh;
  }

  .tabs-container {
    flex-direction: column;
    gap: 2px;
  }

  .button-row {
    flex-direction: column;
  }
}
</style>
