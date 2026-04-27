import glUtils from '../gl-utils';

const CRITICAL_POINT_RESOLUTION = 128;
const THRESHOLD_VELOCITY = 0.001;
const THRESHOLD_DIVERGENCE = 0.01;

const CRITICAL_TYPES = {
  SOURCE: 1,
  SINK: 2,
  SADDLE: 3,
  SPIRAL_SOURCE: 4,
  SPIRAL_SINK: 5,
  CENTER: 6
};

export default function createVectorFieldTopology(ctx) {
  const { gl, framebuffer } = ctx;
  
  let enabled = false;
  let showCriticalPoints = true;
  let showSeparatrices = true;
  let pointSize = 8.0;
  let lineWidth = 2.0;
  
  let velocityFieldTexture = null;
  let jacobianTexture = null;
  let criticalPointsTexture = null;
  
  let computeVelocityProgram;
  let computeJacobianProgram;
  let detectCriticalPointsProgram;
  let drawCriticalPointsProgram;
  let drawSeparatricesProgram;
  
  let criticalPoints = [];
  let separatrices = [];
  
  let bbox = { minX: -5, maxX: 5, minY: -5, maxY: 5 };
  
  initPrograms();
  initTextures();
  
  const api = {
    setEnabled,
    setShowCriticalPoints,
    setShowSeparatrices,
    setPointSize,
    setLineWidth,
    updateBBox,
    computeTopology,
    draw,
    getCriticalPoints: () => criticalPoints,
    getEnabled: () => enabled,
    getShowCriticalPoints: () => showCriticalPoints,
    getShowSeparatrices: () => showSeparatrices
  };
  
  return api;
  
  function initPrograms() {
    computeVelocityProgram = glUtils.createProgram(
      gl,
      getVertexShader(),
      getVelocityFragmentShader()
    );
    
    computeJacobianProgram = glUtils.createProgram(
      gl,
      getVertexShader(),
      getJacobianFragmentShader()
    );
    
    detectCriticalPointsProgram = glUtils.createProgram(
      gl,
      getVertexShader(),
      getCriticalPointsFragmentShader()
    );
    
    drawCriticalPointsProgram = glUtils.createProgram(
      gl,
      getCriticalPointsVertexShader(),
      getCriticalPointsFragmentShaderDraw()
    );
    
    drawSeparatricesProgram = glUtils.createProgram(
      gl,
      getSeparatricesVertexShader(),
      getSeparatricesFragmentShader()
    );
  }
  
  function initTextures() {
    const emptyPixels = new Uint8Array(CRITICAL_POINT_RESOLUTION * CRITICAL_POINT_RESOLUTION * 4);
    
    if (velocityFieldTexture) gl.deleteTexture(velocityFieldTexture);
    velocityFieldTexture = glUtils.createTexture(gl, gl.LINEAR, emptyPixels, CRITICAL_POINT_RESOLUTION, CRITICAL_POINT_RESOLUTION);
    
    if (jacobianTexture) gl.deleteTexture(jacobianTexture);
    jacobianTexture = glUtils.createTexture(gl, gl.LINEAR, emptyPixels, CRITICAL_POINT_RESOLUTION, CRITICAL_POINT_RESOLUTION);
    
    if (criticalPointsTexture) gl.deleteTexture(criticalPointsTexture);
    criticalPointsTexture = glUtils.createTexture(gl, gl.LINEAR, emptyPixels, CRITICAL_POINT_RESOLUTION, CRITICAL_POINT_RESOLUTION);
  }
  
  function updateBBox(newBbox) {
    bbox = { ...newBbox };
  }
  
  function setEnabled(value) {
    enabled = value;
  }
  
  function setShowCriticalPoints(value) {
    showCriticalPoints = value;
  }
  
  function setShowSeparatrices(value) {
    showSeparatrices = value;
  }
  
  function setPointSize(value) {
    pointSize = Math.max(2, Math.min(30, value));
  }
  
  function setLineWidth(value) {
    lineWidth = Math.max(0.5, Math.min(10, value));
  }
  
  function computeTopology(vectorFieldCode) {
    if (!enabled) return;
    
    const { minX, maxX, minY, maxY } = bbox;
    
    glUtils.bindFramebuffer(gl, framebuffer, velocityFieldTexture);
    gl.viewport(0, 0, CRITICAL_POINT_RESOLUTION, CRITICAL_POINT_RESOLUTION);
    
    gl.useProgram(computeVelocityProgram.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, computeVelocityProgram.a_pos, 2);
    
    gl.uniform2f(computeVelocityProgram.u_min, minX, minY);
    gl.uniform2f(computeVelocityProgram.u_max, maxX, maxY);
    gl.uniform1f(computeVelocityProgram.frame, ctx.frame);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    glUtils.bindFramebuffer(gl, framebuffer, jacobianTexture);
    
    gl.useProgram(computeJacobianProgram.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, computeJacobianProgram.a_pos, 2);
    
    glUtils.bindTexture(gl, velocityFieldTexture, 0);
    gl.uniform1i(computeJacobianProgram.u_velocity, 0);
    gl.uniform2f(computeJacobianProgram.u_resolution, CRITICAL_POINT_RESOLUTION, CRITICAL_POINT_RESOLUTION);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    glUtils.bindFramebuffer(gl, framebuffer, criticalPointsTexture);
    
    gl.useProgram(detectCriticalPointsProgram.program);
    glUtils.bindAttribute(gl, ctx.quadBuffer, detectCriticalPointsProgram.a_pos, 2);
    
    glUtils.bindTexture(gl, velocityFieldTexture, 0);
    gl.uniform1i(detectCriticalPointsProgram.u_velocity, 0);
    
    glUtils.bindTexture(gl, jacobianTexture, 1);
    gl.uniform1i(detectCriticalPointsProgram.u_jacobian, 1);
    
    gl.uniform1f(detectCriticalPointsProgram.u_threshold_velocity, THRESHOLD_VELOCITY);
    gl.uniform1f(detectCriticalPointsProgram.u_threshold_divergence, THRESHOLD_DIVERGENCE);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    extractCriticalPoints();
    computeSeparatrices();
  }
  
  function extractCriticalPoints() {
    criticalPoints = [];
    
    const pixels = new Uint8Array(CRITICAL_POINT_RESOLUTION * CRITICAL_POINT_RESOLUTION * 4);
    
    glUtils.bindFramebuffer(gl, framebuffer, criticalPointsTexture);
    gl.readPixels(0, 0, CRITICAL_POINT_RESOLUTION, CRITICAL_POINT_RESOLUTION, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    glUtils.bindFramebuffer(gl, framebuffer, null);
    
    const { minX, maxX, minY, maxY } = bbox;
    const width = maxX - minX;
    const height = maxY - minY;
    
    for (let y = 0; y < CRITICAL_POINT_RESOLUTION; y++) {
      for (let x = 0; x < CRITICAL_POINT_RESOLUTION; x++) {
        const idx = (y * CRITICAL_POINT_RESOLUTION + x) * 4;
        const type = pixels[idx];
        const confidence = pixels[idx + 1] / 255;
        
        if (type > 0 && confidence > 0.5) {
          const px = minX + (x / CRITICAL_POINT_RESOLUTION) * width;
          const py = minY + (1 - y / CRITICAL_POINT_RESOLUTION) * height;
          
          criticalPoints.push({
            x: px,
            y: py,
            type: type,
            typeName: getTypeName(type),
            confidence: confidence,
            color: getTypeColor(type)
          });
        }
      }
    }
  }
  
  function computeSeparatrices() {
    separatrices = [];
    
    for (const point of criticalPoints) {
      if (point.type === CRITICAL_TYPES.SADDLE) {
        const separatrix = computeSaddleSeparatrix(point);
        if (separatrix.length > 0) {
          separatrices.push({
            points: separatrix,
            type: 'separatrix',
            color: [1.0, 0.5, 0.0, 0.8]
          });
        }
      }
    }
  }
  
  function computeSaddleSeparatrix(point) {
    const points = [];
    const steps = 50;
    const stepSize = 0.05;
    
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];
    
    for (const dir of directions) {
      let px = point.x;
      let py = point.y;
      const linePoints = [{ x: px, y: py }];
      
      for (let i = 0; i < steps; i++) {
        px += dir.dx * stepSize;
        py += dir.dy * stepSize;
        
        const { minX, maxX, minY, maxY } = bbox;
        if (px < minX || px > maxX || py < minY || py > maxY) break;
        
        linePoints.push({ x: px, y: py });
      }
      
      if (linePoints.length > 2) {
        points.push(linePoints);
      }
    }
    
    return points;
  }
  
  function draw() {
    if (!enabled) return;
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    if (showSeparatrices && separatrices.length > 0) {
      drawSeparatrices();
    }
    
    if (showCriticalPoints && criticalPoints.length > 0) {
      drawCriticalPoints();
    }
    
    gl.disable(gl.BLEND);
  }
  
  function drawCriticalPoints() {
    const { minX, maxX, minY, maxY } = bbox;
    const width = maxX - minX;
    const height = maxY - minY;
    
    const positions = [];
    const colors = [];
    
    for (const point of criticalPoints) {
      const nx = (point.x - minX) / width;
      const ny = 1 - (point.y - minY) / height;
      
      positions.push(nx * 2 - 1, 1 - ny * 2);
      colors.push(point.color[0], point.color[1], point.color[2], point.color[3]);
    }
    
    if (positions.length === 0) return;
    
    const positionBuffer = glUtils.createBuffer(gl, new Float32Array(positions));
    const colorBuffer = glUtils.createBuffer(gl, new Float32Array(colors));
    
    gl.useProgram(drawCriticalPointsProgram.program);
    
    glUtils.bindAttribute(gl, positionBuffer, drawCriticalPointsProgram.a_position, 2);
    glUtils.bindAttribute(gl, colorBuffer, drawCriticalPointsProgram.a_color, 4);
    
    gl.uniform1f(drawCriticalPointsProgram.u_point_size, pointSize);
    
    gl.drawArrays(gl.POINTS, 0, criticalPoints.length);
    
    gl.deleteBuffer(positionBuffer);
    gl.deleteBuffer(colorBuffer);
  }
  
  function drawSeparatrices() {
    const { minX, maxX, minY, maxY } = bbox;
    const width = maxX - minX;
    const height = maxY - minY;
    
    for (const separatrix of separatrices) {
      for (const line of separatrix.points) {
        const positions = [];
        
        for (const point of line) {
          const nx = (point.x - minX) / width;
          const ny = 1 - (point.y - minY) / height;
          
          positions.push(nx * 2 - 1, 1 - ny * 2);
        }
        
        if (positions.length < 4) continue;
        
        const positionBuffer = glUtils.createBuffer(gl, new Float32Array(positions));
        
        gl.lineWidth(lineWidth);
        gl.useProgram(drawSeparatricesProgram.program);
        
        glUtils.bindAttribute(gl, positionBuffer, drawSeparatricesProgram.a_position, 2);
        
        gl.uniform4f(
          drawSeparatricesProgram.u_color,
          separatrix.color[0],
          separatrix.color[1],
          separatrix.color[2],
          separatrix.color[3]
        );
        
        gl.drawArrays(gl.LINE_STRIP, 0, line.length);
        
        gl.deleteBuffer(positionBuffer);
      }
    }
  }
  
  function getTypeName(type) {
    switch (type) {
      case CRITICAL_TYPES.SOURCE: return 'Source';
      case CRITICAL_TYPES.SINK: return 'Sink';
      case CRITICAL_TYPES.SADDLE: return 'Saddle';
      case CRITICAL_TYPES.SPIRAL_SOURCE: return 'Spiral Source';
      case CRITICAL_TYPES.SPIRAL_SINK: return 'Spiral Sink';
      case CRITICAL_TYPES.CENTER: return 'Center';
      default: return 'Unknown';
    }
  }
  
  function getTypeColor(type) {
    switch (type) {
      case CRITICAL_TYPES.SOURCE: return [0.0, 1.0, 0.0, 0.9];
      case CRITICAL_TYPES.SINK: return [1.0, 0.0, 0.0, 0.9];
      case CRITICAL_TYPES.SADDLE: return [1.0, 0.5, 0.0, 0.9];
      case CRITICAL_TYPES.SPIRAL_SOURCE: return [0.0, 1.0, 1.0, 0.9];
      case CRITICAL_TYPES.SPIRAL_SINK: return [1.0, 0.0, 1.0, 0.9];
      case CRITICAL_TYPES.CENTER: return [1.0, 1.0, 0.0, 0.9];
      default: return [0.5, 0.5, 0.5, 0.9];
    }
  }
}

