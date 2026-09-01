CREATE TABLE exam_attempts (
  attempt_id BIGINT UNSIGNED AUTO_INCREMENT,
  candidate_id INT UNSIGNED NOT NULL,
  center_id SMALLINT UNSIGNED NOT NULL,
  exam_date DATE NOT NULL,
  slot_id INT UNSIGNED NOT NULL,
  responses_json JSON NOT NULL,
  time_taken_sec INT UNSIGNED NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attempt_id, exam_date),
  INDEX idx_candidate (candidate_id),
  INDEX idx_center_date (center_id, exam_date)
) ENGINE = InnoDB;

CREATE TABLE candidate_latest_attempt (
  candidate_id INT UNSIGNED NOT NULL,
  attempt_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY USING HASH (candidate_id)
) ENGINE = MEMORY;

DELIMITER $$
CREATE TRIGGER trg_refresh_hash_lookup
AFTER INSERT ON exam_attempts
FOR EACH ROW
BEGIN
  INSERT INTO candidate_latest_attempt (candidate_id, attempt_id)
  VALUES (NEW.candidate_id, NEW.attempt_id)
  ON DUPLICATE KEY UPDATE attempt_id = NEW.attempt_id;
END $$
DELIMITER ;
