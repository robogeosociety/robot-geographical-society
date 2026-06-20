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

variable "allow_emails" {
  description = "Emails allowed through Access SSO (the owner's identities across IdPs)."
  type        = list(string)
  # tommy.b.doerr@gmail.com — email one-time-PIN / primary owner identity.
  # isillness@gmail.com     — the email the owner's GitHub account presents (verified via
  #                           the Access audit log); without it, GitHub SSO is denied.
  default = ["tommy.b.doerr@gmail.com", "isillness@gmail.com"]
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
