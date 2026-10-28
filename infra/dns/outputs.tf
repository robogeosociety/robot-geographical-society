output "records" {
  description = "The managed records (hostname → target)."
  value = merge(
    { for h, r in cloudflare_dns_record.wall : h => "${r.type} → ${r.content} (proxied=${r.proxied})" },
    { (cloudflare_dns_record.mountainisout.name) = "CNAME → ${cloudflare_dns_record.mountainisout.content} (proxied=false)" },
  )
}
