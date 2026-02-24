import { Buffer } from 'buffer';

window.global = window;
window.Buffer = Buffer;
window.process = {
    env: { DEBUG: undefined },
    version: 'v16.14.2',
    nextTick: (cb) => setTimeout(cb, 0),
    browser: true
};

// Exponer las APIs de WebRTC explícitamente al entorno global
// simple-peer (v9) las busca como globales, no como módulos del navegador
window.MediaStream = window.MediaStream;
window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCSessionDescription = window.RTCSessionDescription;
window.RTCIceCandidate = window.RTCIceCandidate;
