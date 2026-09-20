from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("club", "0014_session_resource_usage")]

    operations = [
        migrations.CreateModel(
            name="InvoiceAdjustment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=10)),
                ("reason", models.CharField(max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="invoice_adjustments", to=settings.AUTH_USER_MODEL)),
                ("order", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="invoice_adjustments", to="club.order")),
                ("session", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="invoice_adjustments", to="club.playingsession")),
            ],
            options={"ordering": ["created_at", "id"]},
        ),
        migrations.AddConstraint(
            model_name="invoiceadjustment",
            constraint=models.CheckConstraint(
                condition=(
                    (models.Q(("session__isnull", False), ("order__isnull", True))
                    | models.Q(("session__isnull", True), ("order__isnull", False)))
                ),
                name="invoice_adjustment_has_one_invoice",
            ),
        ),
        migrations.AddConstraint(
            model_name="invoiceadjustment",
            constraint=models.CheckConstraint(
                condition=~models.Q(("amount", Decimal("0.00"))),
                name="invoice_adjustment_amount_not_zero",
            ),
        ),
    ]
