/**
 * オフィスアワーの予約を、Googleカレンダーに入れる受け口。
 *
 * これは Google Apps Script のコードです。**無料枠だけで動きます。**
 * 置き場所と設定のしかたは demo_tool/README.md に書いてあります。
 *
 * Worker から次の形で届きます。
 *   { op: "add" | "remove", id, title, start, end, details, location }
 *
 * 決めていること
 * - **合言葉（TOKEN）が合わないものは、受け取りません。**
 *   URLを知られただけで予定を書き込まれては困るためです
 * - 取り消しは、追加のときに付けた印（id）で探して消します。
 *   タイトルで探すと、同じ名前の予定を巻き込みます
 * - 失敗しても、Worker 側の予約そのものは成立しています。
 *   ここが落ちても、受講者の予約は消えません
 */

// Worker の CALENDAR_TOKEN と同じ文字列にしてください
const TOKEN = 'ここに合言葉';

// 予定を入れるカレンダー。自分のカレンダーなら 'primary' のままで構いません
const CALENDAR_ID = 'primary';

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ error: '読み取れません' });
  }

  if (body.token !== TOKEN) {
    return reply({ error: '合言葉が違います' });
  }

  const cal = CALENDAR_ID === 'primary'
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(CALENDAR_ID);

  if (body.op === 'remove') {
    const found = findById(cal, body.id, body.start);
    if (found) found.deleteEvent();
    return reply({ ok: true, removed: Boolean(found) });
  }

  // 同じ予約が二重に入らないよう、先に探してから作る
  const already = findById(cal, body.id, body.start);
  if (already) return reply({ ok: true, already: true });

  const ev = cal.createEvent(
    body.title || 'オフィスアワー',
    new Date(body.start),
    new Date(body.end),
    { description: body.details || '', location: body.location || '' }
  );
  // あとで探せるように、予約の番号を印として付けておく
  ev.setTag('ohId', String(body.id || ''));
  return reply({ ok: true, id: ev.getId() });
}

/** その日の予定から、印（ohId）が一致するものを探す */
function findById(cal, id, start) {
  if (!id || !start) return null;
  const day = new Date(start);
  const from = new Date(day.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(day.getTime() + 24 * 60 * 60 * 1000);
  const events = cal.getEvents(from, to);
  for (const ev of events) {
    if (ev.getTag('ohId') === String(id)) return ev;
  }
  return null;
}

function reply(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
