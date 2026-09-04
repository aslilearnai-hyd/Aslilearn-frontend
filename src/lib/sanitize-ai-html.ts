import DOMPurify from 'dompurify';

// Links created from AI content must not retain access to the opener window.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const element = node as Element;
  if (element.getAttribute?.('target') === '_blank') {
    element.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Sanitize AI/markdown HTML before dangerouslySetInnerHTML. */
export function sanitizeAiHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['class', 'target', 'rel'],
  });
}
