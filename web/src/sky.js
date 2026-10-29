// Full-screen sky: gradient, stars, and a procedural panorama of the
// mountains you see from Seattle Center — Rainier to the SE, the Olympics
// across the Sound, Baker to the north and the Cascades to the east.
// The panorama turns with the camera, so Rainier shows up whenever you look
// south-east.
import * as THREE from 'three';

const deg = (d) => (d * Math.PI) / 180;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color('#9ec8e6') },
      uBot: { value: new THREE.Color('#eef3f2') },
      uSun: { value: new THREE.Color('#ffffff') },
      uBearing: { value: 0 },       // compass bearing the camera faces (rad)
      uSpan: { value: deg(80) },    // bearing range across the screen width
      uHorizon: { value: 0.7 },     // screen-space horizon (0 bottom .. 1 top)
      uNight: { value: 0 },
      uAspect: { value: 1.6 },
      uTime: { value: 0 },
      uRain: { value: 0 },
      uScale: { value: 1 },
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
        uniform float uBearing, uSpan, uHorizon, uNight, uAspect, uTime, uRain, uScale;
        varying vec2 vUv;
        #define PI 3.14159265
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        float noise(float x) { float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(hash(i), hash(i+1.0), f); }
        float fbm(float x) { return 0.55*noise(x) + 0.28*noise(x*2.3+7.1) + 0.17*noise(x*5.1+3.7); }
        float adiff(float a, float b) { return atan(sin(a-b), cos(a-b)); }
        float peak(float b, float c, float w, float h, float p) { return h * pow(max(0.0, 1.0 - abs(adiff(b, c))/w), p); }
        float band(float b, float a0, float a1, float soft) {
          float d0 = adiff(b, a0), d1 = adiff(a1, b);
          return smoothstep(0.0, soft, d0) * smoothstep(0.0, soft, d1);
        }
        void main() {
          float b = uBearing + (vUv.x - 0.5) * uSpan;
          float y = (vUv.y - uHorizon) / uScale;   // height above the horizon line
          vec3 sky = mix(uBot, uTop, smoothstep(-0.1, 0.55, vUv.y));

          // stars
          vec2 sp = vec2(b * 60.0, vUv.y * 60.0 / uAspect * 1.6);
          vec2 cell = floor(sp);
          float st = hash(dot(cell, vec2(12.9, 78.2)));
          float tw = 0.6 + 0.4 * sin(uTime * (1.0 + st * 3.0) + st * 40.0);
          float star = step(0.985, st) * smoothstep(0.08, 0.0, length(fract(sp) - 0.5)) * tw;
          sky += star * uNight * (1.0 - uRain) * smoothstep(0.0, 0.2, y) * vec3(0.9, 0.95, 1.0);

          // mountain ranges (heights in screen units)
          float casc = band(b, 0.45, 2.35, 0.25) * (0.022 + 0.03 * fbm(b * 18.0));
          float olym = band(b, 4.35, 5.65, 0.25) * (0.035 + 0.045 * fbm(b * 22.0 + 40.0));
          olym = max(olym, peak(b, 4.89, 0.07, 0.085, 1.3));                      // Mt. Olympus-ish
          float baker = peak(b, 0.26, 0.07, 0.075, 1.5);
          float rain = peak(b, 2.58, 0.24, 0.18, 1.3)                           // Rainier, SE
                     + peak(b, 2.66, 0.05, 0.03, 1.2)                            // Little Tahoma shoulder
                     - 0.012 * smoothstep(0.03, 0.0, abs(adiff(b, 2.58)));       // flat summit
          float far = max(casc, max(olym, baker));

          vec3 haze = mix(uBot, uTop, 0.35);
          vec3 rock = mix(vec3(0.38, 0.45, 0.56), vec3(0.07, 0.09, 0.15), uNight);
          vec3 snow = mix(vec3(0.97, 0.97, 1.0) * mix(vec3(1.0), uSun, 0.55), vec3(0.32, 0.36, 0.48), uNight);
          float vis = 1.0 - 0.85 * uRain;               // the mountain is "out" unless it rains

          vec3 col = sky;
          if (y < far) {
            float snowLine = far * 0.62;
            vec3 m = mix(rock, snow, smoothstep(snowLine - 0.004, snowLine + 0.004, y) * 0.8);
            col = mix(col, mix(m, haze, 0.55), vis);
          }
          if (y < rain) {
            float snowLine = rain * 0.28;
            float streak = 0.5 + 0.5 * sin(b * 260.0 + y * 40.0);
            float s = smoothstep(snowLine - 0.006, snowLine + 0.006, y + 0.01 * streak);
            vec3 m = mix(rock * 0.95, snow, s);
            // light from the side facing the sun
            m *= 1.0 - 0.18 * smoothstep(-0.05, 0.05, adiff(b, 2.58));
            // glacier ridges catching light
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
  setExtent([x0, y0, x1, y1]) {
    this.corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => new THREE.Vector3(x, 0, -y));
  }

  update(camera, controls, { sun, night, time, rain }) {
    const off = new THREE.Vector3().subVectors(camera.position, controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    // camera looks toward -off; compass bearing = atan2(east, north) = -theta
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
