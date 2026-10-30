/**
 * The editing surface for documents: a local page (nothing is loaded from the network) with a
 * contentEditable area. The app's native toolbar drives it with `window.qb.cmd(...)` and it reports
 * changes back with postMessage. HTML is cleaned to the same small set of tags the web editor uses,
 * on load, on paste and before every save.
 */
export interface EditorLook {
  dir: 'rtl' | 'ltr';
  lang: string;
  bg: string;
  text: string;
  muted: string;
  accent: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  dyslexic: boolean;
  placeholder: string;
}

const css = (l: EditorLook) => `
  html,body{margin:0;padding:0;background:${l.bg};color:${l.text};}
  body{font-family:${l.dyslexic ? "'OpenDyslexic'," : ''}-apple-system,'Segoe UI',Roboto,'Noto Sans Arabic',Tahoma,sans-serif;
    font-size:${l.fontSize}px;line-height:${l.lineHeight};letter-spacing:${l.letterSpacing}px;-webkit-text-size-adjust:100%;}
  #ed{min-height:100vh;padding:16px 16px 120px;outline:none;box-sizing:border-box;word-wrap:break-word;}
  #ed:empty:before{content:attr(data-ph);color:${l.muted};}
  h1{font-size:1.6em;margin:.6em 0 .3em} h2{font-size:1.3em;margin:.6em 0 .3em} h3{font-size:1.1em}
  p{margin:.4em 0} blockquote{margin:.6em 0;padding:.2em 12px;border-inline-start:4px solid ${l.accent};color:${l.muted}}
  code,pre{font-family:ui-monospace,Menlo,monospace;background:rgba(127,127,127,.15);border-radius:4px;padding:0 4px}
  a{color:${l.accent}} ul,ol{padding-inline-start:1.4em}
`;

// Runs inside the page. Kept as plain ES5-ish code: it is injected as text.
const script = `
(function(){
  var ed = document.getElementById('ed');
  var ALLOWED = {P:1,H1:1,H2:1,H3:1,STRONG:1,B:1,EM:1,I:1,U:1,S:1,STRIKE:1,UL:1,OL:1,LI:1,BLOCKQUOTE:1,CODE:1,PRE:1,BR:1,A:1};
  function clean(root){
    var nodes = Array.prototype.slice.call(root.childNodes);
    nodes.forEach(function(n){
      if (n.nodeType === 3) return;
      if (n.nodeType !== 1) { n.remove(); return; }
      var tag = n.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT' || tag === 'EMBED' || tag === 'IMG' || tag === 'SVG' || tag === 'TEMPLATE') { n.remove(); return; }
      clean(n);
      if (!ALLOWED[tag]) {
        if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE') { var p = document.createElement('p'); var al = n.style && n.style.textAlign; if (al === 'left' || al === 'right' || al === 'center' || al === 'justify') p.style.textAlign = al; while (n.firstChild) p.appendChild(n.firstChild); n.replaceWith(p); return; }
        while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); return;
      }
      var align = n.style && n.style.textAlign;
      var href = tag === 'A' ? (n.getAttribute('href') || '') : '';
      Array.prototype.slice.call(n.attributes).forEach(function(a){ n.removeAttribute(a.name); });
      if (align === 'left' || align === 'right' || align === 'center' || align === 'justify') n.style.textAlign = align;
      if (tag === 'A') { if (/^https?:\\/\\//i.test(href)) n.setAttribute('href', href); else { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); } }
    });
    return root;
  }
  function sanitize(html){
    var doc = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html');
    return clean(doc.body.firstChild).innerHTML;
  }
  function post(msg){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  function state(){
    var q = function(c){ try { return document.queryCommandState(c); } catch(e){ return false; } };
    var block = ''; try { block = String(document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch(e){}
    post({ type:'state', bold:q('bold'), italic:q('italic'), underline:q('underline'), strike:q('strikeThrough'), ul:q('insertUnorderedList'), ol:q('insertOrderedList'), block:block });
  }
  var timer = null;
  function changed(){
    clearTimeout(timer);
    timer = setTimeout(function(){ post({ type:'change', html: sanitize(ed.innerHTML), text: ed.innerText }); }, 250);
  }
  ed.addEventListener('input', function(){ changed(); state(); });
  document.addEventListener('selectionchange', state);
  ed.addEventListener('paste', function(e){
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  ed.addEventListener('click', function(e){ var a = e.target.closest && e.target.closest('a'); if (a) e.preventDefault(); });
  window.qb = {
    set: function(html){ ed.innerHTML = sanitize(html) || '<p><br></p>'; },
    focus: function(){ ed.focus(); },
    cmd: function(name, value){
      ed.focus();
      if (name === 'h1' || name === 'h2' || name === 'p' || name === 'blockquote') {
        var cur = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
        document.execCommand('formatBlock', false, cur === name ? 'p' : name);
      } else if (name === 'link') {
        if (/^https?:\\/\\//i.test(value || '')) document.execCommand('createLink', false, value);
      } else document.execCommand(name, false, value || null);
      changed(); state();
    }
  };
  document.execCommand('defaultParagraphSeparator', false, 'p');
  post({ type:'ready' });
})();
true;
`;

export function editorHtml(look: EditorLook): string {
  const ph = look.placeholder.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="${look.lang}" dir="${look.dir}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<style>${css(look)}</style></head>
<body><div id="ed" contenteditable="true" data-ph="${ph}" role="textbox" aria-multiline="true"></div><script>${script}</script></body></html>`;
}
