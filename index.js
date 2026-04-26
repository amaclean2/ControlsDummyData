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
    name: 'Rover Outlet Pressure',
    deviceUsageType: 'S-RPOP',
    pressureThreshold: 100,
    sourceType: 'adc',
    adcHardwareId: '112233445566',
    channel: 1,
    typeId: 'sensor.analog.generic',
    config: { outputUnit: 'psi', rating: 100 },
    calibration: [],
    online: true,
    lastValue: 45.5,
    lastMeasurements: { pressure: { value: 45.5, unit: 'psi' } },
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'adc000000002',
    name: 'Rover Tank Level',
    deviceUsageType: 'S-RPTL',
    sourceType: 'adc',
    adcHardwareId: '112233445567',
    channel: 1,
    typeId: 'sensor.analog.generic',
    config: { outputUnit: '%', rating: 100 },
    calibration: [],
    online: true,
    lastValue: 72.3,
    lastMeasurements: { level: { value: 72.3, unit: '%' } },
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'adc000000003',
    name: 'Blender Tank Level',
    deviceUsageType: 'S-AMTL',
    sourceType: 'adc',
    adcHardwareId: '112233445568',
    channel: 1,
    typeId: 'sensor.analog.generic',
    config: { outputUnit: '%', rating: 100 },
    calibration: [],
    online: true,
    lastValue: 31.8,
    lastMeasurements: { level: { value: 31.8, unit: '%' } },
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'adc000000004',
    name: 'Moyno Outlet Pressure',
    deviceUsageType: 'S-ADPOP',
    pressureThreshold: 100,
    sourceType: 'adc',
    adcHardwareId: '112233445568',
    channel: 2,
    typeId: 'sensor.analog.generic',
    config: { outputUnit: 'psi', rating: 200 },
    calibration: [],
    online: true,
    lastValue: 112.7,
    lastMeasurements: { pressure: { value: 112.7, unit: 'psi' } },
    createdAt: NOW,
    updatedAt: NOW,
  }
]

function makeVfdState(baseFreqHz) {
  return {
    setpoint: {
      frequencyHz: baseFreqHz,
      driveMode: 'forward',
    },
    actual: {
      frequencyHz: baseFreqHz,
      driveMode: 'forward',
      currentAmps: +(baseFreqHz * 0.05).toFixed(2),
      voltageVolts: 230,
      powerKw: +(baseFreqHz * 0.012).toFixed(3),
      alarmCode: 0,
    },
    running: true,
    dcBusVoltage: 310,
    warningCode: 0,
  }
}

