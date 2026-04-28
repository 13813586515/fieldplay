<template>
  <div class="field-source-overlay" v-if="isWebGPU && fieldSources.length > 0">
    <div 
      v-for="source in fieldSources" 
      :key="source.id"
      class="field-source-marker"
      :class="[source.type, { 'disabled': !source.enabled }]"
      :style="getSourceStyle(source)"
      @mousedown="startDrag(source, $event)"
      @touchstart="startDrag(source, $event)"
    >
      <div class="marker-icon">
        <span v-if="source.type === 'attractor'">⊕</span>
        <span v-else-if="source.type === 'repeller'">⊖</span>
        <span v-else-if="source.type === 'vortex'">⟲</span>
        <span v-else-if="source.type === 'uniformFlow'">⇒</span>
        <span v-else-if="source.type === 'dipole'">⟷</span>
      </div>
      <div class="marker-info" v-if="selectedSourceId === source.id">
        <span class="source-label">{{ getSourceTypeName(source.type) }}</span>
        <span class="source-strength">Strength: {{ source.strength.toFixed(2) }}</span>
      </div>
      <div 
        class="influence-circle"
        :style="getInfluenceCircleStyle(source)"
      ></div>
    </div>
    
    <div 
      v-if="isDragging" 
      class="drag-hint"
    >
      Release to place | Press ESC to cancel
    </div>
  </div>
</template>

<script>
import bus from '../lib/bus';
import { reactive } from 'vue';

export default {
  name: 'FieldSourceOverlay',
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
      isDragging: false,
      dragSource: null,
      isWebGPU: false,
      canvas: null
    };
  },
  mounted() {
    bus.on('scene-ready', this.onSceneReady, this);
    if (window.scene) {
      this.onSceneReady(window.scene);
    }
    
    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.onDragEnd);
    document.addEventListener('touchmove', this.onDragMove);
    document.addEventListener('touchend', this.onDragEnd);
    document.addEventListener('keydown', this.onKeyDown);
  },
  beforeUnmount() {
    bus.off('scene-ready', this.onSceneReady, this);
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
    document.removeEventListener('touchmove', this.onDragMove);
    document.removeEventListener('touchend', this.onDragEnd);
    document.removeEventListener('keydown', this.onKeyDown);
  },
  methods: {
    onSceneReady(scene) {
      this.scene = scene;
      this.isWebGPU = scene && scene.isWebGPU;
      if (this.isWebGPU && scene.fieldSources) {
        this.updateFieldSources();
        this.startPolling();
      }
      this.canvas = scene && scene.gpuContext ? scene.gpuContext.canvas : null;
    },
    
    startPolling() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => {
        this.updateFieldSources();
      }, 100);
    },
    
    updateFieldSources() {
      if (this.scene && this.scene.fieldSources) {
        this.fieldSources = this.scene.fieldSources.getAllSources();
      }
    },
    
    getSourceStyle(source) {
      if (!this.canvas || !this.scene) return {};
      
      const bbox = this.scene.getBoundingBox();
      const canvasWidth = this.canvas.width;
      const canvasHeight = this.canvas.height;
      
      const bboxWidth = bbox.maxX - bbox.minX;
      const bboxHeight = bbox.maxY - bbox.minY;
      
      const normalizedX = (source.x - bbox.minX) / bboxWidth;
      const normalizedY = (source.y - bbox.minY) / bboxHeight;
      
      const pixelX = normalizedX * canvasWidth;
      const pixelY = (1 - normalizedY) * canvasHeight;
      
      let transform = '';
      if (source.type === 'uniformFlow' || source.type === 'dipole') {
        const angle = Math.atan2(source.directionY, source.directionX) * 180 / Math.PI;
        transform = `rotate(${angle}deg)`;
      }
      
      return {
        left: `${pixelX}px`,
        top: `${pixelY}px`,
        transform
      };
    },
    
    getInfluenceCircleStyle(source) {
      if (!this.canvas || !this.scene) return {};
      
      const bbox = this.scene.getBoundingBox();
      const canvasWidth = this.canvas.width;
      const canvasHeight = this.canvas.height;
      
      const bboxWidth = bbox.maxX - bbox.minX;
      const avgDimension = (canvasWidth / bboxWidth + canvasHeight / (bbox.maxY - bbox.minY)) / 2;
      
      const pixelRadius = source.radius * avgDimension;
      
      return {
        width: `${pixelRadius * 2}px`,
        height: `${pixelRadius * 2}px`,
        left: `-${pixelRadius}px`,
        top: `-${pixelRadius}px`
      };
    },
    
    getSourceTypeName(type) {
      const names = {
        attractor: 'Attractor',
        repeller: 'Repeller',
        vortex: 'Vortex',
        uniformFlow: 'Uniform Flow',
        dipole: 'Dipole'
      };
      return names[type] || type;
    },
    
    startDrag(source, event) {
      event.preventDefault();
      event.stopPropagation();
      
      this.isDragging = true;
      this.dragSource = source;
      this.selectedSourceId = source.id;
      
      this.dragStartPos = this.getEventPos(event);
    },
    
    onDragMove(event) {
      if (!this.isDragging || !this.dragSource) return;
      
      const pos = this.getEventPos(event);
      this.updateSourcePosition(pos);
    },
    
    onDragEnd(event) {
      if (!this.isDragging) return;
      
      this.isDragging = false;
      this.dragSource = null;
      
      if (this.scene) {
        bus.fire('field-source-moved');
      }
    },
    
    onKeyDown(event) {
      if (event.key === 'Escape' && this.isDragging) {
        this.isDragging = false;
        this.dragSource = null;
      }
    },
    
    getEventPos(event) {
      if (event.touches && event.touches.length > 0) {
        return { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }
      return { x: event.clientX, y: event.clientY };
    },
    
    updateSourcePosition(screenPos) {
      if (!this.canvas || !this.scene || !this.dragSource) return;
      
      const rect = this.canvas.getBoundingClientRect();
      const canvasX = screenPos.x - rect.left;
      const canvasY = screenPos.y - rect.top;
      
      const bbox = this.scene.getBoundingBox();
      const canvasWidth = this.canvas.width;
      const canvasHeight = this.canvas.height;
      
      const normalizedX = canvasX / canvasWidth;
      const normalizedY = 1 - (canvasY / canvasHeight);
      
      const bboxWidth = bbox.maxX - bbox.minX;
      const bboxHeight = bbox.maxY - bbox.minY;
      
      const worldX = normalizedX * bboxWidth + bbox.minX;
      const worldY = normalizedY * bboxHeight + bbox.minY;
      
      this.dragSource.setPosition(worldX, worldY);
    }
  }
};
</script>

