import test from 'node:test';
import assert from 'node:assert/strict';
import { AuroraConnection } from '../src/js/ble.js';
import { encodeMessage } from '../src/js/protocol.js';

// A transport whose links record every write and let the test drop the connection.
function fakeTransport(name = 'Tension Board#123@3') {
  const links = [];
  return {
    links,
    supported: true,
    requestDevice: async () => ({ name }),
    connect: async (device, onDisconnect) => {
      const link = { writes: [], closed: false, drop: onDisconnect };
      link.write = async (bytes) => link.writes.push([...bytes]);
      link.disconnect = async () => {
        link.closed = true;
        onDisconnect(); // like Web Bluetooth's gattserverdisconnected, fired for deliberate disconnects too
      };
      links.push(link);
      return link;
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('connects, picks the API level from the name and writes frames in 20-byte chunks', async () => {
  const transport = fakeTransport();
  const statuses = [];
  const conn = new AuroraConnection({ transport, onStatus: (s) => statuses.push(s) });
  await conn.connect();
  assert.deepEqual(statuses, ['connecting', 'connected']);
  assert.equal(conn.apiLevel, 3);

  const frame = new Map(Array.from({ length: 10 }, (_, i) => [i, [255, 0, 0]]));
  conn.send(frame);
  await conn.flushing;
  const { writes } = transport.links[0];
  assert.ok(writes.length > 1 && writes.every((w) => w.length <= 20));
  assert.deepEqual(writes.flat(), [...encodeMessage(frame.entries(), 3)]);
});

test('disconnect clears the board first and reports disconnected once', async () => {
  const transport = fakeTransport();
  const statuses = [];
  const conn = new AuroraConnection({ transport, onStatus: (s) => statuses.push(s) });
  await conn.connect();
  await conn.disconnect();
  const link = transport.links[0];
  assert.deepEqual(link.writes.flat(), [...encodeMessage([], 3)]);
  assert.ok(link.closed);
  assert.deepEqual(statuses, ['connecting', 'connected', 'disconnected']);
});

test('a board dropping the link marks the connection disconnected; reconnect opens a new link', async () => {
  const transport = fakeTransport();
  const conn = new AuroraConnection({ transport });
  await conn.connect();
  transport.links[0].drop();
  assert.equal(conn.status, 'disconnected');
  conn.send(new Map([[1, [0, 255, 0]]]));
  await settle();
  assert.equal(transport.links[0].writes.length, 0, 'nothing sent while disconnected');

  await conn.reconnect();
  assert.equal(conn.status, 'connected');
  transport.links[0].drop(); // a late event from the old link must not disconnect the new one
  assert.equal(conn.status, 'connected');
});
