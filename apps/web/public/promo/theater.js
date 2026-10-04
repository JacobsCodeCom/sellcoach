(() => {
  const mira = document.getElementById("mira");
  const desk = document.getElementById("desk");
  const caption = document.getElementById("caption");
  const endcard = document.getElementById("endcard");
  const omnibox = document.getElementById("omnibox-url");

  /** Tiny JPEG for fake tab screenshots during the promo record scene. */
  const FAKE_FRAME =
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

  let captureTimer = null;
  let speechTimer = null;

  function postToMira(payload) {
    mira?.contentWindow?.postMessage({ source: "mira-extension", ...payload }, "*");
  }

  function postToDesk(payload) {
    desk?.contentWindow?.postMessage(payload, "*");
  }

  function stopFakeCapture() {
    if (captureTimer) {
      window.clearInterval(captureTimer);
      captureTimer = null;
    }
    if (speechTimer) {
      window.clearInterval(speechTimer);
      speechTimer = null;
    }
    postToMira({ type: "mira:capture-stopped" });
  }

  function startFakeCapture() {
    const startedAt = Date.now();
    postToMira({ type: "mira:capture-started", startedAt });

    const lines = [
      "I'm opening the Alpine Health account because they mentioned cancellation twice.",
      "I always escalate competitor comparisons the same day.",
      "After a failed onboarding call I send a same-day recap with three next steps.",
    ];
    let i = 0;
    speechTimer = window.setInterval(() => {
      if (i >= lines.length) return;
      postToMira({
        type: "mira:capture-speech",
        finals: [{ t: Date.now() - startedAt, text: lines[i] }],
        interim: "",
      });
      i += 1;
    }, 1600);

    captureTimer = window.setInterval(() => {
      postToMira({
        type: "mira:capture-frame",
        image: FAKE_FRAME,
        url: "http://localhost:3000/promo/desk.html",
      });
    }, 1200);
  }

  function spotlight(target = "ticket-alpine") {
    postToDesk({ type: "acme:spotlight", target });
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "mira:start-capture") startFakeCapture();
    if (data.type === "mira:stop-capture") stopFakeCapture();
    if (data.type === "mira:promo-spotlight") spotlight(data.target || "ticket-alpine");
  });

  const overlays = {
    policy: document.getElementById("overlay-policy"),
    workmap: document.getElementById("overlay-workmap"),
    stack: document.getElementById("overlay-stack"),
  };
  const endcardTagline = document.getElementById("endcard-tagline");
  const endcardModules = document.getElementById("endcard-modules");
  const endcardSub = document.getElementById("endcard-sub");

  window.miraPromo = {
    setCaption(text) {
      if (!text) {
        caption.hidden = true;
        caption.textContent = "";
        return;
      }
      caption.hidden = false;
      caption.textContent = text;
    },
    showOverlay(name) {
      for (const [key, el] of Object.entries(overlays)) {
        if (el) el.hidden = key !== name;
      }
    },
    hideOverlays() {
      for (const el of Object.values(overlays)) {
        if (el) el.hidden = true;
      }
    },
    showEndcard(opts = {}) {
      const technical = Boolean(opts.technical);
      if (endcardTagline) {
        endcardTagline.textContent = technical
          ? "An apprentice loop — not a recorder."
          : "Your team learns from its best people.";
      }
      if (endcardModules) endcardModules.hidden = !technical;
      if (endcardSub) endcardSub.hidden = !technical;
      endcard.hidden = false;
    },
    openLearn() {
      mira.src = "/ext/learn?promo=1";
      if (omnibox) omnibox.textContent = "app.acmeops.example/inbox";
    },
    openRecord() {
      mira.src = "/ext?promo=1";
    },
    miraFrame() {
      return mira;
    },
    spotlight,
    /** Drive scripted live-tutor actions inside the Mira iframe (no voice API). */
    tutor(action) {
      postToMira({ type: "mira:promo-tutor", action });
    },
    hear(text) {
      postToMira({ type: "mira:promo-tutor", hear: text });
    },
  };
})();
