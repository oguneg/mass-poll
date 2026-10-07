// Draws the shareable result card to a canvas, set like a tournament standings sheet:
// my ranking and the crowd's side by side, each option joined across by a ruled connector, so
// disagreements read at a glance. The poll's URL is printed on the image: a screenshot is what travels.

const W = 1080;
const H = 1350;
const MAX_ROWS = 10;

const INK = '#101216';
const INK_2 = '#4a515b';
const PAPER = '#ffffff';
const MARK = '#ffd52e';
const PEN = '#c9223a';
const HAIR = 'rgba(16,18,22,0.18)';
const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const TEXT = '"Barlow", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

const COL_W = 392;
const LEFT_X = 48;
const RIGHT_X = W - 48 - COL_W;
const TILE = 62;

function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#101216' : '#ffffff';
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
  return (best ? best.lines : [text]).map((l) => fit(ctx, l, maxWidth));
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
  ctx.fillRect(x, y, size, size);
  if (logo) {
    const pad = size * 0.12;
    const scale = Math.min((size - pad * 2) / logo.width, (size - pad * 2) / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.drawImage(logo, x + size / 2 - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = textOn(item.color);
    ctx.textAlign = 'center';
    const emoji = /[^ -~]/.test(item.short);
    ctx.font = `800 ${Math.round(size * (emoji ? 0.55 : item.short.length > 2 ? 0.4 : 0.52))}px ${emoji ? 'system-ui' : DISPLAY}`;
    ctx.fillText(item.short, x + size / 2, cy + size * (emoji ? 0.19 : 0.17));
    ctx.textAlign = 'left';
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
}

// mine: personal ranking rows (score desc, unrated last); crowd: crowd ranking rows with .rank.
export async function drawCard({ poll, mine, crowd, link, confidence = null }) {
  await Promise.all([
    document.fonts.load(`800 40px ${DISPLAY}`),
    document.fonts.load(`500 30px ${TEXT}`),
    document.fonts.load(`700 30px ${TEXT}`),
    document.fonts.load(`800 24px ${MONO}`),
    document.fonts.load(`500 24px ${MONO}`),
  ]).catch(() => {});

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

  // sheet + ink border
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // header band: the pairing-slip yellow
  ctx.fillStyle = MARK;
  ctx.fillRect(0, 0, W, 208);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 208, W, 6);
  ctx.fillStyle = INK;
  ctx.font = `800 92px ${DISPLAY}`;
  ctx.fillText(fit(ctx, poll.title.toUpperCase(), W - 96), 48, 120);
  ctx.font = `800 26px ${MONO}`;
  const sure = confidence == null ? '' : `  ·  ${Math.round(confidence * 100)}% SURE`;
  ctx.fillText(`MY STANDINGS VS THE CROWD${sure}`, 48, 176);

  // headline: the option where I split from the crowd the most
  const diffs = left
    .filter((r) => r.rank != null)
    .map((r) => ({ r, delta: crowdRank.get(r.key) - r.rank }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const split = diffs[0] && Math.abs(diffs[0].delta) >= 2 ? diffs[0] : null;
  ctx.fillStyle = INK;
  ctx.font = `700 31px ${TEXT}`;
  const headline = split
    ? `Biggest split: ${split.r.name}. I put it #${split.r.rank}, the crowd #${crowdRank.get(split.r.key)}.`
    : rated.length
      ? 'I agree with the crowd almost everywhere.'
      : '';
  ctx.fillText(fit(ctx, headline, W - 96), 48, 266);

  // column headers
  ctx.font = `800 26px ${MONO}`;
  ctx.fillStyle = INK;
  ctx.fillText('ME', LEFT_X, 322);
  ctx.textAlign = 'right';
  ctx.fillText('CROWD', RIGHT_X + COL_W, 322);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.fillRect(LEFT_X, 334, COL_W, 4);
  ctx.fillRect(RIGHT_X, 334, COL_W, 4);

  const top0 = 342;
  const bottom = 1186;
  const rowH = Math.min(104, (bottom - top0) / Math.max(shown.length, 1));
  const cyOf = (pos) => top0 + pos * rowH + rowH / 2;

  // ruled rows
  const drawRules = (x) => {
    for (let i = 0; i <= shown.length; i++) {
      ctx.fillStyle = HAIR;
      ctx.fillRect(x, top0 + i * rowH, COL_W, 2);
    }
  };
  drawRules(LEFT_X);
  drawRules(RIGHT_X);

  // connectors: out of the left column, down a private channel, into the right column (90 degree turns)
  const gapL = LEFT_X + COL_W;
  const span = RIGHT_X - gapL;
  const lines = left.map((r) => {
    const j = rightPos.get(r.key);
    const delta = crowdRank.get(r.key) - (r.rank ?? 0); // positive: I rank it higher than the crowd does
    return { r, y1: cyOf(r.pos), y2: cyOf(j), delta, isSplit: split && split.r.key === r.key };
  });
  const channelX = (i) => gapL + 28 + ((span - 56) * (i + 0.5)) / Math.max(left.length, 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  const draw = (l, i, style) => {
    ctx.beginPath();
    ctx.moveTo(gapL, l.y1);
    ctx.lineTo(channelX(i), l.y1);
    ctx.lineTo(channelX(i), l.y2);
    ctx.lineTo(RIGHT_X, l.y2);
    ctx.setLineDash(style.dash || []);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.stroke();
    ctx.setLineDash([]);
  };
  lines.forEach((l, i) => {
    if (l.isSplit) draw(l, i, { color: MARK, width: 22 }); // marker underlay for the biggest split
  });
  lines.forEach((l, i) => {
    if (l.r.rank == null || l.delta === 0) draw(l, i, { color: 'rgba(16,18,22,0.35)', width: 3 });
    else if (l.delta > 0) draw(l, i, { color: INK, width: l.isSplit ? 8 : 5 }); // I rank it higher: solid ink
    else draw(l, i, { color: PEN, width: l.isSplit ? 8 : 5, dash: [14, 9] }); // I rank it lower: dashed pen
  });

  const drawColumn = (rows, x, align) => {
    rows.forEach((r) => {
      const y = top0 + r.pos * rowH;
      const cy = y + rowH / 2;
      const rankX = align === 'left' ? x + 6 : x + COL_W - 6;
      const tileX = align === 'left' ? x + 66 : x + COL_W - 66 - TILE;
      ctx.fillStyle = INK;
      ctx.font = `800 36px ${MONO}`;
      ctx.textAlign = align;
      ctx.fillText(r.rank == null ? '–' : String(r.rank), rankX, cy + 13);

      drawTile(ctx, r, images.get(r.key), tileX, cy, TILE);

      ctx.fillStyle = r.rank == null ? INK_2 : INK;
      ctx.font = `800 36px ${DISPLAY}`;
      const nameX = align === 'left' ? tileX + TILE + 14 : tileX - 14;
      ctx.textAlign = align;
      const maxName = COL_W - 66 - TILE - 14 - 8;
      const nameLines = wrapName(ctx, r.name.toUpperCase(), maxName);
      const lineH = 36;
      nameLines.forEach((line, k) => ctx.fillText(line, nameX, cy + 10 - ((nameLines.length - 1) * lineH) / 2 + k * lineH));
    });
    ctx.textAlign = 'left';
  };
  drawColumn(left, LEFT_X, 'left');
  drawColumn(right, RIGHT_X, 'right');

  // legend for the line styles
  ctx.font = `500 22px ${MONO}`;
  ctx.fillStyle = INK_2;
  ctx.fillText('SOLID: I RANK IT HIGHER   DASHED: LOWER', 48, bottom + 34);
  if (hidden > 0) {
    ctx.textAlign = 'right';
    ctx.fillText(`+ ${hidden} MORE NOT SHOWN`, W - 48, bottom + 34);
    ctx.textAlign = 'left';
  }

  // footer: black bar, options/matchups line in marker yellow, the address in white
  ctx.fillStyle = INK;
  ctx.fillRect(0, 1240, W, H - 1240);
  const matchups = (poll.items.length * (poll.items.length - 1)) / 2;
  ctx.fillStyle = MARK;
  ctx.font = `800 25px ${MONO}`;
  ctx.fillText(fit(ctx, `${poll.items.length} OPTIONS · ${matchups} MATCHUPS · ANSWER ${poll.min ?? 10} TO CONTRIBUTE`, W - 96), 48, 1292);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 36px ${TEXT}`;
  ctx.fillText(fit(ctx, link, W - 96), 48, 1332);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
