---
name: Supabase schema provisioning
description: The Supabase Replit connector exposes authenticated PostgREST access but does not provision database tables or run DDL.
---

The Supabase connector can read and write exposed tables/views through PostgREST, but creating the schema must happen separately in the same Supabase project (for example, by running a reviewed SQL script in SQL Editor).

**Why:** A successful connector connection can still return PGRST205 when the requested table is absent; attempting to fix that with reauthorization or frontend credentials is incorrect.

**How to apply:** Provision the table/view/policies in the connected project first, then verify the exact PostgREST table endpoint before treating the app's global statistics API as ready.