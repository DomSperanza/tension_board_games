# Tension Board Games

Arcade games for the Tension Board, played on the wall. Your phone talks to the board over Bluetooth and the LEDs become the game.

Gap Drop and Reach are ported from [Kilter Games](https://github.com/emre9690/kilter_board_game) by Emre Ozer. Tension and Kilter both run Aurora controllers, so the Bluetooth protocol is the same and only the board layouts differ.

## Games

**Gap Drop**: red bars fall down the wall. Lit holds are lava: when a bar passes you, every hand and foot has to be in its gap. The gaps swing between the far left and far right, and the bars speed up as you score.

**Reach**: a cluster of holds lights up somewhere on the wall. Get on it before time runs out (green, then yellow, then red), then it jumps somewhere far away. The time per cluster shrinks as you go.

**Recall** (new in this port): a problem that grows by one hold every round, climbed from memory. Get on the yellow start hold, watch the problem play back one hold at a time (green start, blue hands, pink finish), then the lights go out and you climb it before time runs out. Survive and it gets one hold longer. Score is rounds survived.

Every game has **Beginner, Intermediate, Hard and Impossible** modes, plus **Custom**, which has sliders for every setting. The board counts you in with 3, 2, 1, GO and shows your score at the end. Scoring is on the honor system: if you touch a lit hold, miss the cluster or forget the problem, tap **I'm out**.

## Play

1. Use the **Android or iOS app**, or open the site in **Chrome or Edge** on Android, Mac, Windows or ChromeOS. On iPhone without the app, use the free **Bluefy** browser, since Safari has no Web Bluetooth.
2. Close the Tension app. The board accepts one Bluetooth connection at a time.
3. Pick your board, tap **Connect**, choose a game and mode, then **Start** and put the phone down. The screen stays on while a game runs.

Without a board you can still play on the on-screen preview.

If the lights come out wrong, try **Settings → Protocol** set to v2 or v3. Older controllers speak v2. The app picks the version from the board's Bluetooth name, which ends in `@3` on v3 boards.

### Supported boards

- **Tension Board 2:** 12×12, 12×10, 8×12, 8×10 and 16×12 (width × height in feet). Mirror and Spray layouts share the same LEDs.
- **Tension Board 1:** Full Wall (KB1 + KB2), Half Kickboard, No Kickboard, Short, and Short & Narrow.

## Run it yourself

It's a static site with no dependencies or build step.

```bash
npm start   # serves src/ at http://localhost:8000
npm test    # node --test
```

Web Bluetooth needs HTTPS, or `localhost`. Any static host works: serve the `src/` folder.

## Phone apps

The Android and iOS apps are [Capacitor](https://capacitorjs.com) shells around the same `src/` folder. Inside the apps, Bluetooth goes through [`@capacitor-community/bluetooth-le`](https://github.com/capacitor-community/bluetooth-le) instead of Web Bluetooth, and [`@capacitor-community/keep-awake`](https://github.com/capacitor-community/keep-awake) keeps the screen on. Needs Node 22 (`nvm use`).

```bash
npm install
npm run cap:sync      # copy plugin bundles to src/vendor, then web assets into android/ and ios/
```

**Android** needs the Android SDK and JDK 21 (Android Studio bundles one):

```bash
export JAVA_HOME=/path/to/jdk-21 ANDROID_HOME=~/Android/Sdk
npm run android:apk   # -> android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Or copy the APK to the phone and open it (allow installing unknown apps when asked).

The app icon and splash screens are drawn by `python3 scripts/make-icons.py` (needs Pillow); rerun it after changing the design.

**iOS** needs a Mac with Xcode: run `npm run cap:sync`, then `npx cap open ios`, pick your iPhone and press Run. A free Apple ID can sign builds for your own phone; they expire after 7 days.

## How it works

- `src/js/protocol.js` encodes the Aurora board LED protocol. Packets are framed with a checksum and written in 20-byte chunks to the board's UART characteristic. API v2 and v3 are both supported.
- `src/js/ble.js` handles connect, disconnect and reconnect over two transports: Web Bluetooth in browsers and the Capacitor BLE plugin in the apps (`src/js/native.js` loads the plugins). Only the newest frame is kept while a send is in flight, so a slow link drops frames instead of lagging.
- `src/js/layout.js` turns a board's LED table into a game grid. Every Tension board is a staggered lattice on an 8-inch pitch: the main lattice becomes the grid and the offset holds act as footholds.
- `src/js/game.js`, `src/js/reach.js` and `src/js/recall.js` hold the game rules as pure logic with no DOM or timers, and are tested in `tests/`.
- `scripts/extract-boards.py` regenerates `src/js/boards-data.js` from the Tension app database, which you can download with [BoardLib](https://github.com/lemeryfertitta/BoardLib) (`boardlib database tension tension.db`).

## Roadmap

- **More games** once the originals are proven on a real board.
- Release builds for the Play Store and App Store (signing, icons, store listings).

## Credits

Original games, protocol code and UI: [emre9690/kilter_board_game](https://github.com/emre9690/kilter_board_game) (MIT). Bluetooth protocol notes: [1-max-1/fake_kilter_board](https://github.com/1-max-1/fake_kilter_board).

## License

The code is [MIT](LICENSE) licensed.

The board LED layout data in `src/js/boards-data.js` is derived from the Tension Board app's database and isn't covered by the MIT license. Tension Board is a trademark of its owner. This project is not affiliated with or endorsed by Tension Climbing or Aurora Climbing.
