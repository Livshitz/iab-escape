import { expect, test } from 'bun:test';
import { IabEscape } from '../src/IabEscape';
import { fakeWindow, UA } from './helpers';

const make = (ua: string, o: any = {}, href?: string) => {
    const f = fakeWindow(ua, href);
    return { ...f, e: new IabEscape({ window: f.win, ...o }) };
};
const T = 'https://example.com/p?a=1#frag';
const START = T;
const IG_T = 'instagram://extbrowser/?url=https%3A%2F%2Fexample.com%2Fp%3Fa%3D1%26escaped%3Dinstagram%23frag';
const XS_T = 'x-safari-https://example.com/p?a=1&escaped=facebook#frag';
const INTENT_T = 'intent://example.com/p?a=1&escaped=facebook#Intent;scheme=https;end';

// Hard-coded from probe.js behaviour (scheme.xs / ig / intent) for a target with a real-looking fbclid.
const PROBE = 'https://h.example.com/iab-probe/landed.html?m=V07&src=xs&t=1763300000000&fbclid=IwZXh0bgNhZW0CMTEAAAAA';
const PROBE_ENC = 'https%3A%2F%2Fh.example.com%2Fiab-probe%2Flanded.html%3Fm%3DV07%26src%3Dxs%26t%3D1763300000000%26fbclid%3DIwZXh0bgNhZW0CMTEAAAAA';
const PROBE_EXPECT = {
    'mark off': {
        fbIos: 'x-safari-' + PROBE,
        igIos: 'instagram://extbrowser/?url=' + PROBE_ENC,
        fbAndroid: 'intent://h.example.com/iab-probe/landed.html?m=V07&src=xs&t=1763300000000&fbclid=IwZXh0bgNhZW0CMTEAAAAA#Intent;scheme=https;end',
    },
    'mark on': {
        fbIos: 'x-safari-' + PROBE + '&escaped=facebook',
        igIos: 'instagram://extbrowser/?url=' + PROBE_ENC + '%26escaped%3Dinstagram',
        fbAndroid: 'intent://h.example.com/iab-probe/landed.html?m=V07&src=xs&t=1763300000000&fbclid=IwZXh0bgNhZW0CMTEAAAAA&escaped=facebook#Intent;scheme=https;end',
    },
};
for (const [label, rows] of Object.entries(PROBE_EXPECT)) {
    for (const [ua, expected] of Object.entries(rows)) {
        test(`byte-equal to probe.js: ${ua}, ${label}`, () => {
            const markParam = label === 'mark off' ? null : 'escaped';
            expect(make((UA as any)[ua], { url: PROBE, markParam }).e.buildUrl()).toBe(expected);
        });
    }
}

