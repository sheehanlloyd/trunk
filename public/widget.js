/*
 * AI Receptionist embeddable chat widget loader.
 *
 * A client drops one tag onto their site:
 *   <script src="https://app.example.com/widget.js" data-business-id="…" async></script>
 *
 * This script injects a single fixed-position <iframe> pointing at our
 * /widget/frame route. ALL chat UI lives inside that iframe (served from our
 * origin), so:
 *   - the host page's CSS/JS can't touch the widget and vice-versa (full isolation);
 *   - the chat's /api/chat calls are same-origin to us — no CORS needed.
 *
 * The iframe stays bubble-sized while collapsed (so it never blocks clicks on
 * the host page) and resizes to a panel when the in-iframe UI posts 'open'.
 */
(function () {
  "use strict";

  // Guard against double-inclusion.
  if (window.__aiReceptionistWidgetLoaded) return;
  window.__aiReceptionistWidgetLoaded = true;

  // --- Resolve our own <script> tag (currentScript is null for async scripts) ---
  function findScript() {
    if (document.currentScript && document.currentScript.dataset.businessId) {
      return document.currentScript;
    }
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      var s = scripts[i];
      if (s.src && s.src.indexOf("/widget.js") !== -1 && s.dataset.businessId) {
        return s;
      }
    }
    return null;
  }

  var script = findScript();
  if (!script) {
    console.error("[ai-widget] missing <script data-business-id> tag.");
    return;
  }

  var businessId = script.dataset.businessId;
  if (!businessId) {
    console.error("[ai-widget] data-business-id is required.");
    return;
  }

  // App origin = where widget.js was served from.
  var origin = new URL(script.src).origin;
  var frameUrl =
    origin + "/widget/frame?businessId=" + encodeURIComponent(businessId);

  // --- Inject the iframe ------------------------------------------------------
  var iframe = document.createElement("iframe");
  iframe.src = frameUrl;
  iframe.title = "Chat";
  iframe.setAttribute("allow", "clipboard-write");
  iframe.style.cssText = [
    "position:fixed",
    "bottom:16px",
    "right:16px",
    "width:110px",
    "height:110px",
    "border:0",
    "margin:0",
    "padding:0",
    "max-width:100vw",
    "max-height:100vh",
    "background:transparent",
    "color-scheme:normal",
    "z-index:2147483000",
    "transition:width .18s ease,height .18s ease",
  ].join(";");

  var open = false;

  // Which corner the widget anchors to. The owner's choice lives in the DB;
  // the frame (the only party that read it) announces it via a
  // {type:"config"} postMessage after load. Default matches the stock look.
  var position = "right";

  // Whether the frame is currently showing its greeting teaser card next to
  // the collapsed launcher. The teaser needs more room than the bare bubble,
  // so the frame announces show/hide via {type:"teaser"} and we grow/shrink
  // the collapsed iframe to match. Never affects the open panel size.
  var teaserVisible = false;

  function isMobile() {
    return window.innerWidth < 480;
  }

  /** Pins the iframe to the configured bottom corner. */
  function applyCorner() {
    if (position === "left") {
      iframe.style.left = "16px";
      iframe.style.right = "auto";
    } else {
      iframe.style.right = "16px";
      iframe.style.left = "auto";
    }
  }

  function applyCollapsed() {
    open = false;
    iframe.style.top = "auto";
    applyCorner();
    iframe.style.bottom = "16px";
    // Bubble-only by default; wide enough for the teaser card when shown.
    iframe.style.width = teaserVisible ? "268px" : "110px";
    iframe.style.height = teaserVisible ? "200px" : "110px";
    iframe.style.borderRadius = "0";
  }

  function applyOpen() {
    open = true;
    if (isMobile()) {
      // Full-screen panel on small viewports.
      iframe.style.top = "0";
      iframe.style.left = "0";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
    } else {
      iframe.style.top = "auto";
      applyCorner();
      iframe.style.bottom = "16px";
      iframe.style.width = Math.min(400, window.innerWidth - 32) + "px";
      iframe.style.height = Math.min(640, window.innerHeight - 32) + "px";
    }
  }

  function mount() {
    if (!document.body) {
      // In case the script somehow runs before <body> exists.
      window.addEventListener("DOMContentLoaded", mount, { once: true });
      return;
    }
    document.body.appendChild(iframe);
  }
  mount();

  // --- Listen for open/close + config from the in-iframe UI -------------------
  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return; // only trust our own frame
    if (event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (!data || data.source !== "air-widget") return;
    if (data.type === "config") {
      // Owner-configured corner, announced by the frame once it has rendered.
      if (data.position === "left" || data.position === "right") {
        position = data.position;
        if (open) applyOpen();
        else applyCollapsed();
      }
      return;
    }
    if (data.type === "teaser") {
      // Strict boolean only — anything else from a compromised frame is ignored.
      if (data.visible !== true && data.visible !== false) return;
      teaserVisible = data.visible;
      if (!open) applyCollapsed();
      return;
    }
    if (data.action === "open") applyOpen();
    else if (data.action === "close") applyCollapsed();
  });

  // Keep panel sized correctly on viewport changes.
  window.addEventListener("resize", function () {
    if (open) applyOpen();
  });
})();
