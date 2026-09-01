START TRANSACTION;

UPDATE results
SET final_score = 88.5, version = version + 1, published_at = NOW()
WHERE result_id = 1 AND version = 0;

COMMIT;
