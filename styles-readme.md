# UI layout guidelines

## Spacing scale
- `--space-4`: 4px
- `--space-8`: 8px
- `--space-12`: 12px
- `--space-16`: 16px
- `--space-20`: 20px

## Cards
- Border radius: `var(--card-radius)` (12px)
- Padding: `var(--card-padding)` (16px)
- `box-sizing: border-box` and `overflow: hidden` applied to major cards (panels, building/job/trade cards, resource chips).

## Layout breakpoints
- `<= 1023px`: single column stack (`.dashboard-grid` auto stacks panels).
- `1024px–1279px`: two-column layout (`#buildings` & `#jobs` share column 1, `#trade` column 2).
- `>= 1280px`: three even columns.

## Resource bar
- Responsive grid using `repeat(auto-fit, minmax(11rem, 1fr))`.
- Chips share the same minimum height (`--chip-height`, 52px) and typography.

## Buttons & controls
- Minimum interactive size: 36×36px via `min-height: 2.25rem` and `min-width` rules for icon buttons.
- Focus states use a visible outline (`outline: 2px solid #38bdf8`).

## Overflow management
- Long labels use `white-space: nowrap`, `overflow: hidden` and `text-overflow: ellipsis` on chips, building headers, and trade controls.
- Lists (`#building-accordion`, `#jobs-list`, `#trade-list`) rely on CSS grid gaps instead of Tailwind spacing utilities to avoid compounding margins.
