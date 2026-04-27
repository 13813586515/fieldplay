import createWebGPUContext from './webgpuContext';
import createWebGPUParticleSystem from './particleSystem';
import { createFieldSourceManager, FieldSourceTypes } from './fieldSources';
import createReactionDiffusionSystem from './reactionDiffusion';

export default async function createWebGPUScene(canvas) {
  try {
    const gpuContext = await createWebGPUContext(canvas);
    const { device } = gpuContext;

    let canvasRect = {
      width: canvas.width,
      height: canvas.height
    };

    const fieldSources = createFieldSourceManager();

    const particleSystem = createWebGPUParticleSystem(gpuContext, {
      particleCount: 20000,
      timeStep: 0.01,
      dropProbability: 0.009,
      bbox: { minX: -4, minY: -4, maxX: 4, maxY: 4 },
      fadeOpacity: 0.998
    });

    const rdWidth = Math.min(512, Math.floor(canvas.width / 2));
    const rdHeight = Math.min(512, Math.floor(canvas.height / 2));
    const reactionDiffusion = createReactionDiffusionSystem(gpuContext, rdWidth, rdHeight);
    particleSystem.setReactionDiffusionSystem(reactionDiffusion);

    let isPaused = false;
    let animationFrameId = null;
    let isWebGPUEnabled = true;

    const api = {
      gpuContext,
      particleSystem,
      fieldSources,
      reactionDiffusion,
      isWebGPU: true,

      start() {
        if (animationFrameId) return;
        isPaused = false;
        nextFrame();
      },

      stop() {
        isPaused = true;
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      },

      setPaused(paused) {
        isPaused = paused;
        if (!paused && !animationFrameId) {
          nextFrame();
        }
      },

      isPaused() {
        return isPaused;
      },

      resize() {
        canvasRect.width = window.innerWidth + 60;
        canvasRect.height = window.innerHeight + 60;
        canvas.width = canvasRect.width;
        canvas.height = canvasRect.height;
        
        particleSystem.resize(canvasRect.width, canvasRect.height);
        reactionDiffusion.resize(
          Math.min(512, Math.floor(canvasRect.width / 2)),
          Math.min(512, Math.floor(canvasRect.height / 2))
        );
      },

      setParticlesCount(count) {
        console.warn('Dynamic particle count change not yet implemented for WebGPU');
      },

      getParticlesCount() {
        return particleSystem.particleCount;
      },

      setFadeOutSpeed(opacity) {
        particleSystem.setFadeOpacity(opacity);
      },

      getFadeOutSpeed() {
        return particleSystem.params.fadeOpacity;
      },

      setDropProbability(prob) {
        particleSystem.setDropProbability(prob);
      },

      getDropProbability() {
        return particleSystem.params.dropProbability;
      },

      getIntegrationTimeStep() {
        return particleSystem.params.timeStep;
      },

      setIntegrationTimeStep(step) {
        particleSystem.setTimeStep(step);
      },

      setColorMode(mode) {
        console.warn('Color mode change not yet implemented for WebGPU');
      },

      getColorMode() {
        return 0;
      },

      updateCode(code) {
        console.warn('Custom vector field code not yet implemented for WebGPU. Use field sources instead.');
      },

      getCanvasRect() {
        return canvasRect;
      },

      getBoundingBox() {
        return particleSystem.params.bbox;
      },

      setBoundingBox(bbox) {
        particleSystem.setBBox(bbox);
      },

      addFieldSource(type, options = {}) {
        return fieldSources.addSource(type, options);
      },

      removeFieldSource(id) {
        return fieldSources.removeSource(id);
      },

      getFieldSources() {
        return fieldSources.getAllSources();
      },

      enableReactionDiffusion(enabled) {
        reactionDiffusion.setEnabled(enabled);
      },

      isReactionDiffusionEnabled() {
        return reactionDiffusion.isEnabled();
      },

      setReactionDiffusionParams(params) {
        if (params.feed !== undefined) reactionDiffusion.setFeed(params.feed);
        if (params.kill !== undefined) reactionDiffusion.setKill(params.kill);
        if (params.diffusionRateA !== undefined) reactionDiffusion.setDiffusionRateA(params.diffusionRateA);
        if (params.diffusionRateB !== undefined) reactionDiffusion.setDiffusionRateB(params.diffusionRateB);
        if (params.timeStep !== undefined) reactionDiffusion.setTimeStep(params.timeStep);
      },

      addRDSeed(x, y, radius = 20) {
        reactionDiffusion.addSeed(x, y, radius);
      },

      dispose() {
        this.stop();
        particleSystem.dispose();
        reactionDiffusion.dispose();
        gpuContext.dispose();
      },

      resetBoundingBox() {
        const w = Math.PI * Math.E * 0.5;
        const h = Math.PI * Math.E * 0.5;
        particleSystem.setBBox({
          minX: -w,
          minY: -h,
          maxX: w,
          maxY: h
        });
      },

      moveBoundingBox(changes) {
        const bbox = { ...particleSystem.params.bbox };
        if (changes.minX !== undefined) bbox.minX = changes.minX;
        if (changes.minY !== undefined) bbox.minY = changes.minY;
        if (changes.maxX !== undefined) bbox.maxX = changes.maxX;
        if (changes.maxY !== undefined) bbox.maxY = changes.maxY;
        particleSystem.setBBox(bbox);
      },

      applyBoundingBox(bbox) {
        particleSystem.setBBox(bbox);
      },

      inputsModel: {
        inputs: [],
        updateBindings() {}
      },

      vectorFieldEditorState: {
        code: '',
        error: '',
        errorDetail: '',
        isFloatError: false,
        getCode() { return ''; },
        setCode() {},
        dispose() {}
      }
    };

    function nextFrame() {
      if (isPaused) {
        animationFrameId = null;
        return;
      }
      animationFrameId = requestAnimationFrame(render);
    }

    function render() {
      const fieldSourcesData = fieldSources.toFloat32Array();
      particleSystem.setFieldSources(fieldSourcesData);

      const commandEncoder = device.createCommandEncoder();

      if (reactionDiffusion.isEnabled()) {
        reactionDiffusion.step(commandEncoder, 2);
      }

      particleSystem.update(commandEncoder);

      const targetTexture = gpuContext.getCanvasTexture();
      particleSystem.render(commandEncoder, targetTexture);

      device.queue.submit([commandEncoder.finish()]);

      nextFrame();
    }

    function addDefaultFieldSources() {
      fieldSources.addSource(FieldSourceTypes.ATTRACTOR, {
        x: 0,
        y: 0,
        strength: 0.5,
        radius: 0.3
      });

      fieldSources.addSource(FieldSourceTypes.VORTEX, {
        x: 1.5,
        y: 1.0,
        strength: 1.0,
        radius: 0.2,
        rotation: 0.3
      });

      fieldSources.addSource(FieldSourceTypes.REPELLER, {
        x: -1.5,
        y: -0.5,
        strength: 0.3,
        radius: 0.2
      });
    }

    addDefaultFieldSources();

    return api;
  } catch (error) {
    console.error('WebGPU initialization failed:', error);
    throw error;
  }
}

export { FieldSourceTypes };
