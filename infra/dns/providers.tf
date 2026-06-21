terraform {
  required_version = ">= 1.9"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Auth comes from CLOUDFLARE_API_TOKEN — the *vended* rgs-frontend-dns token (issued by
# ../../../cloudflare-tfvend), loaded by the Makefile from that repo's Terraform output.
# That token is DNS Write scoped to the single robogeosociety.xyz zone — nothing else.
provider "cloudflare" {}
