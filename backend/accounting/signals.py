from django.db.models.signals import post_save
from django.dispatch import receiver

from core.models import Tenant
from .services import AccountingService


@receiver(post_save, sender=Tenant)
def seed_tenant_chart(sender, instance, created, **kwargs):
    if created:
        AccountingService.ensure_chart(instance)
