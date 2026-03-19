# Lobster Agent Farm — Technical Specification

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Browser (Client)                       │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐              │
│  │ index.html│  │ style.css│  │animations │              │
│  └────┬─────┘  └──────────┘  │  .css     │              │
│       │                      └───────────┘              │
│       ▼                                                  │
│  ┌─────────────────────────────────────────────┐        │
│  │              main.js (entry point)           │        │
│  └──────┬──────────────┬───────────────┬───────┘        │
│         │              │               │                 │
│         ▼              ▼               ▼                 │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┐         │
│  │ game-loop  │ │ ui-renderer│ │ save-system  │         │
│  └─────┬──────┘ └────────────┘ └─────────────┘         │
│        │                                                 │
│        ├──────────────┐                                  │
│        ▼              ▼                                  │
│  ┌────────────┐ ┌────────────┐                          │
│  │  lobster   │ │   event    │                          │
│  │  agent     │ │   engine   │                          │
│  └─────┬──────┘ └─────┬──────┘                          │
│        │              │                                  │
│        ▼              ▼                                  │
│  ┌────────────┐ ┌────────────┐                          │
│  │ api-client │ │ world-state│                          │
│  └─────┬──────┘ └────────────┘                          │
│        │                                                 │
└────────┼─────────────────────────────────────────────────┘
         │  HTTPS (fetch)
         ▼
   ┌───────────┐
   │  LLM API  │
   │  (OpenAI  │
   │  /Claude) │
   └───────────┘
```

All logic runs client-side. The only network call is to the LLM API for AI-powered narration and decisions. The game works fully offline in rule-based fallback mode.

---

## 2. Tech Stack

| Layer            | Technology                         | Rationale                         |
|------------------|------------------------------------|-----------------------------------|
| Markup           | HTML5                              | Semantic, accessible              |
| Styling          | CSS3 + CSS Custom Properties       | Theming, animations, no build     |
| Logic            | Vanilla ES2022+ JavaScript modules | No framework overhead, native ESM |
| State Persistence| localStorage                       | Zero-dependency, browser-native   |
| AI Integration   | fetch() → OpenAI / Anthropic API   | Direct REST calls, no SDK needed  |
| Assets           | SVG + CSS pixel art                | Scalable, small filesize          |
| Deployment       | Static hosting                     | Vercel / Netlify / GitHub Pages   |

No build step required. All JS uses native ES modules (`type="module"`).

---

## 3. Module Specifications

### 3.1 config.js — Global Constants

```javascript
export const CONFIG = {
  TICK_INTERVAL_MS: 15 * 60 * 1000,  // 15 minutes per game tick
  TICKS_PER_DAY: 6,                   // ~6 ticks = 1 game day (1.5 hours)
  DAYS_PER_SEASON: 7,
  SEASONS: ['spring', 'summer', 'autumn', 'winter'],

  LOBSTER_MAX_STAT: 100,
  LOBSTER_MAX_LEVEL: 50,
  LOBSTER_MAX_SKILL: 10,
  MEMORY_SIZE: 30,

  FARM_INITIAL_PLOTS: 6,
  FARM_MAX_PLOTS: 12,

  AI_PROVIDER: 'openai',          // 'openai' | 'anthropic'
  AI_MODEL: 'gpt-4o-mini',
  AI_ENABLED: false,              // false = rule-based only
  AI_MAX_CALLS_PER_DAY: 20,
  AI_CALL_COUNT_KEY: 'lobster_ai_calls_today',

  SAVE_KEY: 'lobster_farm_save',
  VERSION: '0.1.0',
};
```

### 3.2 world-state.js — State Manager

Central state store. All mutations go through methods so the UI can be notified.

```javascript
// State shape
const DEFAULT_STATE = {
  version: CONFIG.VERSION,
  createdAt: null,
  lastTickAt: null,

  lobster: {
    name: '',
    personality: '',       // 'adventurous'|'lazy'|'gluttonous'|'scholarly'|'social'|'mischievous'
    favoriteFood: '',
    favoritePlace: '',
    birthSeason: '',
    level: 1,
    exp: 0,
    mood: 70,
    energy: 80,
    hunger: 20,            // 0=full, 100=starving
    skills: { farming: 0, cooking: 0, exploring: 0, social: 0 },
    memory: [],            // last 30 event summaries
    preferences: {},       // { 'seaweed_roll': 5, 'beach': 3 } — usage counts
    location: 'pond',      // current location in farm
    traveling: null,       // null or { destination, departsAt, returnsAt, postcards: [] }
  },

  farm: {
    plots: [],             // [{ id, crop, growthStage, maxGrowth, plantedAt, watered }]
    decorations: [],       // [{ id, type, position: {x,y} }]
    upgrades: [],          // ['extra_plots', 'auto_water', ...]
  },

  world: {
    season: 'spring',
    weather: 'sunny',
    dayCount: 1,
    tickCount: 0,
    timeOfDay: 'morning',  // 'morning'|'afternoon'|'evening'|'night'
  },

  inventory: {},           // { 'seaweed_seed': 5, 'salt': 3, ... }
  shells: 50,              // currency

  collections: {
    postcards: [],         // [{ id, destination, text, date, rarity }]
    recipes: [],           // [{ id, name, discovered: true, timesCooked: 0, rating: '' }]
    visitorStamps: [],     // [{ id, visitorName, date }]
    rareItems: [],         // [{ id, name, description, obtainedAt }]
  },

  eventLog: [],            // [{ id, tick, type, title, description, lobsterReaction }]
  settings: {
    apiKey: '',
    aiProvider: 'openai',
    aiModel: 'gpt-4o-mini',
    tickSpeedMultiplier: 1,
  },
};
```

**Public API:**

| Method                         | Description                                  |
|--------------------------------|----------------------------------------------|
| `getState()`                   | Returns deep clone of current state          |
| `getLobster()`                 | Shorthand for lobster sub-state              |
| `getWorld()`                   | Shorthand for world sub-state                |
| `update(path, value)`          | Set a nested value by dot-path               |
| `mutate(path, fn)`             | Apply a function to a nested value           |
| `addEvent(event)`              | Append to eventLog, trim if > 200            |
| `addMemory(summary)`           | Append to lobster.memory, trim to 30         |
| `subscribe(listener)`          | Register a callback for state changes        |
| `export()` / `import(json)`    | Full state serialization                     |

### 3.3 game-loop.js — Tick Engine

```
┌──────────────┐
│  Start Loop  │
└──────┬───────┘
       ▼
