// Full replacement Apps Script for Kkumkkuminton attendance management.
// Korean UI strings are written with Unicode escapes to avoid copy/paste encoding issues.

const MENU_TITLE_ = '\uafc8\uafb8\ubbfc\ud134 \uad00\ub9ac';
const MENU_SORT_ITEM_ = '\ud68c\uc6d0\uba85\ub2e8 \uc815\ub9ac + \uc6b4\uc601\uc9c4 \uc6b0\uc120 \uc815\ub82c';

const SHEET_MEMBERS_ = '\ud68c\uc6d0\uba85\ub2e8';
const SHEET_TODAY_ = '\uc624\ub298\uccb4\ud06c';
const SHEET_DASHBOARD_ = '\ub300\uc2dc\ubcf4\ub4dc';
const SHEET_LOG_ = '\ucd9c\uc11d\uae30\ub85d';
const SHEET_MANAGEMENT_ = '\uad00\ub9ac \uc790\ub3d9\ud654';

const H_MEMBER_NAME_ = '\ud68c\uc6d0\uba85';
const H_JOIN_DATE_ = '\uac00\uc785\uc77c';
const H_SEX_ = '\uc131\ubcc4';
const H_STAFF_ = '\uc6b4\uc601\uc9c4(Y/N)';
const H_EXEMPT_ = '\uba74\uc81c(Y/N)';
const H_NOTE_ = '\ube44\uace0';
const H_MEMO_ = '\uba54\ubaa8';

const STATUS_NORMAL_ = '\uc815\uc0c1';
const STATUS_REVIEW_ = '\uac15\ud1f4 \uac80\ud1a0';
const STATUS_JOIN_CHECK_ = '\uac00\uc785\uc77c\ud655\uc778';
const STATUS_EXEMPT_ = '\uc608\uc678';

const SEX_MALE_ = '\ub0a8';
const SEX_FEMALE_ = '\uc5ec';

const TODAY_CHECK_CONFIG_ = {
  sheetName: SHEET_TODAY_,
  startRow: 5,
  dateCell: 'B2',
  managerCell: 'B3',
  totalCountCell: 'D2',
  checkedCountCell: 'D3',
  memberCol: 2,
  checkCol: 3,
  statusCol: 4,
  memoCol: 5,
  recordedAtCol: 6,
};

const MANAGEMENT_AUTOMATION_CONFIG_ = {
  sheetName: SHEET_MANAGEMENT_,
  triggerCell: 'C2',
  lastRunCell: 'D2',
  resultCell: 'E2',
};

function onOpen(e) {
  resetTodayCheckIfNeeded_();
  SpreadsheetApp.getUi()
      .createMenu(MENU_TITLE_)
      .addItem(MENU_SORT_ITEM_, 'normalizeAndSortMembersAsc')
      .addToUi();
}

function onEdit(e) {
  if (!e || !e.range) return;

  const sheetName = e.range.getSheet().getName();

  if (sheetName === TODAY_CHECK_CONFIG_.sheetName) {
    handleTodayCheckEdit_(e);
    return;
  }

  if (sheetName === MANAGEMENT_AUTOMATION_CONFIG_.sheetName) {
    handleManagementAutomationEdit_(e);
  }
}

