terraform {
  required_version = ">= 1.16"

  # state はローカル（.gitignore 済み）。手元からだけ apply する（ADR 0008）
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.25"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
  }
}

# 認証は環境変数 CLOUDFLARE_API_TOKEN / GITHUB_TOKEN（README「初回」）
provider "cloudflare" {}

provider "github" {
  owner = "watany-dev"
}
