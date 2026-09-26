output "managed_records" {
  description = "The records this root manages (hostname → target)."
  value = {
    (cloudflare_dns_record.mountainisout.name) = "${cloudflare_dns_record.mountainisout.type} → ${cloudflare_dns_record.mountainisout.content} (proxied=${cloudflare_dns_record.mountainisout.proxied})"
  }
}
