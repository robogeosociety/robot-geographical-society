# Remote state on R2 (S3-compatible). Credentials come from AWS_ACCESS_KEY_ID /
# AWS_SECRET_ACCESS_KEY, exported by the Makefile from the vended `tfstate-r2` token
# (cloudflare-tfvend outputs). The skip_* / use_path_style / skip_s3_checksum flags are
# what make the AWS s3 backend talk to R2 instead of real S3.
terraform {
  backend "s3" {
    bucket    = "tommyroar-tfstate"
    key       = "rgs/cloudflare.tfstate"
    region    = "auto"
    endpoints = { s3 = "https://d7adee58513c1b2f770ccaac90cf114f.r2.cloudflarestorage.com" }

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    use_path_style              = true
    skip_s3_checksum            = true
  }
}
