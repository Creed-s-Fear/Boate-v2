import * as THREE from 'three';

// "Vida" barata para o mapa inteiro: pequenos trechos de shader enxertados nos
// materiais que já existem (onBeforeCompile). Não cria objetos, texturas nem draw
// calls: os mesmos lotes de sempre passam a ter veios, poças, brilho de borda,
// pulsação e cortinas que balançam e se abrem com a passagem do jogador.

// uniforms compartilhados por todos os materiais (atualizados uma vez por quadro)
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

// mesmo ruído do reflexo do piso: as poças do material coincidem com as do reflexo
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

// tubo de neon: miolo quente e claro, borda mais saturada, tremor leve
const NEON = /* glsl */ `
  float fxF = fxFacing();
  diffuseColor.rgb *= 0.62 + 0.38 * fxF;
  diffuseColor.rgb += vec3(0.5) * pow(fxF, 5.0);
  diffuseColor.rgb *= 0.95 + 0.05 * sin(uFxTime * 7.0 + vFxWorld.x * 2.7 + vFxWorld.z * 3.1);
`;
// telas: linhas de "dados" correndo
const SCREEN = /* glsl */ `
  float fxRow = floor(vFxWorld.y * 70.0);
  float fxU = (vFxWorld.x + vFxWorld.z) * 80.0 + uFxTime * (1.5 + 3.0 * fxHash(vec2(fxRow, 3.0)));
  float fxOn = step(0.42, fxHash(vec2(floor(fxU), fxRow)));
  diffuseColor.rgb *= 0.3 + fxOn * step(0.2, fract(vFxWorld.y * 70.0));
`;
// painéis holográficos das placas: varredura e falha de sinal
const HOLO = /* glsl */ `
  totalEmissiveRadiance *= (0.62 + 0.38 * sin(vFxWorld.y * 190.0 - uFxTime * 5.0))
    * (0.9 + 0.1 * sin(uFxTime * 31.0) * sin(uFxTime * 7.3)) * 1.4;
`;
// luz de fundo das treliças, luminárias e frente do bar: respiração lenta
const GLOW = /* glsl */ `
  totalEmissiveRadiance *= 0.82 + 0.18 * sin(vFxWorld.y * 3.5 - uFxTime * 0.9 + vFxWorld.x * 1.1 + vFxWorld.z * 0.9);
`;
// mármore: manchas largas e veios finos (no espaço do mundo, sem costura entre peças)
const marble = (vein) => /* glsl */ `
  vec3 fxP = vFxWorld * 1.6;
  float fxWarp = fxNoise3(fxP * 0.9) * 2.0 + fxNoise3(fxP * 2.3);
  float fxVein = 1.0 - smoothstep(0.0, 0.09, abs(sin(fxP.x * 2.1 + fxP.y * 3.3 + fxP.z * 2.6 + fxWarp * 3.0)));
  diffuseColor.rgb = diffuseColor.rgb * (0.7 + 0.6 * fxNoise3(fxP * 0.55 + 4.0)) + vec3(${vein}) * fxVein;
`;
const MARBLE_R = /* glsl */ `
  roughnessFactor = clamp(roughnessFactor + fxVein * 0.25, 0.04, 1.0);
`;
// piso molhado: poças lisas e escuras, resto mais fosco
const WET = /* glsl */ `
  float fxPud = smoothstep(0.36, 0.6, fxFbm(vFxWorld.xz * 0.45));
  diffuseColor.rgb *= mix(1.25, 0.8, fxPud);
`;
const WET_R = /* glsl */ `
  roughnessFactor = clamp(mix(roughnessFactor * 2.4, roughnessFactor * 0.45, fxPud), 0.04, 1.0);
`;
// veludo e cetim: brilho de borda, como tecido de pelo
const VELVET = /* glsl */ `
  totalEmissiveRadiance += diffuseColor.rgb * pow(1.0 - fxFacing(), 3.0) * 0.55;
`;
// cortinas de tecido: balanço leve e abertura em volta do jogador (as salas ficam na
// origem, então a posição do lote já é a posição no mundo)
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
  else if (/velvet|satin/.test(n)) patch(mat, 'velvet', { emissive: VELVET });
  else if (/^KIT_curtain/.test(n)) patch(mat, 'curtain', { vertex: CURTAIN_V, color: CURTAIN_C });
  return mat;
}
