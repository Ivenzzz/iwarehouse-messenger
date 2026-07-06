# "Continue with Google" — setup guide

The Google sign-in code is fully built into the app already. The button
appears on the login page automatically once you configure it. This guide is
the configuration.

## How it behaves (safety rules, already enforced)
- A Google account whose email MATCHES AN EXISTING USER signs that user in —
  no password typed. This is the main convenience: staff sign in with the
  Gmail their account was created with.
- Unknown emails are REJECTED by default (no random Gmail can join).
- Optional self-registration: set GOOGLE_AUTO_CREATE=true and new Google
  users are created with the basic MEMBER role. You can restrict this to one
  email domain with GOOGLE_ALLOWED_DOMAIN (e.g. iwarehouse.ph). WARNING: do
  NOT set GOOGLE_ALLOWED_DOMAIN=gmail.com with auto-create on — that would
  let anyone with a Gmail register.
- Deactivated accounts stay blocked, Google or not. Everything is audited.

## Step 1 — Create the Google OAuth client (free, ~5 minutes)
1. Go to https://console.cloud.google.com/ and sign in with your Google
   account.
2. Top bar: create a project (name: iWarehouse Messenger) or pick one.
3. Left menu: APIs & Services → OAuth consent screen.
   - User type: External → Create.
   - App name: iWarehouse Messenger. Support email: yours. Save through the
     steps (scopes: none needed beyond default; test users: add your own
     Gmail while the app is in "Testing" mode).
4. APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: Web application.
   - Name: iWarehouse Messenger.
   - Authorized redirect URIs — add BOTH (you can add more later):
       http://localhost/api/auth/google/callback
       https://chat.iwarehouse.ph/api/auth/google/callback
5. Create → copy the CLIENT ID and CLIENT SECRET.

Note: while the consent screen is in "Testing" mode, only Google accounts
you list as test users can sign in. Add your staff's Gmails there, or click
"Publish app" to allow any Google account (your app's own rules above still
decide who actually gets in).

## Step 2 — Configure the app
Open C:\msg\.env in Notepad and set:

    APP_URL=http://localhost
    GOOGLE_CLIENT_ID=paste-the-client-id-here
    GOOGLE_CLIENT_SECRET=paste-the-secret-here
    GOOGLE_AUTO_CREATE=false

(APP_URL must exactly match where you open the app — http://localhost while
on your PC; change to https://chat.iwarehouse.ph after deployment and add
that redirect URI in Google as in Step 1.)

Then restart the api so it picks the values up:

    docker compose up -d --force-recreate api

## Step 3 — Use it
Reload the login page (Ctrl+F5). A "Continue with Google" button now appears
under the password form. Click it → pick the Google account → if its email
matches an existing user (e.g. michael.yap@iwarehouse.ph exists and your
Gmail is that address), you're in.

For staff whose accounts use company-style emails but who sign in with a
personal Gmail: create their user with the Gmail address as their email, and
Google sign-in will match it.
