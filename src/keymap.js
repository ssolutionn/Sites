// Клавиши игры (0.11): действия, значения по умолчанию, переназначение. Чистая логика без DOM.
// Коды — KeyboardEvent.code (физическая клавиша: WASD работает и на русской раскладке).
// Менять клавиши можно в «Настройках»; в save.data.settings.keys лежат только изменённые.

/**
 * Действия. def — клавиша по умолчанию, alt — запасные (стрелки к WASD; переназначаются не отдельно, а вместе с игрой).
 * Escape у pause закреплён всегда (см. FIXED): «назад» не должен пропасть.
 */
export const ACTIONS = {
  up: { label: 'Вперёд', group: 'Ходьба', def: 'KeyW', alt: ['ArrowUp'] },
  down: { label: 'Назад', group: 'Ходьба', def: 'KeyS', alt: ['ArrowDown'] },
  left: { label: 'Влево', group: 'Ходьба', def: 'KeyA', alt: ['ArrowLeft'] },
  right: { label: 'Вправо', group: 'Ходьба', def: 'KeyD', alt: ['ArrowRight'] },
  interact: { label: 'Действие рядом', group: 'Кухня', def: 'Space', alt: [] },
  rotate: { label: 'Повернуть доску', group: 'Кухня', def: 'KeyR', alt: [] },
  recipe: { label: 'Книга рецептов', group: 'Кухня', def: 'KeyQ', alt: [] },
  shout: { label: 'Крикнуть на кота', group: 'Кухня', def: 'KeyF', alt: [] }, // обработчик — блок «кот» 0.11
  pauseChat: { label: 'Пауза чата (режим стримера)', group: 'Режим стримера', def: 'KeyP', alt: [] },
  pause: { label: 'Назад, пауза', group: 'Игра', def: 'Escape', alt: [] },
  mute: { label: 'Звук', group: 'Игра', def: 'KeyM', alt: [] },
  fullscreen: { label: 'Полный экран', group: 'Игра', def: 'F11', alt: [] },
};
export const ACTION_ORDER = Object.keys(ACTIONS);
/** Клавиши, которые всегда за одним действием. */
export const FIXED = { Escape: 'pause' };

const RESERVED = /^(F5|F12|Tab|Enter|NumpadEnter|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|AltRight|MetaLeft|MetaRight|OSLeft|OSRight|CapsLock|ContextMenu)$/;
const BINDABLE = /^(Key[A-Z]|Digit[0-9]|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal)|Arrow(?:Up|Down|Left|Right)|Space|Backquote|Minus|Equal|Bracket(?:Left|Right)|Semicolon|Quote|Comma|Period|Slash|Backslash|IntlBackslash|F(?:[1-9]|1[0-9]|2[0-4])|Home|End|PageUp|PageDown|Insert|Delete|Backspace|Escape)$/;

/**
 * Годится ли клавиша для действия.
 * @returns {{ok:true}|{ok:false, reason:'invalid'|'reserved'}} reserved — нужна системе или самой игре (Esc, Tab, Enter, Shift…)
 */
export function checkCode(code, action = null) {
  if (typeof code !== 'string' || !code) return { ok: false, reason: 'invalid' };
  if (code === 'Escape') return action === 'pause' ? { ok: true } : { ok: false, reason: 'reserved' };
  if (RESERVED.test(code)) return { ok: false, reason: 'reserved' };
  return BINDABLE.test(code) ? { ok: true } : { ok: false, reason: 'invalid' };
}

/** Короткое имя клавиши для подписей: KeyW → «W», Space → «Пробел», ArrowUp → «↑». */
export function keyName(code) {
  if (typeof code !== 'string') return '';
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit([0-9])$/.exec(code))) return m[1];
  if ((m = /^(Shift|Control|Alt|Meta|OS)(?:Left|Right)$/.exec(code))) return { Shift: 'Shift', Control: 'Ctrl', Alt: 'Alt', Meta: 'Win', OS: 'Win' }[m[1]];
  if ((m = /^Numpad(.+)$/.exec(code))) return 'Num ' + ({ Add: '+', Subtract: '−', Multiply: '×', Divide: '÷', Decimal: ',' }[m[1]] ?? m[1]);
  const named = { Space: 'Пробел', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '−', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: '\'', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', IntlBackslash: '\\', PageUp: 'PgUp', PageDown: 'PgDn', Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', Tab: 'Tab', Enter: 'Enter', NumpadEnter: 'Num Enter', CapsLock: 'Caps Lock', ContextMenu: 'Меню' };
  return named[code] ?? code;
}

