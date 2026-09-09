from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from django.test import override_settings

from django.contrib.auth.models import User

from .models import PlayingSession, Resource


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
