# Social identity providers for the Access login, alongside the built-in one-time-PIN
# (email OTP stays available). A login via any of these returns the user's email, which
# the existing Owner-SSO policies match on, and which the app's RBAC maps to a role.
#
# Client IDs are not secret (they appear in OAuth redirects) → committed here.
# Client SECRETS are sensitive vars — never committed, never the dashboard. Pass at
# apply via `TF_VAR_github_client_secret=…` / `TF_VAR_google_client_secret=…`.

resource "cloudflare_zero_trust_access_identity_provider" "github" {
  account_id = var.account_id
  name       = "GitHub"
  type       = "github"
  config = {
    client_id     = "Ov23lidku36t1OHH7wPz"
    client_secret = var.github_client_secret
  }
}

# Reuses the repurposed Grafana Google OAuth client (see the Human task) rather than a
# new one — its lifecycle is now coupled to Access.
resource "cloudflare_zero_trust_access_identity_provider" "google" {
  account_id = var.account_id
  name       = "Google"
  type       = "google"
  config = {
    client_id     = "803168508280-3q5oqrnuvp6fb2k61bu7q7k7tc79ogkm.apps.googleusercontent.com"
    client_secret = var.google_client_secret
  }
}
