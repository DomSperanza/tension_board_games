// Bluetooth connection to an Aurora board (Tension Board 1 and 2 both use Aurora controllers).
//
// A transport finds a board and opens a link to its UART characteristic:
//   webTransport    - Web Bluetooth, for Chrome / Edge / Bluefy
//   nativeTransport - the Capacitor BLE plugin, inside the Android and iOS apps
// A link is { write(bytes), disconnect() }. AuroraConnection holds the link and the frame queue.

import { encodeMessage, chunk, apiLevelFromName } from './protocol.js';
import { isNativeApp, loadPlugins } from './native.js';

export const ADVERTISED_SERVICE = '4488b571-7806-4df6-bcff-a2897e4953ff';
export const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const UART_RX_CHARACTERISTIC = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

export const webTransport = {
  get supported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  },

  async requestDevice({ showAllDevices }) {
    const options = showAllDevices
      ? { acceptAllDevices: true, optionalServices: [UART_SERVICE, ADVERTISED_SERVICE] }
      : { filters: [{ services: [ADVERTISED_SERVICE] }], optionalServices: [UART_SERVICE] };
    const device = await navigator.bluetooth.requestDevice(options);
    return { name: device.name, device };
  },

  async connect({ device }, onDisconnect) {
    device.ongattserverdisconnected = onDisconnect;
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(UART_SERVICE);
      const c = await service.getCharacteristic(UART_RX_CHARACTERISTIC);
      return {
        write: c.properties.write ? (data) => c.writeValueWithResponse(data) : (data) => c.writeValueWithoutResponse(data),
        disconnect: async () => {
          if (device.gatt.connected) device.gatt.disconnect();
        },
      };
    } catch (err) {
      if (device.gatt.connected) device.gatt.disconnect();
      throw err;
    }
  },
};

const sameUuid = (a, b) => a?.toLowerCase() === b;

export const nativeTransport = {
  supported: true,

  async requestDevice({ showAllDevices }) {
    const { BleClient } = await loadPlugins();
    await BleClient.initialize({ androidNeverForLocation: true });
    if (!(await BleClient.isEnabled())) throw new Error('Bluetooth is off. Turn it on and try again.');
    try {
      const device = await BleClient.requestDevice(showAllDevices ? {} : { services: [ADVERTISED_SERVICE] });
      return { name: device.name, id: device.deviceId };
    } catch (err) {
      // Same error name as Web Bluetooth when the picker is closed, so the UI treats both alike.
      if (/cancel/i.test(err?.message)) err.name = 'NotFoundError';
      throw err;
    }
  },

  async connect({ id }, onDisconnect) {
    const { BleClient } = await loadPlugins();
    await BleClient.connect(id, onDisconnect);
    try {
      const services = await BleClient.getServices(id);
      const props = services
        .find((s) => sameUuid(s.uuid, UART_SERVICE))
        ?.characteristics.find((c) => sameUuid(c.uuid, UART_RX_CHARACTERISTIC))?.properties;
      if (!props) throw new Error('That device is not an Aurora board.');
      const write = props.write ? BleClient.write : BleClient.writeWithoutResponse;
      return {
        write: (bytes) =>
          write.call(BleClient, id, UART_SERVICE, UART_RX_CHARACTERISTIC, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)),
        disconnect: () => BleClient.disconnect(id),
      };
    } catch (err) {
      await BleClient.disconnect(id).catch(() => {});
      throw err;
    }
  },
};

export const defaultTransport = () => (isNativeApp() ? nativeTransport : webTransport);
export const isBluetoothSupported = () => defaultTransport().supported;

export class AuroraConnection {
  constructor({ onStatus = () => {}, transport = defaultTransport() } = {}) {
    this.onStatus = onStatus;
    this.transport = transport;
    this.device = null; // { name, ... } from transport.requestDevice
    this.link = null;
    this.apiOverride = null; // null = detect from the board name
    this.pending = null;
    this.sending = false;
    this.flushing = Promise.resolve();
    this.status = 'disconnected';
  }

  get apiLevel() {
    return this.apiOverride ?? apiLevelFromName(this.device?.name);
  }

  get connected() {
    return this.status === 'connected';
  }

  setStatus(status, detail = '') {
    this.status = status;
    this.onStatus(status, detail);
  }

  // Must be called from a user gesture (button click).
  async connect({ showAllDevices = false } = {}) {
    if (!this.transport.supported) throw new Error('Web Bluetooth is not available in this browser.');
    const device = await this.transport.requestDevice({ showAllDevices });
    if (this.device) await this.disconnect();
    this.device = device;
    await this.open();
  }

  async reconnect() {
    if (!this.device) throw new Error('No board picked yet. Use Connect first.');
    await this.open();
  }

  async open() {
    this.setStatus('connecting', this.device.name || 'board');
    try {
      // Only the current link may report a drop; a link we closed on purpose stays quiet.
      const link = await this.transport.connect(this.device, () => {
        if (this.link === link) this.handleDisconnect();
      });
      this.link = link;
      this.setStatus('connected', this.device.name || 'board');
    } catch (err) {
      this.link = null;
      this.setStatus('disconnected', err.message);
      throw err;
    }
  }

  async disconnect({ clearFirst = true } = {}) {
    if (!this.device) return;
    this.pending = null;
    await this.flushing;
    if (clearFirst && this.connected) {
      try {
        await this.writeFrame(new Map());
      } catch {
        // Board may already be gone; disconnecting anyway.
      }
    }
    const link = this.link;
    this.link = null;
    await link?.disconnect().catch(() => {});
    this.handleDisconnect();
  }

  // Forget the board entirely so the next Connect shows the picker.
  async forget() {
    await this.disconnect();
    this.device = null;
  }

  handleDisconnect() {
    this.link = null;
    this.sending = false;
    this.setStatus('disconnected', this.device?.name ? `${this.device.name} disconnected` : '');
  }

  // Queue a frame (Map position -> rgb). Only the newest frame is kept while a send is in flight,
  // so a slow link drops intermediate frames instead of lagging further and further behind.
  send(frame) {
    if (!this.connected) return;
    this.pending = frame;
    if (!this.sending) this.flushing = this.flush();
  }

  async flush() {
    this.sending = true;
    try {
      while (this.pending && this.connected) {
        const frame = this.pending;
        this.pending = null;
        await this.writeFrame(frame);
      }
    } catch (err) {
      this.onStatus(this.status, `Send failed: ${err.message}`);
    } finally {
      this.sending = false;
    }
  }

  async writeFrame(frame) {
    const link = this.link;
    if (!link) return;
    const bytes = encodeMessage(frame.entries(), this.apiLevel);
    for (const piece of chunk(bytes)) await link.write(piece);
  }
}
