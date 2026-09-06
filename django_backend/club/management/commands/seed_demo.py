from decimal import Decimal

from django.core.management.base import BaseCommand

from club.models import Product, Resource


class Command(BaseCommand):
    help = "Seed the club with its 8 resources and starter cafeteria products."

    def handle(self, *args, **options):
        resources = [
            ("Snooker 01", "snooker", "8.00"),
            ("Snooker 02", "snooker", "8.00"),
            ("Snooker 03", "snooker", "8.00"),
            ("Billiards 01", "billiards", "6.00"),
            ("Billiards 02", "billiards", "6.00"),
            ("Billiards 03", "billiards", "6.00"),
            ("PlayStation 01", "playstation", "4.00"),
            ("PlayStation 02", "playstation", "4.00"),
        ]
        for name, kind, rate in resources:
            Resource.objects.get_or_create(
                name=name,
                defaults={"kind": kind, "hourly_rate": Decimal(rate)},
            )
        products = [
            ("Mineral Water", "Drinks", "0.75", "0.25"),
            ("Turkish Coffee", "Drinks", "1.50", "0.45"),
            ("Fresh Juice", "Drinks", "2.25", "0.80"),
            ("Chips", "Snacks", "1.00", "0.45"),
            ("Mixed Nuts", "Snacks", "2.00", "0.95"),
        ]
        for name, category, price, cost in products:
            Product.objects.get_or_create(
                name=name,
                defaults={
                    "category": category,
                    "price": Decimal(price),
                    "cost": Decimal(cost),
                },
            )
        self.stdout.write(self.style.SUCCESS("Club resources and cafeteria products are ready."))