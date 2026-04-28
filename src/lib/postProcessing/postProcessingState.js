const defaultPostProcessingState = {
  enabled: false,
  
  bloom: {
    enabled: true,
    strength: 1.2,
    radius: 0.5,
    threshold: 0.7
  },
  
  vignette: {
    enabled: true,
    offset: 1.0,
    darkness: 1.2
  },
  
  chromaticAberration: {
    enabled: true,
    amount: 0.003
  },
  
  motionBlur: {
    enabled: false,
    intensity: 0.3
  },
  
  dof: {
    enabled: false,
    focus: 0.5,
    aperture: 0.02,
    maxblur: 0.01
  },
  
  fxaa: {
    enabled: true
  },
  
  colorCorrection: {
    enabled: false,
    brightness: 1.0,
    contrast: 1.0,
    saturation: 1.0,
    gamma: 1.0
  }
};

let currentState = JSON.parse(JSON.stringify(defaultPostProcessingState));

function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export default {
  getState() {
    return currentState;
  },
  
  setState(newState) {
    currentState = { ...currentState, ...newState };
  },
  
  updateState(updates) {
    currentState = deepMerge(currentState, updates);
  },
  
  reset() {
    currentState = JSON.parse(JSON.stringify(defaultPostProcessingState));
  },
  
  getDefault() {
    return JSON.parse(JSON.stringify(defaultPostProcessingState));
  }
};
