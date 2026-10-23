output "web_url" {
  value = "http://localhost:${var.web_port}"
}

output "api_url" {
  value = "http://localhost:${var.api_port}"
}

output "api_docs_url" {
  value = "http://localhost:${var.api_port}/docs"
}

output "rede" {
  value = docker_network.rede.name
}
