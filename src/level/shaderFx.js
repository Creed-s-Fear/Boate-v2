import * as THREE from 'three';

// Cheap "life" for the entire map: small shader snippets grafted onto existing
// materials (onBeforeCompile). Creates no objects, textures or draw calls: the
// same batches as before now have veins, puddles, rim glow, pulsation and
// curtains that sway and part as the player passes.

// uniforms shared by all materials (updated once per frame)
export const FX = {
  uTime: { value: 0 },
  uPlayer: { value: new THREE.Vector3(0, -100, 0) },
};

const PARS = /* glsl */ `
uniform float uFxTime;
uniform vec3 uFxPlayer;
varying vec3 vFxWorld;
varying vec3 vFxN;
varying vec3 vFxV;
`;

// same noise as the floor reflection: material puddles match the reflection puddles
const NOISE = /* glsl */ `
float fxHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float fxNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), f.x),
             mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fxFbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * fxNoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
float fxHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float fxNoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fxHash3(i), fxHash3(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(fxHash3(i + vec3(0.0, 1.0, 0.0)), fxHash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(fxHash3(i + vec3(0.0, 0.0, 1.0)), fxHash3(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(fxHash3(i + vec3(0.0, 1.0, 1.0)), fxHash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fxFacing() { return clamp(abs(dot(normalize(vFxN + 1e-5), normalize(vFxV + 1e-5))), 0.0, 1.0); }
`;

function patch(mat, key, { vertex = '', color = '', emissive = '', roughness = '' }) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFxTime = FX.uTime;
    shader.uniforms.uFxPlayer = FX.uPlayer;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertex)
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvFxWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFxN = normalize(normalMatrix * normal);\nvFxV = normalize(-mvPosition.xyz);',
      );
    let f = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + PARS + NOISE);
    if (color) f = f.replace('#include <color_fragment>', '#include <color_fragment>\n' + color);
    if (roughness) f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + roughness);
    if (emissive) f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + emissive);
    shader.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => 'fx:' + key;
}

