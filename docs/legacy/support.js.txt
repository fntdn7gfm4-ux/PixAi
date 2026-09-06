/*
 * support.js — minimal standalone runtime for the "Pixaí.dc.html" design-canvas
 * prototype export.
 *
 * The exported .dc.html file uses a small React-like component (a `Component`
 * class extending `DCLogic`, defined inside a <script type="text/x-dc"
 * data-dc-script> tag) plus a tiny templating syntax evaluated against the
 * object returned by `renderVals()`:
 *
 *   {{ expr }}                                text/attribute interpolation
 *   <sc-if value="{{ expr }}">...</sc-if>      conditional block
 *   <sc-for list="{{ arr }}" as="x">...</sc-for>  loop, binds `x` per item
 *   onClick="{{ expr }}"                       click handler (expr must
 *                                               resolve to a function)
 *
 * All expressions found in this export are plain dotted identifier paths
 * (e.g. `screenTitle`, `it.label`, `f.go`) — no operators — so a tiny
 * path-resolver is enough; no real expression parser is needed.
 *
 * This file re-implements that runtime from scratch so the prototype can run
 * as a plain static page (e.g. on GitHub Pages) without any proprietary
 * design-tool backend.
 */
(function () {
  'use strict';

  // ---- DCLogic base class -------------------------------------------------
  class DCLogic {
    constructor(props) {
      this.props = props || {};
      if (!this.state) this.state = {};
      this._render = null; // wired up after mount
    }
    setState(updater, callback) {
      const prevState = Object.assign({}, this.state);
      const partial = typeof updater === 'function' ? updater(this.state) : updater;
      this.state = Object.assign({}, this.state, partial);
      if (this._render) this._render();
      if (typeof this.componentDidUpdate === 'function') {
        this.componentDidUpdate(this.props, prevState);
      }
      if (typeof callback === 'function') callback();
    }
  }

  // ---- expression resolution ----------------------------------------------
  const EXPR_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

  function extractExpr(attrValue) {
    const m = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(attrValue || '');
    return m ? m[1] : null;
  }

  function resolvePath(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    const parts = path.split('.');
    let val = scope[parts[0]];
    for (let i = 1; i < parts.length && val != null; i++) val = val[parts[i]];
    return val;
  }

  function interpolate(str, scope) {
    return str.replace(EXPR_RE, (_, expr) => {
      const val = resolvePath(expr, scope);
      return val === undefined || val === null ? '' : String(val);
    });
  }

  // ---- template walker ------------------------------------------------------
  // Walks a cloned template tree, resolving sc-if / sc-for / {{ }} bindings
  // against `scope`, and returns the list of nodes that should replace `node`
  // in its parent (a normal element/text returns itself; sc-if/sc-for expand
  // or vanish).
  function processNode(node, scope) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.indexOf('{{') !== -1) {
        node.textContent = interpolate(node.textContent, scope);
      }
      return [node];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [node];

    const tag = node.tagName.toLowerCase();

    if (tag === 'sc-if') {
      const expr = extractExpr(node.getAttribute('value'));
      const truthy = !!resolvePath(expr, scope);
      if (!truthy) return [];
      return expandChildren(node, scope);
    }

    if (tag === 'sc-for') {
      const listExpr = extractExpr(node.getAttribute('list'));
      const arr = resolvePath(listExpr, scope) || [];
      const asName = node.getAttribute('as');
      const template = Array.from(node.childNodes);
      let out = [];
      arr.forEach((item) => {
        const childScope = Object.create(scope);
        childScope[asName] = item;
        template.forEach((tpl) => {
          out = out.concat(processNode(tpl.cloneNode(true), childScope));
        });
      });
      return out;
    }

    // normal element: interpolate attributes, wire click handlers.
    // Snapshot name/value pairs up front — mutating node.style live-updates
    // the "style" Attr node, so processing attributes off the live
    // NamedNodeMap can make a later attribute's `.value` reflect an
    // already-mutated state instead of the original template text.
    const attrPairs = Array.from(node.attributes).map((a) => [a.name, a.value]);
    attrPairs.forEach(([name, value]) => {
      if (value.indexOf('{{') === -1) return;
      if (name === 'onclick') {
        const expr = extractExpr(value);
        const fn = expr ? resolvePath(expr, scope) : null;
        node.removeAttribute('onclick');
        if (typeof fn === 'function') node.addEventListener('click', fn);
      } else {
        node.setAttribute(name, interpolate(value, scope));
      }
    });

    const newChildren = [];
    Array.from(node.childNodes).forEach((child) => {
      newChildren.push.apply(newChildren, processNode(child, scope));
    });
    while (node.firstChild) node.removeChild(node.firstChild);
    newChildren.forEach((child) => node.appendChild(child));

    return [node];
  }

  function expandChildren(node, scope) {
    let out = [];
    Array.from(node.childNodes).forEach((child) => {
      out = out.concat(processNode(child, scope));
    });
    return out;
  }

  // ---- boot -----------------------------------------------------------------
  function boot() {
    // Safety net: `<x-dc>` is an unrecognized element (defaults to
    // display:inline) and the prototype's layout assumes it behaves like a
    // full-height block.
    const resetStyle = document.createElement('style');
    resetStyle.textContent = 'html,body{height:100%}x-dc{display:block;height:100%}';
    document.head.appendChild(resetStyle);

    const xdc = document.querySelector('x-dc');
    const scriptEl = document.querySelector('script[data-dc-script]');
    if (!xdc || !scriptEl) return;

    const helmet = xdc.querySelector('helmet');
    let mountPoint = Array.from(xdc.children).find((el) => el !== helmet);
    if (!mountPoint) return;
    const masterTemplate = mountPoint.cloneNode(true);

    // Parse the editor prop schema (data-props) into concrete default props.
    let props = {};
    try {
      const schema = JSON.parse(scriptEl.getAttribute('data-props') || '{}');
      Object.keys(schema).forEach((key) => {
        if (key.charAt(0) === '$') return; // editor-only meta (e.g. $preview)
        props[key] = schema[key].default;
      });
    } catch (e) {
      /* no props declared — fine, use defaults from the component itself */
    }

    // Real backend (Supabase): auth + Postgres. See config.js / README.
    const cfg = window.PIXAI_CONFIG || {};
    const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY
      && cfg.SUPABASE_URL.indexOf('COLE_AQUI') === -1
      && cfg.SUPABASE_ANON_KEY.indexOf('COLE_AQUI') === -1;
    if (!configured) {
      const warn = document.createElement('div');
      warn.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#101828;color:#fff;'
        + 'font:600 15px/1.6 Manrope,sans-serif;display:flex;align-items:center;justify-content:center;'
        + 'text-align:center;padding:40px';
      warn.innerHTML = '<div style="max-width:480px">'
        + '<div style="font:800 20px/1.3 Manrope,sans-serif;margin-bottom:14px">Backend não configurado</div>'
        + 'Edite <code>config.js</code> com a URL e a chave "anon public" do seu projeto Supabase '
        + '(depois de rodar <code>supabase/schema.sql</code>) para o login e cadastro funcionarem de verdade. '
        + 'Veja o README.'
        + '</div>';
      document.body.appendChild(warn);
      return;
    }
    const supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

    // The component class body is plain JS inside a non-executing
    // <script type="text/x-dc">; evaluate it ourselves with DCLogic and the
    // Supabase client in scope.
    const ComponentClass = new Function(
      'DCLogic', 'supabase',
      scriptEl.textContent + '\nreturn Component;'
    )(DCLogic, supabaseClient);
    const instance = new ComponentClass(props);

    function render() {
      const scope = instance.renderVals();
      const fresh = masterTemplate.cloneNode(true);
      const [processed] = processNode(fresh, scope);
      mountPoint.parentNode.replaceChild(processed, mountPoint);
      mountPoint = processed;
    }

    instance._render = render;
    render();
    if (typeof instance.componentDidMount === 'function') instance.componentDidMount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
