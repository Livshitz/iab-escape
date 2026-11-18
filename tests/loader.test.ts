import { expect, test } from 'bun:test';
import { IabEscape } from '../src/IabEscape';
import { fakeWindow, UA } from './helpers';

const T = 'https://example.com/p?a=1#frag';
const IG_T = 'instagram://extbrowser/?url=https%3A%2F%2Fexample.com%2Fp%3Fa%3D1%26escaped%3Dinstagram%23frag';
const XS_T = 'x-safari-https://example.com/p?a=1&escaped=facebook#frag';

const make = (ua: string, o: any = {}) => {
    const f = fakeWindow(ua, 'https://example.com/p');
    let n = 0;
    const e = new IabEscape({ window: f.win, url: T, onAttempt: () => n++, ...o });
    return { ...f, e, count: () => n };
};
/** Simulate: the page goes to the background (user left), then comes back. */
const leaveAndReturn = (f: ReturnType<typeof make>) => {
    f.doc.visibilityState = 'hidden';
    f.emit('visibilitychange');
    f.doc.visibilityState = 'visible';
    f.emit('visibilitychange');
};

test('loader: overlay appears at once, spinner state, no button yet', () => {
    const f = make(UA.fbIos);
    f.e.auto();
    const o = f.overlay()!;
    expect(o).not.toBeNull();
    expect(o.find('ie-msg')!.textContent).toBe('Opening in your browser…');
    expect(o.find('ie-open')!.hidden).toBe(true);
});
test('loader: ui is on by default; ui:false shows nothing; no rule -> no overlay', () => {
    const d = make(UA.fbIos);
    d.e.auto();
    expect(d.overlay()).not.toBeNull();
    const a = make(UA.fbIos, { ui: false });
    a.e.auto();
    a.advance(5000);
    expect(a.overlay()).toBeNull();
    const b = make(UA.safari);
    b.e.auto();
    expect(b.overlay()).toBeNull();
});
test('loader: cancel before the fire removes the overlay', () => {
    const f = make(UA.fbIos);
    f.e.auto()();
    expect(f.overlay()).toBeNull();
});
test('loader: after the fire the button appears with the scheme URL; labels overridable', () => {
    const f = make(UA.fbIos, { labels: { open: 'Go' } });
    f.e.auto();
    f.advance(1500);
    expect(f.win.location.href).toBe(XS_T);
    f.advance(799);
    expect(f.overlay()!.find('ie-open')!.hidden).toBe(true);
    f.advance(1);
    const btn = f.overlay()!.find('ie-open')!;
    expect(btn.hidden).toBe(false);
    expect(btn.href).toBe(XS_T);
    expect(btn.textContent).toBe('Go');
    expect(f.overlay()!.find('ie-stay')!.hidden).toBe(false);
});
test('loader: "Continue here" keeps the overlay (continuing text), stops re-fires', () => {
    const f = make(UA.igIos);
    f.e.auto();
    f.advance(800);
    f.overlay()!.find('ie-stay')!.click();
    const o = f.overlay()!;
    expect(o).not.toBeNull();
    expect(o.find('ie-msg')!.textContent).toBe('Opening…');
    expect(o.find('ie-open')!.hidden).toBe(true);
    expect(o.find('ie-stay')!.hidden).toBe(true);
    leaveAndReturn(f);
    expect(f.count()).toBe(1);
});

test('re-entry: left then visible fires once more and shows the loader again', () => {
    const f = make(UA.igIos);
    f.e.auto();
    f.advance(800);
    expect(f.count()).toBe(1);
    leaveAndReturn(f);
    expect(f.count()).toBe(2);
    expect(f.overlay()!.find('ie-open')!.hidden).toBe(true);
});
test('re-entry: a persisted pageshow alone re-fires; non-persisted does not', () => {
    const f = make(UA.igIos);
    f.e.auto();
    f.emit('pageshow', { persisted: false });
    expect(f.count()).toBe(1);
    f.emit('pageshow', { persisted: true });
    expect(f.count()).toBe(2);
});
test('re-entry: pageshow + visibilitychange of ONE return fire once; delay respected', () => {
    const f = make(UA.fbIos);
    f.e.auto();
    f.advance(1500);
    expect(f.count()).toBe(1);
    f.doc.visibilityState = 'hidden';
    f.emit('pagehide');
    f.emit('visibilitychange');
    f.doc.visibilityState = 'visible';
    f.emit('pageshow', { persisted: true });
    f.emit('visibilitychange');
    expect(f.count()).toBe(1);
    f.advance(1500);
    expect(f.count()).toBe(2);
});
test('cancel path: page never hidden -> visibility changes do not re-fire; button stays', () => {
    const f = make(UA.igIos);
    f.e.auto();
    f.advance(800);
    f.emit('visibilitychange');
    f.emit('visibilitychange');
    f.advance(5000);
    expect(f.count()).toBe(1);
    expect(f.overlay()!.find('ie-open')!.hidden).toBe(false);
});
test('maxAutoFires caps automatic fires per page lifetime and keeps the button', () => {
    const f = make(UA.igIos, { maxAutoFires: 2 });
    f.e.auto();
    leaveAndReturn(f);
    expect(f.count()).toBe(2);
    f.advance(1000);
    leaveAndReturn(f);
    f.advance(5000);
    expect(f.count()).toBe(2);
    const btn = f.overlay()!.find('ie-open')!;
    expect(btn.hidden).toBe(false);
    expect(btn.href).toBe(IG_T);
});

