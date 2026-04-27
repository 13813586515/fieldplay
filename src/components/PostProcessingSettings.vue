<template>
  <div class='post-processing-settings'>
    <div class='title'>
      Visual Effects
      <a class='toggle-link' href='#' @click.prevent='expanded = !expanded'>
        {{ expanded ? '▲ Collapse' : '▼ Expand' }}
      </a>
    </div>
    
    <div v-if='expanded' class='settings-content'>
      <div class='section'>
        <div class='section-title'>Post-Processing</div>
        
        <div class='row'>
          <div class='col'>Enable Effects</div>
          <div class='col'>
            <input type='checkbox' v-model='postProcessingEnabled' @change='onPostProcessingToggle'>
          </div>
        </div>
      </div>
      
      <div v-if='postProcessingEnabled' class='section'>
        <div class='section-title'>Bloom (辉光)</div>
        
        <div class='row'>
          <div class='col'>Enable</div>
          <div class='col'>
            <input type='checkbox' v-model='bloomEnabled' @change='updateBloom'>
          </div>
        </div>
        
        <div v-if='bloomEnabled' class='row'>
          <div class='col'>Strength</div>
          <div class='col'>
            <input type='range' min='0' max='3' step='0.1' v-model='bloomStrength' @input='updateBloom'>
            <span class='value'>{{ bloomStrength.toFixed(1) }}</span>
          </div>
        </div>
        
        <div v-if='bloomEnabled' class='row'>
          <div class='col'>Radius</div>
          <div class='col'>
            <input type='range' min='0.1' max='2' step='0.1' v-model='bloomRadius' @input='updateBloom'>
            <span class='value'>{{ bloomRadius.toFixed(1) }}</span>
          </div>
        </div>
        
        <div v-if='bloomEnabled' class='row'>
          <div class='col'>Threshold</div>
          <div class='col'>
            <input type='range' min='0' max='1' step='0.05' v-model='bloomThreshold' @input='updateBloom'>
            <span class='value'>{{ bloomThreshold.toFixed(2) }}</span>
          </div>
        </div>
      </div>
      
      <div v-if='postProcessingEnabled' class='section'>
        <div class='section-title'>Vignette (暗角)</div>
        
        <div class='row'>
          <div class='col'>Enable</div>
          <div class='col'>
            <input type='checkbox' v-model='vignetteEnabled' @change='updateVignette'>
          </div>
        </div>
        
        <div v-if='vignetteEnabled' class='row'>
          <div class='col'>Offset</div>
          <div class='col'>
            <input type='range' min='0.1' max='2' step='0.1' v-model='vignetteOffset' @input='updateVignette'>
            <span class='value'>{{ vignetteOffset.toFixed(1) }}</span>
          </div>
        </div>
        
        <div v-if='vignetteEnabled' class='row'>
          <div class='col'>Darkness</div>
          <div class='col'>
            <input type='range' min='0' max='2' step='0.1' v-model='vignetteDarkness' @input='updateVignette'>
            <span class='value'>{{ vignetteDarkness.toFixed(1) }}</span>
          </div>
        </div>
      </div>
      
      <div v-if='postProcessingEnabled' class='section'>
        <div class='section-title'>Chromatic Aberration (色差)</div>
        
        <div class='row'>
          <div class='col'>Enable</div>
          <div class='col'>
            <input type='checkbox' v-model='chromaticEnabled' @change='updateChromatic'>
          </div>
        </div>
        
        <div v-if='chromaticEnabled' class='row'>
          <div class='col'>Amount</div>
          <div class='col'>
            <input type='range' min='0' max='0.02' step='0.001' v-model='chromaticAmount' @input='updateChromatic'>
            <span class='value'>{{ chromaticAmount.toFixed(3) }}</span>
          </div>
        </div>
      </div>
      
      <div v-if='postProcessingEnabled' class='section'>
        <div class='section-title'>FXAA (抗锯齿)</div>
        
        <div class='row'>
          <div class='col'>Enable</div>
          <div class='col'>
            <input type='checkbox' v-model='fxaaEnabled' @change='updateFXAA'>
          </div>
        </div>
      </div>
      
      <div class='section'>
        <div class='section-title'>Particle Trails (粒子拖尾)</div>
        
        <div class='row'>
          <div class='col'>Enable</div>
          <div class='col'>
            <input type='checkbox' v-model='trailsEnabled' @change='onTrailsToggle'>
          </div>
        </div>
        
        <div v-if='trailsEnabled' class='row'>
          <div class='col'>Opacity</div>
          <div class='col'>
            <input type='range' min='0.1' max='1' step='0.05' v-model='trailsOpacity' @input='updateTrails'>
            <span class='value'>{{ trailsOpacity.toFixed(2) }}</span>
          </div>
        </div>
        
        <div v-if='trailsEnabled' class='row'>
          <div class='col'>Width</div>
          <div class='col'>
            <input type='range' min='0.5' max='5' step='0.5' v-model='trailsWidth' @input='updateTrails'>
            <span class='value'>{{ trailsWidth.toFixed(1) }}</span>
          </div>
        </div>
      </div>
      
      <div class='section'>
        <div class='section-title'>Topology Visualization (拓扑特征)</div>
        
        <div class='row'>
          <div class='col'>Enable</div>
          <div class='col'>
            <input type='checkbox' v-model='topologyEnabled' @change='onTopologyToggle'>
          </div>
        </div>
        
        <div v-if='topologyEnabled' class='row'>
          <div class='col'>Show Critical Points</div>
          <div class='col'>
            <input type='checkbox' v-model='showCriticalPoints' @change='updateTopology'>
          </div>
        </div>
        
        <div v-if='topologyEnabled' class='row'>
          <div class='col'>Show Separatrices</div>
          <div class='col'>
            <input type='checkbox' v-model='showSeparatrices' @change='updateTopology'>
          </div>
        </div>
        
        <div v-if='topologyEnabled && criticalPoints.length > 0' class='critical-points-info'>
          <div class='info-title'>Detected Critical Points ({{ criticalPoints.length }}):</div>
          <div class='point-list'>
            <div v-for='(point, idx) in criticalPoints' :key='idx' class='point-item'>
              <span class='point-color' :style='{backgroundColor: pointColorToCSS(point.color)}'></span>
              <span class='point-type'>{{ point.typeName }}</span>
              <span class='point-pos'>({{ point.x.toFixed(2) }}, {{ point.y.toFixed(2) }})</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class='section reset-section'>
        <a href='#' @click.prevent='resetAll' class='reset-link'>Reset All Effects to Default</a>
      </div>
    </div>
  </div>
