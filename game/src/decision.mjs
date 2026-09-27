export const ACTIONS = {
  wait: 'Stay balanced, or finish the current side step. Keep watching. Do not commit to a dive yet.',
  step_left_25: 'Step 0.25 metres left, negative x. Remain upright and ready for another decision.',
  step_left_50: 'Step 0.50 metres left, negative x. Remain upright and ready for another decision.',
  step_right_25: 'Step 0.25 metres right, positive x. Remain upright and ready for another decision.',
  step_right_50: 'Step 0.50 metres right, positive x. Remain upright and ready for another decision.',
  left_low: 'Dive to the left side of the screen, negative x, to stop a low ball.',
  left_high: 'Dive to the left side of the screen, negative x, and reach high.',
  center: 'Block at the current position and spread the arms. Do not move back to the centre of the goal.',
  right_low: 'Dive to the right side of the screen, positive x, to stop a low ball.',
  right_high: 'Dive to the right side of the screen, positive x, and reach high.',
};
const finite = (value, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid number');
  return value;
};
export function sanitizeObservation(data) {
  const phase = data.phase;
  if (!['approach', 'flight'].includes(phase)) throw new Error('Invalid phase');
  const output = {
    requestId: finite(data.requestId, 0, 1e9), shotId: finite(data.shotId, 0, 1e9), phase,
    elapsed: finite(data.elapsed, 0, 10),
    keeperX: finite(data.keeperX, -4, 4),
    keeperTargetX: finite(data.keeperTargetX??data.keeperX, -4, 4),
    keeperMoving: data.keeperMoving===true,
    visibleLean: ['left', 'balanced', 'right'].includes(data.visibleLean) ? data.visibleLean : 'balanced',
    history: Array.isArray(data.history) ? data.history.slice(-5).filter(x => ['left', 'center', 'right'].includes(x)) : [],
  };
  if (phase === 'flight') {
    const vector = (v, low, high) => { if (!Array.isArray(v) || v.length !== 3) throw new Error('Invalid vector'); return v.map(x => finite(x, low, high)); };
    output.ballPosition = vector(data.ballPosition, -50, 50);
    output.ballVelocity = vector(data.ballVelocity, -80, 80);
    const [x, y, z] = output.ballPosition, [vx, vy, vz] = output.ballVelocity;
    const t = vz < -0.1 ? Math.max(0, z / -vz) : 0;
    const crossingX = x + vx * t, crossingY = y + vy * t - 4.905 * t * t;
    const offset=crossingX-output.keeperX;
    output.observedTrajectory = {
      timeToGoalMs: Math.round(t * 1000),
      lane: crossingX < -0.65 ? 'left' : crossingX > 0.65 ? 'right' : 'center',
      height: crossingY > 1.2 ? 'high' : 'low',
      relativeSide: Math.abs(offset)<.2?'aligned':offset<0?'left':'right',
      horizontalOffsetM: Math.round(offset*100)/100,
      heightM: Math.round(crossingY*100)/100,
      lateralReach: Math.abs(offset)<=.28?'body':Math.abs(offset)<=.52?'quarter_metre_step':Math.abs(offset)<=.85?'half_metre_step':'dive',
      inGoalFrame: Math.abs(crossingX) < 3.66 && crossingY < 2.44,
    };
  }
  return output;
}
export function buildDecisionRequest(observation) {
  return {
    model: 'jev-1.13.0',
    state: { game: 'Football penalty. You are the goalkeeper. Directions are screen-relative: negative x is left. Goal width is 7.32m and height is 2.44m. Short steps move the current position by 0.25 or 0.50 metres with a speed limit of 3 metres per second. A step remains open to a later decision. A dive is irreversible. Shooter lean is a weak cue and may be a feint. Ball trajectory after contact is strong evidence. No private aim or intended shot target is provided.', observation },
    questions: {
      response: { type: 'choice', instructions: 'Choose the goalkeeper action that best intercepts the observed ball. During approach, normally wait. A small step can adjust position if visible cues support it; avoid an early irreversible dive. During flight, use relativeSide and lateralReach, which already account for keeper position. For body reach, block at the current position. For quarter_metre_step or half_metre_step at body height (0.65 to 1.8 metres), prefer that size step towards relativeSide instead of a dive. If keeperMoving is true, do not issue another step; wait for the current step to finish or dive if necessary. For dive reach, or a low or high ball beyond standing reach, select the matching side and dive height immediately. Do not delay a necessary dive just to take a step. A shot already in flight requires a prompt response.', criteria: ACTIONS },
    },
  };
}
export function validateDecision(data) {
  const answer = data?.answers?.response;
  if (!answer || answer.type !== 'choice' || !Object.hasOwn(ACTIONS, answer.choice)) throw new Error('Invalid answer');
  const probabilities = {};
  for (const key of Object.keys(ACTIONS)) probabilities[key] = finite(answer.probabilities?.[key], 0, 1);
  if (Math.abs(Object.values(probabilities).reduce((a, b) => a + b, 0) - 1) > 0.02) throw new Error('Invalid probabilities');
  return { action: answer.choice, probabilities, confidence: finite(answer.confidence, 0, 1) };
}
