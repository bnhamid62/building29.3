-- Building 29 — MySQL schema (InnoDB / utf8mb4)
-- Import into MySQL (phpMyAdmin in AppServ) before seed_demo.sql
CREATE DATABASE IF NOT EXISTS building29 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE building29;

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS building_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  name_ar VARCHAR(190) NOT NULL,
  name_fr VARCHAR(190) NOT NULL,
  address_ar VARCHAR(255) NULL,
  address_fr VARCHAR(255) NULL,
  floors TINYINT UNSIGNED NOT NULL DEFAULT 10,
  apartments_count SMALLINT UNSIGNED NOT NULL DEFAULT 40,
  currency VARCHAR(8) NOT NULL DEFAULT 'DZD',
  default_locale ENUM('ar','fr') NOT NULL DEFAULT 'ar',
  module_facilities TINYINT(1) NOT NULL DEFAULT 1,
  module_cameras TINYINT(1) NOT NULL DEFAULT 1,
  privacy_show_phone TINYINT(1) NOT NULL DEFAULT 0,
  is_demo TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS apartments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(16) NOT NULL UNIQUE,
  floor TINYINT NOT NULL,
  block VARCHAR(16) NULL,
  surface_m2 DECIMAL(8,2) NULL,
  notes TEXT NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_apartments_floor (floor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  identifier VARCHAR(64) NOT NULL UNIQUE,        -- login handle
  phone VARCHAR(32) NOT NULL UNIQUE,
  full_name VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  apartment_id INT UNSIGNED NULL,
  occupancy ENUM('owner','resident_owner') NOT NULL DEFAULT 'owner',
  person_rank ENUM('primary','secondary') NOT NULL DEFAULT 'primary',
  photo_path VARCHAR(255) NULL,
  status ENUM('active','suspended','archived') NOT NULL DEFAULT 'active',
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  failed_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  token_version INT UNSIGNED NOT NULL DEFAULT 1,  -- bumped to revoke issued access tokens
  is_demo TINYINT(1) NOT NULL DEFAULT 0,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_apartment FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL,
  UNIQUE KEY uq_apartment_rank (apartment_id, person_rank),
  INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  role ENUM('manager','resident') NOT NULL,
  UNIQUE KEY uq_user_role (user_id, role),
  CONSTRAINT fk_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_agent VARCHAR(255) NULL,
  ip VARCHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_rt_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name_ar VARCHAR(190) NOT NULL,
  name_fr VARCHAR(190) NOT NULL,
  description_ar TEXT NULL,
  description_fr TEXT NULL,
  category ENUM('cleaning','elevator','lighting','electricity','cameras','basement','water_leak','repair','emergency','custom') NOT NULL DEFAULT 'custom',
  custom_category VARCHAR(120) NULL,
  status ENUM('proposed','awaiting_approval','fundraising','scheduled','in_progress','paused','completed','cancelled') NOT NULL DEFAULT 'proposed',
  priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  planned_start DATE NULL,
  planned_end DATE NULL,
  actual_start DATE NULL,
  actual_end DATE NULL,
  estimated_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  final_cost DECIMAL(12,2) NULL,
  contribution_per_apartment DECIMAL(12,2) NOT NULL DEFAULT 0,
  financial_locked_at DATETIME NULL,
  financial_locked_by INT UNSIGNED NULL,

  contractor_name VARCHAR(190) NULL,
  contractor_phone VARCHAR(32) NULL,
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_by INT UNSIGNED NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_projects_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_projects_status (status),
  INDEX idx_projects_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_stages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  title_ar VARCHAR(190) NOT NULL,
  title_fr VARCHAR(190) NOT NULL,
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  done TINYINT(1) NOT NULL DEFAULT 0,
  done_at DATETIME NULL,
  CONSTRAINT fk_stage_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_stage_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS files (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stored_name VARCHAR(190) NOT NULL UNIQUE,
  original_name VARCHAR(190) NOT NULL,
  mime VARCHAR(120) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  owner_id INT UNSIGNED NULL,
  visibility ENUM('manager','all_residents','apartment') NOT NULL DEFAULT 'all_residents',
  apartment_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_files_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_files_apartment FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_media (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  file_id INT UNSIGNED NOT NULL,
  phase ENUM('before','during','after','quotation','invoice') NOT NULL DEFAULT 'before',
  caption VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  INDEX idx_pm_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_contributions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  apartment_id INT UNSIGNED NOT NULL,
  required_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  exempt TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_contribution (project_id, apartment_id),
  CONSTRAINT fk_pc_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pc_apartment FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  apartment_id INT UNSIGNED NOT NULL,
  payer_user_id INT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL,
  method ENUM('cash','transfer','online') NOT NULL DEFAULT 'cash',
  paid_at DATETIME NOT NULL,
  recorded_by INT UNSIGNED NOT NULL,
  notes VARCHAR(255) NULL,
  proof_file_id INT UNSIGNED NULL,
  idempotency_key CHAR(64) NOT NULL UNIQUE,
  reverses_payment_id INT UNSIGNED NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_apartment FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_recorder FOREIGN KEY (recorded_by) REFERENCES users(id),
  CONSTRAINT fk_pay_proof FOREIGN KEY (proof_file_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_pay_reverses FOREIGN KEY (reverses_payment_id) REFERENCES payments(id),
  INDEX idx_pay_project (project_id),
  INDEX idx_pay_apartment (apartment_id),
  INDEX idx_pay_date (paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS receipts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id INT UNSIGNED NOT NULL UNIQUE,
  receipt_no VARCHAR(32) NOT NULL UNIQUE,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receipt_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS counters (
  name VARCHAR(64) PRIMARY KEY,
  value INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id INT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  entity VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Phase 2+ tables (created now so later modules need no restructuring)
CREATE TABLE IF NOT EXISTS complaints (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(190) NOT NULL,
  category ENUM('elevator','lighting','cleaning','water_leak','cameras','basement','electricity','security','other') NOT NULL DEFAULT 'other',
  description TEXT NULL,
  reporter_id INT UNSIGNED NULL,
  apartment_id INT UNSIGNED NULL,
  location VARCHAR(190) NULL,
  urgency ENUM('low','normal','high','critical') NOT NULL DEFAULT 'normal',
  status ENUM('submitted','under_review','approved','in_progress','resolved','rejected') NOT NULL DEFAULT 'submitted',
  manager_response TEXT NULL,
  assigned_to INT UNSIGNED NULL,
  resolved_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_complaint_user FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_complaint_apt FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS complaint_updates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT UNSIGNED NOT NULL,
  status ENUM('submitted','under_review','approved','in_progress','resolved','rejected') NOT NULL,
  note TEXT NULL,
  author_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cu_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title_ar VARCHAR(190) NOT NULL,
  title_fr VARCHAR(190) NOT NULL,
  body_ar TEXT NULL,
  body_fr TEXT NULL,
  kind ENUM('general','urgent','maintenance','elevator','cleaning','payment','meeting','project','security') NOT NULL DEFAULT 'general',
  priority ENUM('low','normal','high') NOT NULL DEFAULT 'normal',
  publish_at DATETIME NULL,
  author_id INT UNSIGNED NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcement_targets (
  announcement_id INT UNSIGNED NOT NULL,
  apartment_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (announcement_id, apartment_id),
  CONSTRAINT fk_at_ann FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
  CONSTRAINT fk_at_apt FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  kind ENUM('payment','project','complaint','announcement','meeting','vote','booking','document','system') NOT NULL DEFAULT 'system',
  title_ar VARCHAR(190) NOT NULL,
  title_fr VARCHAR(190) NOT NULL,
  body_ar VARCHAR(500) NULL,
  body_fr VARCHAR(500) NULL,
  link VARCHAR(190) NULL,
  priority ENUM('low','normal','high') NOT NULL DEFAULT 'normal',
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS votes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title_ar VARCHAR(190) NOT NULL,
  title_fr VARCHAR(190) NOT NULL,
  description_ar TEXT NULL,
  description_fr TEXT NULL,
  anonymous TINYINT(1) NOT NULL DEFAULT 1,
  live_results TINYINT(1) NOT NULL DEFAULT 0,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  status ENUM('draft','open','closed') NOT NULL DEFAULT 'draft',
  created_by INT UNSIGNED NULL,
  final_decision TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_votes_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vote_options (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vote_id INT UNSIGNED NOT NULL,
  label_ar VARCHAR(190) NOT NULL,
  label_fr VARCHAR(190) NOT NULL,
  CONSTRAINT fk_vo_vote FOREIGN KEY (vote_id) REFERENCES votes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vote_responses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vote_id INT UNSIGNED NOT NULL,
  apartment_id INT UNSIGNED NOT NULL,
  option_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vote_apartment (vote_id, apartment_id),
  CONSTRAINT fk_vr_vote FOREIGN KEY (vote_id) REFERENCES votes(id) ON DELETE CASCADE,
  CONSTRAINT fk_vr_option FOREIGN KEY (option_id) REFERENCES vote_options(id) ON DELETE CASCADE,
  CONSTRAINT fk_vr_apt FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS meetings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title_ar VARCHAR(190) NOT NULL,
  title_fr VARCHAR(190) NOT NULL,
  starts_at DATETIME NOT NULL,
  location VARCHAR(190) NULL,
  agenda_ar TEXT NULL,
  agenda_fr TEXT NULL,
  minutes_ar TEXT NULL,
  minutes_fr TEXT NULL,
  decisions TEXT NULL,
  status ENUM('scheduled','held','cancelled') NOT NULL DEFAULT 'scheduled',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS meeting_attendance (
  meeting_id INT UNSIGNED NOT NULL,
  apartment_id INT UNSIGNED NOT NULL,
  attended TINYINT(1) NOT NULL DEFAULT 0,
  response ENUM('unknown','yes','no','maybe') NOT NULL DEFAULT 'unknown',
  responded_at DATETIME NULL,
  PRIMARY KEY (meeting_id, apartment_id),
  CONSTRAINT fk_ma_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  CONSTRAINT fk_ma_apt FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(190) NOT NULL,
  file_id INT UNSIGNED NOT NULL,
  category VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equipment (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name_ar VARCHAR(190) NOT NULL,
  name_fr VARCHAR(190) NOT NULL,
  kind ENUM('elevator','lighting','cameras','basement','other') NOT NULL DEFAULT 'other',
  status ENUM('ok','degraded','down','maintenance') NOT NULL DEFAULT 'ok',
  last_check DATE NULL,
  technician_name VARCHAR(190) NULL,
  technician_phone VARCHAR(32) NULL,
  notes TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS maintenance_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  equipment_id INT UNSIGNED NOT NULL,
  happened_at DATE NOT NULL,
  description TEXT NULL,
  cost DECIMAL(12,2) NULL,
  CONSTRAINT fk_mh_eq FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cameras (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  location VARCHAR(190) NULL,
  status ENUM('online','offline','maintenance') NOT NULL DEFAULT 'online',
  last_inspection DATE NULL,
  technician_name VARCHAR(190) NULL,
  technician_phone VARCHAR(32) NULL,
  resident_visible TINYINT(1) NOT NULL DEFAULT 0,
  coverage_ar VARCHAR(255) NULL,
  coverage_fr VARCHAR(255) NULL,
  notes TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS facilities (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name_ar VARCHAR(190) NOT NULL,
  name_fr VARCHAR(190) NOT NULL,
  description_ar VARCHAR(255) NULL,
  description_fr VARCHAR(255) NULL,
  requires_approval TINYINT(1) NOT NULL DEFAULT 1,
  open_from TIME NOT NULL DEFAULT '08:00:00',
  open_to TIME NOT NULL DEFAULT '22:00:00',
  max_hours TINYINT UNSIGNED NOT NULL DEFAULT 4,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS facility_bookings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  facility_id INT UNSIGNED NOT NULL,
  apartment_id INT UNSIGNED NOT NULL,
  requested_by INT UNSIGNED NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  purpose VARCHAR(190) NULL,
  decision_note VARCHAR(255) NULL,
  decided_by INT UNSIGNED NULL,
  decided_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fb_apt FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE,
  CONSTRAINT fk_fb_facility FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  INDEX idx_fb_slot (facility_id, starts_at, ends_at),
  INDEX idx_fb_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label_ar VARCHAR(190) NOT NULL,
  label_fr VARCHAR(190) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  kind ENUM('manager','elevator','cleaning','electrician','plumber','cameras','civil_protection','police','other') NOT NULL DEFAULT 'other',
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_demo TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NULL,
  label VARCHAR(190) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  spent_at DATE NOT NULL,
  invoice_file_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_exp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_exp_file FOREIGN KEY (invoice_file_id) REFERENCES files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS complaint_files (
  complaint_id INT UNSIGNED NOT NULL,
  file_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (complaint_id, file_id),
  CONSTRAINT fk_cf_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  CONSTRAINT fk_cf_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS meeting_documents (
  meeting_id INT UNSIGNED NOT NULL,
  file_id INT UNSIGNED NOT NULL,
  title VARCHAR(190) NOT NULL,
  PRIMARY KEY (meeting_id, file_id),
  CONSTRAINT fk_md_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  CONSTRAINT fk_md_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Shared rate-limit store (used by App\Support\RateLimit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket CHAR(64) NOT NULL PRIMARY KEY,
  window_start DATETIME NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Append-only financial ledger, enforced by the database itself.
-- Kept in sync with sql/migrations/2026_09_08_financial_immutability.sql
-- (that migration exists for installations created before these protections).
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

CREATE TRIGGER trg_payments_no_update BEFORE UPDATE ON payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'payments are immutable: use a reversal record';
END$$

CREATE TRIGGER trg_payments_no_delete BEFORE DELETE ON payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'payments cannot be deleted: use a reversal record';
END$$

CREATE TRIGGER trg_receipts_no_update BEFORE UPDATE ON receipts FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receipts are immutable';
END$$

CREATE TRIGGER trg_receipts_no_delete BEFORE DELETE ON receipts FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receipts cannot be deleted';
END$$

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit log is append-only';
END$$

CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit log entries cannot be deleted';
END$$

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
