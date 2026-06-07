# Consumed by `make envfile` to write web/.env.local for local dev. The Vite proxy
# sends these to Access as a service token; the browser never sees them.
output "service_token_client_id" {
  value     = cloudflare_zero_trust_access_service_token.dev.client_id
  sensitive = true
}

output "service_token_client_secret" {
  value     = cloudflare_zero_trust_access_service_token.dev.client_secret
  sensitive = true
}

output "backend_url" {
  value = "https://${var.hostname}"
}