test('theme option sets the --iab-* CSS variables inline; none -> no inline style', () => {
    const f = make(UA.fbIos, { theme: { accent: '#e33', bg: '#000', radius: '4px' } });
    f.e.auto();
    expect(f.overlay()!.attrs.style).toBe('--iab-bg:#000;--iab-accent:#e33;--iab-radius:4px');
    const g = make(UA.fbIos);
    g.e.auto();
    expect(g.overlay()!.attrs.style).toBeUndefined();
});
test('onState sequence: opening -> fallback (with the scheme URL), also with the built-in UI on', () => {
    const seen: any[] = [];
    const f = make(UA.igIos, { onState: (s: any) => seen.push(s) });
    f.e.auto();
    f.advance(800);
    expect(seen).toEqual([{ phase: 'opening', url: IG_T }, { phase: 'fallback', url: IG_T }]);
});
test('onState with ui:false: no overlay, custom UI gets reentry; dismiss() stops re-fire', () => {
    const phases: string[] = [];
    const f = make(UA.igIos, { ui: false, onState: (s: any) => phases.push(s.phase) });
    f.e.auto();
    f.advance(800);
    leaveAndReturn(f);
    expect(f.overlay()).toBeNull();
    expect(phases).toEqual(['opening', 'fallback', 'reentry']);
    expect(f.count()).toBe(2);
    f.advance(1000);
    f.e.dismiss();
    leaveAndReturn(f);
    f.advance(5000);
    expect(phases).toEqual(['opening', 'fallback', 'reentry', 'fallback', 'dismissed']);
    expect(f.count()).toBe(2);
});

const DEST = 'https://dest.example/x?y=1';
test('continue: navigates the webview to continueUrl; "Continue here" button does the same', () => {
    const f = make(UA.igIos, { continueUrl: DEST });
    f.e.auto();
    f.advance(800);
    f.overlay()!.find('ie-stay')!.click();
    expect(f.overlay()).not.toBeNull(); // kept until the page unloads
    expect(f.win.location.href).toBe(DEST);
});
test('continue: defaults to the target url; relative continueUrl resolves', () => {
    const a = make(UA.igIos);
    a.e.auto();
    a.e.continue();
    expect(a.win.location.href).toBe(T);
    const b = make(UA.igIos, { continueUrl: '/landing' });
    b.e.auto();
    b.e.continue();
    expect(b.win.location.href).toBe('https://example.com/landing');
});
test('continue: no url given -> only dismisses', () => {
    const f = fakeWindow(UA.igIos, 'https://example.com/p');
    const e = new IabEscape({ window: f.win });
    e.auto();
    const after = f.win.location.href;
    e.continue();
    expect(f.overlay()).toBeNull();
    expect(f.win.location.href).toBe(after);
});
test('fallback manual (default): never navigates by itself', () => {
    const f = make(UA.igIos, { continueUrl: DEST });
    f.e.auto();
    f.advance(30000);
    expect(f.win.location.href).toBe(IG_T);
});
test('fallback auto: navigates once after fallbackMs when visible and focused, no re-fire after', () => {
    const f = make(UA.igIos, { fallback: 'auto', continueUrl: DEST });
    f.e.auto();
    f.advance(2499);
    expect(f.win.location.href).toBe(IG_T);
    f.advance(1);
    expect(f.win.location.href).toBe(DEST);
    f.win.location.href = 'reset';
    f.advance(30000);
    leaveAndReturn(f);
    f.advance(5000);
    expect(f.win.location.href).toBe('reset');
    expect(f.count()).toBe(1);
});
test('fallback auto: waits while the page is unfocused (native dialog), continues when focus returns', () => {
    const f = make(UA.igIos, { fallback: 'auto', continueUrl: DEST });
    f.e.auto();
    f.doc.focused = false;
    f.advance(2500);
    f.advance(5000);
    expect(f.win.location.href).toBe(IG_T);
    f.doc.focused = true;
    f.advance(500);
    expect(f.win.location.href).toBe(DEST);
});
test('fallback auto: gives up after fallbackMaxMs while unfocused', () => {
    const f = make(UA.igIos, { fallback: 'auto', continueUrl: DEST, fallbackMaxMs: 4000 });
    f.e.auto();
    f.doc.focused = false;
    f.advance(10000);
    f.doc.focused = true;
    f.advance(5000);
    expect(f.win.location.href).toBe(IG_T);
});
test('fallback auto: does not navigate if the page went hidden/pagehide', () => {
    const f = make(UA.igIos, { fallback: 'auto', continueUrl: DEST });
    f.e.auto();
    f.doc.visibilityState = 'hidden';
    f.emit('visibilitychange');
    f.advance(10000);
    expect(f.win.location.href).toBe(IG_T);
    const g = make(UA.igIos, { fallback: 'auto', continueUrl: DEST });
    g.e.auto();
    g.emit('pagehide');
    g.advance(10000);
    expect(g.win.location.href).toBe(IG_T);
});

