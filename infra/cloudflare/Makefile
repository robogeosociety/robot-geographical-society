# Manage the durable RGS data-plane resources (KV namespace, R2 bucket, Pages project).
#
# Auth is the *vended* rgs-infra token, read from the cloudflare-tfvend repo's Terraform
# output (offline — no bootstrap token needed). Override its path with TFVEND=/path if
# the repo lives elsewhere.

TFVEND ?= /Volumes/dev/cloudflare-tfvend
ACCOUNT_ID ?= d7adee58513c1b2f770ccaac90cf114f
KV_ID  ?= aad9f04d90e945ffb8d278d7b8e70976
R2_BUCKET ?= campsite-raw
PAGES_PROJECT ?= robot-geographical-society-web
export CLOUDFLARE_API_TOKEN := $(shell terraform -chdir=$(TFVEND) output -raw rgs_infra_token 2>/dev/null)

.PHONY: help check plan apply import destroy

help:
	@echo "make import   # one-time: adopt the existing KV/R2/Pages into state (never recreate)"
	@echo "make plan     # terraform plan (gate: must show 0 to destroy)"
	@echo "make apply    # terraform apply (auto-approve)"

check:
	@test -n "$(CLOUDFLARE_API_TOKEN)" || { \
		echo "No vended token. Is $(TFVEND) applied? (terraform -chdir=$(TFVEND) output rgs_infra_token)"; exit 1; }

# One-time adoption of the live resources. Safe to re-run: import only writes local
# state, never mutates Cloudflare. Run after `terraform init`, then `make plan`.
import: check
	terraform import cloudflare_workers_kv_namespace.campsites $(ACCOUNT_ID)/$(KV_ID)
	terraform import cloudflare_r2_bucket.campsite_raw $(ACCOUNT_ID)/$(R2_BUCKET)/default
	terraform import cloudflare_pages_project.web $(ACCOUNT_ID)/$(PAGES_PROJECT)

plan: check
	terraform plan

apply: check
	terraform apply -auto-approve

destroy: check
	@echo "Refusing to destroy data-plane resources (KV + R2 hold live data). Remove from state with 'terraform state rm' instead if needed."; exit 1
