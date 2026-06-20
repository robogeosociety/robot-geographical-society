# The trusted auth boundary for the backend Worker. Once `api.robogeosociety.xyz`
# is bound to the Worker (via wrangler), every request to it must satisfy one of
# the policies below — there is no unauthenticated path. This is a PRIVATE project.

# Service token for non-interactive callers (the local Vite dev proxy). Its
# client_id/secret are output (sensitive) and written into web/.env.local.
resource "cloudflare_zero_trust_access_service_token" "dev" {
  account_id = var.account_id
  name       = "rgs-local-dev"

  # The token's secret is only emitted at creation, so rotating it means a
  # destroy+create (`terraform apply -replace=...`). Cloudflare refuses to delete a
  # token still referenced by the app policy, so create the replacement first and
  # let the app re-point to it before the old one is removed. See README.md.
  lifecycle {
    create_before_destroy = true
  }
}

# Self-hosted application on the backend hostname, with two policies: human SSO
# (the owner's email, via the account's IdP / one-time PIN) and the dev service
# token. A request is allowed only if it matches one of them.
resource "cloudflare_zero_trust_access_application" "backend" {
  account_id           = var.account_id
  name                 = "RGS backend"
  domain               = var.hostname
  type                 = "self_hosted"
  session_duration     = "24h"
  app_launcher_visible = false

  policies = [
    {
      name       = "Owner SSO"
      decision   = "allow"
      precedence = 1
      include    = [for e in var.allow_emails : { email = { email = e } }]
    },
    {
      name       = "Local dev service token"
      decision   = "non_identity"
      precedence = 2
      include    = [{ service_token = { token_id = cloudflare_zero_trust_access_service_token.dev.id } }]
    },
  ]
}
