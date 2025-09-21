// ==== CẤU HÌNH BOT + OAUTH ==== //
const CONFIG = {
  DISCORD_CLIENT_ID: "1419263170253688872",
  DISCORD_CLIENT_SECRET: "Yw-2VwA42kL5JOhibJtoz4vz9_tszTIe",
  DISCORD_BOT_TOKEN: "MTQxOTI2MzE3MDI1MzY4ODg3Mg.GLOvu7.cEVob2abxWZq648OCy4_KyigFk0TNDWExCDiho",
  SESSION_SECRET: "ez", // đổi thành chuỗi bất kỳ để bảo mật session
  CALLBACK_URL: "http://localhost:3000/auth/discord/callback",
};

// ==== IMPORT THƯ VIỆN ==== //
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const { Client, GatewayIntentBits } = require("discord.js");
const Database = require("better-sqlite3");
const moment = require("moment-timezone");

// ==== APP WEB ==== //
const app = express();
app.use(express.json());
app.use(session({ 
  secret: CONFIG.SESSION_SECRET,
  resave: false,
  saveUninitialized: false 
}));
app.use(passport.initialize());
app.use(passport.session());

// ==== DATABASE ==== //
const db = new Database("./schedules.db");
db.exec(`CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  channel_id TEXT,
  user_id TEXT,
  time_iso TEXT
)`);

// ==== OAUTH DISCORD ==== //
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
  clientID: CONFIG.DISCORD_CLIENT_ID,
  clientSecret: CONFIG.DISCORD_CLIENT_SECRET,
  callbackURL: CONFIG.CALLBACK_URL,
  scope: ["identify","guilds"]
}, (accessToken, refreshToken, profile, done) => {
  process.nextTick(() => done(null, profile));
}));

app.get("/auth/discord", passport.authenticate("discord"));
app.get("/auth/discord/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  (req, res) => res.redirect("/")
);

// ==== API ==== //
app.get("/api/me", (req,res) => {
  if (!req.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.user });
});

app.get("/api/schedules", (req,res) => {
  res.json(db.prepare("SELECT * FROM schedules").all());
});

app.post("/api/schedule", (req,res) => {
  const { guildId, channelId, userId, datetime } = req.body;
  const iso = moment.tz(datetime, "Asia/Ho_Chi_Minh").toISOString();
  db.prepare("INSERT INTO schedules (guild_id, channel_id, user_id, time_iso) VALUES (?,?,?,?)")
    .run(guildId, channelId, userId, iso);
  res.json({ success: true });
});

// ==== WEB UI (1 trang duy nhất) ==== //
app.get("/", (req,res) => {
  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="p-6 bg-gray-100">
    <h1 class="text-2xl font-bold mb-4">Discord Bot Dashboard</h1>
    <div id="login" class="mb-4"></div>
    <div id="form" class="space-y-2 hidden">
      <input id="guildId" placeholder="Guild ID" class="border p-2 w-full">
      <input id="channelId" placeholder="Channel ID" class="border p-2 w-full">
      <input id="userId" placeholder="User ID" class="border p-2 w-full">
      <input id="datetime" type="datetime-local" class="border p-2 w-full">
      <button onclick="addSchedule()" class="bg-green-500 text-white px-4 py-2 rounded">Thêm lịch</button>
    </div>
    <h2 class="mt-6 text-xl font-semibold">Danh sách lịch</h2>
    <ul id="list" class="mt-2 space-y-1"></ul>

    <script>
      async function load() {
        let me = await fetch('/api/me').then(r=>r.json());
        if (!me.loggedIn) {
          document.getElementById("login").innerHTML =
            '<a href="/auth/discord" class="bg-blue-500 text-white px-4 py-2 rounded">Login bằng Discord</a>';
        } else {
          document.getElementById("login").innerHTML =
            '<p>Xin chào ' + me.user.username + '#' + me.user.discriminator + '</p>';
          document.getElementById("form").classList.remove("hidden");
          loadSchedules();
        }
      }
      async function loadSchedules() {
        let schedules = await fetch('/api/schedules').then(r=>r.json());
        document.getElementById("list").innerHTML =
          schedules.map(s=>'<li class="border p-2 bg-white">'+s.user_id+' - '+s.time_iso+'</li>').join('');
      }
      async function addSchedule() {
        let data = {
          guildId: document.getElementById("guildId").value,
          channelId: document.getElementById("channelId").value,
          userId: document.getElementById("userId").value,
          datetime: document.getElementById("datetime").value
        };
        await fetch('/api/schedule', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)
        });
        loadSchedules();
      }
      load();
    </script>
  </body>
  </html>
  `);
});

// ==== BOT DISCORD ==== //
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
function mention(id) { return `<@${id}>`; }

client.once("ready", () => {
  console.log(`✅ Bot ${client.user.tag} đã online!`);
  setInterval(async () => {
    const now = new Date().toISOString();
    const rows = db.prepare("SELECT * FROM schedules WHERE time_iso <= ?").all(now);
    for (const r of rows) {
      const channel = await client.channels.fetch(r.channel_id).catch(()=>null);
      if (channel) channel.send(`${mention(r.user_id)} đến giờ rồi!`);
      db.prepare("DELETE FROM schedules WHERE id = ?").run(r.id);
    }
  }, 30*1000);
});

app.listen(3000, () => console.log("🌐 Web chạy tại http://localhost:3000"));
client.login(CONFIG.DISCORD_BOT_TOKEN);