/** Все клавиши действия при данных изменениях: основная, запасные, закреплённые. Без повторов. */
function codesOf(action, over) {
  const a = ACTIONS[action];
  const fixed = Object.entries(FIXED).filter(([, act]) => act === action).map(([c]) => c);
  return [...new Set([over[action] ?? a.def, ...a.alt, ...fixed])];
}

/** Клавиша → действия, которые её занимают. */
function usage(over) {
  const m = new Map();
  for (const action of ACTION_ORDER) for (const c of codesOf(action, over)) m.set(c, [...(m.get(c) ?? []), action]);
  return m;
}

/** Сохранённое → чистый набор изменений: только известные действия, годные клавиши и без двойных назначений. */
export function normalizeKeys(raw) {
  const over = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    for (const action of ACTION_ORDER) {
      const code = raw[action];
      if (typeof code === 'string' && code !== ACTIONS[action].def && checkCode(code, action).ok) over[action] = code;
    }
  // одна клавиша на два действия: уступает то, у кого она изменена, последним в порядке ACTION_ORDER
  for (;;) {
    let drop = null;
    for (const actions of usage(over).values()) {
      if (actions.length < 2) continue;
      const changed = actions.filter((a) => a in over);
      if (changed.length) drop = changed[changed.length - 1];
      if (drop) break;
    }
    if (!drop) return over;
    delete over[drop];
  }
}

/** Фраза игроку, почему клавишу не назначили (≤ 70 знаков, без «ошибки»). */
export function explainBind(result, code = '') {
  if (!result || result.ok) return '';
  const k = keyName(code);
  if (result.reason === 'conflict') return `Клавиша ${k} уже занята: «${ACTIONS[result.with].label}». Выбери другую`;
  if (result.reason === 'reserved') return `Клавиша ${k} нужна игре или системе. Выбери другую`;
  return 'Такую клавишу назначить нельзя. Выбери другую';
}

/** Текущие клавиши игры. */
export class Keymap {
  /** @param {object} overrides — save.data.settings.keys (проверяется) */
  constructor(overrides = {}) {
    this.over = normalizeKeys(overrides);
    this._index();
  }

  _index() {
    this.index = new Map();
    for (const [code, actions] of usage(this.over)) this.index.set(code, actions[0]);
  }

  /** Основная клавиша действия. */
  get(action) {
    return ACTIONS[action] ? this.over[action] ?? ACTIONS[action].def : null;
  }

  /** Все клавиши действия (основная первой). */
  codes(action) {
    return ACTIONS[action] ? codesOf(action, this.over) : [];
  }

  /** Действие по event.code или null. */
  actionOf(code) {
    return this.index.get(code) ?? null;
  }

  /** Нажата именно основная клавиша действия (не запасная). У доски A/D крутят, а стрелки — нет. */
  isPrimary(action, code) {
    return this.get(action) === code;
  }

  isDefault(action) {
    return !(action in this.over);
  }

  /**
   * Назначить клавишу действию.
   * @returns {{ok:true}|{ok:false, reason:'unknown'|'invalid'|'reserved'|'conflict', with?:string}}
   */
  bind(action, code) {
    if (!ACTIONS[action]) return { ok: false, reason: 'unknown' };
    const c = checkCode(code, action);
    if (!c.ok) return c;
    const owner = this.actionOf(code);
    if (owner && owner !== action) return { ok: false, reason: 'conflict', with: owner };
    if (code === ACTIONS[action].def) delete this.over[action];
    else this.over[action] = code;
    this._index();
    return { ok: true };
  }

  /** Вернуть одно действие к умолчанию. Если его клавишу уже заняли — conflict, как у bind. */
  reset(action) {
    if (!ACTIONS[action]) return { ok: false, reason: 'unknown' };
    return this.bind(action, ACTIONS[action].def);
  }

  resetAll() {
    this.over = {};
    this._index();
  }

  /** Что сохранять в save.data.settings.keys. */
  toJSON() {
    return { ...this.over };
  }

  /** Строки для экрана настроек: действие, подпись, клавиша, запасные, изменено ли. */
  list() {
    return ACTION_ORDER.map((action) => ({
      action,
      label: ACTIONS[action].label,
      group: ACTIONS[action].group,
      code: this.get(action),
      name: keyName(this.get(action)),
      alts: this.codes(action).filter((c) => c !== this.get(action)).map(keyName),
      changed: !this.isDefault(action),
    }));
  }
}
