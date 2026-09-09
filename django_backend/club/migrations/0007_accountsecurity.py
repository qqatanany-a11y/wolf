from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("club", "0006_alter_playingsession_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="AccountSecurity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("force_password_change", models.BooleanField(default=True)),
                ("user", models.OneToOneField(on_delete=models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
