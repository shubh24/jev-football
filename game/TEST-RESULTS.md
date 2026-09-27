# Penalty control and scoring results

The current build uses JEV `jev-1.13.0` directly. Tests used an isolated browser. They did not control the user's browser session.

## Changes made after testing

The action interface already had six choices: wait, centre, left low, left high, right low, and right high. The original movement made both low and high dives raise the hands. The low dive now lowers the hips and reaches down. The high dive adds lift and reaches up. The display and collision shapes use the same joints.

The swept collision check now uses the first surface contact. The earlier check used the point of minimum distance, which could give an incorrect rebound direction for a glancing contact.

## Fixed JEV decisions

Ten synthetic flight observations covered left low, left high, centre, right low, and right high, twice each. The second set supplied a conflicting body-lean cue for some shots. Code calculated the crossing lane and height from observed ball motion. JEV chose the correct corresponding action in all ten cases.

- Correct choices: 10/10.
- Median model request time: 151 ms.
- Observed range: 88–229 ms.

This is a small test of constrained action selection. It is not a measure of general football strategy or probability calibration.

## Browser scoring checks after the fix

These five checks used a stationary test keeper to isolate scoring from model decisions.

| Shot | Expected | Actual | Goals after shot | Saves after shot |
| --- | --- | --- | --- | --- |
| Clear corner | Goal | Goal | 1 | 0 |
| Into the keeper's body | Save | Save | 1 | 1 |
| Outside the goal | Miss | Miss | 1 | 1 |
| Into the right post | Miss | Miss | 1 | 1 |
| Above the crossbar | Miss | Miss | 1 | 1 |

All five passed. Replay did not change the score or make model calls. Restart after five shots reset the round, goals, and saves.

## Live five-shot match after the fix

These shots used live JEV responses and normal mouse and keyboard controls.

| Shot | JEV action | Response | Result |
| --- | --- | --- | --- |
| Left high | Left high | 147 ms | Goal |
| Right low | Right low | 81 ms | Save |
| Centre | Centre | 179 ms | Save |
| Right high | Right high | 92 ms | Save |
| Outside the goal to the right | Right low | 100 ms | Miss |

The final counters were **1 goal and 3 saves**. The remaining shot was a miss. All five selected directions matched the observed ball movement. There were no browser script errors.

The earlier version recorded 3 goals, 1 save, and 1 miss for the same five target types. API response time and browser timing varied between runs, so this is not a controlled estimate of save-rate improvement. The deterministic movement tests separately verify the dive fix.

## Physics and input tests

All 17 automated tests pass. They cover unobstructed goals, misses, post and crossbar contact, central saves, a keeper on the wrong side, high-speed collision, low and high dives on both sides after a 200 ms response, whole-ball crossing, and single goal counting.

A post rebound into the net remains a goal. A goalkeeper deflection into the net also remains a goal. The tests verify these cases. Request filtering removes the private aim and power, and invalid model responses are rejected.

## Recorded demonstration

The 22-second recording contains two additional live shots and slow-motion replays:

- Left low: JEV selected left low in 112 ms. The keeper saved the shot.
- Right high: JEV selected right high in 191 ms. The shot scored.

The second shot shows that correct action selection does not guarantee a save. Request time and physical reach still matter. The recording was made after the fixes and uses live model responses.

Files:

- `artifacts/jev-penalty-test.mp4`: recorded gameplay and replays.
- `artifacts/low-dive.png` and `artifacts/high-dive.png`: replay frames.
- `artifacts/live-check.json`: original model checks and browser results.
- `artifacts/live-check-after-fix.json`: browser results after the fixes.

The visual scene and physics remain a prototype. Further tests should measure decision accuracy and save rate across more shot speeds, locations, and network delays.

## Side steps and repeated decisions

The keeper now has ten actions. Four new actions move left or right by 0.25 or 0.50 metres. A step has acceleration and a 3 m/s speed limit. A later dive starts from the current position. Repeated step commands cannot add distance while a step is in progress.

All 27 local tests passed. The ten new tests cover step distances, speed limits, repeated commands, position limits, a step followed by a dive, and direction relative to the keeper. Two tests use the same shot with and without movement. The stationary keeper concedes. The keeper with a short step saves.

