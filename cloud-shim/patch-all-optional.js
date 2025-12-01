#!/usr/bin/env node

/**
 * Comprehensive patch for @liamcottle/rustplus.js
 * Makes ALL fields in the protobuf optional instead of required
 *
 * This is necessary because Rust game servers don't consistently send all fields,
 * causing ProtocolError crashes. Making everything optional allows graceful handling.
 */

const fs = require('fs');
const path = require('path');

const protoPath = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.proto');

console.log('[Patch-All-Optional] Making all protobuf fields optional...');
console.log(`[Patch-All-Optional] Target: ${protoPath}`);

if (!fs.existsSync(protoPath)) {
    console.error('[Patch-All-Optional] ❌ rustplus.proto not found in node_modules!');
    console.error('[Patch-All-Optional] Run: cd cloud-shim && npm install');
    process.exit(1);
}

// Read the proto file
let protoContent = fs.readFileSync(protoPath, 'utf8');

// Count how many required fields exist before patching
const requiredCountBefore = (protoContent.match(/required /g) || []).length;
console.log(`[Patch-All-Optional] Found ${requiredCountBefore} required fields`);

// Check if already patched (if there are 0 required fields, we're done)
if (requiredCountBefore === 0) {
    console.log('[Patch-All-Optional] ✅ Already patched - no required fields found');
    process.exit(0);
}

// Replace ALL instances of "required" with "optional"
protoContent = protoContent.replace(/required /g, 'optional ');

// Count how many fields we changed
const requiredCountAfter = (protoContent.match(/required /g) || []).length;
const fieldsChanged = requiredCountBefore - requiredCountAfter;

// Write the patched file
fs.writeFileSync(protoPath, protoContent, 'utf8');

console.log(`[Patch-All-Optional] ✅ Successfully patched ${fieldsChanged} fields`);
console.log('[Patch-All-Optional] All protobuf fields are now optional');
console.log('[Patch-All-Optional] Restart cloud-shim to apply changes');
