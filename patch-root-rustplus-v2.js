const fs = require('fs');
const path = require('path');

const rustplusJsPath = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.js');

if (!fs.existsSync(rustplusJsPath)) {
    console.error('rustplus.js not found at', rustplusJsPath);
    process.exit(1);
}

let content = fs.readFileSync(rustplusJsPath, 'utf8');

// 1. Remove previous patch if it exists
const previousPatchStart = '// PATCH: Manually fix SellOrder schema';
if (content.includes(previousPatchStart)) {
    console.log('Removing previous patch...');
    // This is a bit risky with regex, but let's try to replace the known block
    // Or better, just read the file fresh and apply the new patch if we can identify the insertion point reliably.
    // Since I appended the patch to the target string, I can try to revert that.

    // Actually, it's safer to just replace the whole block if I can find it.
    // But for now, let's just say if it detects the old patch, we will overwrite the file with a clean version if possible?
    // No, I don't have a clean version.

    // Let's just append the NEW patch logic which is more robust, and maybe the old one failing doesn't matter?
    // But duplicate code is bad.

    // Let's try to replace the old patch string with the new one.
    const oldPatchCode = `
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
    // The whitespace might not match exactly due to formatting.
    // I'll just use a regex to remove the old try-catch block if it starts with the comment.
    content = content.replace(/\s*\/\/ PATCH: Manually fix SellOrder schema[\s\S]*?catch\(e\) \{ console\.error\("\[RustPlus\] Failed to patch protobuf schema:", e\); \}/, '');
}

// 2. Inject new robust patch
const targetString = 'protobuf.load(path.resolve(__dirname, "rustplus.proto")).then((root) => {';
const injectionCode = `
            // PATCH V2: Manually fix schema for SellOrder and Member
            try {
                console.error("[RustPlus] Applying in-memory schema patch V2...");
                
                // Fix SellOrder
                var SellOrder = root.lookupType("rustplus.AppMarker.SellOrder");
                if (SellOrder) {
                    ['itemIsBlueprint', 'currencyIsBlueprint'].forEach(field => {
                        if(SellOrder.fields[field]) {
                            SellOrder.fields[field].required = false;
                            SellOrder.fields[field].optional = true;
                            console.error("[RustPlus] Patched SellOrder." + field);
                        } else {
                            console.error("[RustPlus] Field SellOrder." + field + " not found!");
                        }
                    });
                } else {
                    console.error("[RustPlus] Type rustplus.AppMarker.SellOrder not found!");
                }

                // Fix Member (deathTime)
                var Member = root.lookupType("rustplus.AppTeamInfo.Member");
                if (Member) {
                    if(Member.fields["deathTime"]) {
                        Member.fields["deathTime"].required = false;
                        Member.fields["deathTime"].optional = true;
                        console.error("[RustPlus] Patched Member.deathTime");
                    } else {
                        console.error("[RustPlus] Field Member.deathTime not found!");
                    }
                } else {
                    console.error("[RustPlus] Type rustplus.AppTeamInfo.Member not found!");
                }
                
            } catch(e) { console.error("[RustPlus] Failed to patch protobuf schema:", e); }
`;

if (content.includes('PATCH V2: Manually fix schema')) {
    console.log('rustplus.js already has V2 patch');
} else {
    if (content.includes(targetString)) {
        content = content.replace(targetString, targetString + injectionCode);
        fs.writeFileSync(rustplusJsPath, content, 'utf8');
        console.log('Successfully patched rustplus.js with V2 schema fix');
    } else {
        console.error('Could not find the target code to patch in rustplus.js');
    }
}
