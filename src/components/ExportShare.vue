<template>
  <div class="export-share-container">
    <div class="export-share-btn">
      <a href="#" @click.prevent="openDialog" class="open-export-dialog">
        <span class="icon">⬇</span> Export & Share
      </a>
    </div>

    <div v-if="isOpened" class="export-dialog" @click="hide">
      <div class="export-window" ref="exportWindow">
        <div class="dialog-header">
          <h2>Export & Share</h2>
          <a href="#" @click.prevent="hide" class="close-btn" title="close">×</a>
        </div>

        <div class="tabs">
          <button 
            v-for="tab in tabs" 
            :key="tab.id"
            :class="['tab-btn', { active: activeTab === tab.id }]"
            @click="activeTab = tab.id"
          >
            {{ tab.name }}
          </button>
        </div>

        <div class="tab-content">
          <div v-if="activeTab === 'video'" class="video-export">
            <div class="form-group">
              <label>Output Format</label>
              <select v-model="videoFormat" class="form-select">
                <option value="webm">WebM Video</option>
                <option value="gif">GIF Animation</option>
              </select>
            </div>

            <div class="form-group">
              <label>Resolution</label>
              <select v-model="resolutionPreset" class="form-select" @change="updateResolution">
                <option value="custom">Custom</option>
                <option value="720p">720p (1280×720)</option>
                <option value="1080p">1080p (1920×1080)</option>
                <option value="4k">4K (3840×2160)</option>
                <option value="square">Square (1080×1080)</option>
              </select>
              <div class="resolution-inputs" v-if="resolutionPreset === 'custom'">
                <input type="number" v-model.number="exportWidth" min="320" max="4096" class="res-input">
                <span class="x">×</span>
                <input type="number" v-model.number="exportHeight" min="240" max="4096" class="res-input">
              </div>
            </div>

            <div class="form-group">
              <label>Duration (seconds)</label>
              <div class="duration-control">
                <input type="range" v-model.number="duration" min="1" max="60" step="1" class="slider">
                <span class="duration-value">{{ duration }}s</span>
              </div>
            </div>

            <div class="form-group">
              <label>FPS</label>
              <select v-model.number="fps" class="form-select">
                <option :value="30">30 FPS</option>
                <option :value="60">60 FPS</option>
              </select>
            </div>

            <div class="progress-section" v-if="isRecording">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: recordingProgress + '%' }"></div>
              </div>
              <p class="progress-text">Recording: {{ Math.floor(recordingProgress) }}% ({{ currentFrame }}/{{ totalFrames }} frames)</p>
            </div>

            <div class="action-buttons">
              <button 
                v-if="!isRecording" 
                class="btn primary" 
                @click="startRecording"
                :disabled="isProcessing"
              >
                🎥 Start Recording
              </button>
              <button 
                v-else 
                class="btn danger" 
                @click="stopRecording"
              >
                ⏹ Stop Recording
              </button>
            </div>

            <div v-if="errorMessage" class="error-box">
              {{ errorMessage }}
            </div>
          </div>

          <div v-if="activeTab === 'shader'" class="shader-export">
            <div class="form-group">
              <label>Target Platform</label>
              <select v-model="shaderPlatform" class="form-select">
                <option value="shadertoy">Shadertoy</option>
                <option value="glslsandbox">GLSL Sandbox</option>
              </select>
            </div>

            <div class="code-preview">
              <div class="code-header">
                <span class="code-label">Generated {{ shaderPlatform === 'shadertoy' ? 'Shadertoy' : 'GLSL Sandbox' }} Code</span>
                <button class="btn small" @click="copyShaderCode">
                  {{ copied ? '✓ Copied!' : '📋 Copy Code' }}
                </button>
              </div>
              <textarea 
                ref="shaderCodeArea"
                v-model="generatedShaderCode" 
                class="code-area"
                readonly
              ></textarea>
            </div>

            <div class="platform-info">
              <p v-if="shaderPlatform === 'shadertoy'">
                <strong>How to use in Shadertoy:</strong><br>
                1. Go to <a href="https://www.shadertoy.com/new" target="_blank">shadertoy.com/new</a><br>
                2. Paste the code above into the "Image" tab<br>
                3. Click "Play" to see your vector field
              </p>
              <p v-else>
                <strong>How to use in GLSL Sandbox:</strong><br>
                1. Go to <a href="http://glslsandbox.com/" target="_blank">glslsandbox.com</a><br>
                2. Click "New shader"<br>
                3. Replace the default code with the code above
              </p>
            </div>
          </div>

          <div v-if="activeTab === 'poster'" class="poster-export">
            <div class="form-group">
              <label>Poster Title</label>
              <input type="text" v-model="posterTitle" class="form-input" placeholder="Enter poster title...">
            </div>

            <div class="form-group">
              <label>Poster Subtitle</label>
              <input type="text" v-model="posterSubtitle" class="form-input" placeholder="Enter subtitle...">
            </div>

            <div class="form-group">
              <label>Poster Size</label>
              <select v-model="posterSize" class="form-select">
                <option value="a4">A4 (210×297mm)</option>
                <option value="instagram">Instagram (1080×1080)</option>
                <option value="wide">Wide (1920×1080)</option>
              </select>
            </div>

            <div class="form-group">
              <label>QR Code Text (for simulation)</label>
              <input type="text" v-model="qrText" class="form-input" placeholder="URL or text to encode...">
            </div>

            <div class="poster-preview">
              <span class="preview-label">Poster Preview</span>
              <canvas ref="posterCanvas" class="preview-canvas"></canvas>
            </div>

            <div class="action-buttons">
              <button class="btn primary" @click="updatePosterPreview">
                🔄 Refresh Preview
              </button>
              <button class="btn primary" @click="downloadPoster">
                💾 Download Poster
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import bus from '../lib/bus.js';

