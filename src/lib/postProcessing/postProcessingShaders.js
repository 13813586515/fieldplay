export function getVertexShader() {
  return `
precision highp float;
attribute vec2 a_pos;
varying vec2 v_tex_pos;
varying vec2 vUv;

void main() {
  v_tex_pos = a_pos;
  vUv = a_pos;
  gl_Position = vec4(1.0 - 2.0 * a_pos, 0.0, 1.0);
}
`;
}

export function getExtractBrightShader() {
  return `
precision highp float;
uniform sampler2D u_screen;
uniform float u_threshold;
varying vec2 v_tex_pos;

void main() {
  vec2 p = 1.0 - v_tex_pos;
  vec4 color = texture2D(u_screen, p);
  
  float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  
  if (brightness > u_threshold) {
    gl_FragColor = vec4(color.rgb * (brightness - u_threshold) / (1.0 - u_threshold), 1.0);
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }
}
`;
}

export function getBlurShader(direction) {
  return `
precision highp float;
uniform sampler2D u_screen;
uniform vec2 u_resolution;
uniform float u_radius;
varying vec2 v_tex_pos;

void main() {
  vec2 p = 1.0 - v_tex_pos;
  vec4 color = vec4(0.0);
  
  vec2 texelSize = 1.0 / u_resolution;
  float weights[5];
  weights[0] = 0.2270270270;
  weights[1] = 0.1945945946;
  weights[2] = 0.1216216216;
  weights[3] = 0.0540540541;
  weights[4] = 0.0162162162;
  
  color += texture2D(u_screen, p) * weights[0];
  
  vec2 dir = ${direction === 'horizontal' ? 'vec2(1.0, 0.0)' : 'vec2(0.0, 1.0)'};
  
  for (int i = 1; i < 5; i++) {
    vec2 offset = dir * texelSize * float(i) * u_radius;
    color += texture2D(u_screen, p + offset) * weights[i];
    color += texture2D(u_screen, p - offset) * weights[i];
  }
  
  gl_FragColor = color;
}
`;
}

export function getBloomCombineShader() {
  return `
precision highp float;
uniform sampler2D u_screen;
uniform sampler2D u_bloom;
uniform float u_strength;
varying vec2 v_tex_pos;

void main() {
  vec2 p = 1.0 - v_tex_pos;
  vec4 baseColor = texture2D(u_screen, p);
  vec4 bloomColor = texture2D(u_bloom, p);
  
  gl_FragColor = vec4(baseColor.rgb + bloomColor.rgb * u_strength, baseColor.a);
}
`;
}

export function getVignetteShader() {
  return `
precision highp float;
uniform sampler2D u_screen;
uniform float u_offset;
uniform float u_darkness;
varying vec2 v_tex_pos;

void main() {
  vec2 p = 1.0 - v_tex_pos;
  vec4 color = texture2D(u_screen, p);
  
  vec2 uv = p * (1.0 - p.yx);
  float vig = uv.x * uv.y * 15.0;
  vig = pow(vig, u_offset);
  
  color.rgb *= mix(1.0, vig, u_darkness);
  
  gl_FragColor = color;
}
`;
}

export function getChromaticAberrationShader() {
  return `
precision highp float;
uniform sampler2D u_screen;
uniform float u_amount;
varying vec2 v_tex_pos;

void main() {
  vec2 p = 1.0 - v_tex_pos;
  
  vec2 dir = p - 0.5;
  float dist = length(dir);
  
  float r = texture2D(u_screen, p - dir * u_amount * dist).r;
  float g = texture2D(u_screen, p).g;
  float b = texture2D(u_screen, p + dir * u_amount * dist).b;
  
  gl_FragColor = vec4(r, g, b, 1.0);
}
`;
}

