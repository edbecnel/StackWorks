# StackWorks Bot-Driven Premium Strategy

## Product plan for stackworks.games

## Goal

Use strong bots, training tools, and organizer features to make StackWorks worth paying for without trying to match Chess.com feature-for-feature.

---

# 1) Current StackWorks game catalog

StackWorks currently supports:

- Lasca Classic (7x7 board)
- Lasca 8x8
- Dama Classic
- Dama International
- Checkers (US)
- Damasca Classic
- Damasca International
- Classic Chess
- Columns Chess

These should be treated as 3 related game families:

## A. Draughts family

- Checkers (US)
- Dama Classic
- Dama International

## B. Stacking family

- Lasca Classic (7x7)
- Lasca 8x8
- Damasca Classic
- Damasca International

## C. Chess family

- Classic Chess
- Columns Chess

This family structure is a major advantage because AI, training, and UI systems can be reused across related games instead of being built from scratch 9 separate times.

---

# 2) Core product thesis

Do NOT position StackWorks as:

- "a smaller Chess.com"
- "just another chess site"
- "a site with some bots"

Position StackWorks as:

- a strategy-variants platform
- the home of Columns Chess
- the home of strong bots and coaching for stacking and hybrid games
- a place where players can train across related game families

Primary value proposition:

- Play games you cannot play elsewhere
- Train against bots built specifically for those games
- Improve using hints, replay, and coach tools
- Organize leagues, classes, and tournaments around them

---

# 3) Premium strategy in one sentence

Free users should be able to play and enjoy StackWorks.
Paid users should get deeper AI, stronger training tools, and better organizing power.

---

# 4) Business model recommendation

Use 3 monetization layers:

## Layer 1: Free Core

Purpose:

- growth
- discovery
- onboarding
- retention
- enough value for players to invite others

## Layer 2: Premium AI / Training

Purpose:

- monetize players who want stronger bots and game-improvement tools
- especially effective for Columns Chess, Lasca, Damasca, and other unique variants

## Layer 3: Organizer / Club Premium

Purpose:

- monetize schools, clubs, communities, and tournament hosts
- one paying organizer can create value for many free players

Optional later:

## Layer 4: Supporter

Purpose:

- monetization from loyal players who mainly want to support development
- low engineering cost

---

# 5) Recommended tiers

## Tier A: Free

Free tier must feel generous enough that people stay and invite others.

### Free features

- Create account
- Casual online play
- Local play / pass-and-play where supported
- Matchmaking or challenge a friend
- Limited basic bots
- Access to all supported games
- Basic rating or progression
- Basic move history and replay
- Limited daily hints or game reviews
- Join leagues/tournaments created by organizers
- Basic profile and achievements

### Why this matters

If free play feels cramped, users will leave before premium matters.

---

## Tier B: Premium AI

This is the main individual paid tier.

### Premium AI features

- Stronger bots across supported games
- More bot personalities/styles
- Unlimited bot games
- Unlimited hints
- "Retry from this move"
- "What would the bot play here?"
- Post-game review
- Move quality tags (basic version)
- Saved annotated replays
- Training scenarios / challenge ladders
- Cross-game mastery progress
- Ad-free
- Early access to new bot personalities and training modes

### Premium promise

"Improve faster across all StackWorks strategy games."

### Important note

Do not sell Premium AI as only "harder bots."
Sell it as:

- training
- coaching
- replay review
- guided practice
- progression

---

## Tier C: Organizer Premium

This is the best second paid tier because it creates multiplayer value without requiring every player to subscribe.

### Organizer features

- Create private clubs
- Create leagues and tournaments
- Advanced tournament settings
- Round-robin / Swiss / ladder / custom formats later
- Manage seasons and standings
- Classroom/school tools
- Invite links and group administration
- Export results / standings / game records
- Club-only rooms and events
- Assign bot practice to members later
- Ad-free organizer dashboard

### Premium promise

"Run your club, class, or tournament on StackWorks."

### Key design rule

One organizer pays, many players can join for free.

This is important because it lowers the friction to community growth.

---

## Tier D: Supporter (optional later)

Low engineering cost tier.

### Supporter features

- Ad-free
- Supporter badge
- Profile flair
- Exclusive themes / boards / pieces
- Color packs / visual customization
- Early access voting for next game or feature
- Public recognition on profile

### Premium promise

"Support the growth of StackWorks."

---

# 6) What NOT to do

Do NOT:

- build huge lesson libraries for every game
- try to match Chess.com analysis depth across all games
- put ordinary room creation behind paywall
- make every player subscribe to join events
- build superhuman bots for everything before launching
- create too many paid tiers at launch

Avoid:

- feature sprawl
- deep content production burden
- premium promises that require constant manual content creation

---

# 7) Bot strategy

Bots are not just a feature.
For StackWorks, bots serve 5 jobs:

