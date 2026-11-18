import { detectEnv, type Env } from './detect';
import { DEFAULT_LABELS, Loader, type Labels, type Theme } from './loader';
import { MATRIX, type Rule, type Target } from './matrix';

declare const __VERSION__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

export type { Env, Labels, Rule, Theme };
export interface State { phase: 'opening' | 'fallback' | 'continuing' | 'dismissed' | 'reentry'; url: string | null }
export interface AttemptInfo { rule: Rule; url: string }
export interface ResultInfo extends AttemptInfo {
    /** 'stayed-or-unknown' is NOT proof of failure: Meta webviews do not fire visibilitychange/pagehide reliably. */
    outcome: 'left' | 'stayed-or-unknown';
}

export class IabEscapeOptions {
    /** Target URL; relative values resolve against the current location. Default: current location.href. */
    url: string | null = null;
    /** Default: navigator.userAgent. */
    userAgent: string | null = null;
    /** Overrides the per-rule delay used by auto(). */
    delayMs: number | null = null;
    /** Override the rule's continueDelayMs (min wait before retry/parallel continues). null = use the rule. */
    continueDelayMs: number | null = null;
    includeUnproven = false;
    /** Query param appended as `=1` to the target so the landing page can tell. null disables. */
    markParam: string | null = 'iab_escaped';
    onAttempt: ((info: AttemptInfo) => void) | null = null;
    onResult: ((info: ResultInfo) => void) | null = null;
    /** Built-in full-screen loader (spinner, then an "Open in browser" button) while auto() runs. false = off. */
    ui = true;
    labels: Partial<Labels> = {};
    /** Sets the `--iab-*` CSS variables inline on the overlay. */
    theme: Theme = {};
    /** Phase callback for a custom UI (also called when the built-in UI is on). */
    onState: ((state: State) => void) | null = null;
    /** Where "Continue here" (and the auto fallback) navigates the webview. Default: `url`; none -> just dismiss. */
    continueUrl: string | null = null;
    /** 'auto': if the page did not go away after the fire, continue in the webview by itself. Device-unverified. */
    fallback: 'manual' | 'auto' | 'parallel' | 'retry' = 'manual';
    /** 'auto' only: wait this long after the fire before the first check. */
    fallbackMs = 2500;
    /** 'parallel' only: navigate to the destination this long after the scheme fires, whatever the confirm answer. */
    parallelDelayMs = 0;
    /** 'retry' (experimental): re-issue the destination navigation this often, until unload; every retryMs for 15 s, then every 1 s up to 10 min. */
    retryMs = 300;
    /** Called for every navigation to the destination the lib issues (diagnostics). */
    onContinue: ((url: string, reason: string) => void) | null = null;
    /** 'auto' only: stop re-checking (every 500 ms while the page is unfocused or hidden) this long after the fire. */
    fallbackMaxMs = 15000;
    /** Max automatic fires per page lifetime (the first fire + re-entry re-fires). */
    maxAutoFires = 3;
    /** Injectable for tests. Default: globalThis.window. */
    window: Window | null = null;
}

/** Maps `data-*` attributes of a script tag (dataset keys) to options. Absent or invalid values are ignored. */
export function optionsFromDataset(d: Record<string, string | undefined>): Partial<IabEscapeOptions> {
    const o: Partial<IabEscapeOptions> = {};
    const n = d.delayMs?.trim();
    if (n && Number.isFinite(Number(n)) && Number(n) >= 0) o.delayMs = Number(n);
    if (d.markParam !== undefined) o.markParam = d.markParam === '' ? null : d.markParam;
    if (d.includeUnproven !== undefined) o.includeUnproven = true;
    if (d.url) o.url = d.url;
    if (d.continueUrl) o.continueUrl = d.continueUrl;
    if (d.fallback === 'auto' || d.fallback === 'manual' || d.fallback === 'parallel' || d.fallback === 'retry') o.fallback = d.fallback;
    const rm = d.retryMs?.trim();
    if (rm && Number.isFinite(Number(rm)) && Number(rm) > 0) o.retryMs = Number(rm);
    const pd = d.parallelDelayMs?.trim();
    if (pd && Number.isFinite(Number(pd)) && Number(pd) >= 0) o.parallelDelayMs = Number(pd);
    const fm = d.fallbackMs?.trim();
    if (fm && Number.isFinite(Number(fm)) && Number(fm) >= 0) o.fallbackMs = Number(fm);
    if (d.ui !== undefined) o.ui = d.ui !== 'false';
    const theme: Theme = {};
    if (d.accent) theme.accent = d.accent;
    if (d.bg) theme.bg = d.bg;
    if (d.fg) theme.fg = d.fg;
    if (Object.keys(theme).length) o.theme = theme;
    const labels: Partial<Labels> = {};
    if (d.labelOpening) labels.opening = d.labelOpening;
    if (d.labelOpen) labels.open = d.labelOpen;
    if (d.labelStay) labels.stay = d.labelStay;
    if (d.labelContinuing) labels.continuing = d.labelContinuing;
    if (Object.keys(labels).length) o.labels = labels;
    return o;
}