JEV selected the expected action in all six fixed position tests. These include each step size and direction. Two tests place the keeper beyond the ball path, so the correct step points towards the goal centre. Response times were 114–332 ms. The model receives calculated trajectory cues; this test checks action selection from those cues.

Two live shots targeted x = +0.70 m and x = -0.70 m, at a height of 1.20 m. JEV selected a 0.50 m step in the correct direction for each shot. Both shots were saved. The step decisions took 117 ms and 125 ms. JEV returned three flight decisions for the first shot and four for the second. Later decisions told the keeper to wait while the step finished. Both shots also had one approach decision.

The browser checks confirmed 0 goals and 2 saves. Replay did not change the counters or request count. The next shot reset the keeper to x = 0. No browser script errors occurred. This small sample does not guarantee two responses before the ball arrives for every shot.

- `artifacts/footwork-check.json`: observations, actions, timing, and score state.
- `artifacts/jev-footwork-test.mp4`: both live shots and their replays.
- `artifacts/footwork-right.png` and `artifacts/footwork-left.png`: replay images.

The earlier results above describe the previous six-action version.

## Decision display

All 27 local tests passed. Eight browser checks also passed for the new display:

- All ten displayed probabilities match the returned response.
- Each returned decision has a history entry and a response time.
- Selecting an earlier entry restores that entry's probabilities.
- The Latest button returns to the newest entry.
- Replay keeps the history and does not change scores or make requests.
- The next shot clears the history and probability values.
- A live low dive appears as its own action. The panel works at a width of 390 pixels.
- A delayed test response remains visible as Not used, with a reason.

The browser run used two live shots and one delayed test response. It reported no script errors. A narrow screen check found text overlap with the result screen. The panel now appears above that text when open. The final run verified that the panel receives input at the selected action's position.

Files: `artifacts/decision-display-check.json`, `artifacts/decision-history-live.png`, `artifacts/decision-history-replay.png`, and `artifacts/decision-history-mobile.png`.

## First 11 vs 11 match

The new Team Play mode uses Possession, Attack, and Defend plans. The plans set formation targets and player roles. JEV receives a separate bounded action question for each of its 11 players. No separate reasoning model is used.

All 42 local tests passed. The new checks cover team sizes, formation differences, assigned pressers, both goals, whole-ball crossing, single goal counting, post contact, boundary rebounds, dribbling at the boundary, both keepers, passing, shooting, tackle recovery, player switching, halftime, full time, and request validation. A 30-second practice simulation verifies passing and finite player positions inside the pitch.

The first practice run showed repeated tackles between the same two players. A short recovery period and better passing-lane checks resolved that immediate exchange. A longer local simulation with Attack against Defend produced four goals, with no invalid player positions. This is a functional check, not a comparison of strategy strength.

Three live model fixtures returned all 11 valid player choices under each plan: 33 valid choices in total. These fixtures test the request and response structure. They do not establish that the model follows a strong football strategy.

Eight browser checks passed: 22 visible game-state players; no API calls before kick-off; movement and sprint; passing; player switching; Practice with no calls; pause; and live plan changes with per-player probability inspection. The browser report groups some of these checks together. No script errors occurred.

The final recording used the updated server and made 17 live team requests. Response times were 119–292 ms. The human shoot key worked. JEV received the ball and released a pass. Changes to Attack and Defend reached the model. Pausing stopped further applied responses. The recording contains no goal; goal counting was checked separately in the local physics tests.

Evidence:

- `artifacts/full-match-check.json`: model fixtures and browser checks.
- `artifacts/team-video-report.json`: final live recording state and decisions.
- `artifacts/jev-team-play.mp4`: live gameplay sample.
- `artifacts/team-play-live.png` and `artifacts/team-play-decision.png`: screenshots.

This version uses simple rules, formation movement, and bounded model choices. Tactical quality, long-match balance, and performance on other computers need further testing.

## Short actions and broadcast camera

All 52 local tests passed. The ten added tests cover short movement limits, end-line choices, separate closing and tackling actions, possession changes, response expiry, a pass receiver, and camera controls. The earlier goal and penalty checks still pass.