test('auto fallback polls every 150 ms while unfocused', () => {
    const f = make(UA.igIos, { fallback: 'auto', continueUrl: DEST });
    f.e.auto();
    f.doc.focused = false;
    f.advance(2500);
    f.doc.focused = true;
    f.advance(149);
    expect(f.win.location.href).toBe(IG_T);
    f.advance(1);
    expect(f.win.location.href).toBe(DEST);
});
test('auto fallback keeps the overlay while navigating (no bare page)', () => {
    const f = make(UA.igIos, { fallback: 'auto', continueUrl: DEST });
    f.e.auto();
    f.advance(2500);
    expect(f.win.location.href).toBe(DEST);
    expect(f.overlay()!.find('ie-msg')!.textContent).toBe('Opening…');
});
test('custom continuing label; onState gets continuing', () => {
    const phases: string[] = [];
    const f = make(UA.igIos, { continueUrl: DEST, labels: { continuing: 'Hold on' }, onState: (s: any) => phases.push(s.phase) });
    f.e.auto();
    f.e.continue();
    expect(f.overlay()!.find('ie-msg')!.textContent).toBe('Hold on');
    expect(phases.at(-1)).toBe('continuing');
});
test('parallel: navigates to the destination right after the scheme (delay 0), once re-fire-free', () => {
    const f = make(UA.igIos, { fallback: 'parallel', continueDelayMs: 0, continueUrl: DEST });
    f.e.auto();
    expect(f.win.location.href).toBe(IG_T); // scheme first, destination only after
    f.advance(0);
    expect(f.win.location.href).toBe(DEST);
    expect(f.count()).toBe(1);
    f.win.location.href = 'reset';
    leaveAndReturn(f);
    expect(f.count()).toBe(1); // no scheme re-fire after a continue
    expect(f.overlay()!.find('ie-msg')!.textContent).toBe('Opening…');
});
test('parallel: parallelDelayMs delays the destination navigation; ignores focus/visibility', () => {
    const f = make(UA.igIos, { fallback: 'parallel', parallelDelayMs: 1000, continueDelayMs: 0, continueUrl: DEST });
    f.e.auto();
    f.doc.focused = false;
    f.advance(999);
    expect(f.win.location.href).toBe(IG_T);
    f.advance(1);
    expect(f.win.location.href).toBe(DEST);
});
test('parallel: no destination -> no navigation (loader stays in fallback)', () => {
    const w = fakeWindow(UA.igIos, 'https://example.com/p');
    const e = new IabEscape({ window: w.win, fallback: 'parallel' });
    e.auto();
    w.advance(5000);
    expect(w.win.location.href).toBe('instagram://extbrowser/?url=https%3A%2F%2Fexample.com%2Fp%3Fescaped%3Dinstagram');
});

