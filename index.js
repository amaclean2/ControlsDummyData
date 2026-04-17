'use strict'

const http = require('http')
const { WebSocketServer } = require('ws')
const nodedc = require('node-datachannel')

const PORT = Number(process.env.PORT) || 8787
const C2S_ID = 0  // client-to-server SCTP stream id
const S2C_ID = 1  // server-to-client SCTP stream id

// Mock device UUID — 32 hex chars to satisfy the router's UUID regex
const MOCK_DEVICE_UUID = '00000000000000000000000000000001'

// ─── Mock data ───────────────────────────────────────────────────────────────

const NOW = new Date().toISOString()

const HARDWARE = [
  {
    id: 'aabbccddeeff',
    name: 'Mock Hub',
    hardwareType: 'ROUTING',
    routingDeviceType: 'HUB',
    online: true,
    in_bootloader: false,
    config: {},
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: '112233445566',
    name: 'Mock RS485 Bridge',
    hardwareType: 'RS485_BRIDGE',
    online: true,
    in_bootloader: false,
    config: {},
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const SENSORS = [
  {
    id: 'adc000000001',
    name: 'Mock ADC Sensor',
    sourceType: 'adc',
    adcHardwareId: '112233445566',
    channel: 1,
    typeId: 'sensor.analog.generic',
    config: { outputUnit: 'psi', rating: 100 },
    calibration: [],
    online: true,
    lastValue: 45.5,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'mod000000001',
    name: 'Mock Modbus Sensor',
    sourceType: 'modbus',
    bridgeHardwareId: '112233445566',
    slaveAddress: 1,
    typeId: 'sensor.modbus.generic',
    config: {},
    calibration: [],
    online: true,
    lastValue: 72.3,
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const VFDS = [
  {
    id: 'vfd000000001',
    name: 'Bentonite Pump',
    bridgeHardwareId: '112233445566',
    slaveAddress: 1,
    typeId: 'vfd.generic',
    config: {},
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000002',
    name: 'Moyno',
    bridgeHardwareId: '112233445567',
    slaveAddress: 1,
    typeId: 'vfd.generic',
    config: {},
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000003',
    name: 'Rotary Lobe Pump',
    bridgeHardwareId: '112233445568',
    slaveAddress: 1,
    typeId: 'vfd.generic',
    config: {},
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000004',
    name: 'Conveyor',
    bridgeHardwareId: '112233445569',
    slaveAddress: 1,
    typeId: 'vfd.generic',
    config: {},
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000005',
    name: 'Blender',
    bridgeHardwareId: '112233445560',
    slaveAddress: 1,
    typeId: 'vfd.generic',
    config: {},
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000006',
    name: 'Water Pump',
    bridgeHardwareId: '112233445561',
    slaveAddress: 1,
    typeId: 'vfd.generic',
    config: {},
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000007',
    name: 'Auger Truck',
    bridgeHardwareId: '112233445562',
    slaveAddress: 1,
    typeId: 'vfd.generic',
    config: {},
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000008',
    name: 'Pulp Pump',
    bridgeHardwareId: '112233445563',
    slaveAddress: 1,
    typeId: 'vfd.generic',
    config: {},
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
]

// Unified /devices list — matches DeviceAggregateController shape
const DEVICES = [
  ...SENSORS.map(s => ({ ...s, deviceType: 'sensor' })),
  ...VFDS.map(v => ({ ...v, deviceType: 'vfd' })),
]

// ─── HTTP handlers (REST endpoints) ──────────────────────────────────────────

function handleHttp(req, res) {
  const url = req.url.split('?')[0]

  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  function json(status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  // Fleet API — device list
  if (req.method === 'GET' && url === '/v1/fleet/devices') {
    return json(200, {
      data: {
        devices: [{
          device_uuid: MOCK_DEVICE_UUID,
          name: 'Mock Device',
          online: true,
          status: 'active',
          location: 'Development',
          os_version: 'mock',
          last_seen_at: Math.floor(Date.now() / 1000),
        }]
      }
    })
  }

  json(404, { message: `mock: no handler for ${req.method} ${url}` })
}

// ─── DC-RPC request handler ───────────────────────────────────────────────────

function handle(req) {
  const path = req.path.split('?')[0]

  if (req.method === 'GET' && (path === '/' || path === '/health')) {
    return ok(req.id, { status: 'ok', mock: true })
  }
  if (req.method === 'GET' && path === '/hardware')      return ok(req.id, HARDWARE)
  if (req.method === 'GET' && path === '/hardware/hubs') return ok(req.id, HARDWARE.filter(h => h.routingDeviceType === 'HUB'))
  if (req.method === 'GET' && path === '/sensors')       return ok(req.id, SENSORS)
  if (req.method === 'GET' && path === '/vfds')          return ok(req.id, VFDS)
  if (req.method === 'GET' && path === '/devices') {
    // Support optional ?deviceType= and ?hardwareId= filters
    const qs = req.path.includes('?') ? new URLSearchParams(req.path.split('?')[1]) : null
    let list = DEVICES
    if (qs?.get('deviceType')) list = list.filter(d => d.deviceType === qs.get('deviceType'))
    if (qs?.get('hardwareId')) list = list.filter(d =>
      d.bridgeHardwareId === qs.get('hardwareId') || d.adcHardwareId === qs.get('hardwareId')
    )
    return ok(req.id, list)
  }
  if (req.method === 'GET' && path.startsWith('/devices/')) {
    const id = path.split('/')[2]
    const device = DEVICES.find(d => d.id === id)
    return device ? ok(req.id, device) : res(req.id, 404, { message: `device ${id} not found` })
  }
  if (req.method === 'GET' && path === '/xbee')          return ok(req.id, [])
  if (req.method === 'GET' && path === '/backups')  return ok(req.id, [])
  if (req.method === 'GET' && path === '/rovers')   return ok(req.id, [])
  if (req.method === 'GET' && path === '/nvr/cameras') return ok(req.id, [])
  if (req.method === 'GET' && path === '/schemas/categories') return ok(req.id, ['sensor', 'vfd', 'camera'])
  if (req.method === 'GET' && path.startsWith('/schemas')) return ok(req.id, [])

  if (req.method === 'GET') return res(req.id, 404, { message: `mock: no fixture for ${req.method} ${req.path}` })

  // Writes: silently accept
  console.log(`[mock] write ignored: ${req.method} ${req.path}`)
  return ok(req.id, {})
}

function ok(id, body)          { return res(id, 200, body) }
function res(id, status, body) { return { kind: 'res', id, status, body } }

// ─── WebRTC session ───────────────────────────────────────────────────────────

class Session {
  constructor(ws, deviceUuid) {
    this.ws = ws
    this.deviceUuid = deviceUuid
    this.pc = null
    this.c2s = null
    this.s2c = null
    this.subscriptions = new Set()
    this.eventTimer = null

    ws.on('message', (data) => {
      try { this.onRelay(JSON.parse(data.toString())) }
      catch (e) { console.error('[mock] bad relay message', e) }
    })
    ws.on('close', () => this.cleanup())

    this.relay({ type: 'welcome', viewerId: `mock-${Date.now()}`, deviceConnected: true })
    console.log(`[mock] connected for device ${deviceUuid}`)
  }

  relay(msg) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg))
  }

  onRelay(msg) {
    if (msg.type === 'join')          this.startRTC()
    if (msg.type === 'sdp-answer')    this.pc?.setRemoteDescription(msg.sdp, 'answer')
    if (msg.type === 'ice-candidate' && msg.candidate?.candidate) {
      try { this.pc?.addRemoteCandidate(msg.candidate.candidate, msg.candidate.sdpMid ?? '0') }
      catch { /* benign race */ }
    }
  }

  startRTC() {
    const pc = new nodedc.PeerConnection('MockDevice', { iceServers: [] })
    this.pc = pc

    pc.onStateChange((s) => console.log(`[mock] rtc ${this.deviceUuid} → ${s}`))

    pc.onLocalDescription((sdp, type) => {
      if (type !== 'offer') return
      this.relay({ type: 'ice-servers', iceServers: [] })
      this.relay({ type: 'sdp-offer', sdp, streams: { c2s: C2S_ID, s2c: S2C_ID } })
    })

    pc.onLocalCandidate((candidate, mid) => {
      if (candidate) this.relay({ type: 'ice-candidate', candidate: { candidate, sdpMid: mid, sdpMLineIndex: 0 } })
    })

    this.c2s = pc.createDataChannel('rpc-c2s', { negotiated: true, id: C2S_ID, protocol: 'dc-rpc' })
    this.s2c = pc.createDataChannel('rpc-s2c', { negotiated: true, id: S2C_ID, protocol: 'dc-rpc' })

    this.c2s.onMessage((raw) => {
      try {
        const msg = JSON.parse(raw)
        if (msg.kind === 'req') {
          this.dc(handle(msg))
        } else if (msg.kind === 'sub') {
          this.onSubscribe(msg.ids)
        } else if (msg.kind === 'unsub') {
          for (const id of msg.ids) this.subscriptions.delete(id)
        }
      } catch (e) { console.error('[mock] bad dc-rpc message', e) }
    })

    this.s2c.onOpen(() => {
      console.log(`[mock] dc-rpc ready for ${this.deviceUuid}`)
      this.startEventLoop()
    })

    pc.setLocalDescription()
  }

  dc(obj) {
    if (this.s2c?.isOpen()) this.s2c.sendMessage(JSON.stringify(obj))
  }

  onSubscribe(ids) {
    const snapshot = {}
    for (const id of ids) {
      if (this.subscriptions.has(id)) continue
      this.subscriptions.add(id)
      const item = [...HARDWARE, ...DEVICES].find(x => x.id === id)
      if (item) snapshot[id] = item
    }
    if (Object.keys(snapshot).length > 0) {
      this.dc({ kind: 'evt', event: 'snapshot', id: '*', data: snapshot, timestamp: Date.now() })
    }
  }

  startEventLoop() {
    this.eventTimer = setInterval(() => {
      for (const id of this.subscriptions) {
        const sensor = SENSORS.find(s => s.id === id)
        if (!sensor) continue
        this.dc({
          kind: 'evt',
          event: 'sensor:reading',
          id,
          data: { raw: Math.random() * 16000 + 4000, value: +(Math.random() * 100).toFixed(2) },
          timestamp: Date.now(),
        })
      }
    }, 5000)
  }

  cleanup() {
    console.log(`[mock] disconnected ${this.deviceUuid}`)
    clearInterval(this.eventTimer)
    try { this.c2s?.close() } catch {}
    try { this.s2c?.close() } catch {}
    try { this.pc?.close() }  catch {}
  }
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = http.createServer(handleHttp)
const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  // Expected: /v1/signal/:deviceUuid/__control__
  const parts = req.url.split('?')[0].split('/').filter(Boolean)
  if (parts[0] !== 'v1' || parts[1] !== 'signal' || parts[3] !== '__control__') {
    ws.close(1008, 'unexpected path')
    return
  }
  new Session(ws, parts[2])
})

server.listen(PORT, () => {
  console.log(`[mock] listening on http://localhost:${PORT}`)
  console.log(`[mock] mock device UUID: ${MOCK_DEVICE_UUID}`)
})

server.on('error', (e) => console.error('[mock] server error', e))
