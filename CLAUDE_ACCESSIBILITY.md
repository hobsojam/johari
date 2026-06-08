# Accessibility Guidelines for Claude

This project targets **WCAG 2.1 Level AA**. These rules apply whenever you touch any frontend file.

## Non-negotiable rules

- **Every interactive element must be keyboard-operable.** Buttons, links, form controls, and the word selection grid must all be reachable and activatable with Tab/Enter/Space.
- **No colour may be the sole means of conveying information.** Always pair colour with text or icons (e.g. the four Johari quadrants must be distinguishable by label, not just colour).
- **All form inputs must have a programmatically associated label** — either a `<label for="...">`, `aria-label`, or `aria-labelledby`.
- **Error messages must be announced.** Use `role="alert"` for errors that appear dynamically. Use `aria-live="polite"` for status updates (e.g. "X of Y participants have submitted").
- **Focus must be managed on dynamic content.** When the phase transitions (lobby→select, select→reveal), move focus to the new primary heading or action so screen reader users know the view has changed.
- **Never remove the visible focus ring** without providing an equivalent. Do not write `outline: none` or `outline: 0` without a replacement.

## ARIA patterns to use

| Component | Pattern |
|---|---|
| Word selection grid | `role="group"` with `aria-label` wrapping individual `<button>` or checkbox elements; toggled state via `aria-pressed` or `aria-checked` |
| Phase status | `aria-live="polite"` + `aria-atomic="true"` for submission count updates |
| Error messages | `role="alert"` |
| Timer countdown | `aria-live="polite"` with updates no more than once per minute to avoid announcement spam |
| Johari quadrant panels | `role="region"` with `aria-labelledby` pointing at the quadrant heading |
| Admin panel | `role="region"` with `aria-label="Admin controls"` |

## Colour contrast

All text must meet the WCAG AA contrast minimums:
- **Normal text** (< 18 pt / < 14 pt bold): **4.5 : 1** against its background
- **Large text** (≥ 18 pt or ≥ 14 pt bold): **3 : 1**

### Approved secondary-text colours

| Use | Colour | Contrast on `#f8fafc` (body bg) |
|---|---|---|
| Muted / secondary text | `#4b5563` | ≈ 7 : 1 ✓ |
| Faint labels, column headers | `#4b5563` | ≈ 7 : 1 ✓ |

**Do not use** `#888`, `#767676`, `#6b7280`, or `#9ca3af` for text — all fail AA at normal text size on a `#f8fafc` body background.

## Johari quadrant display specifics

Each quadrant must be distinguishable without relying on colour alone:
- Label every quadrant with its name (Open, Blind Spot, Hidden, Unknown)
- Optionally add a distinct icon per quadrant
- Word chips within quadrants must be readable at 200% zoom

## Testing

### Manual checklist (before each PR touching UI)
- [ ] Tab through the entire page — every interactive element is reachable and has a visible focus indicator
- [ ] Activate all interactive elements with Enter / Space only
- [ ] Verify no colour-only information (quadrants labelled, selected words shown with text not just highlight)
- [ ] Check new text colours pass contrast with https://webaim.org/resources/contrastchecker/
- [ ] Verify phase transitions announce correctly (focus moves, live region updates)

### Screen reader smoke test (before releases)
- NVDA + Firefox on Windows, or VoiceOver + Safari on macOS
- Join a session, submit selections, verify the reveal screen is navigable and quadrant contents are announced
