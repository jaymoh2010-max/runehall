/**
 * Procedural fallback portraits for creature tokens. The bestiary has no
 * artwork, so every unlinked token gets a deterministic face based on its
 * monster id or name. Uploaded art always wins.
 */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function creatureAvatarDataUrl(name: string, key = name): string {
  const hash = hashString(key || name || "creature");
  const hue = hash % 360;
  const accentHue = (hue + 26 + ((hash >>> 8) % 80)) % 360;
  const eyeHue = (hue + 170 + ((hash >>> 15) % 60)) % 360;
  const headWidth = 29 + ((hash >>> 4) % 9);
  const headHeight = 27 + ((hash >>> 9) % 7);
  const horns = (hash >>> 12) % 3;
  const threeEyes = ((hash >>> 17) & 1) === 1;
  const mouthCurve = 80 + ((hash >>> 20) % 8);
  const teeth = 3 + ((hash >>> 22) % 3);

  const hornMarkup =
    horns === 1
      ? `
        <path d="M39 36 Q24 22 22 5 Q39 19 49 31 Z" fill="hsl(${accentHue}, 42%, 26%)" stroke="hsl(${accentHue}, 38%, 48%)" stroke-width="1.5"/>
        <path d="M89 36 Q104 22 106 5 Q89 19 79 31 Z" fill="hsl(${accentHue}, 42%, 26%)" stroke="hsl(${accentHue}, 38%, 48%)" stroke-width="1.5"/>`
      : horns === 2
        ? `
        <path d="M42 34 L30 8 L50 28 Z" fill="hsl(${accentHue}, 46%, 30%)"/>
        <path d="M86 34 L98 8 L78 28 Z" fill="hsl(${accentHue}, 46%, 30%)"/>`
        : "";

  const eyes = [
    `<circle cx="49" cy="57" r="8" fill="hsl(${eyeHue}, 95%, 70%)"/><circle cx="49" cy="57" r="3.4" fill="#090d12"/>`,
    `<circle cx="79" cy="57" r="8" fill="hsl(${eyeHue}, 95%, 70%)"/><circle cx="79" cy="57" r="3.4" fill="#090d12"/>`,
    ...(threeEyes
      ? [
          `<circle cx="64" cy="42" r="5.5" fill="hsl(${eyeHue}, 95%, 76%)"/><circle cx="64" cy="42" r="2.3" fill="#090d12"/>`,
        ]
      : []),
  ].join("");

  const toothMarkup = Array.from({ length: teeth }, (_value, index) => {
    const x = 48 + (index * 32) / Math.max(1, teeth - 1);
    const height = 5 + ((hash >>> (index + 2)) % 4);
    return `<path d="M${x - 3} ${mouthCurve - 1} L${x} ${mouthCurve + height} L${x + 3} ${mouthCurve - 1} Z" fill="#e9e2d0" opacity="0.9"/>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <radialGradient id="bg" cx="50%" cy="28%" r="82%">
      <stop offset="0%" stop-color="hsl(${accentHue}, 40%, 34%)"/>
      <stop offset="100%" stop-color="hsl(${hue}, 36%, 9%)"/>
    </radialGradient>
    <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 30%, 42%)"/>
      <stop offset="100%" stop-color="hsl(${hue}, 36%, 20%)"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" fill="url(#bg)"/>
  <ellipse cx="64" cy="126" rx="55" ry="35" fill="rgba(0,0,0,0.4)"/>
  ${hornMarkup}
  <ellipse cx="64" cy="60" rx="${headWidth}" ry="${headHeight}" fill="url(#skin)" stroke="hsl(${hue}, 30%, 56%)" stroke-width="2"/>
  <path d="M30 58 Q22 54 18 46 Q28 46 34 52" fill="hsl(${hue}, 30%, 30%)"/>
  <path d="M98 58 Q106 54 110 46 Q100 46 94 52" fill="hsl(${hue}, 30%, 30%)"/>
  ${eyes}
  <path d="M46 ${mouthCurve - 2} Q64 ${mouthCurve + 10} 82 ${mouthCurve - 2} Q64 ${mouthCurve + 18} 46 ${mouthCurve - 2} Z" fill="#090d12"/>
  ${toothMarkup}
  <circle cx="35" cy="74" r="2.4" fill="hsl(${accentHue}, 55%, 58%)" opacity="0.55"/>
  <circle cx="93" cy="70" r="1.8" fill="hsl(${accentHue}, 55%, 58%)" opacity="0.45"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
