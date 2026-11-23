// 金泰算力中枢 NEXUS 大屏 v3 · Three.js r186
// v3：在 v2 单色细线电影感基础上叠加多层次细节——开机自检、核心多面体、扫描带、轨道彗星、电弧、
// 数据包彗尾、雷达扫掠、频谱冠、星云与透视地网、引力透镜/冲击波/变焦故障后期、任务事件涟漪与事件流。
// 所有数值仍来自真实采集（公网无隧道时明确标注仿真）。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const Q = new URLSearchParams(location.search);
const CAPTURE = Q.has('capture');
const FORCE_DEMO = Q.has('demo');
const NO_BOOT = Q.has('noboot');
const IS_PUBLIC_STATIC = /\.github\.io$|\.pages\.dev$/i.test(location.hostname);
const LOCAL_FILE = location.protocol === 'file:';
const ONLY_SIM = FORCE_DEMO || LOCAL_FILE;
const TUNNEL_OVERRIDE = Q.get('tunnel');
if (Q.has('nohud')) document.body.classList.add('nohud');
if (CAPTURE) document.body.classList.add('capture');

const N = 12, NH = 6, MAXP = 60000, FIB = 18, FSEG = 48, PK = 22, TR = 12, ARCN = 14, ARCS = 22;
const SC = new THREE.Vector3(-9.5, -0.35, 0);    // 主体球中心
const R = 6.8;                                   // 主体球半径
const DIAL = 11.8;                               // 刻度盘平面半尺寸（含频谱冠）
const LOOK_Y = -1.1;
const BOOT_SEC = NO_BOOT ? 0.001 : 3.2;

const PALETTES = {
  mono:  { white: '#e9eff6', acc: '#ffcf7a', a: '#d6ecff', b: '#ffcf7a', neb: '#3a4a66' },
  ice:   { white: '#e2f5ff', acc: '#7fd8ff', a: '#8fdcff', b: '#b6bcff', neb: '#1d4a6a' },
  cyber: { white: '#f3e9ff', acc: '#ff4df0', a: '#b88bff', b: '#3dfff2', neb: '#4a1d6a' },
  green: { white: '#e9fff1', acc: '#6dff9e', a: '#8affb4', b: '#d4ff4d', neb: '#1d5a3a' },
};
let pal = PALETTES.mono;

// ---------- 四维超立方（tesseract）：16 顶点 32 棱，XW/YW/ZW 三平面旋转后四维透视投影 ----------
const NMODE = 5;
const T_EDGES = [];
for (let v = 0; v < 16; v++) {
  const s = [v & 1 ? 1 : -1, v & 2 ? 1 : -1, v & 4 ? 1 : -1, v & 8 ? 1 : -1];
  for (let ax = 0; ax < 4; ax++) if (s[ax] === -1) T_EDGES.push([s, ax]);
}
const rot4 = { xw: 0, yw: 0, zw: 0 };
function proj4(x, y, z, w, scale, out, o, r = rot4) {
  let c = Math.cos(r.xw), s = Math.sin(r.xw), t;
  t = c * x - s * w; w = s * x + c * w; x = t;
  c = Math.cos(r.yw); s = Math.sin(r.yw); t = c * y - s * w; w = s * y + c * w; y = t;
  c = Math.cos(r.zw); s = Math.sin(r.zw); t = c * z - s * w; w = s * z + c * w; z = t;
  const k = scale / (2.6 - w);
  out[o] = x * k; out[o + 1] = y * k; out[o + 2] = z * k;
  return w;
}
function fillTess(pos, wv, scale, r = rot4) {     // 32 棱 × 2 端点
  T_EDGES.forEach(([s, ax], e) => {
    const b = s.slice(); b[ax] = 1;
    wv[e * 2] = proj4(s[0], s[1], s[2], s[3], scale, pos, e * 6, r);
    wv[e * 2 + 1] = proj4(b[0], b[1], b[2], b[3], scale, pos, e * 6 + 3, r);
  });
}

// ---------- 渲染器 ----------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', top: '0', left: '0', pointerEvents: 'none' });
stage.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000');
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 500);
const getCamZ = () => (innerWidth / innerHeight >= 1.5 ? 34 : Math.min(136, 62 / Math.max(0.38, innerWidth / innerHeight)));
const getLookX = () => (innerWidth < innerHeight ? 3.8 : 0);
let camZ = getCamZ(), lookX = getLookX();
camera.position.set(lookX, LOOK_Y + 0.4, camZ);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.35, 0.55);
composer.addPass(bloom);
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
    uHole: { value: new THREE.Vector2(0.3, 0.5) }, uLens: { value: 0 }, uShock: { value: 0 }, uShockAmp: { value: 0 },
    uGlitch: { value: 0 }, uStreak: { value: 0.22 }, uStreakCol: { value: new THREE.Color('#ffcf7a') }, uRays: { value: 0.5 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uLens, uShock, uShockAmp, uGlitch, uStreak, uRays; uniform vec2 uRes, uHole; uniform vec3 uStreakCol;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      if (uGlitch > 0.001) {                       // 模式切换：水平切片错位
        float sl = floor(uv.y * 54.0); float tt = floor(uTime * 30.0);
        if (rnd(vec2(sl, tt)) > 1.0 - 0.4 * uGlitch) uv.x += (rnd(vec2(sl * 1.3, tt + 7.0)) - 0.5) * 0.08 * uGlitch;
      }
      vec2 dv = (uv - uHole) * asp; float rr = length(dv) + 1e-5; vec2 dir = dv / rr;
      float shade = 1.0, sGlow = 0.0;
      if (uLens > 0.001) {                         // 黑洞：引力透镜（爱因斯坦环）
        float te = 0.085 * uLens;
        uv -= dir * min(te * te / rr, 0.45) / asp;
        shade = mix(1.0, smoothstep(te * 0.5, te * 0.95, rr), uLens);
      }
      if (uShockAmp > 0.001) {                     // 聚变：冲击波折射环
        float ring = exp(-pow((rr - uShock * 0.95) * 26.0, 2.0)) * (1.0 - uShock);
        uv -= dir * ring * 0.022 * uShockAmp / asp; sGlow = ring * uShockAmp;
      }
      vec2 c = vUv - 0.5; float d = dot(c, c);
      vec2 off = c * d * (0.014 + 0.05 * uGlitch) + vec2(0.004 * uGlitch, 0.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      col *= shade;
      if (uRays > 0.001) {                         // 体积光：自核心向外的光束
        vec2 gd = (uHole - uv) * (0.55 / 16.0); vec2 gp = uv + gd * rnd(gl_FragCoord.xy + 3.1); float dec = 1.0; vec3 gr = vec3(0.0);
        for (int i = 0; i < 16; i++) { gp += gd; gr += max(texture2D(tDiffuse, gp).rgb - 0.55, 0.0) * dec; dec *= 0.9; }
        col += gr * uStreakCol * uRays * 0.11;
      }
      if (uStreak > 0.001) {                       // 变形宽银幕横向光芒
        vec3 st = vec3(0.0); float j = rnd(gl_FragCoord.xy);
        for (int i = 1; i <= 14; i++) {
          float fi = float(i) + j; float o = fi * 0.0075; float w = exp(-fi * 0.22);
          st += (max(texture2D(tDiffuse, uv + vec2(o, 0.0)).rgb - 0.9, 0.0) + max(texture2D(tDiffuse, uv - vec2(o, 0.0)).rgb - 0.9, 0.0)) * w;
        }
        col += dot(st, vec3(0.333)) * uStreakCol * uStreak;
      }
      col += uStreakCol * sGlow * 0.07;
      col *= 1.0 - d * 1.1;
      col *= 0.978 + 0.022 * sin(gl_FragCoord.y * 1.5708);
      col += (rnd(floor(vUv * uRes) + fract(uTime * 7.0) * 113.0) - 0.5) * 0.04;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
});
composer.addPass(finish);
composer.addPass(new OutputPass());

// ---------- 布局（所有模式节点位置固定） ----------
const nodePos = [];
for (let k = 0; k < N; k++) {   // v5：纵深斜列——上近下远，向画面深处退去
  const z = 3.2 - k * 1.0 - (k >= 8 ? 0.6 : 0);
  nodePos.push(new THREE.Vector3(14.3 - z * 0.2, 8.0 - k * 1.52 - (k >= 8 ? 0.7 : 0), z));
}
const H1 = [], H2 = [];
for (let i = 0; i < NH; i++) {
  H1.push(new THREE.Vector3(2.6, SC.y + (2.5 - i) * 2.6, 3.0 - i * 0.5));
  H2.push(new THREE.Vector3(8.9, SC.y + (2.5 - i) * 2.6, -1.5 - i * 0.6));
}

// ---------- 数据状态 ----------
const nodes = [];
for (let i = 0; i < N; i++) nodes.push({ id: i < 8 ? `A${i}` : `B${i - 8}`, machine: i < 8 ? 'A' : 'B', index: i < 8 ? i : i - 8,
  online: false, frac: 0, fracShown: 0, amp: 0, ampShown: 0, html: '', raw: {}, prev: null, rip: -99 });
let lastOk = 0, everOk = false, fallbackDemo = false, eventsArmed = false;
const isDemo = () => ONLY_SIM || fallbackDemo;
const hist = { vram: [], ram: [], bram: [], power: [], tok: [] };
let lastJ = null;
const HMAX = 120;
const agg = { aVramPct: null, online: 0 };

// ---------- 公共 GLSL：粒子与流线共用的路径函数 ----------
const PATH_GLSL = `
uniform float uTime, uBlend, uModeA, uModeB, uSpin, uBoot, uXW, uYW, uZW;
uniform vec3 uSC; uniform float uR;
uniform vec3 uNodePos[${N}]; uniform float uNodeAmp[${N}]; uniform float uNodeOn[${N}]; uniform vec3 uNodeCol[${N}];
uniform vec3 uH1[${NH}]; uniform vec3 uH2[${NH}];
vec3 bez3(vec3 a, vec3 b, vec3 c, vec3 d, float t){ float u = 1.0 - t; return u*u*u*a + 3.0*u*u*t*b + 3.0*u*t*t*c + t*t*t*d; }
vec3 startPt(vec3 node){ float sy = clamp((node.y - uSC.y) / (uR * 1.25), -0.85, 0.85); return uSC + vec3(sqrt(1.0 - sy*sy), sy, 0.0) * uR; }
vec3 tiltX(vec3 q, float a){ return vec3(q.x, q.y*cos(a) - q.z*sin(a), q.y*sin(a) + q.z*cos(a)); }
vec3 pathFlow(int n, float t, float o1, float o2){
  vec3 node = uNodePos[n]; vec3 a = startPt(node);
  return bez3(a, a + vec3(7.5, o1 * 1.3, o2 * 2.2), node - vec3(6.5, -o1 * 0.5, -o2 * 0.8), node, t);
}
vec3 pathHole(int n, float t, float o1, float o2){
  vec3 node = uNodePos[n]; vec3 E = uSC + vec3(3.4, 0.0, 0.0);
  vec3 q;
  if (t < 0.7) { float s = t / 0.7; q = bez3(node, node - vec3(7.0, o1 * 1.6, o2 * 2.0), E + vec3(6.5, (node.y - uSC.y) * 0.3, 0.0), E, s) + vec3(0.0, o1 * 0.5 * s, o2 * 0.6 * s); }
  else { float s = (t - 0.7) / 0.3; float r = mix(3.4 + o1 * 0.5, 1.75 + abs(o2) * 0.6, s); float an = s * (5.0 + o2 * 1.5);
    q = uSC + tiltX(vec3(cos(an) * r, 0.0, sin(an) * r), 0.3) + vec3(0.0, o1 * 0.5 * (1.0 - s), o2 * 0.6 * (1.0 - s)); }
  return q;
}
vec3 pathFusion(int n, float t, float o1, float o2){
  vec3 node = uNodePos[n];
  vec3 dir = normalize(vec3(0.35 + 0.65 * abs(o1), o2 * 1.2, fract(o1 * 7.31 + o2 * 3.17) * 2.0 - 1.0) + 1e-4);
  return bez3(uSC + dir * uR * 0.2, uSC + dir * uR * 1.8, node - vec3(6.0, 0.0, 0.0), node, t);
}
vec3 pathNet(int n, float t, float o1, float o2){
  int i = int(clamp((o1 * 0.5 + 0.5) * 5.999, 0.0, 5.0)); int j = int(clamp((o2 * 0.5 + 0.5) * 5.999, 0.0, 5.0));
  vec3 a = uSC + vec3(uR, 0.0, 0.0);
  float s = t * 3.0; vec3 q;
  if (s < 1.0) q = mix(a, uH1[i], smoothstep(0.0, 1.0, s));
  else if (s < 2.0) q = mix(uH1[i], uH2[j], smoothstep(0.0, 1.0, s - 1.0));
  else q = mix(uH2[j], uNodePos[n], smoothstep(0.0, 1.0, s - 2.0));
  return q;
}
vec3 pathTess(int n, float t, float o1, float o2){   // 超维：双螺旋绞合缆束
  vec3 q = pathFlow(n, t, o1 * 0.55, o2 * 0.55);
  float th = t * 18.0 + (o1 > 0.0 ? 3.14159 : 0.0) + uTime * 1.6 + float(n) * 0.7;
  return q + vec3(0.0, cos(th), sin(th)) * (0.35 + 0.6 * abs(o2)) * sin(3.14159 * t);
}
vec3 pathMode(float m, int n, float t, float o1, float o2){
  vec3 q;
  if (m < 0.5) q = pathFlow(n, t, o1, o2);
  else if (m < 1.5) q = pathHole(n, t, o1, o2);
  else if (m < 2.5) q = pathFusion(n, t, o1, o2);
  else if (m < 3.5) q = pathNet(n, t, o1, o2);
  else q = pathTess(n, t, o1, o2);
  return q;
}
vec3 pathBlend(int n, float t, float o1, float o2){
  return mix(pathMode(uModeA, n, t, o1, o2), pathMode(uModeB, n, t, o1, o2), smoothstep(0.0, 1.0, uBlend));
}`;

