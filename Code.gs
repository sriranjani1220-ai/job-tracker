// ==============================
// JOB TRACKER - Google Apps Script
// ==============================
// AI-powered Gmail parser + Dashboard charts
// Scans your Gmail for job application confirmations,
// uses Claude AI to extract company & role, and builds
// a dashboard with analytics.

// PASTE YOUR SPREADSHEET ID BELOW (from the sheet URL between /d/ and /edit)
const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';

// PASTE YOUR ANTHROPIC API KEY BELOW (get one at https://console.anthropic.com)
const ANTHROPIC_API_KEY = 'PASTE_YOUR_API_KEY_HERE';

const DATA_SHEET = 'Data';
const DASHBOARD_SHEET = 'Dashboard';

// --- Gmail Parsing ---

function parseGmail() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DATA_SHEET);
  const existingLinks = getExistingLinks(sheet);

  // Search for job application emails
  const queries = [
    // Subject-based searches
    'subject:"application received" newer_than:90d',
    'subject:"application confirmed" newer_than:90d',
    'subject:"thank you for applying" newer_than:90d',
    'subject:"thanks for applying" newer_than:90d',
    'subject:"thank you for your application" newer_than:90d',
    'subject:"we received your application" newer_than:90d',
    'subject:"application submitted" newer_than:90d',
    'subject:"your application was sent" newer_than:90d',
    'subject:"your application" newer_than:90d -subject:"update" -subject:"status"',
    // Body-based searches (catches emails with generic subjects)
    '"your application was sent to" newer_than:90d',
    '"thank you for applying" newer_than:90d',
    '"thanks for applying" newer_than:90d',
    '"thank you for your application" newer_than:90d',
    '"your application has been submitted" newer_than:90d',
    // Application AND (Received OR Submitted) in same email
    'application received newer_than:90d',
    'application submitted newer_than:90d',
  ];

  let newCount = 0;

  // Process application confirmation emails
  for (const query of queries) {
    try {
      const threads = GmailApp.search(query, 0, 20);
      for (const thread of threads) {
        const msg = thread.getMessages()[0];
        const parsed = parseApplicationEmail(msg);
        if (parsed && !isDuplicate(parsed, existingLinks, sheet)) {
          addRow(sheet, parsed);
          existingLinks.add(parsed.company.toLowerCase());
          newCount++;
        }
      }
    } catch (e) {
      Logger.log('Query error: ' + query + ' - ' + e.message);
    }
  }

  // Refresh dashboard
  buildDashboard();

  Logger.log(`Gmail Sync Complete: Found ${newCount} new applications.`);
}

function parseApplicationEmail(msg) {
  const subject = msg.getSubject();
  const body = msg.getPlainBody().substring(0, 1000);
  const from = msg.getFrom();
  const date = msg.getDate();

  // Use Claude AI to extract company and role
  const parsed = askClaude(subject, from, body);
  if (!parsed || !parsed.company || parsed.company === 'UNKNOWN') return null;

  return {
    company: parsed.company,
    role: parsed.role || 'Check email',
    date: Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    status: 'Applied',
    link: '',
    source: 'Gmail + AI',
    notes: 'From: ' + subject.substring(0, 60)
  };
}

// --- Claude AI Parser ---

function askClaude(subject, from, body) {
  const prompt = `Extract the company name and job role/title from this job application confirmation email.

From: ${from}
Subject: ${subject}
Body (first 1000 chars):
${body}

Rules:
- Company: The actual company name (not "LinkedIn", "Indeed", "Greenhouse", "Workday" — those are platforms, find the real company)
- Role: The exact job title/role applied for
- If you truly cannot determine the company, return "UNKNOWN"
- If you truly cannot determine the role, return "Check email"

Respond ONLY in this exact JSON format, nothing else:
{"company": "Company Name", "role": "Job Title"}`;

  try {
    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: prompt
        }]
      }),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    const text = result.content[0].text.trim();

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    Logger.log('Claude API error: ' + e.message);
  }

  return null;
}

function getExistingLinks(sheet) {
  const data = sheet.getDataRange().getValues();
  const companies = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) companies.add(data[i][0].toString().toLowerCase());
  }
  return companies;
}

function isDuplicate(parsed, existingCompanies, sheet) {
  const companyLower = parsed.company.toLowerCase();
  if (existingCompanies.has(companyLower)) return true;
  for (const existing of existingCompanies) {
    if (existing.includes(companyLower) || companyLower.includes(existing)) return true;
  }
  return false;
}

function addRow(sheet, data) {
  sheet.appendRow([
    data.company,
    data.role,
    data.date,
    data.status,
    data.link,
    data.source,
    data.date,
    data.notes
  ]);
}

// --- Mark Ghosted (no response > 14 days) ---

