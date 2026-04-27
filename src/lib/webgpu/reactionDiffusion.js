export function createReactionDiffusionSystem(gpuContext, width, height) {
  const { device } = gpuContext;
  
  const params = {
    feed: 0.055,
    kill: 0.062,
    diffusionRateA: 1.0,
    diffusionRateB: 0.5,
    timeStep: 1.0,
    enabled: true
  };

  let textures = [];
  let currentRead = 0;
  
  function createTextures() {
    textures.forEach(t => t.destroy());
    textures = [];
    
    for (let i = 0; i < 2; i++) {
      const texture = device.createTexture({
        size: { width, height, depthOrArrayLayers: 1 },
        format: 'rgba16float',
        usage: GPUTextureUsage.TEXTURE_BINDING | 
               GPUTextureUsage.STORAGE_BINDING | 
               GPUTextureUsage.RENDER_ATTACHMENT |
               GPUTextureUsage.COPY_DST
      });
      textures.push(texture);
    }
  }

  createTextures();

  const simulationShader = device.createShaderModule({
    code: getSimulationShader()
  });

  const initShader = device.createShaderModule({
    code: getInitShader()
  });

  const visualizationShader = device.createShaderModule({
    code: getVisualizationShader()
  });

  const simulationBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'float' }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { format: 'rgba16float', access: 'write-only' }
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform' }
      }
    ]
  });

  const paramsBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  let simulationBindGroups = [];

  function createBindGroups() {
    simulationBindGroups = [];
    for (let i = 0; i < 2; i++) {
      const bindGroup = device.createBindGroup({
        layout: simulationBindGroupLayout,
        entries: [
          { binding: 0, resource: textures[i].createView() },
          { binding: 1, resource: textures[1 - i].createView() },
          { binding: 2, resource: { buffer: paramsBuffer } }
        ]
      });
      simulationBindGroups.push(bindGroup);
    }
  }

  createBindGroups();

  const simulationPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [simulationBindGroupLayout]
    }),
    compute: {
      module: simulationShader,
      entryPoint: 'main'
    }
  });

  const initPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: initShader,
      entryPoint: 'vs_main'
    },
    fragment: {
      module: initShader,
      entryPoint: 'fs_main',
      targets: [{ format: 'rgba16float' }]
    },
    primitive: { topology: 'triangle-list' }
  });

  const visualizationPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: visualizationShader,
      entryPoint: 'vs_main'
    },
    fragment: {
      module: visualizationShader,
      entryPoint: 'fs_main',
      targets: [{ format: gpuContext.format }]
    },
    primitive: { topology: 'triangle-list' }
  });

  const visualizationBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' }
      }
    ]
  });

  let visualizationBindGroup;

  function updateVisualizationBindGroup() {
    visualizationBindGroup = device.createBindGroup({
      layout: visualizationBindGroupLayout,
      entries: [
        { binding: 0, resource: textures[currentRead].createView() }
      ]
    });
  }

  updateVisualizationBindGroup();

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

  function updateParamsBuffer() {
    const data = new Float32Array([
      params.feed,
      params.kill,
      params.diffusionRateA,
      params.diffusionRateB,
      params.timeStep,
      width,
      height,
      0.0
    ]);
    device.queue.writeBuffer(paramsBuffer, 0, data);
  }

  updateParamsBuffer();

  function initialize() {
    const commandEncoder = device.createCommandEncoder();
    
    for (let i = 0; i < 2; i++) {
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textures[i].createView(),
          clearValue: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      
      renderPass.setPipeline(initPipeline);
      renderPass.setVertexBuffer(0, quadVertexBuffer);
      renderPass.draw(4);
      renderPass.end();
    }
    
    device.queue.submit([commandEncoder.finish()]);
  }

  const api = {
    params,
    textures,
    
    setFeed(feed) {
      params.feed = feed;
      updateParamsBuffer();
    },
    
    setKill(kill) {
      params.kill = kill;
      updateParamsBuffer();
    },
    
    setDiffusionRateA(rate) {
      params.diffusionRateA = rate;
      updateParamsBuffer();
    },
    
    setDiffusionRateB(rate) {
      params.diffusionRateB = rate;
      updateParamsBuffer();
    },
    
    setTimeStep(step) {
      params.timeStep = step;
      updateParamsBuffer();
    },
    
    setEnabled(enabled) {
      params.enabled = enabled;
    },
    
    isEnabled() {
      return params.enabled;
    },
    
    step(commandEncoder, steps = 1) {
      if (!params.enabled) return;
      
      for (let i = 0; i < steps; i++) {
        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(simulationPipeline);
        pass.setBindGroup(0, simulationBindGroups[currentRead]);
        pass.dispatchWorkgroups(Math.ceil(width / 16), Math.ceil(height / 16));
        pass.end();
        
        currentRead = 1 - currentRead;
      }
      
      updateVisualizationBindGroup();
    },
    
    render(commandEncoder, targetTexture) {
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: targetTexture.createView(),
          loadOp: 'load',
          storeOp: 'store'
        }]
      });
      
      renderPass.setPipeline(visualizationPipeline);
      renderPass.setBindGroup(0, visualizationBindGroup);
      renderPass.setVertexBuffer(0, quadVertexBuffer);
      renderPass.draw(4);
      renderPass.end();
    },
    
    getReadTexture() {
      return textures[currentRead];
    },
    
    initialize,
    
    addSeed(x, y, radius = 20, concentrationB = 1.0) {
      const commandEncoder = device.createCommandEncoder();
      const tempTexture = device.createTexture({
        size: { width, height, depthOrArrayLayers: 1 },
        format: 'rgba16float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
      });
      
      commandEncoder.copyTextureToTexture(
        { texture: textures[currentRead] },
        { texture: tempTexture },
        { width, height, depthOrArrayLayers: 1 }
      );
      
      const seedPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: device.createShaderModule({
            code: getSeedShader()
          }),
          entryPoint: 'vs_main'
        },
        fragment: {
          module: device.createShaderModule({
            code: getSeedShader()
          }),
          entryPoint: 'fs_main'
        },
        primitive: { topology: 'triangle-list' }
      });
      
      const seedParamsBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      
      device.queue.writeBuffer(seedParamsBuffer, 0, new Float32Array([x, y, radius, concentrationB]));
      
      const seedBindGroup = device.createBindGroup({
        layout: seedPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: tempTexture.createView() },
          { binding: 1, resource: { buffer: seedParamsBuffer } }
        ]
      });
      
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textures[currentRead].createView(),
          loadOp: 'load',
          storeOp: 'store'
        }]
      });
      
      renderPass.setPipeline(seedPipeline);
      renderPass.setBindGroup(0, seedBindGroup);
      renderPass.setVertexBuffer(0, quadVertexBuffer);
      renderPass.draw(4);
      renderPass.end();
      
      device.queue.submit([commandEncoder.finish()]);
      tempTexture.destroy();
    },
    
    resize(newWidth, newHeight) {
      width = newWidth;
      height = newHeight;
      createTextures();
      createBindGroups();
      updateVisualizationBindGroup();
    },
    
    dispose() {
      textures.forEach(t => t.destroy());
      paramsBuffer.destroy();
      quadVertexBuffer.destroy();
    }
  };

  initialize();
  return api;
}

