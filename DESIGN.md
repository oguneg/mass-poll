---
name: Mass Poll
description: A league of duels, set like tournament paperwork. Cool white sheet, black ink rules, one canary-yellow pairing slip, crimson pen for corrections.
colors:
  paper: "#f3f4f5"
  sheet: "#ffffff"
  ink: "#101216"
  ink-2: "#4a515b"
  hair: "rgba(16, 18, 22, 0.16)"
  mark: "#ffd52e"
  pen: "#c9223a"
  paper-dark: "#111316"
  sheet-dark: "#1b1e23"
  ink-dark: "#f1f2f4"
  ink-2-dark: "#a5acb6"
  hair-dark: "rgba(241, 242, 244, 0.18)"
  pen-dark: "#ff7385"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "clamp(2.3rem, 9vw, 3.9rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "0"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.03em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 5vw, 2.1rem)"
    fontWeight: 800
    lineHeight: 1
  body:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "0.78rem"
    fontWeight: 500
    letterSpacing: "0.02em"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "0.85rem"
    fontWeight: 800
    letterSpacing: "0.02em"
rounded:
  sharp: "2px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "26px"
  page-gutter: "16px"
  page-max: "920px"
components:
  button:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    rounded: "{rounded.sharp}"
    padding: "8px 20px"
    height: "46px"
  button-hover:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.ink}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sharp}"
    padding: "8px 20px"
    height: "46px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.pen}"
    rounded: "{rounded.sharp}"
    padding: "8px 20px"
    height: "46px"
  button-danger-hover:
    backgroundColor: "{colors.pen}"
    textColor: "{colors.paper}"
  pairing-slip:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sharp}"
  contender:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sharp}"
    padding: "22px 8px 6px"
  board-tag:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.mark}"
    typography: "{typography.data}"
    padding: "3px 9px"
  result-stamp:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.mark}"
    typography: "{typography.data}"
    padding: "8px 10px"
  table-number:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    size: "56px"
  panel:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    padding: "12px 14px"
  tabs-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    height: "46px"
---

# Design System: Mass Poll

## Overview

**Creative North Star: "The Tournament Director's Wall Chart"**

Mass Poll is a league of head-to-head duels, and the interface is set like the paperwork of one: a cool white sheet ruled in black ink, a single canary-yellow carbon pairing slip for the live duel, and a crimson ballpen reserved for corrections. Every duel is a board, every answer is stamped between the two contenders as a chess-style result (1-0, 0-1, half-half), and the ranking is a standings crosstable with a hatched diagonal. It is an Operate surface: fans on a phone settling an argument in about two minutes, so density is compact and ruled, never airy.

The mood is exact, functional, slightly stern, and quick. Ink carries every fact; yellow marks the thing you act on or the winner; there is no third accent. Corners are square (2px at most). Depth comes from rules and a single soft lift under the slip. The dark scheme is a graphite scoreboard with chalk-white ink and the same yellow.

**Key Characteristics:**
- Ruled, not boxed: 2px black ink rules for structure, 1px hairlines for rows.
- One yellow object per screen region: the pairing slip, table numbers, the winner row, the active meter fill.
- Condensed uppercase display for names and actions; monospace for every number, label and score.
- Crimson means correction only.
- Poll content (logos, initials, emoji) is the only imagery.

## Colors

A cool-neutral sheet with black ink, one signal yellow, one correction red. Tokens are CSS custom properties on `:root`, swapped under `prefers-color-scheme: dark`. Frontmatter is normative for values.

### Primary
- **Canary Marker** (`mark`): the pairing slip, table-number tiles, board tag text and stamp text on ink, the hover fill for every button, the confidence bar fill, the winner row at 50% and row hover at 16% (via `--mark-rgb`), text selection. Identical in both schemes.

### Secondary
- **Correction Pen** (`pen`, dark `pen-dark`): danger buttons and the dashed "I rank it lower" connector lines on the share card. Nothing else.

### Neutral
- **Cool Paper** (`paper`, dark `paper-dark`): page background, header strip, the pinned phone bar, inverse text on ink fills.
- **White Sheet** (`sheet`, dark `sheet-dark`): panels, tables, buttons at rest, contender tiles inside the slip.
- **Black Ink** (`ink`, dark `ink-dark`): text, rules, focus rings, primary buttons, filled round cells.
- **Pencil Grey** (`ink-2`, dark `ink-2-dark`): secondary text, labels, hints.
- **Hairline** (`hair`, dark `hair-dark`): row dividers, matrix gridlines, meter tracks.

### Named Rules
**The Pen Reserve Rule.** Crimson is only for corrections: danger buttons and the dashed lower-rank lines on the card. It never decorates, never signals success, never becomes a second brand color.

