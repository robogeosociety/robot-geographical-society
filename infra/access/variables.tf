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
