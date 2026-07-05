# Remote state on R2 (S3-compatible). Creds from AWS_* (vended tfstate-r2 token), via Makefile.
terraform {
  backend "s3" {
    bucket    = "tommyroar-tfstate"
    key       = "rgs/tunnel.tfstate"
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
