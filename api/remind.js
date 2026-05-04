'use strict';

const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ueqtnjvdutesnxggcdwb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

const MEMBER_LABELS = { all: 'みんな', papa: 'パパ', mama: 'ママ', kotone: '琴音' };
const EVENT_EMOJIS = {
  '在宅': '🏠', '早朝全日出社': '🌅', '全日出社': '🏢',
  'AM出社': '🌞', 'PM出社': '🌙', '出張': '✈️',
  '飲み会': '🍻', '保育園イベント': '🎒', '会社休み': '🌴', 'custom': '✏️',
};

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_EMAIL || ''),
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

function getJSTDate(date) {
  // UTC + 9h
  var jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst;
}

function dateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function addDays(d, n) {
  var r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getEventLabel(s) {
  if (s.event_type === 'custom') return s.event_label || '自由記述';
  return s.event_type;
}

function buildNotificationBody(s) {
  var emoji = EVENT_EMOJIS[s.event_type] || '📅';
  var label = getEventLabel(s);
  var member = MEMBER_LABELS[s.member] || s.member;
  var parts = [member + '｜' + emoji + ' ' + label];

  if (s.office_location) parts.push(s.office_location);
  if (s.trip_destination) parts.push(s.trip_destination);
  if (s.return_time) parts.push('帰宅予想 ' + s.return_time);
  if (s.needs_dinner) parts.push('🍚 晩飯いる');
  if (s.place) parts.push('📍 ' + s.place);

  return parts.join('\n');
}

async function sendPushToSubscriptions(subscriptions, payload) {
  var results = await Promise.allSettled(
    subscriptions.map(function(row) {
      return webpush.sendNotification(row.subscription, JSON.stringify(payload));
    })
  );
  results.forEach(function(r, i) {
    if (r.status === 'rejected') console.error('push failed:', subscriptions[i].member, r.reason.statusCode);
  });
}

module.exports = async function handler(req, res) {
  // Vercel Cron の認証（CRON_SECRET が設定されている場合）
  if (process.env.CRON_SECRET && req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    res.status(500).json({ error: 'VAPID keys not configured' });
    return;
  }

  var now = new Date();
  var jst = getJSTDate(now);
  var jstHour   = jst.getUTCHours();
  var todayStr  = dateStr(jst);
  var tomorrowStr = dateStr(addDays(jst, 1));

  var db = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 処理するリマインドを決定
  var targetDates = [];
  var targetTimings = [];

  if (jstHour === 7) {
    // 当日朝: morning (今日) + prev_day (明日)
    targetDates.push({ date: todayStr,     timing: 'morning' });
    targetDates.push({ date: tomorrowStr,  timing: 'prev_day' });
  } else if (jstHour === 20) {
    // 夜: prev_day (明日) も送る（Proプランで2回目の実行がある場合）
    targetDates.push({ date: tomorrowStr,  timing: 'prev_day' });
  }

  // リマインド対象の予定を取得（今日・明日）
  var datesToQuery = [todayStr, tomorrowStr];
  var { data: scheduleData, error: scheduleErr } = await db
    .from('schedules')
    .select('*')
    .in('date', datesToQuery)
    .eq('reminder_enabled', true);

  if (scheduleErr) {
    console.error('schedule query error:', scheduleErr);
    res.status(500).json({ error: 'DB error' });
    return;
  }

  var allSchedules = scheduleData || [];

  // 購読情報を取得
  var { data: subData } = await db.from('push_subscriptions').select('member, subscription');
  var subsByMember = {};
  (subData || []).forEach(function(row) {
    if (!subsByMember[row.member]) subsByMember[row.member] = [];
    subsByMember[row.member].push(row);
  });

  var notified = 0;

  for (var i = 0; i < targetDates.length; i++) {
    var td = targetDates[i];
    var matchingSchedules = allSchedules.filter(function(s) {
      return s.date === td.date &&
        s.reminder_timing && s.reminder_timing.includes(td.timing);
    });

    for (var j = 0; j < matchingSchedules.length; j++) {
      var s = matchingSchedules[j];
      var targets = s.reminder_targets || [];

      var memberTargets = [];
      if (targets.includes('papa')) memberTargets.push('papa');
      if (targets.includes('mama')) memberTargets.push('mama');

      if (memberTargets.length === 0) continue;

      var isTomorrow = td.timing === 'prev_day';
      var dateLabel = isTomorrow ? '明日の予定' : '今日の予定';
      var title = '📅 ' + dateLabel;
      var body = buildNotificationBody(s);

      for (var k = 0; k < memberTargets.length; k++) {
        var member = memberTargets[k];
        var subs = subsByMember[member];
        if (!subs || subs.length === 0) continue;

        await sendPushToSubscriptions(subs, {
          title: title,
          body:  body,
          icon:  '/icon-192.png',
          badge: '/icon-192.png',
          url:   '/',
          tag:   'remind-' + s.id + '-' + td.timing,
        });
        notified++;
      }
    }
  }

  // one_hour: 時刻指定の予定を1時間前に通知（Proプラン向け、hourlyで動作）
  var nowJstMinutes = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  var targetMinutes = nowJstMinutes + 60; // 1時間後
  var targetH = Math.floor(targetMinutes / 60) % 24;
  var targetM = targetMinutes % 60;
  var targetTimeStr = String(targetH).padStart(2, '0') + ':' + String(targetM).padStart(2, '0');

  var oneHourSchedules = allSchedules.filter(function(s) {
    return s.date === todayStr &&
      s.time_type === 'custom' &&
      s.time_start &&
      s.reminder_timing && s.reminder_timing.includes('one_hour') &&
      s.time_start >= targetTimeStr.slice(0, 4) + '0' &&
      s.time_start <= targetTimeStr.slice(0, 4) + '9';
  });

  for (var m = 0; m < oneHourSchedules.length; m++) {
    var s2 = oneHourSchedules[m];
    var targets2 = s2.reminder_targets || [];
    var memberTargets2 = [];
    if (targets2.includes('papa')) memberTargets2.push('papa');
    if (targets2.includes('mama')) memberTargets2.push('mama');

    for (var n = 0; n < memberTargets2.length; n++) {
      var subs2 = subsByMember[memberTargets2[n]];
      if (!subs2 || subs2.length === 0) continue;
      await sendPushToSubscriptions(subs2, {
        title: '🔔 もうすぐ予定があります',
        body:  buildNotificationBody(s2),
        icon:  '/icon-192.png',
        badge: '/icon-192.png',
        url:   '/',
        tag:   'remind-' + s2.id + '-one_hour',
      });
      notified++;
    }
  }

  res.status(200).json({ ok: true, notified: notified, jstHour: jstHour });
};