const tabs = [
  { id: 'video', name: '📹 Video/GIF' },
  { id: 'shader', name: '💻 Shader Code' },
  { id: 'poster', name: '🎨 Poster' }
];

export default {
  name: 'ExportShare',
  data() {
    return {
      tabs,
      isOpened: false,
      activeTab: 'video',
      lastCallTime: new Date(),

      videoFormat: 'webm',
      resolutionPreset: '720p',
      exportWidth: 1280,
      exportHeight: 720,
      duration: 10,
      fps: 30,
      isRecording: false,
      isProcessing: false,
      recordingProgress: 0,
      currentFrame: 0,
      totalFrames: 0,
      errorMessage: '',
      recordingFrames: [],
      mediaRecorder: null,
      recordedChunks: [],

      shaderPlatform: 'shadertoy',
      generatedShaderCode: '',
      copied: false,

      posterTitle: 'Vector Field Art',
      posterSubtitle: 'Generated with FieldPlay',
      posterSize: 'instagram',
      qrText: 'https://github.com/anvaka/fieldplay',
    };
  },
  mounted() {
    bus.on('open-export-dialog', this.openDialog, this);
    document.body.addEventListener('keydown', this.onKeyDown, this);
  },
  beforeUnmount() {
    bus.off('open-export-dialog', this.openDialog, this);
    document.body.removeEventListener('keydown', this.onKeyDown, this);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  },
  watch: {
    shaderPlatform() {
      this.generateShaderCode();
    },
    activeTab(newVal) {
      if (newVal === 'shader') {
        this.generateShaderCode();
      } else if (newVal === 'poster') {
        this.$nextTick(() => this.updatePosterPreview());
      }
    }
  },
  methods: {
    onKeyDown(e) {
      if (e.which === 27) {
        this.isOpened = false;
      }
    },
    hide(e) {
      var callTime = new Date();
      if (callTime - this.lastCallTime < 300) {
        return;
      }
      this.lastCallTime = callTime;
      var { exportWindow } = this.$refs;
      if (!exportWindow) return;
      var partOfADialog = (exportWindow.contains(e.target) && !e.target.classList.contains('close-btn'));
      if (partOfADialog || e.target == exportWindow) {
        return;
      }
      this.isOpened = false;
    },
    openDialog() {
      this.isOpened = true;
      this.errorMessage = '';
      if (this.activeTab === 'shader') {
        this.generateShaderCode();
      } else if (this.activeTab === 'poster') {
        this.$nextTick(() => this.updatePosterPreview());
      }
    },
    updateResolution() {
      switch (this.resolutionPreset) {
        case '720p':
          this.exportWidth = 1280;
          this.exportHeight = 720;
          break;
        case '1080p':
          this.exportWidth = 1920;
          this.exportHeight = 1080;
          break;
        case '4k':
          this.exportWidth = 3840;
          this.exportHeight = 2160;
          break;
        case 'square':
          this.exportWidth = 1080;
          this.exportHeight = 1080;
          break;
      }
    },
    async startRecording() {
      if (this.isRecording) return;
      
      const canvas = document.getElementById('scene');
      if (!canvas) {
        this.errorMessage = 'Cannot find canvas element';
        return;
      }

      this.isRecording = true;
      this.errorMessage = '';
      this.totalFrames = this.duration * this.fps;
      this.currentFrame = 0;
      this.recordingProgress = 0;

      if (this.videoFormat === 'webm') {
        await this.startMediaRecorder(canvas);
      } else {
        this.recordingFrames = [];
        this.startFrameCapture(canvas);
      }
    },
    async startMediaRecorder(canvas) {
      try {
        const stream = canvas.captureStream(this.fps);
        const options = { 
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 10000000
        };
        
        let actualOptions = options;
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          actualOptions = { mimeType: 'video/webm' };
        }

        this.mediaRecorder = new MediaRecorder(stream, actualOptions);
        this.recordedChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          this.downloadWebM();
        };

        this.mediaRecorder.start();

        setTimeout(() => {
          if (this.isRecording) {
            this.stopRecording();
          }
        }, this.duration * 1000);

        this.startProgressTimer();
      } catch (e) {
        this.errorMessage = 'MediaRecorder not supported: ' + e.message;
        this.isRecording = false;
      }
    },
    startProgressTimer() {
      const interval = 100;
      const timer = setInterval(() => {
        if (!this.isRecording) {
          clearInterval(timer);
          return;
        }
        this.currentFrame++;
        this.recordingProgress = Math.min(100, (this.currentFrame / this.totalFrames) * 100);
        
        if (this.currentFrame >= this.totalFrames) {
          clearInterval(timer);
        }
      }, 1000 / this.fps);
    },
    startFrameCapture(canvas) {
      const captureFrame = () => {
        if (!this.isRecording) return;

        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = canvas.width;
        frameCanvas.height = canvas.height;
        const ctx = frameCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        this.recordingFrames.push(frameCanvas);

        this.currentFrame++;
        this.recordingProgress = (this.currentFrame / this.totalFrames) * 100;

        if (this.currentFrame < this.totalFrames) {
          setTimeout(captureFrame, 1000 / this.fps);
        } else {
          this.isRecording = false;
          this.isProcessing = true;
          this.errorMessage = 'Processing GIF... (this may take a while)';
          this.convertFramesToGIF();
        }
      };
      captureFrame();
    },
    stopRecording() {
      this.isRecording = false;
      
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }

      if (this.videoFormat === 'gif' && this.recordingFrames.length > 0) {
        this.isProcessing = true;
        this.errorMessage = 'Processing GIF...';
        this.convertFramesToGIF();
      }
    },
    downloadWebM() {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = url;
      a.download = `vector-field-${Date.now()}.webm`;
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      this.isRecording = false;
      this.recordingProgress = 0;
    },
    async convertFramesToGIF() {
      try {
        const frames = this.recordingFrames;
        if (frames.length === 0) {
          this.errorMessage = 'No frames captured';
          this.isProcessing = false;
          return;
        }

        const firstFrame = frames[0];
        const width = firstFrame.width;
        const height = firstFrame.height;
        const delay = Math.round(100 / this.fps);

        const gifData = this.createSimpleGIF(frames, width, height, delay);
        
        const blob = new Blob([gifData], { type: 'image/gif' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = `vector-field-${Date.now()}.gif`;
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        this.errorMessage = '';
        this.isProcessing = false;
        this.recordingFrames = [];
      } catch (e) {
        this.errorMessage = 'GIF creation failed: ' + e.message;
        this.isProcessing = false;
      }
    },
    createSimpleGIF(frames, width, height, delay) {
      const bytes = [];
      
      bytes.push(...this.stringToBytes('GIF89a'));
      
      bytes.push(...this.writeUInt16(width));
      bytes.push(...this.writeUInt16(height));
      
      bytes.push(0x80 | 0x70);
      bytes.push(0);
      bytes.push(0);

      const globalPalette = this.createPalette();
      bytes.push(...globalPalette);

      bytes.push(...this.stringToBytes('NETSCAPE2.0'));
      bytes.push(3);
      bytes.push(1);
      bytes.push(0);
      bytes.push(0);
      bytes.push(0);

      const sampleFrame = frames[Math.floor(frames.length / 2)];
      const colorTable = this.buildColorTable(sampleFrame);

      for (let i = 0; i < frames.length; i++) {
        bytes.push(...this.writeGraphicControlExtension(delay));
        bytes.push(...this.writeImageDescriptor(frames[i], width, height, colorTable));
      }

      bytes.push(0x3B);
      
      return new Uint8Array(bytes);
    },
    stringToBytes(str) {
      return str.split('').map(c => c.charCodeAt(0));
    },
    writeUInt16(value) {
      return [value & 0xFF, (value >> 8) & 0xFF];
    },
    createPalette() {
      const palette = [];
      for (let i = 0; i < 256; i++) {
        palette.push(i, i, i);
      }
      return palette;
    },
    buildColorTable(canvas) {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const colors = new Map();
      
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i] & 0xF8;
        const g = imageData.data[i + 1] & 0xF8;
        const b = imageData.data[i + 2] & 0xF8;
        const key = (r << 16) | (g << 8) | b;
        colors.set(key, (colors.get(key) || 0) + 1);
      }
      
      const sortedColors = Array.from(colors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 255);
      
      const table = new Map();
      sortedColors.forEach((entry, idx) => {
        table.set(entry[0], idx);
      });
      
      return table;
    },
    writeGraphicControlExtension(delay) {
      return [
        0x21,
        0xF9,
        4,
        0x04,
        ...this.writeUInt16(delay),
        0,
        0
      ];
    },
    writeImageDescriptor(canvas, width, height, colorTable) {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, width, height);
      const pixels = [];

      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i] & 0xF8;
        const g = imageData.data[i + 1] & 0xF8;
        const b = imageData.data[i + 2] & 0xF8;
        const key = (r << 16) | (g << 8) | b;
        
        let idx = colorTable.get(key);
        if (idx === undefined) {
          let minDist = Infinity;
          for (const [tableKey, tableIdx] of colorTable.entries()) {
            const tr = (tableKey >> 16) & 0xFF;
            const tg = (tableKey >> 8) & 0xFF;
            const tb = tableKey & 0xFF;
            const dist = Math.abs(r - tr) + Math.abs(g - tg) + Math.abs(b - tb);
            if (dist < minDist) {
              minDist = dist;
              idx = tableIdx;
            }
          }
        }
        pixels.push(idx || 0);
      }

      const lzwData = this.simpleLZW(pixels, 8);

      return [
        0x2C,
        0, 0,
        0, 0,
        ...this.writeUInt16(width),
        ...this.writeUInt16(height),
        0,
        ...lzwData
      ];
    },
    simpleLZW(data, minCodeSize) {
      const output = [];
      output.push(minCodeSize);

      let bitBuffer = 0;
      let bitCount = 0;
      let codeSize = minCodeSize + 1;
      let dict = new Map();
      let nextCode = 1 << minCodeSize;
      const clearCode = 1 << minCodeSize;
      const eoiCode = clearCode + 1;
      nextCode = eoiCode + 1;

      const writeCode = (code) => {
        bitBuffer |= code << bitCount;
        bitCount += codeSize;
        while (bitCount >= 8) {
          output.push(bitBuffer & 0xFF);
          bitBuffer >>= 8;
          bitCount -= 8;
        }
      };

      writeCode(clearCode);

      let current = String.fromCharCode(data[0]);
      for (let i = 1; i < data.length; i++) {
        const next = current + String.fromCharCode(data[i]);
        if (dict.has(next)) {
          current = next;
        } else {
          const code = current.length === 1 ? current.charCodeAt(0) : dict.get(current);
          writeCode(code);
          
          if (nextCode < 4096) {
            dict.set(next, nextCode++);
            if (nextCode >= (1 << codeSize) && codeSize < 12) {
              codeSize++;
            }
          } else {
            writeCode(clearCode);
            dict.clear();
            codeSize = minCodeSize + 1;
            nextCode = eoiCode + 1;
          }
          current = String.fromCharCode(data[i]);
        }
      }

      const finalCode = current.length === 1 ? current.charCodeAt(0) : dict.get(current);
      writeCode(finalCode);
      writeCode(eoiCode);

      if (bitCount > 0) {
        output.push(bitBuffer & 0xFF);
      }

      const blocks = [];
      for (let i = 0; i < output.length; i += 255) {
        const chunk = output.slice(i, i + 255);
        blocks.push(chunk.length);
        blocks.push(...chunk);
      }
      blocks.push(0);

      return blocks;
    },
    getVectorFieldCode() {
      if (window.scene && window.scene.vectorFieldEditorState) {
        return window.scene.vectorFieldEditorState.getCode() || '';
      }
      return 'vec2 get_velocity(vec2 p) {\n  return vec2(0.0);\n}';
    },
    generateShaderCode() {
      const userCode = this.getVectorFieldCode();
      
      if (this.shaderPlatform === 'shadertoy') {
        this.generatedShaderCode = this.generateShadertoyCode(userCode);
      } else {
        this.generatedShaderCode = this.generateGLSLSandboxCode(userCode);
      }
    },
    generateShadertoyCode(userCode) {
      return `// Vector Field - Shadertoy Export
// Generated from FieldPlay
// Paste this into Shadertoy's "Image" tab

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

const float PARTICLE_COUNT = 50.0;
const float LINE_LENGTH = 0.05;
const float STEP_SIZE = 0.002;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 p = (uv - 0.5) * 2.0;
    p.x *= iResolution.x / iResolution.y;
    
    float aspect = iResolution.x / iResolution.y;
    vec2 screenP = p;
    
    vec3 color = vec3(0.02, 0.04, 0.08);
    float trail = 0.0;
    
    for (float i = 0.0; i < PARTICLE_COUNT; i++) {
        vec2 seed = vec2(
            rand(vec2(i, 0.0)) * 2.0 - 1.0,
            rand(vec2(0.0, i)) * 2.0 - 1.0
        );
        
        vec2 pos = screenP + seed * 0.5;
        float dist = 0.0;
        
        for (float j = 0.0; j < 50.0; j++) {
            vec2 vel = get_velocity(pos);
            float speed = length(vel);
            
            if (speed > 0.001) {
                float d = length(screenP - pos);
                float influence = exp(-d * 20.0);
                float hue = atan(vel.y, vel.x) / 6.28318;
                vec3 lineColor = vec3(
                    0.5 + 0.5 * sin(hue * 6.28318),
                    0.5 + 0.5 * sin(hue * 6.28318 + 2.094),
                    0.5 + 0.5 * sin(hue * 6.28318 + 4.188)
                );
                color += lineColor * influence * 0.3;
                trail += influence;
            }
            
            pos += normalize(vel + 0.001) * STEP_SIZE;
            
            if (pos.x > 1.5 * aspect || pos.x < -1.5 * aspect || 
                pos.y > 1.5 || pos.y < -1.5) break;
        }
    }
    
    vec2 directVel = get_velocity(screenP);
    float directSpeed = length(directVel);
    
    if (directSpeed > 0.01) {
        float hue = atan(directVel.y, directVel.x) / 6.28318;
        vec3 velocityColor = vec3(
            0.6 + 0.4 * sin(hue * 6.28318 + iTime * 0.5),
            0.6 + 0.4 * sin(hue * 6.28318 + 2.094 + iTime * 0.3),
            0.8 + 0.2 * sin(hue * 6.28318 + 4.188)
        );
        color = mix(color, velocityColor, smoothstep(0.0, 0.5, directSpeed) * 0.3);
    }
    
    color = pow(color, vec3(0.9));
    fragColor = vec4(color, 1.0);
}`;
    },
    generateGLSLSandboxCode(userCode) {
      return `// Vector Field - GLSL Sandbox Export
// Generated from FieldPlay

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
        float hue = atan(vel.y, vel.x) / 6.28318;
        color = vec3(
            0.5 + 0.5 * sin(hue * 6.28318 + time * 0.5),
            0.5 + 0.5 * sin(hue * 6.28318 + 2.094 + time * 0.3),
            0.7 + 0.3 * sin(hue * 6.28318 + 4.188)
        );
        
        float intensity = smoothstep(0.0, 1.0, speed);
        color = mix(vec3(0.02, 0.04, 0.08), color, intensity);
    }
    
    float grid = 0.0;
    vec2 gridPos = position * 10.0;
    vec2 gridDist = abs(fract(gridPos) - 0.5);
    float gridLine = min(gridDist.x, gridDist.y);
    grid = smoothstep(0.02, 0.0, gridLine) * 0.1;
    color += vec3(grid);
    
    gl_FragColor = vec4(color, 1.0);
}`;
    },
    async copyShaderCode() {
      try {
        await navigator.clipboard.writeText(this.generatedShaderCode);
        this.copied = true;
        setTimeout(() => {
          this.copied = false;
        }, 2000);
      } catch (e) {
        const textarea = this.$refs.shaderCodeArea;
        if (textarea) {
          textarea.select();
          document.execCommand('copy');
          this.copied = true;
          setTimeout(() => {
            this.copied = false;
          }, 2000);
        }
      }
    },
    getPosterDimensions() {
      switch (this.posterSize) {
        case 'a4':
          return { width: 794, height: 1123 };
        case 'instagram':
          return { width: 1080, height: 1080 };
        case 'wide':
          return { width: 1920, height: 1080 };
        default:
          return { width: 1080, height: 1080 };
      }
    },
    updatePosterPreview() {
      const canvas = this.$refs.posterCanvas;
      if (!canvas) return;

      const dims = this.getPosterDimensions();
      const previewScale = 0.4;
      canvas.width = dims.width * previewScale;
      canvas.height = dims.height * previewScale;

      const ctx = canvas.getContext('2d');
      this.drawPoster(ctx, canvas.width, canvas.height, previewScale);
    },
    drawPoster(ctx, width, height, scale) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#0a1628');
      gradient.addColorStop(0.5, '#0d1f3c');
      gradient.addColorStop(1, '#061838');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const canvasWidth = Math.floor(width * 0.9);
      const canvasHeight = Math.floor(height * 0.55);
      const canvasX = Math.floor((width - canvasWidth) / 2);
      const canvasY = Math.floor(height * 0.08);

      const sourceCanvas = document.getElementById('scene');
      if (sourceCanvas) {
        try {
          ctx.drawImage(sourceCanvas, canvasX, canvasY, canvasWidth, canvasHeight);
        } catch (e) {
          this.drawPlaceholderVectorField(ctx, canvasX, canvasY, canvasWidth, canvasHeight);
        }
      } else {
        this.drawPlaceholderVectorField(ctx, canvasX, canvasY, canvasWidth, canvasHeight);
      }

      ctx.strokeStyle = 'rgba(153, 197, 241, 0.5)';
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(canvasX, canvasY, canvasWidth, canvasHeight);

      const contentY = canvasY + canvasHeight + 30 * scale;

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.floor(32 * scale)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(this.posterTitle, width / 2, contentY);

      ctx.fillStyle = '#99c5f1';
      ctx.font = `${Math.floor(18 * scale)}px Arial, sans-serif`;
      ctx.fillText(this.posterSubtitle, width / 2, contentY + 30 * scale);

      const qrSize = Math.floor(120 * scale);
      const qrX = Math.floor(width / 2 - qrSize / 2);
      const qrY = Math.floor(contentY + 50 * scale);

      this.drawQRCodePlaceholder(ctx, qrX, qrY, qrSize);

      ctx.fillStyle = '#435970';
      ctx.font = `${Math.floor(12 * scale)}px Arial, sans-serif`;
      ctx.fillText('Scan to experience (Demo)', width / 2, qrY + qrSize + 20 * scale);

      ctx.fillStyle = '#455B7D';
      ctx.font = `${Math.floor(10 * scale)}px Arial, sans-serif`;
      ctx.fillText('Generated with FieldPlay • Vector Field Art', width / 2, height - 20 * scale);
    },
    drawPlaceholderVectorField(ctx, x, y, w, h) {
      const time = Date.now() * 0.001;
      
      for (let i = 0; i < 2000; i++) {
        const px = x + Math.random() * w;
        const py = y + Math.random() * h;
        const nx = (px - x) / w - 0.5;
        const ny = (py - y) / h - 0.5;
        
        const vx = Math.sin(nx * 5 + time) * 0.5 - ny;
        const vy = Math.cos(ny * 5 + time) * 0.5 + nx;
        
        const hue = Math.atan2(vy, vx) / 6.28;
        const r = Math.floor(128 + 127 * Math.sin(hue * 6.28));
        const g = Math.floor(128 + 127 * Math.sin(hue * 6.28 + 2.09));
        const b = Math.floor(180 + 75 * Math.sin(hue * 6.28 + 4.18));
        
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
        ctx.fillRect(px, py, 2, 2);
      }
    },
    drawQRCodePlaceholder(ctx, x, y, size) {
      const cellSize = size / 21;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, size, size);
      
      ctx.fillStyle = '#0a1628';
      
      for (let i = 0; i < 21; i++) {
        for (let j = 0; j < 21; j++) {
          let shouldFill = false;
          
          if (i < 7 && j < 7) shouldFill = this.isPositionMarkerCell(i, j);
          else if (i < 7 && j >= 14) shouldFill = this.isPositionMarkerCell(i, j - 14);
          else if (i >= 14 && j < 7) shouldFill = this.isPositionMarkerCell(i - 14, j);
          else if (i === 6 || j === 6 || i === 13 || j === 13) shouldFill = (i + j) % 2 === 0;
          else shouldFill = Math.sin(i * 1.5) * Math.cos(j * 1.3) > 0.3;
          
          if (shouldFill) {
            ctx.fillRect(
              Math.floor(x + j * cellSize),
              Math.floor(y + i * cellSize),
              Math.ceil(cellSize),
              Math.ceil(cellSize)
            );
          }
        }
      }
      
      ctx.strokeStyle = '#455B7D';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, size, size);
    },
    isPositionMarkerCell(i, j) {
      if (i === 0 || i === 6 || j === 0 || j === 6) return true;
      if (i >= 2 && i <= 4 && j >= 2 && j <= 4) return true;
      return false;
    },
    downloadPoster() {
      const dims = this.getPosterDimensions();
      
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      
      const ctx = canvas.getContext('2d');
      this.drawPoster(ctx, dims.width, dims.height, 1.0);
      
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = dataUrl;
      a.download = `vector-field-poster-${Date.now()}.png`;
      a.click();
      document.body.removeChild(a);
    }
  }
}
</script>

