# Product

<!-- impeccable:product-schema 1 -->

<!-- Inferred from the working session, not from an interview: the owner said "do your magic" and told the run to proceed. Facts below come from the code and the conversation; anything marked (open) is undecided. -->

## Platform

web

## Stack

Plain Node server with built-in SQLite, vanilla JS front end, no build step and no npm dependencies. Deployed as one Docker container behind a shared Caddy proxy at https://poll.ogun.se, auto-deployed from GitHub on push to main.

## Users

Fans and friend groups settling "which is best?" arguments: favourite party, character, topping, language. They arrive from a shared link or a screenshot, mostly on a phone, with a couple of minutes and no account. A second audience is the owner, who curates polls in `polls/*.json` and watches results.

## Product Purpose

Replace the one-pick poll (and the knockout bracket, whose early rounds and unlucky draws crown a weak finalist) with a league: each voter answers a run of quick head-to-head duels, and a Bradley-Terry model turns all answers into a ranking with honest uncertainty. Success is a voter finishing 10 duels (their votes then count), seeing their own ranking next to the crowd's, and sharing the card.

## Positioning

The result states how sure it is. Rankings come with confidence intervals, "too close to call", and a live per-voter confidence meter, not a falsely precise winner. A knockout or star-rating poll cannot truthfully say that.

## Operating Context

Core loop: pick between two options (tap, swipe, or arrow keys), tie, "don't know", undo. After 10 answers: the Your card tab (my ranking vs the crowd, side by side, as a downloadable image), Everyone tab (ranking with intervals, head-to-head matrix, rock-paper-scissors cycles), You tab. A live confidence meter and a live "your ranking so far" table run while voting. Polls live in `polls/*.json` with optional logo images.

## Capabilities and Constraints

- Anonymous voters (cookie), 10-answer baseline before votes count toward the crowd ranking, per-poll "Reset my votes".
- Large lists are expected (up to 128 options): a settled personal ranking takes ~n·log2(n) answers, so the crowd ranking is the product for big lists.
- Mobile first: swipe voting, sticky tie/back bar, 44px touch targets.
- No third-party scripts, fonts, or frames (strict content-security policy: same-origin only). Any typeface must be self-hosted or a system stack.
- Image rights: only public-domain or owner-supplied images. Party logos for S and MP are not freely licensed (colour tiles instead); show-character art is copyrighted (colour tiles).
- (open) Final product name. Working title "Mass Poll"; candidates pollfreak.com, pollmania (non-.com).
- (open) Privacy page contact details.

## Brand Commitments

None confirmed beyond the working name "Mass Poll" and the domain poll.ogun.se.

## Evidence on Hand

Four live polls (Sweden's eight parties, Breaking Bad & Better Call Saul, pizza toppings, programming languages). No real vote data yet at launch; no testimonials, customers, or benchmarks exist and none may be invented.

## Product Principles

1. Honesty about uncertainty is the feature: never show a precise-looking number the data does not support.
2. Zero friction: no account, no setup, answerable in two taps, recoverable (undo, reset).
3. The voter's own result is the reward; the crowd is the context.
4. The shared screenshot is the distribution channel, so the card must stand alone.
5. Content stays neutral: the interface may have attitude, but never takes a side on what is being ranked, parties included.

## Accessibility & Inclusion

Colour is never the only signal (labels and numbers accompany every colour). Respect prefers-reduced-motion and prefers-color-scheme. Keyboard operable (arrow keys, Backspace undo). Touch targets at least 44px.
