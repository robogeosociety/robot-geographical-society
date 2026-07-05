# dev.robogeosociety.xyz rewire — the public dev-wiki behind GitHub Access.
#
# A self-hosted Access app on the dev-wiki hostname admitting anyone in the `robogeosociety`
# GitHub org (login via the existing GitHub IdP). Origin = the mini's dev-wiki (:5193) via the
# rgs-dev-wiki Cloudflare Tunnel (infra/tunnel) + the dev CNAME (infra/dns).
#
# STOMP-SAFE: the GitHub IdP is referenced by its LITERAL id (not the resource), so a targeted
# apply of just this app never pulls the IdP into the plan — protecting its client_secret from
# an empty-var overwrite (the known gotcha). Apply with:
#   terraform apply -target=cloudflare_zero_trust_access_application.dev_wiki
# after confirming the plan shows ONLY this app being created (no github/google IdP changes).
locals {
  # cloudflare_zero_trust_access_identity_provider.github (kept in state; referenced by value)
  github_idp_id = "6393ada3-bc36-4e64-b4ea-20104590921a"
}

resource "cloudflare_zero_trust_access_application" "dev_wiki" {
  account_id                = var.account_id
  name                      = "RGS dev wiki"
  domain                    = "dev.robogeosociety.xyz"
  type                      = "self_hosted"
  session_duration          = "24h"
  allowed_idps              = [local.github_idp_id] # GitHub login only
  auto_redirect_to_identity = true                  # skip the IdP picker (GitHub is the only one)

  policies = [{
    name     = "robogeosociety GitHub org"
    decision = "allow"
    include = [{
      github_organization = {
        name                 = "robogeosociety"
        identity_provider_id = local.github_idp_id
      }
    }]
  }]
}
