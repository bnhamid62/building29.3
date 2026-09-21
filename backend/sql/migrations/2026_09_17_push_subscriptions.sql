-- Building 29 — Web Push subscriptions (pure PHP sender, no Node.js).
--
-- SAFE AND IDEMPOTENT: this migration only ADDS one table. It never modifies
-- or deletes existing rows, and running it twice changes nothing.
--
-- Apply on an existing AppServ/MySQL install (do NOT re-import schema.sql):
--   mysql -u root -p building29 < backend/sql/migrations/2026_09_17_push_subscriptions.sql

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  endpoint    VARCHAR(512) NOT NULL,
  p256dh      VARCHAR(255) NOT NULL,
  auth_key    VARCHAR(255) NOT NULL,
  user_agent  VARCHAR(190) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_push_endpoint (endpoint(191)),
  KEY idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
