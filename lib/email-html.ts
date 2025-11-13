/**
 * HTML-escapes plain text and wraps each paragraph (split on blank lines) in a
 * styled <p> tag with <br> for single newlines. Used by the review preview and
 * the Gmail send path so the rendered email matches what the user reviews.
 */
export function plainTextToHtml(text: string, paragraphStyle = 'margin:0 0 14px 0;line-height:1.6;'): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return escaped
    .split(/\n\n+/)
    .map((para) => `<p style="${paragraphStyle}">${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}
