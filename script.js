'use strict';

// ===== 定数 =====
var MEMBERS = {
  all:    { label: 'みんな', color: '#3A9B77', bg: 'rgba(58,155,119,0.10)' },
  papa:   { label: 'パパ',  color: '#3B8FC0', bg: 'rgba(59,143,192,0.10)' },
  mama:   { label: 'ママ',  color: '#D45C78', bg: 'rgba(212,92,120,0.10)' },
  kotone: { label: '琴音',  color: '#E8782A', bg: 'rgba(232,120,42,0.10)' },
};

var EVENT_TYPES = [
  { id: '在宅',           emoji: '🏠' },
  { id: '早朝出社',       emoji: '🌅' },
  { id: '出社',           emoji: '🏢' },
  { id: '遅晩出社',       emoji: '🌙' },
  { id: '出張',           emoji: '✈️' },
  { id: '飲み会',         emoji: '🍻' },
  { id: '保育園イベント', emoji: '🎒' },
  { id: '会社休み',       emoji: '🌴' },
  { id: 'custom',         emoji: '✏️', label: '自由記述' },
];

var TIME_TYPES = [
  { id: 'all_day',   label: '終日' },
  { id: 'morning',   label: '午前' },
  { id: 'afternoon', label: '午後' },
  { id: 'evening',   label: '仕事終わり' },
  { id: 'custom',    label: '時間指定' },
];

var DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

// ===== プライベートモード =====
var PASSWORDS = { papa_private: '060728', mama_private: '060804' };
var PW_DURATION = 7 * 24 * 60 * 60 * 1000; // 1週間

function isUnlocked(filter) {
  try {
    var ts = localStorage.getItem('unlock_' + filter);
    return ts && (Date.now() - parseInt(ts, 10) < PW_DURATION);
  } catch (e) { return false; }
}
function setUnlocked(filter) {
  try { localStorage.setItem('unlock_' + filter, String(Date.now())); } catch (e) {}
}

var pendingFilter = null;

function openPwModal(filter) {
  pendingFilter = filter;
  document.getElementById('pwModalTitle').textContent =
    filter === 'papa_private' ? '🔑 パパのプライベート' : '🔑 ママのプライベート';
  document.getElementById('pwInput').value = '';
  document.getElementById('pwModal').classList.remove('hidden');
  setTimeout(function () { document.getElementById('pwInput').focus(); }, 80);
}
function closePwModal() {
  document.getElementById('pwModal').classList.add('hidden');
  pendingFilter = null;
}
function confirmPassword() {
  if (!pendingFilter) return;
  var input = document.getElementById('pwInput').value;
  if (input === PASSWORDS[pendingFilter]) {
    setUnlocked(pendingFilter);
    var f = pendingFilter;
    closePwModal();
    applyFilter(f);
  } else {
    showToast('パスワードが違います');
    document.getElementById('pwInput').value = '';
    document.getElementById('pwInput').focus();
  }
}
function applyFilter(f) {
  filterMember = f;
  document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
  var btn = document.querySelector('.filter-btn[data-filter="' + f + '"]');
  if (btn) btn.classList.add('active');
  render();
}

// ===== 状態 =====
var db = null;
var view = 'week'; // デフォルトは週表示
var navDate = new Date();
var schedules = [];
var filterMember = 'all'; // 'all' | 'papa_private' | 'mama_private'

// 追加/編集モーダル状態
var addDate      = null;
var addDateEnd   = null;
var addMember    = null;
var addEventType = null;
var addTimeType  = 'all_day';
var editingSchedule = null; // 編集中のスケジュール（nullなら新規追加）

// 詳細モーダル状態
var activeSchedule = null;

