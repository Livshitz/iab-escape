# @livx.cc/iab-escape

Opens your page in the user's real browser when it was opened inside the Facebook or Instagram in-app browser.

In-app browsers lose logins, cookies, payments, app-store and passkey flows. This reopens the same URL in Safari or the default browser. Zero dependencies, no logging, no analytics.

## Quick start

```html
<script src="https://cdn.jsdelivr.net/npm/@livx.cc/iab-escape@0.3/dist/iab-escape.min.js" data-auto></script>
```

Place it early in the page. In any other browser it does nothing: no UI, no navigation.

## Install

```sh
npm i @livx.cc/iab-escape    # or: bun add @livx.cc/iab-escape
```

```ts
import { IabEscape } from '@livx.cc/iab-escape';

const esc = new IabEscape();
esc.auto();                                         // once per page load
esc.bindLink(document.querySelector('a#open')!);    // fallback button/link
```

The ESM import has no side effects. The script build also exposes the global `IabEscape` class (`IabEscape.version`, `IabEscape.buildTime`).

## What the user sees

1. A full-screen loader ("Opening in your browser...").
2. The app's own confirm dialog. It cannot be skipped: the user taps once.
3. The page reopens in the browser.

If the user cancels, they stay on the page with an "Open in browser" button (a real link) and a small "Continue here". If the page comes back after it left (persisted `pageshow`, or hidden then visible), it fires again, at most `maxAutoFires` (default 3) per page lifetime. A cancelled dialog does not re-fire. "Continue here" stops re-fires.

## Supported

| App | OS | Opens in |
|---|---|---|
| Facebook | iOS | Safari |
| Instagram | iOS | Safari |
| Facebook | Android | Default browser |

Experimental, returned only with `includeUnproven`: Instagram Android, Threads iOS, Messenger iOS.

## Options and API

Script-tag attributes map to the JS options.

| Option | Attribute | Default | Purpose |
|---|---|---|---|
| `url` | `data-url` | current page | Target URL (relative resolves against the page) |
| `userAgent` | | `navigator.userAgent` | Override detection input |
| `delayMs` | `data-delay-ms` | per app | Delay before firing |
| `includeUnproven` | `data-include-unproven` | `false` | Enable experimental rules |
| `markParam` | `data-mark-param` | `iab_escaped` | Loop-guard query param; `null` / empty disables |
| `ui` | `data-ui` | `true` | Built-in loader and buttons |
| `labels` | `data-label-opening`, `-open`, `-stay` | English | UI text |
| `theme` | `data-accent`, `data-bg`, `data-fg` | built-in | Colors |
| `maxAutoFires` | | `3` | Max automatic fires per page lifetime |
| `onState` | | | Phase callback for your own UI |
| `onAttempt`, `onResult` | | | Fire / outcome callbacks |
| `window` | | `window` | Window to use (tests, iframes) |

Methods:

- `detect()`: returns `{ app, os, inApp }`.
- `getRule()`: the matching rule (with `testedOn`).
- `buildUrl()`: the scheme URL, or null.
- `auto()`: fires automatically; returns a cancel function. Does nothing when the page URL already has the mark param.
- `escape()`: fires now (call inside a tap for buttons).
- `bindLink(el)`: makes a link or button open the browser.
- `dismiss()`: stops re-fires and removes the loader.

Cancelling before the fire re-arms the once-per-page guard (a flag on the window, shared by all instances).

## Customize

Styling hooks: `#iab-escape` and the classes `ie-msg`, `ie-spin`, `ie-open`, `ie-stay`. CSS variables (all optional): `--iab-bg`, `--iab-fg`, `--iab-accent`, `--iab-accent-fg`, `--iab-radius`, `--iab-font`.

```css
#iab-escape { --iab-accent: #e33; --iab-radius: 4px; }
```

```ts
new IabEscape({ theme: { accent: '#e33', bg: '#000' }, labels: { opening: 'One moment…', open: 'Open', stay: 'Stay' } }).auto();
```

Own UI: turn the built-in one off and render from `onState` (`phase`: `opening`, `fallback`, `reentry`, `dismissed`; `url` is the scheme URL for the fallback button).

```ts
const esc = new IabEscape({ ui: false, onState: ({ phase, url }) => myUi.render(phase, url) });
esc.auto();
myUi.onContinue(() => esc.dismiss());
```

## How it works

- Each app has its own hand-off: Instagram iOS `instagram://extbrowser/?url=<enc>`, Facebook iOS `x-safari-https://host/path` (fired after a 1.5 s delay), Facebook Android `intent://host/path#Intent;scheme=https;end`.
- If the document is still loading, `auto()` waits for `DOMContentLoaded` (never `load`), because navigating mid-parse leaves a half-loaded page on return. If it is already `interactive`/`complete`, the delay counts from the call.
- It adds `iab_escaped=1` to the target as a loop guard; the rest of the query stays byte-identical.
- It never uses meta refresh: that loops on Android when the user cancels.

## Tested on

2026-11-16, organic links: iOS 26.7.3 with Facebook 587 and Instagram 455, and Android 16 with Facebook 587. Each combination passed 3/3 for calls on load and for late calls (SPA-style, 0.8 s after load).

## Declined the prompt

"Continue here" navigates the webview to the destination (`continueUrl` / `data-continue-url`, default: the `url` / `data-url` target; with no url it only removes the overlay). The loader is kept (text `labels.continuing`, "Opening…") until the page unloads, so no bare host page shows in between. A custom UI calls `esc.continue()`.

`fallback` (`data-fallback`), default `'manual'`:

- `'parallel'` (**recommended**): after the scheme fires, navigates to the destination `parallelDelayMs` (`data-parallel-delay-ms`, default 0) later and keeps re-issuing it every `retryMs` (`data-retry-ms`, default 300) until `pagehide`, `beforeunload` or 15 s. The app's native prompt swallows navigations while it is open and no browser event reports it closing (seen on Facebook iOS), so the loop simply keeps trying. It never navigates before the scheme has fired.
- `'auto'`: continues once the page is visible AND focused (`document.hasFocus()`), triggered by `focus`/`visibilitychange`/`pageshow`/`pointerdown`/`touchstart` events and by a 150 ms poll starting `fallbackMs` (default 2500) after the fire, up to `fallbackMaxMs` (15000).

- `'retry'`: the same loop with the first navigation at fire + `retryMs`. `onContinue(url, reason)` reports every navigation the lib issues (diagnostics).

No re-fire happens after either navigates.

## Limits

- The schemes are undocumented by Meta and an app update can break them: keep a fallback link and monitor.
- A late `auto()` call (0.8 s after load) was tested 3/3 on Facebook iOS, Instagram iOS and Facebook Android. Only slow or heavy pages remain untested.
- A bare `?iab_escaped` (no value) counts as "mark present": the URL is left untouched and `auto()` is skipped.
- Paid-ad clicks are untested (organic links only).
- A production domain with universal links may open the native app instead of the browser.
- Instagram passes no `fbclid` from a DM; Facebook rewrites the `fbclid` at the hand-off.
- Matched by the rules but untested: Instagram on iPad, Facebook Lite, `http` targets on Android (`scheme=http`) and Instagram. On iOS Facebook `http` targets return null.
- `onResult` watches `visibilitychange`/`pagehide` for 3 s. Meta webviews do not fire these reliably, so `stayed-or-unknown` is not proof of failure.
- The app's confirm dialog cannot be skipped.

## Development

```sh
bun test
bun run build
```

Open `demo/index.html` via a static server after building.

## License

MIT
