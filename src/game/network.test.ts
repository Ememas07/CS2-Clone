import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultWebSocketUrl, resolveWebSocketUrl, TacticalNetworkClient } from './network';

test('getDefaultWebSocketUrl in SSR / node environment without window', () => {
  const url = getDefaultWebSocketUrl();
  assert.equal(url, 'ws://localhost:3000/ws?game=CS2-Clone');

  // Passing empty string or custom URL in SSR
  assert.equal(getDefaultWebSocketUrl(''), 'ws://localhost:3000/ws?game=CS2-Clone');
  assert.equal(getDefaultWebSocketUrl('ws://example.com/ws'), 'ws://example.com/ws?game=CS2-Clone');
  assert.equal(getDefaultWebSocketUrl('ws://example.com/ws?game=existing'), 'ws://example.com/ws?game=existing');
});

test('getDefaultWebSocketUrl in browser environment with root pathname', () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: {
        protocol: 'http:',
        host: 'localhost:5173',
        pathname: '/',
        href: 'http://localhost:5173/',
      },
    } as unknown as Window & typeof globalThis;

    assert.equal(
      getDefaultWebSocketUrl(),
      'ws://localhost:5173/ws?game=CS2-Clone'
    );
  } finally {
    globalThis.window = originalWindow;
  }
});

test('getDefaultWebSocketUrl ignores index.html or dot-extensions in pathname', () => {
  const originalWindow = globalThis.window;
  try {
    // 1. Direct index.html access
    globalThis.window = {
      location: {
        protocol: 'https:',
        host: 'marc-mas.ddns.net',
        pathname: '/index.html',
        href: 'https://marc-mas.ddns.net/index.html',
      },
    } as unknown as Window & typeof globalThis;
    assert.equal(
      getDefaultWebSocketUrl(),
      'wss://marc-mas.ddns.net/ws?game=CS2-Clone'
    );

    // 2. Custom path with index.html at the end
    globalThis.window = {
      location: {
        protocol: 'https:',
        host: 'marc-mas.ddns.net',
        pathname: '/CS2-Clone/index.html',
        href: 'https://marc-mas.ddns.net/CS2-Clone/index.html',
      },
    } as unknown as Window & typeof globalThis;
    assert.equal(
      getDefaultWebSocketUrl(),
      'wss://marc-mas.ddns.net/ws?game=CS2-Clone'
    );
  } finally {
    globalThis.window = originalWindow;
  }
});

test('getDefaultWebSocketUrl in browser environment with https and custom game slug in path', () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: {
        protocol: 'https:',
        host: 'play.example.com',
        pathname: '/tactical-ops/lobby/42',
        href: 'https://play.example.com/tactical-ops/lobby/42',
      },
    } as unknown as Window & typeof globalThis;

    assert.equal(
      getDefaultWebSocketUrl(),
      'wss://play.example.com/ws?game=tactical-ops'
    );
  } finally {
    globalThis.window = originalWindow;
  }
});

test('getDefaultWebSocketUrl encodes special characters in game slug', () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: {
        protocol: 'https:',
        host: 'play.example.com',
        pathname: '/game special&name/room',
        href: 'https://play.example.com/game%20special&name/room',
      },
    } as unknown as Window & typeof globalThis;

    assert.equal(
      getDefaultWebSocketUrl(),
      'wss://play.example.com/ws?game=game%20special%26name'
    );
  } finally {
    globalThis.window = originalWindow;
  }
});

test('getDefaultWebSocketUrl and fallback helper when user clears URL', () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: {
        protocol: 'https:',
        host: 'play.example.com',
        pathname: '/CS2-Clone/',
        href: 'https://play.example.com/CS2-Clone/',
      },
    } as unknown as Window & typeof globalThis;

    // User clears the input (empty string or whitespace)
    assert.equal(getDefaultWebSocketUrl(''), 'wss://play.example.com/ws?game=CS2-Clone');
    assert.equal(getDefaultWebSocketUrl('   '), 'wss://play.example.com/ws?game=CS2-Clone');
    assert.equal(resolveWebSocketUrl(''), 'wss://play.example.com/ws?game=CS2-Clone');
  } finally {
    globalThis.window = originalWindow;
  }
});

test('getDefaultWebSocketUrl appends ?game= to custom URLs without game parameter', () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: {
        protocol: 'https:',
        host: 'play.example.com',
        pathname: '/custom-slug/',
        href: 'https://play.example.com/custom-slug/',
      },
    } as unknown as Window & typeof globalThis;

    // Custom ws URL without query
    assert.equal(
      getDefaultWebSocketUrl('ws://internal-proxy:8080/ws'),
      'ws://internal-proxy:8080/ws?game=custom-slug'
    );

    // Custom ws URL with other query params
    assert.equal(
      getDefaultWebSocketUrl('wss://internal-proxy:8080/ws?region=eu-west'),
      'wss://internal-proxy:8080/ws?region=eu-west&game=custom-slug'
    );

    // Custom URL already containing game parameter should be preserved
    assert.equal(
      getDefaultWebSocketUrl('wss://internal-proxy:8080/ws?game=custom-override'),
      'wss://internal-proxy:8080/ws?game=custom-override'
    );

    // Relative /ws path
    assert.equal(
      getDefaultWebSocketUrl('/ws'),
      'wss://play.example.com/ws?game=custom-slug'
    );
  } finally {
    globalThis.window = originalWindow;
  }
});

test('TacticalNetworkClient fallback and custom URL handling', () => {
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;
  let openedUrl: string | null = null;

  try {
    globalThis.window = {
      location: {
        protocol: 'http:',
        host: 'localhost:3000',
        pathname: '/my-game',
        href: 'http://localhost:3000/my-game',
      },
      clearTimeout: () => {},
      setTimeout: () => 1,
    } as unknown as Window & typeof globalThis;

    // Mock WebSocket constructor
    globalThis.WebSocket = class MockWebSocket {
      public readyState = 0;
      constructor(url: string) {
        openedUrl = url;
      }
      close() {}
    } as unknown as typeof WebSocket;

    const client = new TacticalNetworkClient();

    // 1. Connect without url -> uses default
    client.connect();
    assert.equal(openedUrl, 'ws://localhost:3000/ws?game=my-game');

    // 2. Connect with cleared URL ("") -> falls back to default
    client.connect('');
    assert.equal(openedUrl, 'ws://localhost:3000/ws?game=my-game');

    // 3. Connect with custom URL without ?game= -> adds ?game=
    client.connect('ws://remote-host:9000/ws');
    assert.equal(openedUrl, 'ws://remote-host:9000/ws?game=my-game');

    // 4. Connect with custom URL containing ?game= -> preserves
    client.connect('ws://remote-host:9000/ws?game=override');
    assert.equal(openedUrl, 'ws://remote-host:9000/ws?game=override');
  } finally {
    globalThis.window = originalWindow;
    globalThis.WebSocket = originalWebSocket;
  }
});
