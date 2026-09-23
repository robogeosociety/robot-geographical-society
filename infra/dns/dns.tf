# DNS for robogeosociety.xyz, after the 2026-09 reduction.
#
# (Removed) the `campsites.` and `collectors.` proxied CNAMEs. They pointed at the
# `robot-geographical-society-web` Pages project, which has been deleted, so both
# records were dead. Their Access gates went with `../access`.
#
# (Removed) the `dev.` CNAME — the rgs-dev-wiki Cloudflare Tunnel is retired along
# with `infra/tunnel` and the cloudflared LaunchAgent on the mini.

# is-the-mountain-out, served straight from GitHub Pages.
#
# DNS-ONLY on purpose (`proxied = false`, grey cloud): the reduction takes Cloudflare
# out of this path entirely — no Worker, no Container, no R2 in front. GitHub Pages
# terminates TLS for the custom domain itself, which it can only do when it sees the
# real request, i.e. when the record is unproxied. The repo must keep a CNAME file
# containing `mountainisout.robogeosociety.xyz` for Pages to answer for it.
#
# NOTE: this record already exists (it was created in the dashboard, not here). Import
# it before the first apply, or the apply fails with "record already exists":
#
#   terraform import cloudflare_dns_record.mountainisout \
#     "${var.zone_id}/<record-id>"
#
# (find the id: GET /zones/<zone>/dns_records?name=mountainisout.robogeosociety.xyz)
resource "cloudflare_dns_record" "mountainisout" {
  zone_id = var.zone_id
  name    = "mountainisout.robogeosociety.xyz"
  type    = "CNAME"
  content = "robogeosociety.github.io"
  proxied = false
  ttl     = 1 # automatic
  comment = "is-the-mountain-out → GitHub Pages (DNS-only; no Cloudflare in the path)"
}

# --- apex and www: left alone here, but they are about to break -----------------
#
# `robogeosociety.xyz` and `www.robogeosociety.xyz` are dashboard-managed records
# (never modelled in this root) that resolve to a Worker route. The reduction deletes
# those routes, so both hostnames will return **error 522 / 1016** the moment the
# routes are gone: a proxied record with nothing behind it.
#
# They are deliberately NOT removed here — dropping the records outright would give a
# bare NXDOMAIN, which is worse than a redirect and costs the zone its apex.
#
# FOLLOW-UP (proposed, not done in this change): add a free **Bulk Redirect**
# (Rules → Redirect Rules → Bulk Redirects) sending
#   robogeosociety.xyz/*  and  www.robogeosociety.xyz/*
# to a live destination (the GitHub org page, or mountainisout), keeping the records
# proxied so the redirect can run at the edge. Bulk Redirects are available on the
# free plan, which matters because the account is moving off Workers Paid.