**The Slip Stays Ink Rule.** Inside the yellow slip, text and borders use literal `#101216` and the contenders literal white, in both schemes, because the slip is physical yellow paper and does not follow the scheme.

**The Share Card Is Always Light Rule.** The canvas card (`card.js`) hard-codes the light palette (ink, `#ffffff` sheet, marker, pen, `rgba(16,18,22,0.18)` hair) and ignores the dark scheme, so a shared image looks the same everywhere.

## Typography

**Display Font:** Barlow Condensed (600, 800; fallback Arial Narrow, system-ui)
**Body Font:** Barlow (500, 700; fallback system-ui stack)
**Label/Mono Font:** JetBrains Mono (500, 800; fallback ui-monospace stack)

All self-hosted woff2 in `public/fonts` with `font-display: swap`. **Character:** a heavy condensed grotesque for names and commands, set in capitals like a pairing sheet, with a typewriter-clean mono for every figure and label.

### Hierarchy
- **Display** (800, clamp(2.3rem, 9vw, 3.9rem), 0.95, uppercase): page h1 (poll title). Balanced wrap.
- **Headline** (800, 1.35rem, 1.1, 0.03em, uppercase): h2 with a 2px ink underline; buttons and tabs at 1.05rem with 0.05em.
- **Title** (800, clamp(1.5rem, 5vw, 2.1rem), 1, uppercase): poll names on home rows; contender names 1.3 to 1.7rem; slip question 1.15 to 1.5rem.
- **Body** (Barlow 500, 17px, 1.45, max 68ch): descriptions and prose; lede at 1.15rem in Pencil Grey. Tabular numerals are on globally.
- **Label** (Mono 500, 0.72 to 0.8rem, uppercase, 0.02em): meta lines, hints, key legends, footers. Never below 0.8rem on phones for the secondary label set.
- **Data** (Mono 800, 0.85 to 1.2rem): board numbers, round counts, ranks, percentages, result stamp, facts line.

### Named Rules
**The Mono-For-Numbers Rule.** Anything that is a count, rank, score or percentage is JetBrains Mono. Names and actions are Barlow Condensed. Prose is Barlow.

## Layout

A single centered column, max 920px with 16px gutters, under a full-width header strip (2px ink bottom rule). Rhythm is tight and ruled: 6 to 14px inside components, 18 to 26px between groups, h2 at 38px top margin. Home is a ruled list of poll rows (56px table-number tile, title block, Play action; under 600px the action drops to a second line and the tile shrinks to 44px). Results rows are a 4-column grid (rank, tile, name, meter) that collapses to rank, tile, name with the meter on its own line under 560px. The head-to-head crosstable scrolls horizontally inside its wrapper.

Voting on phones (under 600px) strips the page to the essentials: smaller h1, hidden description and facts, compact banner, and the Back/Tie bar pinned to the bottom with safe-area padding and 100px of bottom page padding to clear it.

## Elevation & Depth

Flat and ruled. Depth is conveyed by 2px ink borders, hairlines, and the yellow slip against the white sheet. The single shadow is a soft lift under the pairing slip (`box-shadow: 0 14px 26px -18px rgba(0,0,0,0.55)`), as if the carbon slip rests above the sheet. Chips carry an inset 2px ink ring (an outline, not a shadow). Hover and pick states use outlines (3px, 4px when picked) and a 3px translate, not shadows.

### Named Rules
**The One Lift Rule.** Only the pairing slip casts a shadow, and it is soft. Hard offset shadows are not part of this world.

**The Solid Strip Rule.** The pinned phone Back/Tie bar is a solid paper strip with a 2px ink top rule. Never a gradient fade; nothing may ghost through it.

## Shapes

Square paperwork. Radius is 2px everywhere (buttons, chips, slip, contenders); panels, tabs, bars and tables are fully square. Borders are 2px ink for objects and 1px hairline for rows. A tie is expressed by a dashed contender border. The share-card connectors are 90 degree routed lines. The rank meter uses a rotated square (diamond) dot with a translucent range band and a centre tick. The header brand mark is a small yellow slip (14 by 22px, 2px ink border). The Play arrow is a rotated border corner, drawn in CSS.

## Components

### Buttons
- **Shape:** 2px radius, 2px ink border, 46px minimum height, 8px 20px padding, Barlow Condensed 800 uppercase 1.05rem with 0.05em tracking.
- **Default:** white sheet fill, ink text. **Primary:** ink fill, paper text. **Danger:** transparent, pen border and text.
- **Hover:** default and primary fill with Canary Marker and ink text; danger fills solid pen. Active nudges 1px down. Disabled is 40% opacity.
- **Link button:** mono 0.8rem underlined Pencil Grey for quiet actions ("Don't know", reset).
- **Focus:** 3px ink outline, 3px offset (ink also inside the slip).

