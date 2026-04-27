import glUtils from '../gl-utils';
import { encodeFloatRGBA, decodeFloatRGBA } from '../utils/floatPacking';

const TRAIL_LENGTH = 16;
const TEXTURE_UNIT_START = 20;

export default function createParticleTrails(ctx) {
  const { gl, canvasRect, framebuffer, bbox } = ctx;
  
  let trailTextures = [];
  let trailWriteIndex = 0;
  let particleStateResolution = 0;
  let numParticles = 0;
  
  let trailPositionProgram;
  let trailDrawProgram;
  let trailCombineProgram;
  
  let trailIndexBuffer;
  let trailVertexBuffer;
  
  let enabled = true;
  let trailOpacity = 0.8;
  let trailWidth = 1.5;
  let trailColorMode = 'velocity';
  
  initPrograms();
  
  const api = {
    updateParticlesCount,
    updateTrailPositions,
    drawTrails,
    setEnabled,
    setOpacity,
    setWidth,
    setColorMode,
    getEnabled: () => enabled,
    getOpacity: () => trailOpacity,
    getWidth: () => trailWidth,
    getColorMode: () => trailColorMode
  };
  
  return api;
  
  function initPrograms() {
    trailPositionProgram = glUtils.createProgram(
      gl,
      getTrailPositionVertexShader(),
      getTrailPositionFragmentShader()
    );
    
    trailDrawProgram = glUtils.createProgram(
      gl,
      getTrailDrawVertexShader(),
      getTrailDrawFragmentShader()
    );
    
    trailCombineProgram = glUtils.createProgram(
      gl,
      getCombineVertexShader(),
      getCombineFragmentShader()
    );
  }
  
  function updateParticlesCount(newResolution) {
    particleStateResolution = newResolution;
    numParticles = particleStateResolution * particleStateResolution;
    
    if (trailTextures.length > 0) {
      trailTextures.forEach(tex => gl.deleteTexture(tex));
    }
    
    trailTextures = [];
    const emptyPixels = new Uint8Array(particleStateResolution * particleStateResolution * 4);
    
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      trailTextures.push(glUtils.createTexture(gl, gl.NEAREST, emptyPixels, particleStateResolution, particleStateResolution));
    }
    
    trailWriteIndex = 0;
    
    const trailIndices = new Float32Array(numParticles * 2 * (TRAIL_LENGTH - 1));
    let idx = 0;
    
    for (let p = 0; p < numParticles; p++) {
      for (let t = 0; t < TRAIL_LENGTH - 1; t++) {
        trailIndices[idx++] = p;
        trailIndices[idx++] = p + numParticles * t;
      }
    }
    
    if (trailIndexBuffer) gl.deleteBuffer(trailIndexBuffer);
    trailIndexBuffer = glUtils.createBuffer(gl, trailIndices);
    
    const trailVertices = new Float32Array(numParticles * TRAIL_LENGTH * 2);
    for (let i = 0; i < numParticles * TRAIL_LENGTH; i++) {
      trailVertices[i * 2] = i % numParticles;
      trailVertices[i * 2 + 1] = Math.floor(i / numParticles);
    }
    
    if (trailVertexBuffer) gl.deleteBuffer(trailVertexBuffer);
    trailVertexBuffer = glUtils.createBuffer(gl, trailVertices);
  }
  
  function updateTrailPositions(readTextures) {
    if (!enabled || trailTextures.length === 0) return;
    
    const writeTexture = trailTextures[trailWriteIndex];
    
    glUtils.bindFramebuffer(gl, framebuffer, writeTexture);
    gl.viewport(0, 0, particleStateResolution, particleStateResolution);
    
    gl.useProgram(trailPositionProgram.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, trailPositionProgram.a_pos, 2);
    
    readTextures.bindTextures(gl, trailPositionProgram);
    
    gl.uniform1f(trailPositionProgram.u_particles_res, particleStateResolution);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    trailWriteIndex = (trailWriteIndex + 1) % TRAIL_LENGTH;
  }
  
  function drawTrails() {
    if (!enabled || trailTextures.length === 0) return;
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.lineWidth(trailWidth);
    
    gl.useProgram(trailDrawProgram.program);
    glUtils.bindAttribute(gl, trailVertexBuffer, trailDrawProgram.a_particle_index, 1);
    glUtils.bindAttribute(gl, trailVertexBuffer, trailDrawProgram.a_trail_index, 1);
    
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const textureUnit = TEXTURE_UNIT_START + i;
      glUtils.bindTexture(gl, trailTextures[(trailWriteIndex + i) % TRAIL_LENGTH], textureUnit);
      gl.uniform1i(trailDrawProgram[`u_trail_${i}`], textureUnit);
    }
    
    gl.uniform1f(trailDrawProgram.u_particles_res, particleStateResolution);
    gl.uniform1f(trailDrawProgram.u_trail_length, TRAIL_LENGTH);
    gl.uniform1f(trailDrawProgram.u_opacity, trailOpacity);
    
    const { minX, maxX, minY, maxY } = ctx.bbox;
    gl.uniform2f(trailDrawProgram.u_min, minX, minY);
    gl.uniform2f(trailDrawProgram.u_max, maxX, maxY);
    
    gl.drawArrays(gl.LINE_STRIP, 0, numParticles * TRAIL_LENGTH);
    
    gl.disable(gl.BLEND);
  }
  
  function setEnabled(value) {
    enabled = value;
  }
  
  function setOpacity(value) {
    trailOpacity = Math.max(0, Math.min(1, value));
  }
  
  function setWidth(value) {
    trailWidth = Math.max(0.5, Math.min(10, value));
  }
  
  function setColorMode(mode) {
    trailColorMode = mode;
  }
}