<style lang="stylus">
@import "./shared.styl";

.export-share-container {
  position: absolute;
  right: 80px;
  top: 0;
  z-index: 100;
}

.export-share-btn {
  a.open-export-dialog {
    padding: 8px 16px;
    color: white;
    display: block;
    background: rgba(153, 197, 241, 0.1);
    border: 1px solid rgba(153, 197, 241, 0.3);
    border-radius: 4px;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(153, 197, 241, 0.2);
      border-color: primary-border;
    }

    .icon {
      margin-right: 6px;
    }
  }
}

.export-dialog {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  color: primary-text;
  z-index: 1000;
}

.export-window {
  position: relative;
  background: window-background;
  padding: 14px;
  width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  border: 1px solid primary-border;

  .dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;

    h2 {
      margin: 0;
      font-weight: normal;
      font-size: 18px;
    }

    .close-btn {
      color: primary-text;
      font-size: 24px;
      line-height: 1;
      padding: 0 8px;
      text-decoration: none;

      &:hover {
        color: #ff6b6b;
      }
    }
  }
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  border-bottom: 1px solid secondary-border;
  padding-bottom: 14px;

  .tab-btn {
    flex: 1;
    padding: 10px 8px;
    background: transparent;
    border: 1px solid secondary-border;
    color: secondary-text;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: primary-border;
      color: primary-text;
    }

    &.active {
      background: rgba(153, 197, 241, 0.2);
      border-color: primary-border;
      color: primary-text;
    }
  }
}