1. Onboarding

- players can learn a game immediately

2. Retention

- players can always find an opponent, even when traffic is low

3. Monetization

- stronger bots and coach tools become premium value

4. Differentiation

- Columns Chess / Lasca / Damasca bots are unique to StackWorks

5. Community support

- teachers and organizers can use bots for drills and practice

---

# 8) Reusable bot architecture

Do NOT build 9 disconnected AI systems.

Build a shared architecture with game adapters.

## Shared bot core

- board state interface
- move generation interface
- search framework
- evaluation framework
- difficulty controls
- opening/randomization hooks
- personality/style hooks
- time control hooks
- hint/review integration hooks

## Per-game adapter layer

Each game supplies:

- rules
- legal move generation
- terminal state logic
- evaluation features
- notation/replay specifics
- game-specific tactical motifs

## Why this matters

This makes the platform scalable for one developer.
Most of the investment goes into reusable infrastructure.

---

# 9) Family-based AI roadmap

## Family 1: Chess family

- Classic Chess
- Columns Chess

### Priority

Columns Chess first.
Classic Chess is useful, but Columns Chess is the real differentiator.

### Shared engine opportunities

- square board representation
- turn structure
- move notation concepts
- search framework
- tactical pattern detection
- coach/review UI

### Columns Chess-specific premium hooks

- stack-aware bot personalities
- capture-chain training
- "best stack-preserving move"
- "liberated stack consequences"
- scenario trainer based on stack transitions

---

## Family 2: Stacking family

- Lasca Classic (7x7)
- Lasca 8x8
- Damasca Classic
- Damasca International

### Priority

Second highest priority after Columns Chess.

### Why

These games are rare, distinctive, and well-suited for StackWorks identity.

### Shared engine opportunities

- stacked-piece representation
- top-piece movement
- under-stack handling
- capture sequence logic
- promotion/officer handling
- stack evaluation heuristics

### Premium hooks

- "stack danger" warnings
- training on safe capture sequences
- review of missed stack-building opportunities
- officer endgame trainer
- family mastery challenges

---

## Family 3: Draughts family

- Checkers (US)
- Dama Classic
- Dama International

### Priority

Third priority.

### Why

Familiar games can bring in a wider audience, but they are less unique than Columns Chess / Lasca / Damasca.

### Shared engine opportunities

- diagonal movement logic
- multi-capture logic
- promotion logic
- mobility and tempo heuristics
- endgame database later

### Premium hooks

- tactical puzzle trainer
- endgame sparring
- "forced capture" drill mode
- positional review

---

# 10) Exact Free vs Premium feature matrix

## Bots

Free:

- 2 or 3 bots per family
- beginner/intermediate
- limited rematch history

Premium AI:

- full bot roster
- stronger search depth
- more personalities
- unlimited bot games
- challenge ladders
- custom bot settings later

## Hints

Free:

- limited daily hints
- basic "legal moves" guidance

Premium AI:

- unlimited hints
- best move suggestion
- alternate move explanation later
- retry from position
- guided practice mode

## Post-game review

Free:

- simple result summary
- major blunder markers only
- limited reviews per day

Premium AI:

- unlimited reviews
- move quality labels
- turning point detection
- missed tactic alerts
- family-specific insights

## Replay and studies

Free:

- basic replay
- limited saved games

Premium AI:

- unlimited saved replays
- annotations
- bookmarks
- shareable study links later

## Tournaments / clubs

Free:

- join events
- view standings
- join club rooms

Organizer Premium:

- create clubs
- create leagues/tournaments
- manage schedules/rounds
- private events
- exports
- school/class management

## Cosmetics / ad-free

Free:

- basic theme
- standard profile visuals

Supporter or Premium AI:

- ad-free
- premium themes
- profile flair
- supporter badge

---

# 11) Recommended launch order

## Phase 0: Foundation

Goal:
Create reusable systems before premium polish.

### Deliverables

- unified account/profile model
- game family registry
- shared replay format
- shared bot interface
- shared rating/progression scaffolding
- feature flag system
- premium entitlement system
- analytics hooks

### Copilot tasks

- define GameFamily enum
- define GameId registry
- define BotProvider interface
- define ReviewProvider interface
- define PremiumFeature flags
- define entitlement checks in UI and server
- define shared replay serialization

---

## Phase 1: Free core that is worth using

Goal:
Make StackWorks fun before monetization pressure.

### Deliverables

- free casual play
- challenge a friend
- basic profiles
- ratings/progression
- basic bots for all or most games
- replay viewer
- limited daily hints/review
- basic achievements

### Success condition

A new user can sign up, play a game, try a bot, and want to come back.

### Copilot tasks

- implement shared bot difficulty enum
- build replay viewer shell
- add limited hint quota
- add basic move tagging pipeline
- add profile stats page

