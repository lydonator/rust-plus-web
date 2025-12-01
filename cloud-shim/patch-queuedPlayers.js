#!/usr/bin/env node

/**
 * Patch rustplus.js protobuf to make queuedPlayers optional
 *
 * Rust game servers sometimes don't send the queuedPlayers field,
 * causing ProtocolError: missing required 'queuedPlayers'
 *
 * This script patches the installed rustplus.js library to make
 * queuedPlayers optional instead of required.
 */

const fs = require('fs');
const path = require('path');

const protoPath = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.proto');

console.log('[Patch] Patching rustplus.proto to make queuedPlayers optional...');
console.log(`[Patch] Target: ${protoPath}`);

if (!fs.existsSync(protoPath)) {
    console.error('[Patch] ❌ rustplus.proto not found in node_modules!');
    console.error('[Patch] Run: cd cloud-shim && npm install');
    process.exit(1);
}

// Read the proto file
let protoContent = fs.readFileSync(protoPath, 'utf8');

// Check if already patched
if (protoContent.includes('optional uint32 queuedPlayers')) {
    console.log('[Patch] ✅ Already patched - queuedPlayers is optional');
    process.exit(0);
}

// Apply the patch
const originalLine = 'required uint32 queuedPlayers = 9;';
const patchedLine = 'optional uint32 queuedPlayers = 9;';

if (!protoContent.includes(originalLine)) {
    console.error('[Patch] ❌ Could not find expected line to patch');
    console.error('[Patch] The rustplus.js library may have been updated');
    console.error('[Patch] Expected line:', originalLine);
    process.exit(1);
}

protoContent = protoContent.replace(originalLine, patchedLine);

// Write the patched file
fs.writeFileSync(protoPath, protoContent, 'utf8');

console.log('[Patch] ✅ Successfully patched rustplus.proto');
console.log('[Patch] Changed: required uint32 queuedPlayers -> optional uint32 queuedPlayers');
console.log('[Patch] Restart cloud-shim to apply changes');