Ten browser checks passed in `artifacts/broadcast-check.json`. These cover controls, Practice without API calls, all three camera modes, pause, live plan changes, all 11 decisions, and past-response inspection while new responses arrive. There were no browser script errors. The display was checked at 1440 × 960 and 1050 × 760.

Three fixed live model tests used the final instructions. JEV selected a low shot from a clear shooting position, a pass from near the end line, and a tackle against a nearby ball carrier. Response times were 162–296 ms. An earlier tackle test selected closing instead of tackling. The instruction now tells the assigned presser to prefer a tackle when the option is available. The fixed tests check these cases only; they do not measure general tactical skill.

The final video contains 62 live team responses over 14.19 seconds between the first and last response: 4.30 responses per second. Client round-trip times were 153–319 ms. The target is five requests per second, with at most one pending request. Of 682 player decisions, 677 passed the command checks and five were rejected. This count shows accepted commands; it does not mean every accepted command ran to completion. The next response can replace a command.

JEV released five passes in the recording. The human shoot key worked. All three camera views worked. Pause stopped further applied responses. There were no script errors. No goal occurred in this recording. Goal counting remains covered by the local physics tests.

Evidence:

- `artifacts/team-action-check.json`: three fixed live model tests.
- `artifacts/broadcast-check.json`: browser checks.
- `artifacts/broadcast-video-report.json`: live decisions and match state.
- `artifacts/jev-broadcast-test.mp4`: live game and camera changes.
- `artifacts/broadcast-final.png`, `artifacts/broadcast-wide.png`, and `artifacts/broadcast-end.png`: camera views.

The response rate depends on network and browser speed. The new choices and short commands reduce long blind runs. Long-match tactics and balance still need further tests.

## Automatic selection and keyboard kick direction

All 63 local tests passed. The 11 added tests cover incoming-ball selection, new possession, manual override, high or departing balls, an earlier opponent in the flight path, directional teammate selection, passes into space, facing direction, and all eight directions in each camera view. The earlier goal, JEV command, and penalty physics checks still pass.

Seven browser checks passed in Practice, with no API calls and no script errors. Pass and shot direction were checked in the broadcast, wide, and end-to-end views. The shot check changes the direction after charging starts and verifies that release uses the new direction. A separate check verifies player selection before the pass arrives and after receipt. Passes use limited assistance towards a teammate in the selected direction; shots follow the direction without goal assistance.

The initial browser test sent synthetic key events to the window instead of a page element. That test failed before any kick. The test now sends events through the page body, as normal keyboard input does. The final run passed.

Evidence:

- `artifacts/human-controls-browser.json`: seven browser checks and ball velocities.
- `artifacts/keyboard-pass.png`: diagonal pass and selected receiver.
- `artifacts/keyboard-shoot.png`: a shot directed to screen-left.
- `artifacts/automatic-receiver.png`: the selected player after receipt.

These checks cover the new controls. They do not measure receiving accuracy across every possible flight or camera position.

## Independent JEV goalkeepers in Team Play

Both keepers now use an independent JEV request with one question per keeper. The team request contains ten outfield questions. Match keepers reuse the penalty movement controller and collision poses. Human selection and kick controls exclude keepers. Both keepers can distribute the ball after possession.

All 85 current local tests passed, including 14 added match-keeper tests. The new tests cover low and high dives to both sides at both goals after a 200 ms delay, step distance, mirrored goal coordinates, separate request contents, late response rejection, back passes, and goalkeeper possession. Existing penalty and goal-counting tests remain green.

Twelve fixed live JEV tests returned the expected action: four dive cases and two step cases at each goal. Round-trip times were 133–271 ms. Each response was applied after advancing the simulation by the measured delay. Every test produced keeper contact, with no goal. These are fixed shot tests, not a measured match save rate.

The first browser shot used a 0.5-second flight to the keeper plane. The correct low dive arrived after 266 ms of network time, at 308 ms of simulated flight. That shot scored. Its report remains in `artifacts/keeper-browser-first-run.json`. Correct direction alone does not guarantee a save. A later browser run also timed out while waiting for a dive; subsequent runs completed. Network timing remains a limitation.

