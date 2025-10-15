/**
 * HTML sanitizer for untrusted content (email previews, inbound Gmail HTML).
 * Strips scripts, event handlers, and dangerous attributes.
 */
import DOMPurify from 'isomorphic-dompurify'

const ALLOWED_TAGS = [
  'a', 'b', 'br', 'div', 'em', 'i', 'li', 'ol', 'p', 'pre',
  'span', 'strong', 'u', 'ul', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
]

const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'style']

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    ALLOW_DATA_ATTR: false,
  })
}

/**
 * Escape plain text then convert paragraphs/newlines to safe HTML.
 * Replaces the old toHtml in lib/gmail.ts which did NOT escape.
 */
function textToSafeHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  const paragraphs = escaped.split(/\n\n+/).filter((p) => p.trim().length > 0)
  return paragraphs
    .map((p) => `<p style="margin:0 0 16px 0">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}
