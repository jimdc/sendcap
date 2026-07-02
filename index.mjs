// sendcap — a pure spend-guard decision for any paid action (email sends, LLM calls, SMS,
// paid API calls…). No I/O, no dependencies, no runtime assumptions — just arithmetic over
// counters you already keep, so "a bug or a test can't run up a bill" becomes a tested property
// instead of a hopeful comment.
//
// The question it answers: "given how much I've already spent in each window, may I do ONE more
// paid action right now — and if not, which ceiling stopped me?" You bring the counters (from
// KV, Redis, a DB, memory — sendcap doesn't care) and the caps; it returns a decision.
//
//   capDecision({ want, counts, caps }) -> { want, allow, capped }
//
//   want    boolean  — do you even want to act? (collapse your preconditions into this:
//                       e.g. `hasWork && !dryRun && hasRecipient`). If false, allow is false
//                       and capped is null — a no-op is never "capped", so callers can still
//                       treat it as handled (e.g. mark-as-seen in a dry run).
//   counts  object   — how much you've spent per window, e.g. { run: 12, day: 87 }
//   caps    object   — the ceiling per window, e.g. { run: 25, day: 100 }
//   allow   boolean  — true = go ahead and spend; false = defer/skip
//   capped  string?  — null, or the name of the FIRST window whose ceiling was hit
//
// Windows are whatever you name them ("run", "day", "hour", "per-user", "month"…). Precedence
// is the key order of `caps`: the first ceiling that's hit wins, so put the tightest/most
// specific window first if you care which reason is reported. A window that appears in `counts`
// but not in `caps` has no ceiling and is never enforced.
//
// A capped action should typically be DEFERRED (retried when the window rolls over), not dropped
// — sendcap tells you it was capped so you can leave the work undone rather than lose it.

export function capDecision({ want, counts = {}, caps = {} } = {}) {
  const wantIt = !!want;
  if (!wantIt) return { want: false, allow: false, capped: null };
  for (const [name, cap] of Object.entries(caps)) {
    const spent = Number(counts[name] ?? 0);
    if (spent >= cap) return { want: true, allow: false, capped: name };
  }
  return { want: true, allow: true, capped: null };
}