The final browser checks used a 0.65-second flight so the interface and contact checks had more time. Argentina's keeper made a low dive; Spain's keeper made a high dive. Both made contact and neither shot scored. The run checked visible probabilities, pause, outfield-only selection, no API calls in Practice, and ten outfield rows. It reported no browser script errors. Keeper response times in that run were 106–360 ms. The screenshots pause the simulation during the dive and hide only the pause overlay. The initial shot is injected into an isolated browser page; model calls and gameplay code are real.

Visual inspection found a roof blocking the human goal in the end camera. Roofs now hide when the camera is outside the corresponding stand. The inspected keeper's ring follows the dive pose.

Evidence:

- `artifacts/keeper-live-check.json`: twelve fixed JEV tests.
- `artifacts/keeper-browser-check.json`: final browser checks and response history.
- `artifacts/keeper-browser-first-run.json`: the faster shot that scored after a late dive.
- `artifacts/match-keeper-argentina-low.png`: Argentina's low dive.
- `artifacts/match-keeper-spain-high.png`: Spain's high dive.

## Forward attacks and easier loose-ball control

All 94 local tests passed. Nine new tests cover the 1.4 m control radius for both teams, high-speed pass receipt, nearest-player priority, height and shot limits, player recovery, keeper reach, open running lanes, forward support targets, and return-pass context. Existing penalty, keeper, and goal-counting checks remain green.

Three live JEV position checks selected the expected type of action under Possession: a drive towards goal in open space, a shot from a clear shooting position, and a forward pass under pressure. Off-ball strikers and wingers selected attacking runs. The request contains computed running-lane and shooting cues; JEV still selects the action.

A bounded engine run used 13 team responses. JEV carried the ball from z = 12 m into shooting range and took one shot after about 3.2 seconds of simulated play. It made no passes in that open-space attack. Argentina's outfield players used local rules. Keepers retained standing physical poses in this particular engine test.

The browser test used the real team and goalkeeper endpoints with Possession selected. It recorded 18 team responses, forward runs, a drive, and one shot. Argentina's keeper contacted the shot. The score was 0–0 at the end of the recording. There were no browser script errors. The starting attack was injected only into the isolated test browser, with defenders placed wide to provide a clear running lane. This is a controlled behaviour check, not a full-match tactical benchmark.

Evidence:

- `artifacts/attack-live-check.json`: model choices and the bounded attack.
- `artifacts/attack-browser-check.json`: browser state and real response history.
- `artifacts/jev-attacking-play.mp4`: the 5.28-second live browser recording.
- `artifacts/jev-forward-run.png` and `artifacts/jev-attacking-shot.png`: run and shot decisions.

The larger control radius applies to loose balls for both teams. It does not transfer an opponent's held ball, extend keeper reach, or collect a fast shot at the full radius. The nearest eligible player wins a contested loose ball.

## Calls after each reply and continuous movement

Live Team Play no longer has a fixed delay between requests. The outfield loop and the goalkeeper loop each start the next request after processing the previous reply. Each loop permits one pending request. Practice retains its local intervals and makes no API calls. Penalty request timing is unchanged.

Dribbles, drives, sprints, attacking runs, formation runs, marking, lane blocking, and chasing use continuous commands. Directional runs get a new target from the player position at receipt. Position runs use the actual assigned target. Replacement preserves velocity. Continuous commands expire 650 ms after receipt. Steps and jockey adjustments retain their distance limits. Shots and passes retain their existing expiry rules. Responses older than 700 ms are rejected.

All 100 local tests passed. Six added tests cover consecutive runs with 150, 300, and 550 ms response delays, a hold command, missing replies, delayed targets, expired shots, and consecutive chase commands. The chase test keeps speed above 6.9 m/s between replies. Earlier penalty, goalkeeper, scoring, and sound tests also pass.

The controlled browser test used 150 ms mock replies. It measured 6.49 responses per second in each loop. The median gap from reply parsing to the next request was 0.2 ms for outfield players and 0.3 ms for keepers. Minimum running speed after acceleration was 4.7998 m/s against a 4.8 m/s command. Pause stopped requests. Resume kept one pending request per loop. An injected error paused the match without repeated retries. Practice made no API calls. No browser script errors occurred.

