// Настройки игрока (0.11): чистая логика без DOM, Web Audio и Three.js.
// Лежат в save.data.settings рядом с качеством графики и любимой волной радио; старые сохранения читаются
// (normalizeSettings достраивает недостающие поля), чужие поля (radioFreq, inProgress, stream) не трогаются.
import { normalizeKeys } from './keymap.js';
import { GHOST_IDS } from './ghost/ghost-ids.js';

/** Размер текста интерфейса: 100 %, 115 %, 130 %. */
export const TEXT_SCALES = [1, 1.15, 1.3];
/** Три шины звука: общая, эффекты, радио и музыка. */
export const VOLUME_BUSES = ['master', 'sfx', 'music'];
/** Подписи шин для экрана настроек. */
export const VOLUME_LABELS = { master: 'Общая громкость', sfx: 'Эффекты', music: 'Радио и музыка' };
export const QUALITIES = ['high', 'low'];

/** Настройки нового игрока. Громкость 1 = прежний уровень игры (до 0.11 громкости не было). */
export function defaultSettings() {
  return {
    quality: 'high',
    volume: { master: 1, sfx: 1, music: 1 },
    assist: false, // «мягкие жесты»: допуски шире в CAMPAIGN.assist.k раз (campaign/assist.js)
    textScale: 1,
    reduceMotion: null, // null — как в системе (prefers-reduced-motion), true/false — выбор игрока
    fullscreen: false, // последний выбор игрока: настольная версия вернёт его при запуске
    keys: {}, // только изменённые клавиши { действие: код } (keymap.js)
    ghostHints: true, // «Подсказки рукой»: рука-призрак показывает жест при первой встрече и после неудач (src/ghost/)
    ghostSeen: {}, // какие жесты рука уже показывала: { 'cut-v': true, … }; один раз за игру, «Новая кампания» это не стирает
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Громкость 0..1 → число из допустимых: целые проценты. Не число → запасное значение. */
export function normalizeVolume(v, fallback = 1) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.round(clamp01(v) * 100) / 100;
}

/**
 * Громкость ползунка → усиление WebAudio. Квадратичная кривая: на середине ползунка заметно тише, а не «чуть тише»,
 * как у слуха. 1 → 1 (прежний уровень), 0 → полная тишина.
 */
export function volumeGain(v) {
  const x = clamp01(Number.isFinite(v) ? v : 1);
  return x * x;
}

/** Размер текста → ближайший из TEXT_SCALES; не число → 1 (100 %). */
export function snapTextScale(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  let best = TEXT_SCALES[0];
  for (const s of TEXT_SCALES) if (Math.abs(s - v) < Math.abs(best - v) - 1e-9) best = s;
  return best;
}

/** 1.15 → 115 (для подписей и атрибута data-ts). */
export const scalePercent = (s) => Math.round(snapTextScale(s) * 100);

/** Что рука уже показывала: только известные жесты со значением true, остальное из сохранения отбрасывается. */
export function normalizeGhostSeen(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const id of GHOST_IDS) if (raw[id] === true) out[id] = true;
  return out;
}

/**
 * Настройки из сохранения → полный набор без неверных значений. Неизвестные поля остаются как есть.
 * @param {unknown} raw — что лежало в save.settings (или ничего)
 */
export function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const vol = src.volume && typeof src.volume === 'object' ? src.volume : {};
  return {
    ...src,
    quality: src.quality === 'low' ? 'low' : 'high',
    volume: { master: normalizeVolume(vol.master), sfx: normalizeVolume(vol.sfx), music: normalizeVolume(vol.music) },
    assist: src.assist === true,
    textScale: snapTextScale(src.textScale),
    reduceMotion: typeof src.reduceMotion === 'boolean' ? src.reduceMotion : null,
    fullscreen: src.fullscreen === true,
    keys: normalizeKeys(src.keys),
    ghostHints: typeof src.ghostHints === 'boolean' ? src.ghostHints : true, // по умолчанию рука включена
    ghostSeen: normalizeGhostSeen(src.ghostSeen),
  };
}

/** Поля, которые переживают «Новую кампанию»: настройки — не прогресс. stream — режим стримера (канал, порт оверлея, сила чата). */
export const PREFERENCE_KEYS = ['quality', 'volume', 'assist', 'textScale', 'reduceMotion', 'fullscreen', 'keys', 'ghostHints', 'ghostSeen', 'stream'];

/** Предпочтения игрока из настроек (без radioFreq, inProgress и прочего, что относится к кампании). Незаданное не переносится. */
export function pickPreferences(settings) {
  const n = normalizeSettings(settings);
  return Object.fromEntries(PREFERENCE_KEYS.filter((k) => n[k] !== undefined).map((k) => [k, n[k]]));
}

/** Эффективное «меньше движения»: выбор игрока или системная настройка. */
export function effectiveReduceMotion(settings, systemPrefers = false) {
  return typeof settings?.reduceMotion === 'boolean' ? settings.reduceMotion : !!systemPrefers;
}
