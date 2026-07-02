output "wall_records" {
  description = "The 404-wall parking records (hostname → placeholder; the Worker route answers)."
  value       = { for h, r in cloudflare_dns_record.wall : h => "${r.type} → ${r.content} (proxied=${r.proxied})" }
}
