variable "account_id" {
  description = "Cloudflare account (tommyroar-dev)."
  type        = string
  default     = "d7adee58513c1b2f770ccaac90cf114f"
}

variable "kv_namespace_title" {
  description = "Title of the CAMPSITES Workers KV namespace (the authoritative inventory + per-campsite KV)."
  type        = string
  default     = "CAMPSITES"
}

variable "r2_bucket_name" {
  description = "Name of the R2 bucket holding the banked availability snapshots."
  type        = string
  default     = "campsite-raw"
}

variable "pages_project_name" {
  description = "Cloudflare Pages project for the RGS frontend."
  type        = string
  default     = "robot-geographical-society-web"
}

variable "pages_production_branch" {
  description = "Production branch for the Pages project."
  type        = string
  default     = "main"
}
