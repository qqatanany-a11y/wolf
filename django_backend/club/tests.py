from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

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
