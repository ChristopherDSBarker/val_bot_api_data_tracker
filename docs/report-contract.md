# Ranked Report + Automatic Coach contract

Status: candidate for freeze. Local payload checks are in place. Desktop and mobile Discord checks remain open.

Run `/valorant-profile` with a Riot name, tag, and optional region. The report uses one Discord reply. Previous and Next edit that reply when more than one page is needed. Multi-page reports are stored locally for seven days, so navigation can survive a restart. A single page has no buttons. The report sends no attachments.

## Reading order and units

| Section | What it answers |
| --- | --- |
| At a glance, Competitive Snapshot, Combat | Current rank, visible Rank Rating (RR), known match results, kills/deaths/assists, headshots per recorded hit, and damage per round. Zero deaths are shown as words instead of an infinite ratio. |
| Coach and Latest Session | One replay question from the latest completed match with a known result. Personal first kills are separate from team round wins after the first kill. Session results show the number of matches with linked RR. |
| Career | Rank Legacy counts, agent mastery levels, accolade counts, and Act accolades matched by ID. The career tables continue without hiding later categories. |
| Competitive Maps | Match wins and known match counts, average Performance Score and its sample, and attack/defense rounds won. Recent map results are separate from Riot Map Rating. |
| Sample Leaders and Economy | Observed records by agent, role and party, weapon kills, credits paid, gear value, and spending ratios with sample counts. |
| Round Outcomes and Recent Comparison | Rounds won after each team got the first kill and by side. The comparison leads with the largest change scaled to the newer round volume. It shows contributing matches separately from round counts. |
| Recent Competitive and RR | Results, scores, and match stats are linked by row number. RR shows the observed updates and a same-act split by match win/loss when available. Opponent context uses reported visible ranks. |
| Latest Match Teammates, Queue Groups and Saved Act | Latest roster, deduplicated recent party groups, repeat verified non-party teammates, and saved results with or without a partner. W/G means wins/games. Round margin is rounds won minus rounds lost per game. Trades are counts across logged matches. |
| Account details | Account level, region, peak season and placement or leaderboard context when known. |

## Evidence gates

- Role leaders need two roles with at least three known results each. The baseline is the player's recent known match record. Single-map role samples are labeled.
- A role-specific replay cue needs ten round openings with known team outcomes. Comparing the player's latest opening share uses ten known openings in the latest match and at least ten across two earlier matches in the same act and role.
- Session recap needs two dated matches and uses a 90-minute gap. Missing duration means the gap uses start times. RR is reported only for linked matches.
- Recent comparison uses two blocks of five from one act. A row needs ten recorded rounds in each block. Prefer map, agent and side, then role and side. Only changed rows appear, and personal opening comparisons are limited to Duelist with ten known openers per block and at least one first kill. Recorded overtime counts.
- A map needs five known results to qualify for the best-by-win-rate line. Saved party comparisons need five with and ten verified without. A visible-opponent-rank row needs forty eligible games in its group and five reported opponent ranks per game.
- Economy ratios use matched inputs. A zero spending denominator is unavailable. Missing data is displayed as a dash or described as unavailable.

## Failure behavior and limits

The profile can use v3 matches and v1 RR history when newer routes are unavailable. Independent results can still support a partial card. When every useful surface is missing, the bot returns one Profile Unavailable reply. Mock mode needs Discord credentials to connect to Discord, but uses no HenrikDev key. Cached API responses can be used within their cache lifetime. A rate limit can leave sections unavailable when no usable cache entry exists.

QA checks a budget of 5,500 characters per message page, 25 fields per embed, 256 characters per field name, and 1,024 per field value. Tables target 42 monospace columns or fewer for representative samples. Wide characters count as two columns in the renderer. Width tests check payload text; Discord controls actual font and viewport layout.

Run `npm test` including the consumer fixtures and text snapshots. To accept an intentional report change, review the rendered differences and run `UPDATE_REPORT_SNAPSHOTS=1 node --test tests/reportQa.test.js`. Normal test runs never rewrite snapshots.

## Before tagging a release

1. Run `npm ci` and `npm test` in a clean checkout on Node.js 22.
2. In a test server, restart the bot and verify the only command accepts name, tag and region. Run a mock lookup and a live lookup.
3. On desktop and mobile, check the report header, comparison and party sections. For a multi-page report, confirm Previous and Next update the same message before and after a restart.
4. Record the result and any exceptions here before freezing the report. Keep separate checks for coaching changes. Passing a snapshot does not verify actual Discord rendering or player adoption.

## Evidence for coaching decisions

| Player question | Use now | Evidence still needed |
| --- | --- | --- |
| Who do I play with most effectively? | Results by confirmed party lineup. Individual trades and kills/deaths are scoped to that lineup. One-game lineups show names without individual aggregates. | Larger comparable samples by act, role, map, and lineup. Team and opponent differences can explain apparent synergy. |
| What should I review on this role? | One role-specific replay question backed by round counts and same-role comparisons. | Repeated observations across games before prescribing a change. |
| Which buy or weapon should I choose? | Observed purchases, gear value, and recorded weapon kills. | Match the actual team and opponent loadout by round, then compare wins in similar buy situations. Gun kills need exposure data to measure efficiency. |
| How strong was the lobby? | Reported visible ranks and linked RR. | Riot's hidden MMR and exact ranking calculation are unavailable. Visible-rank comparisons are descriptive. |
| Is my aim improving? | Headshot share among recorded hits. | A repeatable aim benchmark or shot attempts with misses. |

[Riot’s ranked explanation](https://playvalorant.com/en-us/news/dev/ask-valorant-rank-rating-edition/) distinguishes visible rank from hidden MMR. [HenrikDev’s schema](https://api.henrikdev.xyz/openapi.json) defines the match inputs. [Aimlabs’ benchmark routine](https://aimlabs.com/articles/aimlabs/how-to-build-an-aim-training-routine-from-your-aimlabs-benchmarks/) is a useful example of choosing one skill, practicing it, and retesting. Keep report fields tied to a decision that can be supported by the measured data.

## Internal review: observed, derived, and inferred

Players should see what happened, the counts behind a comparison, and a replay question. Keep this classification in the project documentation rather than adding it to each card.

| Classification | Examples | Display rule |
| --- | --- | --- |
| Reported by the API | Visible rank and RR changes, scores, agent, kill events, party IDs, equipment costs | Show the value when present. Leave missing values unavailable. |
| Calculated from reported records | Win percentages, matching-round counts, averages, lineup groupings, and kill-event trades defined by a five-second window | Show the relevant unit or denominator. Keep the window and coverage where they change how to read the number. |
| Model-dependent or unknown | Hidden MMR, lobby strength from RR changes, teammate causal impact, buy effectiveness from spend alone, mechanical aim diagnosis | Keep these out of the card. Record the assumption and what evidence would be required before adding a model. |
| Coaching prompt | A role-based replay question or a check after the first kill | Phrase it as something to examine. The card cannot infer the player’s intent, team assignment, or why a round was lost. |

The round-equivalent change in the comparison measures the difference from applying the earlier win rate to the latest round count. Treat it internally as a descriptive reference calculation, never as rounds caused or prevented by one player.
