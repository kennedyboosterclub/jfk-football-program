# Kennedy Football Game-Day Program

A responsive, print-ready digital program for Bloomington Kennedy Football. The public program is driven by `data/program.json`; the browser-based editor at `/admin/` manages the program and publishes approved changes to GitHub.

## What is included

- US Letter page proportions with print-to-PDF support
- Cover photo and game details
- Unlimited sponsors with full-, half-, or quarter-page sizing
- Sponsor placement before team photos or after photos and before action shots
- Optional sponsor website and phone-number links
- Coaches, schedule, captains, seniors, managers, and cheerleaders sections
- Dynamic player pages at 15 players per page
- Bulk CSV roster import and automatic photo-folder matching for large teams
- “Not Pictured” list on the final roster page
- Two action-photo pages
- Automatic sponsor-page packing and image scaling without cropping
- Local drafts, image compression, live preview, JSON backups, and GitHub publishing

## Initial GitHub Pages setup

1. Create a public GitHub repository and add every file in this folder to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`, then save.
5. Under **Custom domain**, enter `jfkbooster.org` and save.
6. Wait until the GitHub Pages address works before changing Porkbun DNS.

The included `CNAME` file keeps `jfkbooster.org` assigned to the Pages site. The included `.nojekyll` file tells GitHub to serve the static files directly.

## Porkbun DNS when the site is ready

Remove only the current Porkbun parking records (the root `ALIAS` and wildcard `CNAME` pointing to `pixie.porkbun.com`). Do not delete or change the Namecheap email MX, SPF, DKIM, or DMARC records.

Add these four root `A` records with a blank host:

| Type | Host | Answer / value |
|---|---|---|
| A | blank | `185.199.108.153` |
| A | blank | `185.199.109.153` |
| A | blank | `185.199.110.153` |
| A | blank | `185.199.111.153` |

Also add a `CNAME` with host `www` and answer `<YOUR-GITHUB-USERNAME>.github.io`.

After DNS is confirmed in GitHub, enable **Enforce HTTPS** under **Settings → Pages**. DNS and SSL can take time to become available.

## One-time publisher token setup

The admin page publishes through GitHub's repository contents API.

1. In GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Create a token named `Kennedy program publisher` and give it an expiration date.
3. Under **Repository access**, choose **Only select repositories**, then select this program repository.
4. Under **Repository permissions**, set **Contents** to **Read and write**. No other write permission is needed.
5. Copy the token. GitHub only displays it once.

The admin page asks for the token each time you publish. It does not save the token in local storage or the repository. Treat the token like a password and revoke it immediately if it is ever exposed.

The publisher prepares uploaded images and `data/program.json` as one GitHub commit, so large player-photo batches do not create dozens of separate repository updates.

## Editing workflow

1. Visit `https://jfkbooster.org/admin/` from the designated editing computer.
2. Make changes and review the live preview. Drafts are stored on that computer only.
3. Use **Download backup** before a major update.
4. Select **Publish to GitHub**, enter the repository details and token, and publish.
5. Confirm the public program after GitHub Pages finishes updating.

Uploaded images are resized to a maximum dimension of 2400 pixels and converted to WebP before publication. They are stored in `assets/uploads/` and served from the same `jfkbooster.org` domain as the program.

For a large roster, use **Download CSV template** in the Player roster section, enter the names and grades, and import the completed file. Then select the player-photo folder. The editor matches images using `photo_filename`, `001-first-last.jpg`, or `first-last.jpg`, and reports missing, unmatched, or duplicate files before publication.
