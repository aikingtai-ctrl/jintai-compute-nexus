// 金泰算力中枢 NEXUS 大屏 v2 · Three.js r186
// 视觉方向：单色细线 + 大尺度主体球 + 密集细粒子流（参考抖音 NEXUS 的克制电影感），数据全部为真实采集。
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
const IS_PUBLIC_STATIC = /\.github\.io$|\.pages\.dev$/i.test(location.hostname) || location.protocol === 'file:';
const CLOUD_DEMO = FORCE_DEMO || IS_PUBLIC_STATIC;
if (Q.has('nohud')) document.body.classList.add('nohud');

const N = 12, NH = 6, MAXP = 46000, FIB = 14, FSEG = 48;
const SC = new THREE.Vector3(-9.5, -0.35, 0);    // 主体球中心
const R = 6.8;                                   // 主体球半径
const DIAL = 10.6;                               // 刻度盘半尺寸
const LOOK_Y = -1.1;

const PALETTES = {
  mono:  { white: '#e9eff6', acc: '#ffcf7a', a: '#d6ecff', b: '#ffcf7a' },
  ice:   { white: '#e2f5ff', acc: '#7fd8ff', a: '#8fdcff', b: '#b6bcff' },
  cyber: { white: '#f3e9ff', acc: '#ff4df0', a: '#b88bff', b: '#3dfff2' },
  green: { white: '#e9fff1', acc: '#6dff9e', a: '#8affb4', b: '#d4ff4d' },
};
let pal = PALETTES.mono;

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
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float d = dot(c, c);
      vec2 off = c * d * 0.014;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= 1.0 - d * 1.1;
      col += (rnd(floor(vUv * uRes) + fract(uTime * 7.0) * 113.0) - 0.5) * 0.04;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
});
composer.addPass(finish);
composer.addPass(new OutputPass());

// ---------- 布局（所有模式节点位置固定） ----------
const nodePos = [];
for (let k = 0; k < N; k++) nodePos.push(new THREE.Vector3(15.2, 8.0 - k * 1.52 - (k >= 8 ? 0.7 : 0), 0));
const H1 = [], H2 = [];
for (let i = 0; i < NH; i++) {
  H1.push(new THREE.Vector3(2.6, SC.y + (2.5 - i) * 2.6, 0));
  H2.push(new THREE.Vector3(8.9, SC.y + (2.5 - i) * 2.6, 0));
}

// ---------- 数据状态 ----------
const nodes = [];
for (let i = 0; i < N; i++) nodes.push({ id: i < 8 ? `A${i}` : `B${i - 8}`, machine: i < 8 ? 'A' : 'B', index: i < 8 ? i : i - 8,
  online: false, frac: 0, fracShown: 0, amp: 0, ampShown: 0, html: '', raw: {} });
let lastOk = 0, everOk = false, fallbackDemo = false;
const isDemo = () => CLOUD_DEMO || fallbackDemo;
const hist = { vram: [], ram: [], bram: [], power: [] };
const HMAX = 120;

// ---------- 公共 GLSL：粒子与流线共用的路径函数 ----------
const PATH_GLSL = `
uniform float uTime, uBlend, uModeA, uModeB, uSpin;
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
vec3 pathMode(float m, int n, float t, float o1, float o2){
  vec3 q;
  if (m < 0.5) q = pathFlow(n, t, o1, o2);
  else if (m < 1.5) q = pathHole(n, t, o1, o2);
  else if (m < 2.5) q = pathFusion(n, t, o1, o2);
  else q = pathNet(n, t, o1, o2);
  return q;
}
vec3 pathBlend(int n, float t, float o1, float o2){
  return mix(pathMode(uModeA, n, t, o1, o2), pathMode(uModeB, n, t, o1, o2), smoothstep(0.0, 1.0, uBlend));
}`;

