START TRANSACTION;

SAVEPOINT before_insert;

SELECT capacity, seats_booked
FROM exam_slots
WHERE slot_id = 1
FOR UPDATE;

UPDATE exam_slots
SET seats_booked = seats_booked + 1
WHERE slot_id = 1 AND seats_booked < capacity;

INSERT INTO bookings (candidate_id, slot_id) VALUES (1002345, 1);

COMMIT;
