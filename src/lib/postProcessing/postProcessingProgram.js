import glUtils from '../gl-utils';
import postProcessingState from './postProcessingState';
import {
  getVertexShader,
  getExtractBrightShader,
  getBlurShader,
  getBloomCombineShader,
  getVignetteShader,
  getChromaticAberrationShader,
  getFXAAShader,
  getColorCorrectionShader,
  getMotionBlurShader,
  getDOFShader,
  getCombineShader
} from './postProcessingShaders';

const SCREEN_TEXTURE_UNIT = 10;
const BLOOM_TEXTURE_UNIT = 11;
const VELOCITY_TEXTURE_UNIT = 12;

export default function createPostProcessingProgram(ctx) {
  const { gl, canvasRect, framebuffer } = ctx;
  const state = postProcessingState.getState();
  
  let screenTextures = [];
  let pingPongIndex = 0;
  
  let extractBrightProgram;
  let blurHorizontalProgram;
  let blurVerticalProgram;
  let bloomCombineProgram;
  let vignetteProgram;
  let chromaticAberrationProgram;
  let fxaaProgram;
  let colorCorrectionProgram;
  let motionBlurProgram;
  let dofProgram;
  let combineProgram;
  
  let velocityTexture = null;
  let velocityTexturePrev = null;
  
  initPrograms();
  updateScreenTextures();
  
  const api = {
    render,
    updateScreenTextures,
    setVelocityTexture,
    dispose
  };
  
  return api;
  
  function initPrograms() {
    extractBrightProgram = glUtils.createProgram(gl, getVertexShader(), getExtractBrightShader());
    blurHorizontalProgram = glUtils.createProgram(gl, getVertexShader(), getBlurShader('horizontal'));
    blurVerticalProgram = glUtils.createProgram(gl, getVertexShader(), getBlurShader('vertical'));
    bloomCombineProgram = glUtils.createProgram(gl, getVertexShader(), getBloomCombineShader());
    vignetteProgram = glUtils.createProgram(gl, getVertexShader(), getVignetteShader());
    chromaticAberrationProgram = glUtils.createProgram(gl, getVertexShader(), getChromaticAberrationShader());
    fxaaProgram = glUtils.createProgram(gl, getVertexShader(), getFXAAShader());
    colorCorrectionProgram = glUtils.createProgram(gl, getVertexShader(), getColorCorrectionShader());
    motionBlurProgram = glUtils.createProgram(gl, getVertexShader(), getMotionBlurShader());
    dofProgram = glUtils.createProgram(gl, getVertexShader(), getDOFShader());
    combineProgram = glUtils.createProgram(gl, getVertexShader(), getCombineShader());
  }
  
  function updateScreenTextures() {
    const { width, height } = canvasRect;
    const emptyPixels = new Uint8Array(width * height * 4);
    
    if (screenTextures.length > 0) {
      screenTextures.forEach(tex => gl.deleteTexture(tex));
    }
    
    screenTextures = [
      glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height),
      glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height),
      glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height),
      glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height)
    ];
    
    if (velocityTexture) gl.deleteTexture(velocityTexture);
    if (velocityTexturePrev) gl.deleteTexture(velocityTexturePrev);
    
    velocityTexture = glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height);
    velocityTexturePrev = glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height);
    
    pingPongIndex = 0;
  }
  
  function setVelocityTexture(tex) {
    if (velocityTexturePrev) {
      gl.deleteTexture(velocityTexturePrev);
    }
    velocityTexturePrev = velocityTexture;
    velocityTexture = tex;
  }
  
  function render(inputTexture) {
    if (!state.enabled) {
      drawTextureToScreen(inputTexture);
      return;
    }
    
    let currentTexture = inputTexture;
    const { width, height } = canvasRect;
    
    if (state.bloom.enabled) {
      currentTexture = applyBloom(currentTexture, width, height);
    }
    
    if (state.vignette.enabled) {
      currentTexture = applyVignette(currentTexture);
    }
    
    if (state.chromaticAberration.enabled) {
      currentTexture = applyChromaticAberration(currentTexture);
    }
    
    if (state.colorCorrection.enabled) {
      currentTexture = applyColorCorrection(currentTexture);
    }
    
    if (state.motionBlur.enabled && velocityTexturePrev) {
      currentTexture = applyMotionBlur(currentTexture, width, height);
    }
    
    if (state.dof.enabled) {
      currentTexture = applyDOF(currentTexture, width, height);
    }
    
    if (state.fxaa.enabled) {
      currentTexture = applyFXAA(currentTexture, width, height);
    }
    
    drawTextureToScreen(currentTexture);
  }
  
  function applyBloom(inputTexture, width, height) {
    const { bloom } = state;
    
    glUtils.bindFramebuffer(gl, framebuffer, screenTextures[pingPongIndex]);
    gl.viewport(0, 0, width, height);
    
    drawFullScreenQuad(extractBrightProgram, inputTexture, program => {
      gl.uniform1f(program.u_threshold, bloom.threshold);
    });
    
    const brightTexture = screenTextures[pingPongIndex];
    pingPongIndex = (pingPongIndex + 1) % 2;
    
    glUtils.bindFramebuffer(gl, framebuffer, screenTextures[pingPongIndex]);
    drawFullScreenQuad(blurHorizontalProgram, brightTexture, program => {
      gl.uniform2f(program.u_resolution, width, height);
      gl.uniform1f(program.u_radius, bloom.radius);
    });
    
    const horizontalBlur = screenTextures[pingPongIndex];
    pingPongIndex = (pingPongIndex + 1) % 2;
    
    glUtils.bindFramebuffer(gl, framebuffer, screenTextures[pingPongIndex]);
    drawFullScreenQuad(blurVerticalProgram, horizontalBlur, program => {
      gl.uniform2f(program.u_resolution, width, height);
      gl.uniform1f(program.u_radius, bloom.radius);
    });
    
    const blurredTexture = screenTextures[pingPongIndex];
    pingPongIndex = (pingPongIndex + 1) % 2;
    
    glUtils.bindFramebuffer(gl, framebuffer, screenTextures[pingPongIndex]);
    gl.useProgram(bloomCombineProgram.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, bloomCombineProgram.a_pos, 2);
    
    glUtils.bindTexture(gl, inputTexture, SCREEN_TEXTURE_UNIT);
    gl.uniform1i(bloomCombineProgram.u_screen, SCREEN_TEXTURE_UNIT);
    
    glUtils.bindTexture(gl, blurredTexture, BLOOM_TEXTURE_UNIT);
    gl.uniform1i(bloomCombineProgram.u_bloom, BLOOM_TEXTURE_UNIT);
    
    gl.uniform1f(bloomCombineProgram.u_strength, bloom.strength);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    pingPongIndex = (pingPongIndex + 1) % 2;
    return screenTextures[(pingPongIndex - 1 + 2) % 2];
  }
  
  function applyVignette(inputTexture) {
    const { vignette } = state;
    
    glUtils.bindFramebuffer(gl, framebuffer, screenTextures[pingPongIndex]);
    gl.viewport(0, 0, canvasRect.width, canvasRect.height);
    
    drawFullScreenQuad(vignetteProgram, inputTexture, program => {
      gl.uniform1f(program.u_offset, vignette.offset);
      gl.uniform1f(program.u_darkness, vignette.darkness);
    });
    
    pingPongIndex = (pingPongIndex + 1) % 2;
    return screenTextures[(pingPongIndex - 1 + 2) % 2];
  }
  
  function applyChromaticAberration(inputTexture) {
    const { chromaticAberration } = state;
    
    glUtils.bindFramebuffer(gl, framebuffer, screenTextures[pingPongIndex]);
    gl.viewport(0, 0, canvasRect.width, canvasRect.height);
    
    drawFullScreenQuad(chromaticAberrationProgram, inputTexture, program => {
      gl.uniform1f(program.u_amount, chromaticAberration.amount);
    });
    
    pingPongIndex = (pingPongIndex + 1) % 2;
    return screenTextures[(pingPongIndex - 1 + 2) % 2];
  }
  
  function applyFXAA(inputTexture, width, height) {
    glUtils.bindFramebuffer(gl, framebuffer, screenTextures[pingPongIndex]);
    gl.viewport(0, 0, width, height);
    
    drawFullScreenQuad(fxaaProgram, inputTexture, program => {
      gl.uniform2f(program.u_resolution, width, height);
    });
    
    pingPongIndex = (pingPongIndex + 1) % 2;
    return screenTextures[(pingPongIndex - 1 + 2) % 2];
  }
  
  function applyColorCorrection(inputTexture) {
    const { colorCorrection } = state;
    
    glUtils.bindFramebuffer(gl, framebuffer, screenTextures[pingPongIndex]);
    gl.viewport(0, 0, canvasRect.width, canvasRect.height);
    
    drawFullScreenQuad(colorCorrectionProgram, inputTexture, program => {
      gl.uniform1f(program.u_brightness, colorCorrection.brightness);
      gl.uniform1f(program.u_contrast, colorCorrection.contrast);
      gl.uniform1f(program.u_saturation, colorCorrection.saturation);
      gl.uniform1f(program.u_gamma, colorCorrection.gamma);
    });
    
    pingPongIndex = (pingPongIndex + 1) % 2;
    return screenTextures[(pingPongIndex - 1 + 2) % 2];
  }
  
  function applyMotionBlur(inputTexture, width, height) {
    const { motionBlur } = state;
    
    glUtils.bindFramebuffer(gl, framebuffer, screenTextures[pingPongIndex]);
    gl.viewport(0, 0, width, height);
    
    gl.useProgram(motionBlurProgram.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, motionBlurProgram.a_pos, 2);
    
    glUtils.bindTexture(gl, inputTexture, SCREEN_TEXTURE_UNIT);
    gl.uniform1i(motionBlurProgram.u_screen, SCREEN_TEXTURE_UNIT);
    
    glUtils.bindTexture(gl, velocityTexturePrev || inputTexture, VELOCITY_TEXTURE_UNIT);
    gl.uniform1i(motionBlurProgram.u_velocity, VELOCITY_TEXTURE_UNIT);
    
    gl.uniform1f(motionBlurProgram.u_intensity, motionBlur.intensity);
    gl.uniform2f(motionBlurProgram.u_resolution, width, height);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    pingPongIndex = (pingPongIndex + 1) % 2;
    return screenTextures[(pingPongIndex - 1 + 2) % 2];
  }
  
  function applyDOF(inputTexture, width, height) {
    const { dof } = state;
    
    glUtils.bindFramebuffer(gl, framebuffer, screenTextures[pingPongIndex]);
    gl.viewport(0, 0, width, height);
    
    drawFullScreenQuad(dofProgram, inputTexture, program => {
      gl.uniform1f(program.u_focus, dof.focus);
      gl.uniform1f(program.u_aperture, dof.aperture);
      gl.uniform1f(program.u_maxblur, dof.maxblur);
      gl.uniform2f(program.u_resolution, width, height);
    });
    
    pingPongIndex = (pingPongIndex + 1) % 2;
    return screenTextures[(pingPongIndex - 1 + 2) % 2];
  }
  
  function drawFullScreenQuad(program, texture, uniformSetter) {
    gl.useProgram(program.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, program.a_pos, 2);
    
    glUtils.bindTexture(gl, texture, SCREEN_TEXTURE_UNIT);
    gl.uniform1i(program.u_screen, SCREEN_TEXTURE_UNIT);
    
    if (uniformSetter) {
      uniformSetter(program);
    }
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  
  function drawTextureToScreen(texture) {
    glUtils.bindFramebuffer(gl, framebuffer, null);
    gl.viewport(0, 0, canvasRect.width, canvasRect.height);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    gl.useProgram(combineProgram.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, combineProgram.a_pos, 2);
    
    glUtils.bindTexture(gl, texture, SCREEN_TEXTURE_UNIT);
    gl.uniform1i(combineProgram.u_screen, SCREEN_TEXTURE_UNIT);
    gl.uniform1f(combineProgram.u_mix, 1.0);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
  }
  
  function dispose() {
    if (extractBrightProgram) extractBrightProgram.unload();
    if (blurHorizontalProgram) blurHorizontalProgram.unload();
    if (blurVerticalProgram) blurVerticalProgram.unload();
    if (bloomCombineProgram) bloomCombineProgram.unload();
    if (vignetteProgram) vignetteProgram.unload();
    if (chromaticAberrationProgram) chromaticAberrationProgram.unload();
    if (fxaaProgram) fxaaProgram.unload();
    if (colorCorrectionProgram) colorCorrectionProgram.unload();
    if (motionBlurProgram) motionBlurProgram.unload();
    if (dofProgram) dofProgram.unload();
    if (combineProgram) combineProgram.unload();
    
    screenTextures.forEach(tex => {
      if (tex) gl.deleteTexture(tex);
    });
    
    if (velocityTexture) gl.deleteTexture(velocityTexture);
    if (velocityTexturePrev) gl.deleteTexture(velocityTexturePrev);
  }
}
