const configController = require('./src/modules/system/config.controller');
const { supabase } = require('./src/config/supabase');

async function testGetPulseiras() {
    console.log('--- Testing ConfigController.getPulseiras ---');

    // Mock request and response
    const req = {
        event: { id: '00000000-0000-0000-0000-000000000000' },
        query: {}
    };

    // Use the same event ID from before or find one
    const { data: events } = await supabase.from('eventos').select('id').limit(1);
    if (events && events.length > 0) {
        req.event.id = events[0].id;
    }

    const res = {
        json: (data) => {
            console.log('✅ Success! Data:', JSON.stringify(data, null, 2));
        },
        status: (code) => {
            console.log(`⚠️ Status Code: ${code}`);
            return {
                json: (data) => {
                    console.error('❌ Error response:', JSON.stringify(data, null, 2));
                }
            };
        }
    };

    try {
        await configController.getPulseiras(req, res);
    } catch (err) {
        console.error('💥 Controller crashed:', err.message);
    }
}

testGetPulseiras();