const vec3s = (k) => Array.from({ length: k }, () => new THREE.Vector3());
const shared = {
  uTime: { value: 0 }, uBlend: { value: 1 }, uModeA: { value: 0 }, uModeB: { value: 0 }, uSpin: { value: 1 },
  uSC: { value: SC.clone() }, uR: { value: R },
  uNodePos: { value: nodePos.map((v) => v.clone()) }, uNodeAmp: { value: new Array(N).fill(0) },
  uNodeOn: { value: new Array(N).fill(0) }, uNodeCol: { value: vec3s(N) },
  uH1: { value: H1.map((v) => v.clone()) }, uH2: { value: H2.map((v) => v.clone()) },
  uWhite: { value: new THREE.Color() }, uAcc: { value: new THREE.Color() },
  uPR: { value: renderer.getPixelRatio() * innerHeight / 1080 },
};

// ---------- 星尘 ----------
{
  const g = new THREE.BufferGeometry(), n = 1800, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) p.set([(Math.random() - 0.5) * 160, (Math.random() - 0.5) * 90, -30 - Math.random() * 80], i * 3);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8090a0, size: 0.35, transparent: true, opacity: 0.5, depthWrite: false })));
}

// ---------- 主体球：斐波那契点阵 + 近邻细线网 ----------
const sphere = new THREE.Group();
sphere.position.copy(SC);
sphere.rotation.x = 0.35;
scene.add(sphere);
const sphereUni = { uTime: shared.uTime, uPulse: { value: 0 }, uCollapse: { value: 0 }, uLoad: { value: 0 },
  uWhite: shared.uWhite, uAcc: shared.uAcc, uPR: shared.uPR, uR: shared.uR };
{
  const NS = 1100, pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NS; i++) {
    const y = 1 - (i / (NS - 1)) * 2, rr = Math.sqrt(1 - y * y), th = golden * i;
    pts.push(new THREE.Vector3(Math.cos(th) * rr * R, y * R, Math.sin(th) * rr * R));
  }
  const inner = 380;
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
  const common = `
    uniform float uTime, uPulse, uCollapse, uLoad, uPR, uR; uniform vec3 uWhite, uAcc;
    attribute float aRnd;
    vec3 deform(vec3 p){
      float k = 1.0 + uPulse * (0.16 + 0.03 * sin(uTime * 3.0 + aRnd * 6.2832));
      return p * k * (1.0 - 0.78 * uCollapse);
    }
    float depthA(vec3 p){ vec4 w = modelMatrix * vec4(p, 1.0); return smoothstep(-uR, uR, w.z); }`;
  const pm = new THREE.ShaderMaterial({
    uniforms: sphereUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: common + `
      attribute float aShell; varying float vA; varying vec3 vC;
      void main(){
        vec3 p = deform(position);
        float flash = step(fract(uTime * 0.22 + aRnd * 17.0), 0.012 + 0.05 * uLoad);
        vA = (aShell > 0.5 ? mix(0.18, 0.95, depthA(p)) : 0.22) * (1.0 - 0.6 * uCollapse) + flash;
        vC = mix(uWhite, uAcc, flash);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = (aShell > 0.5 ? 0.16 : 0.11) * (1.0 + 2.0 * flash) * uPR * (300.0 / -mv.z);
      }`,
    fragmentShader: `varying float vA; varying vec3 vC;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.1, d)); }`,
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
    uniforms: sphereUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: common + `
      varying float vA; varying vec3 vC;
      void main(){
        vec3 p = deform(position);
        float flash = step(fract(uTime * 0.15 + aRnd * 23.0), 0.01 + 0.06 * uLoad);
        vA = (mix(0.03, 0.2, depthA(p)) + flash * 0.9) * (1.0 - 0.7 * uCollapse);
        vC = mix(uWhite, uAcc, flash);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, vA); }`,
  });
  sphere.add(new THREE.LineSegments(lg, lm));

  // 三道大圆轨道
  for (let k = 0; k < 3; k++) {
    const c = new THREE.EllipseCurve(0, 0, R * 1.04, R * 1.04).getPoints(160);
    const g = new THREE.BufferGeometry().setFromPoints(c.map((p) => new THREE.Vector3(p.x, p.y, 0)));
    const ring = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.set(Math.PI / 2 + k * 0.5, k * 0.9, 0);
    ring.userData.orbit = true;
    sphere.add(ring);
  }
}
const holeDisk = new THREE.Mesh(new THREE.CircleGeometry(1.95, 64), new THREE.MeshBasicMaterial({ color: 0x000000 }));
holeDisk.position.copy(SC).add(new THREE.Vector3(0, 0, 1.9));
scene.add(holeDisk);

