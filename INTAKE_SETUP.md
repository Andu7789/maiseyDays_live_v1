# Customer Intake System — Setup Guide

The new system gives you real customer records with a digital grooming agreement
(the "Dirty Dawg" paper form, online, with a finger-drawn signature).

## How it works day-to-day

1. A customer record appears in **Admin → Customers** one of three ways:
   - A web booking comes in (created automatically, matched by email — no duplicates).
   - You click **+ Add Customer** and type just their name + phone/email.
   - Existing customers were backfilled from past bookings when you ran the migration.
2. Open the customer → **📋 Grooming Agreement** panel → pick a send channel:
   - **📱 WhatsApp** (free) — opens WhatsApp with the message and their personal link pre-filled; you just press send.
   - **💬 SMS** (~4p) — sends automatically via your existing Vonage account.
   - **📧 Email** (free) — sends via Resend (needs one-time setup below).
   - **🔗 Copy Link** — paste it anywhere (e.g. Facebook Messenger).
3. The customer fills in the form on their phone (multiple dogs supported), signs
   with their finger, and submits. Their record updates instantly.
4. The customer list shows who's outstanding: **Form not sent / Awaiting form / Signed**
   filters at the top. Signed agreements can be viewed and printed from the customer modal.

## One-time setup (do these in order)

### 1. Run the database migration
Supabase Dashboard → SQL Editor → paste and run:
`supabase/migrations/20260704_customer_intake_system.sql`

This creates the `customers` and `dogs` tables, links `appointments` to customers,
backfills all your existing customers from past bookings, and installs a trigger so
every future booking auto-creates/updates the customer record.

### 2. Deploy the two new edge functions
From the project folder (same way the existing functions were deployed):

```
supabase functions deploy intake-form
supabase functions deploy send-intake-email
```

`intake-form` handles the public form (validates each customer's unique link token
server-side, so nobody can read or write anyone else's record).

### 3. (Optional, for the Email button) Set up Resend — free
1. Sign up at https://resend.com (free tier = 3,000 emails/month, way more than needed).
2. Verify your sending domain (or use their test address to start).
3. Set the secrets:
```
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase secrets set INTAKE_FROM_EMAIL="Maisey Days @ Dirty Dawg <bookings@yourdomain.co.uk>"
```
Until this is done, the Email button will show a friendly "not configured" message —
WhatsApp, SMS and Copy Link all work without it.

### 4. Deploy the site
Build and deploy the front end as usual (`npm run build`). The intake form lives at
`https://your-site.com/#intake=TOKEN` — no extra hosting needed.

## Quick test after setup
1. Admin → Customers → **+ Add Customer** → add yourself with your own mobile number.
2. Open your record → **🔗 Copy Link** → open the link in your phone's browser.
3. Fill the form in, sign, submit.
4. Back in admin, your record should show **✓ Signed** — open it, click **👀 View Agreement** and **🖨️ Print**.
5. Then try **📱 WhatsApp** on your own number to see the pre-filled message flow.

## Costs
| Channel | Cost |
|---|---|
| WhatsApp (wa.me link) | Free |
| Email (Resend) | Free up to 3,000/month |
| SMS (Vonage) | ~4p per message |
| Supabase tables/functions | Covered by existing plan |

## Notes
- Deleting a customer keeps their booking history (bookings are unlinked, not deleted).
- Re-sending the form is always allowed — the same link updates their existing record.
- The agreement stores the T&Cs version they signed (`INTAKE_TERMS` in `constants.tsx`);
  if you change the terms, bump `INTAKE_TERMS_VERSION` so you know who signed which version.
