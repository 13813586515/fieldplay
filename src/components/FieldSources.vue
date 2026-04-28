<template>
  <div class="field-sources-panel" v-if="isWebGPU">
    <div class="panel-header">
      <h3>Field Sources</h3>
      <button @click="addNewSource" class="add-btn">+ Add</button>
    </div>
    
    <div class="field-source-list" v-if="fieldSources.length > 0">
      <div 
        v-for="source in fieldSources" 
        :key="source.id"
        class="field-source-item"
        :class="{ 
          'active': selectedSourceId === source.id,
          'disabled': !source.enabled 
        }"
        @click="selectSource(source.id)"
      >
        <div class="source-header">
          <span class="source-type" :class="source.type">{{ getSourceTypeName(source.type) }}</span>
          <button 
            @click.stop="toggleSource(source.id)" 
            class="toggle-btn"
            :class="{ 'on': source.enabled }"
          >
            {{ source.enabled ? 'ON' : 'OFF' }}
          </button>
        </div>
        
        <div class="source-controls" v-if="selectedSourceId === source.id">
          <div class="control-group">
            <label>Strength</label>
            <input 
              type="range" 
              :value="source.strength" 
              @input="updateSource(source.id, 'strength', parseFloat($event.target.value))"
              min="-5" 
              max="5" 
              step="0.1"
            />
            <span class="value">{{ source.strength.toFixed(2) }}</span>
          </div>
          
          <div class="control-group">
            <label>Radius</label>
            <input 
              type="range" 
              :value="source.radius" 
              @input="updateSource(source.id, 'radius', parseFloat($event.target.value))"
              min="0.01" 
              max="3" 
              step="0.01"
            />
            <span class="value">{{ source.radius.toFixed(2) }}</span>
          </div>
          
          <div class="control-group" v-if="source.type === 'vortex'">
            <label>Rotation</label>
            <input 
              type="range" 
              :value="source.rotation" 
              @input="updateSource(source.id, 'rotation', parseFloat($event.target.value))"
              min="-2" 
              max="2" 
              step="0.1"
            />
            <span class="value">{{ source.rotation.toFixed(2) }}</span>
          </div>
          
          <div class="control-group" v-if="source.type === 'uniformFlow'">
            <label>Angle</label>
            <input 
              type="range" 
              :value="Math.atan2(source.directionY, source.directionX) * 180 / Math.PI" 
              @input="updateDirection(source.id, parseFloat($event.target.value))"
              min="-180" 
              max="180" 
              step="5"
            />
            <span class="value">{{ Math.round(Math.atan2(source.directionY, source.directionX) * 180 / Math.PI) }}°</span>
          </div>
          
          <button @click.stop="removeSource(source.id)" class="remove-btn">Remove</button>
        </div>
      </div>
    </div>
    
    <div class="empty-message" v-else>
      <p>No field sources. Click "Add" to create one.</p>
    </div>
    
    <div class="source-type-selector" v-if="showTypeSelector">
      <div class="selector-backdrop" @click="showTypeSelector = false"></div>
      <div class="selector-content">
        <h4>Select Source Type</h4>
        <div class="type-options">
          <button @click="createSource('attractor')" class="type-btn attractor">
            <span class="icon">⊕</span>
            <span class="label">Attractor</span>
            <span class="desc">Pulls particles inward</span>
          </button>
          <button @click="createSource('repeller')" class="type-btn repeller">
            <span class="icon">⊖</span>
            <span class="label">Repeller</span>
            <span class="desc">Pushes particles outward</span>
          </button>
          <button @click="createSource('vortex')" class="type-btn vortex">
            <span class="icon">⟲</span>
            <span class="label">Vortex</span>
            <span class="desc">Spiral motion</span>
          </button>
          <button @click="createSource('uniformFlow')" class="type-btn uniformFlow">
            <span class="icon">⇒</span>
            <span class="label">Uniform Flow</span>
            <span class="desc">Constant direction</span>
          </button>
          <button @click="createSource('dipole')" class="type-btn dipole">
            <span class="icon">⟷</span>
            <span class="label">Dipole</span>
            <span class="desc">Flow around obstacle</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { reactive, watch } from 'vue';
import bus from '../lib/bus';

const FieldSourceTypes = {
  ATTRACTOR: 'attractor',
  REPELLER: 'repeller',
  VORTEX: 'vortex',
  UNIFORM_FLOW: 'uniformFlow',
  DIPOLE: 'dipole'
};

