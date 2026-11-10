# Slack Shot

Paste a copied Slack conversation, get a clean PNG that looks like Slack.

It is a single static page (`index.html`). Parsing and rendering happen in the
browser; the conversation is never uploaded or stored. Only settings and any
avatar photos you pick are kept in `localStorage`.

## Use

1. Select messages in Slack, copy, and paste into the box.
2. Optionally set a time prefix ("Yesterday at"), the handles to highlight as
   your own mentions, theme, width and frame.
3. Click an avatar to use a real photo (Alt-click removes it).
4. **Download PNG** or **Copy image**.

Copied Slack text loses formatting, so add it back where you want it:
wrap text in ```` ``` ```` for a code block, `` `backticks` `` for inline code,
and start a line with `>` for a quote.

## Run locally

```bash
python3 -m http.server 4173
```

## Deploy to GitHub Pages

Push to GitHub, then in the repository go to **Settings → Pages**, choose
**Deploy from a branch**, and pick `main` / `/ (root)`.

The `CNAME` file sets the custom domain to `slack.dante.tw`. In DNS, add a
`CNAME` record for `slack` pointing to `<github-username>.github.io`.

The page loads the Lato font from Google Fonts and `html-to-image` from
jsDelivr at runtime.
