# Routes notes
- Sign out uses scope 'local' and the root auth listener ignores repeated SIGNED_IN for the same user; /auth bounces a still-valid session back to /chat; why: shared accounts were signed out on every device, and tab-focus re-checks could send a signed-in user to /auth.
