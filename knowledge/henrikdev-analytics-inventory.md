# HenrikDev analytics inventory

Source: [HenrikDev OpenAPI](https://api.henrikdev.xyz/openapi.json), schema metadata 4.6.0. This is a contract inventory, not proof of field availability in every response.

| Analyst question | Essential data | Card coverage |
| --- | --- | --- |
| How did the sample go? | Queue, date, map, outcome, round margin, RR, sample size | Match table, map results, observed RR chart. Match date and act are not shown per row. |
| How did I contribute? | Agent, K/D/A, hits, damage, rounds, performance | Combat summary and match table. No role-adjusted benchmark or official hidden MMR. |
| Who did I queue with? | Party and team IDs, known outcomes, kill timestamps | Premade records, round margins, and trades per games with logs. No persistent with/without baseline or trade opportunity conversion. |
| How did our buys work? | Per-round spend, loadout, team context, side, outcome, and buy type | Round-weighted spend and loadout shown. Eco/force/full-buy conversion and equipment advantage are not implemented. |
| Which gun is effective? | Weapon kills plus usage exposure and context | Named gun kills shown. Attempts and weapon usage time are unavailable here. |
| How did we win rounds? | First bloods, side, round outcome, plant/defuse, team stats | Endpoint supplies round data. Opening-duel conversion, side splits, post-plant conversion, MVP and performance breakdowns are not yet shown. |
| Where am I progressing? | Mastery, accolades, rank prestige, act and season history | Career table and recent RR. No seasonal comparison or personal-best trend. |

Matches v4 documents a maximum of ten per response and a zero-based start offset. Stored matches use page and size. The bot intentionally reads the recent window. Longer samples require paging, match ID deduplication, and explicit date/act filters.

## Field names by analytics schema

This lists documented keys for match, RR, accolade, and mastery schemas, including nested records. A field being listed does not make it suitable for a coaching score.

- **AccoladesV1Account**: `name`, `puuid`, `tag`
- **AccoladesV1Data**: `account`, `matches`, `summary`
- **AccoladesV1Match**: `match_id`, `players`, `started_at`
- **AccoladesV1MatchMetric**: `id`, `is_act_record`, `type`, `value`
- **AccoladesV1Player**: `accolades`, `puuid`
- **AccoladesV1Season**: `accolades`, `season`
- **AccoladesV1SeasonId**: `id`, `short`
- **AccoladesV1Summary**: `all_time`, `seasons`
- **AccoladesV1SummaryMetric**: `best_value`, `count`, `id`, `type`
- **AgentIdNameCombo**: `id`, `name`
- **AgentMasteryV1Account**: `name`, `puuid`, `tag`
- **AgentMasteryV1Agent**: `agent`, `customization`, `flourish`, `modules`, `tracks`
- **AgentMasteryV1Customization**: `background`, `border`, `clip`, `hype`
- **AgentMasteryV1Data**: `account`, `agents`
- **AgentMasteryV1DetailData**: `account`, `mastery`
- **AgentMasteryV1Flourish**: `long_level`, `short_level`
- **AgentMasteryV1Module**: `id`, `name`, `stat`, `value`
- **AgentMasteryV1Reference**: `id`, `name`
- **AgentMasteryV1Track**: `id`, `level`, `name`
- **MMRHistoryV2History**: `afk_penalty`, `competitive_movement`, `date`, `elo`, `is_placement_match`, `last_change`, `map`, `match_id`, `match_length`, `new_map_incentive_rr_forgiven`, `queue_id`, `refunded_rr`, `rr`, `rr_before_update`, `rr_penalty`, `rr_performance_bonus`, `season`, `tier`, `tier_before_update`, `was_derank_protected`, `was_derank_protection_replenished`
- **MMRV3Account**: `name`, `puuid`, `tag`
- **MMRV3Current**: `elo`, `games_needed_for_leaderboard`, `games_needed_for_rating`, `is_at_rank_protected_tier`, `last_change`, `leaderboard_placement`, `rank_protection_shields`, `rank_protection_status`, `rr`, `tier`
- **MMRV3Data**: `account`, `current`, `latest_update`, `lifetime_prestige`, `peak`, `ranked_state`, `seasonal`
- **MMRV3LeaderboardPlacement**: `rank`, `updated_at`
- **MMRV3LifetimePrestige**: `count`
- **MMRV3Peak**: `ranking_schema`, `rr`, `season`, `tier`
- **MMRV3RankedState**: `is_act_rank_badge_hidden`, `is_leaderboard_anonymized`
- **MMRV3Seasonal**: `act_rank`, `act_wins`, `end_rr`, `end_tier`, `games`, `games_needed_for_rating`, `leaderboard_placement`, `prestige`, `ranking_schema`, `season`, `wins`, `wins_with_placements`
- **MMRV3SeasonalPrestige**: `delta`, `total`
- **MapIdNameCombo**: `id`, `name`
- **MatchesV4Data**: `coaches`, `kills`, `metadata`, `observers`, `players`, `rounds`, `teams`
- **MatchesV4DataCoach**: `puuid`, `team_id`
- **MatchesV4DataKill**: `assistants`, `killer`, `location`, `player_locations`, `round`, `secondary_fire_mode`, `time_in_match_in_ms`, `time_in_round_in_ms`, `victim`, `weapon`
- **MatchesV4DataMetadata**: `cluster`, `game_length_in_ms`, `game_version`, `is_completed`, `map`, `match_id`, `mvp`, `party_rr_penaltys`, `platform`, `premier`, `queue`, `region`, `season`, `started_at`
- **MatchesV4DataMetadataPartyRRPenalty**: `party_id`, `penalty`
- **MatchesV4DataMetadataQueue**: `id`, `mode_type`, `name`
- **MatchesV4DataObserver**: `account_level`, `card_id`, `name`, `party_id`, `puuid`, `session_playtime_in_ms`, `tag`, `title_id`
- **MatchesV4DataPlayer**: `ability_casts`, `account_level`, `agent`, `behavior`, `customization`, `drafted_ability_casts`, `economy`, `name`, `party_id`, `performance`, `platform`, `puuid`, `session_playtime_in_ms`, `stats`, `tag`, `team_id`, `team_number`, `tier`
- **MatchesV4DataPlayerAbilityCasts**: `ability1`, `ability2`, `grenade`, `ultimate`
- **MatchesV4DataPlayerBehavior**: `afk_rounds`, `friendly_fire`, `rounds_in_spawn`
- **MatchesV4DataPlayerBehaviorFriendlyFire**: `incoming`, `outgoing`
- **MatchesV4DataPlayerBloomline**: `clip_id`, `hype_id`, `level`, `plank_background_id`
- **MatchesV4DataPlayerCustomization**: `bloomline`, `card`, `preferred_level_border`, `title`
- **MatchesV4DataPlayerDraftedAbility**: `id`, `name`
- **MatchesV4DataPlayerDraftedAbilityCast**: `ability`, `branch`, `casts`, `level`, `slot`
- **MatchesV4DataPlayerEconomy**: `loadout_value`, `spent`
- **MatchesV4DataPlayerEconomyLoadoutValue**: `average`, `overall`
- **MatchesV4DataPlayerEconomySpent**: `average`, `overall`
- **MatchesV4DataPlayerPerformance**: `breakdown`, `ratings`, `score`
- **MatchesV4DataPlayerPerformanceBreakdown**: `adjusted_deaths`, `adjusted_kills`, `assists`, `damage`, `defuses`, `plants`, `trades`, `utility_usage`
- **MatchesV4DataPlayerPerformanceCombatRatings**: `damage`, `death_impact`, `kill_impact`, `trades`
- **MatchesV4DataPlayerPerformanceRatings**: `combat`, `grade`, `utility`
- **MatchesV4DataPlayerPerformanceUtilityRatings**: `assists`, `defuses`, `plants`, `utility_usage`
- **MatchesV4DataPlayerStats**: `assists`, `bodyshots`, `damage`, `deaths`, `headshots`, `kills`, `legshots`, `score`
- **MatchesV4DataPlayerStatsDamage**: `dealt`, `received`
- **MatchesV4DataRound**: `ceremony`, `ceremony_player`, `ceremony_team`, `defuse`, `first_blood`, `id`, `plant`, `result`, `stats`, `winning_team`, `winning_team_role`
- **MatchesV4DataRoundDefuse**: `location`, `player`, `player_locations`, `round_time_in_ms`
- **MatchesV4DataRoundLocation**: `x`, `y`
- **MatchesV4DataRoundPlant**: `location`, `player`, `player_locations`, `round_time_in_ms`, `site`
- **MatchesV4DataRoundPlayer**: `name`, `puuid`, `tag`, `team`
- **MatchesV4DataRoundPlayerLocations**: `location`, `player`, `view_radians`
- **MatchesV4DataRoundPlayerStats**: `ability_casts`, `damage_events`, `economy`, `player`, `received_penalty`, `stats`, `stayed_in_spawn`, `was_afk`
- **MatchesV4DataRoundPlayerStatsAbilityCasts**: `ability_1`, `ability_2`, `grenade`, `ultimate`
- **MatchesV4DataRoundPlayerStatsDamageEvents**: `bodyshots`, `damage`, `headshots`, `legshots`, `player`
- **MatchesV4DataRoundPlayerStatsEconomy**: `armor`, `loadout_value`, `remaining`, `weapon`
- **MatchesV4DataRoundPlayerStatsEconomyArmor**: `id`, `name`
- **MatchesV4DataRoundPlayerStatsEconomyWeapon**: `id`, `name`, `type`
- **MatchesV4DataRoundPlayerStatsStats**: `bodyshots`, `headshots`, `kills`, `legshots`, `score`
- **MatchesV4DataTeam**: `health`, `mvp`, `placement`, `premier_roster`, `rounds`, `team_id`, `team_number`, `won`
- **MatchesV4DataTeamHealth**: `remaining`, `starting`
- **MatchesV4DataTeamPremierRoster**: `customization`, `id`, `members`, `name`, `tag`
- **MatchesV4DataTeamPremierRosterCustomization**: `icon`, `image`, `primary_color`, `secondary_color`, `tertiary_color`
- **MatchesV4DataTeamRounds**: `lost`, `won`
- **SeasonIdShortCombo**: `id`, `short`
- **TierIdNameCombo**: `id`, `name`

## Documented endpoint catalog

- `/public/v1/premium/webhook`
- `/public/v1/premium/webhook/users`
- `/public/v1/premium/webhook/users/{id}`
- `/valorant/v1/accolades/{affinity}/{platform}/{name}/{tag}`
- `/valorant/v1/account/{name}/{tag}`
- `/valorant/v1/agent-mastery/{affinity}/{platform}/{name}/{tag}`
- `/valorant/v1/agent-mastery/{affinity}/{platform}/{name}/{tag}/{agent_id}`
- `/valorant/v1/by-puuid/accolades/{affinity}/{platform}/{puuid}`
- `/valorant/v1/by-puuid/account/{puuid}`
- `/valorant/v1/by-puuid/agent-mastery/{affinity}/{platform}/{puuid}`
- `/valorant/v1/by-puuid/agent-mastery/{affinity}/{platform}/{puuid}/{agent_id}`
- `/valorant/v1/by-puuid/mmr-history/{affinity}/{puuid}`
- `/valorant/v1/by-puuid/mmr/{affinity}/{puuid}`
- `/valorant/v1/by-puuid/stored-matches/{affinity}/{puuid}`
- `/valorant/v1/by-puuid/stored-mmr-history/{affinity}/{puuid}`
- `/valorant/v1/content`
- `/valorant/v1/crosshair/generate`
- `/valorant/v1/esports/schedule`
- `/valorant/v1/leaderboard/{affinity}`
- `/valorant/v1/mmr-history/{affinity}/{name}/{tag}`
- `/valorant/v1/mmr/{affinity}/{name}/{tag}`
- `/valorant/v1/premier/leaderboard/{affinity}`
- `/valorant/v1/premier/search`
- `/valorant/v1/premier/{id}`
- `/valorant/v1/premier/{id}/history`
- `/valorant/v1/premier/{name}/{tag}`
- `/valorant/v1/premier/{name}/{tag}/history`
- `/valorant/v1/queue-status/{affinity}`
- `/valorant/v1/raw`
- `/valorant/v1/status/{affinity}`
- `/valorant/v1/stored-matches/{affinity}/{name}/{tag}`
- `/valorant/v1/stored-mmr-history/{affinity}/{name}/{tag}`
- `/valorant/v1/version/{affinity}`
- `/valorant/v1/website/{country_code}`
- `/valorant/v1/website/{country_code}/{db_id}`
- `/valorant/v2/account/{name}/{tag}`
- `/valorant/v2/by-puuid/account/{puuid}`
- `/valorant/v2/by-puuid/mmr-history/{affinity}/{platform}/{puuid}`
- `/valorant/v2/by-puuid/mmr/{affinity}/{puuid}`
- `/valorant/v2/by-puuid/stored-mmr-history/{affinity}/{platform}/{puuid}`
- `/valorant/v2/esports/vlr/events`
- `/valorant/v2/esports/vlr/events/{event_id}/matches`
- `/valorant/v2/esports/vlr/matches/{match_id}`
- `/valorant/v2/esports/vlr/players/{player_id}`
- `/valorant/v2/esports/vlr/players/{player}/matches`
- `/valorant/v2/esports/vlr/teams/{team_id}`
- `/valorant/v2/esports/vlr/teams/{team_id}/matches`
- `/valorant/v2/esports/vlr/teams/{team_id}/transactions`
- `/valorant/v2/leaderboard/{affinity}`
- `/valorant/v2/match/{match_id}`
- `/valorant/v2/mmr-history/{affinity}/{platform}/{name}/{tag}`
- `/valorant/v2/mmr/{affinity}/{name}/{tag}`
- `/valorant/v2/premier/players/{affinity}/{name}/{tag}`
- `/valorant/v2/premier/players/{affinity}/{puuid}`
- `/valorant/v2/premier/teams/{affinity}/{id}`
- `/valorant/v2/premier/teams/{affinity}/{name}/{tag}`
- `/valorant/v2/stored-mmr-history/{affinity}/{platform}/{name}/{tag}`
- `/valorant/v3/by-puuid/matches/{affinity}/{puuid}`
- `/valorant/v3/by-puuid/mmr/{affinity}/{platform}/{puuid}`
- `/valorant/v3/leaderboard/{affinity}/{platform}`
- `/valorant/v3/matches/{affinity}/{name}/{tag}`
- `/valorant/v3/mmr/{affinity}/{platform}/{name}/{tag}`
- `/valorant/v4/by-puuid/matches/{affinity}/{platform}/{puuid}`
- `/valorant/v4/match/{affinity}/{match_id}`
- `/valorant/v4/matches/{affinity}/{platform}/{name}/{tag}`
- `/valorant/{version}/store-featured`
- `/valorant/{version}/store-offers`

## Current card update

The card now explains purchases and equipment value in plain English. It also has a round outcomes table with observed attack/defense records and records after either team got the first kill, where round data is available. Unknown rows are excluded from the relevant denominator. A round can contribute to both a side split and an opening-kill split. These are outcome splits rather than causal estimates. For deeper scouting, compare team buy types, post-plant situations, agent roles, and opponent strength before drawing conclusions.

## November 22 coverage check

Riot's game-update index still listed 13.10. Compared with the in-game reference, the report supports recent match scores and RR, rank legacy, mastery levels, and now accolades from the act matching the latest timestamped match. Act selection joins by season ID. A missing season record yields no act section. Official map grades, calibration, act border progress, and replay bookmarks are still client-side gaps for this bot.

The new comparison uses two non-overlapping five-match blocks within the latest observed act. It matches map, agent, and side and requires at least ten known rounds on each side of a comparison. This version does not store a training baseline across lookups. Tracker.gg-style rank-relative benchmarks and Aimlabs tapping, tracking, and switching task results are outside current coverage.

## Rank Rating comparisons

The report matches RR updates to known win/loss outcomes by match ID. The table shows the number of games, average RR, and observed range for wins and losses in the same act. When the latest match has a game version, the table uses that exact version. It excludes known placements and explicit non-Competitive updates. New saved match records retain the API game version when present.

[Riot's Rank Rating explanation](https://playvalorant.com/en-us/news/dev/ask-valorant-rank-rating-edition/) describes hidden MMR and visible RR as separate values. Estimating an Elo constant from the same RR changes and inverting the equation cannot independently verify opponent strength. The report therefore shows observed RR directly. An opponent model would need a connected set of match rosters, a separate validation target, and error measured on later matches.