The final live browser test used 18 outfield replies and 25 keeper replies. Outfield round trips were 160–325 ms, with a 216 ms mean and 4.76 replies per second. Keeper round trips were 91–284 ms, with a 156 ms mean and 6.64 replies per second. Both loops had a median reply-to-next-call gap of 0.2 ms and a maximum of 0.5 ms. Each loop had at most one pending call. These are short-run measurements, not a guaranteed service rate.

JEV selected 11 consecutive drives followed by a shot. Across 100 recorded frames after initial acceleration, the ball carrier stayed between 7.4969 and 7.5000 m/s. The isolated test starts with a clear running lane. The live model and game physics then control play. The 4.72-second recording includes the run and shot. Pause worked, and there were no browser script errors.

Evidence:

- `artifacts/request-cadence-controlled.json`: controlled timing, speed, pause, resume, error, and Practice checks.
- `artifacts/request-cadence-live.json`: measured live calls, player speeds, and response history.
- `artifacts/jev-continuous-run.mp4`: final live recording.
- `artifacts/jev-continuous-run.png`: frame from the run.
- `artifacts/continuous-live.png`: final state and decision display.

Run `node tests/request-cadence-check.mjs` for controlled replies. Add `--live` for a bounded paid JEV check. The server and Chrome must be available.

## Human player model and running motion

Team Play now uses a Quaternius human model with independent skeletons for all 22 players. The source is the free CC0 Standard pack. The local GLB is about 6 MB and contains its textures. The existing renderer remains available if model loading fails. Penalty mode keeps its existing player renderer.

The browser check loaded all 22 models without failed asset requests or script errors. It measured 60.17 animation frames per second across 120 frames in headless Chrome on this computer. This short local check does not establish performance on other devices. The test used Practice, so it made no paid JEV calls.

All three match cameras were checked. A close comparison shows the earlier separate body shapes and the new continuous human mesh in the same kit. The new motion uses arm swing, bent elbows, knee lift, body lean, alternating foot contact, and smooth visual turns. It runs from simulation time and velocity. It does not restart on JEV replies.

For both goalkeepers, the imported hand bones matched the collision-pose hand positions during a low left dive and a high right dive, within floating-point precision. This verifies alignment of those joints. It is not a new measurement of the save rate. The underlying save controller and collision shapes did not change.

All 117 current local tests passed. Three added animation tests check phase continuity, pause behaviour, alternating foot contact, bounded leg lengths, smooth angle changes, and no mutation of the simulation player. The existing gameplay and penalty checks also pass.

Evidence:

- `artifacts/player-visual-check.json`: asset loading, frame rate, cameras, and keeper joint checks.
- `artifacts/player-model-comparison.png`: close before-and-after view.
- `artifacts/player-motion-comparison.mp4`: 4.08-second comparison recording.
- `artifacts/human-players-match.png`: all-player match view.
- `artifacts/human-players-broadcast.png`, `human-players-wide.png`, and `human-players-end.png`: camera checks.

The current model is a generic human. It does not reproduce individual player faces. The kit follows the base body surface, and movement is procedural rather than motion capture. Dedicated football clothing and captured football animations would improve close-up realism further.


## JEV action and control selection

The live match controller now uses two model stages. JEV first selects the action and pass receiver. It then selects the movement direction, distance, and speed, or the kick aim, speed, and elevation. Each stage groups the player questions into one model call. Actions with no further settings need only the first stage. The settings use discrete allowed values. The model does not generate unrestricted numbers.

The game applies the selected controls and enforces physical limits. It does not add automatic pass lead or replace the selected kick elevation. A valid run continues while the next reply is pending. The new response age limit and run timeout are 1.2 seconds. Replacement commands preserve player velocity. Both stages use the same game observation; the second stage also receives the selected actions.

All 131 local tests passed, including 14 controller tests. These check selected controls, launch velocity, missing or invalid choices, cancellation, stale replies, possession changes, keeper movement, and continuous runs with 900 ms response cycles. This count includes tests from the other current game changes.

The isolated live browser check used eight outfield command batches and 16 model calls. Total time per batch was 298–571 ms, with a 389 ms mean. The maximum delay before the next batch was 0.6 ms. Each loop had at most one pending request. Pause and Practice checks passed. No browser script errors occurred.