</template>

<script>
import bus from '../lib/bus.js';
import postProcessingState from '../lib/postProcessing/postProcessingState.js';

const defaultState = postProcessingState.getDefault();

export default {
  name: 'PostProcessingSettings',
  props: ['scene'],
  data() {
    return {
      expanded: false,
      
      postProcessingEnabled: defaultState.enabled,
      
      bloomEnabled: defaultState.bloom.enabled,
      bloomStrength: defaultState.bloom.strength,
      bloomRadius: defaultState.bloom.radius,
      bloomThreshold: defaultState.bloom.threshold,
      
      vignetteEnabled: defaultState.vignette.enabled,
      vignetteOffset: defaultState.vignette.offset,
      vignetteDarkness: defaultState.vignette.darkness,
      
      chromaticEnabled: defaultState.chromaticAberration.enabled,
      chromaticAmount: defaultState.chromaticAberration.amount,
      
      fxaaEnabled: defaultState.fxaa.enabled,
      
      trailsEnabled: false,
      trailsOpacity: 0.8,
      trailsWidth: 1.5,
      
      topologyEnabled: false,
      showCriticalPoints: true,
      showSeparatrices: true,
      
      criticalPoints: [],
      
      isInitialized: false
    };
  },
  mounted() {
    bus.on('scene-ready', this.onSceneReady, this);
    this.refreshInterval = setInterval(() => this.refreshCriticalPoints(), 1000);
    
    if (this.scene && this.scene.getPostProcessingState) {
      this.isInitialized = true;
      this.syncWithScene();
    }
  },
  beforeUnmount() {
    bus.off('scene-ready', this.onSceneReady, this);
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  },
  methods: {
    syncWithScene() {
      if (!this.scene) return;
      
      if (this.scene.getPostProcessingEnabled) {
        this.postProcessingEnabled = this.scene.getPostProcessingEnabled();
      }
      if (this.scene.getTrailsEnabled) {
        this.trailsEnabled = this.scene.getTrailsEnabled();
      }
      if (this.scene.getTopologyEnabled) {
        this.topologyEnabled = this.scene.getTopologyEnabled();
      }
      
      if (this.scene.getPostProcessingState) {
        const state = this.scene.getPostProcessingState();
        if (state) {
          this.bloomEnabled = state.bloom.enabled;
          this.bloomStrength = state.bloom.strength;
          this.bloomRadius = state.bloom.radius;
          this.bloomThreshold = state.bloom.threshold;
          
          this.vignetteEnabled = state.vignette.enabled;
          this.vignetteOffset = state.vignette.offset;
          this.vignetteDarkness = state.vignette.darkness;
          
          this.chromaticEnabled = state.chromaticAberration.enabled;
          this.chromaticAmount = state.chromaticAberration.amount;
          
          this.fxaaEnabled = state.fxaa.enabled;
        }
      }
      
      if (this.trailsEnabled && this.scene.getTrailsOpacity) {
        this.trailsOpacity = this.scene.getTrailsOpacity();
      }
      if (this.trailsEnabled && this.scene.getTrailsWidth) {
        this.trailsWidth = this.scene.getTrailsWidth();
      }
      
      if (this.topologyEnabled && this.scene.getTopologyShowCriticalPoints) {
        this.showCriticalPoints = this.scene.getTopologyShowCriticalPoints();
      }
      if (this.topologyEnabled && this.scene.getTopologyShowSeparatrices) {
        this.showSeparatrices = this.scene.getTopologyShowSeparatrices();
      }
      
      this.isInitialized = true;
    },
    
    onSceneReady(scene) {
      if (!scene) return;
      
      this.postProcessingEnabled = scene.getPostProcessingEnabled ? scene.getPostProcessingEnabled() : this.postProcessingEnabled;
      this.trailsEnabled = scene.getTrailsEnabled ? scene.getTrailsEnabled() : this.trailsEnabled;
      this.topologyEnabled = scene.getTopologyEnabled ? scene.getTopologyEnabled() : this.topologyEnabled;
      
      const state = scene.getPostProcessingState ? scene.getPostProcessingState() : null;
      if (state) {
        this.bloomEnabled = state.bloom.enabled;
        this.bloomStrength = state.bloom.strength;
        this.bloomRadius = state.bloom.radius;
        this.bloomThreshold = state.bloom.threshold;
        
        this.vignetteEnabled = state.vignette.enabled;
        this.vignetteOffset = state.vignette.offset;
        this.vignetteDarkness = state.vignette.darkness;
        
        this.chromaticEnabled = state.chromaticAberration.enabled;
        this.chromaticAmount = state.chromaticAberration.amount;
        
        this.fxaaEnabled = state.fxaa.enabled;
      }
      
      if (this.trailsEnabled && scene.getTrailsOpacity) {
        this.trailsOpacity = scene.getTrailsOpacity();
      }
      if (this.trailsEnabled && scene.getTrailsWidth) {
        this.trailsWidth = scene.getTrailsWidth();
      }
      
      if (this.topologyEnabled && scene.getTopologyShowCriticalPoints) {
        this.showCriticalPoints = scene.getTopologyShowCriticalPoints();
      }
      if (this.topologyEnabled && scene.getTopologyShowSeparatrices) {
        this.showSeparatrices = scene.getTopologyShowSeparatrices();
      }
      
      this.isInitialized = true;
    },
    
    onPostProcessingToggle() {
      if (this.scene) {
        this.scene.setPostProcessingEnabled(this.postProcessingEnabled);
        this.updateAllEffects();
      }
    },
    
    updateBloom() {
      if (this.scene) {
        this.scene.updatePostProcessingState({
          bloom: {
            enabled: this.bloomEnabled,
            strength: this.bloomStrength,
            radius: this.bloomRadius,
            threshold: this.bloomThreshold
          }
        });
      }
    },
    
    updateVignette() {
      if (this.scene) {
        this.scene.updatePostProcessingState({
          vignette: {
            enabled: this.vignetteEnabled,
            offset: this.vignetteOffset,
            darkness: this.vignetteDarkness
          }
        });
      }
    },
    
    updateChromatic() {
      if (this.scene) {
        this.scene.updatePostProcessingState({
          chromaticAberration: {
            enabled: this.chromaticEnabled,
            amount: this.chromaticAmount
          }
        });
      }
    },
    
    updateFXAA() {
      if (this.scene) {
        this.scene.updatePostProcessingState({
          fxaa: {
            enabled: this.fxaaEnabled
          }
        });
      }
    },
    
    updateAllEffects() {
      this.updateBloom();
      this.updateVignette();
      this.updateChromatic();
      this.updateFXAA();
    },
    
    onTrailsToggle() {
      if (this.scene) {
        this.scene.setTrailsEnabled(this.trailsEnabled);
      }
    },
    
    updateTrails() {
      if (this.scene) {
        this.scene.setTrailsOpacity(this.trailsOpacity);
        this.scene.setTrailsWidth(this.trailsWidth);
      }
    },
    
    onTopologyToggle() {
      if (this.scene) {
        this.scene.setTopologyEnabled(this.topologyEnabled);
      }
    },
    
    updateTopology() {
      if (this.scene) {
        this.scene.setTopologyShowCriticalPoints(this.showCriticalPoints);
        this.scene.setTopologyShowSeparatrices(this.showSeparatrices);
      }
    },
    
    refreshCriticalPoints() {
      if (this.scene && this.topologyEnabled) {
        this.criticalPoints = this.scene.getCriticalPoints() || [];
      } else {
        this.criticalPoints = [];
      }
    },
    
    pointColorToCSS(color) {
      const [r, g, b, a] = color;
      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
    },
    
    resetAll() {
      postProcessingState.reset();
      
      this.postProcessingEnabled = true;
      
      this.bloomEnabled = true;
      this.bloomStrength = 1.2;
      this.bloomRadius = 0.5;
      this.bloomThreshold = 0.7;
      
      this.vignetteEnabled = true;
      this.vignetteOffset = 1.0;
      this.vignetteDarkness = 1.2;
      
      this.chromaticEnabled = true;
      this.chromaticAmount = 0.003;
      
      this.fxaaEnabled = true;
      
      this.trailsEnabled = false;
      this.trailsOpacity = 0.8;
      this.trailsWidth = 1.5;
      
      this.topologyEnabled = false;
      this.showCriticalPoints = true;
      this.showSeparatrices = true;
      
      if (this.scene) {
        this.scene.setPostProcessingEnabled(true);
        this.scene.setTrailsEnabled(false);
        this.scene.setTopologyEnabled(false);
        this.updateAllEffects();
      }
    }
  }
};
</script>