function handleTodayCheckEdit_(e) {
  const sheet = e.range.getSheet();
  const cfg = TODAY_CHECK_CONFIG_;

  resetTodayCheckIfNeeded_();

  const row = e.range.getRow();
  if (e.range.getColumn() !== cfg.checkCol || row < cfg.startRow) return;

  const value = String(e.value || '').trim().toUpperCase();

  if (value === '') {
    sheet.getRange(row, cfg.statusCol).clearContent();
    sheet.getRange(row, cfg.recordedAtCol).clearContent();
    return;
  }

  if (value !== 'O') {
    sheet.getRange(row, cfg.statusCol).setValue('O\ub9cc \uc785\ub825');
    return;
  }

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) {
    sheet.getRange(row, cfg.statusCol).setValue('\uc7a0\uc2dc \ud6c4 \uc7ac\uc2dc\ub3c4');
    return;
  }

  try {
    const ss = e.source;
    const log = ss.getSheetByName(SHEET_LOG_);
    const member = sheet.getRange(row, cfg.memberCol).getValue();
    const memo = sheet.getRange(row, cfg.memoCol).getValue();
    const manager = sheet.getRange(cfg.managerCell).getValue();
    const rawDate = sheet.getRange(cfg.dateCell).getValue();
    const date = normalizeDateObject_(rawDate) || new Date();

    if (!log) {
      sheet.getRange(row, cfg.statusCol).setValue('\ucd9c\uc11d\uae30\ub85d \uc5c6\uc74c');
      return;
    }

    if (!member) {
      sheet.getRange(row, cfg.statusCol).setValue('\ud68c\uc6d0\uba85 \uc5c6\uc74c');
      return;
    }

    const duplicated = hasAttendance_(log, date, member);
    const now = new Date();
    const recordedAtText = formatDateTime_(now);

    if (duplicated) {
      sheet.getRange(row, cfg.statusCol).setValue('\uc774\ubbf8\uae30\ub85d\ub428');
    } else {
      log.appendRow([date, member, 'O', manager, memo, recordedAtText]);
      sheet.getRange(row, cfg.statusCol).setValue('\uae30\ub85d\uc644\ub8cc');
    }

    sheet.getRange(row, cfg.recordedAtCol).setValue(recordedAtText);
  } finally {
    lock.releaseLock();
  }
}

function handleManagementAutomationEdit_(e) {
  const sheet = e.range.getSheet();
  const cfg = MANAGEMENT_AUTOMATION_CONFIG_;

  if (e.range.getA1Notation() !== cfg.triggerCell) return;

  const value = String(e.value || '').trim().toUpperCase();
  if (value !== 'TRUE') return;

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) {
    sheet.getRange(cfg.triggerCell).setValue(false);
    sheet.getRange(cfg.resultCell).setValue('\uc2e4\ud589\uc911\uc785\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uccb4\ud06c');
    return;
  }

  try {
    sheet.getRange(cfg.lastRunCell).setValue(formatDateTime_(new Date()));
    sheet.getRange(cfg.resultCell).setValue('\uc2e4\ud589\uc911...');
    SpreadsheetApp.flush();

    const result = normalizeAndSortMembersAscSilent_();

    sheet.getRange(cfg.lastRunCell).setValue(formatDateTime_(new Date()));
    sheet.getRange(cfg.resultCell).setValue(`\uc644\ub8cc: ${result.memberCount}\uba85 \ub3d9\uae30\ud654`);
  } catch (error) {
    sheet.getRange(cfg.lastRunCell).setValue(formatDateTime_(new Date()));
    sheet.getRange(cfg.resultCell).setValue(`\uc2e4\ud328: ${error.message || error}`);
  } finally {
    sheet.getRange(cfg.triggerCell).setValue(false);
    lock.releaseLock();
  }
}

function normalizeAndSortMembersAsc() {
  try {
    const result = normalizeAndSortMembersAscSilent_();
    SpreadsheetApp.getUi().alert(
        `\uc644\ub8cc: \ud68c\uc6d0\uba85\ub2e8, \uc624\ub298\uccb4\ud06c, \ub300\uc2dc\ubcf4\ub4dc\ub97c \uc6b4\uc601\uc9c4 \uc6b0\uc120 + \uac00\uc785\uc77c \uc624\ub984\ucc28\uc21c\uc73c\ub85c \uc815\ub9ac\ud588\uc2b5\ub2c8\ub2e4. (${result.memberCount}\uba85)`
    );
  } catch (error) {
    SpreadsheetApp.getUi().alert(`\uc2e4\ud328: ${error.message || error}`);
  }
}

