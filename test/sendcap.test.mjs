import { test } from "node:test";
import assert from "node:assert/strict";
import { capDecision } from "../index.mjs";

// A two-window guard: a per-run ceiling and a per-day ceiling — the canonical email-blast case.
const twoWindow = (over = {}) =>
  capDecision({
    want: true,
    counts: { run: 0, day: 0, ...over.counts },
    caps: { run: 25, day: 50, ...over.caps },
  });

test("want + under every cap -> allow", () => {
  assert.deepEqual(twoWindow(), { want: true, allow: true, capped: null });
});

test("want=false never allows and is not 'capped' (so a no-op can still be marked handled)", () => {
  const d = capDecision({ want: false, counts: { run: 0 }, caps: { run: 25 } });
  assert.deepEqual(d, { want: false, allow: false, capped: null });
});

test("missing want defaults to a no-op", () => {
  assert.deepEqual(capDecision({}), { want: false, allow: false, capped: null });
  assert.deepEqual(capDecision(), { want: false, allow: false, capped: null });
});

test("a window with no matching cap is never enforced", () => {
  const d = capDecision({ want: true, counts: { run: 9999 }, caps: {} });
  assert.deepEqual(d, { want: true, allow: true, capped: null });
});

test("at the ceiling, the next action is deferred (>=, not >)", () => {
  assert.equal(twoWindow({ counts: { run: 24 } }).allow, true);   // 25th allowed
  assert.deepEqual(twoWindow({ counts: { run: 25 } }), { want: true, allow: false, capped: "run" });
});

test("the daily window caps independently of the run window", () => {
  assert.equal(twoWindow({ counts: { day: 49 } }).allow, true);   // 50th allowed
  assert.deepEqual(twoWindow({ counts: { day: 50 } }), { want: true, allow: false, capped: "day" });
});

test("precedence follows caps key order: the first ceiling hit wins", () => {
  const d = twoWindow({ counts: { run: 25, day: 50 } });
  assert.equal(d.capped, "run"); // run listed before day
  // reverse the declared order and the reported reason flips
  const rev = capDecision({ want: true, counts: { run: 25, day: 50 }, caps: { day: 50, run: 25 } });
  assert.equal(rev.capped, "day");
});

test("a missing counter is treated as 0 (nothing spent yet)", () => {
  const d = capDecision({ want: true, counts: {}, caps: { run: 1 } });
  assert.equal(d.allow, true);
});

test("a cap of 0 means 'never allow'", () => {
  assert.deepEqual(capDecision({ want: true, counts: {}, caps: { run: 0 } }),
    { want: true, allow: false, capped: "run" });
});

test("generalizes past email: an LLM-call budget window", () => {
  const guard = (callsToday) =>
    capDecision({ want: true, counts: { day: callsToday }, caps: { day: 300 } });
  assert.equal(guard(299).allow, true);
  assert.equal(guard(300).allow, false);
  assert.equal(guard(300).capped, "day");
});