export default {
  name: 'FieldSources',
  props: {
    scene: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      fieldSources: [],
      selectedSourceId: null,
      showTypeSelector: false,
      isWebGPU: false
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
      if (this.isWebGPU && scene.fieldSources) {
        this.fieldSources = scene.fieldSources.getAllSources();
      }
    },
    
    addNewSource() {
      this.showTypeSelector = true;
    },
    
    createSource(type) {
      if (!this.scene) return;
      
      const bbox = this.scene.getBoundingBox();
      const centerX = (bbox.minX + bbox.maxX) / 2;
      const centerY = (bbox.minY + bbox.maxY) / 2;
      
      const defaults = {
        [FieldSourceTypes.ATTRACTOR]: { strength: 0.5, radius: 0.3 },
        [FieldSourceTypes.REPELLER]: { strength: 0.5, radius: 0.3 },
        [FieldSourceTypes.VORTEX]: { strength: 1.0, radius: 0.2, rotation: 0.3 },
        [FieldSourceTypes.UNIFORM_FLOW]: { strength: 0.3, directionX: 1, directionY: 0 },
        [FieldSourceTypes.DIPOLE]: { strength: 0.5, radius: 0.3, directionX: 1, directionY: 0 }
      };
      
      const options = {
        x: centerX + (Math.random() - 0.5) * 2,
        y: centerY + (Math.random() - 0.5) * 2,
        ...defaults[type]
      };
      
      const source = this.scene.addFieldSource(type, options);
      if (source) {
        this.fieldSources = this.scene.fieldSources.getAllSources();
        this.selectedSourceId = source.id;
      }
      
      this.showTypeSelector = false;
    },
    
    selectSource(id) {
      this.selectedSourceId = this.selectedSourceId === id ? null : id;
    },
    
    updateSource(id, property, value) {
      if (!this.scene) return;
      const source = this.scene.fieldSources.getSource(id);
      if (source) {
        source[property] = value;
      }
    },
    
    updateDirection(id, angleDegrees) {
      if (!this.scene) return;
      const source = this.scene.fieldSources.getSource(id);
      if (source) {
        const angleRad = angleDegrees * Math.PI / 180;
        source.directionX = Math.cos(angleRad);
        source.directionY = Math.sin(angleRad);
      }
    },
    
    toggleSource(id) {
      if (!this.scene) return;
      const source = this.scene.fieldSources.getSource(id);
      if (source) {
        source.toggle();
      }
    },
    
    removeSource(id) {
      if (!this.scene) return;
      this.scene.removeFieldSource(id);
      this.fieldSources = this.scene.fieldSources.getAllSources();
      if (this.selectedSourceId === id) {
        this.selectedSourceId = null;
      }
    },
    
    getSourceTypeName(type) {
      const names = {
        attractor: 'Attractor',
        repeller: 'Repeller',
        vortex: 'Vortex',
        uniformFlow: 'Flow',
        dipole: 'Dipole'
      };
      return names[type] || type;
    }
  }
};
</script>

<style lang='stylus'>
@import "./shared.styl";

.field-sources-panel {
  margin-top: 10px;
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

.add-btn {
  background: accent-color;
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  
  &:hover {
    background: accent-color-light;
  }
}

.field-source-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-source-item {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  
  &.active {
    border-color: accent-color;
    background: rgba(100, 150, 255, 0.1);
  }
  
  &.disabled {
    opacity: 0.5;
  }
}

.source-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.source-type {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  
  &.attractor { background: rgba(100, 255, 100, 0.2); color: #90EE90; }
  &.repeller { background: rgba(255, 100, 100, 0.2); color: #FF9999; }
  &.vortex { background: rgba(200, 100, 255, 0.2); color: #CC99FF; }
  &.uniformFlow { background: rgba(100, 200, 255, 0.2); color: #99CCFF; }
  &.dipole { background: rgba(255, 200, 100, 0.2); color: #FFCC99; }
}

.toggle-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  color: secondary-text;
  
  &.on {
    background: accent-color;
    color: white;
  }
}

.source-controls {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.control-group {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
  gap: 8px;
  
  label {
    font-size: 11px;
    color: secondary-text;
    width: 60px;
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
    width: 50px;
    text-align: right;
    flex-shrink: 0;
    font-family: monospace;
  }
}

.remove-btn {
  background: rgba(255, 80, 80, 0.2);
  color: #FF8888;
  border: 1px solid rgba(255, 80, 80, 0.3);
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  margin-top: 4px;
  
  &:hover {
    background: rgba(255, 80, 80, 0.3);
  }
}

.empty-message {
  text-align: center;
  padding: 20px;
  color: secondary-text;
  font-size: 12px;
}

.source-type-selector {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.selector-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
}

.selector-content {
  position: relative;
  background: window-background;
  border: 1px solid primary-border;
  border-radius: 8px;
  padding: 20px;
  max-width: 400px;
  width: 90%;
}

.selector-content h4 {
  margin: 0 0 15px 0;
  color: primary-text;
  font-size: 14px;
}

.type-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.type-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 15px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(100, 150, 255, 0.15);
    border-color: accent-color;
  }
  
  .icon {
    font-size: 24px;
    display: block;
    margin-bottom: 8px;
  }
  
  .label {
    font-size: 13px;
    font-weight: 600;
    color: primary-text;
    display: block;
  }
  
  .desc {
    font-size: 11px;
    color: secondary-text;
    display: block;
    margin-top: 4px;
  }
  
  &.attractor .icon { color: #90EE90; }
  &.repeller .icon { color: #FF9999; }
  &.vortex .icon { color: #CC99FF; }
  &.uniformFlow .icon { color: #99CCFF; }
  &.dipole .icon { color: #FFCC99; }
}
</style>