function normalizeAndSortMembersAscSilent_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetByName(SHEET_MEMBERS_);
  const todaySheet = ss.getSheetByName(SHEET_TODAY_);
  const dashboard = ss.getSheetByName(SHEET_DASHBOARD_);

  if (!membersSheet || !todaySheet || !dashboard) {
    throw new Error('\ud68c\uc6d0\uba85\ub2e8/\uc624\ub298\uccb4\ud06c/\ub300\uc2dc\ubcf4\ub4dc \uc2dc\ud2b8\ub97c \ucc3e\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.');
  }

  const members = readMembers_(membersSheet);
  if (members.length === 0) {
    throw new Error('\uc815\ub9ac\ud560 \ud68c\uc6d0\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.');
  }

  members.sort((a, b) => {
    const staffDiff = Number(isStaff_(b.staff)) - Number(isStaff_(a.staff));
    if (staffDiff !== 0) return staffDiff;

    const dateDiff = normalizeJoinDate_(a.joinDate) - normalizeJoinDate_(b.joinDate);
    if (dateDiff !== 0) return dateDiff;

    return String(a.name).localeCompare(String(b.name), 'ko');
  });

  members.forEach((member, index) => {
    member.no = index + 1;
  });

  writeMemberSheet_(membersSheet, members);
  syncTodayCheck_(todaySheet, members);
  syncDashboard_(dashboard, members);

  SpreadsheetApp.flush();
  return {
    memberCount: members.length,
    staffCount: members.filter((member) => isStaff_(member.staff)).length,
  };
}

function readMembers_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), 7);
  if (lastRow < 2) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
      .map((header) => String(header || '').trim());
  const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const nameIndex = findHeaderIndex_(headers, H_MEMBER_NAME_, 1);
  const joinIndex = findHeaderIndex_(headers, H_JOIN_DATE_, 2);
  const sexIndex = findHeaderIndex_(headers, H_SEX_, 3);
  const staffIndex = findHeaderIndex_(headers, H_STAFF_, -1);
  const exemptIndex = findHeaderIndex_(headers, H_EXEMPT_, staffIndex >= 0 ? 5 : 4);
  const memoIndex = findHeaderIndexAny_(headers, [H_NOTE_, H_MEMO_], staffIndex >= 0 ? 6 : 5);
  const nameBackgrounds = sheet.getRange(2, nameIndex + 1, lastRow - 1, 1).getBackgrounds();

  return rows
      .map((row, rowIndex) => {
        const name = String(row[nameIndex] || '').trim();
        if (!name) return null;

        const explicitStaff = staffIndex >= 0 ? normalizeYn_(row[staffIndex]) : '';
        const colorStaff = isStaffColor_(nameBackgrounds[rowIndex][0]) ? 'Y' : '';

        return {
          no: '',
          name,
          joinDate: normalizeDateObject_(row[joinIndex]) || row[joinIndex],
          sex: normalizeSex_(row[sexIndex]),
          staff: explicitStaff || colorStaff || 'N',
          exempt: normalizeYn_(row[exemptIndex]),
          memo: row[memoIndex] || '',
        };
      })
      .filter(Boolean);
}

function writeMemberSheet_(sheet, members) {
  const clearRows = Math.max(sheet.getLastRow(), members.length + 1);
  sheet.getRange(1, 1, clearRows, 7).clearContent();

  sheet.getRange(1, 1, 1, 7).setValues([[
    'No',
    H_MEMBER_NAME_,
    H_JOIN_DATE_,
    H_SEX_,
    H_STAFF_,
    H_EXEMPT_,
    H_NOTE_,
  ]]);

  const values = members.map((member) => [
    member.no,
    member.name,
    member.joinDate,
    member.sex,
    member.staff,
    member.exempt,
    member.memo,
  ]);

  sheet.getRange(2, 1, values.length, 7).setValues(values);
  sheet.getRange(2, 3, Math.max(values.length, 1), 1).setNumberFormat('yyyy. m. d');

  sheet.getRange(2, 4, Math.max(values.length, 1), 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
          .requireValueInList(['', SEX_MALE_, SEX_FEMALE_], true)
          .setAllowInvalid(false)
          .build()
  );
  sheet.getRange(2, 5, Math.max(values.length, 1), 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
          .requireValueInList(['', 'Y', 'N'], true)
          .setAllowInvalid(false)
          .build()
  );
  sheet.getRange(2, 6, Math.max(values.length, 1), 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
          .requireValueInList(['', 'Y', 'N'], true)
          .setAllowInvalid(false)
          .build()
  );

  sheet.getRange(2, 2, Math.max(clearRows - 1, 1), 1).setBackground('#ffffff');
  const nameBackgrounds = members.map((member) => [
    isStaff_(member.staff) ? '#fff2cc' : '#ffffff',
  ]);
  sheet.getRange(2, 2, nameBackgrounds.length, 1).setBackgrounds(nameBackgrounds);
}

