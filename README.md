# sendcap

**A denial-of-wallet spend guard in one pure function.** Given how much you've already spent in each window, it decides whether you may make **one more paid action** — and if not, which ceiling stopped you. Zero dependencies, no I/O, no runtime assumptions. Works for email sends, LLM calls, SMS, paid API hits — anything that costs money per action.

```
npm install sendcap
```

The whole library:

```js
import { capDecision } from "sendcap";

const { allow, capped } = capDecision({
  want:   hasWork && !dryRun,        // do you even want to act right now?
  counts: { run: sentThisRun, day: sentToday },   // what you've already spent
  caps:   { run: 25, day: 100 },                  // your ceilings
});

if (allow) {
  await sendTheEmail();              // ...then increment your counters
} else if (capped) {
  // deferred by the `capped` window ("run" or "day") — retry next window, don't drop it
}
```

## Why this exists

Every small service that spends money per request eventually adds a ceiling so a bug, a runaway loop, a test, or an abusive caller can't run up the bill — the "denial-of-wallet" failure mode. That ceiling is *logic worth testing* ("prove the 26th send in a run is refused"), but it's usually smeared inline across a handler where it can't be. `sendcap` is that decision pulled out into a pure function you can unit-test to death, then trust.

It deliberately owns **only the arithmetic**. You keep the counters wherever you already keep state (Cloudflare KV, Redis, D1, a variable) and increment them after a real spend; `sendcap` never touches storage, a clock, or the network. That's what makes it runtime-agnostic and instant to test.

## API

### `capDecision({ want, counts, caps }) → { want, allow, capped }`

| field | in/out | meaning |
|---|---|---|
| `want` | in | Collapse your preconditions into one boolean (`hasWork && !dryRun && hasRecipient`). If `false`, the result is a **no-op**: `allow:false, capped:null`. A no-op is never "capped", so a dry run can still be treated as handled (e.g. mark-as-seen). |
| `counts` | in | `{ windowName: amountSpent }`. A window you don't list counts as `0`. |
| `caps` | in | `{ windowName: ceiling }`. A window in `counts` with **no** matching cap is never enforced. |
| `allow` | out | `true` → spend now; `false` → defer/skip. |
| `capped` | out | `null`, or the name of the **first** window whose ceiling was hit. |

**Windows are whatever you name them** — `run`, `day`, `hour`, `month`, `per-user`. The check is `spent >= cap` (so a cap of `N` allows exactly `N` actions, and a cap of `0` means "never"). **Precedence = key order of `caps`**: the first ceiling that's hit is the one reported, so list the tightest/most specific window first if you care which reason comes back.

## It's not just for email

The name comes from its first job (capping alert-digest email sends under a provider's free-tier limit), but the primitive is any-paid-action:

```js
// Cap Claude/OpenAI calls at 300/day so a loop can't drain your credits:
capDecision({ want: true, counts: { day: callsToday }, caps: { day: 300 } });

// Two-tier: 5 premium API calls per user per hour AND 1000 across the whole app per day:
capDecision({
  want: true,
  counts: { user: userCallsThisHour, global: appCallsToday },
  caps:   { user: 5, global: 1000 },   // "user" reported first if both are maxed
});
```

## Prior art — and why this exists

Looking before publishing (2026), there was no small, embeddable, storage-agnostic "may I make one more *paid* action?" guard:

- **`@upstash/ratelimit`, `hono-rate-limiter`, `express-rate-limit`** count *inbound requests* to protect an endpoint. They don't model *outbound spend* against per-window budgets, and they own storage + timing. Different problem.
- **Cloudflare AI Gateway spend limits, LiteLLM, Helicone** do real dollar budgets — but they're a *proxy/service* your calls route through, not importable code, and they're LLM-specific. If you want a Worker to cap its own Resend sends, there's nothing to route through.
- **`llm-spend-guard`** and similar are Node-only and LLM-only. `sendcap` is neither: it's runtime-agnostic and action-agnostic.

If you searched for *"denial of wallet guard"*, *"spend limit cloudflare workers"*, *"budget cap library"*, *"how many emails can I send before the cap"*, or *"per-day spend ceiling pure function"* — this is it. The whole thing is the function above; the value is that it's pure, tested, and yours to reason about.

**Honest scope:** it's ~15 lines. You could write it inline. The point of the package is that it's *already written, already tested, and already named* — so the ceiling in your service is a dependency with a spec, not a comment you hope is right. If you need dollar-denominated LLM budgets across a fleet, use a gateway; if you need to stop *your own* code from over-spending on any paid action, use this.

## Provenance

Extracted from the production backend of [CROL-List](https://crol-list.org), where it bounds the daily alert-digest mailer (`MAX_PER_RUN` + `MAX_SENDS_PER_DAY`, under Resend's free 100/day). A second consumer (a scheduled LLM cost check) validated the any-paid-action generality.

## License

MIT © James Carroll
