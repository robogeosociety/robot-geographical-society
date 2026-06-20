variable "account_id" {
  description = "Cloudflare account (tommyroar-dev)."
  type        = string
  default     = "d7adee58513c1b2f770ccaac90cf114f"
}

variable "hostname" {
  description = "Hostname fronting the backend Worker (Access-protected)."
  type        = string
  default     = "api.robogeosociety.xyz"
}

variable "allow_email" {
  description = "Email allowed to reach the backend via Access SSO."
  type        = string
  default     = "tommy.b.doerr@gmail.com"
}

# Social IdP client secrets — sensitive, never committed. Pass at apply via
# TF_VAR_github_client_secret / TF_VAR_google_client_secret (empty default so a
# targeted apply of one IdP doesn't require the other's secret).
variable "github_client_secret" {
  description = "GitHub OAuth app client secret for the Access GitHub IdP."
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret for the Access Google IdP."
  type        = string
  sensitive   = true
  default     = ""
}
