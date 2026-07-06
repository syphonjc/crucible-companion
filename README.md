# Crucible Companion

A pocket companion for *Crucible of Destiny*. Reads your Obsidian vault straight from GitHub, with a player-facing mode and a password-locked DM mode.

## Setup (about 10 minutes)

**1. Create the app's repo.** On GitHub, create a new **public** repository (e.g. `crucible-companion`) — this holds only the app, never your campaign secrets. Upload all the files in this folder to it.

**2. Enable GitHub Pages.** In that repo: Settings → Pages → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save. After a minute your app is live at `https://YOURNAME.github.io/crucible-companion/`.

**3. Create a read-only token for your vault.** GitHub → Settings → Developer settings → Fine-grained personal access tokens → Generate new token. Repository access: *Only select repositories* → choose your **vault** repo. Permissions: *Contents → Read-only*. Nothing else. Copy the token.

**4. Add to your iPhone home screen.** Open the app URL in Safari → Share → *Add to Home Screen*. It now launches full-screen like a native app.

**5. Connect the vault.** Triple-tap **The Crucible** title → enter the word of passage (default `crucible88`) → Settings tab → enter your GitHub username, vault repo name, branch and token → *Save & connect*. Change the word of passage while you're there.

## How visibility works

- **Notes:** add `visibility: player` to a note's frontmatter to make it visible in player mode. Everything else is DM-only.

  ```
  ---
  visibility: player
  ---
  ```

- **Images/maps:** any image whose path contains "player" (e.g. `Maps/Player/floor-7.png`) shows in player mode. Everything else is DM-only.

## Features

- **Vault** — browse your folder structure (World, NPCs, Locations, Systems, Lore), with Obsidian `[[wikilinks]]` tappable.
- **Search** — instant title search, full-text across pages you've opened, plus GitHub-powered full-vault search when online.
- **NPC Log** (DM) — quick entries mid-session for grudges, debts and secrets; export the lot as Markdown to paste back into the vault.
- **Maps** — every image in the vault, tap for full-screen with pinch-zoom.
- **Offline** — the app shell and any page you've opened keep working without a connection.

## Security notes

- Your token lives only in your phone's local storage and is only ever sent to `api.github.com`. Don't enter it on a shared device.
- The word of passage hides DM content from casual eyes across the table — it is not real security. Anything truly secret should stay out of a repo players have access to; here it's safe because players never receive your token.

## Roadmap (v2)

- Kanka integration (characters, locations, entity images via the Kanka API — may need a small proxy for browser access).
- A GitHub Action that publishes a token-free player bundle so players can install the app themselves.
- Push NPC log entries directly back into the vault as commits.
