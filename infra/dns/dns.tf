# DNS for robogeosociety.xyz after the Cloudflare decommission (2026-10-28,
# robogeosociety/infra docs/cloudflare-decommission.md). Nothing on the domain runs on
# Cloudflare any more; the zone stays here because the domain is registered through
# Cloudflare Registrar, which requires Cloudflare nameservers.
#
# Managed with the least-privilege vended rgs-frontend-dns token (zone DNS Write, this
# zone only).

# The apex and www are kept for short URLs. Proxied placeholders (TEST-NET-1 is never
# dialed while the orange cloud is on), so a redirect rule or a short-link service can
# attach to them later without a DNS change. Until then they answer with an edge error.
# The resource keeps its old `wall` address so the records are updated, not replaced.
resource "cloudflare_dns_record" "wall" {
  for_each = toset(["robogeosociety.xyz", "www.robogeosociety.xyz"])

  zone_id = var.zone_id
  name    = each.value
  type    = "A"
  content = "192.0.2.1"
  proxied = true
  ttl     = 1 # required; 1 = automatic (and forced to automatic while proxied)
  comment = "Reserved for short URLs (Cloudflare decommission 2026-10-28)"
}

# is-the-mountain-out on GitHub Pages. DNS-only (grey cloud): GitHub issues the HTTPS
# certificate itself and cannot while Cloudflare proxies the name. The CNAME file
# ships in the Pages artifact (is-the-mountain-out publish.yml).
resource "cloudflare_dns_record" "mountainisout" {
  zone_id = var.zone_id
  name    = "mountainisout.robogeosociety.xyz"
  type    = "CNAME"
  content = "robogeosociety.github.io"
  proxied = false
  ttl     = 300
  comment = "is-the-mountain-out → GitHub Pages"
}
