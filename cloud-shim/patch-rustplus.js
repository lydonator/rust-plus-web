#!/usr/bin/env node

/**
 * Post-install patch for @liamcottle/rustplus.js
 * Fixes missing itemIsBlueprint and currencyIsBlueprint fields in SellOrder
 * These fields should be OPTIONAL, not required, as the server sends proto3 style messages
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const protoPath = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.proto');

// Check if file exists
if (!fs.existsSync(protoPath)) {
    console.log('[Patch] rustplus.proto not found, skipping patch');
    process.exit(0);
}

// Read the proto file
let protoContent = fs.readFileSync(protoPath, 'utf8');

// Check if already patched (look for the new optional blueprint fields)
if (protoContent.match(/optional bool itemIsBlueprint/)) {
    console.log('[Patch] rustplus.proto already patched');
    process.exit(0);
}

// Apply patch - replace the SellOrder message
// The old version has itemCondition/Max at positions 6/7
const oldPattern = /(\tmessage SellOrder \{[\s\S]*?required int32 amountInStock = 5;)(\s+optional float itemCondition = 6;\s+optional float itemConditionMax = 7;)/;

protoContent = protoContent.replace(oldPattern, `$1
\t\toptional bool itemIsBlueprint = 6;
\t\toptional bool currencyIsBlueprint = 7;
\t\toptional float itemCondition = 8;
\t\toptional float itemConditionMax = 9;`);

// Write back
fs.writeFileSync(protoPath, protoContent, 'utf8');
console.log('[Patch] ✅ Successfully patched rustplus.proto with optional blueprint fields');

try {
    // Delete the rustplus.js runtime compiled protobuf cache
    const rustplusJsPath = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.js');

    // Read the file and check if it has cached protobuf code
    const rustplusJs = fs.readFileSync(rustplusJsPath, 'utf8');

    if (rustplusJs.includes('itemIsBlueprint')) {
        console.log('[Patch] Runtime already has blueprint fields');
    } else {
        console.log('[Patch] Forcing protobuf recompilation...');

        // The library compiles protobuf at runtime, so we need to delete node_modules cache
        const cacheDir = path.join(__dirname, 'node_modules', '.cache');
        if (fs.existsSync(cacheDir)) {
            execSync(`rm -rf "${cacheDir}"`, { stdio: 'inherit' });
            console.log('[Patch] Cleared .cache directory');
        }
    }

    console.log('[Patch] ✅ Patch complete! Restart your application to see changes.');
} catch (error) {
    console.log('[Patch] Note: You may need to restart the application for changes to take effect');
}
