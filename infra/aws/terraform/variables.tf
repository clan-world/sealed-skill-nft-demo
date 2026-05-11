variable "aws_region" {
  description = "AWS region. Use a nearby cheap region."
  type        = string
  default     = "us-east-1"
}

variable "ssh_key_name" {
  description = "Existing AWS EC2 key pair name."
  type        = string
}

variable "admin_cidr" {
  description = "CIDR allowed to reach SSH, web, and API. Use your IP, for example 203.0.113.10/32."
  type        = string
}

variable "instance_type" {
  description = "Cheap demo instance. Use t3.small or t3.medium if dependency install is slow."
  type        = string
  default     = "t3.small"
}
