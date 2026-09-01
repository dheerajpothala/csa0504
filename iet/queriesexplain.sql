EXPLAIN SELECT * FROM exam_attempts WHERE candidate_id = 1002345;

EXPLAIN SELECT * FROM exam_attempts
WHERE center_id = 45 AND exam_date = '2026-08-20';

EXPLAIN SELECT r.result_id
FROM results r
JOIN exam_attempts a ON a.attempt_id = r.attempt_id
WHERE a.center_id = 45;

SELECT s.center_id, COUNT(*) AS candidates_processed, ROUND(AVG(r.final_score), 2) AS avg_score
FROM results r
JOIN exam_attempts a ON a.attempt_id = r.attempt_id
JOIN exam_slots s ON s.slot_id = a.slot_id
WHERE s.exam_date = '2026-08-20'
GROUP BY s.center_id;
