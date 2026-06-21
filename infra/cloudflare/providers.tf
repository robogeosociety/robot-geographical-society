terraform {
  required_version = ">= 1.9"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Auth comes from CLOUDFLARE_API_TOKEN — the *vended* rgs-infra token (issued by
# ../../../cloudflare-tfvend), loaded by the Makefile from that repo's Terraform
# output. This root manages only the durable data-plane resources (KV namespace, R2
# bucket, Pages project). Worker/Pages *code* deploy stays on wrangler (OAuth); Access
# and DNS live in their own roots (infra/access, infra/dns).
provider "cloudflare" {}
