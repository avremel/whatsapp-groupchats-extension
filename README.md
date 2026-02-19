# WhatsApp Group Chat Scroller

Tired of scrolling through endless WhatsApp group chats trying to find the messages that actually matter? This Chrome extension does it for you.

Hit play, sit back, and let it auto-scroll through the conversation. Messages from people you care about get highlighted and the scroll slows down so you can read them. Messages from people you don't? Blurred out entirely.

![Overview](screenshots/overview.png)

## The Problem

WhatsApp group chats are noisy. Hundreds of messages pile up while you're away, and buried somewhere in there are the 3-4 messages you actually need to see. Manually scrolling through all of it is tedious. You either waste 10 minutes catching up or you give up and miss something important.

## The Solution

- **Auto-scroll** through the entire chat hands-free with adjustable speed (1x-10x)
- **Mark important people** and their messages get highlighted with a green border and IMPORTANT badge - the scroll automatically slows down so you can read them
- **Hide noisy users** and their messages get blurred out completely - skip the noise without leaving the group

![Control Panel](screenshots/panel.png)

## Install

1. Download or clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select this folder
5. Open [web.whatsapp.com](https://web.whatsapp.com) and enter a group chat

## Features

### Auto-Scroll
- Hit the **play button** to start auto-scrolling down through the chat
- **Speed slider** controls how fast it scrolls (1x-10x)
- **Important slider** controls the scroll speed when passing important people's messages (0.1x-5x) - the transition is smooth, not abrupt
- Scrolling auto-pauses when it reaches the end of the chat

### Important People
- Use the search box to find and add participants
- Type a partial name and press Enter to add it (useful for names not yet visible in the chat)
- Messages from important people get a green left border, subtle green background, and an **IMPORTANT** badge next to their name
- Scroll automatically slows down when important messages are in view
- Highlights are visible even when not auto-scrolling

### Hidden Users
- Add people whose messages you want to blur out
- Hidden messages show a sticky **HIDDEN** badge with a **Click to show** button
- Click to temporarily reveal a hidden message
- Partial name matching works here too

### Other
- **Draggable panel** - grab the header to move it anywhere
- **Minimize** - collapse to a small "Scroller" pill, click to expand
- **Persistent settings** - everything is saved across page reloads
- **Global settings** - your lists apply across every chat
- **Mixed-script name support** - Hebrew, Arabic, or other scripts mixed with Latin characters are fully searchable

## Permissions

- **storage** - saves your settings locally in Chrome
- Runs only on `web.whatsapp.com`

## Development

No build tools needed. Edit the files directly and reload the extension from `chrome://extensions`.

```
whatsapp-groupchats-extension/
  manifest.json     # Extension config (Manifest V3)
  content.js        # Core logic: scroll, detect, blur, highlights, panel
  content.css       # Panel styles, blur, highlight effects
  panel.html        # Control panel markup
  background.js     # Minimal service worker
  icons/            # Extension icons
```
