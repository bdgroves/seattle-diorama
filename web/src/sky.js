// Screen-space gradient background + matching haze.
import * as THREE from 'three';

export class Sky {
  constructor(scene) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 4; this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = this.tex;
    scene.fog = new THREE.Fog('#ffffff', 3300, 8200);
    this.fog = scene.fog;
  }

  set(top, bottom) {
    const g = this.ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, `#${top.getHexString()}`);
    g.addColorStop(0.75, `#${bottom.getHexString()}`);
    g.addColorStop(1, `#${bottom.clone().offsetHSL(0, 0, 0.04).getHexString()}`);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, 4, 256);
    this.tex.needsUpdate = true;
    this.fog.color.copy(bottom).lerp(top, 0.25);
  }
}