A second live browser check placed the ball carrier under pressure. JEV selected a pass to J11, an aim point of (8, 20) metres, a speed of 14 m/s, and zero elevation. The engine applied the pass once. Its eight outfield batches took 389–649 ms, with a 467 ms mean. The maximum delay before the next batch was 0.8 ms. Pause and Practice checks passed, with no browser script errors. The 5.32-second video shows this controlled check.

The first pressure fixture let a local defender take the ball before the first model request. The corrected fixture placed that defender under human control. The defender remained near the ball without an automatic tackle. The initial report is retained for reference.

These short checks verify control selection and application. They do not establish full-match strategy quality or goalkeeper save rate. In one separate shooting-position check, JEV selected a run instead of a shot.

Evidence:

- `artifacts/model-control-live-check.json`: five live action and control checks.
- `artifacts/model-control-browser-check.json`: live run timing and browser checks.
- `artifacts/model-control-pressure-browser-check.json`: selected pass, applied command, and timing.
- `artifacts/model-control-pressure-first-run.json`: initial pressure fixture result.
- `artifacts/model-control-pressure-decisions.png`: action and parameter display.
- `artifacts/jev-model-selected-pass.mp4`: live pass recording.

Run `node tests/model-control-live-check.mjs` for bounded live API checks. Run `node tests/model-control-browser-check.mjs` for the isolated browser check. Set `JEV_SCENARIO=pressure` for the pass fixture. These checks default to port 4318 and use live JEV calls.

## Lob, chip, and JEV teammate support

Live Team Play now has three independent request loops: ten Spain outfield players, nine unselected Argentina outfield players, and both goalkeepers. The selected Argentina player remains under human control. A selection change clears the affected orders, cancels the old teammate request, and rejects replies based on an older selection.

Both teams can select support runs, movement away from markers, wide overlaps, runs behind the defence, and defensive cover. The observations include nearby markers, pass-lane clearance, and measurements of nearby spaces. JEV still selects the movement direction, distance, and speed. These measurements are not imposed destinations. JEV can also select lob passes and chip shots.

U charges a lob pass. I charges a chip shot. Release the key to kick. WASD sets the direction at release. The ball uses the existing flight, collision, and goal rules. A chip counts as a shot; a lob counts as a pass. The penalty mode is unchanged.

All 131 current local tests passed. Twelve new support and loft tests cover human-control protection, selection changes, both teams' action choices, support observations, exact model parameters, lob clearance over a defender, and chip direction and power.

The live browser check used a clear carrier lane with opponents placed wide. All nine Argentina teammates moved under JEV control while keyboard input moved the selected player. Their displacement ranged from about 4 to 8 metres during the sample. Applied actions included support, overlap, runs behind the defence, and cover. Observed teammate response times were about 384–569 ms. Each request loop had at most one pending request. The next request followed completion of the previous request.

The same check used the U key to launch a live lob into space. The ball was visibly above the pitch. This lob had no named receiver, so this recording does not verify receiver handoff. A separate Practice check used I to chip a shot and verified direction and shot counting. Pause stopped all request loops. Practice made no JEV requests. The browser reported no script errors.

A separate browser test used controlled replies with a 250 ms delay. A pass changed the selected player from h10 to h7 while requests were pending. The new player remained human controlled, with no JEV order. The teammate request changed to exclude h7. The decision panel identified the selected player as human controlled. An injected teammate API failure paused all loops without a retry cycle. This test made no paid JEV calls.

These checks verify the new controls and team-control boundaries. They do not establish full-match tactical quality. The model can still select poor runs or kicks.

Evidence:

- `artifacts/support-loft-browser.json`: live model replies, movement, controls, and request checks.
- `artifacts/teammate-live-position.json`: a fixed live position with nine teammate decisions.
- `artifacts/teammate-handoff-browser.json`: controlled selection-change and failure checks.
- `artifacts/jev-teammate-support.png`: Argentina decision inspection.
- `artifacts/lob-flight.png` and `artifacts/chip-flight.png`: airborne ball checks.
- `artifacts/jev-support-and-lob.mp4`: 4.72-second live teammate and lob recording.

## Three-metre collection and manual switching

The loose-ball collection radius is now 3 metres for both teams. Existing height, speed, release-lock, recovery, shot, and goalkeeper restrictions remain in place. L selects the closest other human outfield player to the ball. The current player and both goalkeepers are excluded. The current possession is recorded on a manual switch so automatic selection does not immediately undo that switch.

