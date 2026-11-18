import type { App, Os } from './detect';

export interface TestedOn { date: string; os: string; app: string }
/** The target URL, kept as the raw string (mark param already applied). */
export interface Target {
    /** Full URL incl. fragment. */
    href: string;
    /** `href` without the fragment. */
    noHash: string;
    /** 'http:' | 'https:' */
    protocol: string;
}
export interface Rule {
    app: App;
    os: Os;
    proven: boolean;
    /** Delay used by auto(). 0 = fire synchronously inside auto(). */
    delayMs: number;
    testedOn: TestedOn | null;
    /**
     * Minimum wait before the in-webview continue (retry/parallel) starts. Set where the app's open-app prompt
     * gives the page no signal while open (IG iOS: no blur/focus/visibility, timers keep running), so an early
     * retry would load the destination behind the prompt.
     */
    continueDelayMs?: number;
    /** Returns the scheme URL or null when the target is not supported by this row. */
    build(target: Target): string | null;
}

const xSafari = (t: Target) => (t.protocol === 'https:' ? 'x-safari-' + t.href : null);
const extbrowser = (scheme: string) => (t: Target) => `${scheme}://extbrowser/?url=${encodeURIComponent(t.href)}`;
const intent = (t: Target) =>
    `intent://${t.noHash.replace(/^https?:\/\//i, '')}#Intent;scheme=${t.protocol.slice(0, -1)};end`;

const T = '2026-11-16';
export const MATRIX: Rule[] = [
    { app: 'instagram', os: 'ios', proven: true, delayMs: 0, continueDelayMs: 2000, build: extbrowser('instagram'),
      testedOn: { date: T, os: 'iOS 26.7.3', app: 'Instagram 455.0.0.35.67' } },
    // On-load (sync, during parsing) fails in FB iOS; setTimeout(1500) from an inline script was 3/3.
    { app: 'facebook', os: 'ios', proven: true, delayMs: 1500, build: xSafari,
      testedOn: { date: T, os: 'iOS 26.7.3', app: 'Facebook 587.0.0.31.71' } },
    { app: 'facebook', os: 'android', proven: true, delayMs: 0, build: intent,
      testedOn: { date: T, os: 'Android 16', app: 'Facebook 587.0.0.39.55' } },
    { app: 'instagram', os: 'android', proven: false, delayMs: 0, build: intent, testedOn: null },
    { app: 'threads', os: 'ios', proven: false, delayMs: 0, build: extbrowser('barcelona'), testedOn: null },
    { app: 'messenger', os: 'ios', proven: false, delayMs: 1500, build: xSafari, testedOn: null },
];