┌──────────────┐     ┌───────────────┐
│ Check elapsed├────►│ Catch-up ticks│ (if browser was closed)
│ time         │     │ (max 20)      │
└──────┬───────┘     └───────┬───────┘
       │◄────────────────────┘
       ▼
┌──────────────┐
│  Process One │
│  Game Tick   │
│              │
│ 1. Advance time (day/season/weather)
│ 2. Update lobster stats (hunger++, energy--)
│ 3. Run event engine
│ 4. Run lobster agent decision
│ 5. Apply results to state
│ 6. Auto-save
│ 7. Notify UI
└──────┬───────┘
       ▼
┌──────────────┐
│ Schedule next│
│ tick timer   │
└──────────────┘
```

**Catch-up logic**: When the user returns after being away, the engine calculates missed ticks and simulates them in fast-forward (no AI calls during catch-up — rule-based only, to avoid API spam).

**Visibility optimization**: When the browser tab is hidden (`document.hidden === true`), tick interval is doubled to save resources.

### 3.4 event-engine.js — Event Generator

Each tick, the engine:

1. Loads all event definitions from `data/events.json`
2. Filters by prerequisites (season, weather, level, location)
3. Applies weight modifiers (personality, cooldown, time-of-day)
4. Selects 0–2 events via weighted random sampling
5. For AI-enabled events, sends to `api-client` for narration
6. Returns structured event objects to game loop

**Event Definition Schema:**

```javascript
{
  "id": "gentle_rain",
  "type": "weather",
  "title": "Gentle Rain",
  "description": "A soft rain falls over the farm...",
  "baseWeight": 100,
  "prerequisites": {
    "season": ["spring"],
    "weather": ["rainy"],
    "minLevel": 1,
    "maxLevel": null,
    "location": null
  },
  "modifiers": {
    "personalityBonus": { "scholarly": 1.2 },
    "cooldownTicks": 5
  },
  "effects": {
    "mood": 5,
    "energy": 0,
    "hunger": 0,
    "exp": 5,
    "crops": "grow_all_one_stage",
    "items": null,
    "shells": 0,
    "skills": null,
    "visitor": null,
    "travel": null
  },
  "narrated": false
}
```

### 3.5 lobster-agent.js — AI Decision Brain

Two modes of operation:

**Rule-Based Mode (default, no API):**

```
1. Build action candidates: [rest, eat, farm, cook, explore, shop, travel, socialize]
2. Score each candidate:
   - Base score from personality weights
   - Stat urgency bonus (hunger > 70 → eat gets +50)
   - Environment bonus (ripe crops → farm gets +30)
   - Memory penalty (did this last 2 ticks → -40)
   - Random noise (±20)
