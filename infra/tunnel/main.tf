# rgs-dev-wiki Cloudflare Tunnel: dev.robogeosociety.xyz -> the mini dev-wiki (:5193).
# Remotely-managed config (config_src=cloudflare); connector runs on the mini with the token.
resource "random_bytes" "tunnel_secret" {
  length = 32
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "dev_wiki" {
  account_id    = var.account_id
  name          = "rgs-dev-wiki"
  tunnel_secret = random_bytes.tunnel_secret.base64
  config_src    = "cloudflare"
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "dev_wiki" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.dev_wiki.id
  config = {
    ingress = [
      { hostname = "dev.robogeosociety.xyz", service = "http://localhost:5193" },
      { service = "http_status:404" },
    ]
  }
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "dev_wiki" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.dev_wiki.id
}
