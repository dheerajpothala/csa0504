# CSA0504 — Exam Certification & Slot-Booking Demo Console

A mini local website that demonstrates the report's design live:
hash lookup, indexed audit queries, `FOR UPDATE` transaction locking,
and optimistic-concurrency result publishing — with a trace panel
showing the exact statements/locks as they run.

No MySQL, no `npm install`, no setup. It runs entirely on Node's
built-in `http` module with an in-memory store that mirrors the
schema in `sql/`.

## Run it

Requires only Node.js (any recent version, e.g. 18+).

```bash
node server.js
```

Then open **http://localhost:4000** in your browser.

## What to show in the demo

1. **Candidate Lookup** — look up candidate `1002345`; the trace panel
   shows the hash-table probe against `candidate_latest_attempt`.
2. **Center Audit** — query center `45` on `2026-08-20`; trace shows
   the B-tree index scan via `idx_center_date`.
3. **Slot Booking** — book candidate `1002348` into slot `1`
   (capacity 2, already 1 booked) and watch the `FOR UPDATE` /
   `SAVEPOINT` / `COMMIT` sequence in the trace.
4. **Result Publishing** — publish result `1` at a new score and
   watch the version column increment.
5. **Concurrency Lab** — the important one for the rubric:
   - "Run concurrent booking" fires two candidates at the same slot
     at once. The trace shows Session B waiting on Session A's row
     lock, then getting rejected once the slot is full — proving
     capacity is never exceeded.
   - "Run concurrent update" fires two examiners at the same result
     with the same starting version. The second one is rejected with
     a version-mismatch message instead of silently overwriting the
     first — proving no lost updates.

Use **Reset demo data** to restore the starting slot/result state
between demo runs.

## Files

```
server.js       Pure-Node HTTP server + API routes
db.js           In-memory engine mirroring the MySQL schema/transactions
public/
  index.html    Dashboard layout
  style.css     Styling
  app.js        Frontend logic, calls the API and renders the trace
```

## Connecting it to real MySQL (optional)

The in-memory engine in `db.js` implements the exact same statements
as `sql/04_booking_transaction.sql` and `sql/05_result_update.sql`.
To run against a real MySQL instance instead for the demo, install
`mysql2` (`npm install mysql2`) and replace the functions in `db.js`
with calls to a `mysql2/promise` pool running those same queries —
the API routes in `server.js` and the frontend do not need to change.
