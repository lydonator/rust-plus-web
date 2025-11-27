const fs = require('fs');
const path = require('path');

const rustplusJsPath = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.js');

if (!fs.existsSync(rustplusJsPath)) {
    console.error('rustplus.js not found at', rustplusJsPath);
    process.exit(1);
}

let content = fs.readFileSync(rustplusJsPath, 'utf8');

// Remove previous patches if they exist
content = content.replace(/\s*\/\/ PATCH: Manually fix SellOrder schema[\s\S]*?catch\(e\) \{ console\.error\("\[RustPlus\] Failed to patch protobuf schema:", e\); \}/g, '');
content = content.replace(/\s*\/\/ PATCH V2: Manually fix schema[\s\S]*?catch\(e\) \{ console\.error\("\[RustPlus\] Failed to patch protobuf schema:", e\); \}/g, '');

// Inject V3 patch
const targetString = 'protobuf.load(path.resolve(__dirname, "rustplus.proto")).then((root) => {';
const injectionCode = `
            // PATCH V3: Manually fix schema using Object.defineProperty
            try {
                console.error("[RustPlus] Applying in-memory schema patch V3...");
                
                const forceOptional = (field) => {
                    field.rule = "optional";
                    Object.defineProperty(field, 'required', { get: () => false, configurable: true });
                    Object.defineProperty(field, 'optional', { get: () => true, configurable: true });
                };

                // Fix SellOrder
                var SellOrder = root.lookupType("rustplus.AppMarker.SellOrder");
                if (SellOrder) {
                    ['itemIsBlueprint', 'currencyIsBlueprint'].forEach(fieldName => {
                        if(SellOrder.fields[fieldName]) {
                            forceOptional(SellOrder.fields[fieldName]);
                            console.error("[RustPlus] Patched SellOrder." + fieldName);
                        } else {
                            console.error("[RustPlus] Field SellOrder." + fieldName + " not found!");
                        }
                    });
                } else {
                    console.error("[RustPlus] Type rustplus.AppMarker.SellOrder not found!");
                }

                // Fix Member (deathTime)
                var Member = root.lookupType("rustplus.AppTeamInfo.Member");
                if (Member) {
                    if(Member.fields["deathTime"]) {
                        forceOptional(Member.fields["deathTime"]);
                        console.error("[RustPlus] Patched Member.deathTime");
                    } else {
                        console.error("[RustPlus] Field Member.deathTime not found!");
                    }
                } else {
                    console.error("[RustPlus] Type rustplus.AppTeamInfo.Member not found!");
                }
                
            } catch(e) { console.error("[RustPlus] Failed to patch protobuf schema:", e); }
`;

if (content.includes('PATCH V3: Manually fix schema')) {
    console.log('rustplus.js already has V3 patch');
} else {
    if (content.includes(targetString)) {
        content = content.replace(targetString, targetString + injectionCode);
        fs.writeFileSync(rustplusJsPath, content, 'utf8');
        console.log('Successfully patched rustplus.js with V3 schema fix');
    } else {
        console.error('Could not find the target code to patch in rustplus.js');
    }
}
