# ELEVEN — Football Lab

A playable 3D penalty shootout and a basic 11 vs 11 match. JEV selects opponent actions through the TypeSafe API. No agent framework is required.

## Start

Requires Node.js 20 or later.

```sh
npm install
npm start
```

Open [the game](http://127.0.0.1:4317).

Open [Team Play](http://127.0.0.1:4317/match) for the 11 vs 11 mode. The penalty start screen also has a Team Play link.

The server reads `JEV_API_KEY` or `TYPESAFE_API_KEY` from its environment. If neither is set, it reads only `JEV_API_KEY` from `~/projects/sales-engine/.env`. Set `JEV_ENV_FILE` to use another file. The key stays on the server. Static file routes do not expose environment files or server source.

Select **Practice** in settings to play without API calls. The UI identifies Practice as a scripted keeper. A failed live API call does not silently enable Practice.

## Team Play

The human controls one Argentina outfield player in sky blue and white. In Live mode, JEV controls the other nine Argentina outfield players and Spain in red. A separate JEV controller controls both goalkeepers. The selected human player receives no JEV movement or kick commands. The match has two 90-second halves. Halftime stops play so the user can review the plan. The teams keep the same ends for this first version.

The three plans use a 4–4–2 formation:

- **Possession:** controlled forward progress. Carry into clear space, make useful forward passes, and shoot from clear positions. Strikers and wingers run ahead to offer targets. One player presses the ball.
- **Attack:** higher, wider positions and more forward support. Two players press or cover the press.
- **Defend:** deeper, narrower positions, safe passing, and clearances near goal. One player presses.

The user can set either team's plan before the match, during play, or at halftime. Changing a plan cancels pending requests and invalidates old actions. JEV receives the shared strategy, roles, positions, velocities, and ball state. It selects actions and execution controls. Local formation targets remain only in Practice. This is a first tactical framework, not evidence that the model has learned football strategy.

Controls:

| Input | Action |
| --- | --- |
| WASD | Move and set pass or shot direction on the screen |
| Shift | Sprint |
| Space | Hold to charge; release to shoot in the held WASD direction |
| J | Hold to charge; release to pass in the held WASD direction |
| U | Hold to charge; release to lob a pass |
| I | Hold to charge; release to chip a shot |
| K | Tackle |
| L | Select the closest other human outfield player to the ball |
| C | Change camera: side-on, wide, or end-to-end |
| Escape | Pause or continue |

Player switching is automatic when a low ball is approaching a teammate, and when a teammate gains possession. The incoming-ball check looks up to 0.8 seconds ahead. It does not select a player for a ball moving away, a high ball, or a path that reaches an opponent first. Both keepers remain automatic, including when they receive the ball. Manual and automatic player selection exclude keepers. L always selects the closest other outfield teammate to the ball; incoming-ball selection then waits 0.8 seconds. New possession takes priority.

Hold W for screen-up, A for screen-left, S for screen-down, or D for screen-right. Combine two keys for a diagonal. J, U, Space, and I read the direction keys when released. Hold a kick key for more power, up to 1.4 seconds. Lob passes and chip shots use elevated ball flight. This mapping follows the current camera, including during a camera change. With no direction key held, the kick follows the player's facing direction. Pass assistance selects a teammate within about 26 degrees of that direction; if none is available within 35 m, the pass goes into open space. Shots follow the chosen direction without goal assistance. A kick charge is cancelled if control or possession changes. These controls apply to Team Play; penalty aiming stays the same.

Both teams control a loose ball within 3 m, at a height up to 1.05 m and a horizontal speed up to 28 m/s. The nearest eligible outfield player receives it. Release locks and player recovery still apply. High balls and fast shots cannot be collected with this larger radius. A ball held by an opponent still requires a tackle. Goalkeepers retain their physical save contacts.

There is no offside, corner, throw-in, or foul system. Boundary rebounds keep the ball in play. Goals require the whole ball to cross the line inside the frame. A goal stops play briefly, then the conceding team takes the kick-off. Player movement, ball flight, post collisions, and keeper collisions use a fixed 120 Hz simulation. The match uses simplified contact and tackle rules.

Live Team Play uses two model stages. The first selects each action and pass receiver. The second sees all selected actions and chooses a complete movement or kick combination for each player. Three independent loops control Spain’s ten outfield players, Argentina’s nine unselected outfield players, and both goalkeepers. The next batch starts after the previous reply. Each loop permits one pending HTTP request. Each request makes one or two model calls; a batch of holds needs only one.

The code supplies a shared 4–4–2 structure. Each player has a stable lane and a duty: cover, wide support, short support, depth, overlap, recovery, receiving, or pressing. Both centre backs and a holding midfielder provide cover. Only one fullback overlaps at a time, and defence has one named presser. The presser remains assigned while another player is only slightly closer. Team depth and width follow the selected strategy and the ball position. Passes into space retain the attacking phase for up to 2.5 seconds unless the other team gains possession.

JEV selects the actual controls from a bounded menu:

- A movement choice includes bearing, distance, and speed together. Bearings use 22.5-degree steps; distances are 2, 4, 8, or 16 metres; speeds are 3, 5.5, 7.5, or 8.5 m/s. Long recovery runs omit the slowest speed. The menu includes routes that approach or remain within the assigned area, plus hold. The code presents up to ten route alternatives, each with several speeds. It does not select the final route or average probabilities.
- A kick choice includes the aim point, launch speed, and elevation together. Named passes offer different leads based on receiver velocity; shots offer five points across the goal. A collision-free forecast filters out launches that cannot reach receiving height or pass below the crossbar. JEV chooses from the remaining combinations. Opponents can still intercept or save the ball. The engine applies the selected launch values without correction after the choice.
- Goalkeepers retain their separate controller: hold, block, low or high dives, goal-line movement, and distribution. The keeper selects position and speed. A committed dive finishes before another dive can start.

The named presser can choose **Close and tackle** while still outside immediate tackling range. JEV selects the approach direction and speed. The engine attempts that chosen tackle when the defender reaches the same carrier within 1.65 metres. Plain runs do not tackle automatically. A change of carrier cancels the challenge. Close approaches offer 0.25, 0.5, and 1 metre steps. For moving carriers, the menu offers sustained routes and removes slower options that cannot close the gap where a faster option exists. Maximum-speed carriers can still escape. Pressing and receiving areas can reach the pitch edges; they are not restricted to formation bounds.

A run vector starts at the player's position when the reply arrives. Thus a delayed forward command cannot send the player back to a target already passed during the request. Replacement commands retain velocity. A valid run continues while the next reply is pending, with a 1.2-second watchdog. Responses older than 1.2 seconds are rejected. Kicks have a 250 ms execution window. A change in team possession invalidates a former attacking or defensive command. The model receives the previous command and remaining duration, so it can continue useful movement.

This is a combination of code-defined team duties and model-selected physical controls. It is more constrained than the earlier unrestricted controller. It does not establish that JEV has learned a general football strategy. Practice retains the local controller. The selected human player remains protected from JEV commands, including after a player switch. The penalty mode remains available at `/`.

Use the team selector in the decision panel to inspect Spain or Argentina. Each player shows its duty and the selected control combination. Expand the movement or kick entry to see all alternatives and probabilities. Each team has a separate response history. The yellow ring marks the human player; the blue ring and line mark the inspected route. The goalkeeper panel retains its separate history and probabilities.

A real API failure pauses the match and retains the cause and request number. Cancelled or obsolete requests cannot pause play. The server has three execution slots and up to six waiting requests. Its 2.2-second limit includes queue time. No API failure silently changes the controller.

For comparison, `JEV_OUTFIELD_CONTROLLER=raw` starts the server with the earlier version 2 controller. The default is the coordinated version 3 controller. This switch is explicit; it is not an automatic fallback. The original fixed-action controller remains in the source and in Practice.

The default camera follows the ball from the side, with smooth movement and a small lead in the ball's direction. Use C or the Camera menu to select the wide or end-to-end view. The zoom control changes camera distance. WASD follows the screen direction in each view. EA lists Tele Broadcast, Co-op, and End-to-End cameras, with height and zoom controls in its [FC camera settings](https://www.ea.com/able/resources/ea-sports-fc/fc-26). These settings informed the prototype views.

Team Play checks:

```sh
npm test
node tests/full-match-check.mjs
node tests/record-team-demo.mjs
node tests/broadcast-check.mjs
node tests/human-controls-browser.mjs
node tests/keeper-live-check.mjs
node tests/keeper-browser-check.mjs
node tests/team-action-check.mjs
node tests/attack-live-check.mjs
node tests/attack-browser-check.mjs
node tests/request-cadence-check.mjs
node tests/request-cadence-check.mjs --live
JEV_TEST_URL=http://127.0.0.1:4318 node tests/model-control-live-check.mjs
JEV_TEST_URL=http://127.0.0.1:4318 node tests/model-control-browser-check.mjs
node tests/record-broadcast-demo.mjs
node tests/support-loft-browser.mjs
node tests/teammate-handoff-browser.mjs
```

The browser scripts require the running server and Chrome. Live checks make a bounded number of paid JEV requests. The cadence check uses controlled 150 ms replies by default; --live uses JEV. The first script checks all three plans, keyboard controls, Practice, pause, live plan changes, and probability inspection. The second records a short live match sample. The support and loft browser check uses live JEV calls. The teammate handoff check uses controlled replies and makes no paid calls. Reports and media are in `artifacts/`.

## Penalty controls

- Move the mouse over the pitch, or use WASD, to aim.
- Hold Space or the shoot button to charge. Release to strike.
- At full power, the shot releases automatically. Excess power adds a small accuracy error.
- Press Enter to start or take the next penalty.
- Press R after a shot to watch the replay.
- Use the sound button to enable the stadium sound.

Five shots make one match. Goals and saves have separate counters. A miss is not a save. The dots track each shot. Replay does not change the counters or make model calls.

## JEV control

The model is `jev-1.13.0`. It has ten actions: wait, block at the current position, step left or right by 0.25 or 0.50 metres, and dive low or high to either side. Steps use world distance, so screen size does not change movement. Steps have acceleration and a speed limit of 3 m/s. The keeper can make another decision after a step or block. A dive is irreversible for the rest of the shot.

During the approach, the input contains the visible body lean and previous shot directions. After contact, it contains observed ball position and velocity. It also contains keeper position, movement status, and step target. Code calculates the likely goal crossing side and height, then the distance from the keeper. JEV selects the action. These are small, constrained decisions; the game does not establish that JEV has learned a general football strategy.

The request never includes the private aim target or shot power. The model's choice probabilities describe action preference. They are not measured save probabilities.

The client requests a decision during the approach, then checks at 100 ms intervals during flight while the keeper remains uncommitted. It permits one pending request and at most seven requests per shot. A slow response does not stop the simulation. Old responses are rejected. Network time and physical reach can prevent a save even when the selected action is correct.

The **Decisions** panel shows all ten action probabilities. The selected action has an orange border. The shot history lists each returned decision, its response time within the run-up or flight phase, and the request duration. Each entry states whether the keeper used the action. Rejected responses remain visible with a reason. Failed requests have a separate entry.

Select a history entry to inspect its probabilities. Select **Latest** to follow new responses again. History remains visible on the result screen and during replay. Replay shows recorded decisions and makes no model calls. The next shot clears the panel. On narrow screens, select **Decisions** to open or close the details.

## Physics

The simulation runs at 180 fixed steps per simulated second. It includes gravity, air drag, ground bounce and friction, goal frame collision, goalkeeper capsule collision, and net response. Swept collision checks use the first contact point. The same joint positions drive the displayed goalkeeper and its collision shapes.

A goal requires the whole ball to cross the goal plane inside the frame. Contact with a post or keeper can still lead to a goal. The goal flag is set once. The net then stops the ball. These are simplified game physics, not a full biomechanics model.

## Tests and evidence

```sh
npm test
node tests/live-check.mjs
node tests/live-check.mjs --after-fix
node tests/footwork-check.mjs
node tests/decision-display-check.mjs
```

The browser tests require Chrome at the standard macOS application path and a running server. They use a separate headless browser and make a small number of paid JEV calls. The first run makes ten fixed model checks, five scoring checks with a stationary test keeper, and five live shots. The `--after-fix` run skips the fixed model checks. Reports and screenshots are written to `artifacts/`.

The tests cover goals, saves, misses, posts, crossbar, whole-ball crossing, single counting, high and low dives on both sides, replay, and match reset. The response format and private-input filtering also have tests.

`node tests/record-demo.mjs` captures a short live demo with low and high shots. It saves browser screenshots and a frame list for video encoding. It also makes paid JEV calls.

The footwork test makes six fixed JEV checks and plays two live shots. It records movement, decisions, scores, and replay checks in `artifacts/footwork-check.json`. Images and video frames show each step. Local tests also check exact step distance, speed limits, a step followed by a dive, repeated commands, position limits, and shots that a step can save.

The decision display check plays two live shots and one shot with a delayed test response. It checks all ten displayed probabilities, history selection, replay, reset, the narrow screen layout, and rejected responses. It saves a report and screenshots in `artifacts/`.

## Current scope

The scene uses Three.js, procedural stadium and player geometry, local animation, shadows, and synthesized audio. It is a browser prototype. Photorealistic character assets, motion capture, detailed cloth, and production football animation remain future work.

The model key remains on the server, but the game simulation is local to the browser. This is suitable for the current single-player prototype. Competitive multiplayer would require an authoritative server simulation.

## Human player models in Team Play

Team Play now loads a local human model from the Quaternius Universal Base Characters Standard pack. The model has a continuous body mesh and a bone skeleton. Team materials provide the jersey, shorts, and socks. Each of the 22 players has an independent skeleton. The model loads once; shared geometry and source textures reduce duplication. If it fails to load, the earlier player remains visible and the browser reports the error.

The new running motion follows actual velocity and simulation time. It adds arm swing, elbow bend, knee lift, alternating foot contact, body lean, and smooth visual turns. New JEV replies do not reset the animation phase. A pause stops the animation. Goalkeepers use the same joint positions as their collision controller. Physics, JEV decisions, and movement speed are unchanged by this visual layer. Penalty mode retains its existing player models.

The model is a generic human, not an individual likeness. Running motion is procedural. The next quality steps would be dedicated football clothing and motion-capture clips. Three.js already supports importing and blending those clips; changing the rendering engine is not required.

Open `/tests/player-preview.html` for the moving before-and-after comparison. Run `node tests/player-visual-check.mjs` to record it and check all 22 players, three cameras, and keeper hand positions. This check uses Practice and makes no paid JEV calls. Asset source, licence, and rebuild instructions are in `assets/players/README.md`.


## Request diagnostics

The local server records decision status, request number, game sequence, game time, and duration in `artifacts/server-decisions.jsonl`. It rotates that file at 2 MB and keeps one previous file. Logs exclude keys, prompts, and complete model responses. `/api/diagnostics` returns the last 100 entries from the current server process and the active and waiting request counts. Browser request failures are also available through `window.__MATCH__.getState().requestFailures` and the browser console.

Run `node tests/request-slots-server.mjs` for an isolated server overlap test with a mock model. Run `node tests/goal-restart-browser.mjs` for controlled goal, kick-off, timeout, and retry checks. Add `--live` to the goal check for a short real JEV check and a recording. Only the live version makes paid model calls.