const vec3s = (k) => Array.from({ length: k }, () => new THREE.Vector3());
const shared = {
  uTime: { value: 0 }, uBlend: { value: 1 }, uModeA: { value: 0 }, uModeB: { value: 0 }, uSpin: { value: 1 }, uBoot: { value: 0 },
  uXW: { value: 0 }, uYW: { value: 0 }, uZW: { value: 0 },
  uSC: { value: SC.clone() }, uR: { value: R },
  uNodePos: { value: nodePos.map((v) => v.clone()) }, uNodeAmp: { value: new Array(N).fill(0) },
  uNodeOn: { value: new Array(N).fill(0) }, uNodeCol: { value: vec3s(N) },
  uH1: { value: H1.map((v) => v.clone()) }, uH2: { value: H2.map((v) => v.clone()) },
  uWhite: { value: new THREE.Color() }, uAcc: { value: new THREE.Color() }, uNeb: { value: new THREE.Color() },
  uPR: { value: renderer.getPixelRatio() * innerHeight / 1080 },
};
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const VS_UV = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const ROUND_FS = `varying float vA; varying vec3 vC;
  void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.08, d)); }`;
const billboards = [];

// ---------- 远景：星尘 + 星云 + 极坐标网 ----------
{
  const g = new THREE.BufferGeometry(), n = 2600, p = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { p.set([(Math.random() - 0.5) * 180, (Math.random() - 0.5) * 100, -30 - Math.random() * 90], i * 3); s[i] = Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(s, 1));
  scene.add(new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: shared, ...ADD,
    vertexShader: `uniform float uTime, uPR, uBoot; uniform vec3 uWhite; attribute float aRnd; varying float vA; varying vec3 vC;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aRnd * 2.0) + aRnd * 40.0);
        vA = (0.18 + 0.4 * aRnd) * tw * uBoot; vC = uWhite * 0.8; gl_PointSize = (0.2 + 0.35 * aRnd) * uPR * (300.0 / -mv.z); }`,
    fragmentShader: ROUND_FS })));
}
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), new THREE.ShaderMaterial({
  uniforms: shared, ...ADD,
  vertexShader: VS_UV,
  fragmentShader: `
    varying vec2 vUv; uniform float uTime, uBoot; uniform vec3 uWhite, uAcc, uNeb;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
    void main(){
      vec2 q = (vUv - 0.5) * vec2(200.0, 120.0);
      float r = length(q); float px = fwidth(q.x);
      float g = r / 5.0 - uTime * 0.03; float dr = abs(fract(g + 0.5) - 0.5);
      float ring = 1.0 - smoothstep(0.0, px / 5.0 * 1.3, dr);
      float ga = atan(q.y, q.x) / 6.28318 * 72.0; float da = abs(fract(ga + 0.5) - 0.5);
      float ray = (1.0 - smoothstep(0.0, 72.0 / (6.28318 * max(r, 1.0)) * px * 1.3, da)) * step(16.0, r);
      float fade = smoothstep(90.0, 18.0, r) * smoothstep(9.0, 16.0, r);
      vec2 w = q * 0.022 + vec2(uTime * 0.012, -uTime * 0.007);
      float n1 = fbm(w + fbm(w * 1.7 + uTime * 0.01) * 1.6);
      float neb = pow(smoothstep(0.35, 0.9, n1), 2.0) * smoothstep(110.0, 20.0, r);
      vec3 col = uWhite * (ring * 0.05 + ray * 0.022) * fade + mix(uNeb, uAcc * 0.5, smoothstep(0.55, 0.85, n1)) * neb * 0.45;
      gl_FragColor = vec4(col * uBoot, 1.0);
    }`,
}));
backdrop.position.set(SC.x, SC.y, -150);
backdrop.scale.setScalar(2.6);
scene.add(backdrop);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 170), new THREE.ShaderMaterial({
  uniforms: { ...shared, uCam: { value: new THREE.Vector3() } }, ...ADD,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    varying vec3 vW; uniform float uTime, uBoot; uniform vec3 uWhite, uAcc, uCam;
    void main(){
      vec2 g = vW.xz / 2.6 + vec2(0.0, uTime * 0.35);
      vec2 d = abs(fract(g + 0.5) - 0.5) / fwidth(g);
      float line = 1.0 - min(min(d.x, d.y), 1.0);
      float dist = length(vW.xz - uCam.xz);
      float fade = smoothstep(300.0, 40.0, dist) * smoothstep(10.0, 34.0, dist);
      float wave = exp(-pow(fract(-vW.z * 0.012 + uTime * 0.06) - 0.5, 2.0) * 900.0);
      vec3 col = mix(uWhite * 0.05, uAcc * 0.14, wave) * line * fade;
      gl_FragColor = vec4(col * uBoot, 1.0);
    }`,
}));
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, -13.5, -150);
floor.scale.set(2.4, 2.6, 1);
scene.add(floor);

// ---------- 主体球：斐波那契点阵 + 近邻细线网 + 扫描带 ----------
const sphere = new THREE.Group();
sphere.position.copy(SC);
sphere.rotation.x = 0.35;
scene.add(sphere);
const sphereUni = { uTime: shared.uTime, uBoot: shared.uBoot, uPulse: { value: 0 }, uCollapse: { value: 0 }, uLoad: { value: 0 },
  uMorph: { value: 0 }, uXW: shared.uXW, uYW: shared.uYW, uZW: shared.uZW,
  uWhite: shared.uWhite, uAcc: shared.uAcc, uPR: shared.uPR, uR: shared.uR };
const orbits = [];
{
  const NS = 1300, pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NS; i++) {
    const y = 1 - (i / (NS - 1)) * 2, rr = Math.sqrt(1 - y * y), th = golden * i;
    pts.push(new THREE.Vector3(Math.cos(th) * rr * R, y * R, Math.sin(th) * rr * R));
  }
  const inner = 520;
  for (let i = 0; i < inner; i++) {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    pts.push(v.multiplyScalar(R * (0.25 + 0.6 * Math.cbrt(Math.random()))));
  }
  const pPos = new Float32Array(pts.length * 3), pRnd = new Float32Array(pts.length), pShell = new Float32Array(pts.length);
  pts.forEach((v, i) => { pPos.set([v.x, v.y, v.z], i * 3); pRnd[i] = Math.random(); pShell[i] = i < NS ? 1 : 0; });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pg.setAttribute('aRnd', new THREE.BufferAttribute(pRnd, 1));
  pg.setAttribute('aShell', new THREE.BufferAttribute(pShell, 1));
  {   // 每点分配到超立方的一条棱上（超维模式时点阵收拢为四维超立方）
    const E4 = new Float32Array(pts.length * 4), EX = new Float32Array(pts.length * 2), per = Math.ceil(pts.length / 32);
    pts.forEach((_, i) => { const [s, ax] = T_EDGES[i % 32]; E4.set(s, i * 4); EX[i * 2] = ax; EX[i * 2 + 1] = (Math.floor(i / 32) + 0.5) / per; });
    pg.setAttribute('aE4', new THREE.BufferAttribute(E4, 4));
    pg.setAttribute('aEx', new THREE.BufferAttribute(EX, 2));
  }
  const common = `
    uniform float uTime, uPulse, uCollapse, uLoad, uPR, uR, uBoot, uMorph; uniform vec3 uWhite, uAcc;
    attribute float aRnd;
    vec3 deform(vec3 p){
      float k = 1.0 + uPulse * (0.16 + 0.03 * sin(uTime * 3.0 + aRnd * 6.2832));
      float bt = smoothstep(aRnd * 0.55, aRnd * 0.55 + 0.45, uBoot);
      return p * k * (1.0 - 0.78 * uCollapse) * mix(0.02, 1.0, bt);
    }
    float scanBand(vec3 p){ float sy = p.y / uR; float s1 = sin(uTime * 0.45) * 1.05; float s2 = sin(uTime * 0.31 + 2.1) * 1.05;
      return exp(-pow((sy - s1) * 16.0, 2.0)) + 0.6 * exp(-pow((sy - s2) * 22.0, 2.0)); }
    float depthA(vec3 p){ vec4 w = modelMatrix * vec4(p, 1.0); return smoothstep(-uR, uR, w.z); }`;
  const pm = new THREE.ShaderMaterial({
    uniforms: sphereUni, ...ADD,
    vertexShader: common + `
      attribute float aShell; attribute vec4 aE4; attribute vec2 aEx; uniform float uXW, uYW, uZW; varying float vA; varying vec3 vC;
      vec3 tessP(out float w4){
        vec4 v = aE4; float t = aEx.y; float ax = aEx.x;
        if (ax < 0.5) v.x += 2.0 * t; else if (ax < 1.5) v.y += 2.0 * t; else if (ax < 2.5) v.z += 2.0 * t; else v.w += 2.0 * t;
        float c = cos(uXW), s = sin(uXW); v = vec4(c * v.x - s * v.w, v.y, v.z, s * v.x + c * v.w);
        c = cos(uYW); s = sin(uYW); v = vec4(v.x, c * v.y - s * v.w, v.z, s * v.y + c * v.w);
        c = cos(uZW); s = sin(uZW); v = vec4(v.x, v.y, c * v.z - s * v.w, s * v.z + c * v.w);
        w4 = v.w; return v.xyz * (6.5 / (2.6 - v.w));
      }
      void main(){
        vec3 p = deform(position);
        float w4 = 0.0; vec3 tp = tessP(w4) * (1.0 + uPulse * 0.08);
        p = mix(p, tp, uMorph);
        float flash = step(fract(uTime * 0.22 + aRnd * 17.0), 0.012 + 0.05 * uLoad);
        float sb = scanBand(position) * aShell;
        float aBase = (aShell > 0.5 ? mix(0.18, 0.95, depthA(p)) : 0.22) * (1.0 - 0.6 * uCollapse) + flash + sb * 0.9;
        vA = mix(aBase, 0.55 + 0.5 * smoothstep(-1.0, 1.0, w4) + flash, uMorph) * uBoot;
        vC = mix(mix(uWhite, uAcc, flash), uAcc, min(sb, 1.0) * 0.75);
        vC = mix(vC, mix(uWhite, uAcc, smoothstep(-0.2, 1.0, w4)), uMorph);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = mix(aShell > 0.5 ? 0.16 : 0.11, 0.2, uMorph) * (1.0 + 2.0 * flash + 0.8 * sb) * uPR * (300.0 / -mv.z);
      }`,
    fragmentShader: ROUND_FS,
  });
  sphere.add(new THREE.Points(pg, pm));

  // 近邻连线（每点连 3 个最近邻）
  const seg = new Set(), lp = [], lr = [];
  for (let i = 0; i < NS; i++) {
    const best = [];
    for (let j = 0; j < NS; j++) {
      if (i === j) continue;
      const d = pts[i].distanceToSquared(pts[j]);
      if (best.length < 3) { best.push([d, j]); best.sort((a, b) => a[0] - b[0]); }
      else if (d < best[2][0]) { best[2] = [d, j]; best.sort((a, b) => a[0] - b[0]); }
    }
    for (const [, j] of best) {
      const key = i < j ? i * 10000 + j : j * 10000 + i;
      if (seg.has(key)) continue; seg.add(key);
      const r = Math.random();
      lp.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z); lr.push(r, r);
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
  lg.setAttribute('aRnd', new THREE.BufferAttribute(new Float32Array(lr), 1));
  const lm = new THREE.ShaderMaterial({
    uniforms: sphereUni, ...ADD,
    vertexShader: common + `
      varying float vA; varying vec3 vC;
      void main(){
        vec3 p = deform(position);
        float flash = step(fract(uTime * 0.15 + aRnd * 23.0), 0.01 + 0.06 * uLoad);
        float sb = scanBand(position);
        vA = (mix(0.03, 0.2, depthA(p)) + flash * 0.9 + sb * 0.35) * (1.0 - 0.7 * uCollapse) * (1.0 - uMorph) * uBoot;
        vC = mix(mix(uWhite, uAcc, flash), uAcc, min(sb, 1.0) * 0.8);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, vA); }`,
  });
  sphere.add(new THREE.LineSegments(lg, lm));

  // 三道大圆轨道 + 彗星头
  for (let k = 0; k < 3; k++) {
    const rad = R * (1.04 + k * 0.035), n = 240;
    const c = new THREE.EllipseCurve(0, 0, rad, rad).getPoints(n);
    const g = new THREE.BufferGeometry().setFromPoints(c.map((p) => new THREE.Vector3(p.x, p.y, 0)));
    g.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(c.map((_, i) => i / n)), 1));
    const uni = { uHead: { value: k * 0.33 }, uVis: { value: 1 }, uWhite: shared.uWhite, uAcc: shared.uAcc, uBoot: shared.uBoot };
    const ring = new THREE.Line(g, new THREE.ShaderMaterial({ uniforms: uni, ...ADD,
      vertexShader: `attribute float aU; varying float vU; void main(){ vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uHead, uVis, uBoot; uniform vec3 uWhite, uAcc; varying float vU;
        void main(){ float d = fract(uHead - vU); float tr = exp(-d * 9.0);
          gl_FragColor = vec4(mix(uWhite, uAcc, exp(-d * 40.0)), (0.07 + 0.9 * tr) * uVis * uBoot); }` }));
    ring.rotation.set(Math.PI / 2 + k * 0.5, k * 0.9, 0);
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const head = new THREE.Points(hg, new THREE.ShaderMaterial({ uniforms: { uPR: shared.uPR, uAcc: shared.uAcc, uVis: uni.uVis, uBoot: shared.uBoot }, ...ADD,
      vertexShader: `uniform float uPR, uVis, uBoot; uniform vec3 uAcc; varying float vA; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vA = uVis * uBoot; vC = uAcc * 1.6 + 0.4;
          gl_PointSize = 0.55 * uPR * (300.0 / -mv.z); }`, fragmentShader: ROUND_FS }));
    head.frustumCulled = false;
    ring.add(head);
    sphere.add(ring);
    orbits.push({ ring, head, uni, rad, speed: 0.06 + k * 0.025 * (k % 2 ? -1 : 1) });
  }
}

// 核心：双多面体 + 能量辉光
const core = new THREE.Group();
core.position.copy(SC);
scene.add(core);
const octMat = new THREE.LineBasicMaterial({ color: 0xffcf7a, ...ADD, opacity: 0.55 });
function makeTess(scale, ptSize, rr = rot4) {
  const pos = new Float32Array(64 * 3), wv = new Float32Array(64);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aW', new THREE.BufferAttribute(wv, 1).setUsage(THREE.DynamicDrawUsage));
  const uni = { uA: { value: 1 }, uWhite: shared.uWhite, uAcc: shared.uAcc, uPR: shared.uPR, uSz: { value: ptSize } };
  const lines = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: uni, ...ADD,
    vertexShader: `attribute float aW; varying float vW; void main(){ vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uA; uniform vec3 uWhite, uAcc; varying float vW;
      void main(){ float k = smoothstep(-1.0, 1.0, vW); gl_FragColor = vec4(mix(uWhite, uAcc, k) * (1.0 + k), uA * (0.35 + 0.65 * k)); }` }));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: uni, ...ADD,
    vertexShader: `attribute float aW; uniform float uA, uPR, uSz; uniform vec3 uWhite, uAcc; varying float vA; varying vec3 vC;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float k = smoothstep(-1.0, 1.0, aW);
        vA = uA; vC = mix(uWhite, uAcc, k) * 1.6; gl_PointSize = uSz * (0.6 + 0.8 * k) * uPR * (300.0 / -mv.z); }`,
    fragmentShader: ROUND_FS }));
  lines.frustumCulled = pts.frustumCulled = false;
  lines.add(pts);
  return { lines, pos, wv, g, scale, uni, r: rr, upd() { fillTess(pos, wv, scale, rr); g.attributes.position.needsUpdate = true; g.attributes.aW.needsUpdate = true; } };
}
const coreTess = makeTess(2.6, 0.22);
const ico = coreTess.lines;
const icoMat = { set opacity(v) { coreTess.uni.uA.value = v; }, color: { set() {} } };
const oct = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(R * 0.16, 0)), octMat);
core.add(ico, oct);
const glowUni = { uAcc: shared.uAcc, uI: { value: 0.3 } };
const coreGlow = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShaderMaterial({ uniforms: glowUni, ...ADD,
  vertexShader: VS_UV,
  fragmentShader: `varying vec2 vUv; uniform vec3 uAcc; uniform float uI;
    void main(){ vec2 p = vUv * 2.0 - 1.0; float r = dot(p, p); gl_FragColor = vec4(uAcc * (exp(-r * 9.0) * 0.9 + exp(-r * 40.0) * 1.2) * uI, 1.0); }` }));
core.add(coreGlow);
billboards.push(coreGlow);

// 电弧（聚变模式常驻，其他模式任务开始时闪现）
const arcPos = new Float32Array(ARCN * ARCS * 2 * 3), arcAl = new Float32Array(ARCN * ARCS * 2);
const arcGeo = new THREE.BufferGeometry();
arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3).setUsage(THREE.DynamicDrawUsage));
arcGeo.setAttribute('aA', new THREE.BufferAttribute(arcAl, 1).setUsage(THREE.DynamicDrawUsage));
const arcUni = { uVis: { value: 0 }, uWhite: shared.uWhite, uAcc: shared.uAcc };
const arcs = new THREE.LineSegments(arcGeo, new THREE.ShaderMaterial({ uniforms: arcUni, ...ADD,
  vertexShader: `attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uVis; uniform vec3 uWhite, uAcc; varying float vA; void main(){ gl_FragColor = vec4(mix(uAcc, uWhite, vA) * 1.5, vA * uVis); }` }));
arcs.frustumCulled = false;
sphere.add(arcs);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ax = new THREE.Vector3(), _d = new THREE.Vector3();
const randUnit = (v) => v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
function regenArcs() {
  let o = 0, oa = 0;
  for (let a = 0; a < ARCN; a++) {
    randUnit(_a); randUnit(_ax).cross(_a).normalize();
    _b.copy(_a).applyAxisAngle(_ax, 0.35 + Math.random() * 0.95);
    const amp = 0.18 + Math.random() * 0.4, alpha = 0.35 + 0.65 * Math.random(), lift = 0.06 + Math.random() * 0.14;
    let px = 0, py = 0, pz = 0;
    for (let s = 0; s <= ARCS; s++) {
      const t = s / ARCS, env = Math.sin(Math.PI * t);
      _d.copy(_a).lerp(_b, t).normalize().multiplyScalar(R * (1.0 + lift * env));
      if (s > 0 && s < ARCS) _d.add(randUnit(_ax).multiplyScalar(amp * env * Math.random()));
      if (s > 0) {
        arcPos.set([px, py, pz, _d.x, _d.y, _d.z], o); o += 6;
        const al = alpha * (0.4 + 0.6 * env); arcAl[oa++] = al; arcAl[oa++] = al;
      }
      px = _d.x; py = _d.y; pz = _d.z;
    }
  }
  arcGeo.attributes.position.needsUpdate = true; arcGeo.attributes.aA.needsUpdate = true;
}
regenArcs();

const holeDisk = new THREE.Mesh(new THREE.CircleGeometry(1.95, 64), new THREE.MeshBasicMaterial({ color: 0x000000 }));
holeDisk.position.copy(SC).add(new THREE.Vector3(0, 0, 1.9));
scene.add(holeDisk);

// ---------- 刻度盘（屏幕平面，细线抗锯齿） ----------
const dialUni = { uTime: shared.uTime, uSpin: shared.uSpin, uBoot: shared.uBoot, uVis: { value: 1 }, uScale: { value: DIAL },
  uFillA: { value: new Array(8).fill(0) }, uActA: { value: new Array(8).fill(0) }, uOnA: { value: new Array(8).fill(0) },
  uFillB: { value: new Array(4).fill(0) }, uActB: { value: new Array(4).fill(0) }, uOnB: { value: new Array(4).fill(0) },
  uWhite: shared.uWhite, uAcc: shared.uAcc };
const dial = new THREE.Mesh(new THREE.PlaneGeometry(DIAL * 2, DIAL * 2), new THREE.ShaderMaterial({
  uniforms: dialUni, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  vertexShader: VS_UV,
  fragmentShader: `
    varying vec2 vUv;
    uniform float uTime, uSpin, uVis, uScale, uBoot;
    uniform float uFillA[8], uActA[8], uOnA[8], uFillB[4], uActB[4], uOnB[4];
    uniform vec3 uWhite, uAcc;
    float hair(float d, float px){ float w = fwidth(d) * px; return 1.0 - smoothstep(0.0, w, abs(d)); }
    float band(float d, float hw){ float w = fwidth(d); return 1.0 - smoothstep(hw - w, hw + w, abs(d)); }
    float h11(float x){ return fract(sin(x * 127.1) * 43758.5453); }
    void main(){
      vec2 p = (vUv * 2.0 - 1.0) * uScale; float r = length(p);
      if (r > uScale) discard;
      float a01 = fract(atan(p.x, p.y) / 6.28318);
      vec3 col = vec3(0.0);
      col += uWhite * 0.30 * hair(r - 7.35, 1.2);
      float ta = fract(a01 + uTime * uSpin * 0.004);
      float inTick = step(7.55, r) * step(r, 7.85);
      float tk = 1.0 - smoothstep(0.0, fwidth(ta * 120.0) * 1.2, abs(fract(ta * 120.0 + 0.5) - 0.5));
      float tl = 1.0 - smoothstep(0.0, fwidth(ta * 12.0) * 1.6, abs(fract(ta * 12.0 + 0.5) - 0.5));
      col += uWhite * (0.30 * tk * inTick + 0.65 * tl * step(7.55, r) * step(r, 8.25));
      // H100 × 8 显存弧段
      float sa = a01 * 8.0; int ia = int(floor(sa)); float fa = fract(sa);
      float inA = step(0.035, fa) * step(fa, 0.965); float u = (fa - 0.035) / 0.93;
      float bA = band(r - 8.75, 0.11);
      float filled = step(u, uFillA[ia]);
      float act = uActA[ia], on = uOnA[ia];
      float hl = exp(-pow((u - fract(uTime * (0.08 + 0.45 * act))) * 22.0, 2.0)) * act;
      col += uWhite * bA * inA * (0.08 + 0.85 * filled * (0.55 + 0.45 * act)) * mix(0.2, 1.0, on);
      col += uAcc * bA * inA * hl * 1.4;
      col += uWhite * 0.16 * inA * (hair(r - 8.58, 1.0) + hair(r - 8.92, 1.0));
      // 显存填充尖端指针
      float tipA = (float(ia) + 0.035 + 0.93 * clamp(uFillA[ia], 0.0, 1.0)) / 8.0;
      float dArc = abs(a01 - tipA) * 6.28318 * r;
      col += uAcc * 0.9 * on * step(9.0, r) * step(r, 9.28) * step(dArc, (r - 9.0) * 0.6);
      // RTX 5090 × 4
      float sb = a01 * 4.0; int ib = int(floor(sb)); float fb = fract(sb);
      float inB = step(0.03, fb) * step(fb, 0.97); float ub = (fb - 0.03) / 0.94;
      col += uAcc * band(r - 9.45, 0.05) * inB * (0.10 + 0.85 * step(ub, uFillB[ib])) * mix(0.15, 1.0, uOnB[ib]);
      // 反向细分虚线
      float cr = fract(a01 + uTime * uSpin * 0.006);
      col += uWhite * 0.22 * hair(r - 9.78, 1.0) * step(fract(cr * 48.0), 0.25);
      // 外圈旋转虚线 + 十字准星
      float tb = fract(a01 - uTime * uSpin * 0.01);
      col += uWhite * 0.32 * hair(r - 10.05, 1.0) * step(fract(tb * 180.0), 0.5);
      float crs = step(10.15, r) * step(r, 10.55) * (1.0 - smoothstep(0.0, fwidth(a01 * 4.0) * 1.5, abs(fract(a01 * 4.0 + 0.5) - 0.5)));
      col += uAcc * 0.8 * crs;
      // 雷达扫掠
      float head = fract(uTime * 0.06 * uSpin); float dsw = fract(head - a01);
      float ann = step(7.4, r) * step(r, 10.6);
      col += uAcc * ann * (exp(-dsw * 7.0) * 0.03 + exp(-dsw * 700.0) * 0.3);
      // 频谱冠：每段柱高 = 该卡实时活跃度
      float NB = 180.0; float bi = floor(a01 * NB); float bf = fract(a01 * NB);
      int sg = int(floor(a01 * 8.0));
      float lv = 0.1 + 0.9 * uActA[sg] * uOnA[sg];
      float wob = 0.55 + 0.45 * sin(bi * 0.9 + uTime * (2.0 + 4.0 * lv)) * sin(bi * 0.23 - uTime * 1.3);
      float fl = h11(bi + floor(uTime * 10.0) * 17.0);
      float hgt = 0.06 + 0.62 * lv * wob * (0.75 + 0.25 * fl);
      float inBar = step(0.3, bf) * step(bf, 0.7) * step(10.72, r) * step(r, 10.72 + hgt);
      col += mix(uWhite, uAcc, smoothstep(0.25, 0.55, hgt)) * inBar * 0.5;
      // 外缘旋转弧
      float oa = fract(a01 - uTime * uSpin * 0.015);
      float arcs = min(1.0, step(oa, 0.16) + step(0.33, oa) * step(oa, 0.41) + step(0.6, oa) * step(oa, 0.86));
      col += uWhite * 0.30 * hair(r - 11.55, 1.2) * arcs;
      // 开机扫描展开
      float bA2 = uBoot * 1.05;
      col *= step(a01, bA2);
      col += uAcc * exp(-pow((a01 - bA2) * 140.0, 2.0)) * step(7.3, r) * step(r, 11.6) * (1.0 - step(1.0, uBoot)) * 0.6;
      gl_FragColor = vec4(col * uVis, 1.0);
    }`,
}));
const dialGroup = new THREE.Group();
dialGroup.position.copy(SC);
dialGroup.rotation.set(-0.12, 0.42, 0.04);
scene.add(dialGroup);
dialGroup.add(dial);

// ---------- 流线（细丝）、粒子、数据包彗尾 ----------
{
  const nSeg = N * FIB * FSEG, aNode = new Float32Array(nSeg * 2), aOff = new Float32Array(nSeg * 4), aT = new Float32Array(nSeg * 2);
  let s = 0;
  for (let n = 0; n < N; n++) for (let f = 0; f < FIB; f++) {
    const o1 = Math.random() * 2 - 1, o2 = Math.random() * 2 - 1;
    for (let k = 0; k < FSEG; k++) {
      aNode[s * 2] = aNode[s * 2 + 1] = n;
      aOff.set([o1, o2, o1, o2], s * 4);
      aT[s * 2] = k / FSEG; aT[s * 2 + 1] = (k + 1) / FSEG; s++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nSeg * 6), 3));
  g.setAttribute('aNode', new THREE.BufferAttribute(aNode, 1));
  g.setAttribute('aOff', new THREE.BufferAttribute(aOff, 2));
  g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 300);
  const m = new THREE.ShaderMaterial({
    uniforms: shared, ...ADD,
    vertexShader: PATH_GLSL + `
      uniform vec3 uWhite; attribute float aNode; attribute vec2 aOff; attribute float aT; varying float vA; varying vec3 vC;
      void main(){
        int n = int(aNode + 0.5);
        vec3 p = pathBlend(n, aT, aOff.x * 0.9, aOff.y);
        float grow = smoothstep(aT - 0.1, aT, uBoot * 1.1);
        vA = uNodeOn[n] * (0.03 + 0.11 * uNodeAmp[n]) * pow(sin(3.14159 * aT), 0.35) * grow;
        vC = mix(uWhite, uNodeCol[n], 0.35);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, vA); }`,
  });
  const fibers = new THREE.LineSegments(g, m); fibers.frustumCulled = false; scene.add(fibers);
}
const pGeo = new THREE.BufferGeometry();
{
  const seed = new Float32Array(MAXP * 4), node = new Float32Array(MAXP);
  for (let i = 0; i < MAXP; i++) { seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4); node[i] = Math.floor(Math.random() * N); }
  pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
  pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  pGeo.setAttribute('aNode', new THREE.BufferAttribute(node, 1));
  pGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 300);
}
const particles = new THREE.Points(pGeo, new THREE.ShaderMaterial({
  uniforms: shared, ...ADD,
  vertexShader: PATH_GLSL + `
    uniform vec3 uWhite, uAcc; uniform float uPR;
    attribute vec4 aSeed; attribute float aNode; varying float vA; varying vec3 vC;
    void ambient(float m, out vec3 p, out float a, out vec3 c){
      c = uWhite;
      if (m < 0.5) {            // 环绕尘带
        float r = uR * 1.12 + pow(aSeed.x, 1.6) * 4.0; float an = aSeed.y * 6.2832 + uTime * uSpin * 0.6 / r;
        p = uSC + tiltX(vec3(cos(an) * r, (aSeed.z - 0.5) * 0.12, sin(an) * r), 1.25) ; a = 0.30;
      } else if (m < 1.5) {     // 吸积盘 + 光子环 + 相对论喷流
        if (aSeed.z > 0.82) { float an = aSeed.y * 6.2832 + uTime * uSpin * 0.5; float r = 1.8 + aSeed.x * 0.35;
          p = uSC + vec3(cos(an) * r, sin(an) * r, 0.7); a = 0.7 * (1.0 - aSeed.x); c = mix(uWhite, uAcc, 0.5); }
        else if (aSeed.z > 0.72) {
          float side = aSeed.x > 0.5 ? 1.0 : -1.0; float s = fract(aSeed.y + uTime * 0.32);
          vec3 ax = tiltX(vec3(0.0, 1.0, 0.0), 0.3), e1 = vec3(1.0, 0.0, 0.0), e2 = tiltX(vec3(0.0, 0.0, 1.0), 0.3);
          float an = aSeed.w * 6.2832 * 9.0 + s * 6.0; float sp = (0.12 + s * 1.3) * fract(aSeed.x * 13.7);
          p = uSC + ax * side * (1.2 + s * 10.5) + (e1 * cos(an) + e2 * sin(an)) * sp;
          a = (1.0 - s) * 0.75; c = mix(uAcc, uWhite, s);
        }
        else { float r = 1.85 + pow(aSeed.x, 1.4) * 9.5; float an = aSeed.y * 6.2832 + uTime * uSpin * 1.6 / sqrt(r);
          p = uSC + tiltX(vec3(cos(an) * r, (aSeed.z - 0.5) * 0.03 * r, sin(an) * r), 0.3);
          float heat = smoothstep(7.0, 1.85, r); a = 0.3 + 1.1 * heat; c = mix(uWhite, uAcc, heat * 0.8); }
      } else if (m < 2.5) {     // 冲击波壳层 + 赤道环
        vec3 dir = normalize(aSeed.xyz * 2.0 - 1.0 + 1e-4); float pl = fract(uTime * 0.25 + aSeed.w * 0.08);
        if (aSeed.w < 0.06) { float an = aSeed.y * 6.2832; dir = tiltX(vec3(cos(an), 0.0, sin(an)), 1.2); }
        p = uSC + dir * (uR * 0.4 + pl * 17.0); a = (1.0 - pl) * 0.55; c = mix(uAcc, uWhite, pl);
      } else if (m < 3.5) {     // 背景漂浮尘
        p = vec3((aSeed.x - 0.5) * 60.0, (aSeed.y - 0.5) * 32.0 + sin(uTime * 0.2 + aSeed.z * 6.0) * 0.5, (aSeed.z - 0.5) * 12.0 - 6.0); a = 0.10;
      } else {                  // 克利福德环面：四维环面经旋转与球极投影后不断自我翻转
        float a1 = aSeed.x * 6.2832, b1 = aSeed.y * 6.2832 + uTime * 0.25;
        vec4 v = vec4(cos(a1), sin(a1), cos(b1), sin(b1)) * 0.7071;
        float cs = cos(uXW * 0.7), sn = sin(uXW * 0.7); v = vec4(cs * v.x - sn * v.w, v.y, v.z, sn * v.x + cs * v.w);
        cs = cos(uYW); sn = sin(uYW); v = vec4(v.x, cs * v.y - sn * v.w, v.z, sn * v.y + cs * v.w);
        vec3 q = v.xyz / (1.25 - v.w);
        p = uSC + tiltX(q * 5.4, 0.35); a = 0.22 + 0.25 * smoothstep(-0.5, 0.7, v.w); c = mix(uWhite, uAcc, smoothstep(0.0, 0.7, v.w));
      }
    }
    void main(){
      int n = int(aNode + 0.5); float amp = uNodeAmp[n], on = uNodeOn[n];
      float b = smoothstep(0.0, 1.0, uBlend);
      vec3 p; float a;
      if (aSeed.w < 0.24) {
        vec3 pA, pB, cA, cB; float aA, aB;
        ambient(uModeA, pA, aA, cA); ambient(uModeB, pB, aB, cB);
        p = mix(pA, pB, b); a = mix(aA, aB, b); vC = mix(cA, cB, b);
      } else {
        float t = fract(aSeed.z + uTime * (0.03 + 0.2 * amp));
        p = pathBlend(n, t, (aSeed.x * 2.0 - 1.0) * 0.9, aSeed.y * 2.0 - 1.0);
        a = on * (0.10 + 0.9 * amp) * smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.96, t);
        vC = mix(uWhite, uNodeCol[n], 0.4);
      }
      vA = a * smoothstep(aSeed.w * 0.6, aSeed.w * 0.6 + 0.4, uBoot);
      vC *= 1.3;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = 0.11 * (0.5 + aSeed.w) * uPR * (300.0 / -mv.z);
    }`,
  fragmentShader: ROUND_FS,
}));
particles.frustumCulled = false;
scene.add(particles);
{
  const cnt = N * PK * TR, aNode = new Float32Array(cnt), aSeed = new Float32Array(cnt * 4), aTr = new Float32Array(cnt);
  let i = 0;
  for (let n = 0; n < N; n++) for (let k = 0; k < PK; k++) {
    const sd = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random(), 0.7 + Math.random() * 0.6];
    for (let t = 0; t < TR; t++) { aNode[i] = n; aSeed.set(sd, i * 4); aTr[i] = t / TR; i++; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cnt * 3), 3));
  g.setAttribute('aNode', new THREE.BufferAttribute(aNode, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 4));
  g.setAttribute('aTr', new THREE.BufferAttribute(aTr, 1));
  const packets = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: shared, ...ADD,
    vertexShader: PATH_GLSL + `
      uniform vec3 uWhite, uAcc; uniform float uPR;
      attribute float aNode, aTr; attribute vec4 aSeed; varying float vA; varying vec3 vC;
      void main(){
        int n = int(aNode + 0.5); float amp = uNodeAmp[n];
        float t0 = fract(aSeed.z + uTime * (0.05 + 0.2 * amp) * aSeed.w);
        float t = t0 - aTr * 0.02; float vis = step(0.0, t); t = clamp(t, 0.0, 1.0);
        vec3 p = pathBlend(n, t, aSeed.x * 0.9, aSeed.y);
        float th = t * 30.0 + aSeed.z * 40.0 + (aSeed.w > 1.0 ? 3.14159 : 0.0);   // 双螺旋缠绕
        p += vec3(0.0, cos(th), sin(th)) * 0.26 * sin(3.14159 * t);
        vA = uNodeOn[n] * smoothstep(0.35, 0.7, amp) * vis * pow(1.0 - aTr, 1.6) * smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.93, t) * uBoot;
        vC = mix(uWhite * 1.8, uAcc * 1.4, min(1.0, aTr * 1.6));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.4 - 0.28 * aTr) * uPR * (300.0 / -mv.z);
      }`,
    fragmentShader: ROUND_FS }));
  packets.frustumCulled = false;
  scene.add(packets);
}

// ---------- 多层网络：全连接拓扑脉冲线 ----------
const netUni = { uTime: shared.uTime, uVis: { value: 0 }, uNodeAmp: shared.uNodeAmp, uWhite: shared.uWhite, uAcc: shared.uAcc };
{
  const pos = [], aU = [], aR = [], aN = [];
  const add = (p, q, n) => { const r = Math.random(); pos.push(p.x, p.y, p.z, q.x, q.y, q.z); aU.push(0, 1); aR.push(r, r); aN.push(n, n); };
  const E = SC.clone().add(new THREE.Vector3(R, 0, 0));
  H1.forEach((h) => add(E, h, -1));
  H1.forEach((h) => H2.forEach((k) => add(h, k, -1)));
  H2.forEach((k) => nodePos.forEach((np, n) => add(k, np, n)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(aU), 1));
  g.setAttribute('aRnd', new THREE.BufferAttribute(new Float32Array(aR), 1));
  g.setAttribute('aNode', new THREE.BufferAttribute(new Float32Array(aN), 1));
  const net = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: netUni, ...ADD,
    vertexShader: `uniform float uNodeAmp[${N}]; attribute float aU, aRnd, aNode; varying float vU, vR, vAmp;
      void main(){ vU = aU; vR = aRnd; vAmp = aNode < -0.5 ? 0.6 : uNodeAmp[int(aNode + 0.5)]; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uVis; uniform vec3 uWhite, uAcc; varying float vU, vR, vAmp;
      void main(){ float d = fract(uTime * 0.45 + vR - vU); float pl = exp(-d * 22.0);
        gl_FragColor = vec4(mix(uWhite, uAcc, pl), (0.03 + 0.04 * vAmp + pl * 0.6 * vAmp) * uVis); }` }));
  net.frustumCulled = false;
  scene.add(net);
}

// ---------- 右侧总线导轨 ----------
{
  const pts = [nodePos[0].clone().add(new THREE.Vector3(0.2, 0.95, 1.0)), ...nodePos, nodePos[N - 1].clone().add(new THREE.Vector3(-0.2, -0.95, -1.0))];
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  g.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(pts.map((_, i) => i / (pts.length - 1))), 1));
  scene.add(new THREE.Line(g, new THREE.ShaderMaterial({ uniforms: shared, ...ADD,
    vertexShader: `attribute float aU; varying float vU; void main(){ vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uBoot; uniform vec3 uWhite, uAcc; varying float vU;
      void main(){ float dash = step(0.55, fract(vU * 90.0 - uTime * 2.0)); float run = exp(-pow((fract(uTime * 0.25) - vU) * 18.0, 2.0));
        gl_FragColor = vec4(mix(uWhite, uAcc, run), (0.08 + 0.18 * dash + 0.7 * run) * step(vU, uBoot * 1.05)); }` })));
}

// ================= v5 无尽纵深层 =================
const VP = new THREE.Vector2(-3.0, -1.0);            // 消失点（略偏主体球）
{   // 曲速星流：从数百单位深处向镜头飞来的拉丝光点
  const n = 1700, seed = new Float32Array(n * 2 * 4), end = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const sd = [Math.random(), Math.random(), Math.random(), Math.random()]; seed.set(sd, i * 8); seed.set(sd, i * 8 + 4); end[i * 2] = 0; end[i * 2 + 1] = 1; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const warp = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: { ...shared, uVP: { value: VP } }, ...ADD,
    vertexShader: `uniform float uTime, uBoot; uniform vec2 uVP; uniform vec3 uWhite, uAcc; attribute vec4 aSeed; attribute float aEnd; varying float vA; varying vec3 vC;
      void main(){
        float ph = fract(aSeed.w + uTime * (0.012 + 0.03 * aSeed.z));
        float z = mix(-360.0, 26.0, ph);
        float an = aSeed.x * 6.2832, r = 9.0 + pow(aSeed.y, 0.75) * 85.0;
        vec3 p = vec3(uVP.x + cos(an) * r, uVP.y + sin(an) * r * 0.62, z);
        p.z -= aEnd * (0.6 + 16.0 * smoothstep(-220.0, 26.0, z));
        vA = smoothstep(0.0, 0.2, ph) * smoothstep(1.0, 0.9, ph) * (0.18 + 0.5 * aSeed.z) * (1.0 - 0.85 * aEnd) * uBoot;
        vC = mix(uWhite, uAcc, step(0.86, aSeed.y));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, vA); }` }));
  warp.frustumCulled = false;
  scene.add(warp);
}
const tunnel = [];
for (let k = 0; k < 7; k++) {   // 超立方隧道：七重四维立方由远及近穿过，形成无尽回廊
  const T = makeTess(30, 1.4, { xw: k * 0.9, yw: k * 0.4, zw: 0 });
  scene.add(T.lines);
  tunnel.push({ T });
}

// ================= v4 多维层 =================
// 巨型超立方（超维模式）
const bigTess = makeTess(6.5, 0.7);
sphere.add(bigTess.lines);

// 浑天仪式陀螺环：3D 倾斜刻度环，前亮后暗体现纵深
const gimbals = [];
for (let k = 0; k < 3; k++) {
  const r0 = 7.9 + k * 0.75, r1 = r0 + 0.24;
  const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 320, 1), new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uBoot: shared.uBoot, uWhite: shared.uWhite, uAcc: shared.uAcc, uK: { value: k }, uR0: { value: r0 }, uR1: { value: r1 }, uVis: { value: 1 } },
    ...ADD, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vL; varying float vZ; void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vZ = w.z; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uBoot, uK, uR0, uR1, uVis; uniform vec3 uWhite, uAcc; varying vec3 vL; varying float vZ;
      float hair(float d, float px){ float w = fwidth(d) * px; return 1.0 - smoothstep(0.0, w, abs(d)); }
      void main(){
        float r = length(vL.xy); float a = atan(vL.y, vL.x) / 6.28318 + 0.5;
        float dir = uK == 1.0 ? -1.0 : 1.0;
        float edges = hair(r - uR0 - 0.01, 1.2) + hair(r - uR1 + 0.01, 1.2);
        float tick = step(fract(a * (90.0 + 30.0 * uK)), 0.3) * step(uR0 + 0.07, r) * step(r, uR1 - 0.07);
        float seg = step(0.06, fract(a * (3.0 + uK) + uTime * 0.015 * dir));
        float bead = exp(-pow((fract(a - uTime * 0.045 * dir * (1.0 + uK * 0.5)) - 0.5) * 70.0, 2.0));
        float depth = smoothstep(-10.0, 10.0, vZ);
        float al = ((0.09 * edges + 0.16 * tick) * seg * mix(0.2, 1.0, depth) + bead * 0.9 * depth) * uVis * uBoot;
        gl_FragColor = vec4(mix(uWhite, uAcc, min(1.0, bead + 0.35 * uK)), al);
      }` }));
  m.position.copy(SC);
  scene.add(m); gimbals.push(m);
}

