// Script to download monument icons from RustLabs
const https = require('https');
const fs = require('fs');
const path = require('path');

const monumentIcons = {
    'large_oil_rig': 'https://rustlabs.com/img/monuments/large_oil_rig.png',
    'oil_rig_small': 'https://rustlabs.com/img/monuments/oil_rig_small.png',
    'launchsite': 'https://rustlabs.com/img/monuments/launch_site.png',
    'military_tunnels': 'https://rustlabs.com/img/monuments/military_tunnel.png',
    'airfield': 'https://rustlabs.com/img/monuments/airfield.png',
    'power_plant': 'https://rustlabs.com/img/monuments/power_plant.png',
    'train_yard': 'https://rustlabs.com/img/monuments/train_yard.png',
    'water_treatment': 'https://rustlabs.com/img/monuments/water_treatment.png',
    'dome': 'https://rustlabs.com/img/monuments/dome.png',
    'satellite': 'https://rustlabs.com/img/monuments/satellite.png',
    'junkyard': 'https://rustlabs.com/img/monuments/junkyard.png',
    'harbor': 'https://rustlabs.com/img/monuments/harbor.png',
    'outpost': 'https://rustlabs.com/img/monuments/outpost.png',
    'bandit_camp': 'https://rustlabs.com/img/monuments/bandit_camp.png',
    'excavator': 'https://rustlabs.com/img/monuments/excavator.png',
    'lighthouse': 'https://rustlabs.com/img/monuments/lighthouse.png',
    'mining_outpost': 'https://rustlabs.com/img/monuments/mining_outpost.png',
    'underwater_lab': 'https://rustlabs.com/img/monuments/underwater_lab.png',
    'arctic_base': 'https://rustlabs.com/img/monuments/arctic_base.png',
    'missile_silo': 'https://rustlabs.com/img/monuments/missile_silo.png',
    'train_tunnel': 'https://rustlabs.com/img/monuments/train_tunnel.png',
    'sewer': 'https://rustlabs.com/img/monuments/sewer_branch.png',
    'quarry': 'https://rustlabs.com/img/monuments/quarry.png',
    'fishing_village': 'https://rustlabs.com/img/monuments/fishing_village.png',
    'ferry_terminal': 'https://rustlabs.com/img/monuments/ferry_terminal.png',
    'ranch': 'https://rustlabs.com/img/monuments/ranch.png',
    'abandoned_cabins': 'https://rustlabs.com/img/monuments/abandoned_cabins.png',
    'supermarket': 'https://rustlabs.com/img/monuments/supermarket.png',
    'gas_station': 'https://rustlabs.com/img/monuments/oxums.png',
    'military_base': 'https://rustlabs.com/img/monuments/abandoned_military_base.png',
};

const outputDir = path.join(__dirname, 'public', 'monuments');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function downloadImage(url, filename) {
    return new Promise((resolve, reject) => {
        const filepath = path.join(outputDir, filename);
        const file = fs.createWriteStream(filepath);

        https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log(`✓ Downloaded: ${filename}`);
                    resolve();
                });
            } else {
                file.close();
                fs.unlink(filepath, () => { });
                console.log(`✗ Failed (${response.statusCode}): ${filename}`);
                resolve(); // Don't reject, just continue
            }
        }).on('error', (err) => {
            file.close();
            fs.unlink(filepath, () => { });
            console.log(`✗ Error: ${filename} - ${err.message}`);
            resolve(); // Don't reject, just continue
        });
    });
}

async function downloadAll() {
    console.log('Downloading monument icons from RustLabs...\n');

    const downloads = Object.entries(monumentIcons).map(([name, url]) =>
        downloadImage(url, `${name}.png`)
    );

    await Promise.all(downloads);

    console.log('\nDownload complete!');
}

downloadAll();
