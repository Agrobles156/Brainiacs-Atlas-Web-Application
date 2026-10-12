import re
import time
from enum import Enum
from datetime import datetime, timedelta, timezone
from werkzeug.security import check_password_hash


class PasswordStrength(Enum):
    WEAK = 1
    FAIR = 2
    GOOD = 3
    STRONG = 4


class PasswordPolicy:
    def __init__(self):
        self.min_length = 8
        self.max_failed_attempts = 5
        self.lockout_duration = 1800
        self.password_history_limit = 3

    def validate_complexity(self, password):
        """
        Validate password complexity requirements.
        Requirements:
        - Minimum 8 characters
        - At least one uppercase letter
        - At least one lowercase letter
        - At least one number
        
        Returns (valid: bool, message: str)
        """
        if not password:
            return False, "Password is required"

        if len(password) < self.min_length:
            return False, f"Password must be at least {self.min_length} characters long"

        if not re.search(r'[A-Z]', password):
            return False, "Password must contain at least one uppercase letter"

        if not re.search(r'[a-z]', password):
            return False, "Password must contain at least one lowercase letter"

        if not re.search(r'[0-9]', password):
            return False, "Password must contain at least one number"

        return True, "Password meets complexity requirements"

    def calculate_strength(self, password):
        """
        Calculate password strength score.
        Returns (strength: PasswordStrength, score: int)
        """
        score = 0

        if len(password) >= self.min_length:
            score += 1
        if len(password) >= 12:
            score += 1
        if len(password) >= 16:
            score += 1

        if re.search(r'[A-Z]', password):
            score += 1
        if re.search(r'[a-z]', password):
            score += 1
        if re.search(r'[0-9]', password):
            score += 1
        if re.search(r'[!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|`~]', password):
            score += 1

        if score <= 2:
            return PasswordStrength.WEAK, score
        elif score <= 4:
            return PasswordStrength.FAIR, score
        elif score <= 6:
            return PasswordStrength.GOOD, score
        else:
            return PasswordStrength.STRONG, score

    def check_password_history(self, new_password, password_history):
        """
        Check if new password has been used before (in password history).
        password_history: list of previously hashed passwords
        
        Returns (allowed: bool, message: str)
        """
        if not password_history:
            return True, "No password history to check"

        for old_hash in password_history:
            if check_password_hash(old_hash, new_password):
                return False, f"Password was recently used. Cannot reuse last {self.password_history_limit} passwords"

        return True, "Password not in history"

    def is_account_locked(self, failed_login_attempts, failed_login_timestamp):
        """
        Check if account is currently locked due to failed login attempts.
        
        Returns (locked: bool, message: str, time_remaining: int or None)
        """
        if not failed_login_attempts or failed_login_attempts < self.max_failed_attempts:
            return False, "", None

        if not failed_login_timestamp:
            return False, "", None

        try:
            last_attempt_time = datetime.fromisoformat(failed_login_timestamp)
        except (ValueError, TypeError):
            return False, "", None

        current_time = datetime.now(timezone.utc)
        lockout_start = last_attempt_time
        lockout_end = lockout_start + timedelta(seconds=self.lockout_duration)

        if current_time < lockout_end:
            time_remaining = int((lockout_end - current_time).total_seconds())
            return True, f"Account locked due to too many failed login attempts. Try again in {time_remaining} seconds", time_remaining

        return False, "", None

    def record_failed_login(self, current_attempts, current_timestamp):
        """
        Record a failed login attempt and return updated attempt count and timestamp.
        
        Returns (updated_attempts: int, updated_timestamp: str)
        """
        current_time = datetime.now(timezone.utc)

        if current_timestamp:
            try:
                last_attempt_time = datetime.fromisoformat(current_timestamp)
                time_since_last = (current_time - last_attempt_time).total_seconds()

                if time_since_last > self.lockout_duration:
                    return 1, current_time.isoformat()

            except (ValueError, TypeError):
                pass

        updated_attempts = (current_attempts or 0) + 1
        return updated_attempts, current_time.isoformat()

    def reset_failed_login(self):
        """
        Reset failed login attempts and timestamp.
        
        Returns (reset_attempts: int, reset_timestamp: None)
        """
        return 0, None


password_policy = PasswordPolicy()
