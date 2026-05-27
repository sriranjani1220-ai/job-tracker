# AI-Powered Job Application Tracker

Automatically tracks your job applications by scanning Gmail for confirmation emails, using Claude AI to extract company names and job roles, and building a dashboard with analytics in Google Sheets.

## How It Works

```
Gmail Inbox --> Keyword Search (finds application emails) --> Claude AI (extracts company + role) --> Google Sheet (logs + dashboard)
```

1. **Gmail Search**: Scans your inbox for application confirmation emails using 16 keyword patterns
2. **AI Parsing**: Sends each email to Claude AI (Haiku) to accurately extract the company name and job title
3. **Google Sheet**: Logs each application with date, status, and source
4. **Dashboard**: Auto-generates charts — status distribution, pipeline funnel, weekly trend
5. **Auto-Sync**: Runs every 6 hours in the background (even when your browser is closed)

## What It Tracks

| Column | Description |
|--------|-------------|
| Company | Extracted by Claude AI from the email |
| Role | Extracted by Claude AI from the email |
| Date Applied | Date the confirmation email was received |
| Status | Applied, Screening, Interview, Offer, Rejected, Ghosted, Withdrawn |
| Link | Job posting URL (manual) |
| Source | Gmail + AI (auto) or Manual |
| Last Updated | Last time the row was modified |
| Notes | Email subject line for reference |

## Dashboard

The Dashboard sheet auto-generates:
- **KPI Cards**: Total Applied, Active Pipeline, Response Rate, Interview Rate, Offer Rate, Ghost Rate, Apps/Week
- **Status Distribution**: Donut chart of all application statuses
- **Pipeline Funnel**: Applied > Screening > Interview > Offer conversion
- **Weekly Trend**: Line chart of applications over time

## Setup (5 minutes)

### Prerequisites
- A Google account with Gmail
- An Anthropic API key ([get one here](https://console.anthropic.com))

### Step 1: Create the Google Sheet
1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet
2. Name it **"Job Tracker"**
3. Rename the first tab to **"Data"**
4. Add a second tab called **"Dashboard"**
5. In the Data tab, add these headers in Row 1:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Company | Role | Date Applied | Status | Link | Source | Last Updated | Notes |

### Step 2: Copy Your Spreadsheet ID
From the sheet URL, copy the ID between `/d/` and `/edit`:
```
https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_ID/edit
```

### Step 3: Create the Apps Script
1. Go to [Google Apps Script](https://script.google.com/home)
2. Click **New Project**
3. Name it **"Job Tracker Script"**
4. Delete any existing code
5. Copy and paste the entire contents of `Code.gs` from this repo
6. Replace `PASTE_YOUR_SPREADSHEET_ID_HERE` on line 10 with your spreadsheet ID
7. Replace `PASTE_YOUR_API_KEY_HERE` on line 13 with your Anthropic API key
8. Click **Save**

### Step 4: First Run
1. Select **`setupAutoSync`** from the function dropdown and click **Run**
2. Google will ask for permissions — click **Advanced > Go to Job Tracker Script (unsafe) > Allow**
3. Select **`parseGmail`** from the dropdown and click **Run**
4. Wait 10-30 seconds — check your Google Sheet for results

### Step 5: Verify Auto-Sync
1. In Apps Script, click the **clock icon** (Triggers) on the left sidebar
2. You should see a trigger for `parseGmail` set to "Every 6 hours"
3. Done! It runs automatically from now on — even when your browser is closed

## Gmail Search Keywords

The script searches for these patterns in your inbox (last 90 days):

**Subject line:**
- "application received", "application confirmed"
- "thank you for applying", "thanks for applying"
- "thank you for your application"
- "we received your application"
- "application submitted", "your application was sent"

**Email body:**
- "your application was sent to"
- "your application has been submitted"
- "application" + "received" (both words anywhere)
- "application" + "submitted" (both words anywhere)

## Menu Options

After setup, your Google Sheet gets a **Job Tracker** menu:

| Menu Item | What It Does |
|-----------|-------------|
| Sync Gmail | Manually trigger a Gmail scan |
| Mark Ghosted (>14 days) | Flags "Applied" entries older than 14 days as "Ghosted" |
| Refresh Dashboard | Rebuilds all charts and stats |

## Cost

- **Google Sheets + Apps Script**: Free
- **Claude AI (Haiku)**: ~$0.01 per 50 emails parsed
- **Total**: Essentially free for personal use

## Tech Stack

- Google Apps Script (JavaScript runtime)
- Gmail API (via GmailApp)
- Google Sheets API (via SpreadsheetApp)
- Claude AI Haiku (via Anthropic REST API)

## License

MIT - Use it, modify it, share it.
