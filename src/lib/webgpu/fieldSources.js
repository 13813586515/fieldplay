export const FieldSourceTypes = {
  ATTRACTOR: 'attractor',
  REPELLER: 'repeller',
  VORTEX: 'vortex',
  UNIFORM_FLOW: 'uniformFlow',
  DIPOLE: 'dipole'
};

export function createFieldSource(type, options = {}) {
  const id = options.id || `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const source = {
    id,
    type,
    x: options.x || 0,
    y: options.y || 0,
    strength: options.strength || 1.0,
    radius: options.radius || 0.5,
    enabled: options.enabled !== undefined ? options.enabled : true,
    
    angle: options.angle || 0,
    directionX: options.directionX || 1,
    directionY: options.directionY || 0,
    rotation: options.rotation || 1.0,
    
    getType() { return this.type; },
    setPosition(x, y) {
      this.x = x;
      this.y = y;
    },
    setStrength(strength) {
      this.strength = strength;
    },
    setRadius(radius) {
      this.radius = Math.max(0.01, radius);
    },
    toggle() {
      this.enabled = !this.enabled;
    },
    toUniform() {
      return {
        type: getTypeIndex(this.type),
        x: this.x,
        y: this.y,
        strength: this.enabled ? this.strength : 0,
        radius: this.radius,
        angle: this.angle,
        directionX: this.directionX,
        directionY: this.directionY,
        rotation: this.rotation
      };
    }
  };

  return source;
}

function getTypeIndex(type) {
  switch (type) {
    case FieldSourceTypes.ATTRACTOR: return 0;
    case FieldSourceTypes.REPELLER: return 1;
    case FieldSourceTypes.VORTEX: return 2;
    case FieldSourceTypes.UNIFORM_FLOW: return 3;
    case FieldSourceTypes.DIPOLE: return 4;
    default: return 0;
  }
}

export function createFieldSourceManager() {
  const sources = [];
  const maxSources = 16;

  const api = {
    sources,
    maxSources,
    
    addSource(type, options = {}) {
      if (sources.length >= maxSources) {
        console.warn(`Maximum field sources (${maxSources}) reached`);
        return null;
      }
      const source = createFieldSource(type, options);
      sources.push(source);
      return source;
    },
    
    removeSource(id) {
      const index = sources.findIndex(s => s.id === id);
      if (index >= 0) {
        sources.splice(index, 1);
        return true;
      }
      return false;
    },
    
    getSource(id) {
      return sources.find(s => s.id === id);
    },
    
    getAllSources() {
      return [...sources];
    },
    
    clear() {
      sources.length = 0;
    },
    
    toUniformArray() {
      const uniforms = [];
      for (let i = 0; i < maxSources; i++) {
        if (i < sources.length) {
          uniforms.push(sources[i].toUniform());
        } else {
          uniforms.push({
            type: 0,
            x: 0, y: 0,
            strength: 0,
            radius: 0,
            angle: 0,
            directionX: 0, directionY: 0,
            rotation: 0
          });
        }
      }
      return uniforms;
    },
    
    toFloat32Array() {
      const uniforms = this.toUniformArray();
      const data = new Float32Array(maxSources * 9);
      
      for (let i = 0; i < maxSources; i++) {
        const u = uniforms[i];
        const offset = i * 9;
        data[offset + 0] = u.type;
        data[offset + 1] = u.x;
        data[offset + 2] = u.y;
        data[offset + 3] = u.strength;
        data[offset + 4] = u.radius;
        data[offset + 5] = u.angle;
        data[offset + 6] = u.directionX;
        data[offset + 7] = u.directionY;
        data[offset + 8] = u.rotation;
      }
      
      return data;
    },
    
    getActiveCount() {
      return sources.length;
    }
  };

  return api;
}

export const FieldSourceShaders = {
  struct: `
struct FieldSource {
  type: f32,
  position: vec2f,
  strength: f32,
  radius: f32,
  angle: f32,
  direction: vec2f,
  rotation: f32,
};
`,
  
  computeVelocity: `
fn computeFieldSourceVelocity(pos: vec2f, source: FieldSource) -> vec2f {
  if (source.strength == 0.0) {
    return vec2f(0.0);
  }

  let type = i32(source.type);
  let dx = pos.x - source.position.x;
  let dy = pos.y - source.position.y;
  let distSq = dx * dx + dy * dy;
  let dist = sqrt(distSq);
  
  var velocity = vec2f(0.0);
  
  if (type == 0) {
    if (dist > 0.001) {
      let factor = source.strength / max(distSq, source.radius * source.radius);
      velocity = vec2f(-dx, -dy) * factor;
    }
  } else if (type == 1) {
    if (dist > 0.001) {
      let factor = source.strength / max(distSq, source.radius * source.radius);
      velocity = vec2f(dx, dy) * factor;
    }
  } else if (type == 2) {
    if (dist > 0.001) {
      let factor = source.strength / max(dist, source.radius);
      let tangential = vec2f(-dy, dx) * factor;
      let radial = vec2f(-dx, -dy) * (factor * source.rotation);
      velocity = tangential + radial;
    }
  } else if (type == 3) {
    let dir = normalize(source.direction);
    velocity = dir * source.strength;
  } else if (type == 4) {
    if (dist > 0.001) {
      let dir = normalize(source.direction);
      let dotProduct = dx * dir.x + dy * dir.y;
      let factor = source.strength / (distSq * dist);
      velocity = (2.0 * dotProduct * vec2f(dx, dy) - distSq * dir) * factor;
    }
  }
  
  return velocity;
}

fn sumFieldSources(pos: vec2f, sources: array<FieldSource, 16>) -> vec2f {
  var totalVelocity = vec2f(0.0);
  for (var i: u32 = 0; i < 16; i++) {
    totalVelocity += computeFieldSourceVelocity(pos, sources[i]);
  }
  return totalVelocity;
}
`
};
