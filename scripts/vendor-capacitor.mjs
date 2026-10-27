// Copies the Capacitor runtime and plugin browser bundles into src/vendor for the Android and iOS apps.
// src/js/native.js loads them only inside the app, so the website works without this step.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  'capacitor.js': '@capacitor/core/dist/capacitor.js',
  'bluetooth-le.js': '@capacitor-community/bluetooth-le/dist/plugin.js',
  'keep-awake.js': '@capacitor-community/keep-awake/dist/plugin.js',
};

const vendor = join(root, 'src', 'vendor');
mkdirSync(vendor, { recursive: true });
for (const [name, source] of Object.entries(FILES)) copyFileSync(join(root, 'node_modules', source), join(vendor, name));
console.log(`Copied ${Object.keys(FILES).length} files to src/vendor`);