---

## Phase 2: Columns Chess premium AI

Goal:
Launch the strongest and most distinctive premium value first.

### Deliverables

- stronger Columns Chess bot
- multiple Columns Chess bot personalities
- unlimited bot matches for premium
- unlimited hints for premium
- retry-from-position
- post-game review for Columns Chess
- challenge ladder for Columns Chess

### Why first

Columns Chess is the clearest differentiator versus Chess.com and other platforms.

### Copilot tasks

- build Columns Chess evaluation heuristics
- add stack-aware search extensions
- implement premium hint flow
- implement retry-from-move UI
- add post-game review annotations
- add Columns Chess bot personalities:
  - Aggressive
  - Positional
  - Materialist
  - Trap Hunter
  - Teaching Bot

---

## Phase 3: Organizer premium

Goal:
Make StackWorks useful for communities and schools.

### Deliverables

- club creation
- league/tournament creation
- standings tables
- event invites
- admin dashboards
- classroom/school basics
- free players can join organizer-created events

### Why now

This creates revenue without requiring large AI content expansion.

### Copilot tasks

- implement club model
- implement tournament model
- implement standings calculator
- implement invite codes/links
- implement organizer permissions
- implement export CSV/JSON

---

## Phase 4: Stacking family premium AI

Goal:
Turn Lasca/Damasca into a signature StackWorks ecosystem.

### Deliverables

- shared stacking engine core
- stronger bots for Lasca Classic / 8x8
- stronger bots for Damasca Classic / International
- family-specific coach/review language
- stack danger / capture-sequence insights
- stacking family challenge ladders

### Copilot tasks

- define stacked-piece board abstraction
- define move generator for stacked games
- implement stack evaluation features
- implement family-specific review annotations
- add stacking challenge ladder mode

---

## Phase 5: Draughts family premium AI

Goal:
Broaden premium value using shared logic and more familiar titles.

### Deliverables

- improved bots for Checkers / Dama variants
- puzzle/drill modes
- multi-capture trainer
- endgame trainer later
- family review tools

### Copilot tasks

- shared draughts move-generation module
- multi-capture line evaluator
- tactical drill generator
- endgame review hooks

---

## Phase 6: Supporter polish and cross-game mastery

Goal:
Increase retention and monetization with lower-cost features.

### Deliverables

- supporter badge
- ad-free
- themes/board skins
- cross-game mastery profile
- seasonal ladders
- daily AI challenges
- profile flair

### Copilot tasks

- theme entitlement system
- seasonal challenge tracker
- cross-game mastery progress UI
- supporter badge rendering
- daily challenge rotation system

---

# 12) Premium feature design principles

Every premium feature should satisfy at least one of these:

- makes the player better
- saves time
- adds prestige/cosmetic identity
- helps a group organizer
- is reusable across more than one game family

If a feature does none of these, delay it.

---

# 13) Pricing philosophy

Keep pricing simple at launch.

Recommended launch pricing structure:

- Free
- Premium AI
- Organizer Premium
- Optional Supporter or Lifetime Supporter later

Avoid complex tier ladders at the beginning.

Possible later bundle:

- StackWorks Pro = Premium AI + Organizer

---

# 14) Metrics to watch

## Acquisition

- signups
- first game played
- first bot game played
- friend invites sent

## Retention

- day-1 / day-7 / day-30 return rate
- repeat bot play rate
- replay usage
- hint usage
- challenge ladder participation

## Monetization

- premium conversion rate
- organizer conversion rate
- premium AI retention
- supporter conversion
- upgrade trigger events

## Product fit

- which games drive signups
- which games drive premium upgrades
- which bot personalities are most used
- whether Columns Chess or stacking family drives more loyalty

---

# 15) Likely upgrade triggers

Premium AI upgrades will likely be driven by:

- "I want stronger bots"
- "I ran out of hints/reviews"
- "I want to save/revisit this game"
- "I want to train seriously in Columns Chess"
- "I want better bots in Lasca/Damasca"

Organizer upgrades will likely be driven by:

- "I want to run a league"
- "I want to host my class/club"
- "I want private events and standings"

Supporter upgrades will likely be driven by:

- "I like the site"
- "I want ad-free"
- "I want themes/badge"
- "I want to support development"

---

# 16) What to build later, not now

Delay until later:

- massive lesson library
- video courses
- super-deep engine explanations
- advanced opening explorers for every game
- full puzzle databases for every title
- elaborate social feeds
- marketplace features
- team battles and complex tournament types
- mobile app-specific monetization complexity

---

# 17) Recommended positioning copy

## Short version

"StackWorks is the home of classic and original strategy games, including Columns Chess, Lasca, Damasca, Dama, Checkers, and more—powered by strong bots, training tools, and organizer-friendly leagues."

