# dev.robogeosociety.xyz → the rgs-dev-wiki Cloudflare Tunnel (public dev-wiki behind GitHub
# Access). Proxied CNAME to <tunnel-id>.cfargotunnel.com. The tunnel id isn't known until the
# tunnel is created (infra/tunnel), so the record is gated on dev_tunnel_cname being supplied:
#   terraform apply -var dev_tunnel_cname="$(terraform -chdir=../tunnel output -raw tunnel_cname)"
# Managed with the vended rgs-frontend-dns token (zone DNS Write, this zone only), like the wall.
variable "dev_tunnel_cname" {
  description = "CNAME target for dev.* — the rgs-dev-wiki tunnel (<id>.cfargotunnel.com). Empty = don't create the record yet."
  type        = string
  default     = ""
}

resource "cloudflare_dns_record" "dev_wiki" {
  count = var.dev_tunnel_cname == "" ? 0 : 1

  zone_id = var.zone_id
  name    = "dev.robogeosociety.xyz"
  type    = "CNAME"
  content = var.dev_tunnel_cname
  proxied = true
  ttl     = 1 # required; automatic while proxied
  comment = "dev-wiki → rgs-dev-wiki tunnel (GitHub Access) — tailnet-migration rewire"
}
