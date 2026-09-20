from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("club", "0016_invoice_soft_deletion")]

    operations = [
        migrations.AddField(
            model_name="playingsession",
            name="invoice_edited_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="invoice_edited_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
