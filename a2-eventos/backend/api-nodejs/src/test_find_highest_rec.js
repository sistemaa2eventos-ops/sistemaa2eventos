const http = require('http');
const crypto = require('crypto');

function parseDigestHeader(header) {
  const params = {};
  const matches = header.replace(/^Digest\s+/, '').match(/(\w+)=["']?([^"',]+)["']?/g);
  if (matches) {
    matches.forEach(m => {
      const parts = m.split('=');
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').replace(/^["']|["']$/g, '').trim();
      params[key] = val;
    });
  }
  return params;
}

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function request(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '192.168.1.51',
      port: 80,
      path: path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 401 && res.headers['www-authenticate']) {
        const auth = parseDigestHeader(res.headers['www-authenticate']);
        const realm = auth.realm;
        const nonce = auth.nonce;
        const qop = auth.qop;
        const uri = path;
        const ha1 = md5('admin:' + realm + ':admin123');
        const nc = '00000001';
        const cnonce = crypto.randomBytes(8).toString('hex');
        let ha2 = md5('GET:' + uri);
        let responseStr;
        if (qop) {
          responseStr = md5(ha1 + ':' + nonce + ':' + nc + ':' + cnonce + ':' + qop + ':' + ha2);
        } else {
          responseStr = md5(ha1 + ':' + nonce + ':' + ha2);
        }

        let authHeader = `Digest username="admin", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${responseStr}"`;
        if (qop) {
          authHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
        }

        const authReq = http.request({
          hostname: '192.168.1.51',
          port: 80,
          path: path,
          method: 'GET',
          headers: { 'Authorization': authHeader }
        }, (res2) => {
          let data = '';
          res2.on('data', chunk => data += chunk);
          res2.on('end', () => resolve({ status: res2.statusCode, data }));
        });
        authReq.on('error', reject);
        authReq.end();
      } else {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      }
    });
    req.on('error', reject);
    req.end();
  });
}

async function findLatestRecNo() {
  // Busca binária ou saltos para achar o último RecNo
  let low = 1;
  let high = 50000;
  let lastFound = 1;

  // Primeiro descobre a ordem de grandeza
  for (let jump of [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    let res = await request(`/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec&condition.RecNo=${jump}&count=1`);
    if (res.data.includes('found=1')) {
      lastFound = jump;
    } else {
      high = jump;
      low = lastFound;
      break;
    }
  }

  // Busca binária entre low e high
  while (low <= high) {
    let mid = Math.floor((low + high) / 2);
    let res = await request(`/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec&condition.RecNo=${mid}&count=1`);
    if (res.data.includes('found=1')) {
      lastFound = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  console.log('Highest RecNo found:', lastFound);
  
  // Buscar os últimos 5 a partir de (lastFound - 4)
  let start = Math.max(1, lastFound - 4);
  let res = await request(`/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec&condition.RecNo=${start}&count=10`);
  console.log('--- LATEST 5 ACCESS LOGS ---');
  console.log(res.data);
}

findLatestRecNo().catch(console.error);
