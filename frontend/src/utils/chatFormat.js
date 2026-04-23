/**
 * Escape HTML, then render **bold** from model markdown-style output.
 * Newlines are preserved; use a wrapper with whitespace-pre-wrap.
 */
export function chatTextToHtml(raw) {
  if (raw == null || raw === '') return '';
  let s = String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