const WATCH_MS = 3000;
const REVEAL_MS = 800;
const REENTER_LOCK_MS = 1000;
const AUTO_RECHECK_MS = 150;
const DEBOUNCE_MS = 300;
const RETRY_MAX_MS = 15000;
/** After RETRY_MAX_MS keep a slow retry: a user who stays long in the browser comes back to a live loop (FB iOS sends no event on return). */
const RETRY_SLOW_MS = 1000;
const RETRY_SLOW_MAX_MS = 600000;
const FIRED = '__iabEscapeFired';

const hasParam = (url: string, key: string) =>
    new URLSearchParams(url.split('#')[0].split('?')[1] ?? '').has(key);

export class IabEscape {
    /** Package version (injected at build time). */
    public static readonly version: string = typeof __VERSION__ === 'undefined' ? 'dev' : __VERSION__;
    /** ISO build time (injected at build time), or null. */
    public static readonly buildTime: string | null = typeof __BUILD_TIME__ === 'undefined' ? null : __BUILD_TIME__;

    private ldr: Loader | null = null;
    private fires = 0;
    private watching = false;
    private wentAway = false;
    private locked = false;
    private dismissed = false;
    private continuing = false;
    private contArmed = false;
    private base = '';

    public constructor(public options?: Partial<IabEscapeOptions>) {
        this.options = { ...new IabEscapeOptions(), ...options };
    }

    private get o(): IabEscapeOptions { return this.options as IabEscapeOptions; }
    private get win(): Window & { [FIRED]?: boolean } { return this.o.window ?? (globalThis as any).window; }

    public detect(): Env {
        return detectEnv(this.o.userAgent ?? this.win.navigator.userAgent);
    }

    public getRule(): Rule | null {
        const { app, os } = this.detect();
        const rule = MATRIX.find((r) => r.app === app && r.os === os);
        return rule && (rule.proven || this.o.includeUnproven) ? rule : null;
    }

    public buildUrl(): string | null {
        const rule = this.getRule();
        const target = rule && this.target();
        return rule && target ? rule.build(target) : null;
    }

    /** The page URL, captured before the first navigation (relative urls must not resolve against a scheme URL). */
    private pageUrl(): string { return (this.base ||= this.win.location.href); }

    /** Resolves the target (relative `url` against the current location); the query is never re-serialized. */
    private target(): Target | null {
        const base = this.pageUrl();
        const input = this.o.url ?? base;
        let resolved: URL;
        try { resolved = new URL(input, base); } catch { return null; }
        if (!/^https?:$/.test(resolved.protocol)) return null;
        const raw = /^https?:\/\//i.test(input) ? input : resolved.href;
        const h = raw.indexOf('#');
        let noHash = h < 0 ? raw : raw.slice(0, h);
        const hash = h < 0 ? '' : raw.slice(h);
        const key = this.o.markParam;
        if (key && !hasParam(noHash, key)) {
            noHash += (noHash.includes('?') ? (/[?&]$/.test(noHash) ? '' : '&') : '?') + key + '=1';
        }
        return { href: noHash + hash, noHash, protocol: resolved.protocol };
    }

    /** Fire now. Call inside a user gesture when wired to a button. */
    public escape(): boolean {
        const rule = this.getRule();
        const url = this.buildUrl();
        if (!rule || !url) return false;
        this.o.onAttempt?.({ rule, url });
        this.win.location.href = url;
        this.watch({ rule, url });
        return true;
    }