3. Pick highest scoring action
4. Generate canned dialogue from templates
```

**AI Mode (LLM-powered):**

```
1. Build context: personality, stats, farm state, weather, recent events
2. Construct prompt from template (see prompts/ directory)
3. Send to LLM via api-client
4. Parse structured JSON response
5. Validate response against game rules
6. Fallback to rule-based if parse fails
```

**Response format expected from LLM:**

```json
{
  "action": "farm",
  "detail": "water_seaweed",
  "dialogue": "The seaweed looks thirsty today. Better give it a drink!",
  "mood_change": 2,
  "energy_cost": 10,
  "thought": "I wonder if it'll grow big enough for a salad..."
}
```

### 3.6 api-client.js — LLM Communication

```javascript
// Public API
export async function callLLM(prompt, options = {}) → { response, usage, cached }
export function setApiKey(key)
export function setProvider(provider)  // 'openai' | 'anthropic'
export function getRemainingCalls() → number
```

**Features:**
- Rate limiting (configurable daily cap)
- Response caching (hash prompt → cache for 1 hour)
- Automatic retry with exponential backoff (max 3 retries)
- Provider abstraction (same interface for OpenAI and Anthropic)
- Graceful fallback (returns `null` on failure, caller uses rule-based)
- API key stored in localStorage (never sent anywhere except LLM provider)

**OpenAI request shape:**

```javascript
{
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: CONTEXT_AND_REQUEST }
  ],
  response_format: { type: "json_object" },
  temperature: 0.8,
  max_tokens: 300
}
```

**Anthropic request shape:**

```javascript
{
  model: "claude-haiku-4-20250801",
  max_tokens: 300,
  system: SYSTEM_PROMPT,
  messages: [
    { role: "user", content: CONTEXT_AND_REQUEST }
  ]
}
```

### 3.7 save-system.js — Persistence

```javascript
export function save(state) → boolean       // serialize to localStorage
export function load() → state | null       // deserialize from localStorage
export function exportJSON(state) → string  // download as .json file
export function importJSON(json) → state    // parse uploaded .json
export function hasSave() → boolean
export function deleteSave()
export function migrateState(oldState) → newState  // version migration
```

**Auto-save**: Triggered after every tick.

**Migration**: When `state.version` doesn't match `CONFIG.VERSION`, the `migrateState` function applies incremental transforms to update the schema.

### 3.8 ui-renderer.js — DOM Updates

Uses a simple subscriber pattern — `world-state` emits change events, `ui-renderer` updates specific DOM regions.

**Render regions:**

| Region      | DOM ID             | Updates On                          |
|-------------|--------------------|-------------------------------------|
| Header      | `#header`          | Weather, season, day, shells        |
| Farm View   | `#farm-view`       | Lobster position, crop states       |
| Locations   | `#locations`       | Location cards, visitor indicators  |
| Diary       | `#diary`           | Event log entries (prepend new)     |
| Tabs        | `#tab-content`     | Tab panel switching                 |
| Stats       | `#stats-panel`     | Lobster mood/energy/hunger bars     |
| Notification| `#notification`    | Toast for new events                |

**Animation system**: CSS class toggling. The renderer adds/removes classes like `.lobster--eating`, `.crop--growing`, `.visitor--arriving` and CSS handles the transitions.

---

## 4. Data Files

### 4.1 data/events.json

Array of ~60 event definitions following the schema in 3.4. Categories:
- 10 weather events
- 8 visitor events
- 10 discovery events
- 10 farm events
- 8 travel events
- 6 festival events
- 8 social/misc events

### 4.2 data/items.json

```javascript
{
  "seaweed_seed": {
    "name": "Seaweed Seed",
    "category": "seed",
    "description": "A basic but reliable crop.",
    "buyPrice": 5,
    "sellPrice": 2
  },
  // ...
}
```

### 4.3 data/recipes.json

```javascript
{
  "seaweed_roll": {
    "name": "Seaweed Roll",
    "ingredients": { "seaweed": 2 },
    "effects": { "hunger": -30 },
    "unlockCondition": "default"
  },
  // ...
}
```

