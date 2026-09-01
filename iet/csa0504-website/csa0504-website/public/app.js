const consoleBody = document.getElementById("console-body");
let firstLog = true;

function logTrace(lines, prefixClass) {
  if (firstLog) { consoleBody.textContent = ""; firstLog = false; }
  const frag = document.createDocumentFragment();
  lines.forEach((line) => {
    const div = document.createElement("div");
    if (/^A>/.test(line)) div.className = "line-a";
    else if (/^B>/.test(line)) div.className = "line-b";
    else if (/^(START|SELECT|UPDATE|INSERT|COMMIT|ROLLBACK|SAVEPOINT)/.test(line.replace(/^[AB]>\s*/, ""))) div.className = "line-sql";
    else if (/LOCK/.test(line)) div.className = "line-lock";
    div.textContent = line;
    frag.appendChild(div);
  });
  consoleBody.appendChild(frag);
  consoleBody.appendChild(document.createElement("div")).textContent = "";
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

document.getElementById("btn-clear-console").addEventListener("click", () => {
  consoleBody.textContent = "// cleared";
  firstLog = false;
});

// ---------- module nav ----------
const titles = {
  lookup: ["Candidate Lookup", "Point lookup via the MEMORY-engine hash index (candidate_latest_attempt)."],
  audit: ["Center Audit", "Range scan via the composite B-tree index idx_center_date (center_id, exam_date)."],
  booking: ["Slot Booking", "Bounded transaction with SELECT … FOR UPDATE and a SAVEPOINT before the insert."],
  results: ["Result Publishing", "Optimistic concurrency: the UPDATE only succeeds if the version column still matches."],
  concurrency: ["Concurrency Lab", "Fire two sessions at the same slot or result to see the locking/versioning kick in."],
};
document.querySelectorAll(".rail-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".rail-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const mod = btn.dataset.module;
    document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
    document.getElementById(`panel-${mod}`).classList.remove("hidden");
    document.getElementById("module-title").textContent = titles[mod][0];
    document.getElementById("module-sub").textContent = titles[mod][1];
    if (mod === "booking") refreshSlots();
    if (mod === "results") refreshResults();
  });
});

