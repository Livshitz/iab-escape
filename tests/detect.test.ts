import { expect, test } from 'bun:test';
import { detectEnv } from '../src/detect';
import { UA } from './helpers';

const cases: [string, string, string | null, string | null, boolean][] = [
    ['fbIos', UA.fbIos, 'facebook', 'ios', true],
    ['igIos', UA.igIos, 'instagram', 'ios', true],
    ['fbAndroid', UA.fbAndroid, 'facebook', 'android', true],
    ['igAndroid', UA.igAndroid, 'instagram', 'android', true],
    ['safari', UA.safari, null, 'ios', false],
    ['chrome', UA.chrome, null, 'android', false],
    ['threadsIos', UA.threadsIos, 'threads', 'ios', true],
    ['messengerIos', UA.messengerIos, 'messenger', 'ios', true],
    ['messengerAndroid', UA.messengerAndroid, 'messenger', 'android', true],
];
for (const [name, ua, app, os, inApp] of cases) {
    test(`detect ${name}`, () => expect(detectEnv(ua)).toEqual({ app: app as any, os: os as any, inApp }));
}