// ---------- 刻度盘（屏幕平面，细线抗锯齿） ----------
const dialUni = { uTime: shared.uTime, uSpin: shared.uSpin, uVis: { value: 1 }, uScale: { value: DIAL },
  uFillA: { value: new Array(8).fill(0) }, uActA: { value: new Array(8).fill(0) }, uOnA: { value: new Array(8).fill(0) },
  uFillB: { value: new Array(4).fill(0) }, uActB: { value: new Array(4).fill(0) }, uOnB: { value: new Array(4).fill(0) },
  uWhite: shared.uWhite, uAcc: shared.uAcc };
const dial = new THREE.Mesh(new THREE.PlaneGeometry(DIAL * 2, DIAL * 2), new THREE.ShaderMaterial({
  uniforms: dialUni, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform float uTime, uSpin, uVis, uScale;
    uniform float uFillA[8], uActA[8], uOnA[8], uFillB[4], uActB[4], uOnB[4];
    uniform vec3 uWhite, uAcc;
    float hair(float d, float px){ float w = fwidth(d) * px; return 1.0 - smoothstep(0.0, w, abs(d)); }
    float band(float d, float hw){ float w = fwidth(d); return 1.0 - smoothstep(hw - w, hw + w, abs(d)); }
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
      // RTX 5090 × 4
      float sb = a01 * 4.0; int ib = int(floor(sb)); float fb = fract(sb);
      float inB = step(0.03, fb) * step(fb, 0.97); float ub = (fb - 0.03) / 0.94;
      col += uAcc * band(r - 9.4, 0.05) * inB * (0.10 + 0.85 * step(ub, uFillB[ib])) * mix(0.15, 1.0, uOnB[ib]);
      // 外圈旋转虚线 + 十字准星
      float tb = fract(a01 - uTime * uSpin * 0.01);
      col += uWhite * 0.32 * hair(r - 10.05, 1.0) * step(fract(tb * 180.0), 0.5);
      float crs = step(10.15, r) * step(r, 10.55) * (1.0 - smoothstep(0.0, fwidth(a01 * 4.0) * 1.5, abs(fract(a01 * 4.0 + 0.5) - 0.5)));
      col += uAcc * 0.8 * crs;
      gl_FragColor = vec4(col * uVis, 1.0);
    }`,
}));
dial.position.copy(SC);
scene.add(dial);

// ---------- 流线（细丝）与粒子 ----------
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
    uniforms: shared, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: PATH_GLSL + `
      uniform vec3 uWhite; attribute float aNode; attribute vec2 aOff; attribute float aT; varying float vA; varying vec3 vC;
      void main(){
        int n = int(aNode + 0.5);
        vec3 p = pathBlend(n, aT, aOff.x * 0.9, aOff.y);
        vA = uNodeOn[n] * (0.03 + 0.11 * uNodeAmp[n]) * pow(sin(3.14159 * aT), 0.35);
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
  uniforms: shared, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: PATH_GLSL + `
    uniform vec3 uWhite, uAcc; uniform float uPR;
    attribute vec4 aSeed; attribute float aNode; varying float vA; varying vec3 vC;
    void ambient(float m, out vec3 p, out float a, out vec3 c){
      c = uWhite;
      if (m < 0.5) {            // 环绕尘带
        float r = uR * 1.12 + pow(aSeed.x, 1.6) * 4.0; float an = aSeed.y * 6.2832 + uTime * uSpin * 0.6 / r;
        p = uSC + tiltX(vec3(cos(an) * r, (aSeed.z - 0.5) * 0.12, sin(an) * r), 1.25) ; a = 0.30;
      } else if (m < 1.5) {     // 吸积盘 + 光子环
        if (aSeed.z > 0.82) { float an = aSeed.y * 6.2832 + uTime * uSpin * 0.5; float r = 1.8 + aSeed.x * 0.35;
          p = uSC + vec3(cos(an) * r, sin(an) * r, 0.7); a = 0.7 * (1.0 - aSeed.x); c = mix(uWhite, uAcc, 0.5); }
        else { float r = 1.85 + pow(aSeed.x, 1.4) * 9.5; float an = aSeed.y * 6.2832 + uTime * uSpin * 1.6 / sqrt(r);
          p = uSC + tiltX(vec3(cos(an) * r, (aSeed.z - 0.5) * 0.03 * r, sin(an) * r), 0.3);
          float heat = smoothstep(7.0, 1.85, r); a = 0.3 + 1.1 * heat; c = mix(uWhite, uAcc, heat * 0.8); }
      } else if (m < 2.5) {     // 冲击波壳层
        vec3 dir = normalize(aSeed.xyz * 2.0 - 1.0 + 1e-4); float pl = fract(uTime * 0.25 + aSeed.w * 0.08);
        p = uSC + dir * (uR * 0.4 + pl * 17.0); a = (1.0 - pl) * 0.55; c = mix(uAcc, uWhite, pl);
      } else {                  // 背景漂浮尘
        p = vec3((aSeed.x - 0.5) * 60.0, (aSeed.y - 0.5) * 32.0 + sin(uTime * 0.2 + aSeed.z * 6.0) * 0.5, (aSeed.z - 0.5) * 12.0 - 6.0); a = 0.10;
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
      vA = a;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = 0.11 * (0.5 + aSeed.w) * uPR * (300.0 / -mv.z);
    }`,
  fragmentShader: `varying float vA; varying vec3 vC;
    void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC * 1.3, vA * smoothstep(0.5, 0.05, d)); }`,
}));
particles.frustumCulled = false;
scene.add(particles);

