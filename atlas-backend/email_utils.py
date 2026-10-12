import os
import smtplib
import ssl
from email.message import EmailMessage
from dotenv import dotenv_values
from typing import Tuple


def _load_config():
    """Load configuration fresh each call so .env edits apply without restart."""
    cfg = dotenv_values('.env')
    # Support both FRONTEND_BASE_URL and legacy FRONTEND_URL
    frontend_url = cfg.get('FRONTEND_BASE_URL') or cfg.get('FRONTEND_URL') or 'http://localhost:3000'
    smtp_host = cfg.get('SMTP_HOST')
    smtp_port = cfg.get('SMTP_PORT')
    smtp_user = cfg.get('SMTP_USER')
    smtp_pass = cfg.get('SMTP_PASS')
    mail_from_raw = cfg.get('MAIL_FROM') or smtp_user

    # Normalize MAIL_FROM: allow patterns like "Name email@example.com"
    mail_from = mail_from_raw
    if mail_from_raw and '@' in mail_from_raw and '<' not in mail_from_raw and '>' not in mail_from_raw:
        # If it contains a space and an email, convert to "Display <email>"
        parts = mail_from_raw.rsplit(' ', 1)
        if len(parts) == 2 and '@' in parts[1]:
            mail_from = f"{parts[0]} <{parts[1]}>"

    return {
        'SMTP_HOST': smtp_host,
        'SMTP_PORT': smtp_port,
        'SMTP_USER': smtp_user,
        'SMTP_PASS': smtp_pass,
        'MAIL_FROM': mail_from,
        'FRONTEND_BASE_URL': frontend_url,
    }


def send_password_reset(email: str, raw_token: str) -> Tuple[bool, str]:
    """Send a password reset email. Returns (success, message).

    Falls back to console logging if SMTP config is incomplete.
    Dynamically reloads config for each call.
    """
    if not email:
        return False, 'Missing destination email'

    cfg = _load_config()
    smtp_host = cfg['SMTP_HOST']
    smtp_port = cfg['SMTP_PORT']
    smtp_user = cfg['SMTP_USER']
    smtp_pass = cfg['SMTP_PASS']
    mail_from = cfg['MAIL_FROM']
    frontend_base = cfg['FRONTEND_BASE_URL']

    reset_link = f"{frontend_base}/reset-password?token={raw_token}&email={email}"

    # Simulation path if any critical value missing
    if not (smtp_host and smtp_port and smtp_user and smtp_pass):
        print(
            f"[EMAIL SIMULATION] Missing SMTP config -> host={smtp_host} port={smtp_port} user={smtp_user} pass={'SET' if smtp_pass else 'MISSING'}\n"
            f"To: {email}\nSubject: Password Reset\nLink: {reset_link}"
        )
        return True, 'Simulated email logged (SMTP not configured)'

    try:
        port_int = int(smtp_port)
    except ValueError:
        return False, 'Invalid SMTP_PORT'

    subject = 'Password Reset Instructions'
    body = (
        'You requested a password reset.\n\n'
        f'Click the link below (or paste into your browser):\n{reset_link}\n\n'
        'If you did not request this, you can ignore this email.'
    )

    msg = EmailMessage()
    msg['From'] = mail_from or smtp_user
    msg['To'] = email
    msg['Subject'] = subject
    msg.set_content(body)

    # Heuristic warning for likely wrong Gmail password (app passwords are 16 chars)
    if smtp_host and 'gmail' in smtp_host.lower() and smtp_pass and len(smtp_pass.strip()) < 12:
        #print("[EMAIL WARNING] SMTP_PASS looks short for a Gmail App Password (expected 16 chars). Auth may fail.")
        pass

    try:
        if port_int == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(smtp_host, port_int, context=context, timeout=10) as server:
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, port_int, timeout=10) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()  # Re-identify after STARTTLS
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
        print(f"[EMAIL SENT] Password reset email delivered to {email}")
        return True, 'Password reset email sent'
    except Exception as e:
        print(f"[EMAIL ERROR] Failed to send reset email to {email}: {e}")
        return False, 'Failed to send reset email'
