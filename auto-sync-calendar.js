#!/usr/bin/env node
/**
 * Auto-sync Google Calendar to Maisey Days bookings
 * Runs every 10 minutes while this script is running
 *
 * Usage: node auto-sync-calendar.js
 * To run in background: node auto-sync-calendar.js &
 */

const SYNC_URL = 'https://rmooksnngqyzqraeicvr.supabase.co/functions/v1/calendar-webhook-handler';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29rc25uZ3F5enFyYWVpY3ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTU2NDgsImV4cCI6MjA4NTM3MTY0OH0.N4COImAWUpLz7yS4OJM4Tgsew-On6s_5ee0_F6pw3-c';
const INTERVAL_MINUTES = 10; // Production: sync every 10 minutes

async function syncCalendar() {
  const timestamp = new Date().toLocaleTimeString();

  try {
    console.log(`[${timestamp}] Syncing calendar...`);

    const response = await fetch(SYNC_URL, {
      method: 'POST',
      headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (result.success) {
      console.log(`[${timestamp}] ✅ Sync successful:`, {
        scanned: result.scanned,
        synced: result.synced,
        updated: result.updated,
        errors: result.errors
      });
    } else {
      console.error(`[${timestamp}] ❌ Sync failed:`, result.error);
    }
  } catch (error) {
    console.error(`[${timestamp}] ❌ Error:`, error.message);
  }
}

// Run immediately on start
console.log('🚀 Starting auto-sync service...');
console.log(`📅 Will sync every ${INTERVAL_MINUTES} minutes`);
console.log('Press Ctrl+C to stop\n');

syncCalendar();

// Then run every N minutes
setInterval(syncCalendar, INTERVAL_MINUTES * 60 * 1000);
