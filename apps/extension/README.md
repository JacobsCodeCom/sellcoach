# Mira Chrome extension

Side panel that embeds Mira’s `/ext` routes. One extension, two modes:

- **Learn** — guided roadmap, lessons, and live coaching (`/ext/learn`).
- **Record** — capture Work Maps from the active tab + mic (`/ext`, `/ext/capture`).

Recording is **one click**: the extension captures the active tab (screenshots + URL) + microphone/speech. The first install opens a one-time mic permission tab for the extension itself.

Production app: `https://mira.jacobscode.com`

## Load unpacked (local)

1. Start the web app: `pnpm dev:web` (http://localhost:3000).
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → choose this folder (`apps/extension`).
4. Allow the microphone once if a setup tab opens.
5. Pin Mira and open the side panel.
6. For local web, use the Mira URL field (unpacked only) and set `http://localhost:3000`.

After updating extension files, click **Reload** on `chrome://extensions`.

## Chrome Web Store package

```bash
pnpm extension:pack
```

Creates `apps/extension/dist/mira-chrome-extension.zip` with:

- production Mira origin locked (no URL override UI)
- no localhost host permission
- promo/media folders excluded

Privacy policy for the listing: `https://mira.jacobscode.com/privacy`

After the item is published, set `NEXT_PUBLIC_CHROME_EXTENSION_URL` on Vercel to the store URL, and optionally `CHROME_EXTENSION_ID` to lock `frame-ancestors`.

## How company binding works

Admins add people in Mira web and share an **invite link**. Members install this extension, accept the invite while signed in with that email, then learn or record into that company — never by email domain.