function getTrailPositionVertexShader() {
  return `
precision highp float;
attribute vec2 a_pos;
varying vec2 v_tex_pos;

void main() {
  v_tex_pos = a_pos;
  gl_Position = vec4(1.0 - 2.0 * a_pos, 0.0, 1.0);
}
`;
}

function getTrailPositionFragmentShader() {
  return `
precision highp float;
uniform sampler2D u_particles_x;
uniform sampler2D u_particles_y;
uniform float u_particles_res;
varying vec2 v_tex_pos;

float decodeFloatRGBA(vec4 rgba) {
  return dot(rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0));
}

void main() {
  vec2 txPos = v_tex_pos;
  float x = decodeFloatRGBA(texture2D(u_particles_x, txPos));
  float y = decodeFloatRGBA(texture2D(u_particles_y, txPos));
  
  vec2 pos = vec2(x, y);
  vec2 normalized = (pos + 10.0) / 20.0;
  
  gl_FragColor = vec4(normalized, 0.0, 1.0);
}
`;
}

function getTrailDrawVertexShader() {
  return `
precision highp float;
attribute float a_particle_index;
attribute float a_trail_index;
uniform float u_particles_res;
uniform float u_trail_length;
uniform float u_opacity;
uniform vec2 u_min;
uniform vec2 u_max;

uniform sampler2D u_trail_0;
uniform sampler2D u_trail_1;
uniform sampler2D u_trail_2;
uniform sampler2D u_trail_3;
uniform sampler2D u_trail_4;
uniform sampler2D u_trail_5;
uniform sampler2D u_trail_6;
uniform sampler2D u_trail_7;
uniform sampler2D u_trail_8;
uniform sampler2D u_trail_9;
uniform sampler2D u_trail_10;
uniform sampler2D u_trail_11;
uniform sampler2D u_trail_12;
uniform sampler2D u_trail_13;
uniform sampler2D u_trail_14;
uniform sampler2D u_trail_15;

varying float v_alpha;
varying vec2 v_velocity;

vec2 getTrailPosition(int trailIdx, vec2 txPos) {
  vec4 color;
  if (trailIdx == 0) color = texture2D(u_trail_0, txPos);
  else if (trailIdx == 1) color = texture2D(u_trail_1, txPos);
  else if (trailIdx == 2) color = texture2D(u_trail_2, txPos);
  else if (trailIdx == 3) color = texture2D(u_trail_3, txPos);
  else if (trailIdx == 4) color = texture2D(u_trail_4, txPos);
  else if (trailIdx == 5) color = texture2D(u_trail_5, txPos);
  else if (trailIdx == 6) color = texture2D(u_trail_6, txPos);
  else if (trailIdx == 7) color = texture2D(u_trail_7, txPos);
  else if (trailIdx == 8) color = texture2D(u_trail_8, txPos);
  else if (trailIdx == 9) color = texture2D(u_trail_9, txPos);
  else if (trailIdx == 10) color = texture2D(u_trail_10, txPos);
  else if (trailIdx == 11) color = texture2D(u_trail_11, txPos);
  else if (trailIdx == 12) color = texture2D(u_trail_12, txPos);
  else if (trailIdx == 13) color = texture2D(u_trail_13, txPos);
  else if (trailIdx == 14) color = texture2D(u_trail_14, txPos);
  else color = texture2D(u_trail_15, txPos);
  
  return color.rg * 20.0 - 10.0;
}

void main() {
  int trailIdx = int(a_trail_index);
  float particleIdx = a_particle_index;
  
  vec2 txPos = vec2(
    fract(particleIdx / u_particles_res),
    floor(particleIdx / u_particles_res) / u_particles_res
  );
  
  vec2 pos = getTrailPosition(trailIdx, txPos);
  
  float alpha = 1.0 - (a_trail_index / u_trail_length);
  v_alpha = alpha * u_opacity;
  
  vec2 du = u_max - u_min;
  vec2 normalizedPos = (pos - u_min) / du;
  
  gl_Position = vec4(
    2.0 * normalizedPos.x - 1.0,
    1.0 - 2.0 * normalizedPos.y,
    0.0,
    1.0
  );
}
`;
}

function getTrailDrawFragmentShader() {
  return `
precision highp float;
varying float v_alpha;

void main() {
  gl_FragColor = vec4(1.0, 1.0, 1.0, v_alpha * 0.3);
}
`;
}

function getCombineVertexShader() {
  return `
precision highp float;
attribute vec2 a_pos;
varying vec2 v_tex_pos;

void main() {
  v_tex_pos = a_pos;
  gl_Position = vec4(1.0 - 2.0 * a_pos, 0.0, 1.0);
}
`;
}

function getCombineFragmentShader() {
  return `
precision highp float;
uniform sampler2D u_screen;
uniform sampler2D u_trails;
varying vec2 v_tex_pos;

void main() {
  vec2 p = 1.0 - v_tex_pos;
  vec4 screenColor = texture2D(u_screen, p);
  vec4 trailColor = texture2D(u_trails, p);
  
  gl_FragColor = screenColor + trailColor;
}
`;
}
