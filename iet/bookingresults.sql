CREATE TABLE exam_slots (
  slot_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  center_id SMALLINT UNSIGNED NOT NULL,
  exam_date DATE NOT NULL,
  start_time TIME NOT NULL,
  capacity SMALLINT UNSIGNED NOT NULL,
  seats_booked SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_center_date_time (center_id, exam_date, start_time)
) ENGINE = InnoDB;

CREATE TABLE bookings (
  booking_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  candidate_id INT UNSIGNED NOT NULL,
  slot_id INT UNSIGNED NOT NULL,
  booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('CONFIRMED','CANCELLED') DEFAULT 'CONFIRMED',
  UNIQUE KEY uq_candidate_slot (candidate_id, slot_id),
  FOREIGN KEY (slot_id) REFERENCES exam_slots(slot_id)
) ENGINE = InnoDB;

CREATE TABLE results (
  result_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attempt_id BIGINT UNSIGNED NOT NULL,
  examiner_id INT UNSIGNED NOT NULL,
  final_score DECIMAL(5,2) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  published_at TIMESTAMP NULL
) ENGINE = InnoDB;

CREATE INDEX idx_results_attempt ON results (attempt_id, final_score);
