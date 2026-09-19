from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("club", "0013_invoice_notes")]

    operations = [
        migrations.CreateModel(
            name="SessionResourceUsage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("started_at", models.DateTimeField()),
                ("ended_at", models.DateTimeField(blank=True, null=True)),
                ("hourly_rate", models.DecimalField(decimal_places=2, max_digits=10)),
                ("resource", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="session_usages", to="club.resource")),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="resource_usages", to="club.playingsession")),
            ],
            options={"ordering": ["started_at", "id"]},
        ),
    ]
