// db.js — in-memory engine that mirrors the MySQL schema/transactions
// from sql/01-06. No external dependencies: this lets the demo run
// instantly without a MySQL install, while reproducing the exact
// locking / versioning behaviour described in the report.

const state = {
  exam_attempts: [
    { attempt_id: 1, candidate_id: 1002345, center_id: 45, exam_date: "2026-08-20", slot_id: 1, score: 78.5 },
    { attempt_id: 2, candidate_id: 1002346, center_id: 45, exam_date: "2026-08-20", slot_id: 1, score: 62.0 },
    { attempt_id: 3, candidate_id: 1002347, center_id: 46, exam_date: "2026-08-20", slot_id: 2, score: 91.25 },
  ],
  candidate_latest_attempt: { 1002345: 1, 1002346: 2, 1002347: 3 }, // HASH index simulation
  exam_slots: [
    { slot_id: 1, center_id: 45, exam_date: "2026-08-20", start_time: "09:00:00", capacity: 2, seats_booked: 1 },
    { slot_id: 2, center_id: 46, exam_date: "2026-08-20", start_time: "09:00:00", capacity: 30, seats_booked: 1 },
  ],
  bookings: [],
  results: [
    { result_id: 1, attempt_id: 1, examiner_id: 1, final_score: 78.5, version: 0, published_at: null },
  ],
  nextBookingId: 1,
};

// Simulated row-level lock (mirrors InnoDB's FOR UPDATE row lock).
const slotLocks = new Map();
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function acquireLock(slotId, holderId, trace) {
  while (slotLocks.has(slotId)) {
    trace.push(`[LOCK WAIT] ${holderId} waiting for row lock on exam_slots (slot_id=${slotId}) held by ${slotLocks.get(slotId)}`);
    await sleep(120);
  }
  slotLocks.set(slotId, holderId);
  trace.push(`[LOCK] ${holderId} acquired FOR UPDATE row lock on exam_slots (slot_id=${slotId})`);
}
function releaseLock(slotId, holderId, trace) {
  slotLocks.delete(slotId);
  trace.push(`[UNLOCK] ${holderId} released row lock on exam_slots (slot_id=${slotId})`);
}

// ---- E.3.1/E.3.3 — candidate lookup (hash) & center audit (index) ----
function candidateLookup(candidateId, trace) {
  trace.push(`SELECT attempt_id FROM candidate_latest_attempt WHERE candidate_id = ${candidateId};`);
  trace.push(`  -> MEMORY engine HASH probe, O(1) expected`);
  const attemptId = state.candidate_latest_attempt[candidateId];
  if (!attemptId) { trace.push("  -> no match"); return null; }
  const attempt = state.exam_attempts.find((a) => a.attempt_id === attemptId);
  trace.push(`  -> matched attempt_id=${attemptId} in candidate_latest_attempt bucket`);
  return attempt || null;
}

function centerAudit(centerId, examDate, trace) {
  trace.push(`SELECT * FROM exam_attempts WHERE center_id = ${centerId} AND exam_date = '${examDate}';`);
  trace.push(`  -> B-tree range scan via idx_center_date (center_id, exam_date)`);
  const rows = state.exam_attempts.filter((a) => a.center_id === centerId && a.exam_date === examDate);
  trace.push(`  -> ${rows.length} row(s) matched`);
  return rows;
}

function listSlots() {
  return state.exam_slots.map((s) => ({ ...s }));
}
function listResults() {
  return state.results.map((r) => ({ ...r }));
}

// ---- E.3.6 — booking transaction with FOR UPDATE + SAVEPOINT ----
async function bookSlot(candidateId, slotId, holderId, trace) {
  trace.push(`START TRANSACTION;  -- session ${holderId}`);
  trace.push(`SAVEPOINT before_insert;`);
  await acquireLock(slotId, holderId, trace);
  try {
    trace.push(`SELECT capacity, seats_booked FROM exam_slots WHERE slot_id = ${slotId} FOR UPDATE;`);
    const slot = state.exam_slots.find((s) => s.slot_id === slotId);
    if (!slot) { trace.push(`ROLLBACK;  -- slot ${slotId} not found`); return { ok: false, reason: "Slot not found" }; }

    await sleep(150); // widen the race window so concurrent demos are visible

    if (slot.seats_booked >= slot.capacity) {
      trace.push(`UPDATE exam_slots SET seats_booked = seats_booked + 1 WHERE slot_id = ${slotId} AND seats_booked < capacity;`);
      trace.push(`  -> 0 rows affected (slot full)`);
      trace.push(`ROLLBACK TO before_insert;  -- session ${holderId}`);
      return { ok: false, reason: "Slot is at capacity — booking rejected" };
    }

    const already = state.bookings.find((b) => b.candidate_id === candidateId && b.slot_id === slotId && b.status === "CONFIRMED");
    if (already) {
      trace.push(`INSERT INTO bookings (...) -- violates UNIQUE KEY uq_candidate_slot`);
      trace.push(`ROLLBACK TO before_insert;  -- session ${holderId}`);
      return { ok: false, reason: "Candidate already booked into this slot" };
    }

    slot.seats_booked += 1;
    trace.push(`UPDATE exam_slots SET seats_booked = seats_booked + 1 WHERE slot_id = ${slotId} AND seats_booked < capacity;`);
    trace.push(`  -> 1 row affected`);
    const booking = { booking_id: state.nextBookingId++, candidate_id: candidateId, slot_id: slotId, status: "CONFIRMED" };
    state.bookings.push(booking);
    trace.push(`INSERT INTO bookings (candidate_id, slot_id) VALUES (${candidateId}, ${slotId});`);
    trace.push(`COMMIT;  -- session ${holderId}`);
    return { ok: true, booking };
  } finally {
    releaseLock(slotId, holderId, trace);
  }
}

// ---- E.3.7 — optimistic-concurrency result update ----
function updateResult(resultId, expectedVersion, newScore, examinerId, trace) {
  trace.push(`START TRANSACTION;  -- examiner ${examinerId}`);
  const r = state.results.find((x) => x.result_id === resultId);
  if (!r) { trace.push("ROLLBACK; -- result not found"); return { ok: false, reason: "Result not found" }; }
  trace.push(`UPDATE results SET final_score = ${newScore}, version = version + 1 WHERE result_id = ${resultId} AND version = ${expectedVersion};`);
  if (r.version !== expectedVersion) {
    trace.push(`  -> 0 rows affected (version mismatch: current version is ${r.version}, expected ${expectedVersion})`);
    trace.push(`ROLLBACK;  -- examiner ${examinerId} must re-read and retry`);
    return { ok: false, reason: `Conflict: result was already updated (now at version ${r.version})`, currentVersion: r.version, currentScore: r.final_score };
  }
  r.final_score = newScore;
  r.version += 1;
  r.published_at = new Date().toISOString();
  trace.push(`  -> 1 row affected`);
  trace.push(`COMMIT;  -- examiner ${examinerId}`);
  return { ok: true, result: { ...r } };
}

function resetDemoData() {
  state.exam_slots.forEach((s, i) => { s.seats_booked = i === 0 ? 1 : 1; });
  state.bookings.length = 0;
  state.nextBookingId = 1;
  state.results[0].final_score = 78.5;
  state.results[0].version = 0;
  state.results[0].published_at = null;
}

module.exports = { candidateLookup, centerAudit, listSlots, listResults, bookSlot, updateResult, resetDemoData };
