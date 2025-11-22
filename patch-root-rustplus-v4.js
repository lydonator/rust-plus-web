const fs = require('fs');
const path = require('path');

const rustplusJsPath = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.js');

if (!fs.existsSync(rustplusJsPath)) {
    console.error('rustplus.js not found at', rustplusJsPath);
    process.exit(1);
}

let content = fs.readFileSync(rustplusJsPath, 'utf8');

// Remove previous patches
content = content.replace(/\s*\/\/ PATCH: Manually fix SellOrder schema[\s\S]*?catch\(e\) \{ console\.error\("\[RustPlus\] Failed to patch protobuf schema:", e\); \}/g, '');
content = content.replace(/\s*\/\/ PATCH V2: Manually fix schema[\s\S]*?catch\(e\) \{ console\.error\("\[RustPlus\] Failed to patch protobuf schema:", e\); \}/g, '');
content = content.replace(/\s*\/\/ PATCH V3: Manually fix schema[\s\S]*?catch\(e\) \{ console\.error\("\[RustPlus\] Failed to patch protobuf schema:", e\); \}/g, '');

// Inject V4 patch
const targetString = 'protobuf.load(path.resolve(__dirname, "rustplus.proto")).then((root) => {';
const injectionCode = `
            // PATCH V4: Manually fix schema using Object.defineProperty
            try {
                console.error("[RustPlus] Applying in-memory schema patch V4...");
                
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

                // Fix Note (type)
                var Note = root.lookupType("rustplus.AppTeamInfo.Note");
                if (Note) {
                    if(Note.fields["type"]) {
                        forceOptional(Note.fields["type"]);
                        console.error("[RustPlus] Patched Note.type");
                    } else {
                        console.error("[RustPlus] Field Note.type not found!");
                    }
                } else {
                    console.error("[RustPlus] Type rustplus.AppTeamInfo.Note not found!");
                }
                
            } catch(e) { console.error("[RustPlus] Failed to patch protobuf schema:", e); }
`;

if (content.includes('PATCH V4: Manually fix schema')) {
    console.log('rustplus.js already has V4 patch');
} else {
    if (content.includes(targetString)) {
        content = content.replace(targetString, targetString + injectionCode);
        fs.writeFileSync(rustplusJsPath, content, 'utf8');
        console.log('Successfully patched rustplus.js with V4 schema fix');
    } else {
        console.error('Could not find the target code to patch in rustplus.js');
    }
}
