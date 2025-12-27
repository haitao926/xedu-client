const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.on('ready', async () => {
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            offscreen: true,
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const svgPath = path.resolve(__dirname, '../resources/logo-source.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    
    // Create a data URI
    const base64Svg = Buffer.from(svgContent).toString('base64');
    const dataUri = `data:image/svg+xml;base64,${base64Svg}`;

    await win.loadURL(`data:text/html,
        <html>
        <body style="margin:0; overflow:hidden;">
            <img id="img" src="${dataUri}" width="256" height="256" />
        </body>
        </html>
    `);

    // Wait for image to load
    await new Promise(r => setTimeout(r, 1000));

    try {
        const image = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
        const pngBuffer = image.toPNG();
        fs.writeFileSync(path.resolve(__dirname, '../resources/icon-256.png'), pngBuffer);
        console.log('Successfully created resources/icon-256.png');
        app.quit();
    } catch (e) {
        console.error('Failed to capture page:', e);
        app.exit(1);
    }
});
