import { FieldSourceShaders } from './fieldSources';

export function createWebGPUParticleSystem(gpuContext, options = {}) {
  const { device, format } = gpuContext;
  
  const particleCount = options.particleCount || 10000;
  const particleResolution = Math.ceil(Math.sqrt(particleCount));
  const actualParticleCount = particleResolution * particleResolution;
  
  const params = {
    timeStep: options.timeStep || 0.01,
    dropProbability: options.dropProbability || 0.009,
    bbox: options.bbox || {
      minX: -4, minY: -4,
      maxX: 4, maxY: 4
    },
    fadeOpacity: options.fadeOpacity || 0.998,
    frame: 0,
    frameSeed: Math.random()
  };

  let positionTextures = [];
  let currentReadPosition = 0;

  function createPositionTextures() {
    positionTextures.forEach(t => t.destroy());
    positionTextures = [];
    
    for (let i = 0; i < 2; i++) {
      const texture = device.createTexture({
        size: { width: particleResolution, height: particleResolution, depthOrArrayLayers: 1 },
        format: 'rgba32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | 
               GPUTextureUsage.STORAGE_BINDING | 
               GPUTextureUsage.RENDER_ATTACHMENT |
               GPUTextureUsage.COPY_DST
      });
      positionTextures.push(texture);
    }
  }

  createPositionTextures();

  const paramsBuffer = device.createBuffer({
    size: 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const fieldSourcesBuffer = device.createBuffer({
    size: 16 * 9 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  const quadVertexBuffer = device.createBuffer({
    size: 4 * 4 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true
  });
  const quadVertices = new Float32Array(quadVertexBuffer.getMappedRange());
  quadVertices.set([
    -1.0, -1.0, 0.0, 0.0,
     1.0, -1.0, 1.0, 0.0,
    -1.0,  1.0, 0.0, 1.0,
     1.0,  1.0, 1.0, 1.0
  ]);
  quadVertexBuffer.unmap();

  const screenTexture = device.createTexture({
    size: { width: gpuContext.canvas.width, height: gpuContext.canvas.height, depthOrArrayLayers: 1 },
    format: format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
  });

  const integrationShader = device.createShaderModule({
    code: getIntegrationShader()
  });

  const particleDrawShader = device.createShaderModule({
    code: getParticleDrawShader()
  });

  const fadeShader = device.createShaderModule({
    code: getFadeShader()
  });

  const fieldSourceBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' }
      }
    ]
  });

  const fieldSourceBindGroup = device.createBindGroup({
    layout: fieldSourceBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: fieldSourcesBuffer } }
    ]
  });

  const integrationBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'unfilterable-float' }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { format: 'rgba32float', access: 'write-only' }
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform' }
      }
    ]
  });

  let integrationBindGroups = [];

  function createIntegrationBindGroups() {
    integrationBindGroups = [];
    for (let i = 0; i < 2; i++) {
      const bindGroup = device.createBindGroup({
        layout: integrationBindGroupLayout,
        entries: [
          { binding: 0, resource: positionTextures[i].createView() },
          { binding: 1, resource: positionTextures[1 - i].createView() },
          { binding: 2, resource: { buffer: paramsBuffer } }
        ]
      });
      integrationBindGroups.push(bindGroup);
    }
  }

  createIntegrationBindGroups();

  const integrationPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [integrationBindGroupLayout, fieldSourceBindGroupLayout]
    }),
    compute: {
      module: integrationShader,
      entryPoint: 'main'
    }
  });

  const particleIndexBuffer = device.createBuffer({
    size: actualParticleCount * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true
  });
  const indices = new Float32Array(particleIndexBuffer.getMappedRange());
  for (let i = 0; i < actualParticleCount; i++) {
    indices[i] = i;
  }
  particleIndexBuffer.unmap();

  const particleDrawPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: particleDrawShader,
      entryPoint: 'vs_main',
      buffers: [{
        arrayStride: 4,
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32' }]
      }]
    },
    fragment: {
      module: particleDrawShader,
      entryPoint: 'fs_main',
      targets: [{ format }]
    },
    primitive: { topology: 'point-list' }
  });

  const fadePipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: fadeShader,
      entryPoint: 'vs_main'
    },
    fragment: {
      module: fadeShader,
      entryPoint: 'fs_main',
      targets: [{ format }]
    },
    primitive: { topology: 'triangle-list' }
  });

  let particleDrawBindGroup;
  let fadeBindGroup;

  function createDrawBindGroups() {
    particleDrawBindGroup = device.createBindGroup({
      layout: particleDrawPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: positionTextures[currentReadPosition].createView() },
        { binding: 1, resource: { buffer: paramsBuffer } }
      ]
    });

    fadeBindGroup = device.createBindGroup({
      layout: fadePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: screenTexture.createView() },
        { binding: 1, resource: { buffer: paramsBuffer } }
      ]
    });
  }

  createDrawBindGroups();

  let rdSystem = null;

  function updateParamsBuffer() {
    const data = new Float32Array([
      params.timeStep,
      params.dropProbability,
      params.frame,
      params.frameSeed,
      params.bbox.minX,
      params.bbox.minY,
      params.bbox.maxX,
      params.bbox.maxY,
      params.fadeOpacity,
      particleResolution,
      actualParticleCount,
      0.0,
      0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0
    ]);
    device.queue.writeBuffer(paramsBuffer, 0, data);
  }

  updateParamsBuffer();

  function initializeParticles() {
    const commandEncoder = device.createCommandEncoder();
    
    const initData = new Float32Array(actualParticleCount * 4);
    const width = params.bbox.maxX - params.bbox.minX;
    const height = params.bbox.maxY - params.bbox.minY;
    
    for (let i = 0; i < actualParticleCount; i++) {
      const offset = i * 4;
      initData[offset + 0] = Math.random() * width + params.bbox.minX;
      initData[offset + 1] = Math.random() * height + params.bbox.minY;
      initData[offset + 2] = 0.0;
      initData[offset + 3] = 1.0;
    }

    const stagingBuffer = device.createBuffer({
      size: initData.byteLength,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true
    });
    new Float32Array(stagingBuffer.getMappedRange()).set(initData);
    stagingBuffer.unmap();

    for (let i = 0; i < 2; i++) {
      commandEncoder.copyBufferToTexture(
        { buffer: stagingBuffer, bytesPerRow: particleResolution * 16 },
        { texture: positionTextures[i] },
        { width: particleResolution, height: particleResolution, depthOrArrayLayers: 1 }
      );
    }

    device.queue.submit([commandEncoder.finish()]);
    stagingBuffer.destroy();
  }

  const api = {
    params,
    particleCount: actualParticleCount,
    particleResolution,
    
    setTimeStep(step) {
      params.timeStep = step;
      updateParamsBuffer();
    },
    
    setDropProbability(prob) {
      params.dropProbability = prob;
      updateParamsBuffer();
    },
    
    setBBox(bbox) {
      params.bbox = { ...bbox };
      updateParamsBuffer();
    },
    
    setFadeOpacity(opacity) {
      params.fadeOpacity = opacity;
      updateParamsBuffer();
    },
    
    setFieldSources(fieldSourcesData) {
      device.queue.writeBuffer(fieldSourcesBuffer, 0, fieldSourcesData);
    },
    
    setReactionDiffusionSystem(rd) {
      rdSystem = rd;
    },
    
    update(commandEncoder) {
      params.frame += 1;
      params.frameSeed = Math.random();
      updateParamsBuffer();
      
      const computePass = commandEncoder.beginComputePass();
      computePass.setPipeline(integrationPipeline);
      computePass.setBindGroup(0, integrationBindGroups[currentReadPosition]);
      computePass.setBindGroup(1, fieldSourceBindGroup);
      computePass.dispatchWorkgroups(
        Math.ceil(particleResolution / 16),
        Math.ceil(particleResolution / 16)
      );
      computePass.end();
      
      currentReadPosition = 1 - currentReadPosition;
      createDrawBindGroups();
    },
    
    render(commandEncoder, targetTexture) {
      const fadePass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: screenTexture.createView(),
          loadOp: 'load',
          storeOp: 'store'
        }]
      });
      
      fadePass.setPipeline(fadePipeline);
      fadePass.setBindGroup(0, fadeBindGroup);
      fadePass.setVertexBuffer(0, quadVertexBuffer);
      fadePass.draw(4);
      fadePass.end();
      
      const particlePass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: screenTexture.createView(),
          loadOp: 'load',
          storeOp: 'store'
        }]
      });
      
      particlePass.setPipeline(particleDrawPipeline);
      particlePass.setBindGroup(0, particleDrawBindGroup);
      particlePass.setVertexBuffer(0, particleIndexBuffer);
      particlePass.draw(actualParticleCount);
      particlePass.end();
      
      if (rdSystem && rdSystem.isEnabled()) {
        rdSystem.render(commandEncoder, screenTexture);
      }
      
      const finalPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: targetTexture.createView(),
          loadOp: 'clear',
          clearValue: { r: 0.075, g: 0.161, b: 0.31, a: 1.0 },
          storeOp: 'store'
        }]
      });
      
      finalPass.setPipeline(fadePipeline);
      finalPass.setBindGroup(0, device.createBindGroup({
        layout: fadePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: screenTexture.createView() },
          { binding: 1, resource: { buffer: paramsBuffer } }
        ]
      }));
      finalPass.setVertexBuffer(0, quadVertexBuffer);
      finalPass.draw(4);
      finalPass.end();
    },
    
    clearScreen(commandEncoder) {
      const pass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: screenTexture.createView(),
          loadOp: 'clear',
          clearValue: { r: 0.075, g: 0.161, b: 0.31, a: 1.0 },
          storeOp: 'store'
        }]
      });
      pass.end();
    },
    
    initialize: initializeParticles,
    
    resize(width, height) {
      screenTexture.destroy();
      screenTexture = device.createTexture({
        size: { width, height, depthOrArrayLayers: 1 },
        format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      });
      createDrawBindGroups();
    },
    
    dispose() {
      positionTextures.forEach(t => t.destroy());
      paramsBuffer.destroy();
      fieldSourcesBuffer.destroy();
      quadVertexBuffer.destroy();
      particleIndexBuffer.destroy();
      screenTexture.destroy();
    }
  };

  initializeParticles();
  return api;
}