function syncTodayCheck_(sheet, members) {
  const cfg = TODAY_CHECK_CONFIG_;
  const startRow = cfg.startRow;
  const rowsToClear = Math.max(sheet.getLastRow() - startRow + 1, members.length, 1);

  sheet.getRange(startRow, 1, rowsToClear, 6).clearContent();
  sheet.getRange(startRow, 2, rowsToClear, 1).setBackground('#ffffff');

  const values = members.map((member, index) => [index + 1, member.name]);
  sheet.getRange(startRow, 1, values.length, 2).setValues(values);

  const nameBackgrounds = members.map((member) => [
    isStaff_(member.staff) ? '#fff2cc' : '#ffffff',
  ]);
  sheet.getRange(startRow, 2, nameBackgrounds.length, 1).setBackgrounds(nameBackgrounds);

  sheet.getRange(cfg.totalCountCell).setFormula(`=COUNTA(B${startRow}:B)`);
  sheet.getRange(cfg.checkedCountCell).setFormula(`=COUNTIF(C${startRow}:C,"O")`);
}

function syncDashboard_(sheet, members) {
  const startRow = 7;
  const endRow = startRow + members.length - 1;
  const rowsToClear = Math.max(sheet.getLastRow() - startRow + 1, members.length, 1);

  sheet.getRange(startRow, 1, rowsToClear, 10).clearContent();
  sheet.getRange(startRow, 2, rowsToClear, 1).setBackground('#ffffff');

  sheet.getRange('D2:H2').setValues([[
    '\ud68c\uc6d0\uc218',
    STATUS_NORMAL_,
    STATUS_REVIEW_,
    STATUS_JOIN_CHECK_,
    STATUS_EXEMPT_,
  ]]);
  sheet.getRange('D3:H3').setFormulas([[
    `=COUNTA('${SHEET_MEMBERS_}'!B2:B)`,
    `=COUNTIF($H$${startRow}:$H$${endRow},"${STATUS_NORMAL_}")`,
    `=COUNTIF($H$${startRow}:$H$${endRow},"${STATUS_REVIEW_}")`,
    `=COUNTIF($H$${startRow}:$H$${endRow},"${STATUS_JOIN_CHECK_}")`,
    `=COUNTIF($H$${startRow}:$H$${endRow},"${STATUS_EXEMPT_}")`,
  ]]);
  sheet.getRange('I2:I3').clearContent();

  sheet.getRange('K2:L7').clearContent();
  sheet.getRange('K2:L6').setValues([
    ['\ucd9c\uc11d\ud310\uc815', '\uc778\uc6d0'],
    [STATUS_NORMAL_, ''],
    [STATUS_REVIEW_, ''],
    [STATUS_JOIN_CHECK_, ''],
    [STATUS_EXEMPT_, ''],
  ]);
  sheet.getRange('L3:L6').setFormulas([
    [`=COUNTIF($H$${startRow}:$H$${endRow},K3)`],
    [`=COUNTIF($H$${startRow}:$H$${endRow},K4)`],
    [`=COUNTIF($H$${startRow}:$H$${endRow},K5)`],
    [`=COUNTIF($H$${startRow}:$H$${endRow},K6)`],
  ]);

  sheet.getRange('A6:I6').setValues([[
    'No',
    H_MEMBER_NAME_,
    H_JOIN_DATE_,
    '\ucd5c\uadfc\ucd9c\uc11d\uc77c',
    '\ud310\ub2e8\uae30\uc900\uc77c',
    '\ubbf8\ucc38\uc11d\uc77c\uc218',
    '\ucd5c\uadfc2\uac1c\uc6d4',
    '\ucd9c\uc11d\ud310\uc815',
    '\uba74\uc81c',
  ]]);
  sheet.getRange('J6').clearContent();

  const baseValues = members.map((member, index) => [index + 1, member.name]);
  sheet.getRange(startRow, 1, baseValues.length, 2).setValues(baseValues);

  const nameBackgrounds = members.map((member) => [
    isStaff_(member.staff) ? '#fff2cc' : '#ffffff',
  ]);
  sheet.getRange(startRow, 2, nameBackgrounds.length, 1).setBackgrounds(nameBackgrounds);

  const formulas = members.map((member, index) => {
    const r = startRow + index;
    const lastAttendance =
        `MAXIFS('${SHEET_LOG_}'!$A:$A,'${SHEET_LOG_}'!$B:$B,$B${r},'${SHEET_LOG_}'!$C:$C,"O")`;
    const joinDateLookup =
        `IFERROR(INDEX('${SHEET_MEMBERS_}'!$C:$C,MATCH($B${r},'${SHEET_MEMBERS_}'!$B:$B,0)),"")`;
    const exemptLookup =
        `IFERROR(INDEX('${SHEET_MEMBERS_}'!$F:$F,MATCH($B${r},'${SHEET_MEMBERS_}'!$B:$B,0)),"")`;

    return [
      `=IF($B${r}="","",${joinDateLookup})`,
      `=IF($B${r}="","",IFERROR(IF(${lastAttendance}=0,"",${lastAttendance}),""))`,
      `=IF(ISNUMBER($D${r}),$D${r},IF(ISNUMBER($C${r}),$C${r},""))`,
      `=IF(ISNUMBER($E${r}),MAX(0,$B$2-$E${r}),"")`,
      `=IF($B${r}="","",COUNTIFS('${SHEET_LOG_}'!$A:$A,">"&$B$4,'${SHEET_LOG_}'!$B:$B,$B${r},'${SHEET_LOG_}'!$C:$C,"O"))`,
      `=IF($B${r}="","",IF(UPPER($I${r})="Y","${STATUS_EXEMPT_}",IF(ISNUMBER($E${r}),IF($E${r}<=$B$4,"${STATUS_REVIEW_}","${STATUS_NORMAL_}"),"${STATUS_JOIN_CHECK_}")))`,
      `=IF($B${r}="","",${exemptLookup})`,
    ];
  });

  sheet.getRange(startRow, 3, formulas.length, 7).setFormulas(formulas);
  syncDashboardStatsAndCharts_(sheet);
}

