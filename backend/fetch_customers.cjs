import http from 'http';

const req = http.request('http://localhost:3000/api/auth/unlock', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log("Unlock:", res.statusCode, data);

        // Now get customers
        const getReq = http.request('http://localhost:3000/api/customers', {
            method: 'GET',
            headers: {
                'Cookie': res.headers['set-cookie'] ? res.headers['set-cookie'][0] : ''
            }
        }, (getRes) => {
            let getData = '';
            getRes.on('data', chunk => getData += chunk);
            getRes.on('end', () => {
                console.log("Customers:", getRes.statusCode);
                console.log(JSON.stringify(JSON.parse(getData), null, 2));
            });
        });
        getReq.end();
    });
});

req.write(JSON.stringify({ masterPassword: "12345678912345" }));
req.end();
