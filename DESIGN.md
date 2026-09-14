# GeePlays DESIGN.md

A machine-readable design system for GeePlays — George's personal gaming
discovery hub. Concrete tokens and rules, not vibes. Any agent or human
implementing UI for this project should follow this file.

---

## 1. Visual Theme & Atmosphere

- **Mood:** Dark, clean, gaming-first, slightly futuristic. *Not* cyberpunk,
  *not* black-and-red "gamer" cliché, *not* a neon dashboard.
- **Density:** Spacious. Air around cards, generous section padding. Content
  breathes; nothing is crammed.
- **The artwork is the star.** Game covers and news images lead every card.
  UI chrome stays quiet so imagery can do the talking.
- **Glassmorphism is an identity signal, used sparingly.** Only the navbar
  and overlay surfaces get backdrop blur. Never glass over body text.
- **Personality:** A polished personal hub, not an AI SaaS template. Copy is
  friendly and honest ("saved picks", "discover what to play next"), never
  marketing-hype.

## 2. Color Palette & Roles

Blue is the **only** accent. It marks action, focus, and selection — never
the whole page.

| Token | Dark theme | Light theme | Role |
|---|---|---|---|
| `--bg-primary` | `#0f1115` | `#eef1f6` | Page background |
| `--bg-secondary` | `#14171c` | `#e6eaf1` | Footer / secondary bands |
| `--bg-surface` | `#1a1d23` | `#ffffff` | Cards, panels |
| `--bg-surface-elevated` | `#22252d` | `#f5f7fb` | Hover / raised surface |
| `--text-primary` | `#f4f5f7` | `#16181d` | Headings, primary text |
| `--text-secondary` | `#a6adb8` | `#4c5462` | Body copy |
| `--text-muted` | `#6d7480` | `#7c8594` | Labels, captions |
| `--accent` | `#2f9bf0` | `#1a8de4` | Primary buttons, links, active/focus |
| `--accent-hover` | `#58aef4` | `#0f7ed0` | Hover state |
| `--accent-soft` | `rgba(47,155,240,.14)` | `rgba(26,141,228,.12)` | Tinted backgrounds |
| `--border-subtle` | `rgba(255,255,255,.08)` | `rgba(15,23,42,.10)` | Hairline borders |
| `--border-strong` | `rgba(255,255,255,.16)` | `rgba(15,23,42,.20)` | Emphasis borders |

- **Depth comes from surfaces + hairline borders, not big shadows.**
- Payment cards may use their own official brand colors (M-Pesa red, Airtel
  red, NMB gold) on their own cards only.
- Feedback: `--success #3fb950`, `--danger #f0554c`, info = accent-soft.

## 3. Typography Rules

| Level | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Hero title | Segoe UI Variable | `clamp(30px,4.2vw,48px)` | 600 | White on media, `line-height:1.08` |
| Section title | Segoe UI Variable | `clamp(22px,2.6vw,30px)` | 600 | |
| Card title | Segoe UI Variable | `15.5px` | 600 | |
| Body | Segoe UI Variable | `14–16px` | 400 | `line-height:1.55` |
| Eyebrow / label | Cascadia Code (mono) | `11–12px` | 600 | Uppercase, letterspaced `0.06–0.08em` |
| Numeric / meta | Cascadia Code (mono) | `11–13px` | 400–600 | Ratings, dates, counts |

- Use mono for eyebrows, badges, ratings, and metadata — it is the "gaming
  HUD" texture of the brand.
- Never more than ~3 type sizes on a single card.

## 4. Component Stylings

**Buttons**
- Primary: `--accent` bg, near-black text (`#0b0e12`), radius `10px`.
- Ghost: surface bg + hairline border; hover raises the surface.
- Outline: transparent bg, strong border; hover tints border + text accent.
- Min height 40px desktop, 44px touch. `transform: scale(.98)` on active.

**Cards (games)**
- Priority order: artwork → genre label → title → 1–2 line blurb → rating +
  platforms → "View Details". Do not cram more metadata in.
- Cover ratio `3/4`, rounded `14px`, thin border. On hover: border→accent,
  `translateY(-3px)`, artwork `scale(1.03)`.

**Chips / filters**
- Pill radius `999px`. Active = solid accent with near-black text. Inactive =
  surface bg + hairline border.

**Navbar**
- Sticky, translucent glass: dark `rgba(22,25,31,.72)`, light
  `rgba(255,255,255,.78)`, `backdrop-filter: blur(16px) saturate(1.4)`.
- Active page link = accent text + 2px underline bar.

## 5. Layout Principles

- Max content width **1240px**, `24px` side padding (`16px` below 560px).
- Section padding **60px** vertical (`44px` mobile).
- Grid: 4-col games (→3 @1080, →2 @860/560); 3-col news (→2 @1080, →1 @860).
- Spacing scale: 4 / 8 / 12 / 16 / 20 / 28 / 40 / 60 px. Prefer the 8px grid.

## 6. Depth & Elevation

- Default cards: `--shadow-soft` (very low) + 1px hairline border.
- Hover: `--shadow-medium` + accent border — never a giant drop shadow.
- Overlays (search, lightbox, mobile filter panel): `--shadow-large`.
- **Prefer borders over shadows.** If a surface looks flat, add a hairline,
  not a shadow.

## 7. Do's and Don'ts

**Do**
- Keep blue as the single accent; use it for buttons, links, focus, active.
- Let game artwork be the visual hero of every card.
- Show honest states: skeletons while loading, a small "saved picks" notice
  when live data is unavailable.
- Keep contrast ≥ 4.5:1 for body text.

**Don't**
- Don't paint large areas blue or use rainbow gradients on chrome.
- Don't put glass/blur over body text or on every element.
- Don't use neon, heavy glow, or cyberpunk dashes.
- Don't show raw error strings ("Failed to fetch", "undefined") to users.
- Don't add a gradient to every card or round every corner indiscriminately.

## 8. Responsive Behavior

- Breakpoints: `1080px`, `860px`, `560px`.
- Below `860px`: nav links collapse into the hamburger menu; filters become
  a slide-in panel; grids drop to 2 columns.
- Below `560px`: 2-col cards, `16px` gutters, touch targets ≥ 44px, no
  horizontal overflow ever.
- Hero video swaps to its poster below `720px` and under
  `prefers-reduced-motion`.

## 9. Agent Prompt Guide

Quick reference for generating or editing GeePlays UI:

```
Build a [component] for GeePlays:
- dark gaming hub, Windows-11 blue (#2f9bf0 dark / #1a8de4 light) as the only accent
- layered dark surfaces with hairline borders, glass only on navbar/overlays
- Segoe UI Variable + Cascadia Code mono for labels/metadata
- artwork-first cards, 14px radius, 3/4 covers, hover = accent border + -3px lift
- spacious, no neon, no giant shadows, no gradients on chrome
- states: content-aware skeletons, honest "saved picks" fallback notice
- fully responsive, 44px touch targets, reduced-motion safe
```