function markGhosted() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DATA_SHEET);
  const data = sheet.getDataRange().getValues();
  const today = new Date();
  let count = 0;

  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === 'Applied' && data[i][2]) {
      const applied = new Date(data[i][2]);
      const daysSince = Math.floor((today - applied) / (1000 * 60 * 60 * 24));
      if (daysSince > 14) {
        sheet.getRange(i + 1, 4).setValue('Ghosted');
        sheet.getRange(i + 1, 7).setValue(Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
        count++;
      }
    }
  }

  buildDashboard();
  Logger.log(`Ghosted Check: Marked ${count} applications as Ghosted (>14 days no response).`);
}

// --- Dashboard Builder ---

function buildDashboard() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const dataSheet = ss.getSheetByName(DATA_SHEET);
  const dash = ss.getSheetByName(DASHBOARD_SHEET);

  if (!dash) {
    ss.insertSheet(DASHBOARD_SHEET);
  }

  const dashSheet = ss.getSheetByName(DASHBOARD_SHEET);
  dashSheet.clear();

  const data = dataSheet.getDataRange().getValues();
  if (data.length < 2) {
    dashSheet.getRange('A1').setValue('No data yet. Run Gmail Sync first.');
    return;
  }

  const rows = data.slice(1).filter(r => r[0]);

  // --- Stats ---
  const total = rows.length;
  const statusCounts = {};
  const statusList = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected', 'Ghosted', 'Withdrawn'];
  statusList.forEach(s => statusCounts[s] = 0);
  rows.forEach(r => {
    const s = r[3] || 'Applied';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  const responseRate = total ? (((statusCounts['Screening'] + statusCounts['Interview'] + statusCounts['Offer']) / total) * 100).toFixed(1) : 0;
  const interviewRate = total ? ((statusCounts['Interview'] + statusCounts['Offer']) / total * 100).toFixed(1) : 0;
  const offerRate = total ? (statusCounts['Offer'] / total * 100).toFixed(1) : 0;
  const rejectionRate = total ? (statusCounts['Rejected'] / total * 100).toFixed(1) : 0;
  const ghostRate = total ? (statusCounts['Ghosted'] / total * 100).toFixed(1) : 0;

  const activePipeline = total - statusCounts['Rejected'] - statusCounts['Ghosted'] - statusCounts['Withdrawn'];

  const dates = rows.map(r => new Date(r[2])).filter(d => !isNaN(d));
  let appsPerWeek = 0;
  if (dates.length > 1) {
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const weeks = Math.max(1, (maxDate - minDate) / (1000 * 60 * 60 * 24 * 7));
    appsPerWeek = (dates.length / weeks).toFixed(1);
  }

  // --- Write Dashboard ---
  dashSheet.getRange('A1').setValue('JOB SEARCH DASHBOARD').setFontSize(16).setFontWeight('bold');
  dashSheet.getRange('A2').setValue('Last updated: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));

  // KPI Row
  const kpiRow = 4;
  const kpis = [
    ['Total Applied', total],
    ['Active Pipeline', activePipeline],
    ['Response Rate', responseRate + '%'],
    ['Interview Rate', interviewRate + '%'],
    ['Offer Rate', offerRate + '%'],
    ['Rejection Rate', rejectionRate + '%'],
    ['Ghost Rate', ghostRate + '%'],
    ['Apps/Week', appsPerWeek],
  ];

  for (let i = 0; i < kpis.length; i++) {
    const col = i + 1;
    dashSheet.getRange(kpiRow, col).setValue(kpis[i][0]).setFontSize(8).setFontColor('#666666');
    dashSheet.getRange(kpiRow + 1, col).setValue(kpis[i][1]).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center');
  }

  // Status Breakdown Table
  const tableStart = 8;
  dashSheet.getRange(tableStart, 1).setValue('STATUS BREAKDOWN').setFontSize(12).setFontWeight('bold');
  dashSheet.getRange(tableStart + 1, 1).setValue('Status');
  dashSheet.getRange(tableStart + 1, 2).setValue('Count');
  dashSheet.getRange(tableStart + 1, 3).setValue('% of Total');
  dashSheet.getRange(tableStart + 1, 1, 1, 3).setFontWeight('bold').setBackground('#f0f0f0');

  statusList.forEach((status, i) => {
    const row = tableStart + 2 + i;
    dashSheet.getRange(row, 1).setValue(status);
    dashSheet.getRange(row, 2).setValue(statusCounts[status]);
    dashSheet.getRange(row, 3).setValue(total ? (statusCounts[status] / total * 100).toFixed(1) + '%' : '0%');
  });

  // --- Charts ---
  dashSheet.getCharts().forEach(c => dashSheet.removeChart(c));

  // Chart 1: Status Distribution (Donut)
  const chart1 = dashSheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(dashSheet.getRange(tableStart + 1, 1, statusList.length + 1, 2))
    .setPosition(tableStart, 5, 0, 0)
    .setOption('title', 'Application Status Distribution')
    .setOption('pieHole', 0.4)
    .setOption('width', 400)
    .setOption('height', 280)
    .setOption('colors', ['#4285f4', '#34a853', '#fbbc05', '#0f9d58', '#ea4335', '#9e9e9e', '#ff6d01'])
    .build();
  dashSheet.insertChart(chart1);

  // Pipeline Funnel
  const funnelStart = 18;
  dashSheet.getRange(funnelStart, 1).setValue('PIPELINE FUNNEL').setFontSize(12).setFontWeight('bold');
  const funnelStages = ['Applied', 'Screening', 'Interview', 'Offer'];
  const funnelCumulative = funnelStages.map((s, i) => {
    return funnelStages.slice(i).reduce((sum, st) => sum + statusCounts[st], 0);
  });

  dashSheet.getRange(funnelStart + 1, 1).setValue('Stage');
  dashSheet.getRange(funnelStart + 1, 2).setValue('Count');
  dashSheet.getRange(funnelStart + 1, 3).setValue('Conversion');
  dashSheet.getRange(funnelStart + 1, 1, 1, 3).setFontWeight('bold').setBackground('#f0f0f0');

  funnelStages.forEach((stage, i) => {
    const row = funnelStart + 2 + i;
    dashSheet.getRange(row, 1).setValue(stage);
    dashSheet.getRange(row, 2).setValue(funnelCumulative[i]);
    dashSheet.getRange(row, 3).setValue(i === 0 ? '100%' : (total ? (funnelCumulative[i] / total * 100).toFixed(1) + '%' : '0%'));
  });

  const chart2 = dashSheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(dashSheet.getRange(funnelStart + 1, 1, funnelStages.length + 1, 2))
    .setPosition(funnelStart, 5, 0, 0)
    .setOption('title', 'Pipeline Funnel')
    .setOption('width', 400)
    .setOption('height', 250)
    .setOption('colors', ['#4285f4'])
    .setOption('legend', {position: 'none'})
    .build();
  dashSheet.insertChart(chart2);

  // Weekly Trend
  const weeklyStart = 26;
  dashSheet.getRange(weeklyStart, 1).setValue('WEEKLY TREND').setFontSize(12).setFontWeight('bold');
  dashSheet.getRange(weeklyStart + 1, 1).setValue('Week');
  dashSheet.getRange(weeklyStart + 1, 2).setValue('Applications');
  dashSheet.getRange(weeklyStart + 1, 1, 1, 2).setFontWeight('bold').setBackground('#f0f0f0');

  const weekCounts = {};
  dates.forEach(d => {
    const weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const key = Utilities.formatDate(weekStart, Session.getScriptTimeZone(), 'MMM dd');
    weekCounts[key] = (weekCounts[key] || 0) + 1;
  });

  const sortedWeeks = Object.keys(weekCounts).sort((a, b) => new Date(a) - new Date(b));
  sortedWeeks.forEach((week, i) => {
    dashSheet.getRange(weeklyStart + 2 + i, 1).setValue(week);
    dashSheet.getRange(weeklyStart + 2 + i, 2).setValue(weekCounts[week]);
  });

  if (sortedWeeks.length > 1) {
    const chart3 = dashSheet.newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(dashSheet.getRange(weeklyStart + 1, 1, sortedWeeks.length + 1, 2))
      .setPosition(weeklyStart, 5, 0, 0)
      .setOption('title', 'Applications Per Week')
      .setOption('width', 400)
      .setOption('height', 250)
      .setOption('colors', ['#4285f4'])
      .setOption('legend', {position: 'none'})
      .setOption('curveType', 'function')
      .build();
    dashSheet.insertChart(chart3);
  }

  for (let i = 1; i <= 8; i++) {
    dashSheet.autoResizeColumn(i);
  }
}

// --- Custom Menu ---

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Job Tracker')
    .addItem('Sync Gmail', 'parseGmail')
    .addItem('Mark Ghosted (>14 days)', 'markGhosted')
    .addItem('Refresh Dashboard', 'buildDashboard')
    .addToUi();
}

// --- Auto-Sync Trigger (runs every 6 hours) ---

function setupAutoSync() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('parseGmail')
    .timeBased()
    .everyHours(6)
    .create();

  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(SpreadsheetApp.openById(SPREADSHEET_ID))
    .onOpen()
    .create();

  Logger.log('Setup Complete: Auto-sync set up! Gmail will be checked every 6 hours.');
}
