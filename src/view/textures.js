// Процедурные текстуры на canvas: всё рисуется локально, без внешних файлов,
// кроме логотипа (public/assets/logo-5.svg), который хранится отдельно для замены.
import * as THREE from 'three';

// VITE_NEUTRAL=1 — сборка без бренда (для публичных ссылок и превью)
// Сравнение со строкой-литералом: сборщик подставляет значение и выкидывает брендовые ветки целиком.
const NV = import.meta.env?.VITE_NEUTRAL;
export const NEUTRAL = NV === '1' || NV === 'true'; // VITE_NEUTRAL=0 — бренд остаётся
export const LOGO_URL = NEUTRAL ? './assets/logo-neutral.svg' : './assets/logo-5.svg';

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
  // пока файл грузится — временный знак: в нейтральной сборке без цифры «5» и фирменного красного
  ctx.fillStyle = NEUTRAL ? '#2f7d4f' : '#e30613';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${r * 1.3}px Arial Black, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(NEUTRAL ? '★' : '5', cx, cy + r * 0.08);
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

// Мелкая зернистость поверх заливки: детерминированная, чтобы картинка не менялась от запуска к запуску.
function grain(ctx, w, h, n, colors, size = [1, 2], seed = 7) {
  let x = seed;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const s = size[0] + rnd() * (size[1] - size[0]);
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

export function buildTextures() {
  // Плитка пола — тёплая терракота с затиркой и лёгкой неровностью
  tex.floor = canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#b98a62';
      ctx.fillRect(0, 0, w, h);
      const t = w / 4;
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          const k = (i * 7 + j * 3) % 5;
          ctx.fillStyle = ['#e2b98a', '#dcb083', '#e6c094', '#d8aa7c', '#e0b689'][k];
          ctx.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
          // блик на глазури
          const g = ctx.createLinearGradient(i * t, j * t, i * t + t, j * t + t);
          g.addColorStop(0, 'rgba(255,255,255,0.10)');
          g.addColorStop(1, 'rgba(120,70,30,0.08)');
          ctx.fillStyle = g;
          ctx.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
        }
      grain(ctx, w, h, 2600, ['rgba(120,70,40,0.10)', 'rgba(255,240,220,0.12)'], [1, 3]);
    },
    { repeat: [5, 5] },
  );

  // Стена — тёплые обои с полоской и снежинками
  tex.wall = canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#ecc996';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255,240,210,0.35)' : 'rgba(200,140,80,0.10)';
        ctx.fillRect(i * 32, 0, 32, h);
      }
      ctx.globalAlpha = 0.45;
      for (let i = 0; i < 8; i++) snowflake(ctx, 16 + (i % 4) * 64 + (Math.floor(i / 4) % 2) * 32, 40 + Math.floor(i / 4) * 128, 8, '#fff6e6', 2);
      ctx.globalAlpha = 1;
      grain(ctx, w, h, 900, ['rgba(140,90,40,0.07)', 'rgba(255,255,255,0.08)']);
    },
    { repeat: [4, 2] },
  );

  // Разделочная доска: светлый бук, продольные волокна, следы ножа
  tex.board = canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#e2b47c';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = ['#e6ba84', '#dcac72', '#e9c08b', '#d9a86e', '#e3b57e', '#ddb077', '#e8bd87'][i];
        ctx.fillRect(0, (i * h) / 7, w, h / 7);
      }
      ctx.strokeStyle = 'rgba(150,95,45,0.22)';
      for (let i = 0; i < 70; i++) {
        ctx.lineWidth = 0.6 + (i % 3) * 0.5;
        const y = (i * 53) % h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.33, y + ((i % 5) - 2) * 3, w * 0.66, y - ((i % 4) - 1.5) * 3, w, y + 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120,80,40,0.10)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 40; i++) {
        const x = (i * 97) % w, y = (i * 61) % h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 6 + (i % 5) * 4, y + 30 + (i % 7) * 6);
        ctx.stroke();
      }
      grain(ctx, w, h, 1800, ['rgba(130,80,35,0.08)', 'rgba(255,240,215,0.10)']);
    },
  );

  // Столешница: зелёный камень с крошкой (как зелёные столешницы референса)
  tex.counter = canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#3f9a4f';
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 1600, ['rgba(255,255,255,0.10)', 'rgba(20,70,30,0.18)', 'rgba(200,240,190,0.12)'], [1, 3], 11);
    },
    { repeat: [6, 2] },
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

// Исторически «toon»: теперь физический материал (art-bible: мультяшность — в формах и цвете,
// а не в ступенчатом свете). Матовый по умолчанию, отражения даёт окружение сцены.
export function toon(color, opts = {}) {
  const { gradientMap, ...rest } = opts;
  void gradientMap;
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...rest });
}
