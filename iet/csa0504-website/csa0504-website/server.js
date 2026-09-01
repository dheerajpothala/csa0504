// server.js — zero-dependency Node HTTP server for the CSA0504 demo.
// Run:  node server.js   then open http://localhost:4000
const http = require("http");
const fs = require("fs");
const path = require("path");
const db = require("./db");

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json" };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
  });
}

function serveStatic(req, res) {
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // ---- API routes ----
    if (url.pathname === "/api/candidate" && req.method === "GET") {
      const trace = [];
      const candidateId = Number(url.searchParams.get("candidate_id"));
      const result = db.candidateLookup(candidateId, trace);
      return send(res, 200, { result, trace });
    }

    if (url.pathname === "/api/center-audit" && req.method === "GET") {
      const trace = [];
      const centerId = Number(url.searchParams.get("center_id"));
      const examDate = url.searchParams.get("exam_date");
      const rows = db.centerAudit(centerId, examDate, trace);
      return send(res, 200, { rows, trace });
    }

    if (url.pathname === "/api/slots" && req.method === "GET") {
      return send(res, 200, { slots: db.listSlots() });
    }

    if (url.pathname === "/api/results" && req.method === "GET") {
      return send(res, 200, { results: db.listResults() });
    }

    if (url.pathname === "/api/book" && req.method === "POST") {
      const body = await readBody(req);
      const trace = [];
      const out = await db.bookSlot(Number(body.candidate_id), Number(body.slot_id), body.session || "session-A", trace);
      return send(res, 200, { ...out, trace, slots: db.listSlots() });
    }

    // Fires two bookings for the same slot ~concurrently to demonstrate locking
    if (url.pathname === "/api/simulate-concurrent-booking" && req.method === "POST") {
      const body = await readBody(req);
      const slotId = Number(body.slot_id);
      const traceA = [], traceB = [];
      const [resA, resB] = await Promise.all([
        db.bookSlot(Number(body.candidate_a), slotId, "Session A", traceA),
        db.bookSlot(Number(body.candidate_b), slotId, "Session B", traceB),
      ]);
      const merged = [];
      let i = 0, j = 0;
      while (i < traceA.length || j < traceB.length) {
        if (i < traceA.length) merged.push(`A> ${traceA[i++]}`);
        if (j < traceB.length) merged.push(`B> ${traceB[j++]}`);
      }
      return send(res, 200, { resultA: resA, resultB: resB, trace: merged, slots: db.listSlots() });
    }

    if (url.pathname === "/api/result/update" && req.method === "POST") {
      const body = await readBody(req);
      const trace = [];
      const out = db.updateResult(Number(body.result_id), Number(body.expected_version), Number(body.final_score), body.examiner_id || "Examiner-1", trace);
      return send(res, 200, { ...out, trace, results: db.listResults() });
    }

    // Simulates two examiners both reading version 0 then both trying to write
    if (url.pathname === "/api/simulate-concurrent-result" && req.method === "POST") {
      const body = await readBody(req);
      const resultId = Number(body.result_id);
      const current = db.listResults().find((r) => r.result_id === resultId);
      const staleVersion = current.version;
      const traceA = [], traceB = [];
      const resA = db.updateResult(resultId, staleVersion, 91.0, "Examiner A", traceA);
      const resB = db.updateResult(resultId, staleVersion, 65.0, "Examiner B", traceB);
      return send(res, 200, { resultA: resA, resultB: resB, trace: [...traceA.map(t=>"A> "+t), ...traceB.map(t=>"B> "+t)], results: db.listResults() });
    }

    if (url.pathname === "/api/reset" && req.method === "POST") {
      db.resetDemoData();
      return send(res, 200, { ok: true });
    }

    // ---- static files ----
    return serveStatic(req, res);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`CSA0504 demo running at http://localhost:${PORT}`);
});
