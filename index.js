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

// /vesta slash command
app.command('/vesta', async ({ command, ack, respond }) => {
  await ack();

  const userId = command.user_id;
  const message = `${command.user_name}: ${command.text?.trim()}`;

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
