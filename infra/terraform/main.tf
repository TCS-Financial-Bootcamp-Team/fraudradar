# Mesmo conjunto do docker-compose (db, api, web) via provider Docker. Sem nuvem.
# O worker é job em lote: roda pelo Compose (`docker compose run --rm worker`).

locals {
  raiz         = abspath("${path.module}/../..")
  database_url = "postgresql+psycopg://${var.postgres_user}:${var.postgres_password}@db:5432/${var.postgres_db}"
}

resource "docker_network" "rede" {
  name = "${var.prefixo}-rede"
}

resource "docker_volume" "pgdata" {
  name = "${var.prefixo}-pgdata"
}

resource "docker_image" "db" {
  name         = "pgvector/pgvector:pg17"
  keep_locally = true
}

resource "docker_image" "api" {
  name = "${var.prefixo}-api:local"

  build {
    context    = local.raiz
    dockerfile = "api/Dockerfile"
  }

  triggers = {
    codigo = sha1(join("", [for f in fileset(local.raiz, "{api,src,worker}/**/*.py") : filesha1("${local.raiz}/${f}")]))
    lock   = filesha1("${local.raiz}/uv.lock")
  }
}

resource "docker_image" "web" {
  name = "${var.prefixo}-web:local"

  build {
    context = "${local.raiz}/web"
    build_args = {
      NEXT_PUBLIC_API_URL = "http://localhost:${var.api_port}"
    }
  }

  triggers = {
    codigo = sha1(join("", [for f in fileset("${local.raiz}/web", "src/**") : filesha1("${local.raiz}/web/${f}")]))
    lock   = filesha1("${local.raiz}/web/pnpm-lock.yaml")
  }
}

resource "docker_container" "db" {
  name    = "${var.prefixo}-db"
  image   = docker_image.db.image_id
  restart = "unless-stopped"

  env = [
    "POSTGRES_USER=${var.postgres_user}",
    "POSTGRES_PASSWORD=${var.postgres_password}",
    "POSTGRES_DB=${var.postgres_db}",
  ]

  networks_advanced {
    name    = docker_network.rede.id
    aliases = ["db"]
  }

  ports {
    internal = 5432
    external = var.db_port
  }

  volumes {
    volume_name    = docker_volume.pgdata.name
    container_path = "/var/lib/postgresql/data"
  }

  volumes {
    host_path      = "${local.raiz}/db/init"
    container_path = "/docker-entrypoint-initdb.d"
    read_only      = true
  }

  healthcheck {
    test     = ["CMD-SHELL", "pg_isready -U ${var.postgres_user} -d ${var.postgres_db}"]
    interval = "5s"
    timeout  = "3s"
    retries  = 20
  }

  wait         = true
  wait_timeout = 120
}

resource "docker_container" "api" {
  name    = "${var.prefixo}-api"
  image   = docker_image.api.image_id
  restart = "unless-stopped"

  env = [
    "DATABASE_URL=${local.database_url}",
    "MODEL_DIR=/app/models",
    "LLM_PROVIDER=${var.llm_provider}",
    "OPENAI_API_KEY=${var.openai_api_key}",
    "ANTHROPIC_API_KEY=${var.anthropic_api_key}",
    "SUPABASE_URL=${var.supabase_url}",
  ]

  networks_advanced {
    name    = docker_network.rede.id
    aliases = ["api"]
  }

  ports {
    internal = 8000
    external = var.api_port
  }

  volumes {
    host_path      = "${local.raiz}/models"
    container_path = "/app/models"
    read_only      = true
  }

  depends_on = [docker_container.db]
}

resource "docker_container" "web" {
  name    = "${var.prefixo}-web"
  image   = docker_image.web.image_id
  restart = "unless-stopped"

  networks_advanced {
    name    = docker_network.rede.id
    aliases = ["web"]
  }

  ports {
    internal = 3000
    external = var.web_port
  }

  depends_on = [docker_container.api]
}
