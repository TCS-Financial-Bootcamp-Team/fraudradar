variable "oci_core_instance--source_details-source_id--export_fraudradar-server" { default = "ocid1.image.oc1.sa-saopaulo-1.aaaaaaaayi5qxic7k465azijw3tlttnedjbncgrzfh4iqsyjm62m3x2spacq" }
variable "availability_domain--kZpD-SA-SAOPAULO-1-AD-1" { default = "kZpD:SA-SAOPAULO-1-AD-1" }
variable "fault_domain--FAULT-DOMAIN-2" { default = "FAULT-DOMAIN-2" }
variable "region" { default = "sa-saopaulo-1" }

# Sem valor padrao: o OCID identifica a conta Oracle e o repositorio e publico.
# O Resource Manager preenche sozinho; no Terraform local, vai no terraform.tfvars
# (fora do git), como em terraform.tfvars.example.
variable "compartment_ocid" {
  description = "OCID do compartimento (ou da tenancy) onde ficam os recursos."
  type        = string
}

variable "ssh_public_key_path" {
  description = "Caminho local para o arquivo de chave SSH publica."
  type        = string
}
