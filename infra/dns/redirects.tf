# Short URLs on the reserved apex (dns.tf `wall`): Single Redirect Rules, Cloudflare's
# free-plan redirect feature. Nothing runs on Cloudflare: the edge answers 302 itself,
# the 192.0.2.1 placeholder is never dialed.
#
# Targets may be tailnet-only (e.g. a Tailscale Service). The redirect is public, so it
# reveals the target hostname, never its content: that still needs a tailnet device.
#
# One ruleset per zone per phase. If `apply` reports the phase entrypoint already
# exists, import it first:
#   terraform import cloudflare_ruleset.short_urls zones/<zone_id>/<ruleset_id>
# Auth: the vended rgs-frontend-dns token, which needs Dynamic URL Redirects Write on
# top of DNS Write (cloudflare-tfvend tokens.tf).

variable "short_urls" {
  description = "Path on robogeosociety.xyz (and www.) → redirect target. `/x` and `/x/` both match."
  type        = map(string)
  default = {
    # Kiro Crew dashboard on the MacBook Air (tailscale serve), tailnet-only. Interim:
    # retarget to https://dash.tail59a169.ts.net/ once the mini's Tailscale Service exists
    # (robogeosociety/infra docs/mini-dashboards.md).
    dash = "https://macbook-air.tail59a169.ts.net/"
  }
}

resource "cloudflare_ruleset" "short_urls" {
  zone_id     = var.zone_id
  name        = "short URLs"
  description = "robogeosociety.xyz/<name> redirects (infra/dns redirects.tf)"
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"

  rules = [for name, target in var.short_urls : {
    ref         = "short_${name}"
    description = "/${name} → ${target}"
    expression  = "(http.host in {\"robogeosociety.xyz\" \"www.robogeosociety.xyz\"} and http.request.uri.path in {\"/${name}\" \"/${name}/\"})"
    action      = "redirect"
    action_parameters = {
      from_value = {
        status_code           = 302 # temporary: the target may move (another host, another service)
        preserve_query_string = false
        target_url            = { value = target }
      }
    }
    enabled = true
  }]
}
