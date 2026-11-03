"""Outgoing email. Without SMTP settings letters go to the log only, so development needs no mail server."""

import logging
import smtplib
from email.message import EmailMessage

from ..config import get_settings

log = logging.getLogger("autowise.mail")
# Tests read the last letters from here.
sent: list[EmailMessage] = []


def send(to: str, subject: str, text: str) -> None:
    s = get_settings()
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.smtp_from, to, subject
    msg.set_content(text)
    sent.append(msg)
    del sent[:-50]
    if not s.smtp_host:
        log.warning("SMTP не налаштовано, лист не надіслано. Кому: %s. Тема: %s\n%s", to, subject, text)
        return
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
        if s.smtp_starttls:
            smtp.starttls()
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_password)
        smtp.send_message(msg)
