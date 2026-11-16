variable "oci_core_instance--source_details-source_id--export_fraudradar-server" { default = "ocid1.image.oc1.sa-saopaulo-1.aaaaaaaayi5qxic7k465azijw3tlttnedjbncgrzfh4iqsyjm62m3x2spacq" }
variable "availability_domain--kZpD-SA-SAOPAULO-1-AD-1" { default = "kZpD:SA-SAOPAULO-1-AD-1" }
variable "fault_domain--FAULT-DOMAIN-2" { default = "FAULT-DOMAIN-2" }
variable "region" { default = "sa-saopaulo-1" }
variable "compartment_ocid" { default = "ocid1.tenancy.oc1..aaaaaaaanncvg5pvjlneitak2mxmb74ifrsn7j5pnzvrtvngb3dhpx2uq5na" }

variable "ssh_public_key_path" {
  description = "Caminho local para o arquivo de chave SSH publica."
  type        = string
}