test('ig ios: extbrowser, encoded target, mark param, fragment kept', () => {
    expect(make(UA.igIos, { url: T }).e.buildUrl()).toBe(IG_T);
});
test('fb ios: x-safari-https + target, query kept', () => {
    expect(make(UA.fbIos, { url: T }).e.buildUrl()).toBe(XS_T);
});
test('fb ios: http target -> null', () => {
    expect(make(UA.fbIos, { url: 'http://example.com/' }).e.buildUrl()).toBeNull();
});
test('fb android: intent, fragment dropped, query kept', () => {
    expect(make(UA.fbAndroid, { url: T }).e.buildUrl()).toBe(INTENT_T);
});
test('fb android: http target keeps scheme=http', () => {
    expect(make(UA.fbAndroid, { url: 'http://example.com/', markParam: null }).e.buildUrl()).toBe('intent://example.com/#Intent;scheme=http;end');
});
test('fb android: no query, mark disabled / custom mark', () => {
    expect(make(UA.fbAndroid, { url: 'https://example.com/', markParam: null }).e.buildUrl()).toBe('intent://example.com/#Intent;scheme=https;end');
    expect(make(UA.fbAndroid, { url: 'https://example.com/', markParam: 'esc' }).e.buildUrl()).toBe('intent://example.com/?esc=facebook#Intent;scheme=https;end');
});
test('default url comes from window.location', () => {
    expect(make(UA.fbAndroid, {}, 'https://h.io/x').e.buildUrl()).toBe('intent://h.io/x?escaped=facebook#Intent;scheme=https;end');
});
test('relative url resolves against the current location', () => {
    const base = 'https://h.io/dir/page.html?z=9';
    expect(make(UA.fbIos, { url: './landed.html?m=1' }, base).e.buildUrl()).toBe('x-safari-https://h.io/dir/landed.html?m=1&escaped=facebook');
    expect(make(UA.fbIos, { url: '/abs' }, base).e.buildUrl()).toBe('x-safari-https://h.io/abs?escaped=facebook');
});
test('query survives byte-identical (no re-serialization), mark appended raw', () => {
    const q = 'https://example.com/p?q=a%20b&flag&s=\'~!';
    expect(make(UA.fbIos, { url: q, markParam: null }).e.buildUrl()).toBe('x-safari-' + q);
    expect(make(UA.fbIos, { url: q }).e.buildUrl()).toBe('x-safari-' + q + '&escaped=facebook');
    expect(make(UA.fbIos, { url: 'https://example.com/p?flag#h' }).e.buildUrl()).toBe('x-safari-https://example.com/p?flag&escaped=facebook#h');
});
test('mark already present -> URL untouched', () => {
    const u = 'https://example.com/p?escaped=0&a=1#f';
    expect(make(UA.fbIos, { url: u }).e.buildUrl()).toBe('x-safari-' + u);
});
test('bare mark param (no value) counts as present: URL untouched, auto() skipped', () => {
    const u = 'https://example.com/p?escaped#h';
    expect(make(UA.fbIos, { url: u }).e.buildUrl()).toBe('x-safari-' + u);
    const { e, win } = make(UA.igIos, { url: T }, 'https://example.com/p?escaped');
    e.auto();
    expect(win.location.href).toBe('https://example.com/p?escaped');
});
test('non-http target -> null', () => {
    expect(make(UA.igIos, { url: 'javascript:alert(1)' }).e.buildUrl()).toBeNull();
    expect(make(UA.igIos, { url: 'ftp://example.com/x' }).e.buildUrl()).toBeNull();
});
test('unproven rows gated by includeUnproven', () => {
    const rows: [string, string][] = [
        [UA.igAndroid, INTENT_T.replace('facebook', 'instagram')],
        [UA.threadsIos, 'barcelona://extbrowser/?url=https%3A%2F%2Fexample.com%2Fp%3Fa%3D1%26escaped%3Dthreads%23frag'],
        [UA.messengerIos, XS_T.replace('facebook', 'messenger')],
    ];
    for (const [ua, expected] of rows) {
        expect(make(ua, { url: T }).e.buildUrl()).toBeNull();
        expect(make(ua, { url: T }).e.getRule()).toBeNull();
        expect(make(ua, { url: T, includeUnproven: true }).e.buildUrl()).toBe(expected);
    }
});
test('plain browsers: no rule, escape false, href untouched', () => {
    for (const ua of [UA.safari, UA.chrome]) {
        const { e, win } = make(ua, { url: T });
        expect(e.getRule()).toBeNull();
        expect(e.escape()).toBe(false);
        expect(win.location.href).toBe(START);
    }
});
test('testedOn present only on proven rows', () => {
    expect(make(UA.fbIos).e.getRule()?.testedOn?.date).toBe('2026-11-16');
    expect(make(UA.igAndroid, { includeUnproven: true }).e.getRule()?.testedOn).toBeNull();
});
test('escape sets location.href and calls onAttempt', () => {
    let seen: any;
    const { e, win } = make(UA.fbAndroid, { url: T, onAttempt: (i: any) => (seen = i) });
    expect(e.escape()).toBe(true);
    expect(win.location.href).toBe(INTENT_T);
    expect(seen.url).toBe(INTENT_T);
});
test('bindLink sets href, or leaves it untouched', () => {
    const a: any = { href: 'orig' };
    expect(make(UA.igIos, { url: T }).e.bindLink(a)).toBe(true);
    expect(a.href).toBe(IG_T);
    const b: any = { href: 'orig' };
    expect(make(UA.safari, { url: T }).e.bindLink(b)).toBe(false);
    expect(b.href).toBe('orig');
});
test('version is exposed', () => {
    expect(typeof IabEscape.version).toBe('string');
});

