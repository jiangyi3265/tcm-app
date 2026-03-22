import fs from 'fs';

const TOKEN_KEY = 'tcm_token';

// Read token
let token = '';
try {
    const data = fs.readFileSync('c:\\Project Requirements\\医院\\医院\\hospital\\localStorage.txt', 'utf8');
    const match = data.match(/"tcm_token":"([^"]+)"/);
    if (match && match[1]) {
        token = match[1];
    }
} catch (e) {
    console.error('No localStorage.txt found or parsing failed.');
}

async function loginAndTest() {
    let activeToken = token;
    
    // If no token, login first
    if (!activeToken) {
        console.log('Logging in...');
        const loginRes = await fetch('http://localhost:8080/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@clinic.com', password: 'admin123' })
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) {
            console.error('Login failed:', loginData);
            return;
        }
        activeToken = loginData.token;
        console.log('Login successful, got token');
    }

    // Now test adding item
    console.log('Testing Add Herb...');
    const addRes = await fetch('http://localhost:8080/api/inventory', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
            name: "测试粉剂",
            category: "powder",
            unit: "包",
            quantity: 1,
            pricePerUnit: 0.1,
            supplier: "212",
            gramsPerPacket: null,
            minStockLevel: 10,
            nature: "热",
            taste: ["酸"],
            guijing: ["小肠"],
            toxicity: "无毒",
            functionsAndIndications: "222",
            contraindications: "1",
            branchId: null,
            isActive: true
        })
    });
    
    const text = await addRes.text();
    console.log('Status:', addRes.status);
    console.log('Response:', text);
}

loginAndTest().catch(console.error);
