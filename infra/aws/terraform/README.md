# AWS Terraform

This creates one small EC2 host with Docker.

It is intentionally minimal and cheap.

## Create

```bash
terraform init
terraform apply \
  -var="ssh_key_name=YOUR_EXISTING_AWS_KEY_NAME" \
  -var="admin_cidr=YOUR_IP/32"
```

## Deploy app

From repo root:

```bash
infra/aws/deploy.sh ec2-user@PUBLIC_DNS
```

## Destroy

```bash
terraform destroy
```
