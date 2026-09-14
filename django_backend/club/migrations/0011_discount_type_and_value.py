from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("club", "0010_invoice_discounts")]

    operations = [
        migrations.AddField(
            model_name="playingsession",
            name="discount_type",
            field=models.CharField(
                choices=[("amount", "Fixed amount"), ("percentage", "Percentage")],
                default="amount",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="playingsession",
            name="discount_value",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=10),
        ),
        migrations.AddField(
            model_name="order",
            name="discount_type",
            field=models.CharField(
                choices=[("amount", "Fixed amount"), ("percentage", "Percentage")],
                default="amount",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="discount_value",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=10),
        ),
    ]
