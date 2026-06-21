variable "zone_id" {
  description = "Cloudflare zone id for robogeosociety.xyz."
  type        = string
  default     = "56bcf25e94954aee543e4a344b0cf8f7"
}

variable "pages_alias" {
  description = "The Pages project alias the frontend custom domains CNAME to."
  type        = string
  default     = "robot-geographical-society-web.pages.dev"
}

variable "frontend_hostnames" {
  description = <<-EOT
    The frontend custom domains served by the Pages app. Each is a proxied CNAME to the
    Pages alias and is gated by a Cloudflare Access app (see infra/access/frontend.tf) —
    keep these two lists in lockstep, or a domain resolves without an auth boundary.
  EOT
  type        = list(string)
  default = [
    "campsites.robogeosociety.xyz",
    "collectors.robogeosociety.xyz",
  ]
}