test('auto: focus/pointer event navigates early when focused; not when unfocused or the page left', () => {
    const a = make(UA.igIos, { fallback: 'auto', continueUrl: DEST });
    a.e.auto();
    a.doc.focused = false;
    a.emit('pointerdown');
    expect(a.win.location.href).toBe(IG_T);
    a.doc.focused = true;
    a.emit('focus');
    expect(a.win.location.href).toBe(DEST);
    a.win.location.href = 'dropped';
    a.advance(400);
    a.emit('focus');
    expect(a.win.location.href).toBe(DEST); // re-issued after a dropped navigation
    const b = make(UA.igIos, { fallback: 'auto', continueUrl: DEST });
    b.e.auto();
    b.emit('pagehide');
    b.emit('focus');
    expect(b.win.location.href).toBe(IG_T);
});

// --- retry loop ('retry' and 'parallel' share it) ---
const loop = (o: any = {}, ua = UA.igIos) => {
    const seen: string[] = [];
    const f = make(ua, { continueUrl: DEST, continueDelayMs: 0, onContinue: (_u: string, r: string) => seen.push(r), ...o });
    return { ...f, seen };
};
test('retry: never navigates to the destination before the scheme fired (fb ios fires at 1500)', () => {
    const f = loop({ fallback: 'retry' }, UA.fbIos);
    f.e.auto();
    f.advance(1499);
    expect(f.seen).toEqual([]);
    expect(f.win.location.href).toBe('https://example.com/p');
    f.advance(1);
    expect(f.win.location.href).toBe(XS_T); // scheme first
    expect(f.seen).toEqual([]);
});
test('retry: first retry at fire + retryMs (default 300), then every retryMs', () => {
    const f = loop({ fallback: 'retry' });
    f.e.auto();
    expect(f.win.location.href).toBe(IG_T);
    f.advance(299);
    expect(f.seen).toEqual([]);
    f.advance(1);
    expect(f.seen).toEqual(['retry']);
    f.win.location.href = 'dropped';
    f.advance(300);
    expect(f.win.location.href).toBe(DEST);
    expect(f.seen).toEqual(['retry', 'retry']);
});
test('retry: custom retryMs; stops on pagehide', () => {
    const f = loop({ fallback: 'retry', retryMs: 100 });
    f.e.auto();
    f.advance(350);
    expect(f.seen.length).toBe(3);
    f.emit('pagehide');
    f.advance(5000);
    expect(f.seen.length).toBe(3);
});
test('retry: stops on beforeunload', () => {
    const f = loop({ fallback: 'retry' });
    f.e.auto();
    f.advance(300);
    f.emit('beforeunload');
    f.advance(5000);
    expect(f.seen.length).toBe(1);
});
test('retry: fast for 15 s, then 1 s (user back after a long stay), stops at 10 min', () => {
    const f = loop({ fallback: 'retry' });
    f.e.auto();
    f.advance(15000);
    const fast = f.seen.length;
    expect(fast).toBeGreaterThan(40);
    expect(fast).toBeLessThanOrEqual(52);
    f.advance(45000);
    expect(f.seen.length - fast).toBeGreaterThanOrEqual(44);
    expect(f.seen.length - fast).toBeLessThanOrEqual(46);
    f.advance(600000);
    const n = f.seen.length;
    f.advance(60000);
    expect(f.seen.length).toBe(n);
});
test('parallel uses the same loop: first at parallelDelayMs, then every retryMs, reason "parallel"', () => {
    const f = loop({ fallback: 'parallel', parallelDelayMs: 1000, retryMs: 500 });
    f.e.auto();
    f.advance(999);
    expect(f.seen).toEqual([]);
    f.advance(1);
    expect(f.seen).toEqual(['parallel']);
    f.advance(1000);
    expect(f.seen).toEqual(['parallel', 'parallel', 'parallel']);
    f.emit('pagehide');
    f.advance(5000);
    expect(f.seen.length).toBe(3);
});
test('onContinue reports "tap" for the explicit Continue', () => {
    const f = loop({});
    f.e.auto();
    f.e.continue();
    expect(f.seen).toEqual(['tap']);
});

test('retry: IG iOS waits continueDelayMs (2000) before the first retry — its open-app prompt gives no signal', () => {
    const f = loop({ fallback: 'retry', continueDelayMs: null });
    f.e.auto();
    f.advance(1999);
    expect(f.seen).toEqual([]);
    f.advance(1);
    expect(f.seen).toEqual(['retry']);
    f.advance(300);
    expect(f.seen).toEqual(['retry', 'retry']);
});
test('retry: FB Android has no continueDelayMs (first retry at retryMs)', () => {
    const f = loop({ fallback: 'retry', continueDelayMs: null }, UA.fbAndroid);
    f.e.auto();
    f.advance(300);
    expect(f.seen).toEqual(['retry']);
});
