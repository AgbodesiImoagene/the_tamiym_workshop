locals {
  tags = merge(
    {
      project    = var.project
      env        = var.environment
      managed_by = var.managed_by
      ticket     = var.ticket
    },
    var.extra_tags,
  )
}