const VFDS = [
  {
    id: 'vfd000000001',
    name: 'Bentonite Pump',
    deviceUsageType: 'RAP',
    bridgeHardwareId: '112233445566',
    slaveAddress: 1,
    typeId: 'vfd.fuji.frenic-ace',
    config: {},
    state: makeVfdState(45),
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000002',
    name: 'Moyno',
    deviceUsageType: 'RPP',
    bridgeHardwareId: '112233445567',
    slaveAddress: 1,
    typeId: 'vfd.fuji.frenic-ace',
    config: {},
    state: makeVfdState(30),
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000003',
    name: 'Rotary Lobe Pump',
    deviceUsageType: 'ADP',
    bridgeHardwareId: '112233445568',
    slaveAddress: 1,
    typeId: 'vfd.fuji.frenic-ace',
    config: {},
    state: makeVfdState(60),
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000004',
    name: 'Conveyor',
    deviceUsageType: 'C',
    bridgeHardwareId: '112233445569',
    slaveAddress: 1,
    typeId: 'vfd.fuji.frenic-ace',
    config: {},
    state: makeVfdState(50),
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000005',
    name: 'Blender',
    deviceUsageType: 'M',
    bridgeHardwareId: '112233445560',
    slaveAddress: 1,
    typeId: 'vfd.fuji.frenic-ace',
    config: {},
    state: makeVfdState(40),
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000006',
    name: 'Water Pump',
    deviceUsageType: 'IPWP',
    bridgeHardwareId: '112233445561',
    slaveAddress: 1,
    typeId: 'vfd.fuji.frenic-ace',
    config: {},
    state: makeVfdState(55),
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000007',
    name: 'Auger Truck',
    deviceUsageType: 'IWCI',
    bridgeHardwareId: '112233445562',
    slaveAddress: 1,
    typeId: 'vfd.fuji.frenic-ace',
    config: {},
    state: makeVfdState(35),
    online: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'vfd000000008',
    name: 'Pulp Pump',
    deviceUsageType: 'ITP',
    bridgeHardwareId: '112233445563',
    slaveAddress: 1,
    typeId: 'vfd.fuji.frenic-ace',
    config: {},
    state: makeVfdState(25),
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

// ─── Mutable in-memory state ─────────────────────────────────────────────────

/** key → { value: Record<string, unknown> } */
const PREFERENCES = new Map()

/** vfdId → PidState */
const PID_STATE = new Map()

function pidDisabled() {
  return { enabled: false, sensorId: '', setpoint: 0, minHz: 0, maxHz: 0, kp: 0, ki: 0, kd: 0, deadBand: 0, lastError: 0, lastOutputHz: 0 }
}

// ─── Schema fixtures ─────────────────────────────────────────────────────────

const VFD_ACE_SCHEMA = {
  schemaId: 'vfd.fuji.frenic-ace',
  name: 'Fuji Frenic Ace',
  description: 'Fuji Frenic-Ace series high-performance inverter with advanced vector control',
  version: '1.0.0',
  category: 'vfd',
  fields: [
    { id: 'name', type: 'text', label: 'Name', description: 'Human-readable name for this VFD', maxLength: 100, placeholder: 'e.g., Main Pump VFD' },
    { id: 'deviceUsageType', type: 'select', label: 'VFD Usage Type', description: 'Application code for VFD usage', required: true, options: [
      { value: 'RPP', label: 'Rover Primary Pump' },
      { value: 'RAP', label: 'Rover Auxiliary Pump' },
      { value: 'RW', label: 'Rover Waterjet' },
      { value: 'IWCI', label: 'Wood Chip Infeed' },
      { value: 'ITI', label: 'Thickener Infeed' },
      { value: 'ITP', label: 'Thickener Pump' },
      { value: 'IPWP', label: 'Primary Water Pump' },
      { value: 'C', label: 'Conveyor' },
      { value: 'M', label: 'Mixer' },
      { value: 'ADP', label: 'Ark Delivery Pump' },
    ]},
    { id: 'modbusAddress', type: 'modbus-address', label: 'Modbus Address', description: 'Select RS485 bridge and slave address', required: true },
    { id: 'maxFrequencyHz', type: 'number', label: 'Maximum Frequency', description: 'Maximum output frequency', required: true, min: 0.5, max: 590, step: 0.1, default: 60, unit: 'Hz' },
    { id: 'minFrequencyHz', type: 'number', label: 'Minimum Frequency', description: 'Minimum output frequency', required: true, min: 0, max: 590, step: 0.1, default: 0.5, unit: 'Hz' },
    { id: 'accelerationTime', type: 'number', label: 'Acceleration Time', description: 'Time to accelerate from 0 to max frequency', min: 0.01, max: 6000, step: 0.01, default: 10, unit: 's' },
    { id: 'decelerationTime', type: 'number', label: 'Deceleration Time', description: 'Time to decelerate from max frequency to 0', min: 0.01, max: 6000, step: 0.01, default: 10, unit: 's' },
    { id: 'controlMode', type: 'select', label: 'Control Mode', description: 'Motor control method', options: [{ value: 'vf', label: 'V/F Control', description: 'Constant V/F ratio' }, { value: 'sensorless', label: 'Sensorless Vector', description: 'Open-loop vector control' }, { value: 'vector', label: 'Vector Control', description: 'Closed-loop vector with encoder' }, { value: 'pm', label: 'PM Motor Control', description: 'Permanent magnet motor control' }], default: 'vf' },
    { id: 'motorPoles', type: 'number', label: 'Motor Poles', description: 'Number of motor poles', min: 2, max: 48, step: 2, default: 4 },
    { id: 'motorRatedCurrent', type: 'number', label: 'Motor Rated Current', description: 'Motor nameplate current', min: 0.1, max: 9999, step: 0.1, unit: 'A' },
    { id: 'pidEnabled', type: 'toggle', label: 'PID Control', description: 'Enable built-in PID controller', default: false },
    { id: 'pidProportional', type: 'number', label: 'PID P Gain', description: 'Proportional gain', min: 0, max: 1000, step: 0.1, default: 1 },
    { id: 'pidIntegral', type: 'number', label: 'PID I Time', description: 'Integral time constant', min: 0, max: 3600, step: 0.1, default: 1, unit: 's' },
    { id: 'pidDerivative', type: 'number', label: 'PID D Time', description: 'Derivative time constant', min: 0, max: 100, step: 0.01, default: 0, unit: 's' },
    { id: 'frequencyScale', type: 'number', label: 'Frequency Scale Factor', default: 100, readOnly: true },
    { id: 'currentScale', type: 'number', label: 'Current Scale Factor', default: 100, readOnly: true },
    { id: 'voltageScale', type: 'number', label: 'Voltage Scale Factor', default: 10, readOnly: true },
    { id: 'powerScale', type: 'number', label: 'Power Scale Factor', default: 100, readOnly: true },
  ],
  groups: [
    { id: 'basic', label: 'Basic Settings', fieldIds: ['name', 'deviceUsageType', 'modbusAddress'] },
    { id: 'frequency', label: 'Frequency Settings', fieldIds: ['maxFrequencyHz', 'minFrequencyHz', 'accelerationTime', 'decelerationTime'] },
    { id: 'control', label: 'Control Settings', fieldIds: ['controlMode'] },
    { id: 'motor', label: 'Motor Parameters', fieldIds: ['motorPoles', 'motorRatedCurrent'] },
    { id: 'pid', label: 'PID Control', description: 'Built-in PID controller settings', fieldIds: ['pidEnabled', 'pidProportional', 'pidIntegral', 'pidDerivative'], collapsed: true },
    { id: 'advanced', label: 'Advanced Settings', fieldIds: ['frequencyScale', 'currentScale', 'voltageScale', 'powerScale'], collapsed: true },
  ],
}

const SENSOR_ANALOG_GENERIC_SCHEMA = {
  schemaId: 'sensor.analog.generic',
  name: 'Generic Analog Sensor',
  description: 'Generic 4-20 mA analog sensor',
  version: '1.0.0',
  category: 'sensor',
  fields: [
    { id: 'name', type: 'text', label: 'Name', required: true },
    { id: 'description', type: 'text', label: 'Description' },
    { id: 'outputUnit', type: 'text', label: 'Output Unit' },
    { id: 'rating', type: 'number', label: 'Rating', unit: '%' },
  ],
}

const SCHEMAS = {
  'vfd.fuji.frenic-ace': VFD_ACE_SCHEMA,
  'sensor.analog.generic': SENSOR_ANALOG_GENERIC_SCHEMA,
}

const SCHEMA_SUMMARIES = Object.values(SCHEMAS).map(({ schemaId, name, description, version, category }) => ({
  schemaId, name, description, version, category,
}))

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
  if (req.method === 'PATCH' && path.startsWith('/devices/')) {
    const id = path.split('/')[2]
    const device = DEVICES.find(d => d.id === id)
    if (!device) return res(req.id, 404, { message: `device ${id} not found` })
    Object.assign(device, req.body ?? {})
    console.log(`[mock] device ${id} patched`)
    return ok(req.id, device)
  }
  if (req.method === 'GET' && path === '/xbee')          return ok(req.id, [])
  if (req.method === 'GET' && path === '/backups')  return ok(req.id, [])
  if (req.method === 'GET' && path === '/rovers')   return ok(req.id, [])
  if (req.method === 'GET' && path === '/nvr/cameras') return ok(req.id, [])
  if (req.method === 'GET' && path === '/schemas/categories') return ok(req.id, { categories: ['vfd', 'sensor', 'camera'] })
  if (req.method === 'GET' && path === '/schemas') return ok(req.id, { schemas: SCHEMA_SUMMARIES })
  if (req.method === 'GET' && path.startsWith('/schemas/')) {
    const typeId = path.slice('/schemas/'.length)
    const schema = SCHEMAS[typeId]
    return schema ? ok(req.id, schema) : res(req.id, 404, { message: `schema ${typeId} not found` })
  }

  // VFD PID endpoints
  const pidMatch = path.match(/^\/vfds\/([^/]+)\/pid$/)
  if (pidMatch) {
    const vfdId = pidMatch[1]
    if (req.method === 'GET') {
      return ok(req.id, PID_STATE.get(vfdId) ?? pidDisabled())
    }
    if (req.method === 'POST') {
      const body = req.body ?? {}
      const state = {
        enabled: true,
        sensorId: body.sensorId ?? '',
        setpoint: body.setpoint ?? 0,
        minHz: body.minHz ?? 0,
        maxHz: body.maxHz ?? 60,
        kp: body.kp ?? 2.5,
        ki: body.ki ?? 0.1,
        kd: body.kd ?? 0.0,
        deadBand: body.deadBand ?? 0.5,
        lastError: 0,
        lastOutputHz: body.minHz ?? 0,
      }
      PID_STATE.set(vfdId, state)
      console.log(`[mock] PID enabled for VFD ${vfdId}`)
      return ok(req.id, state)
    }
    if (req.method === 'DELETE') {
      PID_STATE.delete(vfdId)
      console.log(`[mock] PID disabled for VFD ${vfdId}`)
      return res(req.id, 204, null)
    }
  }

  // Preferences endpoints
  const prefMatch = path.match(/^\/preferences\/([^/]+)$/)
  if (prefMatch) {
    const key = prefMatch[1]
    if (req.method === 'GET') {
      const pref = PREFERENCES.get(key)
      return pref ? ok(req.id, pref) : res(req.id, 404, { message: `preference ${key} not found` })
    }
    if (req.method === 'PUT') {
      const entry = { key, value: (req.body ?? {}).value ?? {} }
      PREFERENCES.set(key, entry)
      console.log(`[mock] preference saved: ${key}`)
      return ok(req.id, entry)
    }
    if (req.method === 'DELETE') {
      PREFERENCES.delete(key)
      return res(req.id, 204, null)
    }
  }
  if (req.method === 'GET' && path === '/preferences') {
    return ok(req.id, [...PREFERENCES.values()])
  }

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
        if (sensor) {
          const delta = Object.entries(sensor.lastMeasurements).map(([key]) => {
            const base = sensor.lastValue
            const jitter = (Math.random() - 0.5) * base * 0.12
            return {
              op: 'replace',
              path: `/lastMeasurements/${key}/value`,
              value: +(base + jitter).toFixed(2),
            }
          })
          this.dc({ kind: 'evt', event: 'patch', id, data: { type: 'delta', delta }, timestamp: Date.now() })
          continue
        }

        const vfd = VFDS.find(v => v.id === id)
        if (vfd && vfd.state) {
          const base = vfd.state.setpoint.frequencyHz
          const jitter = (Math.random() - 0.5) * base * 0.06
          const actualFreq = +(base + jitter).toFixed(2)
          const delta = [
            { op: 'replace', path: '/state/actual/frequencyHz', value: actualFreq },
            { op: 'replace', path: '/state/actual/currentAmps', value: +(actualFreq * 0.05 + (Math.random() - 0.5) * 0.2).toFixed(2) },
            { op: 'replace', path: '/state/actual/powerKw',     value: +(actualFreq * 0.012 + (Math.random() - 0.5) * 0.05).toFixed(3) },
          ]
          this.dc({ kind: 'evt', event: 'patch', id, data: { type: 'delta', delta }, timestamp: Date.now() })
        }
      }
    }, 1000)
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