// auto()
test('auto: delay 0 fires synchronously inside auto()', () => {
    const { e, win } = make(UA.igIos, { url: T });
    e.auto();
    expect(win.location.href).toBe(IG_T);
});
test('auto: fb ios fires 1500 ms after the call (no load wait), once', () => {
    const { e, win, advance } = make(UA.fbIos, { url: T });
    e.auto();
    advance(1499);
    expect(win.location.href).toBe(START);
    advance(1);
    expect(win.location.href).toBe(XS_T);
    win.location.href = 'reset';
    e.auto();
    advance(10000);
    expect(win.location.href).toBe('reset');
});
test('auto: delayMs override wins (500, and 0 = sync)', () => {
    const b = make(UA.igIos, { url: T, delayMs: 500 });
    b.e.auto();
    expect(b.win.location.href).toBe(START);
    b.advance(499);
    expect(b.win.location.href).toBe(START);
    b.advance(1);
    expect(b.win.location.href).toBe(IG_T);
    const c = make(UA.fbIos, { url: T, delayMs: 0 });
    c.e.auto();
    expect(c.win.location.href).toBe(XS_T);
});
test('auto: cancel prevents firing', () => {
    const { e, win, advance } = make(UA.fbIos, { url: T });
    e.auto()();
    advance(5000);
    expect(win.location.href).toBe(START);
});
test('auto: loading doc, delay 0 -> nothing before DOMContentLoaded, fires inside it', () => {
    const { e, win, doc, advance, emit } = make(UA.igIos, { url: T });
    doc.readyState = 'loading';
    e.auto();
    advance(10000);
    emit('load');
    expect(win.location.href).toBe(START);
    emit('DOMContentLoaded');
    expect(win.location.href).toBe(IG_T);
});
test('auto: loading doc, 1500 -> fires 1500 ms after DOMContentLoaded', () => {
    const { e, win, doc, advance, emit } = make(UA.fbIos, { url: T });
    doc.readyState = 'loading';
    e.auto();
    advance(10000);
    expect(win.location.href).toBe(START);
    emit('DOMContentLoaded');
    advance(1499);
    expect(win.location.href).toBe(START);
    advance(1);
    expect(win.location.href).toBe(XS_T);
});
test('auto: cancel while waiting for DOMContentLoaded, and re-arm', () => {
    let n = 0;
    const { e, win, doc, advance, emit } = make(UA.igIos, { url: T, onAttempt: () => n++ });
    doc.readyState = 'loading';
    e.auto()();
    emit('DOMContentLoaded');
    advance(5000);
    expect(win.location.href).toBe(START);
    e.auto();
    emit('DOMContentLoaded');
    expect(n).toBe(1);
});
test('auto: cancel after DOMContentLoaded, before the timer', () => {
    const { e, win, doc, advance, emit } = make(UA.fbIos, { url: T });
    doc.readyState = 'loading';
    const cancel = e.auto();
    emit('DOMContentLoaded');
    advance(1000);
    cancel();
    advance(10000);
    expect(win.location.href).toBe(START);
});
test('auto: interactive doc behaves as complete (delay from the call)', () => {
    const { e, win, doc, advance } = make(UA.fbIos, { url: T });
    doc.readyState = 'interactive';
    e.auto();
    advance(1500);
    expect(win.location.href).toBe(XS_T);
});
test('auto: no rule -> nothing scheduled', () => {
    const { e, win, advance } = make(UA.safari, { url: T });
    e.auto();
    advance(5000);
    expect(win.location.href).toBe(START);
});
test('auto: two instances on one window -> one navigation', () => {
    const f = fakeWindow(UA.fbIos);
    let n = 0;
    const o = { window: f.win, url: T, onAttempt: () => n++ };
    new IabEscape(o).auto();
    new IabEscape(o).auto();
    f.advance(5000);
    expect(n).toBe(1);
});
test('auto: StrictMode sequence auto, cancel, auto fires once', () => {
    let n = 0;
    const { e, win, advance } = make(UA.fbIos, { url: T, onAttempt: () => n++ });
    const cancel = e.auto();
    cancel();
    e.auto();
    advance(5000);
    expect(n).toBe(1);
    expect(win.location.href).toBe(XS_T);
});
test('auto: cancel after the fire does not re-arm the guard', () => {
    let n = 0;
    const { e, advance } = make(UA.fbIos, { url: T, onAttempt: () => n++ });
    const cancel = e.auto();
    advance(1500);
    cancel();
    e.auto();
    advance(5000);
    expect(n).toBe(1);
});
test('auto: page URL already carries the mark -> no-op; escape() still works', () => {
    const { e, win, advance } = make(UA.igIos, { url: T }, 'https://example.com/p?escaped=1');
    e.auto();
    advance(5000);
    expect(win.location.href).toBe('https://example.com/p?escaped=1');
    expect(e.escape()).toBe(true);
    expect(win.location.href).toBe(IG_T);
});
test('onResult: left on pagehide / hidden, else stayed-or-unknown', () => {
    const run = (act?: (f: ReturnType<typeof make>) => void) => {
        let out: any;
        const f = make(UA.fbAndroid, { url: T, onResult: (i: any) => (out = i.outcome) });
        f.e.escape();
        act?.(f);
        f.advance(3000);
        return out;
    };
    expect(run((f) => f.emit('pagehide'))).toBe('left');
    expect(run((f) => { f.doc.visibilityState = 'hidden'; f.emit('visibilitychange'); })).toBe('left');
    expect(run()).toBe('stayed-or-unknown');
});
