
import express from 'express'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import fetch from 'node-fetch'
import { lookup } from 'dns/promises'
import { exit } from 'process'
// import fetch from 'node-fetch'


async function main() {
  if (!process.env.KEYS_PATH || !existsSync(process.env.KEYS_PATH)) {
    console.log(`Keys file (KEYS_PATH) missing: ${process.env.KEYS_PATH}`)
    return
  }

  const app = express()

  const cfKey = process.env.CLOUDFLARE_API_KEY
  const cfEmail = process.env.CLOUDFLARE_API_EMAIL
  const zoneId = process.env.CLOUDFLARE_ZONE
  const domain = process.env.DOMAIN
  const keysContent = await readFile(`${process.env.KEYS_PATH}`)
  const keys = JSON.parse(keysContent.toString('ascii'))

  if (!cfKey || !cfEmail) {
    console.error('Missing required CLOUDFLARE_API_EMAIL or CLOUDFLARE_API_KEY')
    return
  }

  app.get('/', (req, res) => {
    res.end()
  })

  app.post('/', async (req, res) => {
    const auth = req.headers['authorization']
    const host = req.headers['x-ip']
    if (!auth || !(typeof host === 'string') || !(auth in keys)) {
      res.statusCode = 403
      res.send('missing authorization or x-ip header')
      return
    }

    try {
      const dnsRecordsUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=*.${keys[auth]}.${domain}`

      const dnsRecordsBody = await fetch(dnsRecordsUrl, {
        headers: {
          'X-Auth-Email': `${cfEmail}`,
          'X-Auth-Key': `${cfKey}`
        },
      })

      const {
        success: zoneSuccess,
        result: dnsRecords
      } = await dnsRecordsBody.json()

      if (!zoneSuccess) {
        res.statusCode = 500
        res.send()
        return
      }


      const body = JSON.stringify({
        type: 'A',
        name: `*.${keys[auth]}`,
        content: host,
        ttl: 60,
      })

      const dnsUrl = dnsRecords.length === 0 ?
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records` :
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${dnsRecords[0].id}`

      const method = dnsRecords.length === 0 ? 'POST' : 'PUT'

      const dnsRequest = await fetch(dnsUrl, {
        method,
        headers: {
          'X-Auth-Email': `${cfEmail}`,
          'X-Auth-Key': `${cfKey}`
        },
        body,
      })

      const { success: updateSuccess } = await dnsRequest.json()


      res.statusCode = updateSuccess ? 200 : 400
      res.send(updateSuccess ? host : 'Unable to update DNS')
    } catch (e) {
      res.statusCode = 404
      res.send(e)
    }
  })
  const port = parseInt(process.env.PORT ?? process.env.VIRTUAL_PORT ?? '8000')
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on https://api.clp.nz:${port}`)
  })
}

main()