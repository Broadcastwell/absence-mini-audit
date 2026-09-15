CREATE TABLE IF NOT EXISTS free_check_reservations (
 id TEXT PRIMARY KEY,
 day TEXT NOT NULL,
 address_key TEXT NOT NULL,
 ip_key TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS free_reservations_day ON free_check_reservations(day);
CREATE INDEX IF NOT EXISTS free_reservations_address ON free_check_reservations(day,address_key);
CREATE INDEX IF NOT EXISTS free_reservations_ip ON free_check_reservations(day,ip_key);
