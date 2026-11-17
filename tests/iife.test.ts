import { expect, test } from 'bun:test';
import { optionsFromDataset } from '../src/IabEscape';
import { boot } from '../src/iife';
import { fakeWindow, UA } from './helpers';

test('optionsFromDataset: each attribute', () => {
    expect(optionsFromDataset({ delayMs: '800' })).toEqual({ delayMs: 800 });
    expect(optionsFromDataset({ delayMs: '0' })).toEqual({ delayMs: 0 });
    expect(optionsFromDataset({ markParam: 'esc' })).toEqual({ markParam: 'esc' });
    expect(optionsFromDataset({ markParam: '' })).toEqual({ markParam: null });
    expect(optionsFromDataset({ includeUnproven: '' })).toEqual({ includeUnproven: true });
    expect(optionsFromDataset({ url: 'https://a.io/x' })).toEqual({ url: 'https://a.io/x' });
    expect(optionsFromDataset({ ui: '' })).toEqual({ ui: true });
    expect(optionsFromDataset({ ui: 'false' })).toEqual({ ui: false });
});
test('optionsFromDataset: absent = defaults, bad number ignored', () => {
    expect(optionsFromDataset({})).toEqual({});
    expect(optionsFromDataset({ auto: '' })).toEqual({});
    for (const bad of ['abc', '', ' ', '-5', 'NaN', 'Infinity']) expect(optionsFromDataset({ delayMs: bad })).toEqual({});
});

const T = 'https://example.com/p?a=1';
const bootWith = (script: any, g: any = {}) => {
    const f = fakeWindow(UA.igIos, T);
    boot({ currentScript: script } as any, g, { window: f.win });
    return { f, g };
};
test('iife boot: exposes the global, does nothing without data-auto', () => {
    const { f, g } = bootWith({ hasAttribute: () => false, dataset: {} });
    f.advance(10000);
    expect(typeof g.IabEscape).toBe('function');
    expect(f.win.location.href).toBe(T);
});
test('iife boot: data-auto calls auto() once, with dataset options', () => {
    const script = { hasAttribute: (n: string) => n === 'data-auto', dataset: { auto: '', markParam: '' } };
    const { f } = bootWith(script);
    expect(f.win.location.href).toBe('instagram://extbrowser/?url=' + encodeURIComponent(T));
});

test('optionsFromDataset: theme and labels', () => {
    expect(optionsFromDataset({ accent: '#e33', bg: '#000', fg: '#fff' })).toEqual({ theme: { accent: '#e33', bg: '#000', fg: '#fff' } });
    expect(optionsFromDataset({ labelOpening: 'A', labelOpen: 'B', labelStay: 'C' })).toEqual({ labels: { opening: 'A', open: 'B', stay: 'C' } });
    expect(optionsFromDataset({ accent: '' })).toEqual({});
});

test('optionsFromDataset: continue url and fallback', () => {
    expect(optionsFromDataset({ continueUrl: 'https://a.io/x', fallback: 'auto', fallbackMs: '3000' })).toEqual({ continueUrl: 'https://a.io/x', fallback: 'auto', fallbackMs: 3000 });
    expect(optionsFromDataset({ fallback: 'bogus', fallbackMs: 'x' })).toEqual({});
});

test('optionsFromDataset: parallel fallback, delay and continuing label', () => {
    expect(optionsFromDataset({ fallback: 'parallel', parallelDelayMs: '1000', labelContinuing: 'Go' })).toEqual({ fallback: 'parallel', parallelDelayMs: 1000, labels: { continuing: 'Go' } });
    expect(optionsFromDataset({ parallelDelayMs: '-1' })).toEqual({});
});
