# VALORANT 13.10 and Discord analytics

Reviewed November 21, 2026. Riot's [game update index](https://playvalorant.com/en-gb/news/game-updates/) lists 13.10 as the latest patch.

| Riot 13.10 changes | Implication for the profile |
| --- | --- |
| Replay bookmarks on PC and console are visible to the player who made them. | The bot has no replay bookmark source. |
| Cypher, Killjoy and Vyse cooldown adjustments, plus Sage healing targeting changes. | Use recorded outcomes and agent names from match records. |
| Damage and healing assist rules first changed in 13.08 and are explained in 13.10. | Use reported assists and Performance Score. Historical comparisons across patches can reflect rule changes. |
| Gauntlet: Glitched adds larger parties, drafts, abilities, glitches and balance changes. | Competitive summaries use Competitive matches. A Gauntlet report would need its own mode and metrics. |
| Agent abilities, killfeed/assist behavior, map collision and utility fixes, and PC/console bug fixes. | These explain changes in gameplay. The profile does not infer mechanics from aggregate statistics. |

[Riot's complete patch notes](https://playvalorant.com/en-gb/news/game-updates/valorant-patch-notes-13-10/) list the individual changes. [Patch 13.08](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-13-08/) describes Riot's private, recency-weighted Map Rating. Its published inputs include overall win rate, attacker and defender win rates, and Performance Score. The bot reports recent map samples with denominators.

| HenrikDev source | Delivered or available |
| --- | --- |
| Account v1 and MMR v3 | Current rank, RR, career peak, rank legacy and account details. |
| MMR history v2 with v1 fallback | Observed RR bars, net RR over displayed updates, and match-linked change and performance bonus when present. Other documented fields include penalties, placement and rank protection. |
| Matches v4 with v3 fallback | Recent record, match rows, performance scores, map samples and latest shown match teammates. Teams are matched by team ID, with v3 team label support. The compact view shows teammate agents and K/D/A. It does not infer friends or party relationships. |
| Accolades v1 and Mastery v1 | All-time accolade counts and top mastery levels. Per-match accolades, seasonal detail, and single-agent stat modules are available for a future detail view. |
| Premier v2, leaderboards, content, status, and esports | Separate products from a Competitive player report. The profile does not fetch them. |

[HenrikDev schema](https://api.henrikdev.xyz/openapi.json) and [beta release notes](https://docs.henrikdev.xyz/valorant/changes/v4.10.0.md). Use the endpoint schemas individually. The API metadata version differs from the changelog.

## Ranking and evaluation

[Riot's rank explanation](https://playvalorant.com/en-us/news/dev/ask-valorant-rank-rating-edition/) describes hidden matchmaking rating and visible RR as separate values. Public explanations do not provide the weights or latent inputs needed to reproduce the system. Display observed RR with its sample and source. Even API fields called ELO may be derived from visible rank and RR. Do not fit a hidden rating to the last ten games.

The CS330 Day 9 Evaluation Workshop recommends a simple baseline, measuring variation, and checking stability. For a future RR forecast, use prior same-act matches to predict later matches, compare with a simple baseline, and report errors on held-out periods. Never use post-match performance as a pre-match input. This is a forecasting task for visible RR.

AI prompt for future updates: “Review all official patch notes and the current HenrikDev schema. Map each requested feature to supplied fields, a derived statistic with a sample size, or an unavailable input. Verify the normal slash command using live data and check legacy payloads before claiming parity.”