// 三维显存时序城：12 卡 × 24 采样（48 秒）柱阵，最前排为最新
const CR = 24, CITY = new THREE.Vector3(-1.2, -10.6, -8);
const cityH = new Float32Array(N * CR), cityShown = new Float32Array(N * CR);
const nodeHist = Array.from({ length: N }, () => []);
let cityAttr = null;
{
  const base = new THREE.BoxGeometry(0.78, 1, 0.78); base.translate(0, 0.5, 0);
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = base.index; ig.setAttribute('position', base.attributes.position); ig.setAttribute('uv', base.attributes.uv);
  const cell = new Float32Array(N * CR * 2);
  for (let c = 0; c < N; c++) for (let r = 0; r < CR; r++) { cell[(c * CR + r) * 2] = c; cell[(c * CR + r) * 2 + 1] = r; }
  ig.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
  ig.setAttribute('aH', new THREE.InstancedBufferAttribute(cityShown, 1).setUsage(THREE.DynamicDrawUsage));
  ig.instanceCount = N * CR;
  cityAttr = ig.attributes.aH;
  const city = new THREE.Mesh(ig, new THREE.ShaderMaterial({
    uniforms: { uBase: { value: CITY }, uBoot: shared.uBoot, uTime: shared.uTime, uWhite: shared.uWhite, uAcc: shared.uAcc }, ...ADD,
    vertexShader: `attribute vec2 aCell; attribute float aH; uniform vec3 uBase; uniform float uBoot; varying vec2 vUv; varying float vH, vRow, vCol, vY;
      void main(){ vUv = uv; vH = aH; vRow = aCell.y; vCol = aCell.x; vY = position.y;
        vec3 p = position; p.y *= max(aH, 0.015) * 3.4 * uBoot;
        vec3 w = uBase + vec3(aCell.x * 1.12 + (aCell.x > 7.5 ? 0.6 : 0.0), 0.0, -aCell.y * 1.22) + p;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uWhite, uAcc; varying vec2 vUv; varying float vH, vRow, vCol, vY;
      void main(){
        float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float edge = 1.0 - smoothstep(0.0, fwidth(e) * 1.6 + 0.004, e);
        float fade = pow(1.0 - vRow / 24.0, 2.2);
        vec3 c = vCol > 7.5 ? uAcc : uWhite;
        float top = step(0.999, vY);
        float scan = exp(-pow(fract(vRow / 24.0 - uTime * 0.12) - 0.5, 2.0) * 400.0);
        float al = (0.012 + 0.2 * edge + 0.12 * top * vH + 0.2 * scan * edge) * fade * (vRow < 0.5 ? 2.2 : 1.0);
        gl_FragColor = vec4(mix(c, uAcc, vH * 0.45 + scan * 0.5), al);
      }` }));
  city.frustumCulled = false;
  scene.add(city);
  // 底板网格
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 30), new THREE.ShaderMaterial({ uniforms: shared, ...ADD,
    vertexShader: VS_UV,
    fragmentShader: `varying vec2 vUv; uniform float uBoot, uTime; uniform vec3 uWhite, uAcc;
      void main(){ vec2 g = vUv * vec2(13.75, 24.6); vec2 d = abs(fract(g) - 0.5) / fwidth(g);
        float l = 1.0 - min(min(d.x, d.y) * 0.5, 1.0); float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y) ;
        float frame = step(vUv.x, 0.004) + step(0.996, vUv.x);
        gl_FragColor = vec4(uWhite * (0.035 * (1.0 - l) * 0.0 + 0.05 * l + 0.25 * frame) * fade * uBoot, 1.0); }` }));
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(CITY.x + 6.6, CITY.y - 0.01, CITY.z - 14.0);
  scene.add(plate);
}