function syncDashboardStatsAndCharts_(sheet) {
  sheet.getRange('N2:R12').clearContent();

  sheet.getRange('N2:O5').setValues([
    ['\uc131\ubcc4', '\uc778\uc6d0'],
    [SEX_MALE_, ''],
    [SEX_FEMALE_, ''],
    ['\ubbf8\uc785\ub825', ''],
  ]);
  sheet.getRange('O3:O5').setFormulas([
    [`=COUNTIF('${SHEET_MEMBERS_}'!D2:D,"${SEX_MALE_}")`],
    [`=COUNTIF('${SHEET_MEMBERS_}'!D2:D,"${SEX_FEMALE_}")`],
    [`=COUNTIFS('${SHEET_MEMBERS_}'!B2:B,"<>",'${SHEET_MEMBERS_}'!D2:D,"")`],
  ]);
  sheet.getRange('O3:O5').setNumberFormat('0');

  sheet.getRange('Q2:R2').setValues([[H_MEMBER_NAME_, '\ucd9c\uc11d\ud69f\uc218']]);
  sheet.getRange('Q3').setFormula(
      `=IFERROR(QUERY(FILTER({'${SHEET_LOG_}'!B2:B,'${SHEET_LOG_}'!A2:A,'${SHEET_LOG_}'!C2:C},'${SHEET_LOG_}'!C2:C="O",'${SHEET_LOG_}'!A2:A<=$B$2,ISNUMBER(MATCH('${SHEET_LOG_}'!B2:B,'${SHEET_MEMBERS_}'!B2:B,0))),"select Col1, count(Col1) group by Col1 order by count(Col1) desc limit 10 label Col1 '', count(Col1) ''",0),{"\uae30\ub85d\uc5c6\uc74c",0})`
  );
  sheet.getRange('R3:R12').setNumberFormat('0');

  sheet.getCharts().forEach((chart) => sheet.removeChart(chart));

  const genderChart = sheet.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(sheet.getRange('N2:O4'))
      .setPosition(2, 14, 0, 0)
      .setOption('title', '\uc131\ubcc4 \uad6c\uc131')
      .setOption('pieHole', 0.35)
      .setOption('pieSliceText', 'value')
      .setOption('pieSliceTextStyle', { fontSize: 14, bold: true })
      .setOption('legend', { position: 'right' })
      .setOption('tooltip', { text: 'value' })
      .setOption('width', 430)
      .setOption('height', 260)
      .build();
  sheet.insertChart(genderChart);

  const topChart = sheet.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(sheet.getRange('Q2:R12'))
      .setPosition(17, 14, 0, 0)
      .setOption('title', '\ucd9c\uc11d TOP10')
      .setOption('legend', { position: 'none' })
      .setOption('hAxis', { minValue: 0, format: '0', viewWindow: { min: 0 } })
      .setOption('annotations', { alwaysOutside: true })
      .setOption('width', 560)
      .setOption('height', 360)
      .build();
  sheet.insertChart(topChart);
}