// ---------- 节点标记（右侧列）与隐藏层 ----------
const markerFS = `
  varying vec2 vUv; uniform float uFill, uAct, uOn, uVis, uTime; uniform vec3 uCol;
  float hair(float d, float px){ float w = fwidth(d) * px; return 1.0 - smoothstep(0.0, w, abs(d)); }
  void main(){
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
    float a01 = fract(atan(p.x, p.y) / 6.28318);
    float ring = hair(r - 0.62, 1.2) * 0.55;
    float arc = (1.0 - smoothstep(0.08 - fwidth(r), 0.08 + fwidth(r), abs(r - 0.84))) * step(a01, uFill);
    float cdot = smoothstep(0.24, 0.0, r) * (0.35 + 0.9 * uAct * (0.7 + 0.3 * sin(uTime * 6.0)));
    vec3 c = uCol * (ring + arc * 1.2 + cdot * 1.6);
    if (uOn < 0.5) c = vec3(0.35) * ring;
    gl_FragColor = vec4(c * uVis, 1.0);
  }`;
function makeMarker(size, col) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShaderMaterial({
    uniforms: { uFill: { value: 0 }, uAct: { value: 0 }, uOn: { value: 1 }, uVis: { value: 1 }, uTime: shared.uTime, uCol: { value: new THREE.Color(col) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: markerFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(m); return m;
}
const markers = nodePos.map((p) => { const m = makeMarker(1.25, '#ffffff'); m.position.copy(p); return m; });
const hMarkers = [...H1, ...H2].map((p) => { const m = makeMarker(0.9, '#ffffff'); m.position.copy(p); m.material.uniforms.uAct.value = 0.5; return m; });

// ---------- 标签 ----------
function addLabel(cls, html, pos, cx = 0.5, cy = 0.5) {
  const el = document.createElement('div'); el.className = cls; el.innerHTML = html;
  const o = new CSS2DObject(el); o.position.copy(pos); o.center.set(cx, cy); scene.add(o); return o;
}
const nodeLabels = nodePos.map((p) => addLabel('nlabel', '', p.clone().add(new THREE.Vector3(1.0, 0, 0)), 0, 0.5));
const coreLabel = addLabel('corelabel', '<div class="t1">金泰</div><div class="t2">KINGTAI · NX-01</div>', SC);
const segLabels = [];
for (let i = 0; i < 8; i++) {
  const a = (i + 0.5) / 8 * Math.PI * 2;   // 与着色器一致：顶部起顺时针
  const r = DIAL + 0.45;
  segLabels.push(addLabel('segnum', `0${i}`, new THREE.Vector3(SC.x + Math.sin(a) * r, SC.y + Math.cos(a) * r, 0)));
}
const caps = [['任务编排', H1[0].x], ['资源分配', H2[0].x], ['GPU 执行', nodePos[0].x]]
  .map(([t, x]) => addLabel('hlabel', t, new THREE.Vector3(x, 9.7, 0)));

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
  shared.uWhite.value.set(pal.white); shared.uAcc.value.set(pal.acc);
  for (let i = 0; i < N; i++) {
    const c = new THREE.Color(i < 8 ? pal.a : pal.b);
    shared.uNodeCol.value[i].set(c.r, c.g, c.b);
    markers[i].material.uniforms.uCol.value.copy(c);
  }
  hMarkers.forEach((m) => m.material.uniforms.uCol.value.set(pal.white));
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
  const list = [...(j.a?.gpus || []), ...(j.b?.gpus || [])];
  for (let i = 0; i < N; i++) {
    const n = nodes[i], g = list.find((x) => x.id === n.id) || {};
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
  }
  const a = j.a || {}, b = j.b || {};
  const aG = (a.gpus || []).filter((g) => g.online);
  const used = aG.reduce((s, g) => s + (g.vram_used || 0), 0), tot = aG.reduce((s, g) => s + (g.vram_total || 0), 0);
  const run = aG.reduce((s, g) => s + (g.running || 0), 0), pend = aG.reduce((s, g) => s + (g.pending || 0), 0);
  const aRam = a.ram_total ? (1 - a.ram_free / a.ram_total) * 100 : null;
  const bRam = b.ram_total ? (1 - b.ram_free / b.ram_total) * 100 : null;
  const q = (b.gpus || [])[0] || {}, g3 = (b.gpus || [])[3] || {};
  setText('aVram', fmt(used, 1)); setText('aVramT', ` / ${fmt(tot, 0)} GiB · 在线 ${a.online ?? '--'}/8`);
  setText('jobs', `${run} / ${pend}`); setText('jobsT', ' 个任务');
  setText('aRam', `${fmt(aRam, 1)}%`); setText('ramT', ` B机 ${fmt(bRam, 1)}%`);
  setText('bOnline', `${b.online ?? '--'}/4`);
  setText('bT', ` 在线 · ${q.online ? fmt(q.tok_s) + ' tok/s' : 'Qwen 未上线'} · ${g3.online ? fmt(g3.temp_c, 0) + '°C ' + fmt(g3.power_w, 0) + 'W' : ''}`);
  if (record) {
    push(hist.vram, tot ? used / tot * 100 : null); push(hist.ram, aRam); push(hist.bram, bRam);
    push(hist.power, g3.online ? g3.power_w : null);
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
function spark(id, series, lo, hi, colors) {
  const [x, w, h] = prepCanvas(id);
  x.strokeStyle = 'rgba(255,255,255,0.10)'; x.lineWidth = 1;
  for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(0, Math.round(h * k / 4) + 0.5); x.lineTo(w, Math.round(h * k / 4) + 0.5); x.stroke(); }
  series.forEach((arr, si) => {
    if (arr.length < 2) return;
    x.beginPath();
    arr.forEach((v, i) => { const px = w - (arr.length - 1 - i) * (w / (HMAX - 1)); const py = h - 2 - (clamp01((v - lo) / (hi - lo)) * (h - 4)); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.strokeStyle = colors[si]; x.lineWidth = 1.5; x.stroke();
    if (si === 0) { x.lineTo(w, h); x.lineTo(w - (arr.length - 1) * (w / (HMAX - 1)), h); x.closePath();
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fill(); }
  });
}
function drawSparks() {
  spark('spVram', [hist.vram], 0, 100, [pal.white]);
  spark('spRam', [hist.ram, hist.bram], 0, 100, [pal.white, pal.acc]);
  spark('spB', [hist.power], 0, 600, [pal.acc]);
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
  return { ok: true, a: { online: 8, ram_total: 1007, ram_free: 365 + 45 * Math.sin(t * 0.03), gpus: A }, b: { online: 4, ram_total: 252, ram_free: 142 + 18 * Math.cos(t * 0.04), gpus: B } };
}
const bootAt = Date.now();
async function poll() {
  if (CLOUD_DEMO) return;
  try {
    const r = await fetch('/api/stats', {
      cache: 'no-store',
      signal: AbortSignal.timeout ? AbortSignal.timeout(1800) : undefined,
    });
    const j = await r.json();
    if (!j.ok || !j.a) throw new Error('no data');
    fallbackDemo = false;
    applyStats(j, true); lastOk = Date.now(); everOk = true;
    if (j.lan_url) setText('lanNote', `内网大屏：${j.lan_url}（纯画面加 ?nohud）`);
  } catch (e) {
    if ((!everOk && Date.now() - bootAt > 6000) || (everOk && Date.now() - lastOk > 15000)) {
      fallbackDemo = true;
    }
  }
}
if (CLOUD_DEMO) {
  for (let k = -40; k <= 0; k++) applyStats(demoStats(k * 2), true);
} else {
  poll(); setInterval(poll, 2000);
}
if (!CAPTURE && navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
const captureStart = Date.now();
function updateStatus() {
  const el = document.getElementById('status'); let cls, txt;
  if (FORCE_DEMO) { cls = 'demo'; txt = '● 演示模式'; }
  else if (IS_PUBLIC_STATIC) { cls = 'demo'; txt = '● 云端展映（仿真数据）'; }
  else if (fallbackDemo) { cls = 'demo'; txt = '● 离线演示（正在重连…）'; }
  else if (!everOk) { cls = 'wait'; txt = '● 连接中'; }
  else { const age = (Date.now() - lastOk) / 1000; if (age < 6) { cls = 'live'; txt = '● 实时数据'; } else { cls = 'off'; txt = `● 数据延迟 ${age.toFixed(0)} 秒`; } }
  if (el.textContent !== txt) { el.textContent = txt; el.className = 'pill ' + cls; }
  setText('clock', (CAPTURE ? new Date(captureStart + simTime * 1000) : new Date()).toLocaleTimeString('zh-CN', { hour12: false }));
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
document.getElementById('pAuto').addEventListener('change', (e) => { autoCycle = e.target.checked; modeSince = simTime; });
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '4') { stopAuto(); setMode(+e.key - 1, simTime); }
  else if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('nohud');
  else if (e.key === 's' || e.key === 'S') document.getElementById('panel').classList.toggle('hidden');
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  camZ = getCamZ(); lookX = getLookX();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight);
  shared.uPR.value = renderer.getPixelRatio() * innerHeight / 1080; finish.uniforms.uRes.value.set(innerWidth, innerHeight); drawSparks();
});

// ---------- 帧循环 ----------
let simTime = 0;
function frame(dt) {
  simTime += dt;
  if (!CAPTURE && simTime > 86400) { simTime -= 86400; modeSince -= 86400; }
  const t = simTime;
  if (isDemo()) applyStats(demoStats(t), Math.floor(t / 2) !== Math.floor((t - dt) / 2));
  if (autoCycle && t - modeSince > MODE_SEC) setMode((modeB + 1) % 4, t);
  blend = Math.min(1, blend + dt / 2.5);
  const e = blend * blend * (3 - 2 * blend);
  const w = [0, 0, 0, 0]; w[modeA] += 1 - e; w[modeB] += e;

  const k = 1 - Math.exp(-dt * 2.0);
  let load = 0;
  nodes.forEach((n, i) => {
    n.ampShown += (n.amp - n.ampShown) * k; n.fracShown += (n.frac - n.fracShown) * k; load += n.ampShown;
    shared.uNodeAmp.value[i] = n.ampShown; shared.uNodeOn.value[i] = n.online ? 1 : 0;
    const mu = markers[i].material.uniforms; mu.uFill.value = n.fracShown; mu.uAct.value = n.ampShown; mu.uOn.value = n.online ? 1 : 0;
    if (i < 8) { dialUni.uFillA.value[i] = n.fracShown; dialUni.uActA.value[i] = n.ampShown; dialUni.uOnA.value[i] = n.online ? 1 : 0; }
    else { dialUni.uFillB.value[i - 8] = n.fracShown; dialUni.uActB.value[i - 8] = n.ampShown; dialUni.uOnB.value[i - 8] = n.online ? 1 : 0; }
    const html = nodeHtml(n);
    if (html !== n.html) { n.html = html; nodeLabels[i].element.innerHTML = html; nodeLabels[i].element.classList.toggle('off', !n.online); }
  });
  load /= N;

  const pulse = w[2] * Math.pow(1 - ((t * 0.25) % 1), 3);
  sphereUni.uPulse.value = w[2] * 0.4 + pulse; sphereUni.uCollapse.value = w[1]; sphereUni.uLoad.value = load;
  sphere.rotation.y += dt * 0.07 * spin;
  sphere.children.forEach((c) => { if (c.userData.orbit) c.rotation.z += dt * 0.05 * spin; });
  holeDisk.visible = w[1] > 0.02; holeDisk.scale.setScalar(Math.max(0.001, w[1]));
  dialUni.uVis.value = 1 - 0.55 * w[1];
  coreLabel.element.style.opacity = (1 - w[1]).toFixed(2);
  hMarkers.forEach((m) => { m.material.uniforms.uVis.value = w[3]; m.visible = w[3] > 0.01; });
  caps.forEach((c) => { c.element.style.opacity = w[3].toFixed(2); });
  bloom.strength = (+document.getElementById('pBloom').value) * (1 + 0.8 * pulse);

  shared.uTime.value = t; shared.uBlend.value = blend; shared.uModeA.value = modeA; shared.uModeB.value = modeB; shared.uSpin.value = spin;
  finish.uniforms.uTime.value = t;
  pGeo.setDrawRange(0, Math.floor(MAXP * density * (innerWidth < 720 ? 0.45 : 1)));
  [dial, ...markers, ...hMarkers].forEach((m) => m.quaternion.copy(camera.quaternion));

  camera.position.set(lookX + Math.sin(t * 0.045) * 1.8 * spin, LOOK_Y + 0.4 + Math.sin(t * 0.031) * 0.4 * spin, camZ);
  camera.lookAt(lookX, LOOK_Y, 0);

  updateStatus();
  composer.render();
  labelRenderer.render(scene, camera);
}

if (CAPTURE) { window.__advance = (dt) => frame(dt); frame(0.0001); window.__ready = true; }
else {
  let last = performance.now();
  const loop = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); requestAnimationFrame(loop); };
  requestAnimationFrame(loop); window.__ready = true;
}
