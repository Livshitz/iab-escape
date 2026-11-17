export interface Labels { opening: string; open: string; stay: string; continuing: string }
export const DEFAULT_LABELS: Labels = { opening: 'Opening in your browser…', open: 'Open in browser', stay: 'Continue here', continuing: 'Opening…' };

/** Styling API: the `#iab-escape` root, the classes below, and these CSS variables (all optional). */
export interface Theme { bg?: string; fg?: string; accent?: string; accentFg?: string; radius?: string; font?: string }
const VARS: Record<keyof Theme, string> = {
    bg: '--iab-bg', fg: '--iab-fg', accent: '--iab-accent', accentFg: '--iab-accent-fg', radius: '--iab-radius', font: '--iab-font',
};

const CSS = `
#iab-escape{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));
background:var(--iab-bg,#fff);color:var(--iab-fg,#111);font:var(--iab-font,18px/1.35 -apple-system,system-ui,sans-serif);text-align:center}
#iab-escape .ie-spin{width:36px;height:36px;border:4px solid #8884;border-top-color:var(--iab-accent,#07f);border-radius:50%;animation:ie-r 1s linear infinite}
#iab-escape a.ie-open{display:block;padding:14px 28px;border-radius:var(--iab-radius,12px);background:var(--iab-accent,#07f);color:var(--iab-accent-fg,#fff);text-decoration:none;font-weight:600}
#iab-escape a.ie-stay{font-size:14px;color:inherit;opacity:.7}
#iab-escape [hidden]{display:none}
@keyframes ie-r{to{transform:rotate(360deg)}}
@media (prefers-color-scheme:dark){#iab-escape{background:var(--iab-bg,#111);color:var(--iab-fg,#f2f2f2)}}
@media (prefers-reduced-motion:reduce){#iab-escape .ie-spin{animation:none}}`;

/** Full-screen "opening in your browser" overlay. No deps; built with createElement only. */
export class Loader {
    private root: HTMLElement | null = null;
    private open!: HTMLAnchorElement;
    private stay!: HTMLAnchorElement;
    private spin!: HTMLElement;
    private msg!: HTMLElement;

    public constructor(private doc: Document, private labels: Labels, private theme: Theme = {}, private onStay?: () => void) {}

    public get visible(): boolean { return this.root !== null; }

    /** Spinner state (also resets a previously revealed button). */
    public show(): void {
        if (!this.root) this.build();
        this.spin.hidden = false;
        this.open.hidden = true;
        this.stay.hidden = true;
    }

    /** Reveals the real `<a>` (so a tap works if the automatic fire was ignored) and the "stay" link. */
    public reveal(href: string): void {
        if (!this.root) this.build();
        this.open.href = href;
        this.open.hidden = false;
        this.stay.hidden = false;
    }

    /** A continue navigation is under way: keep the overlay (no bare page in between), spinner + short text. */
    public continuing(): void {
        if (!this.root) this.build();
        this.spin.hidden = false;
        this.open.hidden = true;
        this.stay.hidden = true;
        this.msg.textContent = this.labels.continuing;
    }

    public hide(): void {
        this.root?.remove();
        this.root = null;
    }

    private el<T extends HTMLElement>(tag: string, cls: string, text?: string): T {
        const e = this.doc.createElement(tag) as T;
        e.className = cls;
        if (text) e.textContent = text;
        return e;
    }

    private build(): void {
        const root = this.el('div', '');
        root.id = 'iab-escape';
        root.setAttribute('role', 'status');
        const inline = (Object.keys(VARS) as (keyof Theme)[]).filter((k) => this.theme[k]).map((k) => `${VARS[k]}:${this.theme[k]}`).join(';');
        if (inline) root.setAttribute('style', inline);
        const style = this.doc.createElement('style');
        style.textContent = CSS;
        this.spin = this.el('div', 'ie-spin');
        const msg = (this.msg = this.el('div', 'ie-msg', this.labels.opening));
        this.open = this.el('a', 'ie-open', this.labels.open);
        this.stay = this.el('a', 'ie-stay', this.labels.stay);
        this.stay.href = '#';
        this.stay.addEventListener('click', (ev) => { ev.preventDefault(); this.hide(); this.onStay?.(); });
        for (const c of [style, this.spin, msg, this.open, this.stay]) root.appendChild(c);
        (this.doc.body ?? this.doc.documentElement).appendChild(root);
        this.root = root;
    }
}
