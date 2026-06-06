# CAP Compass College Explorer

Student-facing College Explorer for the MHT-CET counselling system.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from `.env.example` and use the same Supabase project as the landing website.

3. Run `supabase/shortlists.sql` in the Supabase SQL editor.

4. Start the app:

   ```bash
   npm run dev
   ```

## Notes

Students log in with the email and password created on the landing website. The app reads `students`, `colleges`, `cutoffs`, and `shortlists` from the shared Supabase project.