    /**
     * Fires escape() at most once per page load (flag on the window, shared by all instances).
     * While the document is still `loading`, waits for DOMContentLoaded first (never `load`); then delay 0 fires
     * synchronously, otherwise setTimeout. Never meta refresh (it loops on Android).
     * No-op when the current page URL already carries the mark param (loop guard).
     * Returns a cancel fn; cancelling before the fire re-arms the guard (StrictMode-safe).
     */
    public auto(): () => void {
        const { win } = this;
        const key = this.o.markParam;
        const rule = this.getRule();
        if (!rule || win[FIRED] || (key && hasParam(win.location.href, key))) return () => {};
        win[FIRED] = true;
        const { document: doc } = win;
        this.dismissed = false;
        if (this.o.ui) this.loader().show();
        this.state('opening');
        let done = false;
        let id: number | undefined;
        const fire = () => { done = true; if (!this.fireNow()) win[FIRED] = false; };
        const start = () => {
            doc.removeEventListener('DOMContentLoaded', start);
            if (this.delay(rule) <= 0) fire();
            else id = win.setTimeout(fire, this.delay(rule));
        };
        // Navigating while the document is still parsing leaves it half-loaded when the user comes back.
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
        else start();
        return () => {
            if (done) return;
            doc.removeEventListener('DOMContentLoaded', start);
            if (id !== undefined) win.clearTimeout(id);
            win[FIRED] = false;
            this.ldr?.hide();
        };
    }

    private loader(): Loader {
        return (this.ldr ??= new Loader(this.win.document, { ...DEFAULT_LABELS, ...this.o.labels }, this.o.theme, () => this.continue()));
    }

    private state(phase: State['phase']): void {
        this.o.onState?.({ phase, url: this.buildUrl() });
    }

    /** Stops re-fires and removes the built-in loader. Wire a custom UI's "Continue here" to this. */
    public dismiss(): void {
        this.dismissed = true;
        this.ldr?.hide();
        this.state('dismissed');
    }

    /** "Continue here": navigate the current webview to the destination, keeping the loader (no destination: just dismiss). */
    public continue(): void {
        const to = this.continueTarget();
        if (!to) return this.dismiss();
        this.go(to, 'tap');
    }

    /** Navigates the webview. The overlay stays until the page unloads: no bare host page in between. */
    private go(to: string, reason: string): void {
        if (!this.continuing) {
            this.continuing = true;
            this.dismissed = true; // stops scheme re-fires
            if (this.o.ui) this.loader().continuing();
            this.state('continuing');
        }
        this.o.onContinue?.(to, reason);
        this.win.location.href = to;
    }

