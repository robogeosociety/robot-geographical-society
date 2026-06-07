terraform {
  required_version = ">= 1.9"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Auth comes from CLOUDFLARE_API_TOKEN — the *vended* rgs-access-admin token
# (issued by ../../../cloudflare-tfvend), loaded by the Makefile from that repo's
# Terraform output. This root manages only Cloudflare Access (the boundary); the
# Worker custom-domain bind is done with wrangler (Workers stay on the OAuth flow).
provider "cloudflare" {}