export function getFXAAShader() {
  return `
precision highp float;
uniform sampler2D u_screen;
uniform vec2 u_resolution;
varying vec2 v_tex_pos;

#define FXAA_REDUCE_MIN   (1.0/128.0)
#define FXAA_REDUCE_MUL   (1.0/8.0)
#define FXAA_SPAN_MAX     8.0

void main() {
  vec2 p = 1.0 - v_tex_pos;
  vec2 texelOffset = 1.0 / u_resolution;
  
  vec3 rgbNW = texture2D(u_screen, p + vec2(-1.0, -1.0) * texelOffset).xyz;
  vec3 rgbNE = texture2D(u_screen, p + vec2(1.0, -1.0) * texelOffset).xyz;
  vec3 rgbSW = texture2D(u_screen, p + vec2(-1.0, 1.0) * texelOffset).xyz;
  vec3 rgbSE = texture2D(u_screen, p + vec2(1.0, 1.0) * texelOffset).xyz;
  vec3 rgbM  = texture2D(u_screen, p).xyz;
  
  vec3 luma = vec3(0.299, 0.587, 0.114);
  float lumaNW = dot(rgbNW, luma);
  float lumaNE = dot(rgbNE, luma);
  float lumaSW = dot(rgbSW, luma);
  float lumaSE = dot(rgbSE, luma);
  float lumaM  = dot(rgbM,  luma);
  
  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  
  vec2 dir;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
  
  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX), dir * rcpDirMin)) * texelOffset;
  
  vec3 rgbA = 0.5 * (texture2D(u_screen, p + dir * (1.0/3.0 - 0.5)).xyz + texture2D(u_screen, p + dir * (2.0/3.0 - 0.5)).xyz);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(u_screen, p + dir * -0.5).xyz + texture2D(u_screen, p + dir * 0.5).xyz);
  
  float lumaB = dot(rgbB, luma);
  if ((lumaB < lumaMin) || (lumaB > lumaMax)) {
    gl_FragColor = vec4(rgbA, 1.0);
  } else {
    gl_FragColor = vec4(rgbB, 1.0);
  }
}
`;
}

export function getColorCorrectionShader() {
  return `
precision highp float;
uniform sampler2D u_screen;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_gamma;
varying vec2 v_tex_pos;

void main() {
  vec2 p = 1.0 - v_tex_pos;
  vec4 color = texture2D(u_screen, p);
  
  color.rgb = pow(color.rgb, vec3(1.0 / u_gamma));
  
  color.rgb = ((color.rgb - 0.5) * max(u_contrast, 0.0)) + 0.5;
  
  color.rgb = color.rgb * u_brightness;
  
  float grey = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(grey), color.rgb, u_saturation);
  
  gl_FragColor = color;
}
`;
}

export function getMotionBlurShader() {
  return `
precision highp float;
uniform sampler2D u_screen;
uniform sampler2D u_velocity;
uniform float u_intensity;
uniform vec2 u_resolution;
varying vec2 v_tex_pos;

void main() {
  vec2 p = 1.0 - v_tex_pos;
  vec4 color = texture2D(u_screen, p);
  
  vec2 velocity = (texture2D(u_velocity, p).xy - 0.5) * 2.0;
  float speed = length(velocity);
  
  if (speed > 0.01) {
    velocity = normalize(velocity);
    vec2 texelSize = 1.0 / u_resolution;
    int samples = 12;
    
    for (int i = 1; i < 12; i++) {
      float t = float(i) / float(samples);
      vec2 offset = velocity * texelSize * float(i) * u_intensity * speed;
      color += texture2D(u_screen, p + offset);
    }
    color /= float(samples);
  }
  
  gl_FragColor = color;
}
`;
}

export function getDOFShader() {
  return `
precision highp float;
uniform sampler2D u_screen;
uniform float u_focus;
uniform float u_aperture;
uniform float u_maxblur;
uniform vec2 u_resolution;
varying vec2 v_tex_pos;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 p = 1.0 - v_tex_pos;
  vec4 color = vec4(0.0);
  
  float dist = abs(length(p - 0.5) - u_focus);
  float blurAmount = min(dist * u_aperture * 2.0, u_maxblur);
  
  vec2 texelSize = 1.0 / u_resolution;
  
  int samples = 0;
  float totalWeight = 0.0;
  
  for (int i = -8; i <= 8; i++) {
    for (int j = -8; j <= 8; j++) {
      vec2 offset = vec2(float(i), float(j)) * texelSize * blurAmount * 8.0;
      float weight = 1.0 / (1.0 + length(offset) * 10.0);
      
      float angle = rand(p + vec2(float(i), float(j)) * 0.01) * 6.28;
      float radius = rand(p + vec2(float(j), float(i)) * 0.01) * blurAmount;
      
      vec2 rotOffset = offset + vec2(cos(angle), sin(angle)) * texelSize * radius * 4.0;
      
      color += texture2D(u_screen, p + rotOffset) * weight;
      totalWeight += weight;
      samples++;
    }
  }
  
  if (totalWeight > 0.0) {
    color /= totalWeight;
  }
  
  gl_FragColor = color;
}
`;
}

export function getCombineShader() {
  return `
precision highp float;
uniform sampler2D u_screen;
uniform sampler2D u_effect;
uniform float u_mix;
varying vec2 v_tex_pos;

void main() {
  vec2 p = 1.0 - v_tex_pos;
  vec4 base = texture2D(u_screen, p);
  vec4 effect = texture2D(u_effect, p);
  
  gl_FragColor = mix(base, effect, u_mix);
}
`;
}

export function getSimpleCopyShader() {
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
