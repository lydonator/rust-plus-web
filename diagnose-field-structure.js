const fs = require('fs');
const path = require('path');
const protobuf = require('protobufjs');

const rustplusDir = path.join(__dirname, 'node_modules', '@liamcottle', 'rustplus.js');
const protoPath = path.join(rustplusDir, 'rustplus.proto');

console.log('Attempting to load protobuf schema...');
protobuf.load(protoPath).then((root) => {
    console.log('Protobuf loaded successfully');

    try {
        const SellOrder = root.lookupType("rustplus.AppMarker.SellOrder");
        if (SellOrder) {
            const field = SellOrder.fields['itemIsBlueprint'];
            if (field) {
                console.log('Field keys:', Object.keys(field));
                console.log('Field rule:', field.rule);
                console.log('Field required (getter):', field.required);
                console.log('Field optional (getter):', field.optional);

                // Try to set rule and force properties
                try {
                    field.rule = "optional";
                    console.log('✅ Set field.rule = "optional"');

                    Object.defineProperty(field, 'required', {
                        get: function () { return false; },
                        configurable: true
                    });
                    console.log('✅ Defined field.required = false');

                    Object.defineProperty(field, 'optional', {
                        get: function () { return true; },
                        configurable: true
                    });
                    console.log('✅ Defined field.optional = true');

                } catch (e) {
                    console.error('❌ Failed to patch field:', e.message);
                }

                // Check if it stuck
                console.log('Field rule after set:', field.rule);
                console.log('Field required after set:', field.required);
                console.log('Field optional after set:', field.optional);
            }
        }
    } catch (e) {
        console.error('Error inspecting loaded schema:', e);
    }

}).catch((err) => {
    console.error('Failed to load protobuf:', err);
});
