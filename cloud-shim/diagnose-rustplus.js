const fs = require('fs');
const path = require('path');
const protobuf = require('protobufjs');

const rustplusDir = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js');
const protoPath = path.join(rustplusDir, 'rustplus.proto');
const jsPath = path.join(rustplusDir, 'rustplus.js');

console.log('--- DIAGNOSTIC START ---');
console.log('RustPlus Dir:', rustplusDir);

// 1. Check if files exist
if (fs.existsSync(protoPath)) {
    console.log('✅ rustplus.proto found');
} else {
    console.error('❌ rustplus.proto NOT found');
}

if (fs.existsSync(jsPath)) {
    console.log('✅ rustplus.js found');
} else {
    console.error('❌ rustplus.js NOT found');
}

// 2. Check proto content for "optional bool itemIsBlueprint"
try {
    const protoContent = fs.readFileSync(protoPath, 'utf8');
    const sellOrderMatch = protoContent.match(/message SellOrder \{[\s\S]*?\}/);
    if (sellOrderMatch) {
        console.log('SellOrder definition in file:');
        console.log(sellOrderMatch[0]);

        if (sellOrderMatch[0].includes('optional bool itemIsBlueprint')) {
            console.log('✅ itemIsBlueprint is OPTIONAL in file');
        } else {
            console.error('❌ itemIsBlueprint is REQUIRED (or missing optional) in file');
        }
    } else {
        console.error('❌ Could not find SellOrder in proto file');
    }
} catch (e) {
    console.error('Error reading proto file:', e);
}

// 3. Check JS content for try-catch patch
try {
    const jsContent = fs.readFileSync(jsPath, 'utf8');
    if (jsContent.includes('try { message = this.AppMessage.decode(data); }')) {
        console.log('✅ rustplus.js has try-catch patch');
    } else {
        console.error('❌ rustplus.js MISSING try-catch patch');
    }

    if (jsContent.includes('PATCH: Manually fix SellOrder schema')) {
        console.log('✅ rustplus.js has schema patch block');
    } else {
        console.error('❌ rustplus.js MISSING schema patch block');
    }
} catch (e) {
    console.error('Error reading JS file:', e);
}

// 4. Try to load protobuf and check in-memory schema
console.log('Attempting to load protobuf schema...');
protobuf.load(protoPath).then((root) => {
    console.log('Protobuf loaded successfully');

    try {
        // Try to find SellOrder
        // It might be nested or top level
        let SellOrder = null;
        try {
            SellOrder = root.lookupType("rustplus.AppMarker.SellOrder");
            console.log('Found SellOrder at: rustplus.AppMarker.SellOrder');
        } catch (e) {
            try {
                SellOrder = root.lookupType("rustplus.SellOrder");
                console.log('Found SellOrder at: rustplus.SellOrder');
            } catch (e2) {
                console.error('❌ Could not lookup SellOrder type');
            }
        }

        if (SellOrder) {
            const field = SellOrder.fields['itemIsBlueprint'];
            if (field) {
                console.log('itemIsBlueprint field:', {
                    required: field.required,
                    optional: field.optional,
                    type: field.type
                });

                if (field.optional) {
                    console.log('✅ In-memory schema: itemIsBlueprint is OPTIONAL');
                } else {
                    console.error('❌ In-memory schema: itemIsBlueprint is REQUIRED');
                }
            } else {
                console.error('❌ itemIsBlueprint field not found in SellOrder');
            }
        }

    } catch (e) {
        console.error('Error inspecting loaded schema:', e);
    }

}).catch((err) => {
    console.error('Failed to load protobuf:', err);
});
