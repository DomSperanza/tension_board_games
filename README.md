# Tension Board Games

Arcade games for the Tension Board and Kilter Board, played on the wall. Your phone talks to the board over Bluetooth and the LEDs become the game.

Gap Drop and Reach are ported from [Kilter Games](https://github.com/emre9690/kilter_board_game) by Emre Ozer. Tension and Kilter both run Aurora controllers, so the Bluetooth protocol is the same and only the board layouts differ. Both brands are supported.

## Games

**Gap Drop**: red bars fall down the wall. Lit holds are lava: when a bar passes you, every hand and foot has to be in its gap. The gaps swing between the far left and far right.

**Reach**: a cluster of holds lights up somewhere on the wall. Get on it before time runs out (green, then yellow, then red), then it jumps somewhere far away.

**Barrage** (new): a formation of purple aliens marches along the top of the wall, dropping red bolts. Bolts are lava, so traverse out of the way; every bolt you dodge scores. Volleys from the whole formation leave only narrow gaps. **Co-op:** a second player on the phone moves a blue cannon along the bottom and fires. Shots knock out bolts and destroy aliens; clear a wave and the next one arrives.

**Serpent** (new): a snake roams the wall eating apples and growing longer. The snake is lava (apples are safe); each apple it eats scores. Solo, it steers itself. **Co-op:** a second player steers it from the phone, hunting the climber. It still won't crash into a wall or itself.

**Updraft** (new): red walls drift across the board from right to left, each with a gap. Climb up or down so your hands and feet are in the gap as each wall passes. A yellow bird flapping along the right edge makes the gaps; each wall that leaves the board scores. Solo, the bird flies itself and never moves a gap too far. **Co-op:** a second player taps Flap to fly the bird, and the climber has to follow its path.

**Rally** (new): blue paddles on the left and right edges knock a red ball back and forth across the wall, bouncing off the top and bottom. The ball is lava; every return scores. Harder levels add a second ball and steeper bounces. Solo, the paddles play themselves. **Co-op:** a second player moves the left paddle with ▲▼ and aims: the ball leaves the top of the paddle going up and the bottom going down.

**Maze** (new): each round lights a freshly generated maze. Red walls are lava and the dark holds are the corridors. Start on the green holds and climb to the blue finish before time runs out: the finish turns yellow, then flashes. Hands stay in the corridors, with no reaching over a wall. Each maze finished scores, and the next one starts where you are, so mazes alternate up and down the wall. Time per maze follows the length of its route. Harder modes have one-hold corridors and fewer shortcuts. **Co-op:** no timer; a partner taps **Made it!** when you reach the finish.

Every game speeds up in steps as you score, reaches top speed at **Speed 5**, and holds there until you're out. Each has **Beginner, Intermediate, Hard and Impossible** modes, plus **Custom**, with sliders for every setting, including start and top speed. The board counts you in with 3, 2, 1, GO and shows your score at the end. Scoring is on the honor system: if you touch a lit hold (or miss the cluster or the finish), tap **I'm out**.

## Play

1. Use the **Android or iOS app**, or open the site in **Chrome or Edge** on Android, Mac, Windows or ChromeOS. On iPhone without the app, use the free **Bluefy** browser, since Safari has no Web Bluetooth.
2. Close the Tension or Kilter app. The board accepts one Bluetooth connection at a time.
3. Pick your board, tap **Connect**, choose a game and mode, then **Start** and put the phone down. The screen stays on while a game runs.

Without a board you can still play on the on-screen preview.

If the lights come out wrong, try **Settings → Protocol** set to v2 or v3. Older controllers speak v2. The app picks the version from the board's Bluetooth name, which ends in `@3` on v3 boards.

### Supported boards

- **Tension Board 2:** 12×12, 12×10, 8×12, 8×10 and 16×12 (width × height in feet). Mirror and Spray layouts share the same LEDs.
- **Tension Board 1:** Full Wall (KB1 + KB2), Half Kickboard, No Kickboard, Short, and Short & Narrow.
- **Kilter Board Original:** 12×12 with and without kickboard, 12×14 Commercial, 16×12 Super Wide, 8×12 Home, 7×10 Small.
- **Kilter Board Homewall:** 7×10, 10×10, 8×12 and 10×12, each with the Full Ride and Mainline LED kits, plus the 7×10 and 10×10 Auxiliary kits.

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
npm run android:apk   # -> android/tension_games_V<version>.apk
adb install -r android/tension_games_V0.4.0.apk
```

Or copy the APK to the phone and open it (allow installing unknown apps when asked).

The version comes from `package.json` (`version`); Android picks it up automatically. Bump it before each release.

The app icon and splash screens are drawn by `python3 scripts/make-icons.py` (needs Pillow); rerun it after changing the design.

**iOS** needs a Mac with Xcode: run `npm run cap:sync`, then `npx cap open ios`, pick your iPhone and press Run. A free Apple ID can sign builds for your own phone; they expire after 7 days.

## How it works

- `src/js/protocol.js` encodes the Aurora board LED protocol. Packets are framed with a checksum and written in 20-byte chunks to the board's UART characteristic. API v2 and v3 are both supported.
- `src/js/ble.js` handles connect, disconnect and reconnect over two transports: Web Bluetooth in browsers and the Capacitor BLE plugin in the apps (`src/js/native.js` loads the plugins). Only the newest frame is kept while a send is in flight, so a slow link drops frames instead of lagging.
- `src/js/layout.js` turns a board's LED table into a game grid. Every Tension and Kilter board is a staggered lattice on an 8-inch pitch: the main lattice (on Kilter, the bolt-ons or Mainline holds) becomes the grid and the offset holds act as footholds.
- `src/js/game.js` (Gap Drop), `reach.js`, `barrage.js`, `serpent.js`, `updraft.js`, `rally.js` and `maze.js` hold the game rules as pure logic with no DOM or timers, and are tested in `tests/`. `ramp.js` is the shared speed-up to level 5.
- `scripts/extract-boards.py` regenerates `src/js/boards-data.js` from the Tension and Kilter app databases, which you can download with [BoardLib](https://github.com/lemeryfertitta/BoardLib) (`boardlib database tension tension.db` and `boardlib database kilter kilter.db`). Board ids are `<brand>-<product size id>`, such as `tension-6` or `kilter-10`.

## Roadmap

- **More games** once the originals are proven on a real board.
- Release builds for the Play Store and App Store (signing, icons, store listings).

## Credits

Original games, protocol code and UI: [emre9690/kilter_board_game](https://github.com/emre9690/kilter_board_game) (MIT). Bluetooth protocol notes: [1-max-1/fake_kilter_board](https://github.com/1-max-1/fake_kilter_board).

## License

The code is [MIT](LICENSE) licensed.

The board LED layout data in `src/js/boards-data.js` is derived from the Tension Board and Kilter Board apps' databases and isn't covered by the MIT license. Tension Board and Kilter Board are trademarks of their owners. This project is not affiliated with or endorsed by Tension Climbing, Kilter or Aurora Climbing.
