const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ueqtnjvdutesnxggcdwb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-XJHEWb_M7qrIvMeZnC_kA_aiZUQbOL';

const PASSWORDS = { papa: '060728', mama: '060804' };

const MEMBER_LABELS = { all: 'みんな', papa: 'パパ', mama: 'ママ', kotone: '琴音' };

const EVENT_EMOJIS = {
  '在宅': '🏠',
  '早朝全日出社': '🌅', '全日出社': '🏢', 'AM出社': '🌞', 'PM出社': '🌙',
  '早朝出社': '🌅', '出社': '🏢', '遅晩出社': '🌙', // 旧種別との互換
  '出張': '✈️', '飲み会': '🍻', '保育園イベント': '🎒', '会社休み': '🌴',
  'custom': '✏️',
};

function dateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function toICalDate(s) {
  return s.replace(/-/g, '');
}

function addOneDayIcal(dateString) {
  var d = new Date(dateString + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
}

function esc(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function getEventLabel(s) {
  if (s.event_type === 'custom') return s.event_label || '自由記述';
  return s.event_type;
}

module.exports = async function handler(req, res) {
  const filter = req.query.filter || 'all';
  const token  = req.query.token  || '';

  // プライベートビューのアクセス検証
  if (filter === 'papa' && token !== PASSWORDS.papa) {
    res.status(401).send('Unauthorized');
    return;
  }
  if (filter === 'mama' && token !== PASSWORDS.mama) {
    res.status(401).send('Unauthorized');
    return;
  }
  if (filter !== 'all' && filter !== 'papa' && filter !== 'mama') {
    res.status(400).send('Invalid filter');
    return;
  }

  // Supabase から取得（過去3ヶ月〜未来6ヶ月）
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 7, 0);

  const db = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await db
    .from('schedules')
    .select('*')
    .gte('date', dateStr(start))
    .lte('date', dateStr(end))
    .order('date');

  if (error) {
    res.status(500).send('Database error');
    return;
  }

  // フィルタリング
  let events = data || [];
  if (filter === 'all') {
    events = events.filter(s => !s.is_private);
  } else if (filter === 'papa') {
    events = events.filter(s => !s.is_private || s.is_private === 'papa_private');
  } else if (filter === 'mama') {
    events = events.filter(s => !s.is_private || s.is_private === 'mama_private');
  }

  // iCal 生成
  const calName =
    filter === 'papa' ? '夫婦の予定帳（パパ）' :
    filter === 'mama' ? '夫婦の予定帳（ママ）' :
    '夫婦の共有予定帳';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//fufu-yotei//JP',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + calName,
    'X-WR-TIMEZONE:Asia/Tokyo',
    'X-WR-CALDESC:家族の共有予定帳',
  ];

  for (const s of events) {
    const emoji       = EVENT_EMOJIS[s.event_type] || '📅';
    const label       = getEventLabel(s);
    const memberLabel = MEMBER_LABELS[s.member] || s.member;
    const summary     = emoji + ' ' + label + '（' + memberLabel + '）';
    const dtstart     = toICalDate(s.date);
    const dtend       = addOneDayIcal(s.date_end || s.date);

    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + s.id + '@fufu-yotei');
    lines.push('DTSTART;VALUE=DATE:' + dtstart);
    lines.push('DTEND;VALUE=DATE:' + dtend);
    lines.push('SUMMARY:' + esc(summary));

    const descParts = [];
    if (s.time_type && s.time_type !== 'all_day') {
      const timeLabels = { morning: '午前', afternoon: '午後', evening: '仕事終わり', custom: '' };
      const tl = s.time_type === 'custom'
        ? (s.time_start || '') + '〜' + (s.time_end || '')
        : timeLabels[s.time_type] || '';
      if (tl) descParts.push('時間: ' + tl);
    }
    if (s.office_location) descParts.push('出社先: ' + s.office_location);
    if (s.trip_destination) descParts.push('出張先: ' + s.trip_destination);
    if (s.return_time) descParts.push('帰宅予想: ' + s.return_time);
    if (s.needs_dinner === true) descParts.push('🍚 晩飯いる');
    if (s.needs_dinner === false) descParts.push('晩飯なし');
    if (s.comment) descParts.push('コメント: ' + s.comment);
    if (s.confirmed) descParts.push('✓ 確認済み');
    if (descParts.length) lines.push('DESCRIPTION:' + esc(descParts.join('\n')));

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="calendar.ics"');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(lines.join('\r\n'));
};
