# Meridian · Accounts Payable

Standalone fake Meridian ERP desk (Stuttgart plant month-end invoice queue).

This is **customer software for demos** — not Mira. Capture, Work Map, and coaching live in the Mira web app / Chrome extension, which can watch this desk via screen share.

```bash
pnpm dev:demo-ap
```

Opens on [http://localhost:3002](http://localhost:3002).

**Desk only:** open invoices, Suggested coding, cost centers, Post / Hold / 2nd approval, Save. Soft company rules may block invalid posts (e.g. equipment over €5k without capex + asset number).