    private continueTarget(): string | null {
        const input = this.o.continueUrl ?? this.o.url;
        if (!input) return null;
        try {
            const u = new URL(input, this.pageUrl());
            return /^https?:$/.test(u.protocol) ? (/^https?:\/\//i.test(input) ? input : u.href) : null;
        } catch { return null; }
    }

    /**
     * Continue in the webview AFTER the scheme fired (armed from fireNow only). 'retry'/'parallel': a loop re-issuing
     * the navigation every retryMs (first at fire + retryMs / parallelDelayMs) until pagehide or beforeunload (fast for 15 s, then 1 s up to 10 min);
     * the app's native prompt swallows navigations while open and no browser event reports it closing. 'auto': once
     * the page is visible AND focused (events + a 150 ms poll starting at fallbackMs).
     */
    private armContinue(mode: 'parallel' | 'auto' | 'retry'): void {
        const to = this.continueTarget();
        if (this.contArmed || !to) return;
        this.contArmed = true;
        const first = Math.max(mode === 'parallel' ? this.o.parallelDelayMs : this.o.retryMs, this.o.continueDelayMs ?? this.getRule()?.continueDelayMs ?? 0);
        const { win } = this;
        const doc = win.document;
        const focused = () => doc.visibilityState === 'visible' && (doc.hasFocus?.() ?? true);
        let started = false, gone = false, flight = false, quiet = false;
        const stopped = () => gone || flight || (this.dismissed && !this.continuing);
        const go = (reason: string) => { started = true; this.go(to, reason); };
        const retry = (reason: string) => {
            if (stopped() || quiet || this.wentAway || !focused()) return;
            quiet = true;
            win.setTimeout(() => { quiet = false; }, DEBOUNCE_MS);
            go(reason);
        };
        win.addEventListener('pagehide', () => { gone = true; });
        win.addEventListener('beforeunload', () => { flight = true; });
        if (mode !== 'auto') {
            // One retry loop for 'retry' and 'parallel'. Only ever armed after the scheme fired (fireNow), and the
            // app's prompt swallows navigations while open (no browser event reports it closing), so just keep trying.
            let elapsed = first;
            const tick = () => {
                if (stopped() || elapsed > RETRY_SLOW_MAX_MS) return;
                go(mode);
                const step = elapsed < RETRY_MAX_MS ? this.o.retryMs : RETRY_SLOW_MS;
                elapsed += step;
                win.setTimeout(tick, step);
            };
            win.setTimeout(tick, first);
            return;
        }
        win.addEventListener('focus', () => retry('focus'));
        win.addEventListener('pageshow', () => retry('pageshow'));
        doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') retry('visible'); });
        doc.addEventListener('pointerdown', () => retry('pointerdown'), true);
        doc.addEventListener('touchstart', () => retry('touchstart'), true);
        let waited = this.o.fallbackMs;
        const check = () => {
            if (stopped() || started || this.wentAway) return;
            if (focused()) return go('poll');
            waited += AUTO_RECHECK_MS;
            if (waited <= this.o.fallbackMaxMs) win.setTimeout(check, AUTO_RECHECK_MS);
        };
        win.setTimeout(check, this.o.fallbackMs);
    }

    private fallback(): void {
        const url = this.buildUrl();
        if (url && this.o.ui) this.loader().reveal(url);
        this.state('fallback');
    }

    private delay(rule: Rule): number { return this.o.delayMs ?? rule.delayMs; }

    /** One automatic fire: escape(), count it, start watching for re-entry, reveal the button soon after. */
    private fireNow(): boolean {
        if (!this.escape()) { this.ldr?.hide(); return false; }
        this.fires++;
        this.watchReentry();
        this.win.setTimeout(() => { if (!this.dismissed) this.fallback(); }, REVEAL_MS);
        if (this.o.fallback === 'auto' || this.o.fallback === 'parallel' || this.o.fallback === 'retry') this.armContinue(this.o.fallback);
        return true;
    }

    /**
     * Re-entry: the page is shown again after a fire that left (pagehide/hidden seen, or a persisted pageshow,
     * i.e. bfcache / restored webview). Re-fires ONCE per re-entry, up to maxAutoFires per page lifetime.
     * A page that never went away (user pressed Cancel) is not re-fired; the button stays.
     */
    private watchReentry(): void {
        if (this.watching) return;
        this.watching = true;
        const { win } = this;
        const doc = win.document;
        win.addEventListener('pagehide', () => { this.wentAway = true; });
        doc.addEventListener('visibilitychange', () => {
            if (doc.visibilityState === 'hidden') this.wentAway = true;
            else this.reenter();
        });
        win.addEventListener('pageshow', (e: Event) => {
            if ((e as PageTransitionEvent).persisted) { this.wentAway = true; this.reenter(); }
        });
    }

    private reenter(): void {
        const { win } = this;
        const rule = this.getRule();
        if (!this.wentAway || this.locked || this.dismissed || !rule) return;
        this.wentAway = false;
        this.locked = true;
        win.setTimeout(() => { this.locked = false; }, REENTER_LOCK_MS);
        if (this.fires >= this.o.maxAutoFires) return this.fallback();
        if (this.o.ui) this.loader().show();
        this.state('reentry');
        if (this.delay(rule) <= 0) this.fireNow();
        else win.setTimeout(() => this.fireNow(), this.delay(rule));
    }

    /** Plain `<a>` tap path (proven on all three). Leaves the element untouched when there is no rule. */
    public bindLink(a: HTMLAnchorElement): boolean {
        const url = this.buildUrl();
        if (!url) return false;
        a.href = url;
        return true;
    }

    private watch(info: AttemptInfo): void {
        const { win } = this;
        let left = false;
        const mark = () => { left = true; };
        const onVis = () => { if (win.document.visibilityState === 'hidden') mark(); };
        win.addEventListener('pagehide', mark);
        win.document.addEventListener('visibilitychange', onVis);
        win.setTimeout(() => {
            win.removeEventListener('pagehide', mark);
            win.document.removeEventListener('visibilitychange', onVis);
            this.o.onResult?.({ ...info, outcome: left ? 'left' : 'stayed-or-unknown' });
        }, WATCH_MS);
    }
}