// ===== ユーティリティ =====
function dateStr(d) {
  var y   = d.getFullYear();
  var m   = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function parseDate(s) {
  var p = s.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

function formatDateJa(d) {
  return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + DAYS_JA[d.getDay()] + '）';
}

function isToday(d) {
  var t = new Date();
  return d.getFullYear() === t.getFullYear() &&
         d.getMonth()    === t.getMonth()    &&
         d.getDate()     === t.getDate();
}

function esc(s) {
  var el = document.createElement('div');
  el.textContent = String(s || '');
  return el.innerHTML;
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2600);
}

function getEventDisplay(s) {
  if (s.event_type === 'custom') {
    return { emoji: '✏️', label: s.event_label || '自由記述' };
  }
  var type = EVENT_TYPES.find(function (t) { return t.id === s.event_type; });
  return { emoji: type ? type.emoji : '📅', label: s.event_type };
}

function getTimeLabel(s) {
  switch (s.time_type) {
    case 'all_day':   return '終日';
    case 'morning':   return '午前';
    case 'afternoon': return '午後';
    case 'evening':   return '仕事終わり';
    case 'custom':    return (s.time_start || '') + '〜' + (s.time_end || '');
    default:          return '';
  }
}

function getDateRangeLabel(s) {
  if (!s.date_end || s.date_end === s.date) return formatDateJa(parseDate(s.date));
  return formatDateJa(parseDate(s.date)) + ' 〜 ' + formatDateJa(parseDate(s.date_end));
}

function getWeekStart(d) {
  var result = new Date(d);
  result.setDate(result.getDate() - result.getDay());
  result.setHours(0, 0, 0, 0);
  return result;
}

// 日付 ds がスケジュール s の範囲に含まれるか（複数日対応）
function eventCoversDate(s, ds) {
  if (!s.date_end || s.date_end === s.date) return s.date === ds;
  return s.date <= ds && s.date_end >= ds;
}

function getSchedulesForDate(ds) {
  return schedules.filter(function (s) { return eventCoversDate(s, ds); });
}

// すべてのモードで全メンバー行を表示
function getVisibleMembers() {
  return ['all', 'papa', 'mama', 'kotone'];
}

// フィルターに応じた可視イベントを返す
function getVisibleSchedulesForDate(ds) {
  return schedules.filter(function (s) {
    if (!eventCoversDate(s, ds)) return false;
    if (filterMember === 'all') return !s.is_private;
    return s.is_private === filterMember;
  });
}

// ===== データ =====
async function loadSchedules() {
  var year  = navDate.getFullYear();
  var month = navDate.getMonth();
  var start, end;

  if (view === 'month') {
    start = new Date(year, month - 1, 1);
    end   = new Date(year, month + 2, 0);
  } else {
    var ws = getWeekStart(navDate);
    start  = new Date(ws);
    start.setDate(start.getDate() - 21); // 3週間前まで（複数日イベント対応）
    end    = new Date(ws);
    end.setDate(end.getDate() + 21);
  }

  try {
    var r = await db.from('schedules')
      .select('*')
      .lte('date', dateStr(end))
      .gte('date', dateStr(start))
      .order('date')
      .order('created_at');
    if (!r.error) schedules = r.data || [];
  } catch (e) {
    console.error('loadSchedules error:', e);
  }
}

// ===== 描画 =====
function render() {
  updateCalTitle();
  if (view === 'month') renderMonth();
  else                   renderWeek();
}

function updateCalTitle() {
  var el = document.getElementById('calTitle');
  if (view === 'month') {
    el.textContent = navDate.getFullYear() + '年' + (navDate.getMonth() + 1) + '月';
  } else {
    var ws = getWeekStart(navDate);
    var we = new Date(ws);
    we.setDate(we.getDate() + 6);
    el.textContent =
      ws.getFullYear() + '年 ' +
      (ws.getMonth() + 1) + '/' + ws.getDate() + '〜' +
      (we.getMonth() + 1) + '/' + we.getDate();
  }
}

function renderMonth() {
  var grid = document.getElementById('monthGrid');
  grid.innerHTML = '';

  var year        = navDate.getFullYear();
  var month       = navDate.getMonth();
  var firstDow    = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();

  for (var i = 0; i < firstDow; i++) {
    var empty = document.createElement('div');
    empty.className = 'day-cell empty';
    grid.appendChild(empty);
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var date = new Date(year, month, d);
    var ds   = dateStr(date);
    var dow  = date.getDay();

    var cell = document.createElement('div');
    cell.className = 'day-cell' +
      (isToday(date) ? ' today' : '') +
      (dow === 0 ? ' sun' : '') +
      (dow === 6 ? ' sat' : '');
    cell.dataset.date = ds;

    var numEl = document.createElement('div');
    numEl.className = 'day-num';
    numEl.textContent = d;
    cell.appendChild(numEl);

    var dayScheds = getVisibleSchedulesForDate(ds);
    if (dayScheds.length > 0) {
      var dotsEl = document.createElement('div');
      dotsEl.className = 'day-dots';
      Object.keys(MEMBERS).forEach(function (m) {
        var count = dayScheds.filter(function (s) { return s.member === m; }).length;
        for (var k = 0; k < Math.min(count, 2); k++) {
          var dot = document.createElement('div');
          dot.className = 'day-dot';
          dot.style.background = MEMBERS[m].color;
          dotsEl.appendChild(dot);
        }
      });
      cell.appendChild(dotsEl);
    }

    (function (ds) {
      cell.addEventListener('click', function () { openDayModal(ds); });
    })(ds);

    grid.appendChild(cell);
  }
}

function renderWeek() {
  var grid = document.getElementById('weekGrid');
  grid.innerHTML = '';

  var ws   = getWeekStart(navDate);
  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(ws);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  var weekStart = dateStr(days[0]);
  var weekEnd   = dateStr(days[6]);

  // ヘッダー行
  var headerRow = document.createElement('div');
  headerRow.className = 'week-header-row';
  headerRow.appendChild(document.createElement('div')); // コーナー

  days.forEach(function (d) {
    var dow   = d.getDay();
    var isTod = isToday(d);
    var label = document.createElement('div');
    label.className = 'week-day-label' +
      (isTod ? ' today-col' : '') +
      (dow === 0 ? ' sun-col' : '') +
      (dow === 6 ? ' sat-col' : '');
    var numSpan = document.createElement('span');
    numSpan.className = 'wday-num';
    numSpan.textContent = d.getDate();
    label.appendChild(numSpan);
    label.appendChild(document.createTextNode(DAYS_JA[dow]));
    headerRow.appendChild(label);
  });
  grid.appendChild(headerRow);

  // フィルターに応じたメンバー行（バーレイアウト）
  getVisibleMembers().forEach(function (member) {
    var row = document.createElement('div');
    row.className = 'week-member-row';

    var mlabel = document.createElement('div');
    mlabel.className = 'week-member-label ' + member;
    mlabel.textContent = MEMBERS[member].label;
    row.appendChild(mlabel);

    // 7日分のラッパー
    var wrapper = document.createElement('div');
    wrapper.className = 'week-days-wrapper';

    // 背景セル（クリックで予定追加）
    var bgGrid = document.createElement('div');
    bgGrid.className = 'week-bg-grid';
    days.forEach(function (d) {
      var ds  = dateStr(d);
      var dow = d.getDay();
      var cell = document.createElement('div');
      cell.className = 'week-bg-cell' +
        (isToday(d)              ? ' today-col'   : '') +
        (dow === 0 || dow === 6  ? ' weekend-col' : '');
      (function (ds) {
        cell.addEventListener('click', function () { openAddModal(ds, member); });
      })(ds);
      bgGrid.appendChild(cell);
    });
    wrapper.appendChild(bgGrid);

    // イベントバー層
    var evLayer = document.createElement('div');
    evLayer.className = 'week-ev-layer';

    var memberEvents = schedules.filter(function (s) {
      if (s.member !== member) return false;
      if (!days.some(function (d) { return eventCoversDate(s, dateStr(d)); })) return false;
      if (filterMember === 'all') return !s.is_private;
      return s.is_private === filterMember;
    });

    memberEvents.forEach(function (s) {
      var eventEnd    = s.date_end || s.date;
      var clipStart   = s.date > weekStart ? s.date : weekStart;
      var clipEnd     = eventEnd < weekEnd  ? eventEnd : weekEnd;
      var colStart    = days.findIndex(function (d) { return dateStr(d) === clipStart; });
      var colEnd      = days.findIndex(function (d) { return dateStr(d) === clipEnd;   });
      if (colStart === -1) return;
      if (colEnd   === -1) colEnd = 6;

      var disp = getEventDisplay(s);
      var bar  = document.createElement('div');
      bar.className         = 'week-event-bar';
      bar.style.gridColumn  = (colStart + 1) + ' / ' + (colEnd + 2);
      bar.style.background  = MEMBERS[member].bg;
      bar.style.color       = MEMBERS[member].color;
      bar.style.borderColor = MEMBERS[member].color + '55';

      // 週をまたぐ場合は端を角丸なしにして「続き」を示す
      var rL = s.date >= weekStart ? '4px' : '2px';
      var rR = eventEnd <= weekEnd  ? '4px' : '2px';
      bar.style.borderRadius = rL + ' ' + rR + ' ' + rR + ' ' + rL;
      if (s.date < weekStart) bar.style.borderLeft = '3px solid ' + MEMBERS[member].color;
      if (eventEnd > weekEnd)  bar.style.borderRight = '3px solid ' + MEMBERS[member].color;

      bar.textContent = disp.emoji + ' ' + disp.label;

      (function (s) {
        bar.addEventListener('click', function (e) {
          e.stopPropagation();
          openDetailModal(s);
        });
      })(s);

      evLayer.appendChild(bar);
    });

    wrapper.appendChild(evLayer);
    row.appendChild(wrapper);
    grid.appendChild(row);
  });
}

// ===== 日付シート =====
function openDayModal(ds) {
  var dayScheds = getVisibleSchedulesForDate(ds);

  if (dayScheds.length === 0) {
    openAddModal(ds, null);
    return;
  }

  var d = parseDate(ds);
  document.getElementById('dayModalTitle').textContent = formatDateJa(d);

  var list = document.getElementById('dayEventList');
  list.innerHTML = '';

  dayScheds.forEach(function (s) {
    var disp   = getEventDisplay(s);
    var member = MEMBERS[s.member] || { label: s.member, color: '#999' };
    var tl     = getTimeLabel(s);

    var row = document.createElement('div');
    row.className = 'day-event-row';

    var dot = document.createElement('span');
    dot.className = 'day-event-member-dot';
    dot.style.background = member.color;
    row.appendChild(dot);

    var info = document.createElement('div');
    info.className = 'day-event-info';

    var labelText = disp.emoji + ' ' + disp.label;
    if (s.date_end && s.date_end !== s.date) {
      labelText += '（〜' + formatDateJa(parseDate(s.date_end)) + '）';
    }

    info.innerHTML =
      '<span class="day-event-label">' + labelText + '</span>' +
      '<span class="day-event-meta">' + esc(member.label) + ' · ' + esc(tl) + '</span>';
    row.appendChild(info);

    if (s.confirmed) {
      var badge = document.createElement('span');
      badge.className = 'day-event-badge';
      badge.textContent = '✓';
      badge.style.color = '#3A9B77';
      row.appendChild(badge);
    }
    if (s.wants_discussion) {
      var dbadge = document.createElement('span');
      dbadge.className = 'day-event-badge';
      dbadge.textContent = '💬';
      row.appendChild(dbadge);
    }

    (function (s) {
      row.addEventListener('click', function () {
        closeDayModal();
        openDetailModal(s);
      });
    })(s);

    list.appendChild(row);
  });

  document.getElementById('dayAddBtn').onclick = function () {
    closeDayModal();
    openAddModal(ds, null);
  };

  document.getElementById('dayModal').classList.remove('hidden');
}

function closeDayModal() {
  document.getElementById('dayModal').classList.add('hidden');
}

// ===== 追加/編集モーダル =====
function openAddModal(ds, member) {
  editingSchedule = null;
  addDate      = ds;
  addDateEnd   = null;
  addMember    = member || null;
  addEventType = null;
  addTimeType  = 'all_day';

  document.getElementById('addModalTitle').textContent = '予定を追加';
  document.getElementById('modalDateDisplay').textContent = formatDateJa(parseDate(ds));

  // 複数日リセット
  var toggle = document.getElementById('multiDayToggle');
  toggle.checked = false;
  document.getElementById('dateEndRow').classList.add('hidden');
  document.getElementById('dateEndInput').value = '';
  document.getElementById('dateEndInput').min   = ds;

  // その他リセット
  document.getElementById('customLabelInput').value = '';
  document.getElementById('customLabelInput').classList.add('hidden');
  document.getElementById('customTimeRow').classList.add('hidden');
  document.getElementById('timeStartInput').value = '';
  document.getElementById('timeEndInput').value   = '';

  // メンバーボタン
  document.querySelectorAll('.member-btn').forEach(function (btn) {
    btn.classList.toggle('selected', btn.dataset.member === addMember);
  });

  renderEventTypeGrid();
  renderTimeTypeGrid();
  document.getElementById('addModal').classList.remove('hidden');
}

function openEditModal(s) {
  editingSchedule = s;
  addDate      = s.date;
  addDateEnd   = s.date_end || null;
  addMember    = s.member;
  addEventType = s.event_type;
  addTimeType  = s.time_type || 'all_day';

  document.getElementById('addModalTitle').textContent = '予定を編集';
  document.getElementById('modalDateDisplay').textContent = formatDateJa(parseDate(s.date));

  // 複数日
  var toggle = document.getElementById('multiDayToggle');
  var hasEnd = !!(s.date_end && s.date_end !== s.date);
  toggle.checked = hasEnd;
  document.getElementById('dateEndRow').classList.toggle('hidden', !hasEnd);
  document.getElementById('dateEndInput').value = s.date_end || '';
  document.getElementById('dateEndInput').min   = s.date;

  // 自由記述
  var ci = document.getElementById('customLabelInput');
  ci.value = (s.event_type === 'custom' ? s.event_label || '' : '');
  ci.classList.toggle('hidden', s.event_type !== 'custom');

  // 時間指定
  var cr = document.getElementById('customTimeRow');
  cr.classList.toggle('hidden', s.time_type !== 'custom');
  document.getElementById('timeStartInput').value = s.time_start || '';
  document.getElementById('timeEndInput').value   = s.time_end   || '';

  // メンバーボタン
  document.querySelectorAll('.member-btn').forEach(function (btn) {
    btn.classList.toggle('selected', btn.dataset.member === addMember);
  });

  renderEventTypeGrid();
  renderTimeTypeGrid();
  document.getElementById('addModal').classList.remove('hidden');
}

function closeAddModal() {
  document.getElementById('addModal').classList.add('hidden');
  editingSchedule = null;
}

function renderEventTypeGrid() {
  var grid = document.getElementById('eventTypeGrid');
  grid.innerHTML = '';
  EVENT_TYPES.forEach(function (type) {
    var btn = document.createElement('button');
    btn.className = 'event-type-btn' + (addEventType === type.id ? ' selected' : '');
    btn.dataset.type = type.id;
    btn.innerHTML = '<span>' + type.emoji + '</span>' + esc(type.label || type.id);
    btn.addEventListener('click', function () {
      addEventType = this.dataset.type;
      renderEventTypeGrid();
      var ci = document.getElementById('customLabelInput');
      if (addEventType === 'custom') {
        ci.classList.remove('hidden');
        ci.focus();
      } else {
        ci.classList.add('hidden');
      }
    });
    grid.appendChild(btn);
  });
}

function renderTimeTypeGrid() {
  var grid = document.getElementById('timeTypeGrid');
  grid.innerHTML = '';
  TIME_TYPES.forEach(function (type) {
    var btn = document.createElement('button');
    btn.className = 'time-type-btn' + (addTimeType === type.id ? ' selected' : '');
    btn.dataset.type = type.id;
    btn.textContent = type.label;
    btn.addEventListener('click', function () {
      addTimeType = this.dataset.type;
      renderTimeTypeGrid();
      var cr = document.getElementById('customTimeRow');
      if (addTimeType === 'custom') cr.classList.remove('hidden');
      else                           cr.classList.add('hidden');
    });
    grid.appendChild(btn);
  });
}

async function saveSchedule() {
  if (!addDate)      { showToast('日付が選択されていません'); return; }
  if (!addMember)    { showToast('だれかを選んでください'); return; }
  if (!addEventType) { showToast('内容を選んでください'); return; }

  var customLabel = null;
  if (addEventType === 'custom') {
    customLabel = document.getElementById('customLabelInput').value.trim();
    if (!customLabel) { showToast('内容を入力してください'); return; }
  }

  if (addDateEnd && addDateEnd < addDate) {
    showToast('終了日は開始日以降にしてください'); return;
  }

  var timeStart = null, timeEnd = null;
  if (addTimeType === 'custom') {
    timeStart = document.getElementById('timeStartInput').value || null;
    timeEnd   = document.getElementById('timeEndInput').value   || null;
  }

  var record = {
    date:             addDate,
    date_end:         addDateEnd || null,
    member:           addMember,
    event_type:       addEventType,
    event_label:      customLabel,
    time_type:        addTimeType,
    time_start:       timeStart,
    time_end:         timeEnd,
    is_private:       (filterMember === 'all') ? null : filterMember,
  };

  try {
    var r;
    if (editingSchedule) {
      // 編集：UPDATE
      r = await db.from('schedules')
        .update(record)
        .eq('id', editingSchedule.id)
        .select().single();
    } else {
      // 新規：INSERT
      record.confirmed        = false;
      record.wants_discussion = false;
      record.comment          = null;
      r = await db.from('schedules').insert(record).select().single();
    }

    if (r.error) throw r.error;

    updateCache(r.data);
    closeAddModal();
    render();
    showToast(editingSchedule ? '更新しました ✓' : '保存しました ✓');

    setTimeout(function () { openDetailModal(r.data); }, 320);
  } catch (e) {
    console.error('saveSchedule error:', e);
    showToast('保存に失敗しました');
  }
}

// ===== 詳細モーダル =====
function openDetailModal(s) {
  activeSchedule = s;
  var body = document.getElementById('detailBody');
  body.innerHTML = '';
  renderDetailBody(s, body);
  document.getElementById('detailModal').classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.add('hidden');
  activeSchedule = null;
}

function renderDetailBody(s, body) {
  var member = MEMBERS[s.member] || { label: s.member, color: '#999', bg: 'rgba(150,150,150,0.10)' };
  var disp   = getEventDisplay(s);
  var tl     = getTimeLabel(s);
  var dateLabel = getDateRangeLabel(s);

  // イベントヘッダー
  var header = document.createElement('div');
  header.className = 'detail-event-header';
  header.style.background = member.bg;
  header.innerHTML =
    '<div class="detail-event-emoji">' + disp.emoji + '</div>' +
    '<div class="detail-event-info">' +
      '<div class="detail-event-name" style="color:' + member.color + '">' +
        esc(member.label) + ' · ' + esc(disp.label) +
      '</div>' +
      '<div class="detail-event-meta">' + esc(dateLabel) + '<br>' + esc(tl) + '</div>' +
    '</div>';
  body.appendChild(header);

  // 確認済みバッジ
  if (s.confirmed) {
    var badge = document.createElement('div');
    badge.className = 'confirmed-badge';
    badge.innerHTML = '✓ 確認済み';
    body.appendChild(badge);
  }

  // コメント表示
  if (s.comment) {
    var clabel = document.createElement('div');
    clabel.className = 'detail-section-label';
    clabel.textContent = 'コメント';
    body.appendChild(clabel);

    var cdisplay = document.createElement('div');
    cdisplay.className = 'comment-display';
    cdisplay.textContent = s.comment;
    body.appendChild(cdisplay);
  }

  // アクションボタン行（確認・話し合い）
  var actionRow = document.createElement('div');
  actionRow.className = 'action-row';

  var confirmBtn = document.createElement('button');
  confirmBtn.className = 'action-btn' + (s.confirmed ? ' confirmed' : '');
  confirmBtn.innerHTML = s.confirmed ? '✓ 確認済み' : '✓ 確認した';
  (function (s) {
    confirmBtn.addEventListener('click', function () { onConfirm(s, body); });
  })(s);
  actionRow.appendChild(confirmBtn);

  var discussBtn = document.createElement('button');
  discussBtn.className = 'action-btn' + (s.wants_discussion ? ' discussing' : '');
  discussBtn.innerHTML = '💬 話し合いたい';
  discussBtn.addEventListener('click', function () { toggleCommentForm(s, body); });
  actionRow.appendChild(discussBtn);

  body.appendChild(actionRow);

  // コメントフォーム
  var commentFormWrap = document.createElement('div');
  commentFormWrap.id = 'commentFormWrap';
  commentFormWrap.className = 'comment-form hidden';

  var textarea = document.createElement('textarea');
  textarea.className = 'comment-textarea';
  textarea.id = 'commentTextarea';
  textarea.placeholder = 'コメントを入力…';
  textarea.value = s.comment || '';
  commentFormWrap.appendChild(textarea);

  var saveCommentBtn = document.createElement('button');
  saveCommentBtn.className = 'comment-save-btn';
  saveCommentBtn.textContent = 'コメントを保存';
  (function (s) {
    saveCommentBtn.addEventListener('click', function () { onSaveComment(s, body); });
  })(s);
  commentFormWrap.appendChild(saveCommentBtn);
  body.appendChild(commentFormWrap);

  // LINE共有ボタン
  var lineBtn = document.createElement('button');
  lineBtn.className = 'line-btn';
  lineBtn.innerHTML = '<span>💬</span> LINEで通知する';
  (function (s) {
    lineBtn.addEventListener('click', function () { shareToLine(s, false); });
  })(s);
  body.appendChild(lineBtn);

  // 編集・削除ボタン行
  var detailActionRow = document.createElement('div');
  detailActionRow.className = 'detail-action-row';

  var editBtn = document.createElement('button');
  editBtn.className = 'edit-btn';
  editBtn.textContent = '✏️ 編集する';
  (function (s) {
    editBtn.addEventListener('click', function () {
      closeDetailModal();
      openEditModal(s);
    });
  })(s);
  detailActionRow.appendChild(editBtn);

  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '削除する';
  (function (s) {
    deleteBtn.addEventListener('click', function () { onDelete(s); });
  })(s);
  detailActionRow.appendChild(deleteBtn);

  body.appendChild(detailActionRow);
}

async function onConfirm(s, body) {
  try {
    var now = new Date().toISOString();
    var r = await db.from('schedules')
      .update({ confirmed: true, confirmed_at: now, updated_at: now })
      .eq('id', s.id)
      .select().single();
    if (r.error) throw r.error;

    updateCache(r.data);
    body.innerHTML = '';
    renderDetailBody(r.data, body);
    activeSchedule = r.data;
    showToast('確認しました ✓');
    render();
  } catch (e) {
    showToast('更新に失敗しました');
  }
}

function toggleCommentForm(s, body) {
  var wrap = document.getElementById('commentFormWrap');
  if (!wrap) return;
  if (wrap.classList.contains('hidden')) {
    wrap.classList.remove('hidden');
    var ta = document.getElementById('commentTextarea');
    if (ta) ta.focus();
  } else {
    wrap.classList.add('hidden');
  }
}

async function onSaveComment(s, body) {
  var ta = document.getElementById('commentTextarea');
  if (!ta) return;
  var comment = ta.value.trim();
  if (!comment) { showToast('コメントを入力してください'); return; }

  try {
    var now = new Date().toISOString();
    var r = await db.from('schedules')
      .update({ comment: comment, wants_discussion: true, updated_at: now })
      .eq('id', s.id)
      .select().single();
    if (r.error) throw r.error;

    updateCache(r.data);
    body.innerHTML = '';
    renderDetailBody(r.data, body);
    activeSchedule = r.data;
    showToast('コメントを保存しました');
    render();

    setTimeout(function () { shareToLine(r.data, true); }, 200);
  } catch (e) {
    showToast('保存に失敗しました');
  }
}

async function onDelete(s) {
  if (!window.confirm('この予定を削除しますか？')) return;
  try {
    var r = await db.from('schedules').delete().eq('id', s.id);
    if (r.error) throw r.error;

    schedules = schedules.filter(function (x) { return x.id !== s.id; });
    closeDetailModal();
    render();
    showToast('削除しました');
  } catch (e) {
    showToast('削除に失敗しました');
  }
}

function updateCache(updated) {
  var idx = schedules.findIndex(function (x) { return x.id === updated.id; });
  if (idx !== -1) schedules[idx] = updated;
  else            schedules.push(updated);
}

// ===== LINE 共有 =====
function shareToLine(s, isDiscuss) {
  var disp      = getEventDisplay(s);
  var tl        = getTimeLabel(s);
  var dateLabel = getDateRangeLabel(s);
  var mLabel    = MEMBERS[s.member] ? MEMBERS[s.member].label : s.member;
  var text;

  if (isDiscuss) {
    text = '💬 話し合いたい！\n' +
      mLabel + '｜' + dateLabel + ' ' + disp.emoji + ' ' + disp.label + '\n' +
      (s.comment ? '「' + s.comment + '」' : '');
  } else {
    text = '📅 ' + mLabel + '｜' + dateLabel + '\n' +
      disp.emoji + ' ' + disp.label + '（' + tl + '）\n' +
      '夫婦の共有予定帳に登録しました';
  }

  var url = 'https://line.me/R/share?text=' + encodeURIComponent(text);
  window.open(url, '_blank');
}

// ===== ナビゲーション =====
async function navigate(dir) {
  if (view === 'month') {
    navDate.setMonth(navDate.getMonth() + dir);
  } else {
    navDate.setDate(navDate.getDate() + dir * 7);
  }
  await loadSchedules();
  render();
}

async function goToday() {
  navDate = new Date();
  await loadSchedules();
  render();
}

// ===== イベントリスナー =====
function setupEventListeners() {
  // ビュー切替
  document.querySelectorAll('.view-tab').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      view = this.dataset.view;
      document.querySelectorAll('.view-tab').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      document.getElementById('monthView').classList.toggle('hidden', view !== 'month');
      document.getElementById('weekView').classList.toggle('hidden', view !== 'week');
      await loadSchedules();
      render();
    });
  });

  // ナビゲーション
  document.getElementById('prevBtn').addEventListener('click', function () { navigate(-1); });
  document.getElementById('nextBtn').addEventListener('click', function () { navigate(1); });
  document.getElementById('todayBtn').addEventListener('click', goToday);

  // FAB
  document.getElementById('fab').addEventListener('click', function () {
    openAddModal(dateStr(new Date()), null);
  });

  // 日付シート
  document.getElementById('dayOverlay').addEventListener('click', closeDayModal);
  document.getElementById('dayCloseBtn').addEventListener('click', closeDayModal);

  // 追加モーダル
  document.getElementById('addOverlay').addEventListener('click', closeAddModal);
  document.getElementById('addCloseBtn').addEventListener('click', closeAddModal);
  document.getElementById('saveBtn').addEventListener('click', saveSchedule);

  // 複数日トグル
  document.getElementById('multiDayToggle').addEventListener('change', function () {
    var row = document.getElementById('dateEndRow');
    if (this.checked) {
      row.classList.remove('hidden');
      document.getElementById('dateEndInput').focus();
    } else {
      row.classList.add('hidden');
      addDateEnd = null;
      document.getElementById('dateEndInput').value = '';
    }
  });

  // 終了日選択
  document.getElementById('dateEndInput').addEventListener('change', function () {
    addDateEnd = this.value || null;
  });

  // メンバーボタン
  document.querySelectorAll('.member-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      addMember = this.dataset.member;
      document.querySelectorAll('.member-btn').forEach(function (b) { b.classList.remove('selected'); });
      this.classList.add('selected');
    });
  });

  // フィルターボタン
  document.querySelectorAll('.filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = this.dataset.filter;
      if (f === 'papa_private' || f === 'mama_private') {
        if (!isUnlocked(f)) { openPwModal(f); return; }
      }
      applyFilter(f);
    });
  });

  // パスワードモーダル
  document.getElementById('pwOverlay').addEventListener('click', closePwModal);
  document.getElementById('pwCloseBtn').addEventListener('click', closePwModal);
  document.getElementById('pwConfirmBtn').addEventListener('click', confirmPassword);
  document.getElementById('pwInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') confirmPassword();
  });

  // 詳細モーダル
  document.getElementById('detailOverlay').addEventListener('click', closeDetailModal);
  document.getElementById('detailCloseBtn').addEventListener('click', closeDetailModal);
}

// ===== 初期化 =====
async function init() {
  try {
    var res = await fetch('config.json');
    var cfg = await res.json();
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  } catch (e) {
    console.error('Config error:', e);
    showToast('接続エラーが発生しました');
    return;
  }

  setupEventListeners();
  await loadSchedules();
  render();
}

init();
