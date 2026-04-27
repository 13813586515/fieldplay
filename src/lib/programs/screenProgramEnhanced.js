/**
 * Enhanced screen program with post-processing support
 */
import glUtils from '../gl-utils';

const NO_TRANSFORM = {dx: 0, dy: 0, scale: 1};

export default function makeScreenProgramEnhanced(ctx) {
  var {gl, canvasRect} = ctx;

  var screenTexture, backgroundTexture;
  var boundBoxTextureTransform = {dx: 0, dy: 0, scale: 1};
  var lastRenderedBoundingBox = null;

  let backgroundColor = { r: 19/255, g: 41/255, b: 79/255, a: 1 };

  updateScreenTextures();
  var screenProgram = glUtils.createProgram(gl, getScreenVertexShader(), getScreenFragmentShader());
  var simpleQuadProgram = glUtils.createProgram(gl, getSimpleVertexShader(), getSimpleFragmentShader());
  
  var api = {
    fadeOutLastFrame,
    renderToTexture,
    renderToScreen,
    renderCurrentScreenDirect,
    updateScreenTextures,
    getScreenTexture: () => screenTexture,
    getBackgroundTexture: () => backgroundTexture,
    swapTextures,

    boundingBoxUpdated: false
  };

  return api;
  
  function swapTextures() {
    var temp = backgroundTexture;
    backgroundTexture = screenTexture;
    screenTexture = temp;
  }

  function fadeOutLastFrame() {
    glUtils.bindFramebuffer(gl, ctx.framebuffer, screenTexture);
    gl.viewport(0, 0, canvasRect.width, canvasRect.height);

    if (api.boundingBoxUpdated && lastRenderedBoundingBox) {
      boundBoxTextureTransform.dx = -(ctx.bbox.minX - lastRenderedBoundingBox.minX)/(ctx.bbox.maxX - ctx.bbox.minX);
      boundBoxTextureTransform.dy = -(ctx.bbox.minY - lastRenderedBoundingBox.minY)/(ctx.bbox.maxY - ctx.bbox.minY);
      boundBoxTextureTransform.scale = (ctx.bbox.maxX - ctx.bbox.minX) / (lastRenderedBoundingBox.maxX - lastRenderedBoundingBox.minX);
      drawTexture(backgroundTexture, ctx.fadeOpacity, boundBoxTextureTransform);
    } else {
      drawTexture(backgroundTexture, ctx.fadeOpacity, NO_TRANSFORM);
    }
  }

  function renderToTexture(targetTexture) {
    glUtils.bindFramebuffer(gl, ctx.framebuffer, targetTexture);
    gl.viewport(0, 0, canvasRect.width, canvasRect.height);

    saveLastBbox();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(backgroundColor.r, backgroundColor.g, backgroundColor.b, backgroundColor.a);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawTexture(screenTexture, 1.0, NO_TRANSFORM);
    gl.disable(gl.BLEND);

    api.boundingBoxUpdated = false;
  }

  function renderToScreen(inputTexture) {
    glUtils.bindFramebuffer(gl, ctx.framebuffer, null);
    gl.viewport(0, 0, canvasRect.width, canvasRect.height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(backgroundColor.r, backgroundColor.g, backgroundColor.b, backgroundColor.a);
    gl.clear(gl.COLOR_BUFFER_BIT);

    drawSimpleQuad(inputTexture);

    gl.disable(gl.BLEND);
  }

  function renderCurrentScreenDirect() {
    glUtils.bindFramebuffer(gl, ctx.framebuffer, null);

    saveLastBbox();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(backgroundColor.r, backgroundColor.g, backgroundColor.b, backgroundColor.a);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawTexture(screenTexture, 1.0, NO_TRANSFORM);
    gl.disable(gl.BLEND);

    var temp = backgroundTexture;
    backgroundTexture = screenTexture;
    screenTexture = temp;

    api.boundingBoxUpdated = false;
    if (window.audioTexture) {
      drawTexture(window.audioTexture, 1.0, NO_TRANSFORM);
    }
  }

  function updateScreenTextures() {
    var {width, height} = canvasRect;
    var emptyPixels = new Uint8Array(width * height * 4);
    if (screenTexture) {
      gl.deleteTexture(screenTexture);
    }
    if (backgroundTexture) {
      gl.deleteTexture(backgroundTexture);
    }

    screenTexture = glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height);
    backgroundTexture = glUtils.createTexture(gl, gl.LINEAR, emptyPixels, width, height);
  }

  function saveLastBbox() {
    if (!lastRenderedBoundingBox) {
      lastRenderedBoundingBox = {
        minX: ctx.bbox.minX,
        minY: ctx.bbox.minY,
        maxX: ctx.bbox.maxX,
        maxY: ctx.bbox.maxY
      };

      return;
    }

    lastRenderedBoundingBox.minX = ctx.bbox.minX;
    lastRenderedBoundingBox.minY = ctx.bbox.minY;
    lastRenderedBoundingBox.maxX = ctx.bbox.maxX;
    lastRenderedBoundingBox.maxY = ctx.bbox.maxY;
  }

  function drawTexture(texture, opacity, textureTransform) {
    var program = screenProgram;
    gl.useProgram(program.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, program.a_pos, 2);

    glUtils.bindTexture(gl, texture, ctx.screenTextureUnit);
    gl.uniform1i(program.u_screen, ctx.screenTextureUnit);

    gl.uniform1f(program.u_opacity_border, 0.02);
    gl.uniform1f(program.u_opacity, opacity);
    gl.uniform3f(program.u_transform, textureTransform.dx, textureTransform.dy, textureTransform.scale);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawSimpleQuad(texture) {
    var program = simpleQuadProgram;
    gl.useProgram(program.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, program.a_pos, 2);

    glUtils.bindTexture(gl, texture, ctx.screenTextureUnit);
    gl.uniform1i(program.u_screen, ctx.screenTextureUnit);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

function getSimpleVertexShader() {
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

function getSimpleFragmentShader() {
  return `
precision highp float;
uniform sampler2D u_screen;
varying vec2 v_tex_pos;

void main() {
  vec2 p = 1.0 - v_tex_pos;
  gl_FragColor = texture2D(u_screen, p);
}
`;
}

function getScreenVertexShader() {
  return `// screen program
precision highp float;

attribute vec2 a_pos;
varying vec2 v_tex_pos;
uniform vec3 u_transform;

void main() {
    v_tex_pos = a_pos;
    vec2 pos = a_pos;

    pos.x = (pos.x - 0.5) / u_transform.z - u_transform.x + 0.5 * u_transform.z;
    pos.y = pos.y / u_transform.z + u_transform.y;

    pos = 1.0 - 2.0 * pos;
    gl_Position = vec4(pos, 0, 1);
}`;
}

function getScreenFragmentShader() {
  return `precision highp float;
uniform sampler2D u_screen;
uniform float u_opacity;
uniform float u_opacity_border;

varying vec2 v_tex_pos;

void main() {
  vec2 p = 1.0 - v_tex_pos;
  vec4 color = texture2D(u_screen, p);

  if (p.x < u_opacity_border || p.x > 1. - u_opacity_border || p.y < u_opacity_border || p.y > 1. - u_opacity_border) {
    gl_FragColor = vec4(0.);
  } else {
    gl_FragColor = vec4(floor(255.0 * color * u_opacity) / 255.0);
  }
}`;
}
