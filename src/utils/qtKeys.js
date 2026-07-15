/**
 * Qt key normalization utilities shared between PaletteApp and IntelliSenseApp.
 */

export const QT_MODIFIERS = {
  SHIFT: 0x02000000,
  CTRL:  0x04000000,
  ALT:   0x08000000,
  META:  0x10000000,
};

export const QT_KEY_MAP = {
  0x01000000: 'Escape',
  0x01000001: 'Tab',
  0x01000003: 'Backspace',
  0x01000004: 'Enter',
  0x01000005: 'Enter',
  0x01000010: 'Home',
  0x01000012: 'ArrowLeft',
  0x01000013: 'ArrowUp',
  0x01000014: 'ArrowRight',
  0x01000015: 'ArrowDown',
  0x20: ' ',
};

/**
 * Convert Qt key event data (text + key code) to a DOM-compatible key string.
 */
export function normalizeQtKeyToDomKey(text, key) {
  const printable = (text || '').toString();
  if (printable.length === 1) return printable;

  if (typeof key === 'string') {
    const normalized = key.trim();
    if (!normalized) return '';
    const aliases = {
      Space: ' ', Spacebar: ' ',
      Return: 'Enter', Esc: 'Escape',
      Down: 'ArrowDown', Up: 'ArrowUp',
      Left: 'ArrowLeft', Right: 'ArrowRight',
    };
    return aliases[normalized] || normalized;
  }

  if (typeof key === 'number') {
    if (key >= 0x41 && key <= 0x5A) return String.fromCharCode(key);
    if (key >= 0x30 && key <= 0x39) return String.fromCharCode(key);
    return QT_KEY_MAP[key] || '';
  }

  return '';
}
