// Радио в крупном плане: подсвеченная шкала частот, стрелка, ручка настройки с рифлением и риской.
// Только читает session.radioTuning(); состояние не меняет. Дизайн: design/gdd/interaction-spec.md §3.8.
import * as THREE from 'three';
import { RADIO, RADIO_STATIONS } from '../campaign/radio-data.js';
import { knobAngle, needlePos } from '../campaign/st-radio.js';

const CW = 1024;
const CH = 544;
const CREAM = '#f3e2b5';
const FONT = "'Nunito', ui-rounded, system-ui, sans-serif";

export class RadioView {
  /** @param {{group: THREE.Group, dial: THREE.Mesh, led: THREE.Mesh, oldScale?: THREE.Mesh[]}} r — модель из buildKitchen */
  constructor(r) {
    this.r = r;
    const S = RADIO.scale;
    const F = RADIO.face;
    const K = RADIO.knob;
    for (const m of r.oldScale ?? []) m.visible = false;
    const g = r.group;

    // окно шкалы: латунная рамка и подсвеченная изнутри шкала
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(S.w + 0.014, S.h + 0.014, 0.006), new THREE.MeshStandardMaterial({ color: 0xb48a4c, roughness: 0.38, metalness: 0.6 }));
    bezel.position.set(S.x, S.y, F.z + 0.003);
    this.canvas = document.createElement('canvas');
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.plateMat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), this.plateMat);
    plate.position.set(S.x, S.y, F.z + 0.0062);
    const [n0, n1] = S.needle;
    this.needle = new THREE.Mesh(new THREE.BoxGeometry(0.0024, S.h * (n1 - n0), 0.0016), new THREE.MeshBasicMaterial({ color: 0xe23b2a, toneMapped: false }));
    this.needle.position.set(S.x, S.y + S.h / 2 - (S.h * (n0 + n1)) / 2, F.z + 0.0078);
    g.add(bezel, plate, this.needle);

    // ручка настройки: прежняя модель, крупнее, с рифлением, светлой шляпкой и риской «на 12 часов»
    const dial = r.dial;
    dial.material = dial.material.clone();
    this.dialMat = dial.material;
    this.dialMat.emissive.setHex(0xf2b544);
    dial.position.set(K.x, K.y, F.z + 0.011);
    dial.scale.set(K.r / 0.026, 1, K.r / 0.026);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.6 });
    const ridge = new THREE.BoxGeometry(0.0034, 0.019, 0.0034);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const m = new THREE.Mesh(ridge, wood);
      m.position.set(Math.cos(a) * 0.0262, 0, Math.sin(a) * 0.0262);
      m.rotation.y = -a;
      dial.add(m);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.02, 0.003, 24), new THREE.MeshStandardMaterial({ color: 0x8a5d3b, roughness: 0.5 }));
    cap.position.y = 0.0118;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.0032, 0.0016, 0.0135), new THREE.MeshBasicMaterial({ color: 0xf6e7c1 }));
    mark.position.set(0, 0.0136, -0.0118);
    dial.add(cap, mark);
    r.led.position.set(RADIO.led.x, RADIO.led.y, F.z + 0.008);

    // гравировка под ручкой
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 256;
    this.labelCanvas.height = 52;
    this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.0138), new THREE.MeshBasicMaterial({ map: this.labelTex, transparent: true, toneMapped: false }));
    label.position.set(K.x, K.y - K.r - 0.012, F.z + 0.0008);
    g.add(label);
    this._drawLabel();

    this.shown = null;
    this.key = null;
    // шрифт игры догрузится позже — перерисовать надписи
    document.fonts?.ready?.then(() => {
      this.key = null;
      this._drawLabel();
    });
  }

  /** Каждый кадр: стрелка и ручка плавно идут за частотой, подсветка — за приёмом. */
  sync(s, dt, t, pointerLocal) {
    const S = RADIO.scale;
    const K = RADIO.knob;
    const tu = s.radioTuning();
    this.shown = this.shown == null ? tu.freq : this.shown + (tu.freq - this.shown) * Math.min(1, dt * 12);
    const u = needlePos(this.shown);
    this.needle.position.x = S.x - S.w / 2 + S.w * (S.pad + u * (1 - 2 * S.pad));
    this.r.dial.rotation.y = -knobAngle(this.shown) + (s.holds.radio ? Math.sin(t * 9) * 0.05 : 0);
    const on = s.radio.enabled;
    const br = s.radio.broken;
    const glow = !on ? 0.4 : br ? 0.55 + 0.3 * Math.abs(Math.sin(t * 13) * Math.sin(t * 3.1)) : 0.82 + 0.18 * tu.signal;
    this.plateMat.color.setScalar(glow);
    if (on && !br) this.r.led.material.emissiveIntensity = 0.25 + 0.75 * tu.signal;
    // «нажал = приложил руку»: ручка подсвечивается под курсором и в руке
    const hover = !!pointerLocal && Math.hypot(pointerLocal.x - K.x, pointerLocal.z + K.y) < K.grab;
    this.dialMat.emissiveIntensity = tu.grab ? 0.32 : hover ? 0.14 : 0;
    const weak = !tu.tuned && tu.signal > 0.02;
    const key = `${on}|${br}|${tu.tuned?.id ?? ''}|${weak}`;
    if (key !== this.key) {
      this.key = key;
      this._draw(on, br, tu.tuned, weak);
    }
  }

  _draw(on, broken, tuned, weak) {
    const c = this.canvas.getContext('2d');
    const S = RADIO.scale;
    const bg = c.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, on ? '#3d2d15' : '#22201c');
    bg.addColorStop(1, on ? '#1f160b' : '#151311');
    c.fillStyle = bg;
    c.fillRect(0, 0, CW, CH);
    if (on) {
      const rg = c.createRadialGradient(CW / 2, CH * 0.32, 40, CW / 2, CH * 0.32, CW * 0.6);
      rg.addColorStop(0, 'rgba(255,196,110,0.28)');
      rg.addColorStop(1, 'rgba(255,196,110,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, CW, CH);
    }
    const X = (f) => CW * (S.pad + ((f - RADIO.min) / (RADIO.max - RADIO.min)) * (1 - 2 * S.pad));
    const base = CH * 0.46;
    c.strokeStyle = CREAM;
    c.fillStyle = CREAM;
    c.lineCap = 'round';
    for (let i = 0; i <= 40; i++) {
      const f = 88 + i * 0.5;
      const major = i % 8 === 0;
      const whole = i % 2 === 0;
      c.lineWidth = major ? 5 : whole ? 3.5 : 2.5;
      c.beginPath();
      c.moveTo(X(f), base);
      c.lineTo(X(f), base - CH * (major ? 0.16 : whole ? 0.1 : 0.055));
      c.stroke();
    }
    c.font = `800 52px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    for (let f = 88; f <= 108; f += 4) c.fillText(String(f), X(f), CH * 0.22);
    // станции: золотые метки и короткие подписи
    c.font = `800 30px ${FONT}`;
    for (const st of RADIO_STATIONS) {
      const x = X(st.freq);
      c.fillStyle = tuned?.id === st.id ? '#ffd98a' : '#d9a54e';
      c.beginPath();
      c.moveTo(x, base + 8);
      c.lineTo(x - 11, base + 26);
      c.lineTo(x + 11, base + 26);
      c.closePath();
      c.fill();
      c.fillText(st.dial, x, base + 62);
    }
    // строка названия станции
    c.strokeStyle = 'rgba(243,226,181,0.25)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(CW * 0.05, CH * 0.66);
    c.lineTo(CW * 0.95, CH * 0.66);
    c.stroke();
    let txt = '';
    let col = CREAM;
    if (broken) {
      txt = 'ПОМЕХИ';
      col = '#ff8f78';
    } else if (on && tuned) {
      txt = '♪ ' + tuned.name;
      col = '#ffd98a';
    } else if (on) txt = weak ? '· · ·' : '~ шум ~';
    c.font = `900 ${txt.length > 16 ? 58 : 66}px ${FONT}`;
    c.fillStyle = col;
    if (on && tuned) {
      c.shadowColor = 'rgba(255,200,100,0.7)';
      c.shadowBlur = 18;
    }
    c.fillText(txt, CW / 2, CH * 0.87);
    c.shadowBlur = 0;
    this.tex.needsUpdate = true;
  }

  _drawLabel() {
    const c = this.labelCanvas.getContext('2d');
    c.clearRect(0, 0, 256, 52);
    c.font = `900 34px ${FONT}`;
    c.fillStyle = '#6b4a2e';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('НАСТРОЙКА', 128, 28);
    this.labelTex.needsUpdate = true;
  }
}
