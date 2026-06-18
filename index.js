import 'dotenv/config';
import pkg from '@slack/bolt';
const { App } = pkg;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Rate limiting: track last post time per user (1 post per minute)
const lastPostTime = new Map();
const RATE_LIMIT_MS = 60_000;

// Post a message to Vestaboard via the Read/Write API
async function postToVestaboard(message) {
  const response = await fetch('https://rw.vestaboard.com/', {
    method: 'POST',
    headers: {
      'X-Vestaboard-Read-Write-Key': process.env.VESTABOARD_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: message }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vestaboard API error ${response.status}: ${text}`);
  }

  return response.json();
}

// Post a raw 6x22 character code grid to Vestaboard
async function postGridToVestaboard(grid) {
  const response = await fetch('https://rw.vestaboard.com/', {
    method: 'POST',
    headers: {
      'X-Vestaboard-Read-Write-Key': process.env.VESTABOARD_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(grid),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vestaboard API error ${response.status}: ${text}`);
  }

  return response.json();
}

// ── Tide helpers ──────────────────────────────────────────────────────────────

const NOAA_STATION = process.env.TIDE_STATION ?? '8444762'; // Cohasset Harbor
const BLANK = 0;

// Vestaboard character codes (official encoding)
const CHAR_CODES = {
  ' ': 0,
  A:1,  B:2,  C:3,  D:4,  E:5,  F:6,  G:7,  H:8,  I:9,  J:10,
  K:11, L:12, M:13, N:14, O:15, P:16, Q:17, R:18, S:19, T:20,
  U:21, V:22, W:23, X:24, Y:25, Z:26,
  '1':27, '2':28, '3':29, '4':30, '5':31,
  '6':32, '7':33, '8':34, '9':35, '0':36,
  ':': 50,
};

function charCode(ch) {
  return CHAR_CODES[ch.toUpperCase()] ?? BLANK;
}

function textRow(text, width = 22) {
  const codes = [...text.slice(0, width)].map(charCode);
  while (codes.length < width) codes.push(BLANK);
  return codes;
}

async function getTodayTides() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const params = new URLSearchParams({
    product: 'predictions', datum: 'MLLW', time_zone: 'lst_ldt',
    interval: 'hilo', units: 'english', station: NOAA_STATION,
    begin_date: dateStr, end_date: dateStr,
    application: 'vestabot_slack', format: 'json',
  });
  const res = await fetch(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params}`);
  if (!res.ok) throw new Error(`NOAA HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`NOAA: ${data.error.message}`);
  return (data.predictions ?? []).map(p => ({
    time: new Date(p.t.replace(' ', 'T')),
    height: parseFloat(p.v),
    type: p.type,
  }));
}

function formatTideTime(date) {
  const h    = date.getHours();
  const m    = date.getMinutes();
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

function buildTideGrid(tides) {
  const highs = tides.filter(t => t.type === 'H').slice(0, 2);
  const lows  = tides.filter(t => t.type === 'L').slice(0, 2);

  // Each time row: high left-aligned at col 0 (13 chars), low right-aligned in cols 13–21 (9 chars)
  function timeRow(high, low) {
    const h = (high ? formatTideTime(high.time) : '').padEnd(13).slice(0, 13);
    const l = (low  ? formatTideTime(low.time)  : '').padStart(9).slice(0, 9);
    return textRow(h + l);
  }

  return [
    textRow(' COHASSET TIDE CHARTS '),  // row 0
    textRow('HIGH               LOW'),  // row 1
    timeRow(highs[0], lows[0]),         // row 2
    timeRow(highs[1], lows[1]),         // row 3
    Array(22).fill(BLANK),              // row 4 blank
    Array(22).fill(BLANK),              // row 5 blank
  ];
}

// /tides slash command
app.command('/tides', async ({ command, ack, respond }) => {
  await ack();

  try {
    const tides = await getTodayTides();
    if (!tides.length) {
      await respond({ response_type: 'ephemeral', text: '❌ No tide data from NOAA.' });
      return;
    }

    await postGridToVestaboard(buildTideGrid(tides));

    const highs = tides.filter(t => t.type === 'H');
    const lows  = tides.filter(t => t.type === 'L');
    const lines = [
      ...highs.map(t => `🌊 High: ${formatTideTime(t.time)} (${t.height.toFixed(2)} ft)`),
      ...lows.map(t  => `〰️ Low:  ${formatTideTime(t.time)} (${t.height.toFixed(2)} ft)`),
    ];

    await respond({
      response_type: 'in_channel',
      text: `📋 *${command.user_name}* posted today's Cohasset tide chart:\n${lines.join('\n')}`,
    });
    console.log(`${command.user_name} posted Cohasset tide chart`);
  } catch (err) {
    console.error('Tide error:', err);
    await respond({ response_type: 'ephemeral', text: `❌ Failed: ${err.message}` });
  }
});

// /vesta slash command
app.command('/vesta', async ({ command, ack, respond }) => {
  await ack();

  const userId = command.user_id;
  const message = `${command.text?.trim()}`;

  if (!message) {
    await respond({
      response_type: 'ephemeral',
      text: 'Please provide a message. Usage: `/vesta Your message here`',
    });
    return;
  }

  // Rate limit check
  const now = Date.now();
  const lastPost = lastPostTime.get(userId);
  if (lastPost && now - lastPost < RATE_LIMIT_MS) {
    const secondsLeft = Math.ceil((RATE_LIMIT_MS - (now - lastPost)) / 1000);
    await respond({
      response_type: 'ephemeral',
      text: `⏳ You can only post once per minute. Please wait ${secondsLeft} more second${secondsLeft === 1 ? '' : 's'}.`,
    });
    return;
  }

  try {
    await postToVestaboard(message);
    lastPostTime.set(userId, now);

    await respond({
      response_type: 'in_channel',
      text: `📋 *${command.user_name}* posted to the Vestaboard: _${message}_`,
    });
    console.log(`${command.user_name} posted to Vestaboard: ${message}`);
  } catch (err) {
    console.error('Vestaboard error:', err);
    await respond({
      response_type: 'ephemeral',
      text: `❌ Failed to post to Vestaboard: ${err.message}`,
    });
  }
});

(async () => {
  await app.start();
  console.log('⚡ Vestabot (Slack) is running!');
})();
