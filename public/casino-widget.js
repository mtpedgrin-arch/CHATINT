/**
 * Casino 463 — Embeddable Widget (TitanWidget Pattern)
 *
 * Creates DOM elements DIRECTLY on the page (no iframe for the widget).
 * Uses iframe ONLY for the 463.life background page.
 * This is the same architecture as ganaya.live's TitanWidget.
 *
 * Usage:
 *   <script src="https://SERVER/casino-widget.js"></script>
 *   <script>
 *     CasinoWidget.init({
 *       serverUrl: 'https://SERVER',    // optional (auto-detected from script src)
 *       siteUrl: 'https://463.life',    // optional (default)
 *       position: 'full',               // 'full' (default) or 'corner'
 *       autoLogin: { username: 'user', password: 'pass' },  // optional
 *     });
 *   </script>
 *
 * Architecture:
 *   ┌──────────────────────────────────────────┐
 *   │  HOST PAGE (any website)                 │
 *   │                                          │
 *   │  ┌────────────────────────────────────┐  │
 *   │  │ iframe (463.life) z:1              │  │  ← Background (only in 'full' mode)
 *   │  │ pointer-events: auto               │  │
 *   │  └────────────────────────────────────┘  │
 *   │                                          │
 *   │  ┌────────────────────────────────────┐  │
 *   │  │ div#casino463-root z:1000          │  │  ← Widget container
 *   │  │ pointer-events: NONE               │  │     (clicks pass through to bg)
 *   │  │                                    │  │
 *   │  │  ● Bubble (pointer-events: auto)   │  │  ← Chat toggle button
 *   │  │  ▣ Panel  (pointer-events: auto)   │  │  ← Chat window
 *   │  │  ▣ Banners, Popups, etc.           │  │
 *   │  └────────────────────────────────────┘  │
 *   └──────────────────────────────────────────┘
 */
