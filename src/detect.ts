export type App = 'facebook' | 'instagram' | 'messenger' | 'threads';
export type Os = 'ios' | 'android';
export interface Env { app: App | null; os: Os | null; inApp: boolean }

// Order matters: Threads (Barcelona) before Instagram; Messenger before Facebook.
const APPS: [App, RegExp][] = [
    ['threads', /Barcelona/],
    ['instagram', /Instagram/],
    ['messenger', /FBAN\/MessengerForiOS|FB_IAB\/MESSENGER|Orca/],
    ['facebook', /FBAN|FBAV|FB_IAB/],
];

export function detectEnv(ua: string): Env {
    const app = APPS.find(([, re]) => re.test(ua))?.[0] ?? null;
    const os: Os | null = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : null;
    return { app, os, inApp: app !== null };
}
