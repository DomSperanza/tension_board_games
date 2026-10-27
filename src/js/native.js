// Bridge to the Capacitor plugins when running inside the Android or iOS app.
// The plugins' browser bundles are copied into src/vendor by `npm run cap:sync` and only loaded in the app,
// so the website never needs them.

const SCRIPTS = ['vendor/capacitor.js', 'vendor/bluetooth-le.js', 'vendor/keep-awake.js'];

// Capacitor's native bridge defines window.Capacitor before any page script runs.
export const isNativeApp = () => !!globalThis.Capacitor?.isNativePlatform?.();

function addScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}. Run npm run cap:sync and rebuild the app.`));
    document.head.appendChild(s);
  });
}

let loading = null;
export function loadPlugins() {
  loading ??= (async () => {
    for (const src of SCRIPTS) await addScript(src); // in order: the plugins need capacitor.js first
    return {
      BleClient: window.capacitorCommunityBluetoothLe.BleClient,
      KeepAwake: window.capacitorKeepAwake.KeepAwake,
    };
  })();
  loading.catch(() => (loading = null));
  return loading;
}
