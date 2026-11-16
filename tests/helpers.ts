export const UA = {
    fbIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_7_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/587.0.0.31.71;FBBV/1110946418;FBDV/iPhone14,3;FBMD/iPhone;FBSN/iOS;FBSV/26.7.3;FBLC/en_US;FBOP/5]',
    igIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_7_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 455.0.0.35.67 (iPhone14,3; iOS 26_7_3; en_US; en; scale=3.00; 1284x2778; 0) IABMV/1',
    fbAndroid: 'Mozilla/5.0 (Linux; Android 16; NE2213 Build/BP2A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/157.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/587.0.0.39.55;]',
    igAndroid: 'Mozilla/5.0 (Linux; Android 16; NE2213) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/157.0.0.0 Mobile Safari/537.36 Instagram 400.0.0.0.0 Android (36/16)',
    safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.3 Mobile/15E148 Safari/604.1',
    chrome: 'Mozilla/5.0 (Linux; Android 16; NE2213) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36',
    threadsIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 400.0.0.0.0 (iPhone14,3; iOS 26_0)',
    messengerIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/500.0.0;FBDV/iPhone14,3]',
    messengerAndroid: 'Mozilla/5.0 (Linux; Android 16; NE2213) AppleWebKit/537.36 Chrome/157.0.0.0 Mobile Safari/537.36 [FB_IAB/MESSENGER;FBAV/500.0.0;]',
};

type Fn = (ev?: any) => void;

/** Minimal fake element: enough DOM for the loader. */
export class FakeEl {
    children: FakeEl[] = [];
    parent: FakeEl | null = null;
    className = '';
    id = '';
    href = '';
    hidden = false;
    textContent = '';
    private ls: Record<string, Fn[]> = {};
    constructor(public tag: string) {}
    attrs: Record<string, string> = {};
    setAttribute(k: string, v: string) { this.attrs[k] = v; }
    appendChild(c: FakeEl) { c.parent = this; this.children.push(c); return c; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
    addEventListener(n: string, f: Fn) { (this.ls[n] ??= []).push(f); }
    click() { const ev = { preventDefault() {} }; (this.ls.click ?? []).forEach((f) => f(ev)); }
    find(cls: string): FakeEl | null {
        if (this.className === cls) return this;
        for (const c of this.children) { const r = c.find(cls); if (r) return r; }
        return null;
    }
}

/** Minimal fake window with a manual timer queue. */
export function fakeWindow(ua: string, href = 'https://example.com/p?a=1#frag') {
    const timers = new Map<number, { at: number; fn: Fn }>();
    const listeners: Record<string, Fn[]> = {};
    let now = 0, next = 1;
    const add = (n: string, f: Fn) => (listeners[n] ??= []).push(f);
    const rem = (n: string, f: Fn) => { listeners[n] = (listeners[n] ?? []).filter((x) => x !== f); };
    const body = new FakeEl('body');
    const doc = {
        visibilityState: 'visible', readyState: 'complete', body, addEventListener: add, removeEventListener: rem,
        createElement: (t: string) => new FakeEl(t),
    };
    const win: any = {
        navigator: { userAgent: ua }, location: { href }, document: doc,
        addEventListener: add, removeEventListener: rem,
        setTimeout: (fn: Fn, ms: number) => { timers.set(next, { at: now + ms, fn }); return next++; },
        clearTimeout: (id: number) => { timers.delete(id); },
    };
    const advance = (ms: number) => {
        now += ms;
        for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); }
    };
    const emit = (n: string, ev?: any) => (listeners[n] ?? []).forEach((f) => f(ev));
    /** The overlay root, or null. */
    const overlay = () => body.children.find((c) => c.id === 'iab-escape') ?? null;
    return { win: win as Window, advance, emit, doc, body, overlay };
}
