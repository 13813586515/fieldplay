<template>
  <div class="reaction-diffusion-panel" v-if="isWebGPU">
    <div class="panel-header">
      <h3>Reaction-Diffusion</h3>
      <button 
        @click="toggleRD" 
        class="toggle-btn"
        :class="{ 'on': rdEnabled }"
      >
        {{ rdEnabled ? 'ON' : 'OFF' }}
      </button>
    </div>
    
    <div class="rd-controls" v-if="rdEnabled">
      <div class="preset-selector">
        <label>Presets</label>
        <div class="preset-buttons">
          <button 
            v-for="preset in presets" 
            :key="preset.name"
            @click="applyPreset(preset)"
            class="preset-btn"
            :class="{ 'active': isPresetActive(preset) }"
          >
            {{ preset.name }}
          </button>
        </div>
      </div>
      
      <div class="control-group">
        <label>Feed Rate (f)</label>
        <input 
          type="range" 
          :value="feed" 
          @input="updateFeed(parseFloat($event.target.value))"
          min="0.01" 
          max="0.1" 
          step="0.001"
        />
        <span class="value">{{ feed.toFixed(4) }}</span>
      </div>
      
      <div class="control-group">
        <label>Kill Rate (k)</label>
        <input 
          type="range" 
          :value="kill" 
          @input="updateKill(parseFloat($event.target.value))"
          min="0.04" 
          max="0.07" 
          step="0.001"
        />
        <span class="value">{{ kill.toFixed(4) }}</span>
      </div>
      
      <div class="control-group">
        <label>Diffusion A (Da)</label>
        <input 
          type="range" 
          :value="diffusionA" 
          @input="updateDiffusionA(parseFloat($event.target.value))"
          min="0.1" 
          max="2.0" 
          step="0.1"
        />
        <span class="value">{{ diffusionA.toFixed(1) }}</span>
      </div>
      
      <div class="control-group">
        <label>Diffusion B (Db)</label>
        <input 
          type="range" 
          :value="diffusionB" 
          @input="updateDiffusionB(parseFloat($event.target.value))"
          min="0.1" 
          max="1.0" 
          step="0.05"
        />
        <span class="value">{{ diffusionB.toFixed(2) }}</span>
      </div>
      
      <div class="control-group">
        <label>Time Step</label>
        <input 
          type="range" 
          :value="timeStep" 
          @input="updateTimeStep(parseFloat($event.target.value))"
          min="0.1" 
          max="2.0" 
          step="0.1"
        />
        <span class="value">{{ timeStep.toFixed(1) }}</span>
      </div>
      
      <div class="action-buttons">
        <button @click="resetRD" class="reset-btn">Reset Pattern</button>
        <button @click="addSeedAtCenter" class="seed-btn">Add Seed (Click canvas)</button>
      </div>
      
      <div class="info-box">
        <p><strong>Gray-Scott Model:</strong> Chemical A converts to B where B is present. 
        Different (f, k) values produce different patterns like spots, stripes, and waves.</p>
      </div>
    </div>
    
    <div class="disabled-message" v-else>
      <p>Click "ON" to enable reaction-diffusion patterns.</p>
    </div>
  </div>
</template>

<script>
import { reactive } from 'vue';
import bus from '../lib/bus';

const presets = [
  { name: 'Spots', feed: 0.035, kill: 0.065, diffusionA: 1.0, diffusionB: 0.5 },
  { name: 'Stripes', feed: 0.037, kill: 0.06, diffusionA: 1.0, diffusionB: 0.5 },
  { name: 'Mitosis', feed: 0.028, kill: 0.062, diffusionA: 1.0, diffusionB: 0.5 },
  { name: 'Maze', feed: 0.029, kill: 0.057, diffusionA: 1.0, diffusionB: 0.5 },
  { name: 'Solitons', feed: 0.01, kill: 0.045, diffusionA: 0.5, diffusionB: 0.25 },
  { name: 'Waves', feed: 0.014, kill: 0.054, diffusionA: 1.0, diffusionB: 0.5 },
  { name: 'Bubbles', feed: 0.078, kill: 0.061, diffusionA: 1.0, diffusionB: 0.5 },
  { name: 'Pulse', feed: 0.025, kill: 0.05, diffusionA: 1.0, diffusionB: 0.5 }
];