// neon and LED strips: bright core, more saturated edge, LED dots along the strip
// and a pulse of light running through it
const NEON = /* glsl */ `
  float fxF = fxFacing();
  diffuseColor.rgb *= 0.62 + 0.38 * fxF;
  diffuseColor.rgb += vec3(0.3) * pow(fxF, 5.0);
  float fxS = vFxWorld.x + vFxWorld.y + vFxWorld.z;
  diffuseColor.rgb *= 0.86 + 0.14 * cos(fxS * 170.0);
  diffuseColor.rgb *= 0.9 + 0.28 * pow(0.5 + 0.5 * sin(fxS * 2.4 - uFxTime * 2.0), 10.0);
`;
// glass on cups and bottles: opaquer and lighter rim (thickness) and reflection streaks
// only on curved parts (on flat glass the streak would become a glare)
const GLASS = /* glsl */ `
  float fxF = fxFacing();
  float fxRim = pow(1.0 - fxF, 2.2);
  diffuseColor.a = clamp(diffuseColor.a + fxRim * 0.6, 0.0, 0.95);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.84, 0.95), fxRim * 0.45);
`;
const GLASS_E = /* glsl */ `
  float fxStreak = pow(max(0.0, sin(vFxN.x * 9.0 + vFxN.y * 4.0)), 24.0) * smoothstep(0.03, 0.3, 1.0 - fxF);
  totalEmissiveRadiance += vec3(1.0, 0.78, 0.93) * (fxRim * 0.3 + fxStreak * 0.3);
`;
// liquids: glow from within (neon bar), denser rim and rising bubbles
const LIQUID = /* glsl */ `
  float fxF = fxFacing();
  diffuseColor.a = clamp(diffuseColor.a + pow(1.0 - fxF, 2.0) * 0.3, 0.0, 0.97);
  vec2 fxB = vec2((vFxWorld.x + vFxWorld.z) * 140.0, vFxWorld.y * 90.0 - uFxTime * 1.6);
  float fxBub = step(0.93, fxHash(floor(fxB))) * (1.0 - smoothstep(0.1, 0.38, length(fract(fxB) - 0.5)));
  diffuseColor.rgb += vec3(fxBub * 0.5);
`;
const LIQUID_E = /* glsl */ `
  totalEmissiveRadiance += diffuseColor.rgb * (0.3 + 0.2 * sin(vFxWorld.y * 60.0 + uFxTime * 2.0));
`;
// screens: lines of "data" scrolling
const SCREEN = /* glsl */ `
  float fxRow = floor(vFxWorld.y * 70.0);
  float fxU = (vFxWorld.x + vFxWorld.z) * 80.0 + uFxTime * (1.5 + 3.0 * fxHash(vec2(fxRow, 3.0)));
  float fxOn = step(0.42, fxHash(vec2(floor(fxU), fxRow)));
  diffuseColor.rgb *= 0.3 + fxOn * step(0.2, fract(vFxWorld.y * 70.0));
`;
// holographic sign panels: sweep and signal glitch
const HOLO = /* glsl */ `
  totalEmissiveRadiance *= (0.62 + 0.38 * sin(vFxWorld.y * 190.0 - uFxTime * 5.0))
    * (0.9 + 0.1 * sin(uFxTime * 31.0) * sin(uFxTime * 7.3)) * 1.4;
`;
// lattice backlight, light fixtures and bar front: slow breathing
const GLOW = /* glsl */ `
  totalEmissiveRadiance *= 0.82 + 0.18 * sin(vFxWorld.y * 3.5 - uFxTime * 0.9 + vFxWorld.x * 1.1 + vFxWorld.z * 0.9);
`;
// marble: broad stains and fine veins (in world space, seamless across pieces)
const marble = (vein) => /* glsl */ `
  vec3 fxP = vFxWorld * 1.6;
  float fxWarp = fxNoise3(fxP * 0.9) * 2.0 + fxNoise3(fxP * 2.3);
  float fxVein = 1.0 - smoothstep(0.0, 0.09, abs(sin(fxP.x * 2.1 + fxP.y * 3.3 + fxP.z * 2.6 + fxWarp * 3.0)));
  diffuseColor.rgb = diffuseColor.rgb * (0.7 + 0.6 * fxNoise3(fxP * 0.55 + 4.0)) + vec3(${vein}) * fxVein;
`;
const MARBLE_R = /* glsl */ `
  roughnessFactor = clamp(roughnessFactor + fxVein * 0.25, 0.11, 1.0);
`;
// wet floor: smooth dark puddles, rest more matte
const WET = /* glsl */ `
  float fxPud = smoothstep(0.36, 0.6, fxFbm(vFxWorld.xz * 0.45));
  diffuseColor.rgb *= mix(1.25, 0.8, fxPud);
`;
// (0.1 minimum roughness: below that, lights become glaring specular dots)
const WET_R = /* glsl */ `
  roughnessFactor = clamp(mix(roughnessFactor * 2.4, roughnessFactor * 0.6, fxPud), 0.1, 1.0);
`;
// velvet and satin (sofas, poufs, stools): fine fabric grain, crushed-nap stains
// that change gloss and color, and rim glow
const VELVET_C = /* glsl */ `
  float fxGrain = fxNoise(vFxWorld.xz * 160.0 + vFxWorld.y * 97.0);
  float fxNap = fxNoise3(vFxWorld * 5.5);
  diffuseColor.rgb *= (0.74 + 0.36 * fxNap) * (0.92 + 0.16 * fxGrain);
`;
const VELVET_R = /* glsl */ `
  roughnessFactor = clamp(roughnessFactor - 0.25 * fxNap, 0.3, 1.0);
`;
const VELVET = /* glsl */ `
  // subtle rim glow: too strong washes out the shading and the sofa looks flat
  totalEmissiveRadiance += diffuseColor.rgb * pow(1.0 - fxFacing(), 3.0) * (0.16 + 0.26 * fxNap);
`;
// fabric curtains: gentle sway and parting around the player (rooms are at the
// origin, so the batch position is already the world position)
const CURTAIN_V = /* glsl */ `
  float fxHang = clamp((2.75 - transformed.y) / 2.5, 0.0, 1.0);
  fxHang *= fxHang;
  transformed.x += fxHang * 0.03 * sin(uFxTime * 1.1 + transformed.x * 1.7 + transformed.z * 1.3);
  transformed.z += fxHang * 0.03 * cos(uFxTime * 0.9 + transformed.z * 1.9 - transformed.x * 0.8);
  vec2 fxD = transformed.xz - uFxPlayer.xz;
  float fxDist = length(fxD);
  float fxPush = (1.0 - smoothstep(0.3, 1.05, fxDist)) * fxHang;
  transformed.xz += fxD / (fxDist + 0.001) * fxPush * 0.5;
`;
const CURTAIN_C = /* glsl */ `
  diffuseColor.a *= 0.75 + 0.6 * pow(1.0 - fxFacing(), 2.0);
`;

export function applyFx(mat) {
  const n = mat.name;
  if (/^KIT_neon_/.test(n) || n === 'KIT_j_flame') patch(mat, 'neon', { color: NEON });
  else if (n === 'KIT_screen_cyan') patch(mat, 'screen', { color: SCREEN });
  else if (/^KIT_holo/.test(n)) patch(mat, 'holo', { emissive: HOLO });
  else if (/^KIT_glow_pink/.test(n) || n === 'KIT_flute_pink') patch(mat, 'glow', { emissive: GLOW });
  else if (n === 'KIT_j_marble') patch(mat, 'marble-j', { color: marble('0.42, 0.11, 0.23'), roughness: MARBLE_R });
  else if (n === 'KIT_marble') patch(mat, 'marble-k', { color: marble('0.26, 0.24, 0.28'), roughness: MARBLE_R });
  else if (n === 'KIT_floor_wet' || n === 'KIT_j_floor') patch(mat, 'wet', { color: WET, roughness: WET_R });
  else if (/velvet|satin/.test(n)) patch(mat, 'velvet', { color: VELVET_C, roughness: VELVET_R, emissive: VELVET });
  else if (/^KIT_(glass$|glass_smoke|glass_wine|glass_frost|ice|j_crystal)/.test(n)) patch(mat, 'glass', { color: GLASS, emissive: GLASS_E });
  else if (/^KIT_(liq_|j_amber)/.test(n)) patch(mat, 'liquid', { color: LIQUID, emissive: LIQUID_E });
  else if (/^KIT_curtain/.test(n)) patch(mat, 'curtain', { vertex: CURTAIN_V, color: CURTAIN_C });
  return mat;
}