function getVertexShader() {
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

function getVelocityFragmentShader() {
  return `
precision highp float;
uniform vec2 u_min;
uniform vec2 u_max;
uniform float frame;
varying vec2 v_tex_pos;

const float PI = 3.1415926535897932384626433832795;

vec2 get_velocity(vec2 p) {
  float r = length(p);
  float theta = atan(p.y, p.x);
  
  return vec2(cos(theta) * r * 0.1, sin(theta) * r * 0.1);
}

void main() {
  vec2 uv = v_tex_pos;
  vec2 p = u_min + uv * (u_max - u_min);
  vec2 v = get_velocity(p);
  
  float speed = length(v);
  vec2 normalized_v = speed > 0.0 ? v / speed : vec2(0.0);
  
  gl_FragColor = vec4(
    normalized_v * 0.5 + 0.5,
    min(speed, 1.0),
    1.0
  );
}
`;
}

function getJacobianFragmentShader() {
  return `
precision highp float;
uniform sampler2D u_velocity;
uniform vec2 u_resolution;
varying vec2 v_tex_pos;

void main() {
  vec2 texel = 1.0 / u_resolution;
  
  vec2 v_center = texture2D(u_velocity, v_tex_pos).xy * 2.0 - 1.0;
  vec2 v_right = texture2D(u_velocity, v_tex_pos + vec2(texel.x, 0.0)).xy * 2.0 - 1.0;
  vec2 v_left = texture2D(u_velocity, v_tex_pos - vec2(texel.x, 0.0)).xy * 2.0 - 1.0;
  vec2 v_up = texture2D(u_velocity, v_tex_pos + vec2(0.0, texel.y)).xy * 2.0 - 1.0;
  vec2 v_down = texture2D(u_velocity, v_tex_pos - vec2(0.0, texel.y)).xy * 2.0 - 1.0;
  
  float dvx_dx = (v_right.x - v_left.x) / (2.0 * texel.x);
  float dvx_dy = (v_up.x - v_down.x) / (2.0 * texel.y);
  float dvy_dx = (v_right.y - v_left.y) / (2.0 * texel.x);
  float dvy_dy = (v_up.y - v_down.y) / (2.0 * texel.y);
  
  float divergence = dvx_dx + dvy_dy;
  float curl = dvy_dx - dvx_dy;
  
  float trace = dvx_dx + dvy_dy;
  float det = dvx_dx * dvy_dy - dvx_dy * dvy_dx;
  
  gl_FragColor = vec4(
    divergence * 0.5 + 0.5,
    curl * 0.5 + 0.5,
    trace * 0.5 + 0.5,
    det * 0.5 + 0.5
  );
}
`;
}

function getCriticalPointsFragmentShader() {
  return `
precision highp float;
uniform sampler2D u_velocity;
uniform sampler2D u_jacobian;
uniform float u_threshold_velocity;
uniform float u_threshold_divergence;
varying vec2 v_tex_pos;

const int TYPE_SOURCE = 1;
const int TYPE_SINK = 2;
const int TYPE_SADDLE = 3;
const int TYPE_SPIRAL_SOURCE = 4;
const int TYPE_SPIRAL_SINK = 5;
const int TYPE_CENTER = 6;

void main() {
  vec4 velocity = texture2D(u_velocity, v_tex_pos);
  vec2 v = velocity.xy * 2.0 - 1.0;
  float speed = velocity.z;
  
  vec4 jacobian = texture2D(u_jacobian, v_tex_pos);
  float divergence = (jacobian.x - 0.5) * 2.0;
  float curl = (jacobian.y - 0.5) * 2.0;
  float trace = (jacobian.z - 0.5) * 2.0;
  float det = (jacobian.w - 0.5) * 2.0;
  
  float discriminant = trace * trace - 4.0 * det;
  
  float type = 0.0;
  float confidence = 0.0;
  
  if (speed < u_threshold_velocity) {
    confidence = 1.0 - speed / u_threshold_velocity;
    
    if (discriminant > 0.0) {
      float lambda1 = (trace + sqrt(discriminant)) / 2.0;
      float lambda2 = (trace - sqrt(discriminant)) / 2.0;
      
      if (lambda1 > 0.0 && lambda2 > 0.0) {
        type = float(TYPE_SOURCE);
      } else if (lambda1 < 0.0 && lambda2 < 0.0) {
        type = float(TYPE_SINK);
      } else {
        type = float(TYPE_SADDLE);
      }
    } else {
      float realPart = trace / 2.0;
      float imagPart = sqrt(-discriminant) / 2.0;
      
      if (abs(realPart) < 0.01 && abs(imagPart) > 0.01) {
        type = float(TYPE_CENTER);
      } else if (realPart > 0.0) {
        type = float(TYPE_SPIRAL_SOURCE);
      } else if (realPart < 0.0) {
        type = float(TYPE_SPIRAL_SINK);
      }
    }
  }
  
  gl_FragColor = vec4(type, confidence * 255.0, 0.0, 1.0);
}
`;
}

function getCriticalPointsVertexShader() {
  return `
precision highp float;
attribute vec2 a_position;
attribute vec4 a_color;
uniform float u_point_size;
varying vec4 v_color;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  gl_PointSize = u_point_size;
  v_color = a_color;
}
`;
}

function getCriticalPointsFragmentShaderDraw() {
  return `
precision highp float;
varying vec4 v_color;

void main() {
  float dist = length(gl_PointCoord - vec2(0.5));
  
  if (dist > 0.5) {
    discard;
  }
  
  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
  gl_FragColor = vec4(v_color.rgb, v_color.a * alpha);
}
`;
}

function getSeparatricesVertexShader() {
  return `
precision highp float;
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
}

function getSeparatricesFragmentShader() {
  return `
precision highp float;
uniform vec4 u_color;

void main() {
  gl_FragColor = u_color;
}
`;
}
