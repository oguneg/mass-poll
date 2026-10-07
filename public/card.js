// Draws the shareable result card to a canvas: my ranking and the crowd's, side by side,
// with a line joining each option across the two lists so disagreements are easy to see.
// The poll's URL is printed on the image, because a screenshot is what travels.

const W = 1080;
const H = 1350;
const MAX_ROWS = 10;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const COL_W = 400;
const LEFT_X = 48;
const RIGHT_X = W - 48 - COL_W;
const TILE = 64;

function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff';
}

function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth) text = text.slice(0, -1);
  return text + '…';
}

// Split a name over at most two lines so long names stay readable instead of being cut off.
function wrapName(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (!best || w < best.w) best = { lines: [a, b], w };
  }
  const lines = best ? best.lines : [text];
  return lines.map((l) => fit(ctx, l, maxWidth));
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawTile(ctx, item, logo, x, cy, size) {
  const y = cy - size / 2;
  ctx.fillStyle = logo ? '#ffffff' : item.color;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.22);
  ctx.fill();
  if (logo) {
    const pad = size * 0.12;
    const scale = Math.min((size - pad * 2) / logo.width, (size - pad * 2) / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.drawImage(logo, x + size / 2 - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = textOn(item.color);
    ctx.textAlign = 'center';
    const emoji = /[^\x00-\x7f]/.test(item.short);
    ctx.font = `800 ${Math.round(size * (emoji ? 0.55 : item.short.length > 2 ? 0.34 : 0.44))}px ${FONT}`;
    ctx.fillText(item.short, x + size / 2, cy + size * (emoji ? 0.19 : 0.15));
    ctx.textAlign = 'left';
  }
}

// mine: personal ranking rows (score desc, unrated last); crowd: crowd ranking rows with .rank.
export async function drawCard({ poll, mine, crowd, link }) {
  const crowdRank = new Map(crowd.map((r) => [r.key, r.rank]));
  const rated = mine.filter((r) => r.score != null);
  const shown = (rated.length >= 2 ? rated : mine).slice(0, MAX_ROWS);
  const hidden = mine.length - shown.length;

  // Same options in both columns; each column sorted by its own ranking.
  const left = shown.map((r, i) => ({ ...r, pos: i, rank: r.score == null ? null : i + 1 }));
  const byCrowd = [...shown].sort((a, b) => crowdRank.get(a.key) - crowdRank.get(b.key));
  const right = byCrowd.map((r, i) => ({ ...r, pos: i, rank: crowdRank.get(r.key) }));
  const rightPos = new Map(right.map((r) => [r.key, r.pos]));

  const images = new Map();
  await Promise.all(shown.filter((r) => r.image).map(async (r) => images.set(r.key, await loadImage(r.image))));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#14141a';
  ctx.fillRect(0, 0, W, H);

  // title + headline: the option where I split from the crowd the most
  ctx.fillStyle = '#f0eee8';
  ctx.font = `800 58px ${FONT}`;
  ctx.fillText(fit(ctx, poll.title, W - 96), 48, 104);
  const diffs = left
    .filter((r) => r.rank != null)
    .map((r) => ({ r, delta: crowdRank.get(r.key) - r.rank }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = diffs[0];
  const split = top && Math.abs(top.delta) >= 2 ? top : null;
  ctx.fillStyle = '#9b9a94';
  ctx.font = `500 29px ${FONT}`;
  const headline = split
    ? `Biggest split: ${split.r.name}. I put it #${split.r.rank}, the crowd #${crowdRank.get(split.r.key)}.`
    : rated.length
      ? 'I agree with the crowd almost everywhere.'
      : '';
  ctx.fillText(fit(ctx, headline, W - 96), 48, 152);

  // column headers
  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = '#7da2ff';
  ctx.fillText('MY RANKING', LEFT_X, 236);
  ctx.fillStyle = '#e8c860';
  ctx.textAlign = 'right';
  ctx.fillText('THE CROWD', RIGHT_X + COL_W, 236);
  ctx.textAlign = 'left';

  const top0 = 262;
  const bottom = 1180;
  const rowH = Math.min(112, (bottom - top0) / Math.max(shown.length, 1));
  const cyOf = (pos) => top0 + pos * rowH + rowH / 2;

  // connecting lines first, so tiles sit on top
  for (const r of left) {
    const j = rightPos.get(r.key);
    const x1 = LEFT_X + COL_W;
    const x2 = RIGHT_X;
    const y1 = cyOf(r.pos);
    const y2 = cyOf(j);
    const isSplit = split && split.r.key === r.key;
    const delta = crowdRank.get(r.key) - (r.rank ?? 0); // positive: I rank it higher than the crowd does
    ctx.strokeStyle = r.rank == null || delta === 0 ? '#6f6e78' : delta > 0 ? '#4cc38a' : '#ef6b5b';
    ctx.globalAlpha = isSplit ? 1 : 0.7;
    ctx.lineWidth = isSplit ? 10 : 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1 + 8, y1);
    ctx.bezierCurveTo(x1 + (x2 - x1) * 0.5, y1, x1 + (x2 - x1) * 0.5, y2, x2 - 8, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const drawColumn = (rows, x, align) => {
    rows.forEach((r) => {
      const y = top0 + r.pos * rowH;
      const cy = y + rowH / 2;
      ctx.fillStyle = r.pos % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.roundRect(x, y + 4, COL_W, rowH - 8, 18);
      ctx.fill();

      // rank | tile | name, mirrored on the right so the tile faces the lines
      const rankX = align === 'left' ? x + 18 : x + COL_W - 18;
      const tileX = align === 'left' ? x + 70 : x + COL_W - 70 - TILE;
      ctx.fillStyle = '#9b9a94';
      ctx.font = `800 34px ${FONT}`;
      ctx.textAlign = align;
      ctx.fillText(r.rank == null ? '–' : String(r.rank), rankX, cy + 12);

      drawTile(ctx, r, images.get(r.key), tileX, cy, TILE);

      ctx.fillStyle = r.rank == null ? '#9b9a94' : '#f0eee8';
      ctx.font = `700 29px ${FONT}`;
      const nameX = align === 'left' ? tileX + TILE + 14 : tileX - 14;
      ctx.textAlign = align;
      const maxName = COL_W - 70 - TILE - 14 - 12;
      const lines = wrapName(ctx, r.name, maxName);
      const lineH = 34;
      lines.forEach((line, k) => ctx.fillText(line, nameX, cy + 10 - ((lines.length - 1) * lineH) / 2 + k * lineH));
    });
    ctx.textAlign = 'left';
  };
  drawColumn(left, LEFT_X, 'left');
  drawColumn(right, RIGHT_X, 'right');

  if (hidden > 0) {
    ctx.fillStyle = '#9b9a94';
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(`+ ${hidden} more not shown`, 48, bottom + 34);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(48, 1228, W - 96, 2);
  ctx.fillStyle = '#f0eee8';
  ctx.font = `700 33px ${FONT}`;
  const matchups = (poll.items.length * (poll.items.length - 1)) / 2;
  ctx.fillText(`${poll.items.length} options · ${matchups} matchups · answer ${poll.min ?? 10} to contribute`, 48, 1282);
  ctx.fillStyle = '#7da2ff';
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText(fit(ctx, link, W - 96), 48, 1328);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
