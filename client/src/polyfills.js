import { Buffer } from 'buffer';

window.global = window;
window.Buffer = Buffer;
window.process = {
    env: { DEBUG: undefined },
    version: 'v16.14.2',
    nextTick: (cb) => setTimeout(cb, 0),
    browser: true
};
