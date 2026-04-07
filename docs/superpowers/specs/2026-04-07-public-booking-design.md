# Public Booking Landing Design

## Background

The existing `/book` route already fetches options from `/api/public-booking` and renders a schedule grid. It lives alongside the authenticated dashboard and was originally meant for internal staff. The current ask is to turn it into a sharable, public-facing appointment page that patients can open directly (e.g., `https://<clinic>/book`), submit a booking, and have that booking show up in the backend just like existing appointments. The public endpoint must be the only thing a guest can touch—no other pages or APIs should expose admin flows.

## Goals

1. Harden `/book` into a standalone campaign page:
   * Clean layout, hero messaging, trust signals (clinic hours, simple steps).
   * Responsive experience with limited form fields, helpful microcopy, visual cues.
   * Optional form data saved automatically and preserved during the session.
2. Support guest-only access:
   * Guest users can land on `/book` without authentication.
   * Every other route should remain protected (current router `meta.public` already covers it).
3. Preserve backend integration:
   * `/api/public-booking` remains the data source—options, schedule, availability, creation.
   * Submitted appointments should flow through existing services and appear in admin dashboard.

## Constraints

- Keep existing API and backend validation unchanged.
- Existing session/role guards must continue to protect internal routes.
- Deliverables should stay within the current Vue + Element Plus front-end.

## Design Options

**Option A (Recommended)** – Refine the current `/book` page into a public landing:

- Keep schedule grid, but wrap it in a hero/banner, compact info cards, and CTA.
- Surface the critical fields only: name, phone, email (optional), service, practitioner/room selection, slot.
- Add trust elements: clinic location, operating hours, and a short “how it works” checklist.
- Keep the form state-driven, but expose deeper descriptions via collapsible guidance.
- Show success feedback (time, practitioner) plus a “share this link” copy control.

**Option B** – Build a simplified one-column booking wizard:

- Step 1 collects contact details, Step 2 shows available slots, Step 3 confirms.
- Each step fits into a maximum-one-minute flow with priority validation.
- More work but improves conversion.

**Option C** – Use a marketing microsite wrapper around `/book`:

- Create a new hero page with marketing copy and embed `/book` via iframe or component.
- Keeps booking logic intact but requires more navigation/SEO work.

Recommendation: Option A keeps momentum, leverages existing code, and focuses on conversion with minimal new infrastructure.

## Detailed Layout (Option A)

1. **Hero section**
   - Big title (“Book a visit”), subtitle (clarify it’s public).
   - Two buttons: “Book Now” anchor to form, “Call us” link (tel).
   - Trust badges: hours, location, quick stats (e.g., “Same-day slots available”).
2. **Appointment form + schedule**
   - Left column: slim form for name/phone/email, selects for service/practitioner/room, notes.
   - Right column: weekly schedule grid as is, with legend and “select slot” guidance.
   - Keep auto-assignment logic; highlight available slots in turquoise; show autoset after selection.
3. **Confirmation section**
   - After submit, show card with slot time/practitioner plus “Share this link” and “Book another” buttons.
4. **Footer info**
   - Show contact info, FAQ snippet about sharing the link, privacy note.

## Guardrail Checklist

- Maintain `/book` route as `meta.public`.
- Keep `publicBookingApi` simple and auth-less.
- No new backend endpoints; reuse `/api/public-booking`.
- Avoid exposing other routes; guests should not see sidebar/navbar.

## Questions

1. Should the shareable link just be `/book`, or should we append query tokens (e.g., `?service=acupuncture`)?  
2. Anything beyond basic contact fields—like insurance info or intake form—must stay optional?