All 132 local tests passed. The collection tests cover both teams at 3 metres and reject collection beyond that range. The switching test checks repeated presses, changed ball position, keeper exclusion, and automatic selection after a manual switch.

The isolated browser check also passed. Four L key events each selected the nearest other teammate. Both teams collected a ball at 3 metres using the engine served by the app. No model requests or script errors occurred. Report: `artifacts/collection-switch-browser.json`. Run `node tests/collection-switch-browser.mjs` to repeat the check.

## Request failures after a goal

The previous server did not retain error details. The precise cause of the user's reported pause cannot be recovered from its output. Code review found a request-overlap failure path: the server rejected a fourth request while a cancelled request was still releasing one of its three slots. This could affect replacement requests after player selection or a restart. This finding does not prove that it caused the reported incident.

The server now has three execution slots and a bounded queue of six waiting requests. Cancellation removes waiting requests. The existing server time limit includes queue time. The client marks deliberate cancellation separately from timeout. It ignores errors from a previous game sequence, strategy, or cancelled request. Real request failures still pause play, with the cause and request number retained in the pause message.

The server now keeps rotating local request logs and a read-only diagnostics endpoint. Status, duration, request number, game sequence, and game time are recorded. Credentials, prompts, and complete model responses are excluded.

All 135 local tests passed. An isolated server with a mock upstream accepted four overlapping requests, returning four HTTP 200 responses. A replacement request also completed while an earlier request was cancelled. The active count never exceeded the configured slot limit. No real JEV calls were used in this server test.

The controlled browser check scored one goal with delayed requests pending. The score stayed 1–0, the next kick-off ran, and all three loops resumed. An injected HTTP 504 paused the match with the timeout reason and request number. Continue resumed play. No browser script errors occurred.

A separate live JEV check scored one goal and resumed after kick-off. The score stayed 1–0. After kick-off it received two opponent batches, three teammate batches, and seven goalkeeper batches. It made 19 browser decision requests in total, including cancellations at the goal and at the test's final pause. No request failure paused play, and no script errors occurred. This is a short regression check, not a guarantee that the upstream service will never time out.

Evidence:

- `artifacts/request-slots-server.json`: controlled server overlap and cancellation results.
- `artifacts/goal-restart-controlled.json`: goal, kick-off, injected timeout, and retry results.
- `artifacts/goal-restart-live.json`: live JEV check.
- `artifacts/server-decisions.jsonl`: current local request log.
- `artifacts/goal-restart.mp4`: 4.2-second live goal and kick-off recording.

## Coordinated model controls — version 3

The default outfield controller now uses code-defined team duties with JEV-selected physical controls. The code assigns cover, width, support, depth, overlap, receiving, recovery, and one presser. It offers bounded routes for each duty. JEV selects direction, distance, and speed together. Kicks likewise use one joint aim, speed, and elevation choice. A free-flight forecast filters physically unsuitable kicks. The selected values are applied without a later aim or power correction. Goalkeepers retain the prior controller.

The previous raw controller remains available through `JEV_OUTFIELD_CONTROLLER=raw`. It is an explicit comparison mode, not a silent fallback. The original fixed-action routines remain in Practice and in the source.

The delayed-run fault is fixed. The chosen run vector now starts at the player's position on receipt. The regression test continues an old run through a 600 ms response delay, then applies a two-metre forward choice. It verifies forward movement rather than a return to the old observation target. Repeated equal runs preserve velocity, and the watchdog still stops a player if replies cease.

The new observation includes each player's current command. The client sends compact fields, not previous probability tables. Sanitization validates these fields. Passes into space now record the passer and pass time, including human ground passes and lobs. They retain the attacking phase for a bounded flight window. Named receivers receive a separate receiving area. A possession change invalidates former attacking or defensive commands. The selected human player remains excluded from teammate requests.

All 149 local tests passed. Fourteen new tests cover team duties, presser stability, flight transitions, route constraints, human control, timing, continuous runs, possession changes, coupled kick controls, selected physics, two-stage requests, invalid answers, and cancellation. The controlled browser checks for player handoff, goal restart, timeout display, and retry also passed without live model calls.