### 4.4 data/personalities.json

```javascript
{
  "adventurous": {
    "label": "Adventurous",
    "description": "Always curious, eager to explore the unknown.",
    "actionWeights": {
      "rest": 0.5, "eat": 0.8, "farm": 0.8,
      "cook": 0.7, "explore": 2.0, "shop": 0.9,
      "travel": 1.8, "socialize": 1.0
    },
    "moodModifiers": { "travel_return": 10, "stuck_home": -5 },
    "dialogueStyle": "enthusiastic and curious"
  },
  // ...
}
```

---

## 5. Security Considerations

### 5.1 API Key Handling

- API key is stored in `localStorage` under a dedicated key
- Never transmitted anywhere except the LLM provider endpoint
- Settings UI shows masked key (`sk-****...****`)
- Key can be deleted from settings at any time
- CORS: both OpenAI and Anthropic APIs support browser-origin requests

### 5.2 State Integrity

- All LLM responses are validated against expected JSON schema
- Invalid responses fall back to rule-based behavior
- State mutations are bounds-checked (stats clamped to 0–100)
- Import/export validates version and structure before loading

---

## 6. Performance Budget

| Metric                  | Target           |
|-------------------------|------------------|
| Initial load (no cache) | < 500 KB total   |
| First paint             | < 200 ms         |
| Tick processing         | < 50 ms          |
| LLM call (when used)    | < 3 seconds      |
| localStorage usage      | < 500 KB         |
| Memory footprint        | < 20 MB          |

---

## 7. File Structure

```
lobster-farm/
├── index.html                 # Entry point, layout shell
├── css/
│   ├── style.css              # Layout, colors, typography
│   └── animations.css         # Sprite animations, transitions
├── js/
│   ├── main.js                # App initialization, wiring
│   ├── config.js              # Global constants
│   ├── game-loop.js           # Tick engine
│   ├── lobster-agent.js       # AI decision brain
│   ├── event-engine.js        # Random event generator
│   ├── world-state.js         # Central state store
│   ├── save-system.js         # localStorage persistence
│   ├── ui-renderer.js         # DOM updates, animations
│   └── api-client.js          # LLM API communication
├── data/
│   ├── events.json            # Event definitions (~60)
│   ├── items.json             # Item catalog
│   ├── recipes.json           # Cooking recipes
│   ├── personalities.json     # Personality profiles
│   └── prompts/
│       ├── decision.txt       # Lobster action decision prompt
│       ├── narration.txt      # Event narration prompt
│       └── postcard.txt       # Travel postcard prompt
├── assets/
│   ├── sprites/               # Lobster + visitor SVGs
│   ├── backgrounds/           # Location background art
│   └── ui/                    # Icons, buttons, frames
└── docs/
    ├── GAME_DESIGN.md         # Game design document
    └── TECH_SPEC.md           # This file
```

---

## 8. Browser Compatibility

| Browser          | Minimum Version | Notes                     |
|------------------|-----------------|---------------------------|
| Chrome / Edge    | 91+             | Full ES module support    |
| Firefox          | 90+             | Full ES module support    |
| Safari           | 15+             | Full ES module support    |
| Mobile Chrome    | 91+             | Touch events supported    |
| Mobile Safari    | 15+             | Touch events supported    |

No polyfills needed. The game uses only standard web APIs:
- ES Modules (import/export)
- fetch API
- localStorage
- CSS Custom Properties
- CSS Grid / Flexbox
- requestAnimationFrame (for UI updates only)
- Page Visibility API (for background optimization)

---

## 9. Development Phases

### Phase 1 — Core Engine
Implement: `config.js`, `world-state.js`, `game-loop.js`, `save-system.js`, `event-engine.js` (rule-based only), basic `ui-renderer.js`, `index.html` + CSS.

Milestone: A lobster exists, time passes, events fire, state persists.

### Phase 2 — AI Integration
Implement: `api-client.js`, `lobster-agent.js` (AI mode), prompt templates, settings UI for API key.

Milestone: Lobster makes AI-driven decisions and generates diary text.

### Phase 3 — Content & Polish
Implement: Full event library, all items/recipes/personalities data, collection UI, animations, travel system, visitor interactions.

Milestone: Complete gameplay loop with 50+ events and all collections.

### Phase 4 — Advanced Agent
Implement: Cross-session memory, personality evolution, storyline arcs, adaptive difficulty.

Milestone: Lobster that feels genuinely alive and unique to each player.