## Premium AI version

"Train across the full StackWorks strategy lineup with stronger bots, unlimited hints, post-game review, and challenge ladders."

## Organizer version

"Run your club, class, or tournament on StackWorks—one organizer account, many players."

---

# 18) MVP recommendation

If budget is tight, the MVP should be:

## Free MVP

- account
- casual play
- basic ratings
- basic bots
- replay viewer
- join organizer events

## Paid MVP

- Premium AI for Columns Chess
- Organizer Premium for tournaments/clubs
- ad-free + supporter badge

That is the smallest version that still has a believable business model.

---

# 19) Final recommendation

The highest-value sequence is:

1. Build reusable premium/AI infrastructure
2. Launch strong Premium AI for Columns Chess
3. Launch Organizer Premium
4. Expand Premium AI into Lasca/Damasca family
5. Expand into Draughts family
6. Add supporter polish and cross-game mastery

This gives StackWorks a monetization plan that is:

- realistic for one developer
- differentiated from Chess.com
- stronger because of original games
- reusable across the full StackWorks catalog

---

# Addendum: Damasca as a StackWorks-exclusive original creation

An important differentiator for StackWorks is that **Damasca Classic** and **Damasca International** are original StackWorks-created variants.

Damasca is a **hybrid of Dama and Lasca**. The simplest description is:

**Damasca plays like Dama with stacks.**

That makes it more than just another supported ruleset. It is a platform-exclusive game family with its own identity, its own strategy, and its own AI/training needs.

## What makes Damasca distinct

Damasca combines:

- the movement and capture character of Dama
- stack-based play inspired by Lasca
- StackWorks-specific terminology and rules identity

In Damasca, pieces are referred to as:

- **Soldiers** for ordinary pieces
- **Officers** for promoted pieces

This follows Lasca-style terminology rather than standard Dama king terminology.

## Damasca Classic vs Damasca International

The difference between the two Damasca variants is focused and easy to explain:

### Damasca Classic

When a Soldier is promoted to an **Officer**, it may move diagonally in any direction, but only **one space at a time**.

### Damasca International

When a Soldier is promoted to an **Officer**, it behaves like a **flying Dama king**, moving any distance along a diagonal and capturing from anywhere along that full diagonal.

So the main distinction is:

- **Damasca Classic** = short-range Officers
- **Damasca International** = flying Officers

This mirrors the same core distinction between Dama Classic and Dama International, while preserving Damasca’s stack-based hybrid identity.

## Why this matters strategically

Because Damasca is a StackWorks-created hybrid of Dama and Lasca, it gives StackWorks something that larger platforms do not have:

- an original strategy game family unique to StackWorks
- exclusive rules and gameplay identity
- exclusive AI/bot opportunities
- exclusive premium coaching and review features
- stronger brand identity for StackWorks as a creator of games, not just a host of games

This makes Damasca especially important to StackWorks’ long-term positioning.

## Product implication

Damasca should be treated as more than just another title in the catalog.

It should be positioned as:

- a signature StackWorks original
- a flagship hybrid/stacking strategy game
- a core use case for premium bot development
- a long-term candidate for branded ladders, tournaments, and teaching tools

## Monetization implication

Because Damasca is StackWorks-exclusive, premium features built around it are also exclusive.

This increases the value of:

- premium Damasca bots
- Damasca-specific coach mode
- Damasca review and training tools
- Damasca challenge ladders
- Damasca tournaments and seasonal events
- future Damasca studies, drills, and mastery tracks

Unlike standard chess or standard checkers, players cannot easily go elsewhere for the same Damasca experience.

## AI roadmap implication

Within the stacking family, Damasca should receive elevated priority because it combines:

- exclusivity
- strong differentiation
- reusable stacking-engine infrastructure
- premium training potential

This means the stacking family matters not only because of Lasca-style mechanics, but also because it contains a **StackWorks-created original property** that can become one of the platform’s signature attractions.

## Recommended positioning copy

### Short form

"Damasca Classic and Damasca International are StackWorks-created hybrid strategy games that combine Dama-style play with Lasca-style stacks."

### Expanded form

"Damasca is a StackWorks-exclusive hybrid of Dama and Lasca — essentially Dama with stacks. In Damasca Classic, promoted Officers move one diagonal step at a time in any direction. In Damasca International, promoted Officers are flying pieces, moving and capturing across full diagonals."

### Premium positioning

"Train in StackWorks-exclusive games like Damasca with premium bots, hints, replay review, and challenge ladders you cannot get anywhere else."

## Strategic conclusion

**Columns Chess, Damasca Classic, and Damasca International** should be treated as some of StackWorks’ strongest proprietary differentiators.

They are not just games in the catalog. They are original platform-defining titles that justify:

- focused AI investment
- premium feature development
- branded competitive events
- long-term platform identity
