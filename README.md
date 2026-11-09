# TripSharer

🇨🇳 [中文版](README.zh.md)

Back from a trip and everyone wants your recommendations? Turn your Notion travel records into a map website to share your favorite places and travel notes.

TripSharer is a travel map website template. Fill in your content in Notion, use a local AI Agent to configure, generate, and preview the website, then publish it when you are ready.

![preview](assets/preview.jpg)

[Live Demo →](https://au2026.cathylau.com/index.html)

[Features](#features) · [Before You Start](#before-you-start) · [Use the Skill](#use-the-tripsharer-skill-recommended) · [Common Tasks](#common-tasks) · [Publish and Share](#publish-and-share) · [Technical Reference](#manual-setup-and-technical-reference) · [FAQ](#faq)

## Features

- **City maps**: Maps with a hand-drawn look, showing city outlines and place markers.
- **Places and filters**: Browse categories, labels, ratings, and notes.
- **Daily routes**: View each day’s stops in order, along with daily notes. Live traffic and turn-by-turn route planning are not included.
- **Overview and city guides**: Read preparation notes, transport, accommodation, and travel tips from Notion.
- **Share by URL**: Visitors can open your published website without logging in.
- **Content updates**: Add travel records in Notion, regenerate, and publish to the same URL.

## Before You Start

The accounts below are for creating your own website. The quick preview only needs a local Agent and the runtime environment.

- **Notion account**: Record and manage your travels.
- **GitHub account**: Keep a project copy and publish with GitHub Pages.
- **Local AI Agent**: Claude Code, Codex, or another tool that can read and write project files, run commands, and access the network.

You provide travel content, authorize account access, and confirm publication. The Agent handles setup, website generation, and checks with your input.

## Use the TripSharer Skill (Recommended)

The [TripSharer Skill](skills/tripsharer/SKILL.md) guides a local Agent through setup, reading your Notion content, generating the website, and checking the preview. You provide content, authorize access, and confirm publication.

The Agent reads the Skill file included in this project; no global installation is needed.

### Choose How to Start

| Option | When to use it | Steps |
|---|---|---|
| **Quick preview** | Explore the website before setting up Notion | Use the bundled sample data → build → preview locally, with no Notion Token |
| **Create your own website** | Share your own travel records | Duplicate the Notion template into your workspace → edit the content → authorize access → generate and preview → publish after confirming |

The quick preview is optional. Both options generate a complete website; only the content source differs.

#### Quick Preview

You can tell the Agent:

```text
Read the TripSharer Skill and generate a local preview using the bundled sample data. Do not connect to Notion or publish.
```

The `data/my-trip*.json` files contain a snapshot exported from the Notion template and its map data. They do not update automatically when Notion changes. You do not need to duplicate the template, configure a Token, or run fetch. Node.js 20.9+ and project dependencies are still required.

Alternatively, run these commands in the project directory (run `npm ci` first on a fresh installation):

```bash
node scripts/check-project.js --trip my-trip --stage data
npm run build -- my-trip
node scripts/check-project.js --trip my-trip --stage build
npm run preview
```

Continue only after each command succeeds, then open the preview URL printed in the terminal. This path checks data and build output, skipping the configuration and network checks that require a Token.

### Create Your Own Website


The Agent will guide you through each step, starting with project setup. Existing projects and settings are preserved; missing information can be added along the way.

```text
Use the TripSharer template to generate and preview a website from my Notion travel records.

First read the repository README, AGENTS.md, and skills/tripsharer/SKILL.md.
Check what is already in place, then guide me through the remaining steps: setting up the local project, duplicating the Notion template, adding travel records, authorizing access, and configuring the project.
Confirm where to save the project before downloading it. If the project already exists, preserve its settings and changes.
Guide me through entering credentials locally. Never display them in chat or logs.
Work only in this task’s project folder. I will fill in the Notion content.
Generate a local preview for me to review first. Once I have checked the content and appearance, help me choose a publishing option and confirm with me before publishing.
```

Here is what each stage involves:

| Stage | What you do | What the Agent does |
|---|---|---|
| Prepare the project | Confirm where to save it | Read the project instructions, download the project, check the environment, and help create a Fork if needed |
| Prepare content | Duplicate the [Notion template](https://www.notion.so/cccathylau/TripSharer-Template-17a0c7ad070a82de8cbb01e252863fee), fill it in or keep sample content, and provide page links | Explain the required pages and city information |
| Authorize and configure | Authorize Notion access and enter secrets locally | Guide setup and check access to the required pages |
| Generate and preview | Open the preview and check the content and appearance | Fetch, generate, and inspect the website |
| Publish and update | Choose a destination and confirm public content | Publish with your approval and update the website when requested |

If a local project already exists, open its folder in the Agent and say: “Read `skills/tripsharer/SKILL.md` and generate and preview the website using the existing configuration.” The Agent will check the existing settings and help fill in anything missing; you do not need to start over.

Generation requires Node.js **20.9 or newer**; the Agent can check the environment and help install dependencies. Decide the publishing destination and URL after previewing. A text-only chatbot without local file and command access cannot complete the workflow independently. If access is restricted, the Agent can provide commands for your local terminal.

## Common Tasks

After asking the Agent to read the Skill, describe your next task in natural language:

| You can say | What the Agent does |
|---|---|
| Generate a travel website from my Notion records and preview it | Check configuration and access, read content, generate and inspect the local website |
| I added a few places; update the preview | Preserve settings, fetch and rebuild, then check the new content |
| I changed the city colors; check the result | Check Notion/configuration color priority, regenerate and preview |
| Help me prepare to publish to GitHub Pages | Check publishing settings, review what will be public, explain the steps, and publish with your approval |

Notion edits do not immediately update the website. After checking the preview, publish again to update the live version. See [Updating Content](#updating-content) and [Customization](#customization).

## Publish and Share

GitHub Pages is the default workflow. Consider Tencent Cloud COS if mainland China access is a priority. Complete the local preview and confirm that places, dates, and guide content can be public. Agents need explicit authorization to commit, push, or publish.

COS and geocoding APIs may incur charges. Review the services you use. Budget alerts and traffic limits are optional and should reflect your own needs; example amounts and thresholds are not publishing requirements.

### GitHub Pages (Default)

**Generate locally, publish through GitHub**

1. Verify the local preview and confirm the content may be public. Set `siteUrl` to `https://[username].github.io/[repo-name]`.
2. In repository Settings → Pages → Source, select **GitHub Actions**.
3. Commit the project changes, `trips.config.js`, and generated `data/*.json`, then push to main. The default is the first configured trip. Keep `.env` local.
4. Check Deploy to GitHub Pages in Actions, then open the published URL. Manual runs optionally accept `trip_id` to select a trip.

This path uses generated data and does not require a Notion Token in GitHub. Actions checks data before building and output after building; a failed check stops publication.

`dist/data/` contains only the selected trip and its configured cities. Other trip data committed to a public repository remains accessible through that repository; review all committed content before publishing.

Optional: let GitHub read Notion:

Add `NOTION_TOKEN` in Settings → Secrets and variables → Actions. Add `GOOGLE_MAPS_KEY` if used, or `GAODE_KEY` for mainland China places needing automatic coordinates. Run Fetch Notion Data manually. It checks fetched data before committing, then deploys to GitHub Pages. Failed checks stop the workflow.

### Tencent Cloud COS (for Mainland China Access)

For mainland China access, consider the COS Hong Kong region. A custom domain and HTTPS setup are needed for new COS buckets to serve browser previews. Configure `cosUrl` with the bucket endpoint and `siteUrl` with your public website root. Follow the [COS deployment guide (Chinese)](docs/cos-setup.md) to set up the account, bucket, access permissions, and credentials. Once setup and preview checks are complete, run:

```bash
npm run deploy -- my-trip
```

The COS deployment command rebuilds and uploads the website. It does not fetch the latest Notion content or automatically check the data and build output. Complete the checks in [Local Preview](#local-preview) before publishing. Uploads overwrite matching objects but do not remove old objects. The bundled GitHub Actions publish to Pages, not COS.

## Updating Content

**After editing Notion** (adding places, ratings, or guide content)

Notion changes do not immediately update the website:

1. **Fetch and generate**: Follow [Local Preview](#local-preview) to fetch, check data, build, and check output. Resolve failures before continuing.
2. **Check the preview**: Refresh a running preview or start `npm run preview`, then verify the changes.
3. **Publish the update**: Confirm the content, then use the original publishing destination.

- **GitHub Pages**: Commit updated `data/` and any changed `trips.config.js`, then push to main to build and publish through Actions.
- **Tencent Cloud COS**: Run `npm run deploy -- my-trip` to rebuild and upload.

**Optional: update through GitHub Actions**

After configuring GitHub Secrets, open Actions → Fetch Notion Data → Run workflow and enter the trip ID. This reads Notion, automatically commits data, and publishes to GitHub Pages without a local preview step.

**After editing code**

Rebuild and inspect locally before committing. Pushes to main trigger GitHub Pages deployment; COS requires another deploy command. Agents need explicit authorization for commit, push, and publication.

## Customization

- **Trip title**: Edit the Notion template parent page title. Keep the overview under that page; columns are supported. If the parent title cannot be read, `coverMeta.title` is used.
- **City display names**: Set `cityZhNames` in `trips.config.js`; otherwise the city guide page title is used. City keys must still match the Places City field.
- **Place categories**: Edit the Notion Category field. Filters are generated from place content.
- **Island and city colors**: Use a 🎨 Callout on each city guide page.

### Change Island and City Colors

1. Open the corresponding city guide page in Notion.
2. Add or edit a Callout with the 🎨 icon. Enter a color name or six-digit Hex value, such as `蓝色`, `coral`, or `#2A9D8F`.
3. Fetch, rebuild, and refresh the preview; publish after checking the result.

The color applies to the homepage island and related city styling. The icon must be 🎨; the Callout's own background color does not set the website color. Keep one color setting per city.

You can also set `cityColors` in `trips.config.js`. Priority is **recognized Notion color → configured city color → automatic palette**. Remove the Notion color setting when switching to configuration colors.

<details>
<summary>Color names and values</summary>

Use a Chinese name, English name, or Hex value from this table. Use Hex for an exact color.

| Chinese | English | Hex |
|--------|--------|-----|
| 红 | red | `#C0524A` |
| 砖红 | brick | `#B84C3C` |
| 珊瑚 | coral | `#E87060` |
| 玫 | rose | `#C2546A` |
| 粉 | pink | `#D17B8B` |
| 橙 | orange | `#E4906B` |
| 黄 | yellow | `#D4A24A` |
| 绿 | green | `#6B9E6B` |
| 橄榄 | olive | `#7A8C5A` |
| 青 | teal | `#2A9D8F` |
| 薄荷 | mint | `#3D9E7A` |
| 蓝 | blue | `#4A7B96` |
| 青蓝 | cyan | `#3E7A96` |
| 深蓝 | navy | `#2C4E6E` |
| 紫 | purple | `#9B7AA6` |
| 薰衣草 | lavender | `#8E7AB5` |
| 棕 | brown | `#A37056` |
| 驼 | camel | `#B8A06A` |
| 灰 | gray | `#6B6B6B` |
| 白 | white | `#F5F1EC` |
| 黑 | black | `#2C2C2C` |

Color names can use the Chinese prefixes “亮、浅、淡” to lighten, or “深、暗” to darken. The predefined “深蓝” name uses its fixed value above. These name mappings differ from the automatic palette.

</details>

## Manual Setup and Technical Reference

<details>
<summary>Manual setup steps</summary>

1. Fork and clone the repository, install Node.js 20.9 or newer, then run `npm ci`.
2. Copy `.env.example` to `.env` only if absent. Enter the Token and required API keys; leave unused optional values blank. Preserve an existing `.env`.
3. Edit `trips.config.js` with your duplicated Notion IDs and city settings. Set `siteUrl` when the publishing URL is known; it does not block local preview. Do not use the original template's page IDs.
4. Follow [Local Preview](#local-preview) to fetch, generate, and check.
5. Confirm the content may be public, then follow [Publish and Share](#publish-and-share). Agents need explicit authorization; never commit `.env`.

</details>

### Notion Configuration

- **Create a connection**: Create an Integration in [Notion Developer tools](https://www.notion.so/my-integrations), select the template's workspace, and enable read-content access.
- **Authorize pages**: Add the Integration through Connections on the duplicated overview, city guide pages, and Places database.
- **Configure locally**: Store the Token in `.env`, never in Git or chat. Put duplicated page/database IDs in `trips.config.js`.
- **Verify access**: Check that the local program can read the database and every required page. A ChatGPT Notion connection does not configure this project's local Token or permissions.

**Geocoding and API keys**

- Places with Lat/Lng use those coordinates directly.
- International places without coordinates use Nominatim; a [Google Maps API key](https://console.cloud.google.com/) is recommended.
- Mainland China places needing automatic coordinates require a [Gaode API key](https://lbs.amap.com/).
- If geocoding fails, correct Address or fill Lat/Lng, then fetch again.

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `NOTION_TOKEN` | Notion Integration Token | Yes |
| `GOOGLE_MAPS_KEY` | Google geocoding, better accuracy for international cities | Recommended |
| `GAODE_KEY` | Gaode geocoding | Mainland China places without coordinates |
| `TENCENT_SECRET_ID` | Tencent Cloud COS credentials | COS deployment only |
| `TENCENT_SECRET_KEY` | Tencent Cloud COS credentials | COS deployment only |

### trips.config.js

Keep the `export const TRIPS = { ... }` structure. Configure the Places database, overview and city page IDs; city keys, display names, search terms and country; and the final `siteUrl` for publishing. City keys must match the Notion City values. Leave optional `cityUrbanBBox` empty unless needed.

`my-trip` identifies one entry in `TRIPS`; use that same ID in commands. The following example is one entry:

```js
"my-trip": {
  databaseId: "",          // Notion Places database ID
  overviewPageId: "",      // Overview page ID
  cityPageIds: {           // city key → city Notes page ID
    sydney: "",
  },
  citySearchTerms: {       // city key → search term for map boundary
    sydney: "Sydney, Australia",
  },
  cityColors: {            // optional; auto-assigned from palette if omitted
    sydney: "#E85D4A",
  },
  cityUrbanBBox: {         // optional; bbox [south, west, north, east] for road data
    // sydney: [-33.95, 151.10, -33.80, 151.30],
  },
  cityZhNames: {           // Chinese city names for Baidu Maps navigation links
    sydney: "City Name",
  },
  region: "international", // "international" or "domestic" (mainland China, uses Gaode)
  countryName: "Australia",
  theme: { primary: "#E85D4A" },
  siteUrl: "https://your-username.github.io/TripSharer-Template",
}
```

**How to get a Notion ID**: Open the page or database, copy the URL. The ID is the 32-character string before `?v=` (remove hyphens).

### Local Preview

Use your configured trip ID instead of `my-trip` if different. First check local configuration and actual Notion access from the repository directory:

```bash
node scripts/check-project.js --trip my-trip --stage config
node scripts/check-project.js --trip my-trip --stage config --network
```

After these checks pass, run each command in order and resolve failures before proceeding:

```bash
npm run fetch -- my-trip
node scripts/check-project.js --trip my-trip --stage data
npm run build -- my-trip
node scripts/check-project.js --trip my-trip --stage build
npm run preview
```

Open the local URL printed in the terminal. Check map pins, Label, ratings, Short Note, stop order for each day, Day Note, overview, and city notes. The preview server runs only on your computer; press Ctrl+C to stop. `my-trip` must match the configured trip ID. Building another trip automatically updates the default trip loaded by the website.
Passing file checks is not enough: open the website and test its content and interactions. Fetch updates `data/`, and build regenerates `dist/`; do not keep unique manual work in `dist/`. These commands do not publish the website.

Keep the terminal running while previewing. After editing Notion, run fetch and build again, then refresh the page. Restarting preview may change the port in its URL. Without a cover photo, the build uses a default background and still generates the website.

The example configuration uses `sydney` and `melbourne`, matching the Notion template. Fill in the page IDs to use that example. For your own trip, update the city keys, search terms, display names, and country together. Leave `cityUrbanBBox` empty to use city boundary bounds.

### Notion Database Schema

**Places Database**

| Field | Type | Description |
|-------|------|-------------|
| Name | Title | Place name |
| City | Select | City key — must match the key in `trips.config.js` |
| Category | Select | Type (attraction / restaurant / shopping, etc.) |
| Address | Rich Text | Place address; used for geocoding when Lat/Lng are blank |
| Lat | Number | Latitude; auto-fetched if blank |
| Lng | Number | Longitude; auto-fetched if blank |
| Rating | Number | Rating 1–5 |
| Label | Rich Text | Short label, shown in the map popup |
| Short Note | Rich Text | One-line summary, shown below the rating |
| Day | Number | Day number (1/2/3…), used for route grouping |
| Stop Order | Number | Order within the day |
| Day Note | Rich Text | Day-level note; fill once on the first place of the day |

**Overview Page and City Notes Pages**

- **Overview Page**: Pre-trip info (SIM card, currency, packing list, etc.). Supports paragraphs, H1 headings, ordered/unordered lists.
- **City Notes Pages**: One page per city for transport tips, local advice, etc. Display names use `cityZhNames` first, or the page title when no override is configured.
- **City theme color**: Add a Callout block anywhere on the page with a 🎨 emoji, and write a hex value (`#E85D4A`) or color name (`coral`). It's picked up automatically during fetch.

## FAQ

**Notion connection fails or access is denied**
Run the configuration network check. Confirm `.env`, the Integration workspace, and access to the duplicated database, overview, and every city page. DNS errors such as `ENOTFOUND` require network troubleshooting and do not establish whether the Token or permissions are valid.

**Configuration passes, but map details are missing**
Configuration checks do not replace data checks. If local detailed roads are missing, retry a normal fetch and check data again; do not start by clearing all caches.

**Notion changes do not appear**
Fetch, rebuild, and refresh the local preview. Republish to update the live website; refreshing the public page alone does not read Notion.

**Geocoding fails**
Identify the places without coordinates, correct Address or supply Lat/Lng in Notion, then fetch again. Set `GAODE_KEY` for mainland China places needing automatic coordinates.

**Fetch is slow**
The first run downloads city boundaries, roads, and water data. Duration depends on the city area and network; later runs reuse map caches.

**GitHub Actions fails**
Check the failed step: Notion reads require page access, correct IDs, and Secrets; build failures require valid configuration and data; publication requires Pages Source to be GitHub Actions.

**COS CORS error**
Configure CORS on the bucket. See [COS deployment guide (Chinese)](docs/cos-setup.md).
