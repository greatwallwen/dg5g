/**
 * Interactive HTML iframe utilities ported from DGBook
 * (lib/generation/interactive-post-processor.ts + lib/utils/iframe.ts)
 *
 * Usage:
 *   const html = postProcessInteractiveHtml(rawHtml);  // inject KaTeX
 *   const safe = patchHtmlForIframe(html);             // iframe CSS
 *   <iframe srcDoc={safe} sandbox="allow-scripts allow-same-origin" />
 */

export function postProcessInteractiveHtml(html: string): string {
  let processed = convertLatexDelimiters(html);
  if (!processed.toLowerCase().includes('katex')) {
    processed = injectKatex(processed);
  }
  return processed;
}

function convertLatexDelimiters(html: string): string {
  const scriptBlocks: string[] = [];
  let processed = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (match) => {
    scriptBlocks.push(match);
    return `__SCRIPT_BLOCK_${scriptBlocks.length - 1}__`;
  });
  processed = processed.replace(/\$\$([^$]+)\$\$/g, '\\[$1\\]');
  processed = processed.replace(/\$([^$\n]+?)\$/g, '\\($1\\)');
  for (let i = 0; i < scriptBlocks.length; i++) {
    const placeholder = `__SCRIPT_BLOCK_${i}__`;
    const idx = processed.indexOf(placeholder);
    if (idx !== -1) {
      processed = processed.substring(0, idx) + scriptBlocks[i] + processed.substring(idx + placeholder.length);
    }
  }
  return processed;
}

function injectKatex(html: string): string {
  const katexInjection = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script>
document.addEventListener("DOMContentLoaded", function() {
    const katexOptions = {
        delimiters: [
            {left: '\\\\[', right: '\\\\]', display: true},
            {left: '\\\\(', right: '\\\\)', display: false},
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false}
        ],
        throwOnError: false, strict: false, trust: true
    };
    renderMathInElement(document.body, katexOptions);
});
</script>`;

  const headCloseIdx = html.indexOf('</head>');
  if (headCloseIdx !== -1) {
    return html.substring(0, headCloseIdx) + katexInjection + '\n</head>' + html.substring(headCloseIdx + 7);
  }
  const bodyCloseIdx = html.indexOf('</body>');
  if (bodyCloseIdx !== -1) {
    return html.substring(0, bodyCloseIdx) + katexInjection + '\n</body>' + html.substring(bodyCloseIdx + 7);
  }
  return html + katexInjection;
}

export function patchHtmlForIframe(html: string): string {
  const iframePatch = `<style data-iframe-patch>
  html, body {
    width: 100%; height: 100%; margin: 0; padding: 0;
    overflow-x: hidden; overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  body { min-height: 100vh; }
</style>
<script data-dgbook-bridge>
(function() {
  if (window.__DGBOOK_BRIDGE__) return;
  window.__DGBOOK_BRIDGE__ = true;

  var style = document.createElement('style');
  style.textContent =
    '.dgbook-iframe-highlight{outline:3px solid #0891B2!important;outline-offset:4px!important;box-shadow:0 0 0 6px rgba(8,145,178,.14)!important;transition:all .2s ease!important}' +
    '.dgbook-iframe-annotation{position:absolute;z-index:9999;max-width:220px;padding:8px 10px;border-radius:8px;background:#0F172A;color:#fff;font:12px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.22);pointer-events:none}';
  document.head.appendChild(style);

  function findTarget(target) {
    if (!target) return null;
    try {
      var direct = document.querySelector(target);
      if (direct) return direct;
    } catch (err) {}
    return document.getElementById(String(target).replace(/^#/, ''));
  }

  function highlight(target) {
    var el = findTarget(target);
    if (!el) return;
    el.classList.add('dgbook-iframe-highlight');
    if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function() { el.classList.remove('dgbook-iframe-highlight'); }, 2600);
  }

  function annotate(target, content) {
    var el = findTarget(target);
    if (!el || !content) return;
    var box = document.createElement('div');
    box.className = 'dgbook-iframe-annotation';
    box.textContent = String(content);
    document.body.appendChild(box);
    var rect = el.getBoundingClientRect();
    box.style.left = Math.max(8, rect.left + window.scrollX) + 'px';
    box.style.top = Math.max(8, rect.top + window.scrollY - box.offsetHeight - 10) + 'px';
    setTimeout(function() { box.remove(); }, 3600);
  }

  function setWidgetState(state) {
    if (!state || typeof state !== 'object') return;
    if (typeof window.dgbookSetState === 'function') {
      window.dgbookSetState(state);
    }
    window.dispatchEvent(new CustomEvent('dgbook:set-state', { detail: state }));
    Object.keys(state).forEach(function(key) {
      var value = state[key];
      var el = findTarget('[data-state-key="' + key + '"]') || findTarget('[name="' + key + '"]') || findTarget('#' + key);
      if (!el) return;
      if ('checked' in el && typeof value === 'boolean') el.checked = value;
      if ('value' in el && typeof value !== 'object') el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function reveal(target) {
    var el = findTarget(target);
    if (!el) return;
    el.hidden = false;
    el.removeAttribute('aria-hidden');
    el.style.display = '';
    el.style.visibility = 'visible';
    el.style.opacity = '1';
    highlight(target);
  }

  window.addEventListener('message', function(event) {
    var data = event.data || {};
    if (!data.type) return;
    if (data.type === 'HIGHLIGHT_ELEMENT') highlight(data.target);
    if (data.type === 'SET_WIDGET_STATE') setWidgetState(data.state);
    if (data.type === 'ANNOTATE_ELEMENT') annotate(data.target, data.content);
    if (data.type === 'REVEAL_ELEMENT') reveal(data.target);
  });
})();
</script>`;
  const headIdx = html.indexOf('<head>');
  if (headIdx !== -1) {
    return html.substring(0, headIdx + 6) + '\n' + iframePatch + html.substring(headIdx + 6);
  }
  const headWithAttrs = html.indexOf('<head ');
  if (headWithAttrs !== -1) {
    const closeAngle = html.indexOf('>', headWithAttrs);
    if (closeAngle !== -1) {
      const insertPos = closeAngle + 1;
      return html.substring(0, insertPos) + '\n' + iframePatch + html.substring(insertPos);
    }
  }
  return iframePatch + html;
}

/** One-pass LaTeX and iframe CSS preparation. */
export function prepareInteractiveHtml(rawHtml: string): string {
  return patchHtmlForIframe(postProcessInteractiveHtml(rawHtml));
}

