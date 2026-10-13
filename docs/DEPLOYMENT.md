# Production deployment

The current application and Firebase data/auth integration live on `claude/write-app-prompt-8V4uK`.
The repository default branch is used to register scheduled workflows and contains an older Supabase application. It must not be deployed as the current portfolio app.

Base interface changes on the current production branch. Preserve the Firebase backend, authentication, data hooks, API routes and reporting calculations. Verify an authenticated production page loads actual records before considering a release complete.
