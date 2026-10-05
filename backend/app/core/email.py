import os
import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.core.config import settings


def send_smtp_email_sync(to_email: str, subject: str, body_html: str) -> bool:
    host = getattr(settings, "SMTP_HOST", None) or os.getenv("SMTP_HOST")
    port = int(getattr(settings, "SMTP_PORT", 465) or os.getenv("SMTP_PORT", 465))
    user = getattr(settings, "SMTP_USER", None) or os.getenv("SMTP_USER")
    password = getattr(settings, "SMTP_PASSWORD", None) or os.getenv("SMTP_PASSWORD")
    from_email = getattr(settings, "EMAILS_FROM_EMAIL", None) or os.getenv("EMAILS_FROM_EMAIL") or user
    from_name = getattr(settings, "EMAILS_FROM_NAME", None) or os.getenv("EMAILS_FROM_NAME") or "Project-Chain Security"

    if not host or not user or not password:
        print(f"⚠️ [SMTP WARNING] В файле .env не заданы SMTP_HOST, SMTP_USER или SMTP_PASSWORD. Письмо на {to_email} не может быть отправлено в реальный мир.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=15)
        else:
            server = smtplib.SMTP(host, port, timeout=15)
            server.starttls()

        server.login(user, password)
        server.sendmail(from_email, [to_email], msg.as_string())
        server.quit()
        print(f"✅ [SMTP] Письмо с OTP-кодом успешно отправлено на реальную почту {to_email} через {host}:{port}")
        return True
    except Exception as e:
        print(f"❌ [SMTP ERROR] Ошибка отправки письма через {host}:{port}: {e}")
        return False


async def send_otp_email(to_email: str, otp_code: str) -> bool:
    subject = f"Код подтверждения ProChain: {otp_code}"
    body_html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 20px; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <tr>
          <td align="center">
            <h1 style="color: #38bdf8; font-size: 24px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.5px;">Project-Chain</h1>
            <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 24px 0;">Система управления проектами</p>
          </td>
        </tr>
        <tr>
          <td>
            <p style="color: #e2e8f0; font-size: 14px; line-height: 1.5; margin: 0 0 16px 0;">Здравствуйте!</p>
            <p style="color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 0 0 24px 0;">Ваш одноразовый код для подтверждения регистрации или входа в систему:</p>
            <div style="background-color: #020617; border: 1px solid #0284c7; border-radius: 12px; padding: 18px; text-align: center; margin: 0 0 24px 0;">
              <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #38bdf8;">{otp_code}</span>
            </div>
            <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">Код действителен в течение <strong>10 минут</strong>. Если вы не запрашивали это действие, просто проигнорируйте письмо.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """
    return await asyncio.to_thread(send_smtp_email_sync, to_email, subject, body_html)