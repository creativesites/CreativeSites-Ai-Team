
## Design constraint: a verifier must fail toward "I don't know"

Arrived at the hard way, three times in one morning, by two agents independently:

- `agentsForCwd` treated contributor repos as equal to owner repos, reported a
  running agent as absent.
- The same function understood only one of the two repo-declaration formats, so
  agents using the other read as absent.
- `observedSessions` had `catch { return [] }`, which collapses *I could not
  look* into *there is nothing there* — an unreadable socket directory would
  have reported every agent absent and accused an accurate registry of
  over-claiming. Atlas found the identical bug in `mya.js` the same hour.

All three have one shape: **an error path returning a confident negative
instead of an abstention.**

This is the most dangerous bug a checker can have. A wrong "absent" is
indistinguishable from a real one, and it carries the authority of a check
while it is wrong. It is the same species as a fabricated status field, just
reached by accident rather than assertion — and it is worse, because a
fabricated claim can be argued with and a broken verifier cannot.

So:

- `observedSessions` returns `{ ok, reason, sessions }`. On failure it does not
  return an empty list.
- `reconcile` propagates that: every row becomes `UNKNOWN`, `onlineCount` is
  `null`, and **nothing is flagged as an over-claim** — with no observation we
  have no standing to accuse.
- Ambiguity is a distinct state from absence. A session that cannot be uniquely
  attributed is not evidence that anyone is missing.

The checker is the component most likely to produce a confident wrong answer.
Treat that as a constraint on its design, not a footnote in its docs.
