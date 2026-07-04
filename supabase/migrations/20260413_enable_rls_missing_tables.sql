-- Enable RLS on tables flagged by Supabase Security Advisor.
-- These are all internal/admin tables accessed via the anon key,
-- so policies allow full access (same pattern as other tables in this project).

-- reminder_settings
ALTER TABLE reminder_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read reminder_settings"  ON reminder_settings FOR SELECT USING (true);
CREATE POLICY "Allow update reminder_settings" ON reminder_settings FOR UPDATE USING (true);

-- calendar_webhook_logs
ALTER TABLE calendar_webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read calendar_webhook_logs"   ON calendar_webhook_logs FOR SELECT USING (true);
CREATE POLICY "Allow insert calendar_webhook_logs" ON calendar_webhook_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update calendar_webhook_logs" ON calendar_webhook_logs FOR UPDATE USING (true);

-- calendar_sync_settings
ALTER TABLE calendar_sync_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read calendar_sync_settings"   ON calendar_sync_settings FOR SELECT USING (true);
CREATE POLICY "Allow insert calendar_sync_settings" ON calendar_sync_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update calendar_sync_settings" ON calendar_sync_settings FOR UPDATE USING (true);

-- calendar_watch_channels
ALTER TABLE calendar_watch_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read calendar_watch_channels"   ON calendar_watch_channels FOR SELECT USING (true);
CREATE POLICY "Allow insert calendar_watch_channels" ON calendar_watch_channels FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update calendar_watch_channels" ON calendar_watch_channels FOR UPDATE USING (true);
CREATE POLICY "Allow delete calendar_watch_channels" ON calendar_watch_channels FOR DELETE USING (true);

-- admin_notification_log
ALTER TABLE admin_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read admin_notification_log"   ON admin_notification_log FOR SELECT USING (true);
CREATE POLICY "Allow insert admin_notification_log" ON admin_notification_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update admin_notification_log" ON admin_notification_log FOR UPDATE USING (true);

-- admin_notification_settings
ALTER TABLE admin_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read admin_notification_settings"   ON admin_notification_settings FOR SELECT USING (true);
CREATE POLICY "Allow insert admin_notification_settings" ON admin_notification_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update admin_notification_settings" ON admin_notification_settings FOR UPDATE USING (true);

-- booking_reminders
ALTER TABLE booking_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read booking_reminders"   ON booking_reminders FOR SELECT USING (true);
CREATE POLICY "Allow insert booking_reminders" ON booking_reminders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update booking_reminders" ON booking_reminders FOR UPDATE USING (true);
CREATE POLICY "Allow delete booking_reminders" ON booking_reminders FOR DELETE USING (true);
