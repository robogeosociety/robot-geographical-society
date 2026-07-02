# DNS for the 404 wall (tailnet migration Phase 2). The frontend custom-domain
# CNAMEs (campsites./collectors. → Pages) are GONE — the web UI serves on the
# tailnet only (nomad/rgs-web-serve.hcl on the mini). What remains here are
# parking records for the apex + www: proxied placeholders (TEST-NET-1 is never
# dialed — the orange cloud terminates at the edge) so the backend Worker's zone
# routes (backend/wrangler.toml) answer with a blank 404. Strangers see nothing,
# anywhere on the domain. atlas.robogeosociety.xyz (public travel wiki) is managed
# elsewhere and is deliberately NOT walled.
#
# Managed here with the least-privilege vended rgs-frontend-dns token (zone DNS
# Write, this zone only) — same story as before the migration.
resource "cloudflare_dns_record" "wall" {
  for_each = toset(["robogeosociety.xyz", "www.robogeosociety.xyz"])

  zone_id = var.zone_id
  name    = each.value
  type    = "A"
  content = "192.0.2.1"
  proxied = true
  ttl     = 1 # required; 1 = automatic (and forced to automatic while proxied)
  comment = "404 wall — the backend Worker's zone route answers (tailnet migration)"
}