// 前景散景光斑（景深层）
{
  const n = 70, p = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { p.set([(Math.random() - 0.5) * 50, (Math.random() - 0.5) * 26, 12 + Math.random() * 13], i * 3); s[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aRnd', new THREE.BufferAttribute(s, 1));
  const bok = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: shared, ...ADD,
    vertexShader: `uniform float uTime, uPR, uBoot; uniform vec3 uWhite, uAcc; attribute float aRnd; varying float vA; varying vec3 vC;
      void main(){ vec3 q = position + vec3(sin(uTime * 0.07 + aRnd * 9.0) * 1.5, sin(uTime * 0.11 + aRnd * 5.0) * 0.8, 0.0);
        vec4 mv = modelViewMatrix * vec4(q, 1.0); gl_Position = projectionMatrix * mv;
        vA = (0.012 + 0.022 * aRnd) * uBoot; vC = mix(uWhite, uAcc, step(0.82, aRnd) * 0.6);
        gl_PointSize = (1.6 + aRnd * 3.6) * uPR * (300.0 / -mv.z); }`,
    fragmentShader: `varying float vA; varying vec3 vC;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
        float a = smoothstep(1.0, 0.9, d) * (0.65 + 0.35 * smoothstep(0.55, 0.92, d)); gl_FragColor = vec4(vC, vA * a); }` }));
  bok.frustumCulled = false;
  scene.add(bok);
}