function getSimulationShader() {
  return `
struct Params {
  feed: f32,
  kill: f32,
  diffusionA: f32,
  diffusionB: f32,
  timeStep: f32,
  width: f32,
  height: f32,
  padding: f32
};

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> params: Params;

fn laplacian(coord: vec2i) -> vec2f {
  var sum = vec2f(0.0);
  let weights = array<f32, 9>(
    0.05, 0.2, 0.05,
    0.2, -1.0, 0.2,
    0.05, 0.2, 0.05
  );
  
  for (var y: i32 = -1; y <= 1; y++) {
    for (var x: i32 = -1; x <= 1; x++) {
      let sampleCoord = vec2i(coord.x + x, coord.y + y);
      let clampedCoord = clamp(sampleCoord, vec2i(0), vec2i(i32(params.width) - 1, i32(params.height) - 1));
      let value = textureLoad(inputTex, clampedCoord, 0).rg;
      let weight = weights[(y + 1) * 3 + (x + 1)];
      sum += value * weight;
    }
  }
  
  return sum;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let coord = vec2i(global_id.xy);
  let texSize = textureDimensions(inputTex);
  
  if (coord.x >= texSize.x || coord.y >= texSize.y) {
    return;
  }
  
  let current = textureLoad(inputTex, coord, 0).rg;
  let a = current.r;
  let b = current.g;
  
  let lap = laplacian(coord);
  
  let reaction = a * b * b;
  var newA = a + (params.diffusionA * lap.r - reaction + params.feed * (1.0 - a)) * params.timeStep;
  var newB = b + (params.diffusionB * lap.g + reaction - (params.kill + params.feed) * b) * params.timeStep;
  
  newA = clamp(newA, 0.0, 1.0);
  newB = clamp(newB, 0.0, 1.0);
  
  textureStore(outputTex, coord, vec4f(newA, newB, 0.0, 1.0));
}
`;
}

function getInitShader() {
  return `
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
  let center = vec2f(0.5, 0.5);
  let dist = distance(uv, center);
  
  var a = 1.0;
  var b = 0.0;
  
  if (dist < 0.2) {
    b = 1.0;
  }
  
  return vec4f(a, b, 0.0, 1.0);
}
`;
}

function getVisualizationShader() {
  return `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f
};

@group(0) @binding(0) var inputTex: texture_2d<f32>;

@vertex
fn vs_main(@location(0) vertex: vec4f) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(vertex.xy, 0.0, 1.0);
  output.uv = vertex.zw;
  return output;
}

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

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let texSize = vec2f(textureDimensions(inputTex));
  let coord = vec2i(uv * texSize);
  let value = textureLoad(inputTex, coord, 0).rg;
  
  let a = value.r;
  let b = value.g;
  
  var color: vec3f;
  
  let t = b;
  let hue = 0.5 + t * 0.5;
  let sat = 0.8;
  let light = t * 0.6 + 0.2;
  
  color = hsl2rgb(vec3f(hue, sat, light));
  
  return vec4f(color, 0.15);
}
`;
}

function getSeedShader() {
  return `
struct SeedParams {
  centerX: f32,
  centerY: f32,
  radius: f32,
  concentrationB: f32
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f
};

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: SeedParams;

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
  let coord = vec2i(uv * texSize);
  let current = textureLoad(inputTex, coord, 0).rg;
  
  let center = vec2f(params.centerX, params.centerY);
  let dist = distance(uv * texSize, center);
  
  var a = current.r;
  var b = current.g;
  
  if (dist < params.radius) {
    b = params.concentrationB;
  }
  
  return vec4f(a, b, 0.0, 1.0);
}
`;
}

export default createReactionDiffusionSystem;
