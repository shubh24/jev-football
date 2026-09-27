# JEV football feasibility test

JEV can return choices for all 11 players in one API request. This test supports a fast prototype. It does not prove football skill or a fixed 100 ms response time.

The test used `jev-1.13.0`. It sent synthetic game states with 22 players. The API key stayed in memory. No key value is stored in these files.

| Questions per request | Samples | Median | Minimum | Maximum | At or below 100 ms |
| --- | --- | --- | --- | --- | --- |
| 1 movement choice | 8 | 119.26 ms | 93.48 ms | 170.08 ms | 1 |
| 11 movement choices | 8 | 140.68 ms | 119.36 ms | 183.49 ms | 0 |
| 11 movement choices, 11 action choices, 11 sprint questions | 8 | 155.56 ms | 113.53 ms | 303.73 ms | 0 |

There were 26 requests: two warmup requests and 24 measured requests. All 26 passed the response checks. Those checks cover answer keys, types, allowed choices, and probability ranges and sums. They do not establish that the selected actions are correct.

Requests ran sequentially over one reused HTTPS connection. The test mixed the three request sizes. Player positions changed slightly between requests. Timing includes the full response transfer and JSON decoding. The test did not run a match or apply a sustained load of ten requests per second. It omitted pass targets, shot direction, and shot power. These additions can affect timing and cost.

Read `benchmark-results.json` for the recorded answers, usage, method, and an example request without credentials. Run `python3 benchmark.py --live` to repeat the bounded test. Each run makes paid API calls and replaces the results file. It reads only `JEV_API_KEY` from `~/projects/sales-engine/.env`.

## Proposed control design

1. Run the game physics at a fixed rate, independent of API requests.
2. Calculate distances, legal actions, pass lanes, and ball trajectories in code. Give JEV compact descriptions of these results with the game state.
3. Give each player a set of legal candidate actions. Each candidate contains consistent controls, such as movement direction and sprint, or pass target and power.
4. Ask JEV to choose among these candidates for each player in one request. Include each player ID in the question instructions. The API does not send the question key to the model.
5. Include current roles and previous intentions in the shared state. Questions in the same request are independent. They cannot read each other's new answers.
6. Apply the selected actions through the normal player controls. Check game rules again when the response arrives.
7. Track state age and reject old responses. Hold movement for a bounded duration. Do not repeat a kick or tackle because its command remains active.
8. Record any scripted fallback separately. This keeps the test of JEV's ability meaningful.

Use Choice for mutually exclusive movement directions. Separate yes/no questions for opposite buttons can produce inconsistent controls. Complete candidates can also prevent a kick target from conflicting with a separately selected action.

A probability attached to a Choice describes the model's answer distribution. It is not a measured chance that the shot will score. Test outcome estimates against repeated simulation results before using them as success probabilities. Avoid random action changes on each update; start with the highest-probability choice and test action persistence.

## Next experiment

Build an overhead 3-v-3 game with goalkeepers. Use identical physics and action limits for both sides. Show action choices, response times, and state age. Compare JEV with a simple scripted opponent. Then test 11-v-11 team coordination.

Measure pass completion, shots, goals, illegal commands, team spacing, and missed response deadlines. Test a smaller state with calculated features against the raw-coordinate state used here. This will show whether the changes improve response time and play quality.

The game server calls JEV directly. The game owns timing. JEV's typed-question endpoint is not the same interface as a chat model. No agent framework is required.

At about 5,950 input tokens per team request, ten requests per second would cost about $9 per hour of active play at the published input price of $0.042 per million tokens. This is a projection for this payload, not a measured production cost. Additional questions, state data, and infrastructure change that cost.

## Sources

- [API reference](https://docs.typesafe.ai/api)
- [Choice and probability outputs](https://docs.typesafe.ai/primitives/choice)
- [Parallel, independent questions](https://docs.typesafe.ai/introduction)
- [Numeric limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- [Model version, limits, and price](https://docs.typesafe.ai/models)
- [TypeSafe launch report, including its structured-state Doom demo](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
