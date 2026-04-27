export default async function createWebGPUContext(canvas) {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser');
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance'
  });

  if (!adapter) {
    throw new Error('No WebGPU adapter found');
  }

  const device = await adapter.requestDevice({
    requiredFeatures: [],
    requiredLimits: {}
  });

  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format,
    alphaMode: 'premultiplied'
  });

  const api = {
    device,
    context,
    format,
    adapter,
    canvas,
    getCommandEncoder() {
      return device.createCommandEncoder();
    },
    submit(commands) {
      device.queue.submit(commands);
    },
    createBuffer(size, usage, mappedAtCreation = false) {
      return device.createBuffer({
        size,
        usage,
        mappedAtCreation
      });
    },
    createTexture(descriptor) {
      return device.createTexture(descriptor);
    },
    createBindGroup(descriptor) {
      return device.createBindGroup(descriptor);
    },
    createBindGroupLayout(descriptor) {
      return device.createBindGroupLayout(descriptor);
    },
    createRenderPipeline(descriptor) {
      return device.createRenderPipeline(descriptor);
    },
    createComputePipeline(descriptor) {
      return device.createComputePipeline(descriptor);
    },
    createShaderModule(code) {
      return device.createShaderModule({
        code
      });
    },
    writeBuffer(buffer, data, offset = 0) {
      device.queue.writeBuffer(buffer, offset, data);
    },
    getCanvasTexture() {
      return context.getCurrentTexture();
    },
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
    },
    dispose() {
      device.destroy();
    }
  };

  return api;
}
