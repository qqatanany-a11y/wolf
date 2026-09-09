from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("club", "0007_accountsecurity"),
    ]

    operations = [
        migrations.AddField(
            model_name="playingsession",
            name="created_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name="created_playing_sessions", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="playingsession",
            name="completed_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name="completed_playing_sessions", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="order",
            name="created_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name="created_orders", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="order",
            name="paid_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name="paid_orders", to=settings.AUTH_USER_MODEL),
        ),
    ]
