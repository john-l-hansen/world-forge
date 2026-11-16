/**
 * Shaders for the retro pipeline. Lighting is deliberately simple and
 * non-physical: baked torchlight per vertex, a light the party carries,
 * distance darkening, and banded, dithered shading like an old shading table.
 */
import * as THREE from 'three';
import type { Pix } from '../art/pixel';

/** Turn generated pixel art into a crisp, unfiltered GPU texture. */
export function pixTexture(pix: Pix, repeat = false): THREE.DataTexture {
  // Pix rows run top to bottom; GPU rows run bottom to top.
  const flipped = new Uint8Array(pix.data.length);
  const row = pix.w * 4;
  for (let y = 0; y < pix.h; y++) flipped.set(pix.data.subarray(y * row, (y + 1) * row), (pix.h - 1 - y) * row);
  const tex = new THREE.DataTexture(flipped, pix.w, pix.h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const LIGHTING = /* glsl */ `
  uniform float uFlicker;
  uniform float uPartyLight;
  uniform float uPartyRange;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uBands;

  float bayer4(vec2 p) {
    ivec2 i = ivec2(mod(p, 4.0));
    int idx = i.x + i.y * 4;
    const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
    return (m[idx] + 0.5) / 16.0;
  }

  // Baked torchlight or the party's own light, whichever is stronger,
  // faded by distance and snapped to a small number of dithered bands.
  float shadeLight(float baked, float dist) {
    float carried = uPartyLight * pow(clamp(1.0 - dist / uPartyRange, 0.0, 1.0), 1.4);
    float light = max(baked * (0.86 + 0.14 * uFlicker) * 1.15, carried * (0.9 + 0.1 * uFlicker)) + 0.035;
    light *= 1.0 - smoothstep(uFogNear, uFogFar, dist);
    return floor(light * uBands + bayer4(gl_FragCoord.xy)) / uBands;
  }
`;

const TORCH_TINT = 'vec3(1.12, 0.98, 0.80)';

export interface SharedUniforms {
  uFlicker: { value: number };
  uPartyLight: { value: number };
  uPartyRange: { value: number };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uBands: { value: number };
}

export function makeSharedUniforms(): SharedUniforms {
  return {
    uFlicker: { value: 1 },
    uPartyLight: { value: 0.8 },
    uPartyRange: { value: 4.6 },
    uFogNear: { value: 4.5 },
    uFogFar: { value: 10 },
    uBands: { value: 12 },
  };
}

/** Walls, floors, ceilings and doors. */
export function makeDungeonMaterial(atlas: THREE.Texture, shared: SharedUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uMap: { value: atlas } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aLight;
      attribute float aShade;
      varying vec2 vUv;
      varying float vLight;
      varying float vShade;
      varying float vDist;
      void main() {
        vUv = uv;
        vLight = aLight;
        vShade = aShade;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying float vLight;
      varying float vShade;
      varying float vDist;
      ${LIGHTING}
      void main() {
        vec3 tex = texture2D(uMap, vUv).rgb;
        float light = shadeLight(vLight, vDist) * vShade;
        gl_FragColor = vec4(tex * light * ${TORCH_TINT}, 1.0);
      }
    `,
  });
}

/** Billboard sprites: creatures, props and torches. One material per sprite. */
export function makeSpriteMaterial(sheet: THREE.Texture, shared: SharedUniforms, frames: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uMap: { value: sheet },
      uFrame: { value: 0 },
      uFrames: { value: frames },
      uLight: { value: 0 },
      uFlash: { value: 0 },
      uFullbright: { value: 0 },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uFrame;
      uniform float uFrames;
      varying vec2 vUv;
      varying float vDist;
      void main() {
        vUv = vec2((uv.x + uFrame) / uFrames, uv.y);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uLight;
      uniform float uFlash;
      uniform float uFullbright;
      varying vec2 vUv;
      varying float vDist;
      ${LIGHTING}
      void main() {
        vec4 tex = texture2D(uMap, vUv);
        if (tex.a < 0.5) discard;
        float light = mix(shadeLight(uLight, vDist), 1.0, uFullbright);
        vec3 lit = tex.rgb * light * mix(${TORCH_TINT}, vec3(1.0), uFullbright);
        gl_FragColor = vec4(mix(lit, vec3(1.0, 0.96, 0.86), uFlash), 1.0);
      }
    `,
  });
}

/** Flat sprite for the held weapon, drawn in screen pixels over the scene. */
export function makeOverlayMaterial(tex: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uBright: { value: 0.9 } },
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uBright;
      varying vec2 vUv;
      void main() {
        vec4 tex = texture2D(uMap, vUv);
        if (tex.a < 0.5) discard;
        gl_FragColor = vec4(tex.rgb * uBright * ${TORCH_TINT}, 1.0);
      }
    `,
  });
}

/**
 * Final pass: copies the low-resolution frame to the canvas, reduces colour
 * depth with ordered dithering, and applies the damage flash and death fade.
 */
export function makePresentMaterial(frame: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFrame: { value: frame },
      uLevels: { value: 28 },
      uDamage: { value: 0 },
      uFade: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uFrame;
      uniform float uLevels;
      uniform float uDamage;
      uniform float uFade;
      varying vec2 vUv;
      float bayer4(vec2 p) {
        ivec2 i = ivec2(mod(p, 4.0));
        int idx = i.x + i.y * 4;
        const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
        return (m[idx] + 0.5) / 16.0;
      }
      void main() {
        vec3 c = texture2D(uFrame, vUv).rgb;
        c = mix(c, vec3(0.62, 0.05, 0.03), uDamage * 0.55);
        c = mix(c, vec3(0.16, 0.0, 0.0) * dot(c, vec3(0.5)), uFade);
        c = floor(c * uLevels + bayer4(gl_FragCoord.xy)) / uLevels;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}
