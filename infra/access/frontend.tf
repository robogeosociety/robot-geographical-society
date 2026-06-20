# The trusted auth boundary for the DEPLOYED frontend (Cloudflare Pages). The Pages
# app is reachable at two custom subdomains and the *.pages.dev alias; every one must
# require an Owner SSO login before serving the app. This is a PRIVATE project — no
# unauthenticated path. The /api/* Pages Function reaches the backend over an internal
# service binding, so the only gate prod users see is this SSO login.
locals {
  # All hostnames the Pages project answers on. The pages.dev alias is derived from
  # the Pages project name (robot-geographical-society-web) and MUST be gated too, or
  # the app would be publicly reachable there.
  frontend_hostnames = [
    "campsites.robogeosociety.xyz",
    "collectors.robogeosociety.xyz",
    "robot-geographical-society-web.pages.dev",
    # Per-deployment/preview URLs are <hash>.robot-geographical-society-web.pages.dev —
    # a DIFFERENT hostname than the apex above, so they need their own wildcard gate or
    # the deployment is publicly reachable (and /api would proxy backend data).
    "*.robot-geographical-society-web.pages.dev",
  ]
}

resource "cloudflare_zero_trust_access_application" "frontend" {
  for_each             = toset(local.frontend_hostnames)
  account_id           = var.account_id
  name                 = "RGS frontend (${each.value})"
  domain               = each.value
  type                 = "self_hosted"
  session_duration     = "24h"
  app_launcher_visible = false

  policies = [
    {
      name       = "Owner SSO"
      decision   = "allow"
      precedence = 1
      include    = [{ email = { email = var.allow_email } }]
    },
  ]
}