.tab-content {
  min-height: 300px;
}

.form-group {
  margin-bottom: 16px;

  label {
    display: block;
    color: secondary-text;
    font-size: 13px;
    margin-bottom: 6px;
  }

  .form-select {
    width: 100%;
    padding: 10px;
    background: rgba(6, 24, 56, 0.8);
    color: primary-text;
    border: 1px solid secondary-border;
    font-size: 14px;

    &:focus {
      outline: none;
      border-color: primary-border;
    }
  }

  .form-input {
    width: 100%;
    padding: 10px;
    background: rgba(6, 24, 56, 0.8);
    color: primary-text;
    border: 1px solid secondary-border;
    font-size: 14px;
    box-sizing: border-box;

    &:focus {
      outline: none;
      border-color: primary-border;
    }

    &::placeholder {
      color: ternary-text;
    }
  }

  .resolution-inputs {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;

    .res-input {
      flex: 1;
      padding: 8px;
      background: rgba(6, 24, 56, 0.8);
      color: primary-text;
      border: 1px solid secondary-border;
      font-size: 14px;
      min-width: 80px;

      &:focus {
        outline: none;
        border-color: primary-border;
      }
    }

    .x {
      color: secondary-text;
    }
  }

  .duration-control {
    display: flex;
    align-items: center;
    gap: 12px;

    .slider {
      flex: 1;
      accent-color: #99c5f1;
    }

    .duration-value {
      color: primary-text;
      font-size: 14px;
      min-width: 40px;
    }
  }
}