function getIntegrationShader() {
  return `
${FieldSourceShaders.struct}

struct Params {
  timeStep: f32,
  dropProbability: f32,
  frame: f32,
  frameSeed: f32,
  bboxMinX: f32,
  bboxMinY: f32,
  bboxMaxX: f32,
  bboxMaxY: f32,
  fadeOpacity: f32,
  particleResolution: f32,
  particleCount: f32,
  padding: f32
};

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> params: Params;

@group(1) @binding(0) var<storage, read> fieldSources: array<FieldSource>;

fn rand(seed: vec2f) -> f32 {
  let t = dot(vec2f(12.9898, 78.233), seed);
  return fract(sin(t) * 4375.85453);
}

${FieldSourceShaders.computeVelocity}

fn get_velocity(pos: vec2f) -> vec2f {
  var velocity = sumFieldSources(pos, fieldSources);
  
  if (velocity.x == 0.0 && velocity.y == 0.0) {
    let t = params.frame * 0.01;
    velocity = vec2f(
      0.1 * pos.y - 0.05 * pos.x,
      -0.2 * pos.y + 0.05 * pos.x
    );
  }
  
  return velocity;
}

fn rk4(point: vec2f, h: f32) -> vec2f {
  let k1 = get_velocity(point);
  let k2 = get_velocity(point + k1 * h * 0.5);
  let k3 = get_velocity(point + k2 * h * 0.5);
  let k4 = get_velocity(point + k3 * h);
  
  return (k1 + 2.0 * k2 + 2.0 * k3 + k4) * h / 6.0;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let coord = vec2i(global_id.xy);
  let texSize = textureDimensions(inputTex);
  
  if (coord.x >= texSize.x || coord.y >= texSize.y) {
    return;
  }
  
  var pos = textureLoad(inputTex, coord, 0).xy;
  
  let seed = (pos + vec2f(f32(coord.x), f32(coord.y)) / params.particleResolution) * params.frameSeed;
  let drop = step(1.0 - params.dropProbability, rand(seed));
  
  let bboxMin = vec2f(params.bboxMinX, params.bboxMinY);
  let bboxMax = vec2f(params.bboxMaxX, params.bboxMaxY);
  let bboxSize = bboxMax - bboxMin;
  
  let randomPos = vec2f(
    rand(seed + 1.9),
    rand(seed + 8.4)
  ) * bboxSize + bboxMin;
  
  pos = mix(pos, randomPos, drop);
  
  let velocity = rk4(pos, params.timeStep);
  var newPos = pos + velocity;
  
  newPos = clamp(newPos, bboxMin, bboxMax);
  
  textureStore(outputTex, coord, vec4f(newPos, 0.0, 1.0));
}
`;
}

