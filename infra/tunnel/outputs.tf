output "tunnel_id" {
  value = cloudflare_zero_trust_tunnel_cloudflared.dev_wiki.id
}
output "tunnel_cname" {
  description = "CNAME target for dev.* (pass to infra/dns -var dev_tunnel_cname)."
  value       = "${cloudflare_zero_trust_tunnel_cloudflared.dev_wiki.id}.cfargotunnel.com"
}
output "connector_token" {
  description = "cloudflared run --token <this> on the mini."
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.dev_wiki.token
  sensitive   = true
}
