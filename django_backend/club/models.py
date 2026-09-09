from decimal import Decimal, ROUND_HALF_UP

from django.db import models
from django.conf import settings


class AccountSecurity(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    force_password_change = models.BooleanField(default=True)

    def __str__(self):
        return f"Security settings for {self.user.username}"


class AuditLog(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=120)
    subject = models.CharField(max_length=160)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Resource(models.Model):
    KIND_CHOICES = [
        ("snooker", "Snooker"),
        ("billiards", "Billiards"),
        ("playstation", "PlayStation"),
    ]

    name = models.CharField(max_length=80, unique=True)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["kind", "name"]


class PlayingSession(models.Model):
    MODE_CHOICES = [("open", "Open"), ("limited", "Limited")]
    STATUS_CHOICES = [
        ("active", "Active"),
        ("paused", "Paused"),
        ("completed", "Completed"),
        ("overdue", "Overdue"),
    ]
    PAYMENT_CHOICES = [("cash", "Cash"), ("cliq", "CliQ")]

    resource = models.ForeignKey(Resource, on_delete=models.PROTECT, related_name="sessions")
    mode = models.CharField(max_length=10, choices=MODE_CHOICES)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="active")
    started_at = models.DateTimeField(auto_now_add=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    paused_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    payment_status = models.CharField(
        max_length=10, choices=[("unpaid", "Unpaid"), ("paid", "Paid")], default="unpaid"
    )
    payment_method = models.CharField(max_length=10, choices=PAYMENT_CHOICES, null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="created_playing_sessions",
    )
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="completed_playing_sessions",
    )

    class Meta:
        ordering = ["-started_at"]

    @property
    def elapsed_seconds(self):
        from django.utils import timezone

        end = self.ended_at or self.paused_at or timezone.now()
        if self.mode == "limited" and self.ends_at:
            end = min(end, self.ends_at)
        return max(0, int((end - self.started_at).total_seconds()))

    @property
    def billed_seconds(self):
        half_hour_seconds = 30 * 60
        return max(
            half_hour_seconds,
            ((self.elapsed_seconds + half_hour_seconds - 1) // half_hour_seconds)
            * half_hour_seconds,
        )

    @property
    def total(self):
        return (Decimal(self.billed_seconds) / Decimal(3600) * self.resource.hourly_rate).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )


class Product(models.Model):
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=60)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category", "name"]


class Order(models.Model):
    PAYMENT_CHOICES = [("cash", "Cash"), ("cliq", "CliQ")]
    STATUS_CHOICES = [("open", "Open"), ("paid", "Paid")]

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="open")
    name = models.CharField(max_length=120, blank=True)
    payment_method = models.CharField(max_length=10, choices=PAYMENT_CHOICES, null=True, blank=True)
    session = models.ForeignKey(
        PlayingSession,
        on_delete=models.PROTECT,
        related_name="orders",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="created_orders",
    )
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="paid_orders",
    )

    @property
    def subtotal(self):
        return sum((item.line_total for item in self.items.all()), Decimal("0.00"))



from .models_order_items import OrderItem
