-- Building 29 — monthly subscriptions module.
-- A financial fund fully separate from project contributions, meant for
-- recurring dues (routine maintenance, future equipment). Idempotent.

CREATE TABLE IF NOT EXISTS subscription_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  monthly_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  start_period DATE NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO subscription_settings (id, monthly_amount, start_period)
VALUES (1, 0, DATE_FORMAT(CURDATE(), '%Y-%m-01'));

CREATE TABLE IF NOT EXISTS subscription_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  apartment_id INT UNSIGNED NOT NULL,
  period DATE NOT NULL,                       -- first day of the covered month
  amount DECIMAL(12,2) NOT NULL,               -- negative amount = reversal
  method ENUM('cash','transfer','online') NOT NULL DEFAULT 'cash',
  paid_at DATETIME NOT NULL,
  recorded_by INT UNSIGNED NOT NULL,
  notes VARCHAR(255) NULL,
  idempotency_key CHAR(80) NOT NULL UNIQUE,
  reverses_payment_id INT UNSIGNED NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_subpay_apartment FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE,
  CONSTRAINT fk_subpay_recorder FOREIGN KEY (recorded_by) REFERENCES users(id),
  CONSTRAINT fk_subpay_reverses FOREIGN KEY (reverses_payment_id) REFERENCES subscription_payments(id),
  INDEX idx_subpay_apartment (apartment_id),
  INDEX idx_subpay_period (period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Same append-only protection as the main payments ledger.
DROP TRIGGER IF EXISTS trg_subpay_no_update;
DROP TRIGGER IF EXISTS trg_subpay_no_delete;
DELIMITER $$
CREATE TRIGGER trg_subpay_no_update BEFORE UPDATE ON subscription_payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'subscription payments are immutable: use a reversal record';
END$$
CREATE TRIGGER trg_subpay_no_delete BEFORE DELETE ON subscription_payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'subscription payments cannot be deleted: use a reversal record';
END$$
DELIMITER ;
