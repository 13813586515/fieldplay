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
  getSimpleCopyShader
} from './postProcessingShaders';

const SCREEN_TEXTURE_UNIT = 10;
const BLOOM_TEXTURE_UNIT = 11;

export default function createPostProcessingProgramV2(ctx) {
  const { gl, canvasRect, framebuffer } = ctx;
  
  let pingPongTextures = [];
  let currentPingPong = 0;
  
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
  let copyProgram;
  
  let prevFrameTexture = null;
  
  initPrograms();
  updateTextures();
  
  const api = {
    renderToScreenWithPostProcessing,
    updateTextures,
    getState: postProcessingState.getState,
    updateState: postProcessingState.updateState
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
    copyProgram = glUtils.createProgram(gl, getVertexShader(), getSimpleCopyShader());
  }
  
  function updateTextures() {
    const { width, height } = canvasRect;
    const emptyPixels = new Uint8Array(width * height * 4);
    
    if (pingPongTextures.length > 0) {
      pingPongTextures.forEach(tex => gl.deleteTexture(tex));
    }
    
    pingPongTextures = [
      glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height),
      glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height),
      glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height),
      glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height)
    ];
    
    if (prevFrameTexture) {
      gl.deleteTexture(prevFrameTexture);
    }
    prevFrameTexture = glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height);
    
    currentPingPong = 0;
  }
  
  function getNextPingPong() {
    const idx = currentPingPong;
    currentPingPong = (currentPingPong + 1) % 2;
    return pingPongTextures[idx];
  }
  
  function getCurrentPingPong() {
    return pingPongTextures[currentPingPong];
  }
  
  function renderToScreenWithPostProcessing(inputTexture, originalRenderFn) {
    const state = postProcessingState.getState();
    
    if (!state.enabled) {
      originalRenderFn();
      return;
    }
    
    let currentTexture = inputTexture;
    const { width, height } = canvasRect;
    
    if (state.bloom.enabled) {
      currentTexture = applyBloom(currentTexture, width, height, state.bloom);
    }
    
    if (state.vignette.enabled) {
      currentTexture = applyVignette(currentTexture, state.vignette);
    }
    
    if (state.chromaticAberration.enabled) {
      currentTexture = applyChromaticAberration(currentTexture, state.chromaticAberration);
    }
    
    if (state.colorCorrection.enabled) {
      currentTexture = applyColorCorrection(currentTexture, state.colorCorrection);
    }
    
    if (state.motionBlur.enabled) {
      currentTexture = applyMotionBlur(currentTexture, width, height, state.motionBlur, prevFrameTexture);
    }
    
    if (state.dof.enabled) {
      currentTexture = applyDOF(currentTexture, width, height, state.dof);
    }
    
    if (state.fxaa.enabled) {
      currentTexture = applyFXAA(currentTexture, width, height);
    }
    
    copyTextureToPrevFrame(inputTexture);
    
    glUtils.bindFramebuffer(gl, null);
    gl.viewport(0, 0, width, height);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(19/255, 41/255, 79/255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    drawSimpleQuad(currentTexture);
    
    gl.disable(gl.BLEND);
  }
  
  function copyTextureToPrevFrame(inputTexture) {
    const { width, height } = canvasRect;
    
    glUtils.bindFramebuffer(gl, framebuffer, prevFrameTexture);
    gl.viewport(0, 0, width, height);
    
    drawSimpleQuad(inputTexture);
  }
  
  function applyBloom(inputTexture, width, height, bloomConfig) {
    const bloomOutputTex = getNextPingPong();
    glUtils.bindFramebuffer(gl, framebuffer, bloomOutputTex);
    gl.viewport(0, 0, width, height);
    
    drawFullScreenQuad(extractBrightProgram, inputTexture, program => {
      gl.uniform1f(program.u_threshold, bloomConfig.threshold);
    });
    
    const brightTexture = bloomOutputTex;
    
    const hBlurTex = getNextPingPong();
    glUtils.bindFramebuffer(gl, framebuffer, hBlurTex);
    drawFullScreenQuad(blurHorizontalProgram, brightTexture, program => {
      gl.uniform2f(program.u_resolution, width, height);
      gl.uniform1f(program.u_radius, bloomConfig.radius);
    });
    
    const vBlurTex = getNextPingPong();
    glUtils.bindFramebuffer(gl, framebuffer, vBlurTex);
    drawFullScreenQuad(blurVerticalProgram, hBlurTex, program => {
      gl.uniform2f(program.u_resolution, width, height);
      gl.uniform1f(program.u_radius, bloomConfig.radius);
    });
    
    const blurredTexture = vBlurTex;
    
    const resultTex = getNextPingPong();
    glUtils.bindFramebuffer(gl, framebuffer, resultTex);
    gl.viewport(0, 0, width, height);
    
    gl.useProgram(bloomCombineProgram.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, bloomCombineProgram.a_pos, 2);
    
    glUtils.bindTexture(gl, inputTexture, SCREEN_TEXTURE_UNIT);
    gl.uniform1i(bloomCombineProgram.u_screen, SCREEN_TEXTURE_UNIT);
    
    glUtils.bindTexture(gl, blurredTexture, BLOOM_TEXTURE_UNIT);
    gl.uniform1i(bloomCombineProgram.u_bloom, BLOOM_TEXTURE_UNIT);
    
    gl.uniform1f(bloomCombineProgram.u_strength, bloomConfig.strength);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    return resultTex;
  }
  
  function applyVignette(inputTexture, vignetteConfig) {
    const { width, height } = canvasRect;
    const resultTex = getNextPingPong();
    
    glUtils.bindFramebuffer(gl, framebuffer, resultTex);
    gl.viewport(0, 0, width, height);
    
    drawFullScreenQuad(vignetteProgram, inputTexture, program => {
      gl.uniform1f(program.u_offset, vignetteConfig.offset);
      gl.uniform1f(program.u_darkness, vignetteConfig.darkness);
    });
    
    return resultTex;
  }
  
  function applyChromaticAberration(inputTexture, caConfig) {
    const { width, height } = canvasRect;
    const resultTex = getNextPingPong();
    
    glUtils.bindFramebuffer(gl, framebuffer, resultTex);
    gl.viewport(0, 0, width, height);
    
    drawFullScreenQuad(chromaticAberrationProgram, inputTexture, program => {
      gl.uniform1f(program.u_amount, caConfig.amount);
    });
    
    return resultTex;
  }
  
  function applyFXAA(inputTexture, width, height) {
    const resultTex = getNextPingPong();
    
    glUtils.bindFramebuffer(gl, framebuffer, resultTex);
    gl.viewport(0, 0, width, height);
    
    drawFullScreenQuad(fxaaProgram, inputTexture, program => {
      gl.uniform2f(program.u_resolution, width, height);
    });
    
    return resultTex;
  }
  
  function applyColorCorrection(inputTexture, ccConfig) {
    const { width, height } = canvasRect;
    const resultTex = getNextPingPong();
    
    glUtils.bindFramebuffer(gl, framebuffer, resultTex);
    gl.viewport(0, 0, width, height);
    
    drawFullScreenQuad(colorCorrectionProgram, inputTexture, program => {
      gl.uniform1f(program.u_brightness, ccConfig.brightness);
      gl.uniform1f(program.u_contrast, ccConfig.contrast);
      gl.uniform1f(program.u_saturation, ccConfig.saturation);
      gl.uniform1f(program.u_gamma, ccConfig.gamma);
    });
    
    return resultTex;
  }
  
  function applyMotionBlur(inputTexture, width, height, mbConfig, prevTexture) {
    const resultTex = getNextPingPong();
    
    glUtils.bindFramebuffer(gl, framebuffer, resultTex);
    gl.viewport(0, 0, width, height);
    
    gl.useProgram(motionBlurProgram.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, motionBlurProgram.a_pos, 2);
    
    glUtils.bindTexture(gl, inputTexture, SCREEN_TEXTURE_UNIT);
    gl.uniform1i(motionBlurProgram.u_screen, SCREEN_TEXTURE_UNIT);
    
    glUtils.bindTexture(gl, prevTexture || inputTexture, BLOOM_TEXTURE_UNIT);
    gl.uniform1i(motionBlurProgram.u_velocity, BLOOM_TEXTURE_UNIT);
    
    gl.uniform1f(motionBlurProgram.u_intensity, mbConfig.intensity);
    gl.uniform2f(motionBlurProgram.u_resolution, width, height);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    return resultTex;
  }
  
  function applyDOF(inputTexture, width, height, dofConfig) {
    const resultTex = getNextPingPong();
    
    glUtils.bindFramebuffer(gl, framebuffer, resultTex);
    gl.viewport(0, 0, width, height);
    
    drawFullScreenQuad(dofProgram, inputTexture, program => {
      gl.uniform1f(program.u_focus, dofConfig.focus);
      gl.uniform1f(program.u_aperture, dofConfig.aperture);
      gl.uniform1f(program.u_maxblur, dofConfig.maxblur);
      gl.uniform2f(program.u_resolution, width, height);
    });
    
    return resultTex;
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
  
  function drawSimpleQuad(texture) {
    gl.useProgram(copyProgram.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, copyProgram.a_pos, 2);
    
    glUtils.bindTexture(gl, texture, SCREEN_TEXTURE_UNIT);
    gl.uniform1i(copyProgram.u_screen, SCREEN_TEXTURE_UNIT);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
