// Panel multi-akun untuk cookiesmp.my.id (Minecraft Java, port default)
// Env opsional: UI_PASSWORD = password untuk membuka panel (sangat disarankan)
const http = require('http'), fs = require('fs'), mineflayer = require('mineflayer')
const HOST = 'cookiesmp.my.id', MC_PORT = 25565, PASS = process.env.UI_PASSWORD || '', FILE = 'accounts.json'
const accs = new Map(), clients = new Set()

try { for (const a of JSON.parse(fs.readFileSync(FILE))) accs.set(a.username, { ...a, status: 'offline', chat: [] }) } catch {}
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify([...accs.values()].map(({ username, password }) => ({ username, password })))) } catch {} }
const view = () => [...accs.values()].map(({ username, status }) => ({ username, status }))
const push = (type, data) => { const m = `data: ${JSON.stringify({ type, ...data })}\n\n`; clients.forEach(c => c.write(m)) }
const setStatus = (a, s) => { a.status = s; push('state', { accounts: view() }) }
const log = (a, text, kind = 'chat') => {
  const line = { text, kind }
  a.chat.push(line); if (a.chat.length > 200) a.chat.shift()
  push('chat', { username: a.username, line })
}

function connect(a) {
  if (a.bot) return
  a.want = true
  setStatus(a, 'connecting')
  const bot = mineflayer.createBot({ host: HOST, port: MC_PORT, username: a.username, viewDistance: 'tiny' })
  a.bot = bot
  bot.once('spawn', () => {
    setStatus(a, 'online'); log(a, 'Masuk ke server', 'sys')
    setTimeout(() => {
      bot.chat(`/login ${a.password}`); log(a, 'Mengirim /login', 'sys')
      setTimeout(() => { bot.chat('/server ecocpvp'); log(a, 'Mengirim /server ecocpvp', 'sys') }, 3000)
    }, 2000)
  })
  bot.on('messagestr', m => m.trim() && log(a, m))
  bot.on('kicked', r => log(a, 'Di-kick: ' + (typeof r === 'string' ? r : JSON.stringify(r)), 'sys'))
  bot.on('error', e => log(a, 'Error: ' + e.message, 'sys'))
  bot.on('end', () => {
    a.bot = null; setStatus(a, 'offline')
    if (a.want) { log(a, 'Terputus, mencoba lagi dalam 15 detik', 'sys'); setTimeout(() => a.want && connect(a), 15000) }
  })
}
function stop(a) { a.want = false; a.bot && a.bot.end() }

const json = (res, o, c = 200) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)) }

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(__dirname + '/index.html')) }
  if (PASS && (req.headers['x-pass'] || u.searchParams.get('p')) !== PASS) return json(res, { error: 'Password salah' }, 401)
  if (u.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    clients.add(res); req.on('close', () => clients.delete(res))
    const chats = Object.fromEntries([...accs].map(([k, a]) => [k, a.chat]))
    return res.write(`data: ${JSON.stringify({ type: 'init', accounts: view(), chats })}\n\n`)
  }
  if (u.pathname === '/api/ping') return json(res, { ok: true })
  let body = ''
  req.on('data', d => body += d)
  req.on('end', () => {
    let b = {}; try { b = JSON.parse(body || '{}') } catch {}
    const a = accs.get(b.username), p = u.pathname
    if (p === '/api/add') {
      if (!b.username || !b.password) return json(res, { error: 'Isi username dan password' }, 400)
      if (accs.has(b.username)) return json(res, { error: 'Akun sudah ada' }, 400)
      const n = { username: b.username.trim(), password: b.password, status: 'offline', chat: [] }
      accs.set(n.username, n); save(); push('state', { accounts: view() }); connect(n)
      return json(res, { ok: true })
    }
    if (!a) return json(res, { error: 'Akun tidak ditemukan' }, 404)
    if (p === '/api/start') connect(a)
    else if (p === '/api/stop') stop(a)
    else if (p === '/api/remove') { stop(a); accs.delete(a.username); save(); push('state', { accounts: view() }) }
    else if (p === '/api/say') {
      if (!a.bot || a.status !== 'online') return json(res, { error: 'Akun belum online' }, 400)
      a.bot.chat(String(b.text || '').slice(0, 250)); log(a, '> ' + b.text, 'me')
    }
    json(res, { ok: true })
  })
}).listen(process.env.PORT || 3000)

setInterval(() => clients.forEach(c => c.write(': ping\n\n')), 25000)
accs.forEach(connect) // akun tersimpan langsung masuk lagi saat panel menyala