<style lang='stylus' scoped>
@import "./shared.styl";

.field-source-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 100;
}

.field-source-marker {
  position: absolute;
  pointer-events: auto;
  cursor: grab;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translate(-50%, -50%);
  
  &:active {
    cursor: grabbing;
  }
  
  &.disabled {
    opacity: 0.4;
    pointer-events: none;
  }
  
  &.attractor {
    .marker-icon {
      background: rgba(100, 255, 100, 0.2);
      border-color: rgba(100, 255, 100, 0.6);
      color: #90EE90;
    }
    
    .influence-circle {
      border-color: rgba(100, 255, 100, 0.3);
      box-shadow: inset 0 0 20px rgba(100, 255, 100, 0.1);
    }
  }
  
  &.repeller {
    .marker-icon {
      background: rgba(255, 100, 100, 0.2);
      border-color: rgba(255, 100, 100, 0.6);
      color: #FF9999;
    }
    
    .influence-circle {
      border-color: rgba(255, 100, 100, 0.3);
      box-shadow: inset 0 0 20px rgba(255, 100, 100, 0.1);
    }
  }
  
  &.vortex {
    .marker-icon {
      background: rgba(200, 100, 255, 0.2);
      border-color: rgba(200, 100, 255, 0.6);
      color: #CC99FF;
    }
    
    .influence-circle {
      border-color: rgba(200, 100, 255, 0.3);
      box-shadow: inset 0 0 20px rgba(200, 100, 255, 0.1);
    }
  }
  
  &.uniformFlow {
    .marker-icon {
      background: rgba(100, 200, 255, 0.2);
      border-color: rgba(100, 200, 255, 0.6);
      color: #99CCFF;
    }
    
    .influence-circle {
      display: none;
    }
  }
  
  &.dipole {
    .marker-icon {
      background: rgba(255, 200, 100, 0.2);
      border-color: rgba(255, 200, 100, 0.6);
      color: #FFCC99;
    }
    
    .influence-circle {
      border-color: rgba(255, 200, 100, 0.3);
      box-shadow: inset 0 0 20px rgba(255, 200, 100, 0.1);
    }
  }
}

.marker-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  transition: transform 0.15s ease;
  
  &:hover {
    transform: scale(1.15);
  }
}

.influence-circle {
  position: absolute;
  border-radius: 50%;
  border: 1px dashed;
  pointer-events: none;
  opacity: 0.6;
}

.marker-info {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  padding: 6px 10px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: nowrap;
  
  .source-label {
    font-size: 11px;
    font-weight: 600;
    color: primary-text;
  }
  
  .source-strength {
    font-size: 10px;
    color: secondary-text;
    font-family: monospace;
  }
}

.drag-hint {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 12px;
  color: primary-text;
  pointer-events: auto;
}
</style>
