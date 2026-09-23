variable "account_id" {
  description = "Cloudflare account (tommyroar-dev)."
  type        = string
  default     = "d7adee58513c1b2f770ccaac90cf114f"
}

# The GitHub IdP's OAuth client secret — sensitive, never committed. Pass at apply via
# TF_VAR_github_client_secret=…. The empty default exists so a read-only `plan` runs
# without it; note that applying with it empty would OVERWRITE the live secret (the
# long-standing stomp gotcha), so always check the plan for a config change first.
variable "github_client_secret" {
  description = "GitHub OAuth app client secret for the Access GitHub IdP."
  type        = string
  sensitive   = true
  default     = ""
}
