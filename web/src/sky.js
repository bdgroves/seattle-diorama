// Full-screen sky: gradient, stars, and a procedural panorama of the
// mountains on the horizon, set per place by compass bearing. The panorama
// turns with the camera, so Rainier shows up behind downtown Seattle when you
// look south-east, and the Sierra crest rises behind Mono Lake to the west.
import * as THREE from 'three';

const deg = (d) => (d * Math.PI) / 180;
const MAXR = 4, MAXP = 6;

// Seattle: Cascades east, Olympics west, Baker north, Rainier the hero
export const SEATTLE_SKY = {
  ranges: [[0.45, 2.35, 0.022, 0.03], [4.35, 5.65, 0.035, 0.045]],
  peaks: [[4.89, 0.07, 0.085, 1.3], [0.26, 0.07, 0.075, 1.5]],
  hero: [2.58, 0.24, 0.18, 1.3],
  stars: 1,
};

export class Sky {
  constructor(scene, cfg = SEATTLE_SKY) {
    const v4 = (a) => new THREE.Vector4(...(a || [0, 0, 0, 0]));
    const ranges = Array.from({ length: MAXR }, (_, i) => v4(cfg.ranges?.[i]));
    const peaks = Array.from({ length: MAXP }, (_, i) => v4(cfg.peaks?.[i]));
    this.uniforms = {
      uTop: { value: new THREE.Color('#9ec8e6') },
      uBot: { value: new THREE.Color('#eef3f2') },
      uSun: { value: new THREE.Color('#ffffff') },
      uBearing: { value: 0 },
      uSpan: { value: deg(80) },
      uHorizon: { value: 0.7 },
      uNight: { value: 0 },
      uAspect: { value: 1.6 },
      uTime: { value: 0 },
      uRain: { value: 0 },
      uScale: { value: 1 },
      uRanges: { value: ranges },
      uPeaks: { value: peaks },
      uHero: { value: v4(cfg.hero) },
      uHasHero: { value: cfg.hero ? 1 : 0 },
      uStars: { value: cfg.stars ?? 1 },
      uMilky: { value: cfg.milky ?? 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uBot, uSun;
        uniform float uBearing, uSpan, uHorizon, uNight, uAspect, uTime, uRain, uScale, uHasHero, uStars, uMilky;
        uniform vec4 uRanges[${MAXR}];
        uniform vec4 uPeaks[${MAXP}];
        uniform vec4 uHero;
        varying vec2 vUv;
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        float noise(float x) { float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(hash(i), hash(i+1.0), f); }
        float fbm(float x) { return 0.55*noise(x) + 0.28*noise(x*2.3+7.1) + 0.17*noise(x*5.1+3.7); }
        float adiff(float a, float b) { return atan(sin(a-b), cos(a-b)); }
        float peak(float b, vec4 p) { return p.z * pow(max(0.0, 1.0 - abs(adiff(b, p.x))/max(p.y, 1e-4)), p.w); }
        float band(float b, float a0, float a1, float soft) {
          if (a1 - a0 >= 6.28) return 1.0;
          float d0 = adiff(b, a0), d1 = adiff(a1, b);
          return smoothstep(0.0, soft, d0) * smoothstep(0.0, soft, d1);
        }
        void main() {
          float b = uBearing + (vUv.x - 0.5) * uSpan;
          float y = (vUv.y - uHorizon) / uScale;
          vec3 sky = mix(uBot, uTop, smoothstep(-0.1, 0.55, vUv.y));

          // stars (denser and a faint Milky Way where the sky is dark)
          vec2 sp = vec2(b * 60.0, vUv.y * 60.0 / uAspect * 1.6);
          vec2 cell = floor(sp);
          float st = hash(dot(cell, vec2(12.9, 78.2)));
          float tw = 0.6 + 0.4 * sin(uTime * (1.0 + st * 3.0) + st * 40.0);
          float thr = mix(0.985, 0.965, uStars - 1.0 > 0.0 ? 1.0 : 0.0);
          float star = step(thr, st) * smoothstep(0.08, 0.0, length(fract(sp) - 0.5)) * tw;
          float milky = uMilky * exp(-pow((vUv.y - 0.55 - 0.25 * sin(b * 1.3)) / 0.09, 2.0)) * (0.5 + 0.5 * fbm(b * 30.0 + vUv.y * 20.0));
          sky += (star + milky * 0.18) * uNight * (1.0 - uRain) * smoothstep(0.0, 0.2, y) * vec3(0.9, 0.95, 1.0);

          // mountain ranges and peaks (heights in screen units)
          float far = 0.0;
          for (int i = 0; i < ${MAXR}; i++) {
            vec4 r = uRanges[i];
            if (r.z <= 0.0) continue;
            far = max(far, band(b, r.x, r.y, 0.25) * (r.z + r.w * fbm(b * (18.0 + float(i) * 4.0) + float(i) * 40.0)));
          }
          for (int i = 0; i < ${MAXP}; i++) far = max(far, peak(b, uPeaks[i]));
          float hero = uHasHero * (peak(b, uHero) + peak(b, vec4(uHero.x + 0.08, 0.05, uHero.z * 0.17, 1.2))
                       - 0.012 * smoothstep(0.03, 0.0, abs(adiff(b, uHero.x))));

          vec3 haze = mix(uBot, uTop, 0.35);
          vec3 rock = mix(vec3(0.38, 0.45, 0.56), vec3(0.07, 0.09, 0.15), uNight);
          vec3 snow = mix(vec3(0.97, 0.97, 1.0) * mix(vec3(1.0), uSun, 0.55), vec3(0.32, 0.36, 0.48), uNight);
          float vis = 1.0 - 0.85 * uRain;

          vec3 col = sky;
          if (y < far) {
            float snowLine = far * 0.62;
            vec3 m = mix(rock, snow, smoothstep(snowLine - 0.004, snowLine + 0.004, y) * 0.8);
            col = mix(col, mix(m, haze, 0.55), vis);
          }
          if (y < hero) {
            float snowLine = hero * 0.28;
            float streak = 0.5 + 0.5 * sin(b * 260.0 + y * 40.0);
            float s = smoothstep(snowLine - 0.006, snowLine + 0.006, y + 0.01 * streak);
            vec3 m = mix(rock * 0.95, snow, s);
            m *= 1.0 - 0.18 * smoothstep(-0.05, 0.05, adiff(b, uHero.x));
            m = mix(m, m * 0.82, smoothstep(0.6, 1.0, sin(b * 140.0 + y * 25.0)) * s * 0.6);
            col = mix(col, mix(m, haze, 0.14), vis);
          }
          // below the horizon: a soft tabletop the diorama sits on
          vec3 floorC = mix(uBot, uTop, 0.12) * 0.97;
          col = mix(col, mix(floorC, uBot, smoothstep(-0.4, 0.0, y) * 0.5), smoothstep(0.004, -0.012, y));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
    scene.background = null;
    scene.fog = new THREE.Fog('#ffffff', 3300, 8200);
    this.fog = scene.fog;
  }

  set(top, bottom) {
    this.uniforms.uTop.value.copy(top);
    this.uniforms.uBot.value.copy(bottom);
    this.fog.color.copy(bottom).lerp(top, 0.25);
  }

  // the mountains sit just behind the far edge of the diorama slab
  setExtent([x0, y0, x1, y1], h = 0) {
    this.corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => new THREE.Vector3(x, h, -y));
  }

  update(camera, controls, { sun, night, time, rain }) {
    const off = new THREE.Vector3().subVectors(camera.position, controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    this.uniforms.uBearing.value = -sph.theta;
    const aspect = innerWidth / innerHeight;
    this.uniforms.uAspect.value = aspect;
    this.uniforms.uSpan.value = deg(46) * aspect;
    let top = -1;
    const v = new THREE.Vector3();
    for (const c of this.corners || []) top = Math.max(top, v.copy(c).project(camera).y);
    const h = top * 0.5 + 0.5 - 0.035;
    this.uniforms.uHorizon.value = h;
    this.uniforms.uScale.value = THREE.MathUtils.clamp((1.04 - h) / 0.32, 0.4, 1.0);
    this.uniforms.uSun.value.copy(sun);
    this.uniforms.uNight.value = night;
    this.uniforms.uTime.value = time;
    this.uniforms.uRain.value = rain;
  }
}