Five fixed-position live checks used the same states as the previous audit. The final comparisons were:

| Position | Earlier raw controller | Revised controller |
| --- | --- | --- |
| Open attack | Backward pass to j11 | Forward carry, 8 m at 5.5 m/s |
| Wide attack | j5 chose overlap with a backward bearing | j5 chose a forward overlap |
| Clear shooting position | Hold | Shoot at 33 m/s and 5 degrees |
| Defend a wide carrier | No shared pressing assignment | One named presser; j9 chose tackle |
| Loose ball with no pass metadata | Seven identical forward runs | One presser and separate recovery duties |

The last fixture is a loose-ball case, not a properly recorded pass. Separate tests verify that actual passes into space retain their attacking phase. The fixed replies took 407–691 ms. These five samples do not establish a statistical improvement in playing strength or latency.

The final continuous live browser check completed 20 opponent batches, 21 human-teammate batches, and 65 keeper batches. Outfield round trips averaged 449 ms, with a maximum of 622 ms. Each loop had at most one pending request. The selected human player stayed under human control. JEV carried forward, chose a shot, scored once, and resumed after kick-off. The final score was 0–1 and the match remained in play. No request failure or browser script error occurred. Pause stopped all loops. Practice made no model calls.

The model still operates within a code-defined tactical and physical menu. It can still choose a weak route, hold, or kick. A short successful sequence does not prove full-match strategy quality. A longer evaluation remains useful before replacing the controller again or adding another model.

Evidence:

- `artifacts/coordinated-live-check.json`: five fixed-position live checks.
- `artifacts/controller-coherence-audit.json`: earlier comparison states and decisions.
- `artifacts/coordinated-browser-check.json`: complete continuous-play result.
- `artifacts/coordinated-browser-summary.json`: compact timings and counts.
- `artifacts/coordinated-team-play.png`: team duty and joint control inspection.
- `artifacts/coordinated-team-play.mp4`: 12.72-second final live recording.

Run `node tests/coordinated-live-check.mjs` for the fixed checks and `node tests/coordinated-browser-check.mjs` for continuous play. Both use port 4318 and make live JEV requests. Run `npm test` for local checks without model calls.

## Closing and tackling

Tackle previously appeared only when the observation placed a defender within 1.65 metres of the carrier. A movement command did not permit tackling after it reached that range. The pressing area also tracked the ball offset and inherited formation limits near the pitch edges. Together, these restrictions could leave a defender moving beside or short of the carrier.

JEV can now choose `press_tackle` for the named presser. The second stage chooses the approach bearing, distance, and speed. That command permits one tackle on reaching the same carrier within 1.65 metres. It does not extend tackle range. A normal run does not gain this behaviour. A changed carrier invalidates the challenge. Recovery, release locks, and human-control protection still apply.

Close approaches include sub-metre routes. The pressing target follows the carrier's body and can reach the touchline and goal line. Sustained pursuit uses longer routes. A slower route that cannot close on a moving carrier is removed when faster choices exist; JEV still chooses the route and speed. The maximum-speed option remains available when a faster speed does not exist. This does not guarantee a catch against every sprint or turn.

The first live standing test passed, but the first moving test failed. JEV repeatedly selected 5.5 m/s against a carrier running at 5.8 m/s. That result prompted the closing-speed constraint. The initial report is retained in `artifacts/press-tackle-first-check.json`.

All 158 local tests passed. Nine added tests cover tackle availability, both teams closing and tackling without another reply, plain runs, changed carriers, cooldown, human exclusion, small steps, pursuit speed, and pitch-edge approach.

The final live browser checks both passed. Starting seven metres away, Rodri won the ball from a stationary human-controlled carrier in 1.68 seconds and from a moving carrier in 4.02 seconds. The human moved about 22.86 metres in the running case. Each case counted one tackle and ended with JEV possession. JEV selected the explicit closing action in both cases. There were no request failures or browser script errors.

Evidence: `artifacts/press-tackle-browser.json`, `artifacts/press-tackle-standing.png`, `artifacts/press-tackle-moving.png`, and `artifacts/jev-close-and-tackle.mp4`. Run `node tests/press-tackle-browser.mjs` to repeat the bounded live checks on port 4318.
