# Manage the (residual) Cloudflare Access root. The Access boundary itself was
# RETIRED in the tailnet migration Phase 2 — the backend Worker is now its own wall
# (blank 404 without X-RGS-Key; see backend/src/index.ts and web/BACKEND_AUTH.md)
# and the web UI serves on the tailnet (nomad/rgs-web-serve.hcl). This root now
# manages only the account-level social IdPs (idp.tf), kept for any future Access app.
#
# Auth is the *vended* rgs-access-admin token, read from the cloudflare-tfvend repo's
# Terraform output (offline — no bootstrap token needed). Override its path with
# TFVEND=/path if the repo lives elsewhere.

TFVEND ?= /Volumes/dev/cloudflare-tfvend
export CLOUDFLARE_API_TOKEN := $(shell terraform -chdir=$(TFVEND) output -raw rgs_access_admin_token 2>/dev/null)
# Remote-state (R2 S3 backend) credentials — the vended tfstate-r2 token.
export AWS_ACCESS_KEY_ID := $(shell terraform -chdir=$(TFVEND) output -raw tfstate_r2_access_key_id 2>/dev/null)
export AWS_SECRET_ACCESS_KEY := $(shell terraform -chdir=$(TFVEND) output -raw tfstate_r2_secret_access_key 2>/dev/null)

.PHONY: help check init migrate plan apply destroy

init: check
	terraform init

# One-time migration of existing local state into the R2 backend.
migrate: check
	terraform init -migrate-state

help:
	@echo "make plan      # terraform plan"
	@echo "make apply     # terraform apply (auto-approve) — IdPs only since the wall migration"

check:
	@test -n "$(CLOUDFLARE_API_TOKEN)" || { \
		echo "No vended token. Is $(TFVEND) applied? (terraform -chdir=$(TFVEND) output rgs_access_admin_token)"; exit 1; }

plan: check
	terraform plan

apply: check
	terraform apply -auto-approve

destroy: check
	terraform destroy
