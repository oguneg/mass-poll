---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: []
---

# Surface brief: whole site (home, voting, results, share card)

Scope and mode: the entire public site, Operate (the visitor completes a task: answer duels, then read a ranking). The home page is a poll chooser inside the same world, not a separate marketing page.

Audience and job: fans and friend groups settling "which is best" arguments on a phone in about two minutes, arriving from a link or screenshot. Action: answer 10 duels, see my ranking next to the crowd's, share the card. Proof: real poll content (parties, characters, toppings, languages), real confidence numbers. No invented claims.

Chosen direction: the tournament crosstable and pairing sheet (Swiss-system paperwork). Memorable moment: each answer is stamped onto the sheet as a chess-style result (1-0, 0-1, half-half) between the two options, and the standings page is a ruled crosstable with a hatched diagonal.

Unresolved: final product name (Mass Poll is a working title); whether to self-host a display face later (CSP currently allows system fonts only); privacy page copy.

## Direction contract

THESIS: The site is a tournament director's wall chart. Every duel is a board on a pairing slip, every answer is a result written into the sheet, and the ranking is the standings crosstable. It refuses the default arrangement of rounded white cards, soft shadows and blue pill buttons.

OWN-WORLD: Duplicate-paper tournament stationery. Cool white sheet ruled in hairline black, one canary-yellow carbon "pairing slip" panel for the live duel, black ink for everything that is a fact, crimson ballpoint reserved for corrections (undo, reset, errors). Monospace for board numbers, round counters, scores and labels; a heavy grotesque system stack for option names. Hatched diagonal cells in the crosstable, ruled rows, square corners with at most a 2px radius, hard offset shadows only where a slip lifts. Dark scheme is the scoreboard slate: graphite sheet, chalk-white ink, the same yellow as marker.

STORY: A first-time visitor understands in one glance that this is a head-to-head league: they see a board number, two contenders, and a result stamp. They believe the ranking because it shows its own confidence in plain numbers. They answer ten boards, open their card, and share it.

FIRST VIEWPORT: Home: a ruled header strip with the site name left and "Wall chart" label right, a plain statement line, then poll rows as numbered tables (T1, T2...) each with a preview strip of tiles, title, options/matchups/votes in mono, and a clear "Play" action on the right. Voting (mobile 390 wide): compact board strip (poll title, ten round cells filling with ink as answers land, confidence readout in mono), a yellow pairing slip headed "BOARD n" holding the two contenders as large tap targets with a centred result stamp between them, then the full-width Back and Draw bar pinned to the bottom. Primary action is tapping a contender.

FORM: tournament crosstable and pairing sheet, position 5 of my ordered list (league table, versus screen, bout poster, stadium scoreboard, crosstable, programme, sticker album); seed key bc7ead15. Raises carried in: disciplined 90 degree connector routing from the transit-map challenger on the share card; dim-everything-but-the-chosen focus from the streaming-wall challenger on the duel; the live monospace readout from the type-specimen challenger on the confidence meter.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
