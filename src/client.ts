import fetch from 'node-fetch'
import { networkInterfaces } from 'os'
import { watchFile, readFileSync } from 'node:fs'
import { existsSync } from 'fs';
import { exec } from 'node:child_process';

const iface = process.env.INTERFACE;
const key = process.env.AUTH;
const confFile = process.env.CONF;
const sslKeys = process.env.SSL_KEYS;

(async () => {
  if (!key) {
    console.error('Missing AUTH')
    return
  }

  if (!confFile) {
    console.error('Missing nginx conf.d directory (CONF)')
    return
  }

  if (!sslKeys) {
    console.error('Missing nginx ssl directory (SSL_KEYS)')
    return
  }

  const initialNets = networkInterfaces();

  if (!iface) {
    console.error('Missing INTERFACE')
    const results: any = {}

    for (const name of Object.keys(initialNets)) {
      const subnets = initialNets[name]
      if (!subnets) {
        continue
      }
      for (const net of subnets) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
        const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
        if (net.family === familyV4Value && !net.internal) {
          if (!results[name]) {
            results[name] = [];
          }
          results[name].push(net.address);
        }
      }
    }

    console.error(results)
    return
  }

  if (!(iface in initialNets)) {
    console.error(`Invalid interface ${iface}`)
  }

  watchFile(confFile, (curr, prev) => {
    const data = readFileSync(confFile, 'utf-8')

    const servers = data.match(/server_name\w*([^;]+\.clp\.nz)/g)
    servers?.forEach(s => {
      const [, serverName] = s.split(' ')
      if (!existsSync(`${sslKeys}/${serverName}.crt`)) {
        exec(`mkcert -cert-file ${sslKeys}/${serverName}.crt -key-file ${sslKeys}/${serverName}.key ${serverName}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`ssl err: ${error}`);
          }
          console.log(`${stdout}${stderr}`);
        })
      }
    })
  });

  let oldIp: string | null = null
  let newIp: string | null = null

  const run = async () => {

    const nets = networkInterfaces();
    const thisNet = nets[iface]
    if (!thisNet) {
      setTimeout(run, 5000)
      return
    }

    for (const net of thisNet) {
      const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
      if (net.family === familyV4Value && !net.internal) {
        newIp = net.address
      }
    }

    if (process.argv.includes('--local')) {
      newIp = '127.0.0.1'
    }


    try {
      if (newIp && newIp !== oldIp) {
        console.log(newIp)
        const result = await fetch(`https://api.clp.nz`, {
          method: 'POST',
          headers: {
            'x-ip': newIp,
            'authorization': key,
          }
        })

        const body = await result.text()

        console.log(result.status, body)
      }
      oldIp = newIp
    } catch (e) {

    }
    setTimeout(run, 5000)
  }

  await run()
})()