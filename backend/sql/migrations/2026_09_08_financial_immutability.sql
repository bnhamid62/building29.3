-- Building 29 — security hardening migration (financial immutability + auth hardening)
--
-- IDEMPOTENT: running it twice (or ten times) is harmless. Columns are added only
-- when absent, the table uses CREATE TABLE IF NOT EXISTS, and each trigger is
-- dropped-if-exists then recreated. It ADDS protections only: it never drops or
-- recreates a table, and it never modifies, inserts or deletes a single data row —
-- your payments, receipts, contributions and audit history are untouched.
--
--   mysql -u root -p building29 < backend/sql/migrations/2026_09_08_financial_immutability.sql
--   php backend/tools/verify_security.php

-- ---------------------------------------------------------------------------
-- 1. Financial locking state on projects
-- ---------------------------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'financial_locked_at');
SET @s := IF(@c = 0, 'ALTER TABLE projects ADD COLUMN financial_locked_at DATETIME NULL AFTER contribution_per_apartment', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'financial_locked_by');
SET @s := IF(@c = 0, 'ALTER TABLE projects ADD COLUMN financial_locked_by INT UNSIGNED NULL AFTER financial_locked_at', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- 2. Token/session version so sensitive account changes revoke access tokens
-- ---------------------------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_version');
SET @s := IF(@c = 0, 'ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- 3. Shared rate-limit store (replaces the per-process temp-file limiter)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket CHAR(64) NOT NULL PRIMARY KEY,
  window_start DATETIME NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 4. Append-only ledger enforced by the database itself
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_payments_no_update;
DROP TRIGGER IF EXISTS trg_payments_no_delete;
DROP TRIGGER IF EXISTS trg_receipts_no_update;
DROP TRIGGER IF EXISTS trg_receipts_no_delete;
DROP TRIGGER IF EXISTS trg_audit_no_update;
DROP TRIGGER IF EXISTS trg_audit_no_delete;
DROP TRIGGER IF EXISTS trg_contrib_locked_update;
DROP TRIGGER IF EXISTS trg_contrib_locked_delete;
DROP TRIGGER IF EXISTS trg_projects_locked_update;

DELIMITER $$

-- Payments are append-only. Corrections are new (negative) rows.
CREATE TRIGGER trg_payments_no_update BEFORE UPDATE ON payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'payments are immutable: use a reversal record';
END$$

CREATE TRIGGER trg_payments_no_delete BEFORE DELETE ON payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'payments cannot be deleted: use a reversal record';
END$$

-- Receipt numbers are permanent evidence.
CREATE TRIGGER trg_receipts_no_update BEFORE UPDATE ON receipts FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receipts are immutable';
END$$

CREATE TRIGGER trg_receipts_no_delete BEFORE DELETE ON receipts FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receipts cannot be deleted';
END$$

-- Audit trail is append-only for everyone, including the manager account.
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit log is append-only';
END$$

CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit log entries cannot be deleted';
END$$

-- Contributions freeze once the project's financial data is locked.
CREATE TRIGGER trg_contrib_locked_update BEFORE UPDATE ON project_contributions FOR EACH ROW
BEGIN
  DECLARE locked DATETIME;
  SELECT financial_locked_at INTO locked FROM projects WHERE id = OLD.project_id;
  IF locked IS NOT NULL AND (NEW.required_amount <> OLD.required_amount OR NEW.exempt <> OLD.exempt) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'contribution is financially locked';
  END IF;
END$$

CREATE TRIGGER trg_contrib_locked_delete BEFORE DELETE ON project_contributions FOR EACH ROW
BEGIN
  DECLARE locked DATETIME;
  SELECT financial_locked_at INTO locked FROM projects WHERE id = OLD.project_id;
  IF locked IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'contribution is financially locked';
  END IF;
END$$

-- A locked project keeps its required amount, and can never be unlocked.
CREATE TRIGGER trg_projects_locked_update BEFORE UPDATE ON projects FOR EACH ROW
BEGIN
  IF OLD.financial_locked_at IS NOT NULL THEN
    IF NEW.financial_locked_at IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'financial lock cannot be removed';
    END IF;
    IF NEW.contribution_per_apartment <> OLD.contribution_per_apartment THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'required amount is financially locked';
    END IF;
  END IF;
END$$

DELIMITER ;
