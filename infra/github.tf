data "github_user" "me" {
  username = ""
}

resource "github_repository_environment" "production" {
  repository  = local.repository
  environment = "production"

  reviewers {
    users = [data.github_user.me.id]
  }

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "main" {
  repository     = local.repository
  environment    = github_repository_environment.production.environment
  branch_pattern = "main"
}

resource "github_actions_environment_secret" "cloudflare_api_token" {
  repository  = local.repository
  environment = github_repository_environment.production.environment
  secret_name = "CLOUDFLARE_API_TOKEN"
  value       = cloudflare_account_token.deploy.value
}

# ジョブの if から読むのでリポジトリ変数にする（ADR 0005）。これを作った時点から main への push がデプロイになる
resource "github_actions_variable" "cloudflare_account_id" {
  repository    = local.repository
  variable_name = "CLOUDFLARE_ACCOUNT_ID"
  value         = var.cloudflare_account_id
}
