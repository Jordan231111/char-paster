# Char Paster

**GitHub description:** Firefox extension that bypasses websites blocking copy/paste by typing clipboard or custom text into text fields one character at a time.

Char Paster is built for sites that reject normal copy/paste into text fields, text boxes, and similar form inputs but still accept keyboard-style input. Instead of injecting a full pasted value at once, the extension focuses the target field and simulates text entry character by character.

## What It Does

- Helps bypass websites that block copy/paste in text fields.
- Adds a right-click menu for editable fields.
- Types clipboard contents into the selected field character by character.
- Opens an in-page overlay for custom text entry when needed.
- Provides a popup for typing into the last focused field.
- Lets you control typing speed and stop an in-progress run.
- Supports `input`, `textarea`, and `contenteditable` targets.

## How To Use It

### Context Menu

1. Focus or right-click a text field on the page.
2. Open `Char Paster — Type text here`.
3. Choose `Paste from clipboard (char by char)` or `Type custom text...`.

The custom text action opens an overlay on the page where you can paste or type text, adjust delay, and start or stop typing.

### Popup

1. Focus the target field first.
2. Open the extension popup.
3. Paste or type your text.
4. Set the per-character delay if needed.
5. Click `Type It`.

## How It Works

The extension remembers the last editable element you focused or right-clicked, including the correct frame. When triggered, the content script re-focuses that element and inserts characters one at a time while dispatching keyboard and input events. That lets it work on many sites that block paste but still accept typed input. If direct insertion fails, it falls back to text-control or `contenteditable` insertion paths.

## Permissions

- `menus`: adds the editable-field context menu.
- `clipboardRead`: reads clipboard text for the clipboard typing action.

## Limitations

- The target field must be focused or right-clicked first so the extension knows where to type.
- Single-line inputs cannot accept newline characters.
- Some heavily protected editors or anti-automation flows may still reject scripted typing.
- The clipboard action depends on clipboard access being available in Firefox.

## Development

### Requirements

- Node.js
- Firefox

### Scripts

```bash
npm install
npm run start
npm run build
npm run lint
```

Available scripts:

- `npm run start`: runs the extension in Firefox with `web-ext`.
- `npm run build`: builds the distributable package in `dist/`.
- `npm run lint`: validates the extension with `web-ext lint`.
- `npm run sign`: submits an unlisted signing build.

## Project Layout

- `manifest.json`: Firefox extension manifest.
- `background/background.js`: context menu setup and tab/frame routing.
- `content/content.js`: target tracking, overlay UI, and character-by-character typing logic.
- `popup/`: extension popup UI.
- `icons/`: extension icons.
- `dist/`: built extension archives.