// 远景数据瀑布柱（全息字符流）
{
  const n = 34, pos = [], uv = [], sd = [], idx = [];
  for (let i = 0; i < n; i++) {
    let x = (Math.random() - 0.5) * 110; if (Math.abs(x - SC.x) < 9) x += 18;
    const z = -24 - Math.random() * 22, h = 30 + Math.random() * 16, w = 0.42, y = -2 + (Math.random() - 0.5) * 6, s = Math.random(), b = i * 4;
    pos.push(x - w, y - h / 2, z, x + w, y - h / 2, z, x + w, y + h / 2, z, x - w, y + h / 2, z);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1); sd.push(s, s, s, s);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(sd), 1));
  g.setIndex(idx);
  const cols = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: shared, ...ADD,
    vertexShader: `attribute float aSeed; varying vec2 vUv; varying float vS; void main(){ vUv = uv; vS = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uBoot; uniform vec3 uWhite, uAcc; varying vec2 vUv; varying float vS;
      float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        float cells = 64.0; float cy = floor(vUv.y * cells); float fy = fract(vUv.y * cells);
        float spd = 0.05 + 0.12 * fract(vS * 7.13);
        float head = fract(-uTime * spd + vS); float dy = fract(vUv.y - head);
        float trail = exp(-dy * 6.0); float hg = exp(-dy * 90.0);
        float glyph = step(0.38, rnd(vec2(cy, floor(uTime * 5.0 + vS * 50.0) + vS * 13.0)));
        float block = step(0.14, fy) * step(fy, 0.86) * step(0.18, vUv.x) * step(vUv.x, 0.82);
        float edgeFade = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
        float a = block * glyph * (0.04 + 0.5 * trail) * edgeFade;
        gl_FragColor = vec4(mix(uWhite, uAcc, hg + 0.25) * (a * 0.2 + hg * block * 0.35) * uBoot, 1.0);
      }` }));
  cols.frustumCulled = false;
  scene.add(cols);
}

// ---------- 节点标记（右侧列）与隐藏层 ----------
const MK = 2.4;
const markerFS = `
  varying vec2 vUv; uniform float uFill, uAct, uOn, uVis, uTime, uRip, uBoot; uniform vec3 uCol;
  float hair(float d, float px){ float w = fwidth(d) * px; return 1.0 - smoothstep(0.0, w, abs(d)); }
  void main(){
    vec2 p = (vUv * 2.0 - 1.0) * ${MK.toFixed(1)}; float r = length(p); if (r > ${MK.toFixed(1)}) discard;
    float a01 = fract(atan(p.x, p.y) / 6.28318);
    float ring = hair(r - 0.62, 1.2) * 0.55;
    float arc = (1.0 - smoothstep(0.08 - fwidth(r), 0.08 + fwidth(r), abs(r - 0.84))) * step(a01, uFill);
    float cdot = smoothstep(0.24, 0.0, r) * (0.35 + 0.9 * uAct * (0.7 + 0.3 * sin(uTime * 6.0)));
    float dash = hair(r - 1.08, 1.0) * step(0.5, fract(a01 * 16.0 - uTime * 0.6)) * smoothstep(0.3, 0.7, uAct) * 0.6;
    float rip = 0.0;
    if (uRip < 1.8) { float k = uRip / 1.8; rip = (hair(r - (0.7 + uRip * 1.0), 2.2) + 0.6 * hair(r - (0.7 + max(uRip - 0.25, 0.0) * 1.0), 1.6)) * pow(1.0 - k, 2.0) * 1.3; }
    vec3 c = uCol * (ring + arc * 1.2 + cdot * 1.6 + dash + rip);
    if (uOn < 0.5) c = vec3(0.35) * ring + uCol * rip;
    gl_FragColor = vec4(c * uVis * uBoot, 1.0);
  }`;
function makeMarker(size, col) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size * MK, size * MK), new THREE.ShaderMaterial({
    uniforms: { uFill: { value: 0 }, uAct: { value: 0 }, uOn: { value: 1 }, uVis: { value: 1 }, uRip: { value: 99 }, uTime: shared.uTime, uBoot: shared.uBoot, uCol: { value: new THREE.Color(col) } },
    vertexShader: VS_UV, fragmentShader: markerFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(m); billboards.push(m); return m;
}
const markers = nodePos.map((p) => { const m = makeMarker(1.25, '#ffffff'); m.position.copy(p); return m; });
const hMarkers = [...H1, ...H2].map((p) => { const m = makeMarker(0.9, '#ffffff'); m.position.copy(p); m.material.uniforms.uAct.value = 0.5; return m; });

// ---------- 标签 ----------
function addLabel(cls, html, pos, cx = 0.5, cy = 0.5) {
  const el = document.createElement('div'); el.className = cls; el.innerHTML = html;
  const o = new CSS2DObject(el); o.position.copy(pos); o.center.set(cx, cy); scene.add(o); return o;
}
const nodeLabels = nodePos.map((p) => addLabel('nlabel', '', p.clone().add(new THREE.Vector3(1.0, 0, 0)), 0, 0.5));
const coreLabel = addLabel('corelabel', '<div class="t1">金泰</div><div class="t2">KINGTAI · NX-01</div><div class="t3" id="coreT3"></div>', SC);
const segLabels = [];
for (let i = 0; i < 8; i++) {
  const a = (i + 0.5) / 8 * Math.PI * 2;   // 与着色器一致：顶部起顺时针
  const r = 12.2;
  const o = addLabel('segnum', `0${i}`, new THREE.Vector3(Math.sin(a) * r, Math.cos(a) * r, 0));
  dialGroup.add(o); segLabels.push(o);
}
const caps = [['任务编排', H1[0]], ['资源分配', H2[0]], ['GPU 执行', nodePos[0]]]
  .map(([t, p], i) => addLabel('hlabel', t, new THREE.Vector3(p.x, i === 2 ? p.y + 1.1 : 9.7, p.z)));
const cityLabel = addLabel('hlabel city', '显存时序 · 12 卡 × 48 秒', new THREE.Vector3(CITY.x - 0.4, CITY.y - 0.5, CITY.z + 0.6), 0, 0);

// ---------- 事件（任务开始/完成/排队/上下线）：节点涟漪 + 浮动提示 + 事件流 ----------
const popups = [];
let arcBoost = 0;
const elog = document.getElementById('elog');
function nowStr() { return (CAPTURE ? new Date(captureStart + simTime * 1000) : new Date()).toLocaleTimeString('zh-CN', { hour12: false }); }
function nodeName(n) { return n.machine === 'A' ? `H100·${n.index}` : `5090·${n.index}`; }
function fireEvent(i, kind, text) {
  const n = nodes[i];
  n.rip = simTime;
  if (kind === 'start') arcBoost = 1;
  const old = popups.find((p) => p.i === i);
  if (old) { scene.remove(old.obj); popups.splice(popups.indexOf(old), 1); }
  const obj = addLabel(`popup ${kind}`, text, nodePos[i].clone().add(new THREE.Vector3(-1.0, 0, 0)), 1, 0.5);
  popups.push({ i, obj, t0: simTime });
  if (elog) {
    const li = document.createElement('div'); li.className = `ev ${kind}`;
    li.innerHTML = `<span class="tm">${nowStr()}</span> <span class="nd">${nodeName(n)}</span> ${text.replace(/^[^\s]+\s/, '')}`;
    elog.prepend(li);
    while (elog.children.length > 3) elog.lastChild.remove();
  }
}
function detectEvents(i, g) {
  const n = nodes[i];
  const cur = { on: !!g.online, run: g.running || 0, pend: g.pending || 0 };
  const pv = n.prev; n.prev = cur;
  if (!pv || !eventsArmed) return;
  if (pv.on !== cur.on) { fireEvent(i, cur.on ? 'start' : 'off', cur.on ? '● 上线' : '○ 离线'); return; }
  if (!cur.on) return;
  if (cur.run > pv.run) fireEvent(i, 'start', '▶ 开始');
  else if (cur.run < pv.run) fireEvent(i, 'done', '✓ 完成');
  else if (cur.pend > pv.pend) fireEvent(i, 'pend', `⏳ 排队 +${cur.pend - pv.pend}`);
}

// ---------- 模式 ----------
let modeA = 0, modeB = 0, blend = 1, modeSince = 0, autoCycle = true;
const MODE_SEC = CAPTURE ? 15 : 25;
function setMode(m, now) {
  if (m === modeB && blend >= 1) return;
  modeA = blend > 0.5 ? modeB : modeA; modeB = m; blend = 0; modeSince = now;
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', +b.dataset.mode === m));
}

// ---------- 配色 ----------
function applyPalette(name) {
  pal = PALETTES[name] || PALETTES.mono;
  shared.uWhite.value.set(pal.white); shared.uAcc.value.set(pal.acc); shared.uNeb.value.set(pal.neb);
  for (let i = 0; i < N; i++) {
    const c = new THREE.Color(i < 8 ? pal.a : pal.b);
    shared.uNodeCol.value[i].set(c.r, c.g, c.b);
    markers[i].material.uniforms.uCol.value.copy(c);
  }
  hMarkers.forEach((m) => m.material.uniforms.uCol.value.set(pal.white));
  icoMat.color.set(pal.white); octMat.color.set(pal.acc);
  finish.uniforms.uStreakCol.value.set(pal.acc).lerp(new THREE.Color(pal.white), 0.35);
  document.documentElement.style.setProperty('--acc', pal.acc);
  document.documentElement.style.setProperty('--ink', pal.white);
  document.querySelectorAll('#palettes button').forEach((b) => b.classList.toggle('on', b.dataset.pal === name));
}
applyPalette('mono');

// ---------- 数据 ----------
const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(+v) ? '--' : Number(v).toFixed(d));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function nodeHtml(n) {
  const r = n.raw;
  if (n.machine === 'A') {
    if (!n.online) return `<span class="id">H100·${n.index}</span>  <span class="st">离线</span>`;
    const st = r.running ? `<span class="run">▶${r.running}</span>` : '<span class="st">空闲</span>';
    const pd = r.pending ? ` <span class="pend">⏳${r.pending}</span>` : '';
    return `<span class="id">H100·${n.index}</span>  ${fmt(r.vram_used)}<span class="st">/${fmt(r.vram_total, 0)}G</span>  ${st}${pd}`;
  }
  const role = { 0: 'Qwen', 1: 'Blender', 2: 'Topaz', 3: 'ComfyUI' }[n.index];
  if (!n.online) return `<span class="id">5090·${n.index}</span>  <span class="st">${role} · 未上线</span>`;
  if (n.index === 0) return `<span class="id">5090·0</span>  <span class="st">${role}</span> ${fmt(r.tok_s)}<span class="st"> tok/s</span>`;
  if (n.index === 3) return `<span class="id">5090·3</span>  <span class="st">${role}</span> ${fmt(r.temp_c, 0)}°C ${fmt(r.power_w, 0)}W`;
  return `<span class="id">5090·${n.index}</span>  <span class="st">${role}</span>`;
}
function push(arr, v) { if (v === null || v === undefined || Number.isNaN(v)) return; arr.push(v); if (arr.length > HMAX) arr.shift(); }

