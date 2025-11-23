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
content = content.replace(/\s*\/\/ PATCH V4: Manually fix schema[\s\S]*?catch\(e\) \{ console\.error\("\[RustPlus\] Failed to patch protobuf schema:", e\); \}/g, '');

// Inject V5 patch
const targetString = 'protobuf.load(path.resolve(__dirname, "rustplus.proto")).then((root) => {';
const injectionCode = `
            // PATCH V5: NUCLEAR OPTION - Make EVERYTHING Optional
            try {
                // Reduced logging - only log errors
                const forceOptional = (field) => {
                    field.rule = "optional";
                    Object.defineProperty(field, 'required', { get: () => false, configurable: true });
                    Object.defineProperty(field, 'optional', { get: () => true, configurable: true });
                };

                // Helper to walk the type tree
                const processType = (type) => {
                    if (type.fields) {
                        Object.keys(type.fields).forEach(fieldName => {
                            forceOptional(type.fields[fieldName]);
                        });
                        // Verbose logging disabled to reduce console noise
                        // console.error("[RustPlus] Patched all fields in " + type.name);
                    }
                    if (type.nested) {
                        Object.keys(type.nested).forEach(nestedName => {
                            processType(type.nested[nestedName]);
                        });
                    }
                };

                // Find the rustplus namespace and process everything
                // root might be the namespace itself or contain it
                if (root.nested && root.nested.rustplus) {
                    processType(root.nested.rustplus);
                } else {
                    // Fallback: try to lookup known types if namespace traversal fails
                    const types = [
                        "rustplus.AppMarker",
                        "rustplus.AppMarker.SellOrder",
                        "rustplus.AppTeamInfo",
                        "rustplus.AppTeamInfo.Member",
                        "rustplus.AppTeamInfo.Note",
                        "rustplus.AppMapMarkers",
                        "rustplus.AppInfo",
                        "rustplus.AppResponse"
                    ];
                    types.forEach(typeName => {
                        try {
                            const type = root.lookupType(typeName);
                            processType(type);
                        } catch(e) {}
                    });
                }

            } catch(e) { console.error("[RustPlus] Failed to patch protobuf schema:", e); }
`;

if (content.includes('PATCH V5: NUCLEAR OPTION')) {
    console.log('rustplus.js already has V5 patch');
} else {
    if (content.includes(targetString)) {
        content = content.replace(targetString, targetString + injectionCode);
        fs.writeFileSync(rustplusJsPath, content, 'utf8');
        console.log('Successfully patched rustplus.js with V5 schema fix');
    } else {
        console.error('Could not find the target code to patch in rustplus.js');
    }
}
