from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("club", "0012_yazan_staff_role")]

    operations = [
        migrations.AddField(
            model_name="playingsession",
            name="notes",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="order",
            name="notes",
            field=models.TextField(blank=True),
        ),
    ]