function resetTodayCheckIfNeeded_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TODAY_CHECK_CONFIG_.sheetName);
  if (!sheet) return;

  const cfg = TODAY_CHECK_CONFIG_;
  const rawDate = sheet.getRange(cfg.dateCell).getValue();
  const date = normalizeDateObject_(rawDate) || new Date();
  const key = formatDateKey_(date);

  const props = PropertiesService.getDocumentProperties();
  const previousKey = props.getProperty('TODAY_CHECK_DATE');

  if (!previousKey) {
    props.setProperty('TODAY_CHECK_DATE', key);
    return;
  }

  if (previousKey === key) return;

  const lastRow = Math.max(sheet.getLastRow(), cfg.startRow);
  if (lastRow >= cfg.startRow) {
    sheet
        .getRange(cfg.startRow, cfg.checkCol, lastRow - cfg.startRow + 1, 4)
        .clearContent();
  }

  props.setProperty('TODAY_CHECK_DATE', key);
}

function hasAttendance_(log, date, member) {
  const targetDay = dayNumber_(date);
  const lastRow = Math.max(log.getLastRow(), 1);
  if (lastRow <= 1) return false;

  const values = log.getRange(2, 1, lastRow - 1, 2).getValues();
  return values.some(([loggedDate, loggedMember]) => {
    if (loggedMember !== member) return false;
    const loggedDateObject = normalizeDateObject_(loggedDate);
    if (!loggedDateObject) return false;
    return dayNumber_(loggedDateObject) === targetDay;
  });
}

function findHeaderIndex_(headers, name, fallbackIndex) {
  const index = headers.indexOf(name);
  return index >= 0 ? index : fallbackIndex;
}

function findHeaderIndexAny_(headers, names, fallbackIndex) {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index >= 0) return index;
  }
  return fallbackIndex;
}

function normalizeSex_(value) {
  const text = String(value || '').trim();
  return text === SEX_MALE_ || text === SEX_FEMALE_ ? text : '';
}

function normalizeYn_(value) {
  const text = String(value || '').trim().toUpperCase();
  return text === 'Y' ? 'Y' : text === 'N' ? 'N' : '';
}

function isStaff_(value) {
  return String(value || '').trim().toUpperCase() === 'Y';
}

function isStaffColor_(color) {
  const normalized = String(color || '').trim().toLowerCase();
  return ['#ffff00', '#fff2cc', '#ffe599', '#fff475'].includes(normalized);
}

function normalizeDateObject_(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function normalizeJoinDate_(value) {
  const date = normalizeDateObject_(value);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
}

function dayNumber_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatDateKey_(date) {
  return Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd');
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, 'Asia/Seoul', 'yyyy. MM. dd. HH:mm:ss');
}
