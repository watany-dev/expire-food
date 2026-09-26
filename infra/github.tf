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

resource "github_repository_ruleset" "main" {
  repository  = local.repository
  name        = "main"
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  rules {
    deletion         = true
    non_fast_forward = true

    pull_request {
      # 自分の PR は自分で承認できないため 0。マージできるのは write 権限を持つ人だけなので、collaborator を足すときに 1 へ戻す
      required_approving_review_count   = 0
      dismiss_stale_reviews_on_push     = true
      require_code_owner_review         = false
      require_last_push_approval        = false
      required_review_thread_resolution = true
      allowed_merge_methods             = ["merge", "squash", "rebase"]
    }

    # CI のジョブ名（name:）を変えたらここも揃える
    required_status_checks {
      strict_required_status_checks_policy = false
      do_not_enforce_on_create             = false

      dynamic "required_check" {
        for_each = [
          "check / test / build",
          "knip (unused files / deps / exports)",
          "semgrep (SAST)",
          "checkov (Terraform)",
          "lighthouse (mobile, perf / a11y / Core Web Vitals)",
          "e2e (Playwright, iPhone / Pixel)",
          "zghalint (workflow lint)",
          "analyze (javascript-typescript)",
          "analyze (actions)",
        ]
        content {
          context        = required_check.value
          integration_id = 15368 # GitHub Actions
        }
      }
    }
  }
}
