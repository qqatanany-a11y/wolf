from django.db import migrations


def set_yazan_as_staff(apps, schema_editor):
    User = apps.get_model("auth", "User")
    User.objects.filter(username="yazan").update(is_staff=True, is_superuser=False)


class Migration(migrations.Migration):
    dependencies = [
        ("club", "0011_discount_type_and_value"),
    ]

    operations = [
        migrations.RunPython(set_yazan_as_staff, migrations.RunPython.noop),
    ]