function applyStats(j, record) {
  lastJ = j;
  const list = [...(j.a?.gpus || []), ...(j.b?.gpus || [])];
  for (let i = 0; i < N; i++) {
    const n = nodes[i], g = list.find((x) => x.id === n.id) || {};
    if (record) detectEvents(i, g);
    n.raw = g; n.online = !!g.online;
    n.frac = g.vram_total ? clamp01((g.vram_used ?? (g.vram_total - (g.vram_free ?? g.vram_total))) / g.vram_total) : 0;
    let amp = 0;
    if (n.online) {
      const run = g.running ? 1 : 0, pend = Math.min(g.pending || 0, 5);
      if (n.machine === 'A') amp = 0.08 + 0.62 * run + 0.06 * pend + 0.12 * n.frac;
      else if (n.index === 3) amp = 0.08 + 0.6 * ((g.util_pct || 0) / 100) + 0.3 * run;
      else amp = 0.08 + 0.6 * run + 0.05 * pend;
    }
    n.amp = clamp01(amp);
    if (record) { const hh = nodeHist[i]; hh.push(n.online ? (n.machine === 'A' ? n.frac : Math.max(n.frac, n.amp)) : 0); if (hh.length > CR) hh.shift(); }
  }
  if (record) {
    for (let c = 0; c < N; c++) {
      const hh = nodeHist[c];
      for (let r = CR - 1; r >= 1; r--) cityShown[c * CR + r] = cityShown[c * CR + r - 1];
      for (let r = 0; r < CR; r++) cityH[c * CR + r] = hh[hh.length - 1 - r] ?? 0;
    }
  }
  const a = j.a || {}, b = j.b || {};
  const aG = (a.gpus || []).filter((g) => g.online);
  const used = aG.reduce((s, g) => s + (g.vram_used || 0), 0), tot = aG.reduce((s, g) => s + (g.vram_total || 0), 0);
  const run = aG.reduce((s, g) => s + (g.running || 0), 0), pend = aG.reduce((s, g) => s + (g.pending || 0), 0);
  const aRam = a.ram_total ? (1 - a.ram_free / a.ram_total) * 100 : null;
  const bRam = b.ram_total ? (1 - b.ram_free / b.ram_total) * 100 : null;
  const q = (b.gpus || [])[0] || {}, g3 = (b.gpus || [])[3] || {};
  agg.aVramPct = tot ? used / tot * 100 : null;
  agg.online = (a.online || 0) + (b.online || 0);
  setText('aVram', fmt(used, 1)); setText('aVramT', ` / ${fmt(tot, 0)} GiB · 在线 ${a.online ?? '--'}/8`);
  setText('jobs', `${run} / ${pend}`); setText('jobsT', ' 个任务');
  setText('aRam', `${fmt(aRam, 1)}%`); setText('ramT', ` B机 ${fmt(bRam, 1)}%`);
  setText('bOnline', `${b.online ?? '--'}/4`);
  setText('bT', ` 在线 · ${q.online ? fmt(q.tok_s) + ' tok/s' : 'Qwen 未上线'} · ${g3.online ? fmt(g3.temp_c, 0) + '°C ' + fmt(g3.power_w, 0) + 'W' : ''}`);
  setText('coreT3', `在线 ${agg.online}/12 · 显存 ${fmt(agg.aVramPct, 0)}%`);
  if (record) {
    push(hist.vram, agg.aVramPct); push(hist.ram, aRam); push(hist.bram, bRam);
    push(hist.power, g3.online ? g3.power_w : null); push(hist.tok, q.online ? q.tok_s * 3 : null);
    refreshTicks(j, used, tot, run, pend);
    drawSparks();
  }
}
function setText(id, t) { const e = document.getElementById(id); if (e && e.textContent !== t) e.textContent = t; }

function prepCanvas(id) {
  const c = document.getElementById(id), dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h); return [x, w, h];
}
function spark(id, series, lo, hi, colors, wf = 1) {
  const [x, w0, h] = prepCanvas(id); const w = w0 * wf;
  x.strokeStyle = 'rgba(255,255,255,0.10)'; x.lineWidth = 1;
  for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(0, Math.round(h * k / 4) + 0.5); x.lineTo(w, Math.round(h * k / 4) + 0.5); x.stroke(); }
  for (let k = 1; k < 12; k++) { const gx = Math.round(w * k / 12) + 0.5; x.strokeStyle = 'rgba(255,255,255,0.05)'; x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, h); x.stroke(); }
  series.forEach((arr, si) => {
    if (arr.length < 2) return;
    const pts = arr.map((v, i) => [w - (arr.length - 1 - i) * (w / (HMAX - 1)), h - 2 - (clamp01((v - lo) / (hi - lo)) * (h - 4))]);
    x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.strokeStyle = colors[si]; x.lineWidth = 1.5; x.shadowColor = colors[si]; x.shadowBlur = 6; x.stroke(); x.shadowBlur = 0;
    if (si === 0) { x.lineTo(w, h); x.lineTo(pts[0][0], h); x.closePath();
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fill(); }
    const [ex, ey] = pts[pts.length - 1];        // 末端亮点
    x.fillStyle = colors[si]; x.beginPath(); x.arc(ex - 2, ey, 2.5, 0, Math.PI * 2); x.fill();
  });
}
function drawSparks() {
  spark('spVram', [hist.vram], 0, 100, [pal.white], 0.6);
  {   // 8 卡显存实时柱
    const c = document.getElementById('spVram'), x = c.getContext('2d'), w = c.clientWidth, h = c.clientHeight, x0 = w * 0.66, bw = (w - x0) / 8;
    nodes.slice(0, 8).forEach((n, i) => {
      const hh = Math.max(2, (h - 4) * (n.online ? n.frac : 0));
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(x0 + i * bw + bw * 0.18, 2, bw * 0.64, h - 4);
      x.fillStyle = n.raw && n.raw.running ? pal.acc : pal.white; x.fillRect(x0 + i * bw + bw * 0.18, h - 2 - hh, bw * 0.64, hh);
    });
  }
  spark('spRam', [hist.ram, hist.bram], 0, 100, [pal.white, pal.acc]);
  spark('spB', [hist.power, hist.tok], 0, 600, [pal.acc, pal.white]);
  // 任务：12 根竖条（运行=白、排队=金）
  const [x, w, h] = prepCanvas('spJobs');
  const bw = w / N;
  nodes.forEach((n, i) => {
    const r = n.raw || {}, run = r.running || 0, pend = Math.min(r.pending || 0, 6);
    const x0 = i * bw + bw * 0.22, ww = bw * 0.56;
    x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(x0, h - 3, ww, 2);
    if (!n.online) { x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(x0, h - 3, ww, 2); return; }
    const hr = run ? h * 0.45 : 0, hp = pend * h * 0.09;
    x.fillStyle = pal.white; x.fillRect(x0, h - 3 - hr, ww, hr);
    x.fillStyle = pal.acc; x.fillRect(x0, h - 3 - hr - hp, ww, hp);
  });
}


// ================= v5 底部：实时工作流拓扑 + 实时数据流跑马 =================
const DEMO_WF = { types: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoadImage', 'LoraLoaderModelOnly', 'CLIPTextEncode', 'MiniMaxH3ReferenceToVideo', 'ConditioningZeroOut', 'ModelSamplingSD3', 'SelfLiftH3Sampler', 'VAEDecodeTiled', 'CreateVideo', 'SaveVideo'],
  links: [[0, 4], [4, 8], [1, 5], [5, 6], [3, 6], [2, 6], [5, 7], [8, 9], [6, 9], [7, 9], [9, 10], [2, 10], [10, 11], [11, 12]] };
const DEMO_IMG = { types: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'MiniMaxH3ImageConditioning', 'ConditioningZeroOut', 'KSampler', 'VAEDecode', 'SaveImage', 'EmptyLatentImage', 'CLIPTextEncode', 'ModelSamplingAuraFlow'],
  links: [[0, 10], [10, 5], [1, 9], [9, 3], [2, 3], [3, 5], [9, 4], [4, 5], [8, 5], [5, 6], [2, 6], [6, 7]] };
