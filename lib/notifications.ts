const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? ''

export async function sendTelegramNotification(message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    )
    return res.ok
  } catch {
    console.warn('Telegram notification failed')
    return false
  }
}

export function formatReplyNotification(companyName: string, contactEmail: string): string {
  return `📬 <b>New reply from ${companyName}</b>\n\nFrom: ${contactEmail}\n\nCheck your inbox to respond.`
}

export function formatOpenNotification(companyName: string): string {
  return `👁 <b>${companyName}</b> opened your application email.`
}