<style lang='stylus'>
@import "./shared.styl";

.post-processing-settings {
  color: secondary-text;
  background: window-background;
  margin-top: 10px;
  padding: 10px;
  border-top: 1px solid secondary-text;
  
  .title {
    color: primary-text;
    font-size: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    .toggle-link {
      font-size: 12px;
      color: help-text-color;
      text-decoration: none;
      
      &:hover {
        color: primary-text;
      }
    }
  }
  
  .settings-content {
    margin-top: 10px;
  }
  
  .section {
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    
    &:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
  }
  
  .section-title {
    color: primary-text;
    font-size: 14px;
    margin-bottom: 8px;
  }
  
  .row {
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-top: 5px;
    margin-bottom: 5px;
    
    .col {
      flex: 1;
      display: flex;
      align-items: center;
      
      &:first-child {
        min-width: 120px;
      }
    }
    
    input[type='range'] {
      flex: 1;
      margin-right: 10px;
      height: 4px;
      -webkit-appearance: none;
      background: #333;
      border-radius: 2px;
      outline: none;
      
      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        background: primary-text;
        border-radius: 50%;
        cursor: pointer;
      }
    }
    
    .value {
      font-size: 12px;
      color: help-text-color;
      min-width: 50px;
      text-align: right;
    }
    
    input[type='checkbox'] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }
  }
  
  .critical-points-info {
    margin-top: 10px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    
    .info-title {
      font-size: 12px;
      color: help-text-color;
      margin-bottom: 6px;
    }
    
    .point-list {
      max-height: 150px;
      overflow-y: auto;
    }
    
    .point-item {
      display: flex;
      align-items: center;
      font-size: 11px;
      margin-bottom: 4px;
      
      .point-color {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-right: 8px;
        border: 1px solid rgba(255, 255, 255, 0.5);
      }
      
      .point-type {
        color: primary-text;
        margin-right: 8px;
        min-width: 100px;
      }
      
      .point-pos {
        color: help-text-color;
        font-family: monospace;
      }
    }
  }
  
  .reset-section {
    text-align: center;
    padding-top: 5px;
    
    .reset-link {
      color: #ff6b6b;
      text-decoration: none;
      font-size: 13px;
      
      &:hover {
        text-decoration: underline;
      }
    }
  }
}
</style>
