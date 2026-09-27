# ELEVEN — JEV Football Lab

A local Three.js football game with two modes: penalty shootouts and a simple 11 vs 11 match. JEV controls the opposing team, the human player's unselected teammates, and both goalkeepers. The selected human outfield player uses keyboard controls.

## Run the game

Requires Node.js 20 or later.

```sh
cd game
npm ci
cp .env.example .env
```

For Live mode, set `JEV_API_KEY` in the local `.env` file. Keep that file private. Practice mode works without a key.

```sh
JEV_ENV_FILE=.env PORT=4318 npm start
```

Open [Team Play](http://127.0.0.1:4318/match) or [penalty mode](http://127.0.0.1:4318/). The server binds to the local computer. This is not a hosted multiplayer service.

## Team Play controls

| Key | Action |
| --- | --- |
| WASD | Move and aim relative to the camera |
| Shift | Sprint |
| J | Hold for pass power; release to pass |
| Space | Hold for shot power; release to shoot |
| U | Hold and release for a lob pass |
| I | Hold and release for a chip shot |
| K | Tackle |
| L | Select the closest other outfield teammate to the ball |
| C | Change the camera |
| Escape | Pause or continue |

The current controller gives each player a team duty. JEV selects complete movement or kick options, including direction and speed. A defender can select Close and tackle to approach the carrier and tackle within physical reach. The decision panel shows team duties, selected values, probabilities, and request timing.

The match omits offside, fouls, corners, and throw-ins. Boundary rebounds keep the ball in play. The game has simplified physics and procedural animation. It does not reproduce the full rules or visual quality of a commercial football game.

## Tests

```sh
cd game
npm test
```

The unit tests do not make model calls. Browser checks require Chrome and a running server. Some browser scripts make paid JEV calls; their filenames, purposes, and results are described in the [game guide](game/README.md) and [test report](game/TEST-RESULTS.md). Most current match checks use port 4318; older scripts can use port 4317 or `JEV_TEST_URL` where supported.

## Demo recordings

- [Team play and scoring](docs/demos/team-play.mp4)
- [Closing down and tackling a running carrier](docs/demos/close-and-tackle.mp4)
- [Penalty mode](docs/demos/penalty-mode.mp4)

These are short development checks, not measures of full-match playing strength.

## Assets and sound

The included player model uses a CC0 Quaternius base model. See the [asset source and licence](game/assets/players/README.md).

Source audio MP3 files are excluded from this repository. The game remains playable without them. To restore the local audio assets:

```sh
cd game
python3 scripts/download-match-audio.py
```

See the [sound sources and licence notes](game/src/match/sounds/README.md) before packaging a release. Optional spoken commentary uses a local browser voice.

## Project files

- `game/`: game source, tests, player model, and local server.
- `benchmark.py` and `benchmark-results.json`: the original bounded API timing test.
- [Benchmark notes](BENCHMARK.md): the original feasibility study.
- [Game guide](game/README.md): controls, model integration, and diagnostic tools.
- [Test report](game/TEST-RESULTS.md): development results and limitations.

Generated logs, full browser traces, local credentials, and installed packages are excluded from Git. The test scripts recreate their reports in `game/artifacts/`.
