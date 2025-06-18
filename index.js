const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState
} = require('@whiskeysockets/baileys')

const fs = require('fs')
const path = require('path')
const qrcode = require('qrcode-terminal')
const pino = require('pino')

const logger = pino({ level: 'info' }) // oder 'debug' für mehr Logs

async function startBot() {
    const authFolder = path.resolve(__dirname, 'auth')
    if (!fs.existsSync(authFolder)) {
        fs.mkdirSync(authFolder)
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, fs)
        },
        logger,
        browser: ['OnBot', 'Chrome', '1.0']
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
        console.log('=== Connection Update ===')
        console.log(JSON.stringify(update, null, 2))

        if (update.qr) {
            console.log('\x1b[32m========== QR CODE ==========' + '\x1b[0m')
            qrcode.generate(update.qr, { small: true })
            console.log('\x1b[32m=============================' + '\x1b[0m')
        }

        if (update.pairingCode) {
            console.log('\x1b[32m========== PAIRING CODE ==========' + '\x1b[0m')
            console.log('\x1b[33m→ Gib diesen Code in WhatsApp ein:\x1b[0m\n')
            console.log(\x1b[36m${update.pairingCode}\x1b[0m\n)
            console.log('\x1b[32m==================================' + '\x1b[0m')
        }

        const { connection, lastDisconnect } = update

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Verbindung geschlossen.', shouldReconnect ? 'Neu verbinden...' : 'Nicht erneut verbinden.')
            if (shouldReconnect) startBot()
        } else if (connection === 'open') {
            console.log('✅ Bot ist verbunden!')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text

        if (text === '?ping') {
            await sock.sendMessage(from, { text: '🏓 Pong!' })
        } else if (text === '?on') {
            await sock.sendMessage(from, { text: '✅ OnBot ist online!' })
        }
    })
}

startBot()