// ---------- helpers ----------
async function postJSON(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
async function getJSON(url) {
  const r = await fetch(url);
  return r.json();
}
function setResultCard(el, ok, html) {
  el.className = "result-card " + (ok ? "ok" : "fail");
  el.innerHTML = `<span class="tag ${ok ? "tag-ok" : "tag-fail"}">${ok ? "PASS" : "REJECTED"}</span>${html}`;
}

function renderSlotsTable(slots) {
  const el = document.getElementById("slots-table");
  el.innerHTML = `<table><thead><tr><th>Slot</th><th>Center</th><th>Date</th><th>Capacity</th><th>Booked</th></tr></thead><tbody>
    ${slots.map(s => `<tr><td class="mono">${s.slot_id}</td><td class="mono">${s.center_id}</td><td class="mono">${s.exam_date}</td><td class="mono">${s.capacity}</td><td class="mono">${s.seats_booked}</td></tr>`).join("")}
  </tbody></table>`;
}
function renderResultsTable(results) {
  const el = document.getElementById("results-table");
  el.innerHTML = `<table><thead><tr><th>Result</th><th>Attempt</th><th>Score</th><th>Version</th><th>Published</th></tr></thead><tbody>
    ${results.map(r => `<tr><td class="mono">${r.result_id}</td><td class="mono">${r.attempt_id}</td><td class="mono">${r.final_score}</td><td class="mono">${r.version}</td><td class="mono">${r.published_at ? "yes" : "—"}</td></tr>`).join("")}
  </tbody></table>`;
}
async function refreshSlots() { const { slots } = await getJSON("/api/slots"); renderSlotsTable(slots); }
async function refreshResults() { const { results } = await getJSON("/api/results"); renderResultsTable(results); }

// ---------- Candidate lookup ----------
document.getElementById("btn-lookup").addEventListener("click", async () => {
  const id = document.getElementById("lookup-candidate").value;
  const { result, trace } = await getJSON(`/api/candidate?candidate_id=${id}`);
  logTrace(trace);
  const el = document.getElementById("lookup-result");
  if (result) {
    setResultCard(el, true, `Candidate ${id} → attempt <b>${result.attempt_id}</b>, center ${result.center_id}, score <b>${result.score}</b>`);
  } else {
    setResultCard(el, false, `No attempt found for candidate ${id}`);
  }
});

// ---------- Center audit ----------
document.getElementById("btn-audit").addEventListener("click", async () => {
  const center = document.getElementById("audit-center").value;
  const date = document.getElementById("audit-date").value;
  const { rows, trace } = await getJSON(`/api/center-audit?center_id=${center}&exam_date=${date}`);
  logTrace(trace);
  const el = document.getElementById("audit-result");
  if (rows.length) {
    setResultCard(el, true, `${rows.length} attempt(s) at center ${center} on ${date}: ` +
      rows.map(r => `#${r.attempt_id} (candidate ${r.candidate_id}, score ${r.score})`).join(", "));
  } else {
    setResultCard(el, false, `No attempts found at center ${center} on ${date}`);
  }
});

// ---------- Booking ----------
document.getElementById("btn-book").addEventListener("click", async () => {
  const candidate_id = document.getElementById("book-candidate").value;
  const slot_id = document.getElementById("book-slot").value;
  const out = await postJSON("/api/book", { candidate_id, slot_id, session: "Session A" });
  logTrace(out.trace);
  const el = document.getElementById("book-result");
  setResultCard(el, out.ok, out.ok
    ? `Booking <b>${out.booking.booking_id}</b> confirmed for candidate ${candidate_id} in slot ${slot_id}`
    : out.reason);
  renderSlotsTable(out.slots);
});
document.getElementById("btn-reset-1").addEventListener("click", async () => { await postJSON("/api/reset", {}); refreshSlots(); refreshResults(); });
document.getElementById("btn-reset-2").addEventListener("click", async () => { await postJSON("/api/reset", {}); refreshSlots(); refreshResults(); });

// ---------- Result publishing ----------
document.getElementById("btn-update-result").addEventListener("click", async () => {
  const result_id = document.getElementById("res-id").value;
  const expected_version = document.getElementById("res-version").value;
  const final_score = document.getElementById("res-score").value;
  const out = await postJSON("/api/result/update", { result_id, expected_version, final_score, examiner_id: "Examiner-1" });
  logTrace(out.trace);
  const el = document.getElementById("result-update-result");
  setResultCard(el, out.ok, out.ok
    ? `Result ${result_id} published at score <b>${final_score}</b>, now at version ${out.result.version}`
    : `${out.reason}`);
  renderResultsTable(out.results);
});

// ---------- Concurrency lab ----------
document.getElementById("btn-conc-book").addEventListener("click", async () => {
  const slot_id = document.getElementById("conc-slot").value;
  const candidate_a = document.getElementById("conc-cand-a").value;
  const candidate_b = document.getElementById("conc-cand-b").value;
  const out = await postJSON("/api/simulate-concurrent-booking", { slot_id, candidate_a, candidate_b });
  logTrace(out.trace);
  const el = document.getElementById("conc-book-result");
  const summary = `Session A: ${out.resultA.ok ? "CONFIRMED" : "REJECTED — " + out.resultA.reason} · Session B: ${out.resultB.ok ? "CONFIRMED" : "REJECTED — " + out.resultB.reason}`;
  setResultCard(el, out.resultA.ok !== out.resultB.ok || (out.resultA.ok && out.resultB.ok), summary);
  refreshSlots();
});

document.getElementById("btn-conc-result").addEventListener("click", async () => {
  const result_id = document.getElementById("conc-result-id").value;
  const out = await postJSON("/api/simulate-concurrent-result", { result_id });
  logTrace(out.trace);
  const el = document.getElementById("conc-result-result");
  const summary = `Examiner A: ${out.resultA.ok ? "COMMITTED" : "REJECTED — " + out.resultA.reason} · Examiner B: ${out.resultB.ok ? "COMMITTED" : "REJECTED — " + out.resultB.reason}`;
  setResultCard(el, true, summary);
  refreshResults();
});

// initial data
refreshSlots();