function getParticleDrawShader() {
  return `
struct Params {
  timeStep: f32,
  dropProbability: f32,
  frame: f32,
  frameSeed: f32,
  bboxMinX: f32,
  bboxMinY: f32,
  bboxMaxX: f32,
  bboxMaxY: f32,
  fadeOpacity: f32,
  particleResolution: f32,
  particleCount: f32,
  padding: f32
};

@group(0) @binding(0) var positionTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec3f
};

fn hsl2rgb(hsl: vec3f) -> vec3f {
  let h = hsl.x;
  let s = hsl.y;
  let l = hsl.z;
  
  let C = (1.0 - abs(2.0 * l - 1.0)) * s;
  let X = C * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  let m = l - C * 0.5;
  
  var rgb: vec3f;
  if (h < 1.0/6.0) {
    rgb = vec3f(C, X, 0.0);
  } else if (h < 2.0/6.0) {
    rgb = vec3f(X, C, 0.0);
  } else if (h < 3.0/6.0) {
    rgb = vec3f(0.0, C, X);
  } else if (h < 4.0/6.0) {
    rgb = vec3f(0.0, X, C);
  } else if (h < 5.0/6.0) {
    rgb = vec3f(X, 0.0, C);
  } else {
    rgb = vec3f(C, 0.0, X);
  }
  
  return rgb + m;
}

@vertex
fn vs_main(@location(0) index: f32) -> VertexOutput {
  let resolution = u32(params.particleResolution);
  let x = u32(index) % resolution;
  let y = u32(index) / resolution;
  
  let pos = textureLoad(positionTex, vec2i(x, y), 0).xy;
  
  let bboxMin = vec2f(params.bboxMinX, params.bboxMinY);
  let bboxMax = vec2f(params.bboxMaxX, params.bboxMaxY);
  
  let normalizedPos = (pos - bboxMin) / (bboxMax - bboxMin) * 2.0 - 1.0;
  
  var output: VertexOutput;
  output.position = vec4f(normalizedPos.x, -normalizedPos.y, 0.0, 1.0);
  output.uv = (normalizedPos + 1.0) * 0.5;
  
  let hue = (normalizedPos.x + normalizedPos.y) * 0.25 + 0.5;
  let sat = 0.8;
  let light = 0.6;
  output.color = hsl2rgb(vec3f(hue, sat, light));
  
  return output;
}

@fragment
fn fs_main(@location(0) uv: vec2f, @location(1) color: vec3f) -> @location(0) vec4f {
  return vec4f(color, 0.8);
}
`;
}

function getFadeShader() {
  return `
struct Params {
  timeStep: f32,
  dropProbability: f32,
  frame: f32,
  frameSeed: f32,
  bboxMinX: f32,
  bboxMinY: f32,
  bboxMaxX: f32,
  bboxMaxY: f32,
  fadeOpacity: f32,
  particleResolution: f32,
  particleCount: f32,
  padding: f32
};

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f
};

@vertex
fn vs_main(@location(0) vertex: vec4f) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(vertex.xy, 0.0, 1.0);
  output.uv = vertex.zw;
  return output;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let texSize = vec2f(textureDimensions(inputTex));
  let color = textureLoad(inputTex, vec2i(uv * texSize), 0);
  return vec4f(color.rgb * params.fadeOpacity, 1.0);
}
`;
}

export default createWebGPUParticleSystem;
