# The ONE resource left in this root: the account-level GitHub Access identity provider.
#
# Why it survives the 2026-09 reduction, when every Access *application* in this root
# was deleted (the api gate, the frontend gates, the dev-wiki gate):
#
#   An Access IdP is account-scoped, not app-scoped. This resource is the account's
#   only GitHub IdP (id 6393ada3-bc36-4e64-b4ea-20104590921a — it was referenced by
#   literal id from the now-deleted dev_wiki.tf for exactly that reason). The atlas
#   Access app (atlas.robogeosociety.xyz, the surviving travel-wiki gate) is NOT
#   managed by Terraform anywhere in this org, so nothing in code proves whether its
#   policy admits GitHub logins. The consolidation plan keeps "atlas app + GitHub IdP"
#   and retires only the Google IdP, so destroying this would risk locking the owner
#   out of the one gate that is meant to stay.
#
#   => KEEP, and confirm in the dashboard (Zero Trust > Settings > Authentication)
#      that atlas's login methods still resolve before ever removing it.
#
# (Removed 2026-09) the Google IdP — repurposed Grafana OAuth client, retired with
# Grafana. Its client secret var is gone too.
#
# Client IDs are not secret (they appear in OAuth redirects) → committed here. The
# client SECRET is a sensitive var — never committed. Pass at apply via
# TF_VAR_github_client_secret=… and confirm the plan shows no change to it.

resource "cloudflare_zero_trust_access_identity_provider" "github" {
  account_id = var.account_id
  name       = "GitHub"
  type       = "github"
  config = {
    client_id     = "Ov23lidku36t1OHH7wPz"
    client_secret = var.github_client_secret
  }
}