function hexId(k) { return ((Math.abs(Math.sin(k * 12.9898 + 4.1)) * 4294967295) >>> 0).toString(16).padStart(8, '0').slice(0, 8); }
const gpuName = (id) => (id && id[0] === 'A' ? `H100·${id.slice(1)}` : `5090·${(id || '').slice(1)}`);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDur = (sec) => { if (sec == null) return '--'; sec = Math.max(0, sec); return sec >= 60 ? `${Math.floor(sec / 60)}分${String(Math.floor(sec % 60)).padStart(2, '0')}秒` : `${sec.toFixed(0)}秒`; };
function wfCat(t) {
  if (/Sampler|Sample\b|KSampler/i.test(t)) return 3;
  if (/Save|Preview|Combine|Output|CreateVideo/i.test(t)) return 4;
  if (/Loader|^Load/i.test(t)) return 0;
  if (/Decode|VAE/i.test(t)) return 2;
  return 1;
}
function salient(types) {
  const ts = (types || []).filter((x) => !/^(Note|Reroute|PrimitiveNode|Node)$/.test(x));
  if (ts.length <= 3) return ts.join(' → ');
  const smp = ts.find((x) => wfCat(x) === 3) || ts[Math.floor(ts.length / 2)];
  return [ts[0], smp, ts[ts.length - 1]].join(' → ');
}
function layoutWF(types, links) {
  const n = types.length, layer = new Array(n).fill(0);
  if (links && links.length) {
    for (let it = 0; it < n; it++) { let ch = false; for (const [a, b] of links) if (a < n && b < n && layer[b] < layer[a] + 1 && layer[a] < n) { layer[b] = layer[a] + 1; ch = true; } if (!ch) break; }
  } else for (let i = 0; i < n; i++) layer[i] = i;
  const L = Math.max(1, ...layer.map((v) => v + 1)), rows = Array.from({ length: L }, () => []);
  layer.forEach((l, i) => rows[l].push(i));
  const pos = []; rows.forEach((r, l) => r.forEach((i, k) => { pos[i] = [(l + 0.5) / L, (k + 0.5) / r.length]; }));
  return { pos, layer, L };
}
const wfTitle = document.getElementById('wfTitle'), wfTrack = document.getElementById('wfTrack'), wfDot = document.querySelector('.card.wf .dot');
let wfKey = '', wfLay = null, wfJob = null, wfHot = -1;
function drawWF(t) {
  if (!wfTitle) return;
  const jobs = (lastJ?.a?.gpus || []).filter((g) => g.job && g.job.types && g.job.types.length);
  let job = null, title = '实时工作流 · 暂无运行任务', live = false;
  if (jobs.length) {
    const k = ((Math.floor(t / 6) % jobs.length) + jobs.length) % jobs.length, g = jobs[k]; job = g.job; live = true;
    title = `实时工作流 ${k + 1}/${jobs.length} · ${gpuName(g.id)} · ${job.n ?? job.types.length} 节点 · 已运行 ${fmtDur(job.elapsed)} · #${job.id}`;
  } else if (lastJ?.recent?.length) {
    const r = lastJ.recent[0]; job = { types: r.types || [], links: [], id: r.id, n: r.nodes };
    title = `最近完成 · ${gpuName(r.gpu)} · #${r.id} · ${r.nodes ?? '--'} 节点 · ${fmt(r.dur, 1)}秒 ${r.status === 'ok' ? '✓' : r.status === 'err' ? '✗' : '■'}`;
  }
  setText('wfTitle', title);
  if (wfDot) wfDot.classList.toggle('idle', !live);
  const key = job ? `${job.id}:${job.types.length}` : '';
  if (key !== wfKey) {
    wfKey = key; wfJob = job; wfLay = job ? layoutWF(job.types, job.links || []) : null; wfHot = -1;
    if (wfTrack) {
      const items = job ? job.types.map((ty, i) => `<div data-l="${wfLay.layer[i]}"><span class="ix">${String(i + 1).padStart(2, '0')}</span>${esc(ty)}</div>`).join('') : '';
      wfTrack.innerHTML = items + items;   // 双份实现无缝循环
    }
  }
  const [x, w, h] = prepCanvas('wfGraph');
  if (!wfLay || !wfJob) return;
  const n = wfJob.types.length, px = 12, py = 9, L = wfLay.L;
  const P = wfLay.pos.map(([u, v]) => [px + u * (w - 2 * px), py + v * (h - 2 * py)]);
  const scan = (t * 0.16) % 1.15 - 0.075, hotL = Math.floor(Math.max(0, Math.min(0.999, scan)) * L);
  x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 1;
  for (let l = 0; l <= L; l++) { const gx = Math.round(px + l / L * (w - 2 * px)) + 0.5; x.beginPath(); x.moveTo(gx, 2); x.lineTo(gx, h - 2); x.stroke(); }
  const links = (wfJob.links && wfJob.links.length) ? wfJob.links : Array.from({ length: n - 1 }, (_, i) => [i, i + 1]);
  links.forEach(([a, b], li) => {
    if (!P[a] || !P[b]) return;
    const [x1, y1] = P[a], [x2, y2] = P[b], mx = (x2 - x1) * 0.5;
    x.strokeStyle = 'rgba(255,255,255,0.20)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(x1, y1); x.bezierCurveTo(x1 + mx, y1, x2 - mx, y2, x2, y2); x.stroke();
    const u = (t * 0.55 + li * 0.137) % 1, iu = 1 - u;   // 链路数据脉冲
    const bx = iu * iu * iu * x1 + 3 * iu * iu * u * (x1 + mx) + 3 * iu * u * u * (x2 - mx) + u * u * u * x2;
    const by = iu * iu * iu * y1 + 3 * iu * iu * u * y1 + 3 * iu * u * u * y2 + u * u * u * y2;
    x.fillStyle = pal.acc; x.globalAlpha = 0.9; x.beginPath(); x.arc(bx, by, 1.8, 0, 6.2832); x.fill(); x.globalAlpha = 1;
  });
  const sx = px + scan * (w - 2 * px);
  const gr = x.createLinearGradient(sx - 40, 0, sx + 4, 0); gr.addColorStop(0, 'rgba(255,207,122,0)'); gr.addColorStop(1, 'rgba(255,207,122,0.22)');
  x.fillStyle = gr; x.fillRect(sx - 40, 1, 44, h - 2);
  const nw = Math.max(7, Math.min(26, (w - 2 * px) / L * 0.5));
  const COL = ['rgba(230,236,245,0.55)', '#9fd8ff', '#ffffff', pal.acc, '#9dffbf'];
  wfJob.types.forEach((ty, i) => {
    if (!P[i]) return;
    const c = wfCat(ty), hot = wfLay.layer[i] === hotL, hh = c === 3 ? 11 : 7, ww = c === 3 ? nw * 1.3 : nw;
    x.fillStyle = COL[c]; x.shadowColor = COL[c]; x.shadowBlur = hot || c === 3 ? 10 : 0;
    x.globalAlpha = hot ? 1 : 0.8; x.fillRect(P[i][0] - ww / 2, P[i][1] - hh / 2, ww, hh); x.globalAlpha = 1; x.shadowBlur = 0;
    if (hot) { x.strokeStyle = '#fff'; x.lineWidth = 1; x.strokeRect(P[i][0] - ww / 2 - 2.5, P[i][1] - hh / 2 - 2.5, ww + 5, hh + 5); }
  });
  if (wfTrack) {
    const rows = n * 28; wfTrack.style.transform = `translate3d(0, ${(-(t * 16) % rows).toFixed(1)}px, 0)`;
    if (hotL !== wfHot) { wfHot = hotL; for (const el of wfTrack.children) el.classList.toggle('hot', +el.dataset.l === hotL); }
  }
}

const tickWin = document.getElementById('tickWin'), tickTrack = document.getElementById('tickTrack');
let tickWinW = tickWin ? tickWin.clientWidth : 0, tickX = 0, tickW = 0, tickIdx = 0, tickPool = [];
const tickItems = [];
function refreshTicks(j, used, tot, run, pend) {
  const T = [], a = j.a || {}, b = j.b || {};
  T.push(`<b>集群</b>在线 ${agg.online}/12 <span class="dim">·</span> A机显存 ${fmt(used)}/${fmt(tot, 0)} GiB <span class="dim">·</span> <span class="run">运行 ${run}</span> <span class="dim">·</span> <span class="pend">排队 ${pend}</span>`);
  (a.gpus || []).forEach((g) => {
    if (!g.online) { T.push(`<b>${gpuName(g.id)}</b><span class="err">离线</span>`); return; }
    const jb = g.job ? ` <span class="dim">·</span> ${g.job.n ?? g.job.types.length} 节点 <span class="chain">${esc(salient(g.job.types))}</span> <span class="dim">· 已运行 ${fmtDur(g.job.elapsed)}</span>` : '';
    T.push(`<b>${gpuName(g.id)}</b>显存 ${fmt(g.vram_used)}<span class="dim">/${fmt(g.vram_total, 0)}G</span> ${g.running ? '<span class="run">▶ 运行</span>' : '<span class="dim">空闲</span>'}${g.pending ? ` <span class="pend">⏳ 排队 ${g.pending}</span>` : ''}${jb}`);
  });
  (j.recent || []).slice(0, 8).forEach((r) => {
    const st = r.status === 'ok' ? '<span class="ok">✓ 完成</span>' : r.status === 'err' ? `<span class="err">✗ 报错${r.err_node ? ' @' + esc(r.err_node) : ''}</span>` : '<span class="int">■ 中断</span>';
    T.push(`${st} <b>${gpuName(r.gpu)}</b><span class="dim">#${r.id}</span> ${r.nodes ?? '--'} 节点 <span class="dim">·</span> 耗时 ${fmt(r.dur, 1)} 秒 <span class="chain">${esc(salient(r.types))}</span>`);
  });
  const bg = b.gpus || [], q = bg[0] || {}, g3 = bg[3] || {};
  T.push(`<b>5090·0</b>Qwen3.8 ${q.online ? `<span class="run">${fmt(q.tok_s)} tok/s</span>` : '<span class="err">未上线</span>'}`);
  T.push(`<b>5090·3</b>ComfyUI ${g3.online ? `${fmt(g3.temp_c, 0)}°C <span class="dim">·</span> ${fmt(g3.power_w, 0)} W <span class="dim">·</span> 利用率 ${fmt(g3.util_pct, 0)}%` : '<span class="err">未上线</span>'}`);
  T.push(`<b>5090·1</b>Blender ${bg[1]?.online ? '<span class="run">在线</span>' : '<span class="dim">未上线</span>'} <span class="dim">·</span> <b>5090·2</b>Topaz ${bg[2]?.online ? '<span class="run">在线</span>' : '<span class="dim">未上线</span>'}`);
  T.push(`<b>采集</b>每 2 秒 <span class="dim">·</span> 本轮轮询 ${j.poll_ms ?? '--'} ms <span class="dim">·</span> ComfyUI ×9 /queue /history <span class="dim">·</span> NVML`);
  tickPool = T;
}
function tickAppend() {
  const el = document.createElement('span'); el.className = 'ti'; el.innerHTML = tickPool[tickIdx++ % tickPool.length];
  tickTrack.appendChild(el); const w = el.offsetWidth; tickItems.push({ el, w }); tickW += w;
}
function tickStep(dt) {
  if (!tickTrack || !tickPool.length) return;
  if (!tickWinW) tickWinW = tickWin.clientWidth;
  let guard = 0;
  while (tickW + tickX < tickWinW + 300 && guard++ < 20) tickAppend();
  tickX -= dt * 85;
  while (tickItems.length && tickX + tickItems[0].w < 0) { const f = tickItems.shift(); tickX += f.w; tickW -= f.w; f.el.remove(); }
  tickTrack.style.transform = `translate3d(${tickX.toFixed(1)}px, 0, 0)`;
}

function demoStats(t) {   // 公网静态托管或未连接采集服务时使用的仿真数据，状态栏会明确标注
  const A = [], B = [];
  for (let i = 0; i < 8; i++) {
    const busy = Math.sin(t * 0.11 + i * 1.7) > -0.05 ? 1 : 0;
    A.push({ id: `A${i}`, online: true, vram_total: 79.2, vram_used: 44 + 28 * (0.5 + 0.5 * Math.sin(t * 0.07 + i)), running: busy, pending: busy ? i % 3 : 0 });
  }
  B.push(
    { id: 'B0', online: true, tok_s: 66.5 + 4.2 * Math.sin(t * 0.09), running: Math.sin(t * 0.17) > 0 ? 1 : 0 },
    { id: 'B1', online: true, running: Math.sin(t * 0.08 + 1) > 0.3 ? 1 : 0 },
    { id: 'B2', online: true, running: Math.sin(t * 0.06 + 2) > 0.4 ? 1 : 0 },
    { id: 'B3', online: true, vram_total: 31.8, vram_used: 18.4 + 6 * Math.sin(t * 0.05), temp_c: 44 + 5 * Math.sin(t * 0.04), power_w: 235 + 65 * Math.sin(t * 0.08), util_pct: 62 },
  );
  A.forEach((g, i) => { if (g.running) { const T = i % 3 === 1 ? DEMO_IMG : DEMO_WF; g.job = { ...T, n: T.types.length, id: hexId(i * 131 + Math.floor((t * 0.11 + i * 1.7) / 6.28)), elapsed: ((t * 0.11 + i * 1.7) % 6.28) / 0.11 }; } });
  const recent = [];
  for (let k = 0; k < 10; k++) { const T = k % 3 === 1 ? DEMO_IMG : DEMO_WF; const st = k % 7 === 5 ? 'int' : (k % 11 === 9 ? 'err' : 'ok');
    recent.push({ gpu: `A${(k * 3 + Math.floor(t / 20)) % 8}`, id: hexId(k * 977 + Math.floor(t / 20)), status: st, nodes: T.types.length, dur: T === DEMO_IMG ? 36 + (k * 7) % 5 : 180 + (k * 53) % 260, types: T.types.slice(0, 14), err_node: st === 'err' ? 'VAEDecodeTiled' : null }); }
  return { ok: true, poll_ms: 180, recent, a: { online: 8, ram_total: 1007, ram_free: 365 + 45 * Math.sin(t * 0.03), gpus: A }, b: { online: 4, ram_total: 252, ram_free: 142 + 18 * Math.cos(t * 0.04), gpus: B } };
}
const bootAt = Date.now();
let publicApiUrl = '', failCount = 0;
async function resolvePublicApi() {
  if (TUNNEL_OVERRIDE) {
    if (/^https?:\/\//i.test(TUNNEL_OVERRIDE)) {
      publicApiUrl = TUNNEL_OVERRIDE.replace(/\/$/, '') + '/__nexus_stats';
    }
    return publicApiUrl;
  }
  const candidates = [
    `/jintai-domestic-portal/tunnel.json?t=${Math.floor(Date.now() / 60000)}`,
    'https://testingcf.jsdelivr.net/gh/aikingtai-ctrl/jintai-domestic-portal@main/tunnel.json',
  ];
  for (const u of candidates) {
    try {
      const r = await fetch(u, {
        cache: 'no-store',
        signal: AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined,
      });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && typeof j.tunnel_url === 'string' && j.tunnel_url.startsWith('https://')) {
        publicApiUrl = j.tunnel_url.replace(/\/$/, '') + '/__nexus_stats';
        return publicApiUrl;
      }
    } catch {}
  }
  return '';
}

