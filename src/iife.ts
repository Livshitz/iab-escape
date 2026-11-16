import { IabEscape, optionsFromDataset, type IabEscapeOptions } from './IabEscape';

/** Browser-script entry: exposes the global `IabEscape`; `<script data-auto>` runs auto() right away. */
export function boot(doc: Document | undefined, g: any, extra: Partial<IabEscapeOptions> = {}): void {
    g.IabEscape = IabEscape;
    const s = doc?.currentScript as HTMLScriptElement | null | undefined;
    if (s?.hasAttribute('data-auto')) new IabEscape({ ...optionsFromDataset(s.dataset), ...extra }).auto();
}

if (typeof document !== 'undefined') boot(document, globalThis);
