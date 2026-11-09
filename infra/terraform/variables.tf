variable "docker_host" {
  description = "Endereço do daemon Docker. No Windows (Docker Desktop) use npipe:////./pipe/docker_engine."
  type        = string
  default     = null
}

variable "prefix" {
  description = "Prefixo dos recursos, para não colidir com os containers do Compose."
  type        = string
  default     = "fraudradar-tf"
}

variable "postgres_user" {
  type    = string
  default = "fraudradar"
}

variable "postgres_password" {
  type      = string
  default   = "fraudradar"
  sensitive = true
}

variable "postgres_db" {
  type    = string
  default = "fraudradar"
}

variable "db_port" {
  type    = number
  default = 5432
}

variable "api_port" {
  type    = number
  default = 8000
}

variable "web_port" {
  type    = number
  default = 3000
}

variable "llm_provider" {
  description = "Provedor do LLM: gemini (o do time), openai ou anthropic."
  type        = string
  default     = "gemini"
}

# A API valida o login dos analistas com a chave pública deste projeto Supabase.
variable "supabase_url" {
  type    = string
  default = ""
}

variable "gemini_api_key" {
  description = "Chave do Gemini (Google AI Studio). Só a API recebe."
  type        = string
  default     = ""
  sensitive   = true
}

variable "openai_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "anthropic_api_key" {
  type      = string
  default   = ""
  sensitive = true
}