(function() {
  'use strict';
  if (window.CasinoWidget) return;

  var CasinoWidget = {
    _config: null,
    _serverUrl: null,
    _bgIframe: null,
    _root: null,
    _styleEl: null,
    _loaded: false,

    /**
     * Initialize the widget
     * @param {Object} config
     * @param {string} [config.serverUrl]   - Casino server URL (auto-detected if omitted)
     * @param {string} [config.siteUrl]     - Background page URL (default: https://463.life)
     * @param {Object} [config.autoLogin]   - { username, password }
     * @param {string} [config.position]    - 'full' (default) or 'corner'
     */
    init: function(config) {
      config = config || {};
      this._config = config;

      // ── Auto-detect serverUrl from script src ──
      var serverUrl = config.serverUrl;
      if (!serverUrl) {
        var scripts = document.querySelectorAll('script[src]');
        for (var i = 0; i < scripts.length; i++) {
          if (scripts[i].src.indexOf('casino-widget') !== -1) {
            try { serverUrl = new URL(scripts[i].src).origin; } catch(e) {
              var a = document.createElement('a'); a.href = scripts[i].src;
              serverUrl = a.protocol + '//' + a.host;
            }
            break;
          }
        }
      }
      if (!serverUrl) serverUrl = window.location.origin;
      this._serverUrl = serverUrl;

      // ── Set globals BEFORE widget JS executes ──
      window.__casino463_serverUrl = serverUrl;
      window.__casino463_embedMode = true;
      window.__casino463_bgIframeId = 'casino463-bg-iframe';

      var position = config.position || 'full';
      var siteUrl = config.siteUrl || 'https://463.life';

      // ── 1. Create bg-iframe (463.life) — only in full mode ──
      if (position === 'full') {
        var bgIframe = document.createElement('iframe');
        bgIframe.id = 'casino463-bg-iframe';
        bgIframe.src = siteUrl;
        bgIframe.allow = 'autoplay';
        bgIframe.setAttribute('allowfullscreen', 'true');
        bgIframe.style.cssText = [
          'position:fixed',
          'top:0',
          'left:0',
          'width:100%',
          'height:100%',
          'border:none',
          'z-index:1',
          'pointer-events:auto',
          'transition:top 0.3s ease, height 0.3s ease'
        ].join(';') + ';';
        document.body.appendChild(bgIframe);
        this._bgIframe = bgIframe;
      }

      // ── 2. Fetch widget.html, extract CSS+HTML+JS, inject into DOM ──
      var self = this;
      var widgetUrl = serverUrl + '/widget';

      fetch(widgetUrl)
        .then(function(resp) {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.text();
        })
        .then(function(html) {
          self._injectWidget(html, config);
        })
        .catch(function(err) {
          console.error('%c[CasinoWidget]%c Failed to load widget: ' + err.message,
            'color:#e74c3c;font-weight:bold', 'color:inherit');
        });

      console.log('%c[CasinoWidget]%c Loading... (' + serverUrl + ')',
        'color:#D4A843;font-weight:bold', 'color:inherit');
      return this;
    },

    /**
     * Parse widget.html and inject CSS + HTML + JS into the page
     */
    _injectWidget: function(html, config) {
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');

      // ── Extract and inject CSS ──
      var styleEl = doc.querySelector('style');
      var css = styleEl ? styleEl.textContent : '';

      // Remove html,body rules (they'd affect the host page)
      css = css.replace(/html\s*,\s*body\s*\{[^}]+\}/g, '');

      // Inject CSS with root container styles
      var rootStyles = [
        '#casino463-root {',
        '  position: fixed;',
        '  top: 0; left: 0;',
        '  width: 100%; height: 100%;',
        '  z-index: 1000;',
        '  pointer-events: none;',
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
        '  font-size: 14px;',
        '  color: #e0e0e0;',
        '  -webkit-font-smoothing: antialiased;',
        '  -moz-osx-font-smoothing: grayscale;',
        '}'
      ].join('\n');

      this._styleEl = document.createElement('style');
      this._styleEl.id = 'casino463-styles';
      this._styleEl.textContent = rootStyles + '\n' + css;
      document.head.appendChild(this._styleEl);

      // ── Extract and inject HTML ──
      var root = document.createElement('div');
      root.id = 'casino463-root';

      // Collect body elements (skip bg-iframe, skip scripts)
      var bodyChildren = doc.body.children;
      var htmlParts = [];
      for (var i = 0; i < bodyChildren.length; i++) {
        var child = bodyChildren[i];
        if (child.tagName === 'SCRIPT') continue;        // skip all scripts
        if (child.id === 'bg-iframe') continue;           // skip bg-iframe (we created our own)
        htmlParts.push(child.outerHTML);
      }
      root.innerHTML = htmlParts.join('\n');
      document.body.appendChild(root);
      this._root = root;

      // ── Load Socket.IO from CDN, then execute widget JS ──
      var self = this;
      this._loadSocketIO(function() {
        self._executeWidgetJS(doc, config);
      });
    },

    /**
     * Load Socket.IO library from CDN
     */
    _loadSocketIO: function(callback) {
      // Already loaded?
      if (typeof io !== 'undefined') {
        callback();
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.8.0/socket.io.min.js';
      script.onload = callback;
      script.onerror = function() {
        console.error('[CasinoWidget] Failed to load Socket.IO from CDN');
      };
      document.head.appendChild(script);
    },

    /**
     * Extract and execute the widget's JavaScript
     */
    _executeWidgetJS: function(doc, config) {
      // Collect all inline script content (skip external <script src="...">)
      var scripts = doc.querySelectorAll('body > script');
      for (var i = 0; i < scripts.length; i++) {
        var s = scripts[i];
        if (s.getAttribute('src')) continue;  // skip external scripts (socket.io CDN, etc.)
        if (!s.textContent.trim()) continue;

        try {
          var scriptEl = document.createElement('script');
          scriptEl.textContent = s.textContent;
          document.body.appendChild(scriptEl);
        } catch (err) {
          console.error('[CasinoWidget] Script execution error:', err);
        }
      }

      this._loaded = true;

      // Handle autoLogin config
      if (config.autoLogin && config.autoLogin.username) {
        var self = this;
        // Wait for widget to be ready
        setTimeout(function() {
          self.login(config.autoLogin.username, config.autoLogin.password || config.autoLogin.username);
        }, 1000);
      }

      console.log('%c[CasinoWidget]%c Ready ✓ — DOM injection mode (TitanWidget pattern)',
        'color:#D4A843;font-weight:bold', 'color:inherit');
    },

    // ============================================
    // PROGRAMMATIC API
    // ============================================

    /**
     * Force login
     */
    login: function(username, password) {
      if (window.__casino463_autoLogin) {
        window.__casino463_autoLogin(username, password || username);
      }
    },

    /**
     * Force logout
     */
    logout: function() {
      // Simulate the same postMessage that 463.life sends
      window.postMessage({ tipo: 'logout' }, '*');
    },

    /**
     * Navigate the background iframe
     */
    navigate: function(url) {
      if (this._bgIframe) {
        this._bgIframe.src = url;
      }
    },

    /**
     * Open/close the widget chat
     */
    toggle: function(open) {
      if (window.__casino463_toggleWidget) {
        window.__casino463_toggleWidget(open);
      }
    },

    /**
     * Remove the widget completely
     */
    destroy: function() {
      // Remove root container (all widget elements)
      if (this._root && this._root.parentNode) {
        this._root.parentNode.removeChild(this._root);
        this._root = null;
      }
      // Remove bg-iframe
      if (this._bgIframe && this._bgIframe.parentNode) {
        this._bgIframe.parentNode.removeChild(this._bgIframe);
        this._bgIframe = null;
      }
      // Remove injected CSS
      if (this._styleEl && this._styleEl.parentNode) {
        this._styleEl.parentNode.removeChild(this._styleEl);
        this._styleEl = null;
      }
      // Clean up globals
      delete window.__casino463_serverUrl;
      delete window.__casino463_embedMode;
      delete window.__casino463_bgIframeId;
      delete window.__casino463_autoLogin;
      delete window.__casino463_autoLoginByUsername;
      delete window.__casino463_toggleWidget;

      this._loaded = false;
      this._config = null;
      this._serverUrl = null;
    }
  };

  // ── Listen for login/logout messages from 463.life bg-iframe ──
  // In embed mode, the bg-iframe is in the same page, so messages come directly
  // (no relay needed like in the old iframe approach)

  window.CasinoWidget = CasinoWidget;
})();