export default {
  name: 'ReactionDiffusion',
  props: {
    scene: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      rdEnabled: false,
      feed: 0.055,
      kill: 0.062,
      diffusionA: 1.0,
      diffusionB: 0.5,
      timeStep: 1.0,
      isWebGPU: false,
      currentPreset: null,
      presets
    };
  },
  mounted() {
    bus.on('scene-ready', this.onSceneReady);
    if (window.scene) {
      this.onSceneReady(window.scene);
    }
  },
  beforeUnmount() {
    bus.off('scene-ready', this.onSceneReady);
  },
  methods: {
    onSceneReady(scene) {
      this.scene = scene;
      this.isWebGPU = scene && scene.isWebGPU;
      if (this.isWebGPU && scene.reactionDiffusion) {
        this.rdEnabled = scene.reactionDiffusion.isEnabled();
        const params = scene.reactionDiffusion.params;
        this.feed = params.feed;
        this.kill = params.kill;
        this.diffusionA = params.diffusionRateA;
        this.diffusionB = params.diffusionRateB;
        this.timeStep = params.timeStep;
      }
    },
    
    toggleRD() {
      if (!this.scene) return;
      this.rdEnabled = !this.rdEnabled;
      this.scene.enableReactionDiffusion(this.rdEnabled);
    },
    
    updateFeed(value) {
      this.feed = value;
      this.currentPreset = null;
      if (this.scene) {
        this.scene.setReactionDiffusionParams({ feed: value });
      }
    },
    
    updateKill(value) {
      this.kill = value;
      this.currentPreset = null;
      if (this.scene) {
        this.scene.setReactionDiffusionParams({ kill: value });
      }
    },
    
    updateDiffusionA(value) {
      this.diffusionA = value;
      if (this.scene) {
        this.scene.setReactionDiffusionParams({ diffusionRateA: value });
      }
    },
    
    updateDiffusionB(value) {
      this.diffusionB = value;
      if (this.scene) {
        this.scene.setReactionDiffusionParams({ diffusionRateB: value });
      }
    },
    
    updateTimeStep(value) {
      this.timeStep = value;
      if (this.scene) {
        this.scene.setReactionDiffusionParams({ timeStep: value });
      }
    },
    
    applyPreset(preset) {
      this.currentPreset = preset.name;
      this.feed = preset.feed;
      this.kill = preset.kill;
      this.diffusionA = preset.diffusionA;
      this.diffusionB = preset.diffusionB;
      
      if (this.scene) {
        this.scene.setReactionDiffusionParams({
          feed: preset.feed,
          kill: preset.kill,
          diffusionRateA: preset.diffusionA,
          diffusionRateB: preset.diffusionB
        });
      }
    },
    
    isPresetActive(preset) {
      return this.currentPreset === preset.name ||
        (Math.abs(this.feed - preset.feed) < 0.001 &&
         Math.abs(this.kill - preset.kill) < 0.001);
    },
    
    resetRD() {
      if (this.scene && this.scene.reactionDiffusion) {
        this.scene.reactionDiffusion.initialize();
      }
    },
    
    addSeedAtCenter() {
      if (this.scene && this.scene.reactionDiffusion) {
        const canvas = this.scene.gpuContext.canvas;
        this.scene.addRDSeed(canvas.width / 2, canvas.height / 2, 30);
      }
    }
  }
};
</script>

<style lang='stylus'>
@import "./shared.styl";

.reaction-diffusion-panel {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  color: primary-text;
}

.toggle-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  color: secondary-text;
  font-weight: 600;
  
  &.on {
    background: accent-color;
    color: white;
  }
}

.rd-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-selector {
  margin-bottom: 10px;
  
  label {
    font-size: 11px;
    color: secondary-text;
    display: block;
    margin-bottom: 6px;
  }
}

.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.preset-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  color: secondary-text;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(100, 150, 255, 0.15);
  }
  
  &.active {
    background: accent-color;
    border-color: accent-color;
    color: white;
  }
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
  
  label {
    font-size: 11px;
    color: secondary-text;
    width: 90px;
    flex-shrink: 0;
  }
  
  input[type="range"] {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    
    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: accent-color;
      cursor: pointer;
    }
  }
  
  .value {
    font-size: 11px;
    color: primary-text;
    width: 60px;
    text-align: right;
    flex-shrink: 0;
    font-family: monospace;
  }
}

.action-buttons {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.reset-btn,
.seed-btn {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  color: primary-text;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(100, 150, 255, 0.15);
    border-color: accent-color;
  }
}

.info-box {
  margin-top: 12px;
  padding: 10px;
  background: rgba(100, 150, 255, 0.05);
  border-radius: 4px;
  border-left: 3px solid accent-color;
  
  p {
    margin: 0;
    font-size: 11px;
    color: secondary-text;
    line-height: 1.5;
  }
}

.disabled-message {
  text-align: center;
  padding: 10px;
  color: secondary-text;
  font-size: 12px;
}
</style>