.progress-section {
  margin: 16px 0;

  .progress-bar {
    width: 100%;
    height: 8px;
    background: rgba(69, 91, 125, 0.5);
    border-radius: 4px;
    overflow: hidden;

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #455B7D, #99c5f1);
      transition: width 0.1s linear;
    }
  }

  .progress-text {
    color: secondary-text;
    font-size: 12px;
    margin-top: 8px;
  }
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 20px;

  .btn {
    flex: 1;
    padding: 12px 20px;
    border: 1px solid secondary-border;
    background: transparent;
    color: primary-text;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      background: rgba(153, 197, 241, 0.1);
      border-color: primary-border;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.primary {
      background: rgba(153, 197, 241, 0.2);
      border-color: primary-border;

      &:hover:not(:disabled) {
        background: rgba(153, 197, 241, 0.3);
      }
    }

    &.danger {
      background: rgba(255, 107, 107, 0.2);
      border-color: #ff6b6b;

      &:hover {
        background: rgba(255, 107, 107, 0.3);
      }
    }

    &.small {
      flex: none;
      padding: 6px 12px;
      font-size: 12px;
    }
  }
}

.error-box {
  margin-top: 12px;
  padding: 10px;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.5);
  color: #ff6b6b;
  font-size: 13px;
}

.code-preview {
  margin-top: 10px;

  .code-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    .code-label {
      color: secondary-text;
      font-size: 13px;
    }
  }

  .code-area {
    width: 100%;
    height: 280px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.3);
    color: #e0e0e0;
    border: 1px solid secondary-border;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    line-height: 1.5;
    resize: none;
    box-sizing: border-box;

    &:focus {
      outline: none;
      border-color: primary-border;
    }
  }
}

.platform-info {
  margin-top: 14px;
  padding: 12px;
  background: rgba(6, 24, 56, 0.8);
  border: 1px solid secondary-border;

  p {
    color: secondary-text;
    font-size: 12px;
    line-height: 1.6;
    margin: 0;

    a {
      color: #99c5f1;
      text-decoration: underline;
    }

    strong {
      color: primary-text;
    }
  }
}

.poster-preview {
  margin-top: 10px;
  text-align: center;

  .preview-label {
    display: block;
    color: secondary-text;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .preview-canvas {
    max-width: 100%;
    max-height: 300px;
    border: 1px solid secondary-border;
    background: #0a1628;
  }
}

@media (max-width: small-screen) {
  .export-share-container {
    right: 10px;
    top: auto;
    bottom: 10px;
  }

  .export-window {
    width: 90%;
    max-height: 85vh;
  }

  .tabs {
    flex-direction: column;
  }

  .action-buttons {
    flex-direction: column;
  }
}
</style>
