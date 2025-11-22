const fs = require('fs');
const https = require('https');
const path = require('path');

const URL = 'https://raw.githubusercontent.com/SzyMig/Rust-item-list-JSON/main/Rust-Items-Staging.json';
const OUTPUT_FILE = path.join(__dirname, 'lib', 'rust-items.json');

console.log(`Downloading items from ${URL}...`);

https.get(URL, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const items = JSON.parse(data);
            console.log(`Downloaded ${items.length} items.`);

            const transformed = {};
            items.forEach(item => {
                // Construct icon URL using RustLabs convention
                const iconUrl = `https://rustlabs.com/img/items180/${item.shortname}.png`;

                transformed[item.itemid] = {
                    name: item.Name,
                    shortname: item.shortname,
                    iconUrl: iconUrl
                };
            });

            // Add any custom overrides if needed (none for now as this list seems comprehensive)

            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(transformed, null, 4));
            console.log(`Successfully wrote ${Object.keys(transformed).length} items to ${OUTPUT_FILE}`);

        } catch (err) {
            console.error('Error parsing or writing JSON:', err);
        }
    });

}).on('error', (err) => {
    console.error('Error downloading file:', err);
});
