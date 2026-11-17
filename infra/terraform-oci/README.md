# FraudRadar - Terraform Oracle Cloud Infrastructure

## Objetivo

Documentar e versionar a infraestrutura Oracle Cloud utilizada
na implantacao do FraudRadar para o bootcamp da TCS.

## Infraestrutura

- Regiao: sa-saopaulo-1 (Sao Paulo)
- VM: fraudradar-server
- Shape: VM.Standard.E5.Flex
- CPU: 2 OCPUs
- RAM: 24 GB
- Sistema: Ubuntu 24.04
- Boot volume: 100 GB
- VCN: fraudradar-vcn
- Subnets publica e privada
- Internet Gateway, NAT Gateway e Service Gateway
- Tabelas de rotas e listas de seguranca

## Ferramentas

- Terraform CLI 1.5.7
- Provider oracle/oci 9.13.0
- Oracle Cloud Resource Manager

## Origem da configuracao

A infraestrutura foi criada inicialmente no console Oracle Cloud.

Posteriormente, o Resource Discovery gerou a configuracao
Terraform dos recursos existentes.

A Stack no Oracle Resource Manager chama-se:

fraudradar-infrastructure

## Organizacao do repositorio

infra/terraform/
  Terraform original da equipe, baseado no provider Docker.

infra/terraform-oci/
  Terraform da infraestrutura Oracle Cloud.

Os dois diretorios sao independentes.

## Arquivos

- core.tf: recursos de computacao e rede
- vars.tf: variaveis da infraestrutura
- provider.tf: configuracao do provider OCI
- versions.tf: versoes do Terraform e provider
- .terraform.lock.hcl: dependencias fixadas
- terraform.tfvars.example: modelo das variaveis sem valor padrao

## Seguranca

Nao versionar:

- Chaves privadas SSH
- Credenciais Oracle Cloud
- Arquivos terraform.tfstate
- Arquivos .tfvars com informacoes sensiveis
- Diretorio .terraform/
- Backups .bak

A chave SSH publica e parametrizada pela variavel
ssh_public_key_path.

O OCID do compartimento (compartment_ocid) nao tem valor
padrao, porque identifica a conta e o repositorio e publico.
O Resource Manager preenche essa variavel sozinho. No
Terraform local, copie terraform.tfvars.example para
terraform.tfvars (fora do git) e preencha.

Os identificadores OCI utilizados na configuracao podem
ser especificos da conta e regiao de origem.

## Estado atual

A configuracao foi formatada e validada localmente.

O estado original dos recursos descobertos pertence
a Stack do Oracle Resource Manager.

ATENCAO:

Este diretorio nao esta configurado para utilizar
automaticamente o estado remoto da Stack Oracle.

Nao executar terraform apply ou terraform destroy
sem configurar corretamente o gerenciamento do estado,
a autenticacao e revisar o plano de alteracoes.

A validacao de sintaxe nao garante um plano sem mudancas.

## Proximas etapas

1. Revisar os recursos e identificadores exportados.
2. Configurar autenticacao segura com Oracle Cloud.
3. Definir a estrategia de gerenciamento do estado.
4. Validar um plano sem recriacao de recursos existentes.
5. Documentar o deploy da aplicacao FraudRadar.

## Custos

A VM AMD E5.Flex utiliza creditos promocionais do
Oracle Cloud Free Trial.

Ela nao e um recurso Always Free.

O encerramento do periodo promocional exige planejamento
de backup, migracao ou desativacao dos recursos pagos.
