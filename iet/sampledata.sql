INSERT INTO exam_slots (center_id, exam_date, start_time, capacity)
VALUES (45, '2026-08-20', '09:00:00', 2);

INSERT INTO exam_attempts (candidate_id, center_id, exam_date, slot_id, responses_json, time_taken_sec, score)
VALUES (1002345, 45, '2026-08-20', 1, '{}', 1800, 78.50);

INSERT INTO results (attempt_id, examiner_id, final_score, version)
VALUES (1, 1, 78.50, 0);
