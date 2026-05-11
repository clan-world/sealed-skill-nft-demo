output "public_dns" {
  value = aws_instance.demo.public_dns
}

output "web_url" {
  value = "http://${aws_instance.demo.public_dns}:5173"
}

output "api_url" {
  value = "http://${aws_instance.demo.public_dns}:8787"
}
