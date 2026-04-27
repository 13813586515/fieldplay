/**
 * Enhanced scene with post-processing, particle trails, and topology visualization
 */
import util from './gl-utils';
import makePanzoom from 'panzoom';
import bus from './bus';
import appState from './appState';
import wglPanZoom from './wglPanZoom';

import makeScreenProgramEnhanced from './programs/screenProgramEnhanced';
import createDrawParticlesProgram from './programs/drawParticlesProgram';
import createCursorUpdater from './utils/cursorUpdater';
import createVectorFieldEditorState from './editor/vectorFieldState';
import createInputsModel from './createInputsModel';

import createPostProcessingProgram from './postProcessing/postProcessingProgram';
import postProcessingState from './postProcessing/postProcessingState';
import createParticleTrails from './trails/particleTrails';
import createVectorFieldTopology from './topology/vectorFieldTopology';

export default function initSceneEnhanced(gl) {
  var canvasRect = { width: 0, height: 0, top: 0, left: 0 };
  setWidthHeight(gl.canvas.width, gl.canvas.height);
  window.addEventListener('resize', onResize, true);

  bus.on('start-record', startRecord);
  bus.on('stop-record', stopRecord);
  var currentCapturer = null;

  var bbox = appState.getBBox() || {};
  var currentPanZoomTransform = {
    scale: 1,
    x: 0,
    y: 0
  };

  var particleCount = appState.getParticleCount();

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.STENCIL_TEST);

  var ctx = {
    gl,
    bbox,
    canvasRect,

    inputs: null,

    framebuffer: gl.createFramebuffer(),

    quadBuffer: util.createBuffer(gl, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])),

    colorMode: appState.getColorMode(),
    colorFunction: appState.getColorFunction(),

    screenTextureUnit: 3,

    integrationTimeStep: appState.getIntegrationTimeStep(),

    dropProbability: appState.getDropProbability(),

    frame: 0,

    cursor: {
      clickX: 0, clickY: 0,
      hoverX: 0, hoverY: 0
    },

    particleStateResolution: 0,

    fadeOpacity: appState.getFadeout(),

    audioTexture: null
  };

  var lastAnimationFrame;
  var isPaused = false;

  var inputsModel = createInputsModel(ctx);

  var screenProgram = makeScreenProgramEnhanced(ctx);
  var drawProgram = createDrawParticlesProgram(ctx);
  var cursorUpdater = createCursorUpdater(ctx);
  var vectorFieldEditorState = createVectorFieldEditorState(drawProgram);

  var postProcessing = createPostProcessingProgram(ctx);
  var particleTrails = createParticleTrails(ctx);
  var topology = createVectorFieldTopology(ctx);

  var postProcessingEnabled = true;
  var trailsEnabled = false;
  var topologyEnabled = false;

  updateParticlesCount(particleCount);

  var api = {
    start: nextFrame,
    stop,
    dispose,

    resetBoundingBox,
    moveBoundingBox,
    applyBoundingBox,

    setPaused,

    getParticlesCount,
    setParticlesCount,

    setFadeOutSpeed,
    getFadeOutSpeed,

    setDropProbability,
    getDropProbability,

    getIntegrationTimeStep,
    setIntegrationTimeStep,

    setColorMode,
    getColorMode,

    vectorFieldEditorState,

    inputsModel,

    getCanvasRect() {
      return canvasRect;
    },

    getBoundingBox() {
      return ctx.bbox;
    },

    setPostProcessingEnabled,
    getPostProcessingEnabled: () => postProcessingEnabled,
    getPostProcessingState: () => postProcessingState.getState(),
    updatePostProcessingState,

    setTrailsEnabled,
    getTrailsEnabled: () => trailsEnabled,
    getTrailsOpacity: () => particleTrails.getOpacity(),
    getTrailsWidth: () => particleTrails.getWidth(),
    setTrailsOpacity: (v) => particleTrails.setOpacity(v),
    setTrailsWidth: (v) => particleTrails.setWidth(v),

    setTopologyEnabled,
    getTopologyEnabled: () => topologyEnabled,
    getTopologyShowCriticalPoints: () => topology.getShowCriticalPoints(),
    getTopologyShowSeparatrices: () => topology.getShowSeparatrices(),
    setTopologyShowCriticalPoints: (v) => topology.setShowCriticalPoints(v),
    setTopologyShowSeparatrices: (v) => topology.setShowSeparatrices(v),
    getCriticalPoints: () => topology.getCriticalPoints()
  };

  var panzoom = initPanzoom();
  restoreBBox();

  setTimeout(() => {
    bus.fire('scene-ready', api);
  });

  return api;

  function setPostProcessingEnabled(enabled) {
    postProcessingEnabled = enabled;
  }

  function updatePostProcessingState(newState) {
    const current = postProcessingState.getState();
    if (newState.bloom) {
      Object.assign(current.bloom, newState.bloom);
    }
    if (newState.vignette) {
      Object.assign(current.vignette, newState.vignette);
    }
    if (newState.chromaticAberration) {
      Object.assign(current.chromaticAberration, newState.chromaticAberration);
    }
    if (newState.motionBlur) {
      Object.assign(current.motionBlur, newState.motionBlur);
    }
    if (newState.dof) {
      Object.assign(current.dof, newState.dof);
    }
    if (newState.fxaa) {
      Object.assign(current.fxaa, newState.fxaa);
    }
    if (newState.colorCorrection) {
      Object.assign(current.colorCorrection, newState.colorCorrection);
    }
    if (newState.enabled !== undefined) {
      current.enabled = newState.enabled;
      postProcessingEnabled = newState.enabled;
    }
  }

  function setTrailsEnabled(enabled) {
    trailsEnabled = enabled;
    particleTrails.setEnabled(enabled);
  }

  function setTopologyEnabled(enabled) {
    topologyEnabled = enabled;
    topology.setEnabled(enabled);
    if (enabled) {
      topology.updateBBox(bbox);
      topology.computeTopology();
    }
  }

  function moveBoundingBox(changes) {
    if (!changes) return;
    var parsedBoundingBox = Object.assign({}, ctx.bbox);

    assignIfPossible(changes, 'minX', parsedBoundingBox);
    assignIfPossible(changes, 'minY', parsedBoundingBox);
    assignIfPossible(changes, 'maxX', parsedBoundingBox);
    assignIfPossible(changes, 'maxY', parsedBoundingBox);

    if (changes.minY !== undefined || changes.maxY !== undefined) {
      var heightChange = Math.abs(parsedBoundingBox.minY - parsedBoundingBox.maxY)/Math.abs(ctx.bbox.minY - ctx.bbox.maxY);
      var cx = (ctx.bbox.maxX + ctx.bbox.minX)/2;
      var prevWidth = (ctx.bbox.maxX - ctx.bbox.minX)/2;
      parsedBoundingBox.minX = cx - prevWidth * heightChange;
      parsedBoundingBox.maxX = cx + prevWidth * heightChange;
    }

    applyBoundingBox(parsedBoundingBox);
  }

  function assignIfPossible(change, key, newBoundingBox) {
    var value = Number.parseFloat(change[key]);
    if (Number.isFinite(value)) {
      newBoundingBox[key] = value;
    }
  }

  function startRecord(capturer) {
    currentCapturer = capturer;
  }

  function stopRecord() {
    currentCapturer = null;
  }

  function setColorMode(x) {
    var mode = parseInt(x, 10);
    appState.setColorMode(mode);
    ctx.colorMode = appState.getColorMode();
    drawProgram.updateColorMode(mode);
  }

  function getColorMode() {
    return appState.getColorMode();
  }

  function getIntegrationTimeStep() {
    return appState.getIntegrationTimeStep();
  }

  function setIntegrationTimeStep(x) {
    var f = parseFloat(x);
    if (Number.isFinite(f)) {
      ctx.integrationTimeStep = f;
      appState.setIntegrationTimeStep(f);
      bus.fire('integration-timestep-changed', f);
    }
  }

  function setPaused(shouldPause) {
    isPaused = shouldPause;
    nextFrame();
  }

  function setFadeOutSpeed(x) {
    var f = parseFloat(x);
    if (Number.isFinite(f)) {
      ctx.fadeOpacity = f;
      appState.setFadeout(f);
    }
  }

  function getFadeOutSpeed() {
    return appState.getFadeout();
  }

  function getParticlesCount() {
    return appState.getParticleCount();
  }

  function setParticlesCount(newParticleCount) {
    if (!Number.isFinite(newParticleCount)) return;
    if (newParticleCount === particleCount) return;
    if (newParticleCount < 1) return;

    updateParticlesCount(newParticleCount);

    particleCount = newParticleCount;
    appState.setParticleCount(newParticleCount);
  }

  function setDropProbability(x) {
    var f = parseFloat(x);
    if (Number.isFinite(f)) {
      appState.setDropProbability(f);
      ctx.dropProbability = f;
    }
  }

  function getDropProbability() {
    return appState.getDropProbability();
  }

  function onResize() {
    setWidthHeight(window.innerWidth, window.innerHeight);

    screenProgram.updateScreenTextures();
    postProcessing.updateScreenTextures();

    updateBoundingBox(currentPanZoomTransform);
  }

  function setWidthHeight(w, h) {
    var dx = Math.max(w * 0.02, 30);
    var dy = Math.max(h * 0.02, 30);
    canvasRect.width = w + 2 * dx;
    canvasRect.height = h + 2 * dy;
    canvasRect.top = - dy;
    canvasRect.left = - dx;

    let canvas = gl.canvas;
    canvas.width = canvasRect.width;
    canvas.height = canvasRect.height;
    canvas.style.left = (-dx) + 'px';
    canvas.style.top = (-dy) + 'px';
  }

  function dispose() {
      stop();
      panzoom.dispose();
      window.removeEventListener('resize', onResize, true);
      cursorUpdater.dispose();
      vectorFieldEditorState.dispose();
      postProcessing.dispose();
  }

  function nextFrame() {
    if (lastAnimationFrame) return;

    if (isPaused) return;

    lastAnimationFrame = requestAnimationFrame(draw);
  }

  function stop() {
    cancelAnimationFrame(lastAnimationFrame);
    lastAnimationFrame = 0;
  }

  function draw() {
    lastAnimationFrame = 0;

    drawScreenEnhanced();

    if (currentCapturer) currentCapturer.capture(gl.canvas);

    nextFrame();
  }

  function drawScreenEnhanced() {
    screenProgram.fadeOutLastFrame();
    
    drawProgram.drawParticles();

    screenProgram.renderToTexture(screenProgram.getBackgroundTexture());
    
    var currentTexture = screenProgram.getBackgroundTexture();
    
    if (postProcessingEnabled) {
      postProcessing.render(currentTexture);
    } else {
      screenProgram.renderToScreen(currentTexture);
    }
    
    screenProgram.swapTextures();
    screenProgram.boundingBoxUpdated = false;
    
    drawProgram.updateParticlesPositions();
  }

  function updateParticlesCount(numParticles) {
    ctx.particleStateResolution = Math.ceil(Math.sqrt(numParticles));
    drawProgram.updateParticlesCount();
    particleTrails.updateParticlesCount(ctx.particleStateResolution);
  }

  function initPanzoom() {
    let initializedPanzoom = makePanzoom(gl.canvas, {
      controller: wglPanZoom(gl.canvas, updateBoundingBox)
    });

    return initializedPanzoom;
  }

  function restoreBBox() {
    var savedBBox = appState.getBBox();
    var {width, height} = canvasRect;

    let sX = Math.PI * Math.E;
    let sY = Math.PI * Math.E;
    let tX = 0;
    let tY = 0;
    if (savedBBox) {
      sX = savedBBox.maxX - savedBBox.minX;
      sY = savedBBox.maxY - savedBBox.minY;
      tX = width * (savedBBox.minX + savedBBox.maxX)/2;
      tY = width * (savedBBox.minY + savedBBox.maxY)/2;
    }

    var w2 = sX * width/2;
    var h2 = sY * height/2;
    panzoom.showRectangle({
      left: -w2 + tX,
      top: -h2 - tY,
      right: w2 + tX,
      bottom: h2 - tY ,
    });
  }

  function updateBoundingBox(transform) {
    screenProgram.boundingBoxUpdated = true;

    currentPanZoomTransform.x = transform.x;
    currentPanZoomTransform.y = transform.y;
    currentPanZoomTransform.scale = transform.scale;

    var {width, height} = canvasRect;

    var minX = clientX(0);
    var minY = clientY(0);
    var maxX = clientX(width);
    var maxY = clientY(height);

    var p = 10000;
    bbox.minX = Math.round(p * minX/width)/p;
    bbox.minY = Math.round(p * -minY/width)/p;
    bbox.maxX = Math.round(p * maxX/width)/p;
    bbox.maxY = Math.round(p * -maxY/ width)/p;

    appState.saveBBox(bbox);

    bus.fire('bbox-change', bbox);

    function clientX(x) {
      return (x - transform.x)/transform.scale;
    }

    function clientY(y) {
      return (y - transform.y)/transform.scale;
    }
  }

  function resetBoundingBox() {
    var w = Math.PI * Math.E * 0.5;
    var h = Math.PI * Math.E * 0.5;

    applyBoundingBox({
      minX: -w,
      minY: -h,
      maxX: w,
      maxY: h
    });
  }

  function applyBoundingBox(boundingBox) {
    appState.saveBBox(boundingBox);
    restoreBBox();
    panzoom.moveBy(0, 0, false);
  }
}