### Pairing slip and duel (signature)
Yellow panel, 2px ink border, with a head strip (ink-on-yellow board tag "BOARD n" in mono, condensed uppercase question) and a two-column duel. Contenders are white tiles with a large logo/initials/emoji chip (92px, 80px on phones), condensed uppercase name and optional mono native name. A result stamp (ink fill, yellow text and border, rotated -5 degrees) lands between them on pick (0.3s scale-in), showing 1-0, 0-1 or half-half. The picked contender gets a 4px outline and lifts 3px; the other drops to 32% opacity. A lean (drag) shows a 3px outline; a tie shows dashed borders. Back and Draw sit in a row beneath, Draw turning yellow when a tie is picked.

### Round strip and confidence bar
Ten square cells with 2px ink borders that fill with ink as answers land. The confidence bar is a 14px ruled trough with a yellow fill that scales in from the left; 10% ruler ticks are overlaid with a repeating gradient at 35% opacity. A mono readout and hint sit above and below. The ticks are a measuring convention, not decoration.

### Poll rows (home)
Ruled list under a 2px ink rule. Each row: yellow table-number tile (mono, "T1"-style), condensed uppercase title, grey description, a strip of 34px preview chips, mono meta line, and a "Play" action with a CSS chevron. Row hover is a 16% yellow wash.

### Tiles (chips)
Square 2px-radius tiles, inset 2px ink ring. Three kinds: logo image on white, initials in condensed display on the item colour, and emoji. Sizes 30, 34, 38, 76, 92px by context.

### Standings and live ranking
Rank rows: mono rank, chip, condensed name with mono sub-line, and a meter (hair track, centre tick, translucent range, diamond dot). The first row is a 50% yellow wash. The live ranking is a collapsible white panel with 2px ink border listing rank, chip, name, bar and percent. Tabs are a 2px-bordered segmented control; the pressed tab is ink filled.

### Head-to-head crosstable
Collapsed-border table with a 2px ink outer border, hairline cells on white, mono figures. The self cell is hatched with a 135 degree repeating hairline gradient (a crosstable convention marking "cannot play itself", not decoration). A mono key beneath explains cells.

### Banner and notice
White panel, 2px ink border, 12 to 18px padding, flex row with an action button.

### Share card (canvas, 1080 by 1350)
White sheet, yellow header band over a 6px ink rule with the poll title in condensed 92px and a mono "MY STANDINGS VS THE CROWD" line. A one-line headline names the biggest split. Two ruled columns (ME, CROWD) joined by 90 degree connectors in channels: solid ink for "I rank it higher", dashed crimson for "I rank it lower", grey for no change, with a yellow marker underlay on the biggest split. Legend in grey mono. Footer is an ink bar with a yellow mono options/matchups line and the address in white; the address is `location.host` plus the poll hash, so production shows the real domain.

### Navigation
Header strip with the brand (condensed uppercase with the yellow slip mark) left and uppercase condensed links right; hover is a 2px ink underline. Footer is a hairline-topped mono line.

## Do's and Don'ts

### Do:
- **Do** use ink for every fact and structural rule, and Canary Marker for the single thing to act on or the winner.
- **Do** set every count, rank, score and percentage in JetBrains Mono, and names and commands in uppercase Barlow Condensed 800.
- **Do** keep radius at 2px or square, with 2px ink borders on objects and 1px hairlines on rows.
- **Do** make hover on buttons a yellow fill with ink text.
- **Do** keep emoji strictly as poll content (item tiles), never as interface icons; draw interface glyphs (chevron, ticks) in CSS.
- **Do** keep the two repeating gradients: the hatched self-cell on the crosstable and the 10% ruler ticks on the confidence bar. They carry meaning.
- **Do** keep the home header as the plain brand and nav, with no label beside the title (the contract's "Wall chart" label was deliberately not built; it adds no information).
- **Do** print `location.host` in the share card footer.
- **Do** pin the phone Back/Tie bar as a solid paper strip with a 2px ink top rule.

### Don't:
- **Don't** use crimson for anything but corrections (danger buttons, the dashed lower-rank card lines).
- **Don't** add hard offset shadows; the only shadow is the soft lift under the pairing slip.
- **Don't** fade the pinned phone bar with a gradient.
- **Don't** add kickers, eyebrow labels or decorative tags beside titles.
- **Don't** use rounded white cards, soft shadows, or pill buttons; this world refuses them.
- **Don't** use gradients for decoration; the two repeating-gradient uses are the only ones allowed.
- **Don't** render the share card in the dark scheme or rely on system fonts for its text.