async function poll() {
  if (ONLY_SIM) return;
  try {
    let url = '/api/stats';
    if (IS_PUBLIC_STATIC || TUNNEL_OVERRIDE) {
      if (!publicApiUrl || failCount >= 3) await resolvePublicApi();
      if (!publicApiUrl) throw new Error('no tunnel');
      url = publicApiUrl;
    }
    const r = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout ? AbortSignal.timeout(IS_PUBLIC_STATIC || TUNNEL_OVERRIDE ? 3500 : 1800) : undefined,
    });
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    if (!j.ok || !j.a) throw new Error('no data');
    if (!everOk) {
      hist.vram.length = hist.ram.length = hist.bram.length = hist.power.length = hist.tok.length = 0;
      nodes.forEach((n) => { n.prev = null; });   // 仿真→真实切换不触发假事件
    }
    failCount = 0;
    fallbackDemo = false;
    applyStats(j, true); lastOk = Date.now(); everOk = true;
    if (j.lan_url) setText('lanNote', `内网大屏：${j.lan_url}（纯画面加 ?nohud）`);
  } catch (e) {
    failCount++;
    if ((!everOk && Date.now() - bootAt > 4500) || (everOk && Date.now() - lastOk > 15000)) {
      fallbackDemo = true;
    }
  }
}
if (ONLY_SIM || IS_PUBLIC_STATIC || TUNNEL_OVERRIDE) {
  for (let k = -40; k <= 0; k++) applyStats(demoStats(k * 2), true);
}
if (!ONLY_SIM) {
  poll();
  setInterval(poll, IS_PUBLIC_STATIC || TUNNEL_OVERRIDE ? 2500 : 2000);
}
if (!CAPTURE && navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
const captureStart = Date.now();
function updateStatus() {
  const el = document.getElementById('status'); let cls, txt;
  if (ONLY_SIM) { cls = 'demo'; txt = '● 演示模式'; }
  else if (fallbackDemo) { cls = 'demo'; txt = IS_PUBLIC_STATIC ? '● 云端展映（仿真兜底）' : '● 离线演示（正在重连…）'; }
  else if (!everOk) { cls = 'wait'; txt = '● 连接实时中枢…'; }
  else { const age = (Date.now() - lastOk) / 1000; if (age < 8) { cls = 'live'; txt = '● 实时数据'; } else { cls = 'off'; txt = `● 数据延迟 ${age.toFixed(0)} 秒`; } }
  if (el.textContent !== txt) { el.textContent = txt; el.className = 'pill ' + cls; }
  setText('clock', nowStr());
}

// ---------- 交互 ----------
const stopAuto = () => { autoCycle = false; document.getElementById('pAuto').checked = false; };
document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => { stopAuto(); setMode(+b.dataset.mode, simTime); }));
document.querySelectorAll('#palettes button').forEach((b) => b.addEventListener('click', () => { applyPalette(b.dataset.pal); drawSparks(); }));
document.getElementById('gear').addEventListener('click', () => document.getElementById('panel').classList.toggle('hidden'));
let density = 0.8, spin = 1;
document.getElementById('pDensity').addEventListener('input', (e) => { density = +e.target.value; });
document.getElementById('pBloom').addEventListener('input', (e) => { bloom.strength = +e.target.value; });
document.getElementById('pSpin').addEventListener('input', (e) => { spin = +e.target.value; });
const pStreak = document.getElementById('pStreak');
document.getElementById('pAuto').addEventListener('change', (e) => { autoCycle = e.target.checked; modeSince = simTime; });
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '5') { stopAuto(); setMode(+e.key - 1, simTime); }
  else if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('nohud');
  else if (e.key === 's' || e.key === 'S') document.getElementById('panel').classList.toggle('hidden');
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  camZ = getCamZ(); lookX = getLookX();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight);
  shared.uPR.value = renderer.getPixelRatio() * innerHeight / 1080; finish.uniforms.uRes.value.set(innerWidth, innerHeight); drawSparks();
  tickWinW = tickWin ? tickWin.clientWidth : 0;
});

// ---------- 帧循环 ----------
let simTime = 0, arcClock = 0, deckTopT = -1, deckTopC = 9999;
const bootEl = document.getElementById('boot'), modesEl = document.getElementById('modes');
const bootLines = bootEl ? [...bootEl.querySelectorAll('.bl')] : [];
const _v = new THREE.Vector3();
function frame(dt) {
  simTime += dt;
  if (!CAPTURE && simTime > 86400) { simTime -= 86400; modeSince -= 86400; popups.forEach((p) => { p.t0 -= 86400; }); nodes.forEach((n) => { n.rip -= 86400; }); }
  const t = simTime;
  if (!eventsArmed && t > BOOT_SEC + 0.5) eventsArmed = true;
  if (isDemo()) applyStats(demoStats(t), Math.floor(t / 2) !== Math.floor((t - dt) / 2));
  if (autoCycle && t - modeSince > MODE_SEC) setMode((modeB + 1) % NMODE, t);
  blend = Math.min(1, blend + dt / 2.5);
  const e = blend * blend * (3 - 2 * blend);
  const w = [0, 0, 0, 0, 0]; w[modeA] += 1 - e; w[modeB] += e;

  // 开机
  const bt = clamp01(t / BOOT_SEC), boot = 1 - Math.pow(1 - bt, 3);
  shared.uBoot.value = boot;
  if (bootEl) {
    const op = NO_BOOT ? 0 : clamp01((BOOT_SEC + 0.9 - t) / 0.8);
    bootEl.style.opacity = op.toFixed(2); bootEl.style.display = op > 0 ? '' : 'none';
    bootLines.forEach((l, i) => l.classList.toggle('on', t > 0.25 + i * 0.55));
  }

  const k = 1 - Math.exp(-dt * 2.0);
  let load = 0;
  nodes.forEach((n, i) => {
    n.ampShown += (n.amp - n.ampShown) * k; n.fracShown += (n.frac - n.fracShown) * k; load += n.ampShown;
    shared.uNodeAmp.value[i] = n.ampShown; shared.uNodeOn.value[i] = n.online ? 1 : 0;
    const mu = markers[i].material.uniforms; mu.uFill.value = n.fracShown; mu.uAct.value = n.ampShown; mu.uOn.value = n.online ? 1 : 0;
    mu.uRip.value = Math.min(99, t - n.rip);
    if (i < 8) { dialUni.uFillA.value[i] = n.fracShown; dialUni.uActA.value[i] = n.ampShown; dialUni.uOnA.value[i] = n.online ? 1 : 0; }
    else { dialUni.uFillB.value[i - 8] = n.fracShown; dialUni.uActB.value[i - 8] = n.ampShown; dialUni.uOnB.value[i - 8] = n.online ? 1 : 0; }
    const html = nodeHtml(n);
    if (html !== n.html) { n.html = html; nodeLabels[i].element.innerHTML = html; nodeLabels[i].element.classList.toggle('off', !n.online); }
    nodeLabels[i].element.style.opacity = boot.toFixed(2);
  });
  load /= N;

  // 浮动提示：上浮 + 淡出
  for (let p = popups.length - 1; p >= 0; p--) {
    const pu = popups[p], age = t - pu.t0;
    if (age > 2.8) { scene.remove(pu.obj); popups.splice(p, 1); continue; }
    pu.obj.position.y = nodePos[pu.i].y + age * 0.35;
    pu.obj.element.style.opacity = (Math.min(1, age * 6) * clamp01((2.8 - age) / 0.8)).toFixed(2);
  }

  const ph = (t * 0.25) % 1;
  const pulse = w[2] * Math.pow(1 - ph, 3);
  sphereUni.uPulse.value = w[2] * 0.4 + pulse; sphereUni.uCollapse.value = w[1]; sphereUni.uLoad.value = load;
  sphere.rotation.y += dt * 0.07 * spin;
  orbits.forEach((o) => {
    o.uni.uHead.value = (o.uni.uHead.value + dt * o.speed * spin + 1) % 1;
    const an = o.uni.uHead.value * Math.PI * 2;
    o.head.position.set(Math.cos(an) * o.rad, Math.sin(an) * o.rad, 0);
    o.uni.uVis.value = (1 - 0.75 * w[1]) * (1 - 0.7 * w[4]);
    o.ring.rotation.z += dt * 0.05 * spin;
  });
  // 核心
  const coreS = Math.max(0.001, (1 - 0.85 * w[1]) * (1 - 0.92 * w[4]) * (1 + 0.25 * pulse) * (0.3 + 0.7 * boot));
  core.scale.setScalar(coreS);
  ico.rotation.x += dt * 0.21 * spin; ico.rotation.y -= dt * 0.17 * spin;
  oct.rotation.y += dt * 0.6 * spin; oct.rotation.z += dt * 0.33 * spin;
  icoMat.opacity = 0.4 + 0.35 * load; octMat.opacity = 0.35 + 0.4 * load;
  glowUni.uI.value = (0.12 + 0.28 * load + 0.9 * pulse) * (1 - w[1]) * boot;
  // 电弧
  arcBoost = Math.max(0, arcBoost - dt * 1.6);
  const arcV = Math.max(w[2] * (0.45 + 0.55 * pulse), arcBoost * 0.7) * boot;
  arcs.visible = arcV > 0.01;
  if (arcs.visible) {
    arcClock += dt;
    if (arcClock > 0.08) { arcClock = 0; regenArcs(); }
    arcUni.uVis.value = arcV * (0.55 + 0.45 * Math.random());
    arcs.scale.setScalar((1 + sphereUni.uPulse.value * 0.16) * (1 - 0.78 * w[1]));
  }
  holeDisk.visible = w[1] > 0.02; holeDisk.scale.setScalar(Math.max(0.001, w[1]));
  dialUni.uVis.value = 1 - 0.55 * w[1];
  coreLabel.element.style.opacity = ((1 - w[1]) * clamp01((t - BOOT_SEC * 0.9) / 0.8)).toFixed(2);
  hMarkers.forEach((m) => { m.material.uniforms.uVis.value = w[3]; m.visible = w[3] > 0.01; });
  netUni.uVis.value = w[3];
  caps.forEach((c) => { c.element.style.opacity = w[3].toFixed(2); });
  { if (Math.floor(t) !== deckTopT) { deckTopT = Math.floor(t); deckTopC = (document.getElementById('deck')?.getBoundingClientRect().top ?? innerHeight) - 10; } const dTop = deckTopC;
    segLabels.forEach((s) => { _v.setFromMatrixPosition(s.matrixWorld).project(camera); const sy = (1 - _v.y) * 0.5 * innerHeight;
      s.element.style.opacity = (sy > dTop || sy < 84 ? 0 : boot).toFixed(2); }); }
  // v4：四维旋转、超立方、陀螺环、时序城
  rot4.xw += dt * (0.16 + 0.14 * load) * spin; rot4.yw = 0.35 * Math.sin(t * 0.05); rot4.zw = 0.0;
  shared.uXW.value = rot4.xw; shared.uYW.value = rot4.yw; shared.uZW.value = rot4.zw;
  coreTess.upd();
  sphereUni.uMorph.value = w[4];
  bigTess.lines.visible = w[4] > 0.01;
  if (bigTess.lines.visible) { bigTess.upd(); bigTess.uni.uA.value = w[4] * (0.75 + 0.25 * load); }
  gimbals.forEach((gm, k) => {
    gm.rotation.set(1.2 + 0.35 * k + Math.sin(t * 0.07 + k) * 0.25, t * (0.11 - 0.07 * k) * spin, 0.4 * k + Math.sin(t * 0.05 + 2 * k) * 0.3);
    gm.material.uniforms.uVis.value = (1 - 0.8 * w[1]) * (0.7 + 0.6 * w[4]);
    gm.scale.setScalar(1 + 0.12 * pulse);
  });
  { const kk = 1 - Math.exp(-dt * 3.0); for (let q = 0; q < cityShown.length; q++) cityShown[q] += (cityH[q] - cityShown[q]) * kk; if (cityAttr) cityAttr.needsUpdate = true; }
  cityLabel.element.style.opacity = boot.toFixed(2);
  bloom.strength = (+document.getElementById('pBloom').value) * (1 + 0.8 * pulse + 0.4 * arcBoost);

  shared.uTime.value = t; shared.uBlend.value = blend; shared.uModeA.value = modeA; shared.uModeB.value = modeB; shared.uSpin.value = spin;
  pGeo.setDrawRange(0, Math.floor(MAXP * density * (innerWidth < 720 ? 0.45 : 1)));

  // 相机：缓慢环游 + 模式切换推近
  const punch = Math.sin(Math.PI * e) * (blend < 1 ? 1 : 0);
  {
    const yaw = (0.05 + 0.13 * Math.sin(t * 0.037)) * spin, pitch = (0.08 + 0.05 * Math.sin(t * 0.029)) * spin;
    const rad = camZ - 2.4 * punch + 6 * (1 - boot) + Math.sin(t * 0.023) * 1.5 * spin;
    camera.position.set(lookX + Math.sin(yaw) * Math.cos(pitch) * rad, LOOK_Y + 0.4 + Math.sin(pitch) * rad, Math.cos(yaw) * Math.cos(pitch) * rad);
    camera.up.set(Math.sin(0.03 * Math.sin(t * 0.043) * spin), 1, 0).normalize();
    camera.lookAt(lookX, LOOK_Y, 0);
  }
  dialGroup.rotation.set(-0.12 + 0.04 * Math.sin(t * 0.05), 0.42 + 0.06 * Math.sin(t * 0.07), 0.04);
  // 无尽纵深：超立方隧道向镜头推进并循环
  tunnel.forEach((tn, k) => {
    const ph = (k / tunnel.length + t * 0.011) % 1;
    tn.T.lines.position.set(VP.x, VP.y, -330 + ph * 290);
    tn.T.lines.rotation.z = t * 0.025 * (k % 2 ? -1 : 1) + k * 0.7;
    tn.T.r.xw += dt * (0.12 + 0.03 * k); tn.T.r.yw = 0.3 * Math.sin(t * 0.05 + k);
    tn.T.uni.uA.value = Math.min(1, ph / 0.3) * Math.min(1, (1 - ph) / 0.25) * 0.32 * boot * (1 - 0.6 * w[1]);
    tn.T.upd();
  });
  camera.updateMatrixWorld();
  billboards.forEach((m) => m.quaternion.copy(camera.quaternion));
  floor.material.uniforms.uCam.value.copy(camera.position);

  // 后期参数
  _v.copy(SC).project(camera);
  finish.uniforms.uHole.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
  finish.uniforms.uLens.value = w[1];
  finish.uniforms.uShock.value = ph; finish.uniforms.uShockAmp.value = w[2];
  finish.uniforms.uGlitch.value = blend < 0.22 ? Math.sin(Math.PI * blend / 0.22) : 0;
  finish.uniforms.uStreak.value = pStreak ? +pStreak.value : 0.22;
  finish.uniforms.uRays.value = (0.45 + 0.9 * w[2] * (0.4 + pulse) + 0.5 * w[4]) * boot;
  finish.uniforms.uTime.value = t;
  if (modesEl) modesEl.style.setProperty('--prog', autoCycle ? clamp01((t - modeSince) / MODE_SEC).toFixed(3) : '1');

  drawWF(t); tickStep(dt);
  updateStatus();
  composer.render();
  labelRenderer.render(scene, camera);
}

if (CAPTURE) { window.__advance = (dt) => frame(dt); frame(0.0001); window.__ready = true; }
else {
  let last = performance.now();
  const loop = (now) => { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; frame(dt); requestAnimationFrame(loop); };
  requestAnimationFrame(loop); window.__ready = true;
}
