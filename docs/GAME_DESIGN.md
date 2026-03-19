# Lobster Agent Farm — Game Design Document

## 1. Overview

**Title**: Lobster Agent Farm (龙虾特工农场)

**Genre**: Idle / Casual Pet-Raising Simulation

**Platform**: Web (browser)

**Tone**: Warm, humorous, slightly absurd — a lobster living its best farm life.

**Tagline**: *Your lobster has a mind of its own.*

**Reference Games**: Tabikaeru (idle + surprise), Story of Seasons (farming + seasonal rhythms), Neko Atsume (collection + passive observation)

---

## 2. Core Game Loop

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   Player prepares environment (food, items)     │
│                  │                              │
│                  ▼                              │
│   Lobster AI autonomously decides actions       │
│                  │                              │
│                  ▼                              │
│   Random events occur (weather, visitors, etc.) │
│                  │                              │
│                  ▼                              │
│   Lobster grows, collects, writes diary         │
│                  │                              │
│                  ▼                              │
│   Player checks in: reads diary, postcards,     │
│   collects rewards, rearranges farm             │
│                  │                              │
│                  └──────────────────────────────►│
│                                                 │
└─────────────────────────────────────────────────┘
```

The game is designed for **very low interaction frequency**. A player might open it once or twice a day, read what happened, set out some supplies, and close it. The lobster keeps living.

---

## 3. The Lobster Agent

### 3.1 Identity

Each lobster is unique. At creation, the player names it and the system randomly generates:

| Attribute       | Values                                                          |
|-----------------|-----------------------------------------------------------------|
| Personality     | Adventurous, Lazy, Gluttonous, Scholarly, Social, Mischievous  |
| Favorite Food   | Seaweed Roll, Coral Cake, Shell Soup, Kelp Salad, Plankton Pie |
| Favorite Place  | Pond, Farm Field, Kitchen, Hilltop, Beach, Library              |
| Birth Season    | Spring / Summer / Autumn / Winter (affects early traits)        |

### 3.2 Stats

| Stat    | Range | Effect                                                     |
|---------|-------|------------------------------------------------------------|
| Mood    | 0–100 | High mood → more adventurous actions, special events       |
| Energy  | 0–100 | Depleted by activities, restored by rest/food              |
| Hunger  | 0–100 | Increases over time, reduced by eating. 0 = very hungry    |
| Level   | 1–50  | Grows with EXP, unlocks new events/areas/recipes           |

### 3.3 Growth Stages

| Stage    | Level Range | Visual                                   |
|----------|-------------|------------------------------------------|
| Baby     | 1–5         | Tiny, translucent, wobbly                |
| Juvenile | 6–15        | Small, more colorful, curious eyes       |
| Adult    | 16–35       | Full-sized, bold colors, wears hat       |
| Elder    | 36–50       | Large, dignified, monocle + walking cane |

Each stage unlocks new sprite sets and animation variants.

### 3.4 Skill System

Four skill branches, each leveled 0–10:

| Skill     | Leveled By                       | Unlocks                                   |
|-----------|----------------------------------|-------------------------------------------|
| Farming   | Planting, watering, harvesting   | Rare crops, bigger plots, auto-water      |
| Cooking   | Preparing meals, new recipes     | Complex dishes, visitor-attracting food   |
| Exploring | Traveling, discovering items     | New destinations, rare postcards          |
| Social    | Visitor interactions, festivals  | Special visitors, friendship rewards      |

### 3.5 Memory & Preferences

The lobster remembers its last 30 events. Over time it develops preferences:

- If it eats Seaweed Roll 5+ times → "Developed a taste for Seaweed Roll" (mood boost when eating it)
- If it visits the Beach 3+ times → "Loves the Beach" (higher chance of choosing beach travel)
- If a visitor was mean → "Wary of Crabs" (avoids crab merchant for a while)

These preferences are stored as weighted modifiers on the decision engine.

### 3.6 Autonomous Decision Making

Each game tick, the lobster "decides" what to do. The decision factors:

1. **Personality weight** — Adventurous lobster prefers exploring; Lazy prefers resting
2. **Current stats** — Hungry lobster prioritizes eating; Tired lobster rests
3. **Environment** — What's available in inventory, farm state, weather
4. **Memory** — Recent events bias toward variety (don't repeat same action 3x)
5. **Random factor** — 20% chance of a completely unexpected choice (surprise!)

---

## 4. The Farm World

### 4.1 Locations

```
┌─────────────────────────────────────────┐
│            🌤 Weather / Season           │
├──────────────────┬──────────────────────┤
│                  │                      │
│     🦞 Pond      │    🌿 Farm Field     │
│   (Home/Rest)    │  (Plant & Harvest)   │
│                  │                      │
├──────────────────┼──────────────────────┤
│                  │                      │
│   🍳 Kitchen     │     🏪 Shop          │
│ (Cook & Craft)   │  (Buy & Trade)       │
│                  │                      │
├──────────────────┴──────────────────────┤
│         📖 Diary / Event Log            │
└─────────────────────────────────────────┘
```

**Pond** — The lobster's home base. It sleeps here, relaxes in the water, and recovers energy. Decoratable with rocks, plants, and lights.

**Farm Field** — 6 plots (expandable to 12). Each plot grows one crop. Crops need watering and have growth cycles tied to seasons.

**Kitchen** — Combine ingredients into meals. Meals restore hunger, boost mood, and some attract visitors. Recipe book tracks discoveries.

**Shop** — Spend shells (currency) on seeds, ingredients, decorations, and travel supplies. Stock rotates daily. Occasionally a traveling merchant appears with rare items.

**Outside World** — Not a physical location on screen. When the lobster decides to travel, it disappears for 1–3 real-time days and sends postcards from destinations (Beach, Mountain, City, Deep Sea, Hot Spring, etc.).

### 4.2 Crops

| Crop            | Season      | Growth Time   | Sell Value | Notes              |
|-----------------|-------------|---------------|------------|--------------------|
| Seaweed         | All         | 4 ticks       | 5 shells   | Basic, reliable    |
| Coral Rose      | Spring      | 6 ticks       | 12 shells  | Attracts visitors  |
| Sun Kelp        | Summer      | 5 ticks       | 10 shells  | Cooking ingredient |
| Amber Moss      | Autumn      | 7 ticks       | 15 shells  | Rare recipes       |
| Frost Pearl     | Winter      | 10 ticks      | 25 shells  | Very rare          |
| Rainbow Anemone | Any (rare)  | 12 ticks      | 50 shells  | Random seed drop   |

### 4.3 Seasons & Weather

**Season Cycle**: 4 seasons, each lasting 7 real days (28-day full cycle).

| Season | Weather Pool                    | Mood Modifier | Special                      |
|--------|---------------------------------|---------------|------------------------------|
| Spring | Sunny, Rainy, Breezy            | +5 base       | New visitors, planting bonus |
| Summer | Sunny, Hot, Stormy              | +0 base       | Festivals, beach travel      |
| Autumn | Cloudy, Windy, Foggy            | +3 base       | Harvest bonus, foraging      |
| Winter | Snowy, Cold, Clear              | -5 base       | Hibernation risk, cozy meals |

Weather changes every 4 ticks (roughly daily). Weather affects:
- Crop growth speed (rain = faster in spring)
- Lobster mood
- Available events (storms can damage crops, snow enables snowball events)
- Visitor probability

---

## 5. Event System

### 5.1 Event Categories

Events are the heart of the game. They fire based on weighted random selection each tick.

#### Weather Events
| Event             | Trigger      | Effect                                       |
|-------------------|--------------|----------------------------------------------|
| Gentle Rain       | Spring+Rainy | All crops grow +1 stage, mood +5             |
| Thunderstorm      | Summer+Stormy| 30% chance 1 crop damaged, mood -10          |
| First Snow        | Winter start | Special diary entry, mood +10                |
| Heat Wave         | Summer+Hot   | Energy drains 2x, crops need extra water     |
| Beautiful Sunset  | Any+Clear    | Mood +15, chance of rare postcard scene       |

#### Visitor Events
| Visitor           | Frequency | Interaction                                    |
|-------------------|-----------|------------------------------------------------|
| Crab Merchant     | Common    | Sells rare seeds at discount, haggles          |
| Fish Mailman      | Common    | Delivers postcards and gifts from "friends"    |
| Octopus Chef      | Uncommon  | Teaches a random recipe if fed                 |
| Sea Turtle Elder  | Rare      | Tells a story, grants +50 EXP                  |
| Mysterious Shrimp | Very Rare | Offers a quest, big reward on completion        |

#### Discovery Events
| Event              | Trigger             | Reward                              |
|--------------------|---------------------|-------------------------------------|
| Buried Treasure    | Exploring + Lucky   | Random rare item                    |
| Old Recipe Book    | Kitchen + Scholarly | Unlocks 2 recipes                   |
| Shooting Star      | Night + High Mood   | Wish granted (player chooses bonus) |
| Message in Bottle  | Beach travel        | Lore text, +20 EXP                  |

#### Farm Events
| Event              | Trigger            | Effect                              |
|--------------------|--------------------|-------------------------------------|
| Pest Invasion      | Random, any season | 1 crop infected, needs player item  |
| Bumper Harvest     | High farming skill | Double yield on 1 crop              |
| Mystery Seedling   | Random             | Unknown crop appears in empty plot   |
| Golden Crop        | Very rare          | 1 crop turns gold, 10x sell value   |

#### Travel Events
When the lobster travels, it generates 1–3 postcards:

| Destination   | Duration | Postcards | Souvenirs                    |
|---------------|----------|-----------|------------------------------|
| Sandy Beach   | 1 day    | 1         | Seashell, Sand Dollar        |
| Coral Reef    | 1 day    | 1         | Coral Fragment, Tiny Fish    |
| Mountain Lake | 2 days   | 2         | Mountain Herb, Crystal       |
| Deep Sea      | 2 days   | 2         | Glowing Algae, Pearl         |
| Human City    | 3 days   | 3         | Miniature Toy, City Postcard |
| Hot Spring    | 1 day    | 1         | Mood fully restored          |

### 5.2 Event Weighting

Each event has a base weight, modified by:
- Season multiplier (×0 to ×3)
- Weather multiplier (×0.5 to ×2)
- Lobster personality multiplier (×0.5 to ×2)
- Cooldown (recently fired events get ×0.1 for 5 ticks)
- Level gate (some events only appear at certain levels)

```
finalWeight = baseWeight × seasonMod × weatherMod × personalityMod × cooldownMod
```

### 5.3 Festival Events (Seasonal Specials)

| Festival            | Season       | Activities                            |
|---------------------|--------------|---------------------------------------|
| Planting Festival   | Early Spring | Plant 3 crops free, community event   |
| Midsummer Feast     | Mid Summer   | Cooking contest, visitor bonanza      |
| Harvest Moon        | Mid Autumn   | Double harvest, lantern lighting      |
| Starlight Festival  | Late Winter  | Gift exchange, rare visitor appears   |

---

## 6. Economy & Inventory

### 6.1 Currency

**Shells** — Earned by selling crops, completing events, and visitor gifts. Spent at shop.

### 6.2 Items

| Category    | Examples                                          |
|-------------|---------------------------------------------------|
| Seeds       | Seaweed Seed, Coral Rose Seed, Sun Kelp Seed     |
| Ingredients | Salt, Sugar, Kelp Flour, Pearl Dust               |
| Meals       | Seaweed Roll, Coral Cake, Shell Soup              |
| Travel Gear | Backpack, Map, Compass, Snack Pack                |
| Decorations | Lantern, Rock Garden, Wind Chime, Mini Lighthouse |
| Souvenirs   | Postcards, Sea Glass, Driftwood Carving           |
| Special     | Lucky Charm, Growth Potion, Weather Stone          |

### 6.3 Recipes

Recipes are discovered through events, visitors, or experimentation.

| Recipe          | Ingredients               | Effect                         |
|-----------------|---------------------------|--------------------------------|
| Seaweed Roll    | Seaweed × 2               | Hunger -30                     |
| Coral Cake      | Coral Fragment + Sugar     | Hunger -40, Mood +10          |
| Shell Soup      | Seashell + Salt + Seaweed  | Hunger -50, Energy +20        |
| Plankton Pie    | Plankton + Kelp Flour     | Hunger -35, EXP +10           |
| Golden Feast    | Golden Crop + Pearl Dust  | Full restore all stats         |

---

## 7. Collections

### 7.1 Postcard Album

Each travel generates AI-written postcards. Collected in an album with:
- Destination illustration
- Lobster's handwritten message
- Date stamp
- Rarity indicator (common/rare/legendary based on destination and events during travel)

### 7.2 Recipe Book

Tracks all discovered recipes with:
- Ingredients list
- Times cooked
- Lobster's personal rating (AI-generated comment)

### 7.3 Visitor Stamps

Each unique visitor leaves a stamp. Collecting full sets unlocks bonuses:
- Common set (5 stamps) → +10% shop discount
- Rare set (3 stamps) → Unique decoration
- Legendary visitor → Special achievement

### 7.4 Rare Items Gallery

Museum-style display for rare finds:
- Golden Crop specimens
- Message in Bottle texts
- Shooting Star wish records
- Mysterious Shrimp quest rewards

---

## 8. UI Layout & Wireframes

### 8.1 Main Screen

```
┌─────────────────────────────────────────────────┐
│  ☁ Sunny  │  🌸 Spring Day 5  │  🐚 342 shells │
├─────────────────────────────────────────────────┤
│                                                 │
│    ┌─────────┐         ┌─────────────────┐      │
│    │         │         │ 🌱  🌿  🌾       │      │
│    │  🦞     │         │ 🌱  ··  🌿       │      │
│    │  pond   │         │ ··  🌱  ··       │      │
│    │         │         │   Farm Field     │      │
│    └─────────┘         └─────────────────┘      │
│                                                 │
│    ┌─────────┐         ┌─────────────────┐      │
│    │ 🍳      │         │ 🏪              │      │
│    │ Kitchen │         │ Shop            │      │
│    └─────────┘         └─────────────────┘      │
│                                                 │
├─────────────────────────────────────────────────┤
│ 📖 "I watered the seaweed today. It looked      │
│    happy. Or maybe that's just me." — Lobster   │
├─────────────────────────────────────────────────┤
│  [Diary]  [Postcards]  [Recipes]  [Items]       │
└─────────────────────────────────────────────────┘
```

### 8.2 Navigation Tabs

| Tab       | Content                                      |
|-----------|----------------------------------------------|
| Main      | Farm view with lobster, locations, weather    |
| Diary     | Scrollable event log with AI-written entries  |
| Postcards | Album grid of collected travel postcards      |
| Recipes   | Recipe book with discovery status             |
| Items     | Inventory grid with item details on tap       |
| Settings  | API key config, tick speed, export/import     |

### 8.3 Interaction Points

- **Tap a location** → See detail view (e.g., farm plots, kitchen counter)
- **Tap the lobster** → See stats panel + current thought bubble
- **Tap a visitor** → Interaction dialog (gift, trade, talk)
- **Long press item** → Use/place/gift options
- **Swipe diary** → Scroll through past entries

---

## 9. Monetization (Optional/Future)

This is a free hobby project, but if expanded:

| Model          | Implementation                                |
|----------------|-----------------------------------------------|
| Free tier      | Rule-based AI, basic events, limited travel   |
| Premium (BYOK) | Bring-Your-Own-API-Key for full LLM features |
| Cosmetic IAP   | Special decorations, outfits for lobster      |

---

## 10. Emotional Design Goals

The game should make players feel:

- **Warm** — The lobster is endearing and its diary entries are heartfelt
- **Surprised** — Random events create genuine "oh!" moments
- **Connected** — The lobster feels like it has its own life, even when you're away
- **Relaxed** — No pressure, no fail states, no timers demanding attention
- **Amused** — A lobster farming coral and writing postcards is inherently funny

There is **no game over**. The lobster never dies. If neglected, it gets sad (mood drops) but recovers when the player returns. Elder lobsters who reach max level get a "retirement" ceremony and the player can start a new lobster that inherits some items.
