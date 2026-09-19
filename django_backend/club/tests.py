from datetime import datetime, time, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from django.test import override_settings

from django.contrib.auth.models import User

from .models import Order, PlayingSession, Resource, SessionResourceUsage
from .views import invoice_discount, paid_sales, report_date_for


class InvoiceDiscountTests(TestCase):
    def test_percentage_discount_is_converted_to_a_money_amount(self):
        amount, discount_type, value, reason = invoice_discount(
            {"discountType": "percentage", "discountValue": 12.5, "discountReason": "Member"},
            Decimal("64.50"),
        )
        self.assertEqual(amount, Decimal("8.06"))
        self.assertEqual(discount_type, "percentage")
        self.assertEqual(value, Decimal("12.50"))
        self.assertEqual(reason, "Member")

    def test_fixed_discount_remains_backward_compatible(self):
        amount, discount_type, value, _ = invoice_discount(
            {"discountAmount": 3, "discountReason": "Offer"}, Decimal("10.00")
        )
        self.assertEqual((amount, discount_type, value), (Decimal("3.00"), "amount", Decimal("3.00")))


class PlayingSessionBillingTests(TestCase):
    def setUp(self):
        self.resource = Resource.objects.create(
            name="Test Table", kind="snooker", hourly_rate=Decimal("10.00")
        )

    def session_for_duration(self, seconds):
        ended_at = timezone.now()
        session = PlayingSession.objects.create(
            resource=self.resource, mode="open", ended_at=ended_at
        )
        PlayingSession.objects.filter(pk=session.pk).update(
            started_at=ended_at - timedelta(seconds=seconds)
        )
        session.refresh_from_db()
        return session

    def test_duration_is_rounded_up_to_the_next_half_hour(self):
        cases = [
            (1, 30 * 60, Decimal("5.00")),
            (30 * 60, 30 * 60, Decimal("5.00")),
            (30 * 60 + 1, 60 * 60, Decimal("10.00")),
            (60 * 60 + 1, 90 * 60, Decimal("15.00")),
        ]

        for elapsed_seconds, billed_seconds, total in cases:
            with self.subTest(elapsed_seconds=elapsed_seconds):
                session = self.session_for_duration(elapsed_seconds)
                self.assertEqual(session.billed_seconds, billed_seconds)
                self.assertEqual(session.total, total)

    def test_changed_resource_has_a_separate_rate_and_bill_line(self):
        second_resource = Resource.objects.create(
            name="Second Table", kind="billiards", hourly_rate=Decimal("20.00")
        )
        ended_at = timezone.now()
        session = PlayingSession.objects.create(
            resource=second_resource, mode="open", ended_at=ended_at
        )
        SessionResourceUsage.objects.create(
            session=session,
            resource=self.resource,
            started_at=ended_at - timedelta(minutes=61),
            ended_at=ended_at - timedelta(minutes=31),
            hourly_rate=Decimal("10.00"),
        )
        SessionResourceUsage.objects.create(
            session=session,
            resource=second_resource,
            started_at=ended_at - timedelta(minutes=31),
            ended_at=ended_at,
            hourly_rate=Decimal("20.00"),
        )
        self.assertEqual(session.total, Decimal("25.00"))


class ReportDayTests(TestCase):
    def aware(self, day, clock):
        return timezone.make_aware(datetime.combine(day, clock))

    def test_report_date_uses_4pm_to_next_day_noon(self):
        day = timezone.localdate()
        self.assertEqual(report_date_for(self.aware(day, time(16))), day)
        self.assertEqual(report_date_for(self.aware(day + timedelta(days=1), time(11, 59))), day)
        self.assertIsNone(report_date_for(self.aware(day + timedelta(days=1), time(12))))
        self.assertIsNone(report_date_for(self.aware(day, time(15, 59))))

    def test_paid_sales_excludes_the_noon_to_4pm_gap(self):
        day = timezone.localdate()
        resource = Resource.objects.create(name="Report Table", kind="snooker", hourly_rate=Decimal("10"))
        session = PlayingSession.objects.create(
            resource=resource, mode="open", status="completed", payment_status="paid", payment_method="cash"
        )
        PlayingSession.objects.filter(pk=session.pk).update(ended_at=self.aware(day, time(16)))
        included_order = Order.objects.create(status="paid", payment_method="cash")
        excluded_order = Order.objects.create(status="paid", payment_method="cash")
        Order.objects.filter(pk=included_order.pk).update(created_at=self.aware(day + timedelta(days=1), time(11, 59)))
        Order.objects.filter(pk=excluded_order.pk).update(created_at=self.aware(day + timedelta(days=1), time(12)))

        sessions, orders = paid_sales(day, day)
        self.assertEqual(list(sessions), [session])
        self.assertEqual(list(orders), [included_order])


@override_settings(CLUB_INITIAL_PASSWORD="InitialPass123!", CLUB_PASSWORD_RESET_CODE="recovery-code")
class AuthenticationTests(TestCase):
    def login(self, username="mazen", password="InitialPass123!"):
        return self.client.post(
            "/api/auth/login",
            data={"username": username, "password": password},
            content_type="application/json",
        )

    def test_only_the_three_club_accounts_can_log_in(self):
        self.assertEqual(self.login("other").status_code, 401)
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["mustChangePassword"])
        self.assertTrue(User.objects.filter(username="mazen", is_superuser=True).exists())
        self.assertEqual(self.login("ahmed").json()["role"], "super_admin")
        self.assertFalse(User.objects.get(username="yazan").is_superuser)
        self.assertEqual(self.login("yazan").json()["role"], "staff")

    def test_first_login_blocks_operational_api_until_password_changes(self):
        self.login()
        self.assertEqual(self.client.get("/api/dashboard").status_code, 403)
        response = self.client.post(
            "/api/auth/change-password",
            data={"currentPassword": "InitialPass123!", "newPassword": "NewPass123!"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["mustChangePassword"])
        self.assertEqual(self.client.get("/api/dashboard").status_code, 200)
        self.assertEqual(self.client.get("/api/reports/audit").status_code, 200)

    def test_yazan_cannot_access_reports_or_change_settings(self):
        self.login("yazan")
        self.client.post(
            "/api/auth/change-password",
            data={"currentPassword": "InitialPass123!", "newPassword": "NewPass123!"},
            content_type="application/json",
        )
        self.assertEqual(self.client.get("/api/reports/audit").status_code, 403)
        self.assertEqual(
            self.client.post(
                "/api/resources",
                data={"name": "Unauthorized", "kind": "snooker", "hourlyRate": 5},
                content_type="application/json",
            ).status_code,
            403,
        )

    def test_recovery_code_resets_a_password(self):
        self.login("ahmed")
        response = self.client.post(
            "/api/auth/reset-password",
            data={"username": "ahmed", "recoveryCode": "recovery-code", "newPassword": "ResetPass123!"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.client.post("/api/auth/logout")
        self.assertEqual(self.login("ahmed", "ResetPass123!").status_code, 200)
