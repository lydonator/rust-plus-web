const fs = require('fs');
const path = require('path');

const rustplusJsPath = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.js');

if (!fs.existsSync(rustplusJsPath)) {
    console.error('rustplus.js not found at', rustplusJsPath);
    process.exit(1);
}

let content = fs.readFileSync(rustplusJsPath, 'utf8');

// The code to find:
// var message = this.AppMessage.decode(data);

// The replacement code:
// var message; try { message = this.AppMessage.decode(data); } catch(e) { console.error("Protobuf decode error:", e.message); return; }

if (content.includes('try { message = this.AppMessage.decode(data); }')) {
    console.log('rustplus.js already patched with try-catch');
} else {
    const originalCode = 'var message = this.AppMessage.decode(data);';
    const newCode = 'var message; try { message = this.AppMessage.decode(data); } catch(e) { console.error("Protobuf decode error:", e.message); return; }';

    if (content.includes(originalCode)) {
        content = content.replace(originalCode, newCode);
        fs.writeFileSync(rustplusJsPath, content, 'utf8');
        console.log('Successfully patched rustplus.js with try-catch block');
    } else {
        console.error('Could not find the target code to patch in rustplus.js');
        // Try a looser match or regex if exact string fails, but exact should work based on previous cat
    }
}
