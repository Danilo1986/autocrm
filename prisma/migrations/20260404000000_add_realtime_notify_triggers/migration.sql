-- =============================================================================
-- Realtime NOTIFY Triggers
-- Replaces Supabase Realtime with pg LISTEN/NOTIFY
-- =============================================================================

-- Generic function that sends a JSON payload to the 'crm_changes' channel
CREATE OR REPLACE FUNCTION notify_crm_change()
RETURNS TRIGGER AS $$
DECLARE
  row_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_id := OLD.id::TEXT;
  ELSE
    row_id := NEW.id::TEXT;
  END IF;

  PERFORM pg_notify(
    'crm_changes',
    json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'id', row_id,
      'timestamp', NOW()::TEXT
    )::TEXT
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to the 6 realtime tables

CREATE TRIGGER trg_notify_deals
  AFTER INSERT OR UPDATE OR DELETE ON deals
  FOR EACH ROW EXECUTE FUNCTION notify_crm_change();

CREATE TRIGGER trg_notify_contacts
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION notify_crm_change();

CREATE TRIGGER trg_notify_activities
  AFTER INSERT OR UPDATE OR DELETE ON activities
  FOR EACH ROW EXECUTE FUNCTION notify_crm_change();

CREATE TRIGGER trg_notify_boards
  AFTER INSERT OR UPDATE OR DELETE ON boards
  FOR EACH ROW EXECUTE FUNCTION notify_crm_change();

CREATE TRIGGER trg_notify_board_stages
  AFTER INSERT OR UPDATE OR DELETE ON board_stages
  FOR EACH ROW EXECUTE FUNCTION notify_crm_change();

CREATE TRIGGER trg_notify_crm_companies
  AFTER INSERT OR UPDATE OR DELETE ON crm_companies
  FOR EACH ROW EXECUTE FUNCTION notify_crm_change();
