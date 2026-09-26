# wrangler.jsonc の d1_databases[0].database_id に書く
output "d1_database_id" {
  value = cloudflare_d1_database.main.id
}
