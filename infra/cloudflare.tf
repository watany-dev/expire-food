resource "cloudflare_d1_database" "main" {
  account_id = var.cloudflare_account_id
  name       = "expire-food"

  # API が既定値を返すので、書かないと plan のたびに差分が出る
  read_replication = {
    mode = "disabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}

data "cloudflare_account_api_token_permission_groups_list" "account" {
  account_id = var.cloudflare_account_id
  scope      = "com.cloudflare.api.account"
}

locals {
  permission_group_ids = { for g in data.cloudflare_account_api_token_permission_groups_list.account.result : g.name => g.id }
}

# deploy.yml の wrangler が使う。対象アカウントに限定し、Workers / D1 / Workers AI の編集だけ
resource "cloudflare_account_token" "deploy" {
  account_id = var.cloudflare_account_id
  name       = "expire-food deploy (GitHub Actions)"

  policies = [{
    effect = "allow"
    permission_groups = [
      for name in ["Workers Scripts Write", "D1 Write", "Workers AI Write"] : { id = local.permission_group_ids[name] }
    ]
    resources = jsonencode({ "com.cloudflare.api.account.${var.cloudflare_account_id}" = "*" })
  }]
}
