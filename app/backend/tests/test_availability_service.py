from datetime import time
import unittest

from app.services.availability_service import (
    AvailabilityInputs,
    compute_effective_availability_from_inputs,
)


class AvailabilityServiceTests(unittest.TestCase):
    def test_returns_true_when_all_conditions_match(self):
        inputs = AvailabilityInputs(
            status="active",
            manual_availability=True,
            schedule_enabled=True,
            start_time=time(8, 0),
            end_time=time(17, 0),
            has_active_time_off=False,
            current_time=time(10, 0),
        )
        self.assertTrue(compute_effective_availability_from_inputs(inputs))

    def test_returns_false_when_deactivated(self):
        inputs = AvailabilityInputs(
            status="deactivated",
            manual_availability=True,
            schedule_enabled=True,
            start_time=time(8, 0),
            end_time=time(17, 0),
            has_active_time_off=False,
            current_time=time(10, 0),
        )
        self.assertFalse(compute_effective_availability_from_inputs(inputs))

    def test_returns_false_when_manual_availability_disabled(self):
        inputs = AvailabilityInputs(
            status="active",
            manual_availability=False,
            schedule_enabled=True,
            start_time=time(8, 0),
            end_time=time(17, 0),
            has_active_time_off=False,
            current_time=time(10, 0),
        )
        self.assertFalse(compute_effective_availability_from_inputs(inputs))

    def test_returns_false_outside_shift_window(self):
        inputs = AvailabilityInputs(
            status="active",
            manual_availability=True,
            schedule_enabled=True,
            start_time=time(8, 0),
            end_time=time(17, 0),
            has_active_time_off=False,
            current_time=time(17, 0),
        )
        self.assertFalse(compute_effective_availability_from_inputs(inputs))

    def test_returns_false_when_on_time_off(self):
        inputs = AvailabilityInputs(
            status="active",
            manual_availability=True,
            schedule_enabled=True,
            start_time=time(8, 0),
            end_time=time(17, 0),
            has_active_time_off=True,
            current_time=time(10, 0),
        )
        self.assertFalse(compute_effective_availability_from_inputs(inputs))


if __name__ == "__main__":
    unittest.main()
