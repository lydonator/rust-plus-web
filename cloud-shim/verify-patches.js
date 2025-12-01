#!/usr/bin/env node

/**
 * Verification script to confirm protobuf patches are applied
 * Run this to verify the rustplus.js library is properly patched
 */

const fs = require('fs');
const path = require('path');

console.log('=== Verifying RustPlus.js Patches ===\n');

const protoPath = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.proto');
const rustplusJsPath = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.js');

let allGood = true;

// Check 1: Proto file exists
if (!fs.existsSync(protoPath)) {
    console.error('❌ rustplus.proto not found!');
    console.error('   Run: cd cloud-shim && npm install');
    allGood = false;
} else {
    console.log('✅ rustplus.proto found');

    // Check 2: All fields are optional (no required fields)
    const protoContent = fs.readFileSync(protoPath, 'utf8');
    const requiredCount = (protoContent.match(/required /g) || []).length;

    if (requiredCount === 0) {
        console.log('✅ All protobuf fields are optional (patch-all-optional.js applied)');
    } else {
        console.error(`❌ Found ${requiredCount} required fields - patch not applied!`);
        console.error('   Run: cd cloud-shim && node patch-all-optional.js');
        allGood = false;
    }
}

// Check 3: Try-catch wrapper exists
if (!fs.existsSync(rustplusJsPath)) {
    console.error('❌ rustplus.js not found!');
    allGood = false;
} else {
    console.log('✅ rustplus.js found');

    const rustplusContent = fs.readFileSync(rustplusJsPath, 'utf8');
    if (rustplusContent.includes('try { message = this.AppMessage.decode(data); }')) {
        console.log('✅ Try-catch error handling applied (patch-crash.js applied)');
    } else {
        console.error('❌ Try-catch wrapper not found - patch not applied!');
        console.error('   Run: cd cloud-shim && node patch-crash.js');
        allGood = false;
    }
}

// Check 4: Postinstall script configured
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (packageJson.scripts && packageJson.scripts.postinstall) {
    console.log('✅ Postinstall script configured');
    console.log(`   Will run: ${packageJson.scripts.postinstall}`);
} else {
    console.error('❌ Postinstall script not configured!');
    console.error('   Add to package.json: "postinstall": "node patch-all-optional.js && node patch-crash.js"');
    allGood = false;
}

console.log('\n=== Verification Complete ===\n');

if (allGood) {
    console.log('🎉 All patches verified! Your rustplus.js library is protected against protobuf errors.');
    process.exit(0);
} else {
    console.log('⚠️  Some patches are missing. Run the suggested commands above.');
    process.exit(1);
}
