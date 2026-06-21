# Manage DNS for the rgs frontend custom domains (campsites/collectors → the Pages
# alias, proxied + gated by Access).
#
# Auth is the *vended* rgs-frontend-dns token, read from the cloudflare-tfvend repo's
# Terraform output (offline — no bootstrap token needed). Override its path with
# TFVEND=/path if the repo lives elsewhere.

TFVEND ?= /Volumes/dev/cloudflare-tfvend
export CLOUDFLARE_API_TOKEN := $(shell terraform -chdir=$(TFVEND) output -raw rgs_frontend_dns_token 2>/dev/null)

.PHONY: help check plan apply destroy

help:
	@echo "make plan      # terraform plan"
	@echo "make apply     # terraform apply (auto-approve) — creates the proxied CNAMEs"

check:
	@test -n "$(CLOUDFLARE_API_TOKEN)" || { \
		echo "No vended token. Is $(TFVEND) applied? (terraform -chdir=$(TFVEND) output rgs_frontend_dns_token)"; exit 1; }

plan: check
	terraform plan

apply: check
	terraform apply -auto-approve

destroy: check
	terraform destroy
