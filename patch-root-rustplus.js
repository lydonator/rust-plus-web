const fs = require('fs');
const path = require('path');

const rustplusJsPath = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.js');

if (!fs.existsSync(rustplusJsPath)) {
    console.error('rustplus.js not found at', rustplusJsPath);
    process.exit(1);
}

let content = fs.readFileSync(rustplusJsPath, 'utf8');

// We want to inject code right after: protobuf.load(path.resolve(__dirname, "rustplus.proto")).then((root) => {

const targetString = 'protobuf.load(path.resolve(__dirname, "rustplus.proto")).then((root) => {';
const injectionCode = `
            // PATCH: Manually fix SellOrder schema to handle optional fields
            try {
                var SellOrder = root.lookupType("rustplus.AppMarker.SellOrder");
                if (SellOrder) {
                    if(SellOrder.fields["itemIsBlueprint"]) {
                        SellOrder.fields["itemIsBlueprint"].required = false;
                        SellOrder.fields["itemIsBlueprint"].optional = true;
                    }
                    if(SellOrder.fields["currencyIsBlueprint"]) {
                        SellOrder.fields["currencyIsBlueprint"].required = false;
                        SellOrder.fields["currencyIsBlueprint"].optional = true;
                    }
                    console.log("[RustPlus] Successfully patched SellOrder schema in memory (ROOT)");
                }
            } catch(e) { console.error("[RustPlus] Failed to patch protobuf schema:", e); }
`;

if (content.includes('Successfully patched SellOrder schema in memory (ROOT)')) {
    console.log('rustplus.js already patched with schema fix');
} else {
    if (content.includes(targetString)) {
        content = content.replace(targetString, targetString + injectionCode);
        fs.writeFileSync(rustplusJsPath, content, 'utf8');
        console.log('Successfully patched rustplus.js with schema fix');
    } else {
        console.error('Could not find the target code to patch in rustplus.js');
    }
}

// Also add try-catch for extra safety
const originalDecode = 'var message = this.AppMessage.decode(data);';
const newDecode = 'var message; try { message = this.AppMessage.decode(data); } catch(e) { console.error("Protobuf decode error:", e.message); return; }';

if (content.includes(originalDecode)) {
    content = content.replace(originalDecode, newDecode);
    fs.writeFileSync(rustplusJsPath, content, 'utf8');
    console.log('Successfully patched rustplus.js with try-catch block');
}
