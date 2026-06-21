# DNS for the deployed frontend custom domains. Each hostname is a **proxied** CNAME
# (orange cloud) to the Pages alias, so Cloudflare routes it to the Pages app — which
# is gated by the matching Access application in infra/access/frontend.tf. The Access
# app is applied first (the gate), so these records never expose an unauthenticated
# path. This is a PRIVATE project.
#
# Why DNS lives here and not on the wrangler OAuth flow (where the Pages custom-domain
# *attachment* is done, like the Worker custom-domain bind): wrangler's OAuth token
# carries Pages Write + zone *read*, but not DNS *write*. So the record itself is
# managed here with the least-privilege vended rgs-frontend-dns token (zone DNS Write,
# this zone only).
resource "cloudflare_dns_record" "frontend" {
  for_each = toset(var.frontend_hostnames)

  zone_id = var.zone_id
  name    = each.value
  type    = "CNAME"
  content = var.pages_alias
  proxied = true
  ttl     = 1 # required; 1 = automatic (and forced to automatic while proxied)
  comment = "RGS Pages frontend (gated by Cloudflare Access)"
}
