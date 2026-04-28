/**
 * The main entry point to the application.
 *
 * It is initialized immediately with webgl or webgpu, and puts
 * vue.js app loading into the future.
 */
import initScene from './scene';
import createWebGPUScene from './webgpu/webgpuScene';
import bus from './bus';
import { initAutoMode } from './autoMode';

var canvas = document.getElementById('scene');
var currentScene = null;
var useWebGPU = navigator.gpu !== undefined;

window.renderBackend = {
  useWebGPU,
  isWebGPU: () => useWebGPU,
  getScene: () => currentScene,
  switchBackend: switchBackend
};

// Canvas may not be available in test run
if (canvas) initVectorFieldApp(canvas);

// Lazy load the Vue settings UI
import('@/vueApp.js');

async function initVectorFieldApp(canvas) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  if (useWebGPU) {
    try {
      var webgpuScene = await createWebGPUScene(canvas);
      currentScene = webgpuScene;
      window.scene = currentScene;
      window.webGLEnabled = true;
      window.webGPUEnabled = true;
      currentScene.start();
      initAutoMode(currentScene);
      bus.fire('scene-ready', currentScene);
      console.log('WebGPU initialized successfully');
      return;
    } catch (e) {
      console.warn('WebGPU initialization failed, falling back to WebGL:', e);
      useWebGPU = false;
      window.renderBackend.useWebGPU = false;
    }
  }

  initWebGLScene(canvas);
}

function initWebGLScene(canvas) {
  var ctxOptions = { antialiasing: false };

  var gl = canvas.getContext('webgl', ctxOptions) ||
          canvas.getContext('experimental-webgl', ctxOptions);

  if (gl) {
    window.webGLEnabled = true;
    window.webGPUEnabled = false;
    var scene = initScene(gl);
    currentScene = scene;
    scene.start();
    initAutoMode(scene);
    window.scene = scene;
    bus.fire('scene-ready', currentScene);
  } else {
    window.webGLEnabled = false;
  }
}

async function switchBackend(useGPU) {
  if (useGPU === useWebGPU) return;
  
  if (currentScene) {
    currentScene.stop();
    currentScene.dispose();
  }

  useWebGPU = useGPU;
  window.renderBackend.useWebGPU = useWebGPU;

  if (useWebGPU && navigator.gpu) {
    try {
      currentScene = await createWebGPUScene(canvas);
      window.scene = currentScene;
      window.webGPUEnabled = true;
      window.webGLEnabled = true;
      currentScene.start();
      bus.fire('scene-ready', currentScene);
      console.log('Switched to WebGPU backend');
      return true;
    } catch (e) {
      console.error('Failed to switch to WebGPU:', e);
      useWebGPU = false;
      window.renderBackend.useWebGPU = false;
    }
  }

  initWebGLScene(canvas);
  bus.fire('scene-ready', currentScene);
  console.log('Switched to WebGL backend');
  return true;
}

var CCapture;
var currentCapturer;

window.startRecord = startRecord;
window.isRecording = false;

function startRecord(url) {
  if (!CCapture) {
    import('ccapture.js').then(module => {
      CCapture = module.default || module;
      window.stopRecord = stopRecord;
      startRecord(url);
    });

    return;
  }

  if (currentCapturer) {
    currentCapturer.stop();
  }

  if (!ffmpegScriptLoaded()) {
    var ffmpegServer = document.createElement('script');
    ffmpegServer.setAttribute('src', url || 'http://localhost:8080/ffmpegserver/ffmpegserver.js');
    ffmpegServer.onload = () => startRecord(url);
    document.head.appendChild(ffmpegServer);
    return;
  }

  currentCapturer = new CCapture( {
      format: 'ffmpegserver',
      framerate: 60,
      verbose: true,
      name: "fieldplay",
      extension: ".mp4",
      codec: "mpeg4",
      ffmpegArguments: [
        "-b:v", "12M",
      ],
  });

  window.isRecording = true;
  currentCapturer.start();
  bus.fire('start-record', currentCapturer)
}

function ffmpegScriptLoaded() {
  return typeof FFMpegServer !== 'undefined'
}

function stopRecord() {
  window.isRecording = false;
  bus.fire('stop-record', currentCapturer)
  currentCapturer.stop();
  currentCapturer.save();
}
