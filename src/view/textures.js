// Процедурные текстуры на canvas: всё рисуется локально, без внешних файлов,
// кроме логотипа (public/assets/logo-5.svg), который хранится отдельно для замены.
import * as THREE from 'three';

export const LOGO_URL = './assets/logo-5.svg';

let logoImage = null;
const logoWaiters = [];

export function loadLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      logoImage = img;
      resolve(img);
      logoWaiters.splice(0).forEach((fn) => fn(img));
    };
    img.onerror = () => resolve(null);
    img.src = LOGO_URL;
  });
}

// Рисует логотип в контекст; если файл ещё не загружен — временный круг с «5»,
// а после загрузки текстура перерисовывается.
function drawLogo(ctx, cx, cy, r, texture) {
  if (logoImage) {
    ctx.drawImage(logoImage, cx - r, cy - r, r * 2, r * 2);
    return;
  }
  ctx.fillStyle = '#e30613';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${r * 1.3}px Arial Black, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('5', cx, cy + r * 0.08);
  if (texture) logoWaiters.push(() => texture.userData.redraw?.());
}

function canvasTexture(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.userData.redraw = () => {
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h, tex);
    tex.needsUpdate = true;
  };
  tex.userData.redraw();
  return tex;
}

function snowflake(ctx, x, y, r, color, lw = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const ex = x + Math.cos(a) * r;
    const ey = y + Math.sin(a) * r;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const mx = x + Math.cos(a) * r * 0.6;
    const my = y + Math.sin(a) * r * 0.6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(a + s * 0.8) * r * 0.3, my + Math.sin(a + s * 0.8) * r * 0.3);
      ctx.stroke();
    }
  }
}

function heart(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  ctx.fill();
}

function tree(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s * 0.6, y + s * 0.4);
  ctx.lineTo(x - s * 0.6, y + s * 0.4);
  ctx.closePath();
  ctx.fill();
}

export const tex = {};

export function buildTextures() {
  // Плитка пола — тёплая бежевая
  tex.floor = canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#e9cfa6';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#f0dab5' : '#e5c79a';
          ctx.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
        }
    },
    { repeat: [6, 6] },
  );

  // Стена — тёплая штукатурка с еле заметным узором
  tex.wall = canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#f3dcb4';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.25;
      for (let i = 0; i < 9; i++) snowflake(ctx, (i * 71) % w, (i * 113) % h, 9, '#ffffff', 2);
      ctx.globalAlpha = 1;
    },
    { repeat: [3, 1.5] },
  );

  // Фартук кухни — кафель
  tex.backsplash = canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#fbf3e4';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#e4d3b8';
      ctx.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 32);
        ctx.lineTo(w, i * 32);
        ctx.stroke();
      }
      for (let r = 0; r < 4; r++)
        for (let i = 0; i <= 2; i++) {
          const x = i * 64 + (r % 2) * 32;
          ctx.beginPath();
          ctx.moveTo(x, r * 32);
          ctx.lineTo(x, r * 32 + 32);
          ctx.stroke();
        }
    },
    { repeat: [8, 2] },
  );

  // Дерево фасадов
  tex.wood = canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#c98f55';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(120,70,30,0.25)';
      for (let i = 0; i < 30; i++) {
        ctx.lineWidth = 1 + (i % 3);
        ctx.beginPath();
        const y = (i * 37) % h;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 3);
        ctx.stroke();
      }
    },
    { repeat: [2, 1] },
  );

  // Свитер: молочный с красными снежинками и сердечками
  tex.sweater = canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#fbf4ea';
      ctx.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++)
        for (let i = 0; i < 4; i++) {
          const x = i * 64 + (r % 2) * 32 + 16;
          const y = r * 64 + 32;
          if ((i + r) % 2) snowflake(ctx, x, y, 14, '#d32f2f', 4);
          else heart(ctx, x, y - 12, 22, '#d32f2f');
        }
      ctx.fillStyle = '#d32f2f';
      ctx.fillRect(0, 0, w, 8);
    },
    { repeat: [2, 2] },
  );

  // Фартук: красный с ёлочками и белой «5»
  tex.apron = canvasTexture(256, 320, (ctx, w, h, t) => {
    ctx.fillStyle = '#d7262b';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.9;
    for (let r = 0; r < 6; r++)
      for (let i = 0; i < 5; i++) {
        const x = i * 56 + (r % 2) * 28 + 10;
        const y = r * 56 + 30;
        if ((i + r) % 3 === 0) tree(ctx, x, y, 12, '#1f7a3a');
        else snowflake(ctx, x, y, 7, '#ffffff', 2);
      }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, 110, 62, 0, Math.PI * 2);
    ctx.fill();
    drawLogo(ctx, w / 2, 110, 56, t);
  });

  // Повязка с белыми снежинками
  tex.headband = canvasTexture(
    256,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#d7262b';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) snowflake(ctx, i * 32 + 16, h / 2, 11, '#ffffff', 3);
    },
    { repeat: [2, 1] },
  );

  // Кошачьи полоски
  tex.catFur = canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#f0923a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c96a1c';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 22 + 8, h / 2, 5, h * 0.48, 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeat: [2, 1] },
  );

  // Логотип для магнита/вывески
  tex.logo = canvasTexture(256, 256, (ctx, w, h, t) => drawLogo(ctx, w / 2, h / 2, 120, t));

  // Ночное окно со снегом и огнями
  tex.window = canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1b2a5a');
    g.addColorStop(1, '#3e5aa0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const bx = i * 30;
      const bh = 60 + ((i * 53) % 90);
      ctx.fillStyle = '#16204a';
      ctx.fillRect(bx, h - bh, 26, bh);
      ctx.fillStyle = '#ffd77a';
      for (let k = 0; k < 8; k++) if ((i * 7 + k * 3) % 4 === 0) ctx.fillRect(bx + 4 + (k % 3) * 7, h - bh + 8 + Math.floor(k / 3) * 14, 4, 6);
    }
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) {
      ctx.globalAlpha = 0.5 + ((i * 17) % 50) / 100;
      ctx.beginPath();
      ctx.arc((i * 97) % w, (i * 61) % h, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

  // Этикетки
  tex.peasLabel = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2f8f3a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ГОРОШЕК', w / 2, 60);
    ctx.fillStyle = '#8fd14f';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(60 + i * 22, 92, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.mayoLabel = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f6fbf';
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('МАЙОНЕЗ', w / 2, 56);
    ctx.fillStyle = '#e8b400';
    ctx.fillRect(40, 76, w - 80, 14);
  });
  tex.sausage = canvasTexture(
    64,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#e7909a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fbe3e3';
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.arc((i * 23) % w, (i * 37) % h, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeat: [1, 1] },
  );
  tex.phoneScreen = canvasTexture(128, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3fb6ff');
    g.addColorStop(1, '#2a5bd7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return tex;
}

// Градиент для мультяшного освещения
let toonGradient = null;
export function toonGradientMap() {
  if (toonGradient) return toonGradient;
  const data = new Uint8Array([90, 170, 235, 255]);
  toonGradient = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradientMap(), ...opts });
}
